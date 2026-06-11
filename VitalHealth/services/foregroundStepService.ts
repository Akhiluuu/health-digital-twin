// services/foregroundStepService.ts
// ─────────────────────────────────────────────────────────────────────────────
// Notifee Foreground Service — keeps app process and step tracking alive
// even when the app is swiped from recents.
// ─────────────────────────────────────────────────────────────────────────────

import notifee, { AndroidImportance, EventType } from "@notifee/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const CHANNEL_ID = "step_foreground";
export const NOTIF_ID   = "step_foreground_notif";

let stopTrackingCallback: (() => void) | null = null;

export function registerStopTrackingCallback(cb: () => void) {
  stopTrackingCallback = cb;
}

// ── 1. Foreground Service handler — keeps process alive
notifee.registerForegroundService(() => {
  return new Promise(() => {
    // This promise never resolves — the service runs until stopForegroundService()
    console.log("🏃 Foreground step service keeper started");
  });
});

// ── 2. Background event handler — handles notification button presses
notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type === EventType.ACTION_PRESS) {
    const actionId = detail.pressAction?.id;

    if (actionId === "stop_tracking") {
      console.log("⏹ Stop Tracking pressed from background");
      if (stopTrackingCallback) {
        stopTrackingCallback();
      } else {
        const activeUid = await AsyncStorage.getItem("vitalhealth_active_member_id") || "self";
        const trackingKey = `step_is_tracking_v7_${activeUid}`;
        await AsyncStorage.setItem(trackingKey, "0");
      }
      // Stop the foreground service and dismiss the notification
      await notifee.stopForegroundService().catch(() => {});
      await notifee.cancelNotification(NOTIF_ID).catch(() => {});
    }
  }

  if (type === EventType.PRESS) {
    console.log("👆 Step notification tapped from background");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

// ── Start the foreground service ──────────────────────────────────────────────
export async function startForegroundStepService(): Promise<void> {
  try {
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
  } catch (e) {
    console.log("startForegroundStepService error:", e);
  }
}

// ── Update notification with live step count (called every 5s/10s) ──────────────
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
    await notifee.stopForegroundService();
    await notifee.cancelNotification(NOTIF_ID);
    console.log("⏹ Foreground service stopped");
  } catch (e) {
    console.log("stopForegroundStepService error:", e);
  }
}

// ── Foreground event listener — handles button press when app IS open ─────────
export function listenForegroundServiceEvents(
  onStop: () => void
): () => void {
  const unsub = notifee.onForegroundEvent(({ type, detail }) => {
    if (
      type === EventType.ACTION_PRESS &&
      detail.pressAction?.id === "stop_tracking"
    ) {
      console.log("⏹ Stop Tracking pressed from foreground");
      onStop();
    }
  });
  return unsub;
}