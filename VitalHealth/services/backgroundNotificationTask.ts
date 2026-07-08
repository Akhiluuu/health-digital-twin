import notifee, { TriggerType } from '@notifee/react-native';
import AsyncStorage from "@react-native-async-storage/async-storage";

import { log } from "../utils/logger";

///////////////////////////////////////////////////////////
// HELPER — Hydration Key
///////////////////////////////////////////////////////////

const getTodayHydrationKey = (): string => {
  const d = new Date();
  return `hydration-${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

type Medicine = {
  id: number;
  name: string;
  dose: string;
  time: string;
  frequency: string;
  notificationId?: string;
};

///////////////////////////////////////////////////////////
// HELPER — Save Water
///////////////////////////////////////////////////////////

const addWaterToStorage = async (ml: number): Promise<void> => {
  try { 
    const key = getTodayHydrationKey();
    const saved = await AsyncStorage.getItem(key);
    const current = saved ? Number(saved) : 0;
    const newValue = current + ml;

    await AsyncStorage.setItem(key, String(newValue));

    log(`💧 [BG] Water saved: ${ml}ml (total: ${newValue}ml)`);
  } catch (err) {
    log("💧 [BG] Failed to save water:", err);
  }
};

///////////////////////////////////////////////////////////
// 🔥 BACKGROUND EVENT HANDLER (NOTIFEE)
// Works even when app is killed
///////////////////////////////////////////////////////////

notifee.onBackgroundEvent(async ({ type, detail }) => {
  const { notification, pressAction } = detail;

  if (!notification || !pressAction) {
    log("❌ [BG] Missing notification/action");
    return;
  }

  const action = pressAction.id;
  const notificationId = notification.id ?? "";

  const notifData = notification.data as {
    type?: string;
    schedule?: string;
    symptomId?: number;
    symptomName?: string;
  };

  log("📬 [BG] Action:", action, "| Type:", notifData?.type);

  ///////////////////////////////////////////////////
  // 💊 MEDICINE ACTIONS
  ///////////////////////////////////////////////////

  if (notifData?.type === "medicine_reminder" || notifData?.type === "medicine") {
    const profileId = String((notification.data as any)?.profileId || "self");
    const isMember = profileId && profileId !== "self";

    if (action === "MEDICINE_TAKEN") {
      try {
        const { syncUpdateMedicineStatus, syncDeleteMedicine } = await import("./firebaseSync");
        const { addToMedicineHistory } = await import("../utils/medicineHistory");

        if (isMember) {
          const medId = (notification.data as any)?.medicineId;
          const medIdNum = parseInt(String(medId), 10);
          const medicineName = String((notification.data as any)?.medicineName || "Medication");
          const dose = String((notification.data as any)?.dose || "");
          const time = String((notification.data as any)?.time || "");
          const freq = String((notification.data as any)?.frequency || "");

          await addToMedicineHistory({
            medicineId: medIdNum,
            medicineName,
            dose,
            time,
            status: "taken",
            targetUid: profileId,
          });

          await syncUpdateMedicineStatus(medIdNum, "taken", profileId);

          if (freq.toLowerCase() === "once") {
            await syncDeleteMedicine(medIdNum, profileId);
            await notifee.cancelNotification(notificationId);
          } else {
            await notifee.cancelNotification(notificationId);
          }
        } else {
          const {
            getMedicineByNotificationId,
            markMedicineTakenByNotificationId,
            deleteMedicineByNotificationId,
          } = await import("../database/medicineDB");

          const medicine = getMedicineByNotificationId(notificationId) as Medicine | null;

          if (medicine) {
            await addToMedicineHistory({
              medicineId: medicine.id,
              medicineName: medicine.name,
              dose: medicine.dose,
              time: medicine.time,
              status: "taken",
            });

            if (medicine.frequency?.toLowerCase() === "once") {
              deleteMedicineByNotificationId(notificationId);
              log("💊 [BG] One-time medicine deleted");
            } else {
              markMedicineTakenByNotificationId(notificationId);
              await syncUpdateMedicineStatus(medicine.id, "taken");
              log("💊 [BG] Daily medicine marked taken");
            }
          }
          await notifee.cancelNotification(notificationId);
        }

        log("✅ [BG] MEDICINE_TAKEN handled");

      } catch (e) {
        log("❌ [BG] MEDICINE_TAKEN error:", e);
      }
      return;
    }

    if (action === "MEDICINE_MISSED") {
      try {
        const { syncUpdateMedicineStatus } = await import("./firebaseSync");
        const { addToMedicineHistory } = await import("../utils/medicineHistory");

        if (isMember) {
          const medId = (notification.data as any)?.medicineId;
          const medIdNum = parseInt(String(medId), 10);
          const medicineName = String((notification.data as any)?.medicineName || "Medication");
          const dose = String((notification.data as any)?.dose || "");
          const time = String((notification.data as any)?.time || "");

          await addToMedicineHistory({
            medicineId: medIdNum,
            medicineName,
            dose,
            time,
            status: "missed",
            targetUid: profileId,
          });

          await syncUpdateMedicineStatus(medIdNum, "missed", profileId);
        } else {
          const {
            getMedicineByNotificationId,
            markMedicineMissedByNotificationId,
          } = await import("../database/medicineDB");

          const medicine = getMedicineByNotificationId(notificationId) as Medicine | null;

          if (medicine) {
            await addToMedicineHistory({
              medicineId: medicine.id,
              medicineName: medicine.name,
              dose: medicine.dose,
              time: medicine.time,
              status: "missed",
            });

            markMedicineMissedByNotificationId(notificationId);
            await syncUpdateMedicineStatus(medicine.id, "missed");
            log("💊 [BG] Daily medicine marked missed");
          }
        }

        await notifee.cancelNotification(notificationId);

        log("✅ [BG] MEDICINE_MISSED handled");

      } catch (e) {
        log("❌ [BG] MEDICINE_MISSED error:", e);
      }
      return;
    }

    if (action === "MEDICINE_SNOOZE") {
      try {
        const body = notification.body ?? "Take your medicine";
        const medId = String((notification.data as any)?.medicineId || "");
        const freq = String((notification.data as any)?.frequency || "daily");
        const medicineName = String((notification.data as any)?.medicineName || "");
        const dose = String((notification.data as any)?.dose || "");
        const time = String((notification.data as any)?.time || "");
        const profileName = String((notification.data as any)?.profileName || "");

        await notifee.createTriggerNotification(
          {
            title: profileName ? `💊 Snoozed Reminder (${profileName})` : "💊 Snoozed Reminder",
            body,
            data: {
              type: "medicine_reminder",
              medicineId: medId,
              frequency: freq,
              profileId,
              profileName,
              medicineName,
              dose,
              time,
            },
            android: {
              channelId: "health",
              actions: [
                { title: "Taken", pressAction: { id: "MEDICINE_TAKEN" } },
                { title: "Missed", pressAction: { id: "MEDICINE_MISSED" } },
                { title: "Snooze", pressAction: { id: "MEDICINE_SNOOZE" } },
              ],
            },
          },
          {
            type: TriggerType.TIMESTAMP,
            timestamp: Date.now() + 10 * 60 * 1000,
          }
        );

        await notifee.cancelNotification(notificationId);

        log("⏰ [BG] Medicine snoozed");

      } catch (e) {
        log("❌ [BG] MEDICINE_SNOOZE error:", e);
      }
      return;
    }
  }

  ///////////////////////////////////////////////////
  // 💧 HYDRATION ACTIONS
  ///////////////////////////////////////////////////

  if (notifData?.type === "hydration_reminder") {

    if (action === "HYDRATION_100") {
      await addWaterToStorage(100);
      await notifee.cancelNotification(notificationId);
      log("✅ [BG] HYDRATION_100 handled");
      return;
    }

    if (action === "HYDRATION_150") {
      await addWaterToStorage(150);
      await notifee.cancelNotification(notificationId);
      log("✅ [BG] HYDRATION_150 handled");
      return;
    }

    if (action === "HYDRATION_SNOOZE") {
      try {
        await notifee.createTriggerNotification(
          {
            title: "💧 Snoozed Hydration",
            body: "Drink water now!",
            data: { type: "hydration_reminder" },
            android: {
              channelId: "health",
            },
          },
          {
            type: TriggerType.TIMESTAMP,
            timestamp: Date.now() + 10 * 60 * 1000,
          }
        );

        await notifee.cancelNotification(notificationId);

        log("⏰ [BG] Hydration snoozed");

      } catch (e) {
        log("❌ [BG] HYDRATION_SNOOZE error:", e);
      }
      return;
    }
  }

  ///////////////////////////////////////////////////
  // 🩺 SYMPTOM ACTIONS
  ///////////////////////////////////////////////////

  if (notifData?.type === "symptom_reminder") {

    if (action === "SYMPTOM_NO" && notifData?.symptomId) {
      try {
        const { stopSymptomTracking } =
          await import("../services/reminderEngine");

        await stopSymptomTracking(notifData.symptomId);

        await notifee.cancelNotification(notificationId);

        log("✅ [BG] SYMPTOM_NO handled");

      } catch (e) {
        log("❌ [BG] SYMPTOM_NO error:", e);
      }
      return;
    }

    if (action === "SYMPTOM_YES") {
      log("📬 [BG] SYMPTOM_YES → app will open");
      return;
    }
  }

  log("⚠️ [BG] Unhandled action:", action);
});