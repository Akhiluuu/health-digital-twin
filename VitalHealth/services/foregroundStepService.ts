// services/foregroundStepService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Notifee Foreground Service — keeps app process and step tracking alive
// even when the app is swiped from recents.
// Runs continuous sensor listeners for step counting and syncs to storage/db.
// ─────────────────────────────────────────────────────────────────────────────

import notifee, { AndroidImportance, EventType } from "@notifee/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { Pedometer, Accelerometer } from "expo-sensors";
import EventEmitter from "eventemitter3";
import { syncStepsData } from "./firebaseSync";

export const CHANNEL_ID = "step_foreground";
export const NOTIF_ID   = "step_foreground_notif";

export const stepEventEmitter = new EventEmitter();

let stopTrackingCallback: (() => void) | null = null;
let resolveServicePromise: (() => void) | null = null;
let activeSubscription: { remove: () => void } | null = null;
let isSensorTrackingActive = false;
let currentTrackingUid = "";

// Sedentary tracking timer
let sedentaryTimer: ReturnType<typeof setInterval> | null = null;

// Firebase sync timeout
let firebaseSyncTimeout: ReturnType<typeof setTimeout> | null = null;

export function registerStopTrackingCallback(cb: () => void) {
  stopTrackingCallback = cb;
}

// ── Step Detector Class for Accelerometer Fallback ───────────────────────────
const ARM_THRESH  = 2.3;   // g-force to arm the detector
const FIRE_THRESH = 1.05;  // g-force to fire (must fall this low after arming)
const PEAK_MIN    = 2.5;   // peak must exceed this to count (rejects soft bumps)
const STEP_GAP_MS = 650;   // minimum ms between steps (~92 steps/min max)

class StepDetector {
  private armed       = false;
  private peak        = 0;
  private lastStepAt  = 0;
  onStep: (() => void) | null = null;

  feed(x: number, y: number, z: number) {
    const mag = Math.sqrt(x * x + y * y + z * z);

    if (!this.armed) {
      if (mag > ARM_THRESH) {
        this.armed = true;
        this.peak  = mag;
      }
      return;
    }

    if (mag > this.peak) {
      this.peak = mag;
    }

    if (mag < FIRE_THRESH) {
      const peaked = this.peak;
      this.armed   = false;
      this.peak    = 0;

      if (peaked < PEAK_MIN) return;
      const now = Date.now();
      if (now - this.lastStepAt < STEP_GAP_MS) return;

      this.lastStepAt = now;
      this.onStep?.();
    }
  }

  reset() {
    this.armed      = false;
    this.peak       = 0;
    this.lastStepAt = 0;
  }
}

// ── Background sensor handler ────────────────────────────────────────────────
async function handleBackgroundStep(delta: number, activeUid: string) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const goalKey = `step_goal_v7_${activeUid}`;
    const dateKey = `step_date_v7_${activeUid}`;
    const totalTodayKey = `step_total_today_v7_${activeUid}`;
    const isTrackingKey = `step_is_tracking_v7_${activeUid}`;
    const lastMoveTsKey = `step_last_move_ts_v7_${activeUid}`;

    // Verify if we are still supposed to be tracking
    const trackingState = await AsyncStorage.getItem(isTrackingKey);
    if (trackingState !== "1") {
      console.log("[foregroundStepService] Tracking state is not 1, stopping service");
      stopForegroundStepService();
      return;
    }

    const storedDate = await AsyncStorage.getItem(dateKey);
    let currentSteps = 0;

    if (storedDate === today) {
      const rawToday = await AsyncStorage.getItem(totalTodayKey);
      currentSteps = parseInt(rawToday ?? "0", 10);
    } else {
      // New day rollover! Reset steps.
      console.log(`[foregroundStepService] New day detected (${storedDate} -> ${today}). Resetting steps.`);
      await AsyncStorage.setItem(dateKey, today);
      await AsyncStorage.setItem(totalTodayKey, "0");
      currentSteps = 0;
    }

    const updatedSteps = currentSteps + delta;

    // Save to AsyncStorage
    await AsyncStorage.setItem(totalTodayKey, String(updatedSteps));
    await AsyncStorage.setItem(lastMoveTsKey, String(Date.now()));

    // Read goal & weight
    const rawGoal = await AsyncStorage.getItem(goalKey);
    const goal = parseInt(rawGoal ?? "10000", 10);
    const rawWeight = await AsyncStorage.getItem(`profile_weight_${activeUid}`) || "70";
    const weightVal = parseFloat(rawWeight.replace(/[^0-9.]/g, "")) || 70;
    const kcal = Math.round(updatedSteps * 0.04 * (weightVal / 70));

    // Update notification
    await updateForegroundNotification(updatedSteps, kcal);

    // Emit event for any active UI listeners
    stepEventEmitter.emit("stepsUpdated", updatedSteps);

    // Enqueue Firebase sync
    enqueueFirebaseSync(updatedSteps, goal, activeUid);
  } catch (err) {
    console.error("Error in handleBackgroundStep:", err);
  }
}

