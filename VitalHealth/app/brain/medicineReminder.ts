// app/brain/medicineReminder.ts
// Now uses Notifee for 100% reliable notification buttons

import {
  cancelMedicineNotification,
  scheduleMedicineDaily,
  scheduleMedicineOnce,
  snoozeMedicine,
} from "../../services/notifeeService";

export const setupMedicineNotificationChannel = async () => {
  // Handled by notifeeService.setupNotifee()
  console.log("💊 Medicine channel handled by Notifee");
};

export const registerMedicineNotificationActions = async () => {
  // Handled by notifeeService — actions defined in createTriggerNotification
  console.log("💊 Medicine actions handled by Notifee");
};

export const scheduleOneTimeMedicineReminder = async (
  title: string,
  date:  Date,
  medicineId?: number
): Promise<string> => {
  return scheduleMedicineOnce(title, date, medicineId);
};

export const scheduleDailyMedicineReminder = async (
  title:  string,
  hour:   number,
  minute: number,
  medicineId?: number
): Promise<string> => {
  return scheduleMedicineDaily(title, hour, minute, medicineId);
};

export const snoozeMedicineReminder = async (
  title:   string,
  minutes: number = 10
): Promise<string> => {
  return snoozeMedicine(title, "", "daily", minutes);
};

export { cancelMedicineNotification };
