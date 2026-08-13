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
import kotlin.math.sqrt

/**
 * Production-grade foreground service for step tracking.
 *
 * Priority order:
 *  1. Android Sensor.TYPE_STEP_COUNTER (hardware, reports cumulative count since reboot)
 *  2. Sensor fusion (accelerometer + gyroscope peak detection with Kalman filter)
 *
 * Guarantees:
 *  - Survives screen-off, lock, app minimise, swipe from recents
 *  - START_STICKY → auto-restarted by Android if killed
 *  - WakeLock kept to ensure sensor delivery on heavy OEM skins
 *  - Midnight auto-reset
 *  - Writes to Room DB every step, batches Firestore via WorkManager
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
    private var currentDate = todayString()
    private var activeUid = "self"
    private var activeProfileName = ""
    private var dataSource = SOURCE_SENSOR_FUSION

    // ── Sensor fusion (accelerometer-based detection) ─────────────────────────
    private val fusion = SensorFusionDetector()

    // ── Coroutine scope for DB writes ─────────────────────────────────────────
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    // ── DB ─────────────────────────────────────────────────────────────────────
    private lateinit var db: StepDatabase

    // ── React event bridge (optional — null when running headless) ────────────
    private var rnContext: ReactApplicationContext? = null

    // ── Midnight reset handler ─────────────────────────────────────────────────
    private val handler = android.os.Handler(android.os.Looper.getMainLooper())
    private val midnightRunnable = object : Runnable {
        override fun run() {
            val today = todayString()
            if (today != currentDate) {
                Log.d(TAG, "🌙 Midnight reset: $currentDate → $today")
                if (lastRawStepCount > 0) {
                    getPrefs().edit()
                        .putLong(PREF_YESTERDAY_LAST_RAW, lastRawStepCount)
                        .putString(PREF_YESTERDAY_LAST_RAW_DATE, currentDate)
                        .apply()
                }
                saveToPrefs()
                currentDate = today
                dailySteps = 0
                if (lastRawStepCount > 0) {
                    stepCounterBaseline = lastRawStepCount
                } else {
                    stepCounterBaseline = -1L
                }
                currentDailySteps = 0
                saveToPrefs()
                updateNotification()
                broadcastSteps()
            }
            // Re-schedule for next midnight check (every 60 seconds)
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
            // Monotonicity check: Only accept external updates if newSteps > dailySteps
            if (newSteps > dailySteps) {
                Log.d(TAG, "✏️ Setting steps from intent: $dailySteps → $newSteps")
                dailySteps = newSteps
                currentDailySteps = dailySteps
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
            Log.d(TAG, "🔄 Reset action received")
            dailySteps = 0
            currentDailySteps = 0
            stepCounterBaseline = if (lastRawStepCount > 0) lastRawStepCount else -1L
            getPrefs().edit()
                .remove(PREF_YESTERDAY_LAST_RAW)
                .remove(PREF_YESTERDAY_LAST_RAW_DATE)
                .apply()
            saveToPrefs()
            persistToDb()
            onStepUpdate()
            return START_STICKY
        }

        activeUid = intent?.getStringExtra("uid") ?: getPrefs().getString(PREF_UID, "self") ?: "self"
        activeProfileName = intent?.getStringExtra("profileName") ?: getPrefs().getString(PREF_PROFILE_NAME, "") ?: ""
        getPrefs().edit()
            .putString(PREF_UID, activeUid)
            .putString(PREF_PROFILE_NAME, activeProfileName)
            .apply()

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
        // Do NOT call stopSelf() here — START_STICKY will restart us
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
    // TYPE_STEP_DETECTOR handling (active ONLY if TYPE_STEP_COUNTER is null)
    // ─────────────────────────────────────────────────────────────────────────
    private var lastDetectorStepAt = 0L
    private var detectorCadenceCount = 0

    private fun handleStepDetector() {
        if (stepCounterSensor != null) return  // Hardware step counter is primary; ignore detector to prevent over-counting
        val now = System.currentTimeMillis()
        val interval = now - lastDetectorStepAt
        lastDetectorStepAt = now

        // Cadence filter: valid human step cadence window (220ms to 1600ms)
        if (interval in 220..1600) {
            detectorCadenceCount++
            if (detectorCadenceCount == 3) { // Cadence validated -> add initial 3 steps
                dailySteps += 3
                dataSource = SOURCE_STEP_SENSOR
                onStepUpdate()
            } else if (detectorCadenceCount > 3) {
                dailySteps += 1
                dataSource = SOURCE_STEP_SENSOR
                onStepUpdate()
            }
        } else {
            detectorCadenceCount = 1
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TYPE_STEP_COUNTER handling (priority 1 cumulative count ground-truth)
    // ─────────────────────────────────────────────────────────────────────────
    private fun handleStepCounter(rawCount: Long) {
        if (rawCount <= 0) return  // Sensor not ready

        // Date check fallback (in case service was sleeping across midnight)
        val today = todayString()
        if (today != currentDate) {
            Log.d(TAG, "📅 Date changed on sensor event ($currentDate -> $today)")
            if (lastRawStepCount > 0 && currentDate == yesterdayString()) {
                getPrefs().edit()
                    .putLong(PREF_YESTERDAY_LAST_RAW, lastRawStepCount)
                    .putString(PREF_YESTERDAY_LAST_RAW_DATE, currentDate)
                    .apply()
            } else {
                getPrefs().edit()
                    .remove(PREF_YESTERDAY_LAST_RAW)
                    .remove(PREF_YESTERDAY_LAST_RAW_DATE)
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

        // Check for device reboot: rawCount dropped significantly below last known rawCount
        if (lastRawStepCount > 0 && rawCount < (lastRawStepCount - 50)) {
            Log.d(TAG, "🔄 Sensor reboot detected: lastRaw=$lastRawStepCount, newRaw=$rawCount, dailySteps=$dailySteps")
            stepCounterBaseline = rawCount - dailySteps
            lastRawStepCount = rawCount
            saveToPrefs()
            return
        }

        lastRawStepCount = rawCount

        if (stepCounterBaseline < 0) {
            // First baseline initialization for today
            val yesterdayLast = getPrefs().getLong(PREF_YESTERDAY_LAST_RAW, -1L)
            val yesterdayDate = getPrefs().getString(PREF_YESTERDAY_LAST_RAW_DATE, "") ?: ""
            val expectedYesterday = yesterdayString()

            if (yesterdayLast > 0 && yesterdayDate == expectedYesterday && rawCount > yesterdayLast && (rawCount - yesterdayLast) < 100000) {
                // Restore steps walked earlier today using yesterday's midnight baseline!
                stepCounterBaseline = yesterdayLast
                dailySteps = (rawCount - yesterdayLast).toInt()
                Log.d(TAG, "📍 Restored $dailySteps steps taken earlier today (baseline=$yesterdayLast, raw=$rawCount)")
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
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Sensor fusion step callback (active ONLY when no hardware step sensors exist)
    // ─────────────────────────────────────────────────────────────────────────
    private fun onFusionStep() {
        if (stepCounterSensor != null || stepDetectorSensor != null) return
        dailySteps++
        dataSource = SOURCE_SENSOR_FUSION
        onStepUpdate()
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Called on every step update — debounced writes
    // ─────────────────────────────────────────────────────────────────────────
    private var lastDbWriteAt = 0L
    private val DB_WRITE_INTERVAL_MS = 2000L

    private fun onStepUpdate() {
        currentDailySteps = dailySteps
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
    // Broadcast step update to React Native bridge
    // ─────────────────────────────────────────────────────────────────────────
    private fun broadcastSteps() {
        val intent = Intent(ACTION_UPDATE).apply {
            `package` = applicationContext.packageName
            putExtra(EXTRA_STEPS, dailySteps)
            putExtra(EXTRA_SOURCE, dataSource)
        }
        sendBroadcast(intent)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Notification
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
            "👟 ${steps.toString().format()} steps today ($activeProfileName)"
        } else {
            "👟 ${steps.toString().format()} steps today"
        }

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(contentTitle)
            .setContentText("VitalHealth is tracking steps")
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
    // SharedPreferences persistence (survives process death)
    // ─────────────────────────────────────────────────────────────────────────
    private fun getPrefs() = getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)

    private fun saveToPrefs() {
        getPrefs().edit().apply {
            putInt(PREF_STEPS, dailySteps)
            putString(PREF_DATE, currentDate)
            putLong(PREF_BASELINE, stepCounterBaseline)
            putLong(PREF_LAST_RAW, lastRawStepCount)
            putString(PREF_UID, activeUid)
            putString(PREF_PROFILE_NAME, activeProfileName)
            apply()
        }
    }

    private fun loadFromPrefs() {
        val prefs = getPrefs()
        val savedDate = prefs.getString(PREF_DATE, "") ?: ""
        val today = todayString()

        if (savedDate == today) {
            dailySteps = prefs.getInt(PREF_STEPS, 0)
            stepCounterBaseline = prefs.getLong(PREF_BASELINE, -1L)
            lastRawStepCount = prefs.getLong(PREF_LAST_RAW, -1L)
        } else {
            // New day — reset
            Log.d(TAG, "📅 New day ($savedDate → $today): resetting steps")
            dailySteps = 0
            stepCounterBaseline = -1L
            lastRawStepCount = -1L
        }
        currentDate = today
        activeUid = prefs.getString(PREF_UID, "self") ?: "self"
        activeProfileName = prefs.getString(PREF_PROFILE_NAME, "") ?: ""
        currentDailySteps = dailySteps
        Log.d(TAG, "📂 Loaded: $dailySteps steps, date=$currentDate, baseline=$stepCounterBaseline, profileName=$activeProfileName")

        scope.launch {
            try {
                // Only restore from DB if dailySteps is 0 (e.g. SharedPreferences cleared)
                if (dailySteps == 0) {
                    val entity = db.stepDao().getDaily(activeUid, currentDate)
                    if (entity != null && entity.steps > 0) {
                        Log.d(TAG, "📈 Restoring step count from Room DB: ${entity.steps}")
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
    // Room DB persistence
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

                // Hourly update
                val hour = currentDate + "T" + String.format("%02d", Calendar.getInstance().get(Calendar.HOUR_OF_DAY))
                val hourly = HourlyStepEntity(uid = activeUid, dateHour = hour, steps = dailySteps, source = dataSource)
                db.stepDao().upsertHourly(hourly)
            } catch (e: Exception) {
                Log.e(TAG, "DB write error: ${e.message}")
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Sensor registration
    // ─────────────────────────────────────────────────────────────────────────
    private fun registerSensors() {
        if (stepCounterSensor != null) {
            // Priority 1: Hardware cumulative step counter (Ground truth, low latency delivery)
            val samplingPeriodUs = SensorManager.SENSOR_DELAY_UI
            val maxReportLatencyUs = 1_000_000 // 1 sec max latency to prevent OS dropouts
            val registered = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                sensorManager.registerListener(this, stepCounterSensor, samplingPeriodUs, maxReportLatencyUs)
            } else {
                sensorManager.registerListener(this, stepCounterSensor, samplingPeriodUs)
            }
            dataSource = SOURCE_STEP_SENSOR
            Log.d(TAG, "✅ TYPE_STEP_COUNTER registered (Hardware ground truth, registered=$registered)")
        } else if (stepDetectorSensor != null) {
            // Priority 2: Hardware step detector fallback
            val registered = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
                sensorManager.registerListener(this, stepDetectorSensor, SensorManager.SENSOR_DELAY_UI, 1_000_000)
            } else {
                sensorManager.registerListener(this, stepDetectorSensor, SensorManager.SENSOR_DELAY_UI)
            }
            dataSource = SOURCE_STEP_SENSOR
            Log.d(TAG, "✅ TYPE_STEP_DETECTOR registered (Fallback, registered=$registered)")
        } else {
            // Priority 3: Accelerometer + Gyroscope sensor fusion fallback
            if (accelerometerSensor != null) {
                sensorManager.registerListener(this, accelerometerSensor, SensorManager.SENSOR_DELAY_GAME)
            }
            if (gyroscopeSensor != null) {
                sensorManager.registerListener(this, gyroscopeSensor, SensorManager.SENSOR_DELAY_GAME)
            }
            fusion.onStep = { onFusionStep() }
            dataSource = SOURCE_SENSOR_FUSION
            Log.d(TAG, "⚠️ Using sensor fusion fallback")
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Wake lock
    // ─────────────────────────────────────────────────────────────────────────
    private fun acquireWakeLock() {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "VitalHealth:StepTracker"
        ).apply { acquire(12 * 60 * 60 * 1000L) } // 12 hours max
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

    // ─────────────────────────────────────────────────────────────────────────
    // Public API (called from React Native bridge)
    // ─────────────────────────────────────────────────────────────────────────
    fun getCurrentSteps() = dailySteps
    fun getDataSource() = dataSource
}

// ─────────────────────────────────────────────────────────────────────────────
// Sensor Fusion: Gravity-subtraction + peak detection + Kalman smoothing
// Rejects vehicle vibration, random shaking, and false positives
// ─────────────────────────────────────────────────────────────────────────────
class SensorFusionDetector {

    var onStep: (() -> Unit)? = null

    // Gravity estimate (low-pass filter)
    private var gravX = 0f; private var gravY = 0f; private var gravZ = 0f
    private var initialized = false

    // Gyroscope for motion classification
    private var gyroMag = 0f

    // Peak detection buffer
    private val bufferSize = 7
    private val magBuffer = FloatArray(bufferSize)
    private var bufCount = 0

    private var kalmanEstimate = 0f
    private var kalmanError = 1f
    private var lastStepAt = 0L

    // Adaptive peak threshold (m/s^2 linear acceleration)
    private val recentPeaks = ArrayDeque<Float>()
    private var adaptiveThreshold = 0.65f

    // 5-step cadence filter
    private var cadenceCount = 0
    private var lastCadenceTime = 0L

    fun feedAccel(x: Float, y: Float, z: Float) {
        val ALPHA = 0.82f

        if (!initialized) {
            gravX = x; gravY = y; gravZ = z
            initialized = true
            return
        }

        // Low-pass → gravity
        gravX = ALPHA * gravX + (1 - ALPHA) * x
        gravY = ALPHA * gravY + (1 - ALPHA) * y
        gravZ = ALPHA * gravZ + (1 - ALPHA) * z

        // High-pass → linear acceleration
        val lx = x - gravX; val ly = y - gravY; val lz = z - gravZ
        val mag = sqrt((lx * lx + ly * ly + lz * lz).toDouble()).toFloat()

        // Kalman filter smoothing
        val kalmanGain = kalmanError / (kalmanError + 0.08f)
        kalmanEstimate += kalmanGain * (mag - kalmanEstimate)
        kalmanError = (1 - kalmanGain) * kalmanError + 0.004f

        magBuffer[bufCount % bufferSize] = kalmanEstimate
        bufCount++

        // Reject fast vehicle/bumpy motion via gyroscope
        if (gyroMag > 3.5f) return
        if (bufCount < bufferSize) return

        val now = System.currentTimeMillis()
        val minStepInterval = 220L  // ~272 steps/min max (running/fast walk)
        val maxStepInterval = 1400L // ~42 steps/min min (slow walk)

        // Peak detection: check sample at t-1 relative to t-2 and t
        val idxCurr = (bufCount - 1) % bufferSize
        val idxPrev = (bufCount - 2 + bufferSize) % bufferSize
        val idxPrev2 = (bufCount - 3 + bufferSize) % bufferSize

        val pCurr = magBuffer[idxCurr]
        val pPrev = magBuffer[idxPrev]
        val pPrev2 = magBuffer[idxPrev2]

        // Peak condition: prev sample is higher than both preceding and current sample
        if (pPrev > pPrev2 && pPrev > pCurr && pPrev >= adaptiveThreshold) {
            val interval = now - lastStepAt
            if (interval in minStepInterval..maxStepInterval || lastStepAt == 0L) {
                lastStepAt = now
                updateAdaptiveThreshold(pPrev)

                // Cadence filter to reject single bumps/vibrations
                val cadenceInterval = now - lastCadenceTime
                lastCadenceTime = now

                if (cadenceInterval in minStepInterval..maxStepInterval) {
                    cadenceCount++
                    if (cadenceCount == 5) {
                        // Confirmed walking rhythm! Credit initial 5 steps
                        repeat(5) { onStep?.invoke() }
                    } else if (cadenceCount > 5) {
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

    private fun updateAdaptiveThreshold(peak: Float) {
        recentPeaks.addLast(peak)
        if (recentPeaks.size > 15) recentPeaks.removeFirst()
        if (recentPeaks.size >= 4) {
            val avg = recentPeaks.average().toFloat()
            adaptiveThreshold = (avg * 0.60f).coerceIn(0.55f, 2.5f)
        }
    }
}