// ── Sedentary tracking ───────────────────────────────────────────────────────
function startSedentaryCheck(activeUid: string) {
  if (sedentaryTimer) clearInterval(sedentaryTimer);
  sedentaryTimer = setInterval(async () => {
    try {
      const lastMoveTsKey = `step_last_move_ts_v7_${activeUid}`;
      const raw = await AsyncStorage.getItem(lastMoveTsKey);
      const last = parseInt(raw ?? String(Date.now()), 10);
      if ((Date.now() - last) / 60000 >= 60) {
        await notifee.createChannel({
          id: "health",
          name: "Health Notifications",
          importance: AndroidImportance.HIGH,
        });
        await notifee.displayNotification({
          title: "Move a little! 🚶",
          body: "You've been inactive for over an hour.",
          android: {
            channelId: "health",
            pressAction: {
              id: "default",
            },
          },
        });
      }
    } catch (err) {
      console.log("Sedentary check error:", err);
    }
  }, 5 * 60 * 1000);
}

function stopSedentaryCheck() {
  if (sedentaryTimer) {
    clearInterval(sedentaryTimer);
    sedentaryTimer = null;
  }
}

// ── Firebase sync ────────────────────────────────────────────────────────────
function enqueueFirebaseSync(steps: number, goal: number, activeUid: string) {
  if (firebaseSyncTimeout) return;

  firebaseSyncTimeout = setTimeout(async () => {
    try {
      console.log(`[foregroundStepService] Syncing background steps to Firestore: ${steps}`);
      await syncStepsData({
        steps: steps,
        goal: goal,
        isTracking: true,
        lastMoveTs: Date.now(),
        date: new Date().toISOString().slice(0, 10),
      }, activeUid !== "self" ? activeUid : undefined);
    } catch (e) {
      console.warn("Failed to sync steps in background service:", e);
    } finally {
      firebaseSyncTimeout = null;
    }
  }, 5000); // Sync every 5 seconds
}

function stopFirebaseSync() {
  if (firebaseSyncTimeout) {
    clearTimeout(firebaseSyncTimeout);
    firebaseSyncTimeout = null;
  }
}

// ── Start background sensor tracking ─────────────────────────────────────────
async function startBackgroundSensorTracking(activeUid: string) {
  if (isSensorTrackingActive && currentTrackingUid === activeUid) {
    return;
  }
  if (isSensorTrackingActive) {
    stopBackgroundSensorTracking();
  }

  isSensorTrackingActive = true;
  currentTrackingUid = activeUid;

  console.log(`[foregroundStepService] Starting background sensor tracking for user: ${activeUid}`);

  startSedentaryCheck(activeUid);

  let pedoOk = false;
  try {
    const available = await Pedometer.isAvailableAsync();
    if (available) {
      let lastOsSteps: number | null = null;
      const sub = Pedometer.watchStepCount((result) => {
        const osSteps = result.steps;
        if (lastOsSteps === null) {
          lastOsSteps = osSteps;
          return;
        }
        const delta = osSteps - lastOsSteps;
        lastOsSteps = osSteps;

        if (delta <= 0 || delta > 20) return;
        handleBackgroundStep(delta, activeUid);
      });
      activeSubscription = { remove: () => sub.remove() };
      pedoOk = true;
      console.log("🦾 Hardware pedometer active in foreground service");
    }
  } catch (e) {
    console.warn("Failed to start background pedometer:", e);
  }

  if (!pedoOk) {
    try {
      const detector = new StepDetector();
      detector.onStep = () => {
        handleBackgroundStep(1, activeUid);
      };
      Accelerometer.setUpdateInterval(200);
      const sub = Accelerometer.addListener(({ x, y, z }) => {
        detector.feed(x, y, z);
      });
      activeSubscription = { remove: () => sub.remove() };
      console.log("📱 Accelerometer active in background service (fallback)");
    } catch (e) {
      console.warn("Failed to start background accelerometer:", e);
    }
  }
}

