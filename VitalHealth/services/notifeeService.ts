// services/notifeeService.ts

import notifee, {
  AndroidImportance,
  AlarmType,
  EventType,
  TriggerType,
  RepeatFrequency,
} from "@notifee/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { EventEmitter } from "eventemitter3";

import {
  markMedicineTakenByNotificationId,
  getMedicineByNotificationId,
  deleteMedicine,
  getMedicines,
} from "../database/medicineDB";

import { saveWaterToStorage }   from "../utils/hydrationStorage";
import { addToMedicineHistory } from "../utils/medicineHistory";
import { syncDeleteMedicine }   from "./firebaseSync";

///////////////////////////////////////////////////////////
// EVENT BUS
// ✅ FIX (Tick not appearing): After the foreground handler writes to
//    SQLite, it emits "medicine_taken" so MedicineContext can call
//    reloadMedicines() and update React state immediately.
//    Without this, state stays stale until the user leaves and
//    returns to the vault screen.
///////////////////////////////////////////////////////////

export const medicineEventBus = new EventEmitter();

///////////////////////////////////////////////////////////
// ACTION IDs
///////////////////////////////////////////////////////////

export const ACTION_MEDICINE_TAKEN  = "MEDICINE_TAKEN";
export const ACTION_MEDICINE_SNOOZE = "MEDICINE_SNOOZE";

export const ACTION_WATER_100   = "HYDRATION_100";
export const ACTION_WATER_150   = "HYDRATION_150";
export const ACTION_WATER_200   = "HYDRATION_200";
export const ACTION_WATER_SKIP  = "HYDRATION_SNOOZE";
export const ACTION_WATER_DRINK = "HYDRATION_100"; // backwards compat

export const ACTION_SYMPTOM_DONE = "SYMPTOM_DONE";

const CHANNEL_ID = "health";

///////////////////////////////////////////////////////////
// SETUP
///////////////////////////////////////////////////////////

export async function setupNotifee() {
  const settings = await notifee.requestPermission();

  if (settings.authorizationStatus < 1) {
    console.log("❌ Notification permission denied");
    return;
  }

  await notifee.createChannel({
    id: CHANNEL_ID,
    name: "Health Notifications",
    importance: AndroidImportance.HIGH,
    vibration: true,
  });

  try {
    const alreadyPrompted = await AsyncStorage.getItem("battery_opt_prompted");
    if (!alreadyPrompted) {
      const powerManagerInfo = await notifee.getPowerManagerInfo();
      if (powerManagerInfo.activity) {
        await notifee.openPowerManagerSettings();
        await AsyncStorage.setItem("battery_opt_prompted", "true");
      }
    }
  } catch (e) {
    console.log("⚠️ Power manager settings unavailable:", e);
  }

  console.log("✅ Notifee initialized");
}

///////////////////////////////////////////////////////////
// 💊 ONE-TIME MEDICINE NOTIFICATION
///////////////////////////////////////////////////////////

export const scheduleMedicineOnce = async (
  title: string,
  date: Date,
  medicineId?: number
): Promise<string> => {
  const id = `med_once_${Date.now()}`;

  await notifee.createTriggerNotification(
    {
      id,
      title: "💊 Medicine Reminder",
      body: title,
      data: {
        type:       "medicine",
        // ✅ Store medicineId in notification data so snooze lookups work
        medicineId: String(medicineId ?? ""),
        frequency:  "once",
      },
      android: {
        channelId: CHANNEL_ID,
        pressAction: { id: "default" },
        actions: [
          {
            title: "✅ Taken",
            pressAction: { id: ACTION_MEDICINE_TAKEN, launchActivity: "none" },
          },
          {
            title: "⏰ Snooze 5min",
            pressAction: { id: ACTION_MEDICINE_SNOOZE, launchActivity: "none" },
          },
        ],
      },
    },
    {
      type: TriggerType.TIMESTAMP,
      timestamp: date.getTime(),
      alarmManager: {
        allowWhileIdle: true,
        type: AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE,
      },
    }
  );

  return id;
};

