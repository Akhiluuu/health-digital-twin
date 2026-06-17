// services/notificationService.ts

import { addWaterFromNotification } from "../context/HydrationContext";

////////////////////////////////////////////////////////////
// TYPES
////////////////////////////////////////////////////////////

type NotificationType = "medicine" | "hydration" | "symptom";

////////////////////////////////////////////////////////////
// SAFE NOTIFEE IMPORT (won't crash in Expo Go)
////////////////////////////////////////////////////////////

let notifee: any = null;
let AndroidImportance: any = { HIGH: 4 };
let TriggerType: any = { TIMESTAMP: 0 };
let EventType: any = { ACTION_PRESS: 2 };

try {
  const notifeeModule = require("@notifee/react-native");
  notifee = notifeeModule.default;
  AndroidImportance = notifeeModule.AndroidImportance;
  TriggerType = notifeeModule.TriggerType;
  EventType = notifeeModule.EventType;
  console.log("✅ Notifee loaded successfully");
} catch (error) {
  console.warn("⚠️ Notifee not available — notifications disabled (Expo Go)");
}

const isNotifeeAvailable = () => {
  if (!notifee) {
    console.warn("⚠️ Notifee not available, skipping...");
    return false;
  }
  return true;
};

////////////////////////////////////////////////////////////
// CANCEL NOTIFICATION
////////////////////////////////////////////////////////////

export const cancelMedicineNotification = async (notificationId: string) => {
  if (!isNotifeeAvailable()) return;
  try {
    if (!notificationId) return;
    await notifee.cancelNotification(notificationId);
    console.log("🔕 Notification cancelled:", notificationId);
  } catch (error) {
    console.log("❌ Cancel notification error:", error);
  }
};

////////////////////////////////////////////////////////////
// REQUEST PERMISSION
////////////////////////////////////////////////////////////

export const requestPermission = async () => {
  if (!isNotifeeAvailable()) return;
  await notifee.requestPermission();
};

////////////////////////////////////////////////////////////
// CREATE CHANNEL
////////////////////////////////////////////////////////////

export const createChannel = async () => {
  if (!isNotifeeAvailable()) return "health";
  return await notifee.createChannel({
    id: "health",
    name: "Health Alerts",
    importance: AndroidImportance.HIGH,
  });
};

////////////////////////////////////////////////////////////
// ACTIONS
////////////////////////////////////////////////////////////

const getActions = (type: NotificationType) => {
  if (type === "medicine") {
    return [
      {
        title: "✅ Taken",
        pressAction: { id: "MEDICINE_TAKEN", launchActivity: "none" },
      },
      {
        title: "⏰ Snooze",
        pressAction: { id: "MEDICINE_SNOOZE", launchActivity: "none" },
      },
    ];
  }

  if (type === "hydration") {
    return [
      {
        title: "💧 +100ml",
        pressAction: { id: "HYDRATION_100", launchActivity: "none" },
      },
      {
        title: "⏰ Snooze",
        pressAction: { id: "HYDRATION_SNOOZE", launchActivity: "none" },
      },
    ];
  }

  if (type === "symptom") {
    return [
      {
        title: "😊 Better",
        pressAction: { id: "SYMPTOM_NO", launchActivity: "none" },
      },
      {
        title: "🤒 Still Sick",
        pressAction: { id: "SYMPTOM_YES", launchActivity: "none" },
      },
    ];
  }

  return [];
};

////////////////////////////////////////////////////////////
// SHOW NOTIFICATION
////////////////////////////////////////////////////////////

export const showHealthNotification = async (
  title: string,
  body: string,
  type: NotificationType,
  data: any = {}
) => {
  if (!isNotifeeAvailable()) return;

  const channelId = await createChannel();

  await notifee.displayNotification({
    title,
    body,
    data: { type, ...data },
    android: {
      channelId,
      pressAction: { id: "default" },
      actions: getActions(type),
    },
  });
};

////////////////////////////////////////////////////////////
// SCHEDULE NOTIFICATION
////////////////////////////////////////////////////////////

export const scheduleNotification = async (
  title: string,
  body: string,
  type: NotificationType,
  timestamp: number,
  data: any = {}
) => {
  if (!isNotifeeAvailable()) return;

  const channelId = await createChannel();

  let triggerTime = timestamp;
  if (triggerTime <= Date.now()) {
    triggerTime += 24 * 60 * 60 * 1000;
  }

  console.log("⏰ Scheduling notification at:", new Date(triggerTime));

  await notifee.createTriggerNotification(
    {
      title,
      body,
      data: { type, ...data },
      android: {
        channelId,
        pressAction: { id: "default" },
        actions: getActions(type),
      },
    },
    {
      type: TriggerType.TIMESTAMP,
      timestamp: triggerTime,
      alarmManager: true,
    }
  );
};

////////////////////////////////////////////////////////////
// HANDLE ACTIONS
////////////////////////////////////////////////////////////

// Foreground
if (notifee) {
  notifee.onForegroundEvent(async ({ type, detail }: any) => {
    if (type === EventType.ACTION_PRESS) {
      const actionId = detail.pressAction?.id;
      console.log("🔔 Foreground Action:", actionId);

      if (actionId === "HYDRATION_100") {
        console.log("💧 Adding 100ml");
        addWaterFromNotification(100);
      }
    }
  });

}

export default notifee;