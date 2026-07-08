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
import { router } from "expo-router";
import { Platform } from "react-native";

import {
  markMedicineTakenByNotificationId,
  getMedicineByNotificationId,
  deleteMedicine,
  getMedicines,
} from "../database/medicineDB";

import { saveWaterToStorage }   from "../utils/hydrationStorage";
import { addToMedicineHistory } from "../utils/medicineHistory";
import { syncDeleteMedicine }   from "./firebaseSync";

import { log } from "../utils/logger";

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
export const ACTION_MEDICINE_MISSED = "MEDICINE_MISSED";
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
    log("❌ Notification permission denied");
    return;
  }

  await notifee.createChannel({
    id: CHANNEL_ID,
    name: "Health Notifications",
    importance: AndroidImportance.HIGH,
    vibration: true,
  });

  if (Platform.OS === "android") {
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
      log("⚠️ Power manager settings unavailable:", e);
    }
  }

  // Schedule daily digital twin sync check-in reminder
  await scheduleDailyLogReminder();

  log("✅ Notifee initialized");
}

///////////////////////////////////////////////////////////
// 💊 ONE-TIME MEDICINE NOTIFICATION
///////////////////////////////////////////////////////////

export const scheduleMedicineOnce = async (
  title: string,
  date: Date,
  medicineId?: number,
  profileId?: string,
  profileName?: string,
  medicineName?: string,
  dose?: string,
  time?: string,
  frequency?: string,
  customNotifId?: string
): Promise<string> => {
  const id = customNotifId || (profileId && profileId !== "self" && medicineId ? `med_${profileId}_${medicineId}` : `med_once_${Date.now()}`);

  await notifee.createTriggerNotification(
    {
      id,
      title: profileName ? `💊 Medicine Reminder (${profileName})` : "💊 Medicine Reminder",
      body: title,
      data: {
        type:       "medicine",
        medicineId: String(medicineId ?? ""),
        medicineName: medicineName || "",
        dose:         dose || "",
        time:         time || "",
        frequency:    frequency || "once",
        profileId:  profileId || "self",
        profileName: profileName || "",
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
            title: "❌ Missed",
            pressAction: { id: ACTION_MEDICINE_MISSED, launchActivity: "none" },
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
  medicineId?: number,
  profileId?: string,
  profileName?: string,
  medicineName?: string,
  dose?: string,
  time?: string,
  frequency?: string,
  customNotifId?: string
): Promise<string> => {
  const id = customNotifId || (profileId && profileId !== "self" && medicineId ? `med_${profileId}_${medicineId}` : `med_daily_${Date.now()}`);

  const now     = new Date();
  const trigger = new Date();
  trigger.setHours(hour, minute, 0, 0);

  if (trigger.getTime() <= now.getTime()) {
    trigger.setDate(trigger.getDate() + 1);
  }

  log("📅 Daily trigger at:", trigger.toISOString());

  await notifee.createTriggerNotification(
    {
      id,
      title: profileName ? `💊 Medicine Reminder (${profileName})` : "💊 Medicine Reminder",
      body: title,
      data: {
        type:       "medicine",
        medicineId: String(medicineId ?? ""),
        medicineName: medicineName || "",
        dose:         dose || "",
        time:         time || "",
        frequency:    frequency || "daily",
        profileId:  profileId || "self",
        profileName: profileName || "",
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
            title: "❌ Missed",
            pressAction: { id: ACTION_MEDICINE_MISSED, launchActivity: "none" },
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
  minutes:    number = 5,
  profileId:  string = "self",
  profileName: string = "",
  medicineName: string = "",
  dose:       string = "",
  time:       string = ""
): Promise<string> => {
  const id        = `snooze_${Date.now()}`;
  const timestamp = Date.now() + minutes * 60 * 1000;

  await notifee.createTriggerNotification(
    {
      id,
      title: profileName ? `💊 Snoozed Reminder (${profileName})` : "💊 Snoozed Reminder",
      body,
      data: {
        type: "medicine",
        medicineId,
        frequency,
        profileId,
        profileName,
        medicineName,
        dose,
        time,
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
            title: "❌ Missed",
            pressAction: { id: ACTION_MEDICINE_MISSED, launchActivity: "none" },
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

  log(`⏰ Snoozed ${minutes}min — fires at:`, new Date(timestamp).toISOString());
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
// ///////////////////////////////////////////////////////////

export async function handleMedicineTaken(
  notifId:    string,
  medicineId: string = "",   // from notification data — needed for snooze
  profileId:  string = "self",
  medicineName: string = "",
  dose:       string = "",
  time:       string = "",
  frequency:  string = ""
) {
  try {
    const isMember = profileId && profileId !== "self";
    let med = null;

    if (!isMember) {
      med = getMedicineByNotificationId(notifId);
      if (!med && medicineId) {
        const all = getMedicines();
        med = all.find((m) => String(m.id) === String(medicineId)) ?? null;
      }
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
        log("🗑 Once medicine deleted from vault:", med.name);
      } else {
        // Daily: just dismiss displayed notification; repeat trigger stays alive
        await notifee.cancelDisplayedNotification(notifId);
        log("✅ Daily medicine marked taken:", med.name);
      }
    } else if (isMember) {
      if (medicineId) {
        const medIdNum = parseInt(medicineId, 10);
        const { syncUpdateMedicineStatus, syncDeleteMedicine: firebaseDeleteMedicine } = require("./firebaseSync");

        await syncUpdateMedicineStatus(medIdNum, "taken", profileId);

        await addToMedicineHistory({
          medicineId:   medIdNum,
          medicineName: medicineName || "Medication",
          dose:         dose || "",
          time:         time || "",
          status:       "taken",
          targetUid:    profileId,
        });

        if (frequency?.toLowerCase() === "once") {
          await firebaseDeleteMedicine(medIdNum, profileId);
          await notifee.cancelNotification(notifId);
          log("🗑 Once medicine deleted from vault for member:", profileId);
        } else {
          await notifee.cancelDisplayedNotification(notifId);
          log("✅ Daily medicine marked taken for member:", profileId);
        }
      }
    } else {
      // Medicine not found — just dismiss
      log("⚠️ Medicine not found for notifId:", notifId, "medicineId:", medicineId);
      await notifee.cancelDisplayedNotification(notifId);
    }

    // ✅ FIX 2: Notify MedicineContext to reload state so tick appears immediately
    medicineEventBus.emit("medicine_taken");

  } catch (err) {
    log("❌ handleMedicineTaken error:", err);
    await notifee.cancelDisplayedNotification(notifId).catch(() => {});
    medicineEventBus.emit("medicine_taken"); // still reload on error
  }
}

export async function handleMedicineMissed(
  notifId:    string,
  medicineId: string = "",
  profileId:  string = "self",
  medicineName: string = "",
  dose:       string = "",
  time:       string = ""
) {
  try {
    const { markMedicineMissedByNotificationId, getMedicineByNotificationId, getMedicines } = require("../database/medicineDB");
    const { syncUpdateMedicineStatus } = require("./firebaseSync");

    const isMember = profileId && profileId !== "self";
    let med = null;

    if (!isMember) {
      med = getMedicineByNotificationId(notifId);
      if (!med && medicineId) {
        const all = getMedicines();
        med = all.find((m: any) => String(m.id) === String(medicineId)) ?? null;
      }
    }

    if (med) {
      markMedicineMissedByNotificationId(med.notificationId || notifId);
      await syncUpdateMedicineStatus(med.id, "missed");

      await addToMedicineHistory({
        medicineId:   med.id,
        medicineName: med.name,
        dose:         med.dose,
        time:         med.time,
        status:       "missed",
      });

      await notifee.cancelDisplayedNotification(notifId);
      log("❌ Daily medicine marked missed:", med.name);
    } else if (isMember) {
      if (medicineId) {
        const medIdNum = parseInt(medicineId, 10);
        await syncUpdateMedicineStatus(medIdNum, "missed", profileId);

        await addToMedicineHistory({
          medicineId:   medIdNum,
          medicineName: medicineName || "Medication",
          dose:         dose || "",
          time:         time || "",
          status:       "missed",
          targetUid:    profileId,
        });

        await notifee.cancelDisplayedNotification(notifId);
        log("❌ Daily medicine marked missed for member:", profileId);
      }
    } else {
      log("⚠️ Medicine not found for notifId:", notifId, "medicineId:", medicineId);
      await notifee.cancelDisplayedNotification(notifId);
    }

    medicineEventBus.emit("medicine_taken");

  } catch (err) {
    log("❌ handleMedicineMissed error:", err);
    await notifee.cancelDisplayedNotification(notifId).catch(() => {});
    medicineEventBus.emit("medicine_taken");
  }
}

///////////////////////////////////////////////////////////
// 💧 HYDRATION
///////////////////////////////////////////////////////////

export const scheduleHydration = async (
  minutes: number = 60,
  profileId?: string,
  profileName?: string
): Promise<string> => {
  const id        = `hydration_${Date.now()}`;
  const timestamp = Date.now() + minutes * 60 * 1000;

  await notifee.createTriggerNotification(
    {
      id,
      title: profileName ? `💧 Drink Water (${profileName})` : "💧 Drink Water",
      body:  "Stay hydrated!",
      data:  {
        type: "hydration",
        profileId: profileId || "self",
        profileName: profileName || "",
      },
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

export const scheduleHydrationReminder = async (profileId?: string, profileName?: string) => {
  const value   = await AsyncStorage.getItem("hydration_interval");
  const minutes = value ? Number(value) : 60;
  return scheduleHydration(minutes, profileId, profileName);
};

export const cancelHydrationReminders = async () => {
  const notifications = await notifee.getTriggerNotifications();
  for (const n of notifications) {
    if (n.notification?.data?.type === "hydration") {
      await notifee.cancelNotification(n.notification.id!);
    }
  }
};

export const snoozeHydrationReminder = async (profileId?: string, profileName?: string) =>
  scheduleHydration(10, profileId, profileName);

///////////////////////////////////////////////////////////
// 🩺 SYMPTOM
///////////////////////////////////////////////////////////

export const showSymptomNotification = async (symptom: string, profileId?: string, profileName?: string) => {
  await notifee.displayNotification({
    title: profileName ? `🩺 Symptom Check (${profileName})` : "🩺 Symptom Check",
    body:  `Are you experiencing ${symptom}?`,
    data:  { type: "symptom", symptom, profileId: profileId || "self", profileName: profileName || "" },
    android: {
      channelId: CHANNEL_ID,
      pressAction: { id: "default" },
      actions: [
        { title: "I'm fine", pressAction: { id: ACTION_SYMPTOM_DONE, launchActivity: "none" } },
      ],
    },
  });
};

export const scheduleSymptomHourly = async (symptom: string, profileId?: string, profileName?: string): Promise<string> => {
  const id = `symptom_hourly_${Date.now()}`;

  await notifee.createTriggerNotification(
    {
      id,
      title: profileName ? `🩺 Symptom Check (${profileName})` : "🩺 Symptom Check",
      body:  `Are you still experiencing ${symptom}?`,
      data:  { type: "symptom", symptom, profileId: profileId || "self", profileName: profileName || "" },
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
    log("🛑 Symptom notifications cancelled");
  } catch (error) {
    log("❌ cancelSymptomNotification error:", error);
  }
};

///////////////////////////////////////////////////////////
// ❌ CANCEL MEDICINE NOTIFICATION
///////////////////////////////////////////////////////////

export const cancelMedicineNotification = async (id: string) => {
  try {
    await notifee.cancelNotification(id);
  } catch (error) {
    log("Cancel error:", error);
  }
};

///////////////////////////////////////////////////////////
// 🗓️ ROUTINE / HABIT REMINDER NOTIFICATIONS
///////////////////////////////////////////////////////////

export const scheduleRoutineReminder = async (
  id: string,
  title: string,
  body: string,
  hour: number,
  minute: number,
  tab: string
): Promise<string> => {
  if (!notifee) return id;
  try {
    const now     = new Date();
    const trigger = new Date();
    trigger.setHours(hour, minute, 0, 0);

    if (trigger.getTime() <= now.getTime()) {
      trigger.setDate(trigger.getDate() + 1);
    }

    log(`📅 Daily routine trigger [${tab}] scheduled at:`, trigger.toISOString());

    await notifee.createTriggerNotification(
      {
        id,
        title,
        body,
        data: {
          type: "routine_reminder",
          tab,
          reminderId: id,
        },
        android: {
          channelId: CHANNEL_ID,
          pressAction: { id: "default" },
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
  } catch (e) {
    log("❌ scheduleRoutineReminder error:", e);
  }
  return id;
};

export const cancelRoutineReminder = async (id: string) => {
  if (!notifee) return;
  try {
    await notifee.cancelNotification(id);
    log("🔕 Cancelled routine reminder:", id);
  } catch (error) {
    log("❌ Cancel routine reminder error:", error);
  }
};

///////////////////////////////////////////////////////////
// 🔄 DAILY LOG / SYNC DIGITAL TWIN REMINDER
///////////////////////////////////////////////////////////

export const scheduleDailyLogReminder = async () => {
  try {
    const id = "daily_log_reminder";

    const enabledRaw = await AsyncStorage.getItem("@twin_reminder_enabled");
    const enabled = enabledRaw === null ? true : enabledRaw === "true";

    if (!enabled) {
      await notifee.cancelNotification(id).catch(() => {});
      log("🔕 Daily Twin Sync Reminder is disabled");
      return;
    }

    const timeRaw = await AsyncStorage.getItem("@twin_reminder_time");
    const time = timeRaw || "22:00"; // 10:00 PM default
    const [h, m] = time.split(":").map(Number);

    const lastSimDate = await AsyncStorage.getItem("@last_simulated_date");
    const todayStr = new Date().toDateString();

    const trigger = new Date();
    trigger.setHours(h, m, 0, 0);

    const now = new Date();

    if (lastSimDate === todayStr) {
      // Already simulated today, schedule for tomorrow
      trigger.setDate(trigger.getDate() + 1);
    } else {
      // Hasn't simulated today. If the scheduled time has already passed today, schedule for tomorrow
      if (trigger.getTime() <= now.getTime()) {
        trigger.setDate(trigger.getDate() + 1);
      }
    }

    // Cancel any existing daily log reminder trigger first
    await notifee.cancelNotification(id).catch(() => {});

    await notifee.createTriggerNotification(
      {
        id,
        title: "🔄 Sync Digital Twin",
        body: "Keep your physiological twin synchronized! Tap to log today's routine events.",
        data: {
          type: "twin_reminder",
        },
        android: {
          channelId: CHANNEL_ID,
          pressAction: { id: "default" },
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
    log("📅 Daily Twin Sync Reminder scheduled for:", trigger.toISOString());
  } catch (error) {
    log("❌ Error scheduling daily log reminder:", error);
  }
};

///////////////////////////////////////////////////////////
// ⏳ 24h INACTIVITY REMINDER
// Schedules a reminder to fire exactly 24 hours from the last input.
// This is a sliding window; any new input cancels the old and schedules a new one.
///////////////////////////////////////////////////////////

export const scheduleInactivityReminder = async () => {
  try {
    const id = "inactivity_reminder";
    await notifee.cancelNotification(id).catch(() => {});

    const now = Date.now();
    await AsyncStorage.setItem("@last_input_time", String(now));

    const triggerTime = now + 24 * 60 * 60 * 1000;

    await notifee.createTriggerNotification(
      {
        id,
        title: "⏰ 24h Inactivity Reminder",
        body: "You haven't logged any health data or updated your Digital Twin in 24 hours. Keep your twin synchronized!",
        data: {
          type: "twin_reminder",
        },
        android: {
          channelId: CHANNEL_ID,
          pressAction: { id: "default" },
        },
      },
      {
        type: TriggerType.TIMESTAMP,
        timestamp: triggerTime,
        repeatFrequency: RepeatFrequency.DAILY,
        alarmManager: {
          allowWhileIdle: true,
          type: AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE,
        },
      }
    );
    log("📅 24h inactivity reminder scheduled for:", new Date(triggerTime).toISOString());
  } catch (err) {
    log("❌ Error scheduling inactivity reminder:", err);
  }
};

async function saveDeliveredNotificationToDB(notification: any) {
  if (!notification || !notification.id) return;
  try {
    const data = notification.data || {};
    
    // Ignore step tracker foreground notification because it's persistent and updated on every step
    if (notification.id === "step_foreground_notif") return;

    const profileId = data.profileId === "self" || !data.profileId ? null : String(data.profileId);
    const profileName = data.profileName ? String(data.profileName) : null;
    
    let category: any = "system";
    if (data.type === "medicine" || data.type === "medication") category = "medication";
    else if (data.type === "hydration") category = "vitals";
    else if (data.type === "symptom") category = "alerts";
    else if (data.type === "dpss_sync" || data.type === "dpss_auto_complete") category = "system";

    let priority: any = "medium";
    if (category === "alerts") priority = "high";
    else if (category === "medication") priority = "medium";
    else if (category === "vitals") priority = "medium";
    else priority = "low";

    let deepLink = null;
    if (data.type === "medicine") deepLink = "/MedicationVault";
    else if (data.type === "hydration") deepLink = "/(tabs)/history?tab=hydration";
    else if (data.type === "symptom") deepLink = "/symptom-log";
    else if (data.type === "twin_reminder" || data.type === "dpss_sync") deepLink = "/(tabs)/twin";

    const { addNotificationDB } = await import("../database/notificationDB");
    await addNotificationDB({
      id: notification.id,
      title: notification.title || "Health Notification",
      message: notification.body || "",
      profileId,
      profileName,
      relationship: data.relationship ? String(data.relationship) : null,
      profilePhoto: data.profilePhoto ? String(data.profilePhoto) : null,
      category,
      priority,
      timestamp: new Date().toISOString(),
      deepLink,
      actionButtons: null,
    });
    log("💾 Automatically saved delivered notification to DB:", notification.id);
  } catch (err: any) {
    log("⚠️ Delivered notification already stored or ignored:", err.message || err);
  }
}

///////////////////////////////////////////////////////////
// FOREGROUND HANDLER
///////////////////////////////////////////////////////////

export function registerNotifeeForegroundHandler() {
  return notifee.onForegroundEvent(async ({ type, detail }) => {
    const notifId   = detail.notification?.id ?? "";
    const data      = detail.notification?.data ?? {};

    if (type === EventType.DELIVERED) {
      await saveDeliveredNotificationToDB(detail.notification);
      return;
    }

    // ── Handle Normal Notification Press ──────────────────────────
    if (type === EventType.PRESS) {
      log("🔔 Foreground Notification Tap (Press):", data);

      if (data.type === "routine_reminder" && data.tab) {
        router.push({
          pathname: "/(tabs)/history",
          params: { tab: data.tab }
        } as any);
      } else if (data.type === "twin_reminder") {
        router.push("/(tabs)/twin?triggerReminderPopup=true" as any);
      } else if (data.type === "medicine") {
        router.push("/MedicationVault" as any);
      } else if (data.type === "hydration") {
        router.push({
          pathname: "/(tabs)/history",
          params: { tab: "hydration" }
        } as any);
      } else if (data.type === "dpss_sync" || data.type === "dpss_auto_complete") {
        const pId = data.profileId;
        if (pId && pId !== "self") {
          router.push({
            pathname: "/family/member-details",
            params: { id: pId }
          } as any);
        } else {
          router.push("/profile" as any);
        }
      }

      if (notifId) {
        await notifee.cancelDisplayedNotification(notifId).catch(() => {});
      }
      return;
    }

    if (type !== EventType.ACTION_PRESS) return;

    const action    = detail.pressAction?.id;
    const medicineId = String(data.medicineId ?? "");
    const profileId = String(data.profileId ?? "self");
    const profileName = String(data.profileName ?? "");
    const medicineName = String(data.medicineName ?? "");
    const dose = String(data.dose ?? "");
    const time = String(data.time ?? "");
    const frequency = String(data.frequency ?? "");

    log("⚡ Foreground Action:", action, "notifId:", notifId, "medicineId:", medicineId, "profileId:", profileId);

    // ── Medicine: Taken ──────────────────────────────────────────
    if (action === ACTION_MEDICINE_TAKEN) {
      await handleMedicineTaken(notifId, medicineId, profileId, medicineName, dose, time, frequency);
      await scheduleInactivityReminder().catch(() => {});
      return;
    }

    // ── Medicine: Missed ──────────────────────────────────────────
    if (action === ACTION_MEDICINE_MISSED) {
      await handleMedicineMissed(notifId, medicineId, profileId, medicineName, dose, time);
      await scheduleInactivityReminder().catch(() => {});
      return;
    }

    // ── Medicine: Snooze ─────────────────────────────────────────
    if (action === ACTION_MEDICINE_SNOOZE) {
      await snoozeMedicine(
         detail.notification?.body || "Medicine reminder",
         medicineId,
         frequency || "daily",
         5,
         profileId,
         profileName,
         medicineName,
         dose,
         time
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
      try {
        const { addWaterFromNotification } = await import("../context/HydrationContext");
        await addWaterFromNotification(ml, profileId);
      } catch (err) {
        log("💧 HydrationContext import failed, writing directly to storage:", err);
        await saveWaterToStorage(ml);
      }
      await scheduleHydrationReminder(profileId, profileName);
      await scheduleInactivityReminder().catch(() => {});
      await notifee.cancelDisplayedNotification(notifId);
      return;
    }

    if (action === ACTION_WATER_SKIP) {
      const profileId = String(data.profileId || "self");
      const profileName = String(data.profileName || "");
      await scheduleHydrationReminder(profileId, profileName);
      await notifee.cancelDisplayedNotification(notifId);
      return;
    }

    // ── Symptom ──────────────────────────────────────────────────
    if (action === ACTION_SYMPTOM_DONE) {
      await cancelSymptomNotification();
      await scheduleInactivityReminder().catch(() => {});
      await notifee.cancelDisplayedNotification(notifId);
      return;
    }

    // ── DPSS: Sync Now ────────────────────────────────────────────────
    if (action === ACTION_DPSS_SYNC_NOW) {
      const userId = String(data.userId ?? "");
      const pId = data.profileId;
      if (userId) {
        try {
          const { runSimulation } = await import("./deferredSyncService");
          await runSimulation(userId, "user");
          log(`[DPSS] Sync triggered from notification for ${userId}`);
        } catch (e) {
          log("[DPSS] runSimulation from notification failed:", e);
        }
        if (pId && pId !== "self") {
          router.push({
            pathname: "/family/member-details",
            params: { id: pId }
          } as any);
        } else {
          router.push("/(tabs)/twin" as any);
        }
      }
      if (notifId) await notifee.cancelDisplayedNotification(notifId);
      return;
    }

    // ── DPSS: Undo ────────────────────────────────────────────────────
    if (action === ACTION_DPSS_UNDO) {
      const userId = String(data.userId ?? "");
      const pId = data.profileId;
      if (userId) {
        try {
          const { undoSimulation } = await import("./deferredSyncService");
          const res = await undoSimulation(userId);
          log(`[DPSS] Undo complete from notification: ${res.message}`);
        } catch (e) {
          log("[DPSS] undoSimulation from notification failed:", e);
        }
        if (pId && pId !== "self") {
          router.push({
            pathname: "/family/member-details",
            params: { id: pId }
          } as any);
        } else {
          router.push("/(tabs)/twin" as any);
        }
      }
      if (notifId) await notifee.cancelDisplayedNotification(notifId);
      return;
    }

    // ── DPSS: Dismiss ─────────────────────────────────────────────────
    if (action === ACTION_DPSS_DISMISS) {
      if (notifId) await notifee.cancelDisplayedNotification(notifId);
      return;
    }

    // Default dismiss
    if (notifId) await notifee.cancelDisplayedNotification(notifId);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// UNIFIED BACKGROUND EVENT HANDLER
// ─────────────────────────────────────────────────────────────────────────────
if (Platform.OS === "android") {
  notifee.onBackgroundEvent(async ({ type, detail }) => {
    if (type === EventType.DELIVERED) {
      await saveDeliveredNotificationToDB(detail.notification);
      return;
    }

    if (type !== EventType.ACTION_PRESS) return;

    const action     = detail.pressAction?.id;
    const notifId    = detail.notification?.id ?? "";
    const data       = detail.notification?.data ?? {};
    const medicineId = String(data.medicineId ?? "");

    log("🔔 [notifeeService] Unified Background Action:", action, "notifId:", notifId, "data:", data);

    if (action === "stop_tracking") {
      log("\u23f9 Stop Tracking pressed from background");
      // \u2705 FIX: Steps are ALWAYS tracked for the logged-in user (self), never for a
      // switched family member. Reading activeMemberId here caused the stop signal
      // to write to the wrong uid if the user had switched profiles before killing the app.
      // Use auth.currentUser uid as the canonical self-uid for the tracking key.
      const { auth: _auth } = await import("./firebase");
      const selfUid = _auth.currentUser?.uid || "self";
      const trackingKey = `step_is_tracking_v7_${selfUid}`;
      await AsyncStorage.setItem(trackingKey, "0");
      await notifee.stopForegroundService().catch(() => {});
      await notifee.cancelNotification("step_foreground_notif").catch(() => {});
      return;
    }

    if (action === ACTION_MEDICINE_TAKEN) {
      const profileId = String(data.profileId ?? "self");
      const medicineName = String(data.medicineName ?? "");
      const dose = String(data.dose ?? "");
      const time = String(data.time ?? "");
      const frequency = String(data.frequency ?? "");
      await handleMedicineTaken(notifId, medicineId, profileId, medicineName, dose, time, frequency);
      await scheduleInactivityReminder().catch(() => {});
      return;
    }

    if (action === ACTION_MEDICINE_MISSED) {
      const profileId = String(data.profileId ?? "self");
      const medicineName = String(data.medicineName ?? "");
      const dose = String(data.dose ?? "");
      const time = String(data.time ?? "");
      await handleMedicineMissed(notifId, medicineId, profileId, medicineName, dose, time);
      await scheduleInactivityReminder().catch(() => {});
      return;
    }

    if (action === ACTION_MEDICINE_SNOOZE) {
      const profileId = String(data.profileId ?? "self");
      const profileName = String(data.profileName ?? "");
      const medicineName = String(data.medicineName ?? "");
      const dose = String(data.dose ?? "");
      const time = String(data.time ?? "");
      const frequency = String(data.frequency ?? "daily");
      await snoozeMedicine(
        detail.notification?.body || "Medicine reminder",
        medicineId,
        frequency,
        5,
        profileId,
        profileName,
        medicineName,
        dose,
        time
      );
      await notifee.cancelDisplayedNotification(notifId);
      return;
    }

    if (
      action === ACTION_WATER_100 ||
      action === ACTION_WATER_150 ||
      action === ACTION_WATER_200
    ) {
      const ml =
        action === ACTION_WATER_100 ? 100
        : action === ACTION_WATER_150 ? 150
        : 200;
      const profileId = String(data.profileId || "self");
      const profileName = String(data.profileName || "");
      try {
        const { addWaterFromNotification } = await import("../context/HydrationContext");
        await addWaterFromNotification(ml, profileId);
      } catch (err) {
        log("💧 [BG] HydrationContext import failed, writing directly to storage:", err);
        await saveWaterToStorage(ml);
      }
      await scheduleHydrationReminder(profileId, profileName);
      await scheduleInactivityReminder().catch(() => {});
      await notifee.cancelDisplayedNotification(notifId);
      return;
    }

    if (action === ACTION_WATER_SKIP) {
      const profileId = String(data.profileId || "self");
      const profileName = String(data.profileName || "");
      await scheduleHydrationReminder(profileId, profileName);
      await notifee.cancelDisplayedNotification(notifId);
      return;
    }

    if (action === ACTION_SYMPTOM_DONE) {
      await cancelSymptomNotification();
      await scheduleInactivityReminder().catch(() => {});
      await notifee.cancelDisplayedNotification(notifId);
      return;
    }

    if (action === "SYMPTOM_NO" && data?.symptomId) {
      try {
        const { stopSymptomTracking } = await import("./reminderEngine");
        await stopSymptomTracking(Number(data.symptomId));
        await notifee.cancelNotification(notifId);
      } catch (e) {
        log("❌ [BG] SYMPTOM_NO error:", e);
      }
      return;
    }

    // ── DPSS: Sync Now (background) ──────────────────────────────────
    if (action === "DPSS_SYNC_NOW") {
      const userId = String((data as any).userId ?? "");
      if (userId) {
        try {
          const { runSimulation } = await import("./deferredSyncService");
          await runSimulation(userId, "user");
          log(`[DPSS] [BG] Sync triggered for ${userId}`);
        } catch (e) {
          log("[DPSS] [BG] runSimulation failed:", e);
        }
      }
      if (notifId) await notifee.cancelDisplayedNotification(notifId).catch(() => {});
      return;
    }

    // ── DPSS: Undo (background) ──────────────────────────────────────
    if (action === "DPSS_UNDO") {
      const userId = String((data as any).userId ?? "");
      if (userId) {
        try {
          const { undoSimulation } = await import("./deferredSyncService");
          await undoSimulation(userId);
          log(`[DPSS] [BG] Undo complete for ${userId}`);
        } catch (e) {
          log("[DPSS] [BG] undoSimulation failed:", e);
        }
      }
      if (notifId) await notifee.cancelDisplayedNotification(notifId).catch(() => {});
      return;
    }

    if (notifId) {
      await notifee.cancelDisplayedNotification(notifId).catch(() => {});
    }
  });
}


///////////////////////////////////////////////////////////
// 🧬 DPSS — DEFERRED PHYSIOLOGY SYNC NOTIFICATIONS
///////////////////////////////////////////////////////////

export const ACTION_DPSS_SYNC_NOW  = "DPSS_SYNC_NOW";
export const ACTION_DPSS_DISMISS   = "DPSS_DISMISS";
export const ACTION_DPSS_UNDO      = "DPSS_UNDO";

/**
 * Show a "Your physiology is ready to synchronize" notification.
 * Includes action buttons: Sync Now | Later
 */
export const showPhysioSyncReady = async (
  pendingCount: number,
  userId: string,
  notificationId?: string,
  customTitle?: string,
  customBody?: string,
  profileId?: string,
): Promise<string> => {
  const id = notificationId || `dpss_sync_ready_${userId}`;
  // Cancel any existing dpss_ready notification for this user first
  await notifee.cancelNotification(id).catch(() => {});

  await notifee.displayNotification({
    id,
    title: customTitle || "🧬 Physiology Ready to Sync",
    body: customBody || `You have ${pendingCount} unprocessed health event${pendingCount > 1 ? "s" : ""}. Synchronize your Digital Twin now.`,
    data: {
      type: "dpss_sync",
      userId,
      profileId: profileId || "",
      action: "open_twin",
    },
    android: {
      channelId: CHANNEL_ID,
      importance: AndroidImportance.HIGH,
      pressAction: { id: "default" },
      actions: [
        {
          title: "🚀 Sync Now",
          pressAction: { id: ACTION_DPSS_SYNC_NOW },
        },
        {
          title: "Later",
          pressAction: { id: ACTION_DPSS_DISMISS, launchActivity: "none" },
        },
      ],
    },
  });

  log(`[DPSS] Sync ready notification shown for ${userId} (pending=${pendingCount})`);
  return id;
};

/**
 * Show a notification after an automatic midnight sync completes.
 */
export const showAutoSyncCompleted = async (
  userId: string,
  simDate: string,
  customTitle?: string,
  customBody?: string,
  profileId?: string,
): Promise<void> => {
  const id = `dpss_auto_complete_${userId}_${simDate}`;
  await notifee.displayNotification({
    id,
    title: customTitle || "✅ Digital Twin Auto-Synced",
    body: customBody || `Your physiology for ${simDate} was automatically synchronized overnight.`,
    data: {
      type: "dpss_auto_complete",
      userId,
      profileId: profileId || "",
      action: "open_twin",
    },
    android: {
      channelId: CHANNEL_ID,
      pressAction: { id: "default" },
      actions: [
        {
          title: "⏪ Undo & Review",
          pressAction: { id: ACTION_DPSS_UNDO },
        },
        {
          title: "✔ Got it",
          pressAction: { id: ACTION_DPSS_DISMISS, launchActivity: "none" },
        },
      ],
    },
  });
  log(`[DPSS] Auto-sync complete notification for ${userId} (${simDate})`);
};

/**
 * Show an undo-success notification.
 */
export const showSimUndone = async (userId: string): Promise<void> => {
  const id = `dpss_undone_${userId}_${Date.now()}`;
  await notifee.displayNotification({
    id,
    title: "⏪ Simulation Rolled Back",
    body: "Your Digital Twin was restored to the previous checkpoint. Edit your events and re-run when ready.",
    data: { type: "dpss_sync", userId, action: "open_twin" },
    android: {
      channelId: CHANNEL_ID,
      pressAction: { id: "default" },
    },
  });
};

/**
 * Show a simulation failed notification.
 */
export const showSimFailed = async (
  userId: string,
  simDate: string,
  customTitle?: string,
  customBody?: string,
  profileId?: string,
): Promise<void> => {
  const id = `dpss_failed_${userId}_${simDate}`;
  await notifee.displayNotification({
    id,
    title: customTitle || "❌ Sync Failed",
    body: customBody || `The Digital Twin sync for ${simDate} encountered an error. Tap to retry manually.`,
    data: { type: "dpss_sync", userId, profileId: profileId || "", action: "open_twin" },
    android: {
      channelId: CHANNEL_ID,
      importance: AndroidImportance.HIGH,
      pressAction: { id: "default" },
      actions: [
        { title: "Retry", pressAction: { id: ACTION_DPSS_SYNC_NOW } },
      ],
    },
  });
};

/**
 * Cancel all DPSS notifications for a user.
 */
export const cancelDPSSNotifications = async (userId: string): Promise<void> => {
  try {
    const displayed = await notifee.getDisplayedNotifications();
    for (const n of displayed) {
      if ((n.notification?.data as any)?.userId === userId &&
          String(n.notification?.data?.type ?? "").startsWith("dpss")) {
        await notifee.cancelNotification(n.notification!.id!);
      }
    }
  } catch (err) {
    log("[DPSS] cancelDPSSNotifications error:", err);
  }
};