///////////////////////////////////////////////////////////
// 💊 DAILY MEDICINE NOTIFICATION
///////////////////////////////////////////////////////////

export const scheduleMedicineDaily = async (
  title: string,
  hour: number,
  minute: number,
  medicineId?: number
): Promise<string> => {
  const id = `med_daily_${Date.now()}`;

  const now     = new Date();
  const trigger = new Date();
  trigger.setHours(hour, minute, 0, 0);

  if (trigger.getTime() <= now.getTime()) {
    trigger.setDate(trigger.getDate() + 1);
  }

  console.log("📅 Daily trigger at:", trigger.toISOString());

  await notifee.createTriggerNotification(
    {
      id,
      title: "💊 Medicine Reminder",
      body: title,
      data: {
        type:       "medicine",
        medicineId: String(medicineId ?? ""),
        frequency:  "daily",
      },
      android: {
        channelId: CHANNEL_ID,
        pressAction: { id: "default" },
        actions: [
          {
            title: "✅ Taken",
            pressAction: { id: ACTION_MEDICINE_TAKEN, launchActivity: "none" },
          },
          {
            title: "⏰ Snooze 5min",
            pressAction: { id: ACTION_MEDICINE_SNOOZE, launchActivity: "none" },
          },
        ],
      },
    },
    {
      type: TriggerType.TIMESTAMP,
      timestamp: trigger.getTime(),
      repeatFrequency: RepeatFrequency.DAILY,
      alarmManager: {
        allowWhileIdle: true,
        type: AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE,
      },
    }
  );

  return id;
};

///////////////////////////////////////////////////////////
// 🔁 SNOOZE — 5 minutes
///////////////////////////////////////////////////////////

export const snoozeMedicine = async (
  body:       string,
  medicineId: string = "",
  frequency:  string = "daily",
  minutes:    number = 5
): Promise<string> => {
  const id        = `snooze_${Date.now()}`;
  const timestamp = Date.now() + minutes * 60 * 1000;

  await notifee.createTriggerNotification(
    {
      id,
      title: "💊 Snoozed Reminder",
      body,
      data: {
        type: "medicine",
        // ✅ KEY FIX: carry the original medicineId through the snooze
        //    so handleMedicineTaken can look up by medicineId (not notifId)
        //    when the user taps "Taken" on the snoozed notification.
        medicineId,
        frequency,
      },
      android: {
        channelId: CHANNEL_ID,
        pressAction: { id: "default" },
        actions: [
          {
            title: "✅ Taken",
            pressAction: { id: ACTION_MEDICINE_TAKEN, launchActivity: "none" },
          },
          {
            title: "⏰ Snooze 5min",
            pressAction: { id: ACTION_MEDICINE_SNOOZE, launchActivity: "none" },
          },
        ],
      },
    },
    {
      type: TriggerType.TIMESTAMP,
      timestamp,
      alarmManager: {
        allowWhileIdle: true,
        type: AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE,
      },
    }
  );

  console.log(`⏰ Snoozed ${minutes}min — fires at:`, new Date(timestamp).toISOString());
  return id;
};

///////////////////////////////////////////////////////////
// HANDLE "TAKEN"
// ✅ FIX 1: Looks up medicine by BOTH notifId AND medicineId from data.
//    The snooze notification has a new notifId but still carries the
//    original medicineId in its data — so we fall back to that.
// ✅ FIX 2: Emits "medicine_taken" event so MedicineContext immediately
//    calls reloadMedicines() and the tick appears without needing to
//    leave and re-enter the screen.
///////////////////////////////////////////////////////////

