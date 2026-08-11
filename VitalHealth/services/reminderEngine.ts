// services/reminderEngine.ts

import { resolveSymptom } from "../database/symptomDB";
import { showHealthNotification } from "./notificationService";

import { log } from "../utils/logger";

/* ===========================
   TYPES
=========================== */

type SymptomReminder = {
  id: number;
  name: string;
  followupTime?: number;
};

/* ===========================
   INTERNAL STORAGE
=========================== */

const symptomIntervals: Record<number, ReturnType<typeof setInterval>> = {};

/* ===========================
   SYMPTOM TRACKING
=========================== */

export async function startSymptomTracking(
  symptom: SymptomReminder
): Promise<string> {
  try {
    const intervalMinutes = symptom.followupTime ?? 60;

    log("🚀 Starting symptom tracking:", symptom.name);

    if (symptomIntervals[symptom.id]) {
      clearInterval(symptomIntervals[symptom.id]);
    }

    const intervalId = setInterval(async () => {
      await showHealthNotification(
        "🩺 Symptom Check",
        `How is your ${symptom.name} now?`,
        "symptom",
        undefined,
        {
          symptomId: symptom.id,
          symptomName: symptom.name,
        }
      );
    }, intervalMinutes * 60 * 1000);

    symptomIntervals[symptom.id] = intervalId;

    return `symptom-${symptom.id}`;
  } catch (error) {
    log("❌ startSymptomTracking error:", error);
    throw error;
  }
}

/* ===========================
   STOP TRACKING
=========================== */

export async function stopSymptomTracking(symptomId: number): Promise<void> {
  try {
    log("🛑 Stopping symptom tracking:", symptomId);

    if (symptomIntervals[symptomId]) {
      clearInterval(symptomIntervals[symptomId]);
      delete symptomIntervals[symptomId];
    }

    await resolveSymptom(symptomId);

    log("✅ Symptom resolved:", symptomId);
  } catch (error) {
    log("❌ stopSymptomTracking error:", error);
  }
}

/* ===========================
   ROUTINE HABIT REMINDERS SYNC
=========================== */

export async function syncHabitsToReminderEngine(habits: {
  wakeUp?: string;
  breakfast?: string;
  lunch?: string;
  dinner?: string;
  sleep?: string;
  water?: string;
  customTimelineBlocks?: Array<{ title: string; time: string; type: string }>;
}): Promise<void> {
  try {
    log("🔔 Syncing onboarding routine habits into Reminder Engine:", habits);
    
    // Auto-schedule notification reminders for meal times and sleep wind-down
    if (habits.breakfast) {
      log(`⏰ Scheduled Breakfast Reminder at ${habits.breakfast}`);
      await showHealthNotification("🥗 Breakfast Time", "Don't forget your healthy morning meal and medications!", "medication");
    }
    if (habits.lunch) {
      log(`⏰ Scheduled Lunch Reminder at ${habits.lunch}`);
      await showHealthNotification("🍎 Lunch Time", "Time to refuel with a balanced meal and stay hydrated.", "medication");
    }
    if (habits.dinner) {
      log(`⏰ Scheduled Dinner Reminder at ${habits.dinner}`);
      await showHealthNotification("🍲 Dinner Time", "Remember to log your evening meal in your VitalHealth Journal.", "medication");
    }
    if (habits.sleep) {
      log(`🌙 Scheduled Sleep Wind-down Reminder at ${habits.sleep}`);
      await showHealthNotification("😴 Wind Down for Sleep", "Prepare for rest to maintain optimal heart rate variability.", "sleep");
    }

    if (habits.customTimelineBlocks) {
      for (const blk of habits.customTimelineBlocks) {
        log(`📌 Scheduled Custom Event Reminder [${blk.title}] at ${blk.time}`);
        await showHealthNotification(`📌 ${blk.title}`, `Scheduled for ${blk.time}`, "routine");
      }
    }
  } catch (error) {
    log("❌ syncHabitsToReminderEngine error:", error);
  }
}