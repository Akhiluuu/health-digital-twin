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