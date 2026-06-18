// tasks/stepTrackingTask.ts
// ─────────────────────────────────────────────────────────────────────────────
// Step Tracking — survives recents swipe using @notifee/react-native
// Foreground Service keeps the process alive on Android even after kill.
// ─────────────────────────────────────────────────────────────────────────────

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";

export const STEP_TASK_NAME = "BACKGROUND_STEP_TRACKER";
export const STORAGE_KEY    = "vitalhealth_steps_v2";
export const GOAL_KEY       = "vitalhealth_step_goal";
export const PROFILE_KEY    = "userProfile";
export const AVG_STRIDE_M   = 0.762;

// ── Calorie formula (ACSM walking, personalised by weight) ───────────────────
export function calcCaloriesMET(
  steps: number,
  secs: number,
  weightKg: number
): number {
  if (steps === 0 || secs === 0) return 0;
  const distM    = steps * AVG_STRIDE_M;
  const speedMPM = distM / Math.max(1, secs / 60);
  const MET      = Math.max(2.0, (0.1 * speedMPM + 3.5) / 3.5);
  return Math.round(MET * weightKg * (secs / 3600));
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

async function getWeightKg(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    if (!raw) return 70;
    const p = JSON.parse(raw);
    const n = parseFloat(String(p.weight ?? "").replace(/[^0-9.]/g, ""));
    return isNaN(n) ? 70 : n;
  } catch { return 70; }
}

export async function saveStepState(
  steps: number,
  sessionSecs: number,
  lastMoveTime: number,
  notifSent: boolean
) {
  try {
    const weightKg = await getWeightKg();
    const goalRaw  = await AsyncStorage.getItem(GOAL_KEY);
    const goal     = goalRaw ? JSON.parse(goalRaw) : 10000;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
      steps,
      calories:     calcCaloriesMET(steps, sessionSecs, weightKg),
      distanceKm:   (steps * AVG_STRIDE_M) / 1000,
      sessionSecs,
      goal,
      lastReset:    todayStr(),
      lastMoveTime,
      notifSent,
      updatedAt:    Date.now(),
    }));
  } catch (e) {
    console.log("saveStepState error:", e);
  }
}

// ── Step detection constants ──────────────────────────────────────────────────
const STEP_THRESHOLD    = 0.08;
const MIN_STEP_INTERVAL = 350;
const LP_ALPHA          = 0.85;
const SEDENTARY_MS      = 60 * 60 * 1000;

// ── Shared in-memory state (used by foreground service loop) ─────────────────
let _steps        = 0;
let _sessionSecs  = 0;
let _lastMoveTime = Date.now();
let _lastStepTime = 0;
let _lpFilter     = 0;
let _notifSent    = false;
let _accelSub: any = null;
let _timerInterval: ReturnType<typeof setInterval> | null = null;
let _loaded       = false;

async function loadPersistedState() {
  // ✅ FIX: _loaded is reset on stopAccelerometerTracking() so that if tracking
  // restarts in the same JS process, we correctly reload from AsyncStorage
  // instead of silently starting from 0 (the default in-memory state).
  if (_loaded) return;
  _loaded = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d.lastReset === todayStr()) {
        _steps        = d.steps        ?? 0;
        _sessionSecs  = d.sessionSecs  ?? 0;
        _lastMoveTime = d.lastMoveTime ?? Date.now();
        _notifSent    = d.notifSent    ?? false;
      }
    }
  } catch {}
}

async function sendSedentaryNotif(): Promise<void> {
  if (_notifSent) return;
  _notifSent = true;
  try {
    const notifee = (await import("@notifee/react-native")).default;
    const channelId = await notifee.createChannel({
      id:   "steps",
      name: "Step & Activity Alerts",
    });
    await notifee.displayNotification({
      title: "🚶 Time to Move!",
      body:  "You've been sitting for 1 hour. A short walk keeps you healthy!",
      data:  { type: "sedentary_alert" },
      android: {
        channelId,
        pressAction: { id: "default" },
      },
    });
  } catch (e) {
    console.log("sedentary notif error:", e);
  }
}

export async function startAccelerometerTracking() {
  if (_accelSub) return; // already running
  await loadPersistedState();

  try {
    const { Accelerometer } = require("expo-sensors");
    Accelerometer.setUpdateInterval(16);
    _accelSub = Accelerometer.addListener(
      ({ x, y, z }: { x: number; y: number; z: number }) => {
        const rawMag = Math.sqrt(x * x + y * y + z * z);
        _lpFilter    = LP_ALPHA * _lpFilter + (1 - LP_ALPHA) * rawMag;
        const accel  = Math.abs(rawMag - _lpFilter);
        const now    = Date.now();
        if (accel > STEP_THRESHOLD && now - _lastStepTime > MIN_STEP_INTERVAL) {
          _lastStepTime  = now;
          _lastMoveTime  = now;
          _notifSent     = false;
          _steps        += 1;
        }
      }
    );
  } catch (e) {
    console.log("Accelerometer error:", e);
  }

  _timerInterval = setInterval(async () => {
    _sessionSecs += 1;
    if (Date.now() - _lastMoveTime >= SEDENTARY_MS) {
      await sendSedentaryNotif();
    }
    if (_sessionSecs % 5 === 0) {
      await saveStepState(_steps, _sessionSecs, _lastMoveTime, _notifSent);
    }
  }, 1000);
}

export function stopAccelerometerTracking() {
  try { _accelSub?.remove(); } catch {}
  _accelSub = null;
  if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
  // ✅ FIX: Reset _loaded so the NEXT startAccelerometerTracking() call
  // (within the same JS process, e.g. after foreground service restart)
  // will correctly reload from AsyncStorage rather than skipping it
  // and starting fresh from in-memory defaults (which may be 0).
  _loaded = false;
  saveStepState(_steps, _sessionSecs, _lastMoveTime, _notifSent);
}

export function getInMemorySteps()       { return _steps; }
export function getInMemorySessionSecs() { return _sessionSecs; }

// ── expo-background-fetch task (fallback — keeps task registered) ─────────────
// ⚠️ defineTask MUST be at top level (expo-task-manager requirement)
TaskManager.defineTask(STEP_TASK_NAME, async () => {
  try {
    await loadPersistedState();
    await startAccelerometerTracking();
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundStepTask(): Promise<void> {
  try {
    const isReg = await TaskManager.isTaskRegisteredAsync(STEP_TASK_NAME);
    if (!isReg) {
      await BackgroundFetch.registerTaskAsync(STEP_TASK_NAME, {
        minimumInterval: 60,
        stopOnTerminate: false,
        startOnBoot:     true,
      });
    }
  } catch (e) {
    console.log("registerBackgroundStepTask error:", e);
  }
}

export async function unregisterBackgroundStepTask(): Promise<void> {
  try {
    const isReg = await TaskManager.isTaskRegisteredAsync(STEP_TASK_NAME);
    if (isReg) await BackgroundFetch.unregisterTaskAsync(STEP_TASK_NAME);
  } catch {}
  stopAccelerometerTracking();
}