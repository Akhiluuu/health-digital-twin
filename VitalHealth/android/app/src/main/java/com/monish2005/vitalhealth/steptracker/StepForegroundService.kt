package com.monish2005.vitalhealth.steptracker

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.facebook.react.bridge.ReactApplicationContext
import com.monish2005.vitalhealth.R
import kotlinx.coroutines.*
import java.text.SimpleDateFormat
import java.util.*
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Production-grade foreground service for active step tracking.
 *
 * Architecture:
 *  - Hybrid Multi-Sensor Fusion Engine running concurrently:
 *    1. Hardware Sensor.TYPE_STEP_COUNTER (Ground truth for cumulative step total)
 *    2. Real-time Biomechanical Acceleration Peak Detection (Instant physical step count)
 *
 * Guarantees:
 *  - Real-time continuous UI updates during physical motion (walking, running, indoor movement)
 *  - Survives screen-off, background execution, app swipe-kill (START_STICKY)
 *  - Midnight auto-reset & date-validated baseline management
 *  - Persistent Room DB and SharedPreferences storage
 */
class StepForegroundService : Service(), SensorEventListener {

    companion object {
        const val TAG = "StepForegroundService"
        const val CHANNEL_ID = "step_tracking_channel"
        const val NOTIF_ID = 7001
        const val ACTION_STOP = "com.monish2005.vitalhealth.STEP_STOP"
        const val ACTION_UPDATE = "com.monish2005.vitalhealth.STEP_UPDATE"
        const val ACTION_SET_STEPS = "com.monish2005.vitalhealth.STEP_SET"
        const val ACTION_RESET = "com.monish2005.vitalhealth.STEP_RESET"
        const val EXTRA_STEPS = "steps"
        const val EXTRA_SOURCE = "source"
        const val PREF_NAME = "step_service_prefs"
        const val PREF_STEPS = "daily_steps"
        const val PREF_DATE = "step_date"
        const val PREF_BASELINE = "step_counter_baseline"
        const val PREF_LAST_RAW = "step_last_raw"
        const val PREF_YESTERDAY_LAST_RAW = "step_yesterday_last_raw"
        const val PREF_YESTERDAY_LAST_RAW_DATE = "step_yesterday_last_raw_date"
        const val PREF_UID = "step_uid"
        const val PREF_PROFILE_NAME = "step_profile_name"
        const val SOURCE_STEP_SENSOR = "STEP_SENSOR"
        const val SOURCE_SENSOR_FUSION = "SENSOR_FUSION"
        @Volatile var currentDailySteps: Int = 0
        private val liveStepsMap = java.util.concurrent.ConcurrentHashMap<String, Int>()

        fun getLiveSteps(uid: String): Int = liveStepsMap[uid] ?: 0
    }

    // ── Sensor infrastructure ─────────────────────────────────────────────────
    private lateinit var sensorManager: SensorManager
    private var stepCounterSensor: Sensor? = null
    private var stepDetectorSensor: Sensor? = null
    private var accelerometerSensor: Sensor? = null
    private var gyroscopeSensor: Sensor? = null
    private var wakeLock: PowerManager.WakeLock? = null

    // ── State ──────────────────────────────────────────────────────────────────
    private var dailySteps = 0
    private var stepCounterBaseline = -1L   // Raw hardware counter value at session start
    private var lastRawStepCount = -1L      // Last raw hardware counter value received
    private var lastHardwareStepTime = 0L   // Timestamp of last hardware step event
    private var currentDate = todayString()
    private var activeUid = "self"
    private var activeProfileName = ""
    private var dataSource = SOURCE_SENSOR_FUSION

    private fun getPrefKey(baseKey: String, uid: String = activeUid): String = "${baseKey}_${uid}"

    // ── Biomechanical Sensor Fusion Detector ──────────────────────────────────
    private val fusion = SensorFusionDetector()

