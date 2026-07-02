// database/hydrationReminder.ts

import { scheduleNotification } from "../services/notificationService";

import { log, error } from "../utils/logger";

// ======================================================
// SCHEDULE HYDRATION REMINDER
// ======================================================
export const scheduleHydrationReminder = async (
  hour: number,
  minute: number
) => {
  try {
    const now = new Date();
    const triggerDate = new Date();

    triggerDate.setHours(hour);
    triggerDate.setMinutes(minute);
    triggerDate.setSeconds(0);
    triggerDate.setMilliseconds(0);

    // If time already passed → schedule for tomorrow
    if (triggerDate.getTime() <= now.getTime()) {
      triggerDate.setDate(triggerDate.getDate() + 1);
    }

    const timestamp = triggerDate.getTime();

    // ✅ Schedule notification
    await scheduleNotification(
      "💧 Hydration Reminder",
      "Time to drink water!",
      "hydration",
      timestamp,
      undefined
    );

    log(
      `💧 Hydration reminder scheduled at ${hour}:${minute}`
    );
  } catch (err: unknown) {
    error("❌ Error scheduling hydration reminder:", err);
  }
};