export async function handleMedicineTaken(
  notifId:    string,
  medicineId: string = ""   // from notification data — needed for snooze
) {
  try {
    // Step 1: Try to find medicine by notifId first (original notification)
    let med = getMedicineByNotificationId(notifId);

    // Step 2: If not found (snooze case — new notifId), look up by medicineId
    if (!med && medicineId) {
      const all = getMedicines();
      med = all.find((m) => String(m.id) === String(medicineId)) ?? null;
    }

    if (med) {
      // Mark taken in SQLite with today's date
      markMedicineTakenByNotificationId(med.notificationId || notifId);

      // Log to history
      await addToMedicineHistory({
        medicineId:   med.id,
        medicineName: med.name,
        dose:         med.dose,
        time:         med.time,
        status:       "taken",
      });

      const freq = med.frequency?.toLowerCase();

      if (freq === "once") {
        // ✅ One-time: delete from vault entirely
        deleteMedicine(med.id);
        syncDeleteMedicine(med.id);
        await notifee.cancelNotification(notifId);
        await notifee.cancelNotification(med.notificationId); // cancel original too
        console.log("🗑 Once medicine deleted from vault:", med.name);
      } else {
        // Daily: just dismiss displayed notification; repeat trigger stays alive
        await notifee.cancelDisplayedNotification(notifId);
        console.log("✅ Daily medicine marked taken:", med.name);
      }
    } else {
      // Medicine not found — just dismiss
      console.log("⚠️ Medicine not found for notifId:", notifId, "medicineId:", medicineId);
      await notifee.cancelDisplayedNotification(notifId);
    }

    // ✅ FIX 2: Notify MedicineContext to reload state so tick appears immediately
    medicineEventBus.emit("medicine_taken");

  } catch (err) {
    console.log("❌ handleMedicineTaken error:", err);
    await notifee.cancelDisplayedNotification(notifId).catch(() => {});
    medicineEventBus.emit("medicine_taken"); // still reload on error
  }
}

///////////////////////////////////////////////////////////
// 💧 HYDRATION
///////////////////////////////////////////////////////////

export const scheduleHydration = async (minutes: number = 60): Promise<string> => {
  const id        = `hydration_${Date.now()}`;
  const timestamp = Date.now() + minutes * 60 * 1000;

  await notifee.createTriggerNotification(
    {
      id,
      title: "💧 Drink Water",
      body:  "Stay hydrated!",
      data:  { type: "hydration" },
      android: {
        channelId: CHANNEL_ID,
        pressAction: { id: "default" },
        actions: [
          { title: "💧 100ml", pressAction: { id: ACTION_WATER_100,  launchActivity: "none" } },
          { title: "💧 150ml", pressAction: { id: ACTION_WATER_150,  launchActivity: "none" } },
          { title: "💧 200ml", pressAction: { id: ACTION_WATER_200,  launchActivity: "none" } },
          { title: "Skip",    pressAction: { id: ACTION_WATER_SKIP, launchActivity: "none" } },
        ],
      },
    },
    {
      type: TriggerType.TIMESTAMP,
      timestamp,
      alarmManager: { allowWhileIdle: true },
    }
  );

  return id;
};

export const scheduleHydrationReminder = async () => {
  const value   = await AsyncStorage.getItem("hydration_interval");
  const minutes = value ? Number(value) : 60;
  return scheduleHydration(minutes);
};

export const cancelHydrationReminders = async () => {
  const notifications = await notifee.getTriggerNotifications();
  for (const n of notifications) {
    if (n.notification?.data?.type === "hydration") {
      await notifee.cancelNotification(n.notification.id!);
    }
  }
};

export const snoozeHydrationReminder = async () => scheduleHydration(10);

///////////////////////////////////////////////////////////
// 🩺 SYMPTOM
///////////////////////////////////////////////////////////

export const showSymptomNotification = async (symptom: string) => {
  await notifee.displayNotification({
    title: "🩺 Symptom Check",
    body:  `Are you experiencing ${symptom}?`,
    data:  { type: "symptom", symptom },
    android: {
      channelId: CHANNEL_ID,
      pressAction: { id: "default" },
      actions: [
        { title: "I'm fine", pressAction: { id: ACTION_SYMPTOM_DONE, launchActivity: "none" } },
      ],
    },
  });
};

