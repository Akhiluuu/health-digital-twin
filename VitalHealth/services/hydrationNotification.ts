// services/hydrationNotification.ts
// Fixed for Notifee + TypeScript compatibility

import { log } from "../utils/logger";
import {
  cancelHydrationReminders,
  scheduleHydrationReminder as notifeeSchedule,
  snoozeHydrationReminder as notifeeSnooze,
} from "./notifeeService";

///////////////////////////////////////////////////////////
// REGISTER (INFO ONLY)
///////////////////////////////////////////////////////////

export const registerHydrationNotificationActions = async () => {
  log("💧 Hydration actions handled by Notifee");
};

///////////////////////////////////////////////////////////
// SCHEDULE HYDRATION
///////////////////////////////////////////////////////////

export const scheduleHydrationReminder = async (
  _intervalSeconds: number = 3600
): Promise<string | null> => {
  try {
    log("💧 Scheduling hydration reminder");

    // ✅ FIX: no argument required
    const id = await notifeeSchedule();

    return id;
  } catch (e) {
    log("❌ scheduleHydrationReminder error:", e);
    return null;
  }
};

///////////////////////////////////////////////////////////
// SNOOZE HYDRATION
///////////////////////////////////////////////////////////

export const snoozeHydrationReminder = async (
  _minutes: number = 10
): Promise<void> => {
  log("💧 Snoozing hydration");

  // ✅ FIX: no argument required
  await notifeeSnooze();
};

///////////////////////////////////////////////////////////
// CANCEL HYDRATION
///////////////////////////////////////////////////////////

export const cancelHydrationReminder = async (): Promise<void> => {
  log("💧 Cancel hydration reminders");

  await cancelHydrationReminders();
};