    // ── Coroutine scope for DB writes ─────────────────────────────────────────
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    // ── DB ─────────────────────────────────────────────────────────────────────
    private lateinit var db: StepDatabase

    // ── Midnight reset handler ─────────────────────────────────────────────────
    private val handler = android.os.Handler(android.os.Looper.getMainLooper())
    private val midnightRunnable = object : Runnable {
        override fun run() {
            val today = todayString()
            if (today != currentDate) {
                Log.d(TAG, "🌙 Midnight reset for $activeUid: $currentDate → $today")
                if (lastRawStepCount > 0) {
                    getPrefs().edit()
                        .putLong(getPrefKey(PREF_YESTERDAY_LAST_RAW), lastRawStepCount)
                        .putString(getPrefKey(PREF_YESTERDAY_LAST_RAW_DATE), currentDate)
                        .apply()
                }
                saveToPrefs()
                currentDate = today
                dailySteps = 0
                stepCounterBaseline = if (lastRawStepCount > 0) lastRawStepCount else -1L
                currentDailySteps = 0
                liveStepsMap[activeUid] = 0
                saveToPrefs()
                updateNotification()
                broadcastSteps()
            }
            handler.postDelayed(this, 60_000L)
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "🏃 StepForegroundService.onCreate")

        db = StepDatabase.getInstance(this)
        sensorManager = getSystemService(SENSOR_SERVICE) as SensorManager

        createNotificationChannel()
        acquireWakeLock()
        loadFromPrefs()

        stepCounterSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
        stepDetectorSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR)
        accelerometerSensor = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        gyroscopeSensor = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE)

        registerSensors()
        handler.post(midnightRunnable)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "⚡ onStartCommand action=${intent?.action}")

        if (intent?.action == ACTION_STOP) {
            Log.d(TAG, "⏹ Stop action received")
            stopSelf()
            return START_NOT_STICKY
        }

        if (intent?.action == ACTION_SET_STEPS) {
            val newSteps = intent.getIntExtra("steps", -1)
            if (newSteps > dailySteps) {
                Log.d(TAG, "✏️ Setting steps from intent: $dailySteps → $newSteps")
                dailySteps = newSteps
                currentDailySteps = dailySteps
                liveStepsMap[activeUid] = dailySteps
                if (lastRawStepCount > 0) {
                    stepCounterBaseline = (lastRawStepCount - dailySteps).coerceAtLeast(0L)
                } else {
                    stepCounterBaseline = -1L
                }
                saveToPrefs()
                onStepUpdate()
            }
            return START_STICKY
        }

        if (intent?.action == ACTION_RESET) {
            Log.d(TAG, "🔄 Reset action received for $activeUid")
            dailySteps = 0
            currentDailySteps = 0
            liveStepsMap[activeUid] = 0
            stepCounterBaseline = if (lastRawStepCount > 0) lastRawStepCount else -1L
            getPrefs().edit()
                .remove(getPrefKey(PREF_YESTERDAY_LAST_RAW))
                .remove(getPrefKey(PREF_YESTERDAY_LAST_RAW_DATE))
                .apply()
            saveToPrefs()
            persistToDb()
            onStepUpdate()
            return START_STICKY
        }

        val newUid = intent?.getStringExtra("uid") ?: getPrefs().getString(PREF_UID, "self") ?: "self"
        val newProfileName = intent?.getStringExtra("profileName") ?: getPrefs().getString(PREF_PROFILE_NAME, "") ?: ""

        if (newUid != activeUid) {
            saveToPrefs()
            activeUid = newUid
            activeProfileName = newProfileName
            getPrefs().edit()
                .putString(PREF_UID, activeUid)
                .putString(PREF_PROFILE_NAME, activeProfileName)
                .apply()
            loadFromPrefs()
        } else {
            activeProfileName = newProfileName
            getPrefs().edit()
                .putString(PREF_PROFILE_NAME, activeProfileName)
                .apply()
        }

        try {
            val notification = buildNotification(dailySteps)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH)
            } else {
                startForeground(NOTIF_ID, notification)
            }
        } catch (e: Exception) {
            Log.e(TAG, "⚠️ Unable to start foreground service: ${e.message}")
        }

        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        Log.d(TAG, "💀 onDestroy — saving state")
        handler.removeCallbacks(midnightRunnable)
        sensorManager.unregisterListener(this)
        saveToPrefs()
        scope.cancel()
        wakeLock?.let { if (it.isHeld) it.release() }
        super.onDestroy()
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        Log.d(TAG, "📌 onTaskRemoved — keeping service alive")
        saveToPrefs()
    }

    // ── Sensor callbacks ─────────────────────────────────────────────────────
    override fun onSensorChanged(event: SensorEvent) {
        when (event.sensor.type) {
            Sensor.TYPE_STEP_COUNTER -> handleStepCounter(event.values[0].toLong())
            Sensor.TYPE_STEP_DETECTOR -> handleStepDetector()
            Sensor.TYPE_ACCELEROMETER -> fusion.feedAccel(event.values[0], event.values[1], event.values[2])
            Sensor.TYPE_GYROSCOPE -> fusion.feedGyro(event.values[0], event.values[1], event.values[2])
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    // ─────────────────────────────────────────────────────────────────────────
    // TYPE_STEP_DETECTOR handling
    // ─────────────────────────────────────────────────────────────────────────
    private var lastDetectorStepAt = 0L
    private var detectorCadenceCount = 0

    private fun handleStepDetector() {
        val now = System.currentTimeMillis()
        val interval = now - lastDetectorStepAt
        lastDetectorStepAt = now

        if (interval in 200..1800) {
            detectorCadenceCount++
            if (detectorCadenceCount == 2) {
                dailySteps += 2
                if (lastRawStepCount > 0) {
                    stepCounterBaseline = (lastRawStepCount - dailySteps).coerceAtLeast(0L)
                }
                dataSource = SOURCE_STEP_SENSOR
                onStepUpdate()
            } else if (detectorCadenceCount > 2) {
                dailySteps += 1
                if (lastRawStepCount > 0) {
                    stepCounterBaseline = (lastRawStepCount - dailySteps).coerceAtLeast(0L)
                }
                dataSource = SOURCE_STEP_SENSOR
                onStepUpdate()
            }
        } else {
            detectorCadenceCount = 1
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TYPE_STEP_COUNTER handling (Hardware Ground Truth)
    // ─────────────────────────────────────────────────────────────────────────
    private fun handleStepCounter(rawCount: Long) {
        if (rawCount <= 0) return
        lastHardwareStepTime = System.currentTimeMillis()

        val today = todayString()
        if (today != currentDate) {
            Log.d(TAG, "📅 Date changed on sensor event ($currentDate -> $today)")
            if (lastRawStepCount > 0 && currentDate == yesterdayString()) {
                getPrefs().edit()
                    .putLong(PREF_YESTERDAY_LAST_RAW, lastRawStepCount)
                    .putString(PREF_YESTERDAY_LAST_RAW_DATE, currentDate)
                    .apply()
            }
            saveToPrefs()
            currentDate = today
            dailySteps = 0
            stepCounterBaseline = rawCount
            lastRawStepCount = rawCount
            currentDailySteps = 0
            saveToPrefs()
            onStepUpdate()
            return
        }

        // Reboot check
        if (lastRawStepCount > 0 && rawCount < (lastRawStepCount - 50)) {
            Log.d(TAG, "🔄 Sensor reboot detected: lastRaw=$lastRawStepCount, newRaw=$rawCount, dailySteps=$dailySteps")
            stepCounterBaseline = (rawCount - dailySteps).coerceAtLeast(0L)
            lastRawStepCount = rawCount
            saveToPrefs()
            return
        }

        lastRawStepCount = rawCount

        if (stepCounterBaseline < 0) {
            val yesterdayLast = getPrefs().getLong(PREF_YESTERDAY_LAST_RAW, -1L)
            val yesterdayDate = getPrefs().getString(PREF_YESTERDAY_LAST_RAW_DATE, "") ?: ""
            val expectedYesterday = yesterdayString()

            if (yesterdayLast > 0 && yesterdayDate == expectedYesterday && rawCount > yesterdayLast && (rawCount - yesterdayLast) < 100000) {
                stepCounterBaseline = yesterdayLast
                dailySteps = (rawCount - yesterdayLast).toInt()
                Log.d(TAG, "📍 Restored $dailySteps steps from yesterday baseline")
            } else if (dailySteps > 0) {
                stepCounterBaseline = (rawCount - dailySteps).coerceAtLeast(0L)
            } else {
                stepCounterBaseline = rawCount
            }
            saveToPrefs()
        }

        val delta = rawCount - stepCounterBaseline
        if (delta < 0) {
            stepCounterBaseline = (rawCount - dailySteps).coerceAtLeast(0L)
            saveToPrefs()
            return
        }

        val newSteps = delta.toInt().coerceAtMost(999999)
        if (newSteps > dailySteps) {
            dailySteps = newSteps
            dataSource = SOURCE_STEP_SENSOR
            onStepUpdate()
        } else if (newSteps < dailySteps) {
            // Fusion step detector walked further than hardware counter reported yet.
            // Sync baseline to maintain step count monotonicity.
            stepCounterBaseline = (rawCount - dailySteps).coerceAtLeast(0L)
            saveToPrefs()
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Biomechanical Accelerometer Sensor Fusion Step Callback
    // ─────────────────────────────────────────────────────────────────────────
    private fun onFusionStep() {
        val now = System.currentTimeMillis()
        // If hardware counter has updated within last 1500ms, let hardware counter handle it to prevent double counting
        if (stepCounterSensor != null && (now - lastHardwareStepTime) < 1500L) {
            return
        }
        dailySteps++
        if (lastRawStepCount > 0) {
            stepCounterBaseline = (lastRawStepCount - dailySteps).coerceAtLeast(0L)
        }
        dataSource = SOURCE_SENSOR_FUSION
        onStepUpdate()
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Debounced step update handler
    // ─────────────────────────────────────────────────────────────────────────
    private var lastDbWriteAt = 0L
    private val DB_WRITE_INTERVAL_MS = 2000L

    private fun onStepUpdate() {
        currentDailySteps = dailySteps
        liveStepsMap[activeUid] = dailySteps
        saveToPrefs()
        broadcastSteps()
        updateNotification()

        val now = System.currentTimeMillis()
        if (now - lastDbWriteAt >= DB_WRITE_INTERVAL_MS) {
            lastDbWriteAt = now
            persistToDb()
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Broadcast to React Native Bridge
    // ─────────────────────────────────────────────────────────────────────────
    private fun broadcastSteps() {
        val intent = Intent(ACTION_UPDATE).apply {
            `package` = applicationContext.packageName
            putExtra(EXTRA_STEPS, dailySteps)
            putExtra(EXTRA_SOURCE, dataSource)
            putExtra("uid", activeUid)
        }
        sendBroadcast(intent)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Notification Channel & Updates
    // ─────────────────────────────────────────────────────────────────────────
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Step Tracking",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Background step tracking"
                setShowBadge(false)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun buildNotification(steps: Int): Notification {
        val stopIntent = PendingIntent.getService(
            this, 0,
            Intent(this, StepForegroundService::class.java).apply { action = ACTION_STOP },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val openIntent = packageManager.getLaunchIntentForPackage(packageName)?.let {
            PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }

        val contentTitle = if (activeProfileName.isNotEmpty()) {
            "👟 ${steps} steps today ($activeProfileName)"
        } else {
            "👟 ${steps} steps today"
        }

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(contentTitle)
            .setContentText("VitalHealth active step telemetry running")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setSilent(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(openIntent)
            .addAction(0, "⏹ Stop", stopIntent)
            .build()
    }

    private fun updateNotification() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.notify(NOTIF_ID, buildNotification(dailySteps))
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SharedPreferences
    // ─────────────────────────────────────────────────────────────────────────
    private fun getPrefs() = getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)

    private fun saveToPrefs() {
        getPrefs().edit().apply {
            putInt(getPrefKey(PREF_STEPS), dailySteps)
            putString(getPrefKey(PREF_DATE), currentDate)
            putLong(getPrefKey(PREF_BASELINE), stepCounterBaseline)
            putLong(getPrefKey(PREF_LAST_RAW), lastRawStepCount)
            putString(PREF_UID, activeUid)
            putString(PREF_PROFILE_NAME, activeProfileName)

            if (activeUid == "self") {
                putInt(PREF_STEPS, dailySteps)
                putString(PREF_DATE, currentDate)
                putLong(PREF_BASELINE, stepCounterBaseline)
                putLong(PREF_LAST_RAW, lastRawStepCount)
            }
            apply()
        }
    }

    private fun loadFromPrefs() {
        val prefs = getPrefs()
        val today = todayString()

        var savedDate = prefs.getString(getPrefKey(PREF_DATE), "") ?: ""
        if (savedDate.isEmpty() && activeUid == "self") {
            savedDate = prefs.getString(PREF_DATE, "") ?: ""
        }

        if (savedDate == today) {
            dailySteps = if (prefs.contains(getPrefKey(PREF_STEPS))) {
                prefs.getInt(getPrefKey(PREF_STEPS), 0)
            } else if (activeUid == "self") {
                prefs.getInt(PREF_STEPS, 0)
            } else 0

            stepCounterBaseline = if (prefs.contains(getPrefKey(PREF_BASELINE))) {
                prefs.getLong(getPrefKey(PREF_BASELINE), -1L)
            } else if (activeUid == "self") {
                prefs.getLong(PREF_BASELINE, -1L)
            } else -1L

            lastRawStepCount = if (prefs.contains(getPrefKey(PREF_LAST_RAW))) {
                prefs.getLong(getPrefKey(PREF_LAST_RAW), -1L)
            } else if (activeUid == "self") {
                prefs.getLong(PREF_LAST_RAW, -1L)
            } else -1L
        } else {
            Log.d(TAG, "📅 New day ($savedDate → $today) for $activeUid: resetting steps")
            dailySteps = 0
            stepCounterBaseline = -1L
            lastRawStepCount = -1L
        }
        currentDate = today
        currentDailySteps = dailySteps
        liveStepsMap[activeUid] = dailySteps

        scope.launch {
            try {
                if (dailySteps == 0) {
                    val entity = db.stepDao().getDaily(activeUid, currentDate)
                    if (entity != null && entity.steps > 0) {
                        dailySteps = entity.steps
                        if (lastRawStepCount > 0) {
                            stepCounterBaseline = (lastRawStepCount - dailySteps).coerceAtLeast(0L)
                        } else {
                            stepCounterBaseline = -1L
                        }
                        saveToPrefs()
                        withContext(Dispatchers.Main) {
                            onStepUpdate()
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "DB read error in loadFromPrefs: ${e.message}")
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Room DB
    // ─────────────────────────────────────────────────────────────────────────
    private fun persistToDb() {
        scope.launch {
            try {
                val entity = DailyStepEntity(
                    uid = activeUid,
                    date = currentDate,
                    steps = dailySteps,
                    source = dataSource
                )
                db.stepDao().upsertDaily(entity)

                val hour = currentDate + "T" + String.format("%02d", Calendar.getInstance().get(Calendar.HOUR_OF_DAY))
                val hourly = HourlyStepEntity(uid = activeUid, dateHour = hour, steps = dailySteps, source = dataSource)
                db.stepDao().upsertHourly(hourly)
            } catch (e: Exception) {
                Log.e(TAG, "DB write error: ${e.message}")
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Hybrid Sensor Registration
    // ─────────────────────────────────────────────────────────────────────────
    private fun registerSensors() {
        if (stepCounterSensor != null) {
            val samplingPeriodUs = SensorManager.SENSOR_DELAY_UI
            val maxReportLatencyUs = 500_000
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                sensorManager.registerListener(this, stepCounterSensor, samplingPeriodUs, maxReportLatencyUs)
            } else {
                sensorManager.registerListener(this, stepCounterSensor, samplingPeriodUs)
            }
            Log.d(TAG, "✅ TYPE_STEP_COUNTER registered (Hardware Ground Truth)")
        }

        if (stepDetectorSensor != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                sensorManager.registerListener(this, stepDetectorSensor, SensorManager.SENSOR_DELAY_UI, 500_000)
            } else {
                sensorManager.registerListener(this, stepDetectorSensor, SensorManager.SENSOR_DELAY_UI)
            }
            Log.d(TAG, "✅ TYPE_STEP_DETECTOR registered")
        }

        // Always register Accelerometer for real-time biomechanical sensor fusion!
        if (accelerometerSensor != null) {
            sensorManager.registerListener(this, accelerometerSensor, SensorManager.SENSOR_DELAY_GAME)
            Log.d(TAG, "✅ TYPE_ACCELEROMETER registered (Biomechanical Peak Engine Active)")
        }

        if (gyroscopeSensor != null) {
            sensorManager.registerListener(this, gyroscopeSensor, SensorManager.SENSOR_DELAY_GAME)
        }

        fusion.onStep = { onFusionStep() }
        dataSource = if (stepCounterSensor != null) SOURCE_STEP_SENSOR else SOURCE_SENSOR_FUSION
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Wake lock
    // ─────────────────────────────────────────────────────────────────────────
    private fun acquireWakeLock() {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "VitalHealth:StepTracker"
        ).apply { acquire(12 * 60 * 60 * 1000L) }
    }

    // ─────────────────────────────────────────────────────────────────────────
    private fun todayString(): String {
        return SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
    }

    private fun yesterdayString(): String {
        val cal = Calendar.getInstance()
        cal.add(Calendar.DAY_OF_YEAR, -1)
        return SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(cal.time)
    }

    fun getCurrentSteps() = dailySteps
    fun getDataSource() = dataSource
}

// ─────────────────────────────────────────────────────────────────────────────
// Industry-Grade Biomechanical Step Detector
// Features:
//   - Fast Exponential Moving Average (EMA) Gravity Subtraction (alpha = 0.90)
//   - 4-Sample Moving Average Noise Filter
//   - Dynamic Hysteresis Peak & Valley Thresholding (dynamic floor 0.18 m/s²)
//   - 2-Step Fast-Lock Cadence Validation (200ms - 1800ms physiological window)
// ─────────────────────────────────────────────────────────────────────────────
class SensorFusionDetector {

    var onStep: (() -> Unit)? = null

    // Gravity Low-Pass Filter
    private var gravX = 0f
    private var gravY = 0f
    private var gravZ = 0f
    private var gravityInitialized = false

    // Gyroscope magnitude (motion rejection)
    private var gyroMag = 0f

    // Signal smoothing buffer (4-sample moving average filter)
    private val filterSize = 4
    private val rawLinearBuffer = FloatArray(filterSize)
    private var sampleCount = 0

    // Dynamic Peak & Valley Buffer (rolling 50-sample window ~ 1-2 seconds)
    private val windowSize = 50
    private val magWindow = FloatArray(windowSize)
    private var windowIndex = 0
    private var windowFilled = false

    // Dynamic Hysteresis State
    private var armed = true
    private var lastPeakValue = 0f
    private var lastStepTime = 0L

    // Cadence Validation (2-step fast-lock)
    private var cadenceCount = 0
    private var lastCadenceTime = 0L

    fun feedAccel(x: Float, y: Float, z: Float) {
        val ALPHA = 0.90f

        if (!gravityInitialized) {
            gravX = x; gravY = y; gravZ = z
            gravityInitialized = true
            return
        }

        // 1. Isolate Gravity vs User Acceleration (EMA Filter)
        gravX = ALPHA * gravX + (1f - ALPHA) * x
        gravY = ALPHA * gravY + (1f - ALPHA) * y
        gravZ = ALPHA * gravZ + (1f - ALPHA) * z

        val lx = x - gravX
        val ly = y - gravY
        val lz = z - gravZ
        val linearMag = sqrt((lx * lx + ly * ly + lz * lz).toDouble()).toFloat()

        // 2. 4-Sample Moving Average Filter to eliminate high-frequency jitter
        rawLinearBuffer[sampleCount % filterSize] = linearMag
        sampleCount++

        if (sampleCount < filterSize) return

        var filteredMag = 0f
        for (i in 0 until filterSize) {
            filteredMag += rawLinearBuffer[i]
        }
        filteredMag /= filterSize.toFloat()

        // 3. Store sample in dynamic window for adaptive threshold calculation
        magWindow[windowIndex] = filteredMag
        windowIndex = (windowIndex + 1) % windowSize
        if (windowIndex == 0) windowFilled = true

        // 4. Reject extreme vehicle vibration using Gyroscope (> 4.5 rad/s)
        if (gyroMag > 4.5f) return

        // 5. Calculate Dynamic Peak Threshold & Arming Threshold from Rolling Window
        val effectiveSize = if (windowFilled) windowSize else windowIndex
        if (effectiveSize < 10) return

        var minVal = magWindow[0]
        var maxVal = magWindow[0]
        for (i in 0 until effectiveSize) {
            if (magWindow[i] < minVal) minVal = magWindow[i]
            if (magWindow[i] > maxVal) maxVal = magWindow[i]
        }

        val range = maxVal - minVal
        // Dynamic peak threshold: 35% above valley, clamped between physiological bounds [0.18 m/s², 3.2 m/s²]
        val dynamicPeakThreshold = max(0.18f, min(3.2f, minVal + 0.35f * range))
        // Dynamic arming threshold: 15% above valley (hysteresis reset)
        val dynamicArmThreshold = max(0.06f, min(1.2f, minVal + 0.15f * range))

        // 6. Dynamic Peak Detection with Hysteresis
        if (filteredMag <= dynamicArmThreshold) {
            armed = true
        }

        val now = System.currentTimeMillis()
        val minStepInterval = 200L   // Max ~300 steps/min (sprint)
        val maxStepInterval = 1800L  // Min ~33 steps/min (slow gait)

        if (armed && filteredMag >= dynamicPeakThreshold) {
            val interval = now - lastStepTime

            if (interval in minStepInterval..maxStepInterval || lastStepTime == 0L) {
                armed = false
                lastStepTime = now
                lastPeakValue = filteredMag

                // Cadence Verification (2-step fast-lock)
                val cadenceInterval = now - lastCadenceTime
                lastCadenceTime = now

                if (cadenceInterval in minStepInterval..maxStepInterval) {
                    cadenceCount++
                    if (cadenceCount == 2) {
                        // Fast lock achieved! Credit both candidate steps immediately
                        onStep?.invoke()
                        onStep?.invoke()
                    } else if (cadenceCount > 2) {
                        onStep?.invoke()
                    }
                } else {
                    cadenceCount = 1
                }
            }
        }
    }

    fun feedGyro(x: Float, y: Float, z: Float) {
        gyroMag = sqrt((x * x + y * y + z * z).toDouble()).toFloat()
    }
}