export const scheduleSymptomHourly = async (symptom: string): Promise<string> => {
  const id = `symptom_hourly_${Date.now()}`;

  await notifee.createTriggerNotification(
    {
      id,
      title: "🩺 Symptom Check",
      body:  `Are you still experiencing ${symptom}?`,
      data:  { type: "symptom", symptom },
      android: {
        channelId: CHANNEL_ID,
        pressAction: { id: "default" },
        actions: [
          { title: "I'm fine", pressAction: { id: ACTION_SYMPTOM_DONE, launchActivity: "none" } },
        ],
      },
    },
    {
      type: TriggerType.TIMESTAMP,
      timestamp: Date.now() + 60 * 60 * 1000,
      repeatFrequency: RepeatFrequency.HOURLY,
      alarmManager: { allowWhileIdle: true },
    }
  );

  return id;
};

export const cancelSymptomNotification = async () => {
  try {
    const triggers  = await notifee.getTriggerNotifications();
    const displayed = await notifee.getDisplayedNotifications();
    for (const n of [...triggers, ...displayed]) {
      if (n.notification?.data?.type === "symptom") {
        await notifee.cancelNotification(n.notification.id!);
      }
    }
    console.log("🛑 Symptom notifications cancelled");
  } catch (error) {
    console.log("❌ cancelSymptomNotification error:", error);
  }
};

///////////////////////////////////////////////////////////
// ❌ CANCEL MEDICINE NOTIFICATION
///////////////////////////////////////////////////////////

export const cancelMedicineNotification = async (id: string) => {
  try {
    await notifee.cancelNotification(id);
  } catch (error) {
    console.log("Cancel error:", error);
  }
};

///////////////////////////////////////////////////////////
// FOREGROUND HANDLER
///////////////////////////////////////////////////////////

export function registerNotifeeForegroundHandler() {
  return notifee.onForegroundEvent(async ({ type, detail }) => {
    if (type !== EventType.ACTION_PRESS) return;

    const action    = detail.pressAction?.id;
    const notifId   = detail.notification?.id ?? "";
    const data      = detail.notification?.data ?? {};
    const medicineId = String(data.medicineId ?? "");

    console.log("⚡ Foreground Action:", action, "notifId:", notifId, "medicineId:", medicineId);

    // ── Medicine: Taken ──────────────────────────────────────────
    if (action === ACTION_MEDICINE_TAKEN) {
      // ✅ Pass medicineId from notification data as fallback for snooze case
      await handleMedicineTaken(notifId, medicineId);
      return;
    }

    // ── Medicine: Snooze ─────────────────────────────────────────
    if (action === ACTION_MEDICINE_SNOOZE) {
      await snoozeMedicine(
        detail.notification?.body || "Medicine reminder",
        medicineId,
        String(data.frequency ?? "daily"),
        5
      );
      await notifee.cancelDisplayedNotification(notifId);
      return;
    }

    // ── Hydration ────────────────────────────────────────────────
    if (
      action === ACTION_WATER_100 ||
      action === ACTION_WATER_150 ||
      action === ACTION_WATER_200
    ) {
      const ml =
        action === ACTION_WATER_100 ? 100
        : action === ACTION_WATER_150 ? 150
        : 200;
      await saveWaterToStorage(ml);
      try {
        const { addWaterFromNotification } = await import("../context/HydrationContext");
        await addWaterFromNotification(ml);
      } catch {
        console.log("💧 HydrationContext not ready — AsyncStorage updated");
      }
      await scheduleHydrationReminder();
      await notifee.cancelDisplayedNotification(notifId);
      return;
    }

    if (action === ACTION_WATER_SKIP) {
      await scheduleHydrationReminder();
      await notifee.cancelDisplayedNotification(notifId);
      return;
    }

    // ── Symptom ──────────────────────────────────────────────────
    if (action === ACTION_SYMPTOM_DONE) {
      await cancelSymptomNotification();
      await notifee.cancelDisplayedNotification(notifId);
      return;
    }

    // Default dismiss
    if (notifId) await notifee.cancelDisplayedNotification(notifId);
  });
}