function stopBackgroundSensorTracking() {
  isSensorTrackingActive = false;
  currentTrackingUid = "";
  stopSedentaryCheck();
  if (activeSubscription) {
    activeSubscription.remove();
    activeSubscription = null;
  }
  stopFirebaseSync();
  console.log("[foregroundStepService] Background sensor tracking stopped");
}

if (Platform.OS === "android") {
  // Register the foreground service keeper
  notifee.registerForegroundService(() => {
    return new Promise<void>(async (resolve) => {
      resolveServicePromise = resolve;
      console.log("🏃 Foreground step service keeper started");
      // ✅ FIX: The foreground step service is ALWAYS for the logged-in user (self).
      // Reading activeMemberId here was wrong — if the user switched to a family member
      // then killed the app, the service would restart tracking under the family uid,
      // crediting steps to a different profile. We use auth.currentUser?.uid as the
      // self-uid. If auth hasn't resolved yet, we fall back to "self" which maps to
      // the logged-in user's keys once StepContext initialises and calls startTracking.
      const { auth: _auth } = await import("./firebase");
      const selfUid = _auth.currentUser?.uid || "self";
      await startBackgroundSensorTracking(selfUid);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

// ── Start the foreground service ──────────────────────────────────────────────
export async function startForegroundStepService(): Promise<void> {
  try {
    // ✅ FIX: Always start tracking for the logged-in user (self), not whoever
    // was the last activeMemberId. Step counting is personal — family members
    // have their own devices. Reading activeMemberId here caused step data
    // to be credited to the family member's profile on service restart.
    const { auth: _auth } = await import("./firebase");
    const activeUid = _auth.currentUser?.uid || "self";
    
    await notifee.createChannel({
      id:         CHANNEL_ID,
      name:       "Step Tracking",
      importance: AndroidImportance.LOW, // LOW = no sound, no heads-up banner
    });

    await notifee.displayNotification({
      id:    NOTIF_ID,
      title: "👟 VitalHealth is tracking your steps",
      body:  "Counting steps in the background",
      android: {
        channelId:           CHANNEL_ID,
        asForegroundService: true,  // ← keeps process alive after recents swipe
        ongoing:             true,  // user cannot swipe notification away
        color:               "#f97316",
        smallIcon:           "ic_launcher",
        pressAction:         { id: "default" },
        actions: [
          {
            title:       "⏹ Stop Tracking",
            pressAction: { id: "stop_tracking" },
          },
        ],
      },
    });

    console.log("✅ Foreground service started");

    if (Platform.OS === "android") {
      await startBackgroundSensorTracking(activeUid);
    }
  } catch (e) {
    console.log("startForegroundStepService error:", e);
  }
}

// ── Update notification with live step count ───────────────────────────────────
export async function updateForegroundNotification(
  steps: number,
  calories: number
): Promise<void> {
  try {
    await notifee.displayNotification({
      id:    NOTIF_ID,
      title: `👟 ${steps.toLocaleString("en-IN")} steps today`,
      body:  `${calories} kcal burned · tap to open`,
      android: {
        channelId:           CHANNEL_ID,
        asForegroundService: true,
        ongoing:             true,
        color:               "#f97316",
        smallIcon:           "ic_launcher",
        pressAction:         { id: "default" },
        actions: [
          {
            title:       "⏹ Stop Tracking",
            pressAction: { id: "stop_tracking" },
          },
        ],
      },
    });
  } catch {}
}

// ── Stop the foreground service ───────────────────────────────────────────────
export async function stopForegroundStepService(): Promise<void> {
  try {
    stopBackgroundSensorTracking();
    await notifee.stopForegroundService();
    await notifee.cancelNotification(NOTIF_ID);
    if (resolveServicePromise) {
      resolveServicePromise();
      resolveServicePromise = null;
    }
    console.log("⏹ Foreground service stopped");
  } catch (e) {
    console.log("stopForegroundStepService error:", e);
  }
}

// ── Foreground event listener — handles button press when app IS open ─────────
export function listenForegroundServiceEvents(
  onStop: () => void
): () => void {
  // Note: Background events are now centrally managed in notifeeService.ts,
  // but we keep this listener active for foreground-only actions.
  const unsub = notifee.onForegroundEvent(({ type, detail }) => {
    if (
      type === EventType.ACTION_PRESS &&
      detail.pressAction?.id === "stop_tracking"
    ) {
      console.log("⏹ Stop Tracking pressed from foreground listener");
      onStop();
    }
  });
  return unsub;
}