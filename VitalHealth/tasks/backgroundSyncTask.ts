import AsyncStorage from "@react-native-async-storage/async-storage";
import { syncStepsData, fetchMedicinesFromFirebase, syncAddMedicine } from "../services/firebaseSync";
import { getMedicines } from "../database/medicineDB";

export async function runBackgroundSync() {
  console.log("🔄 Running BackgroundSyncTask...");
  
  // 1. Sync steps
  try {
    const STORAGE_KEY = "vitalhealth_steps_v2";
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      const todayStr = new Date().toISOString().slice(0, 10);
      if (d.lastReset === todayStr) {
        await syncStepsData({
          steps: d.steps ?? 0,
          goal: d.goal ?? 10000,
          isTracking: true,
          lastMoveTs: d.lastMoveTime ?? Date.now(),
          date: todayStr
        });
        console.log("✅ Background step sync successful");
      }
    }
  } catch (e) {
    console.error("❌ Background step sync failed:", e);
  }

  // 2. Sync medicines (SQLite -> Firebase)
  try {
    const localMeds = getMedicines();
    if (localMeds && localMeds.length > 0) {
      const firebaseMeds = await fetchMedicinesFromFirebase();
      const fbIds = new Set(firebaseMeds?.map((fm: any) => fm.id) || []);
      
      for (const lm of localMeds) {
        if (!fbIds.has(lm.id)) {
          await syncAddMedicine({
            id: lm.id,
            name: lm.name,
            dose: lm.dose,
            type: lm.type,
            time: lm.time,
            timestamp: lm.timestamp,
            meal: lm.meal,
            frequency: lm.frequency,
            startDate: lm.startDate,
            endDate: lm.endDate,
            reminder: lm.reminder,
            notificationId: lm.notificationId,
            reviewInterval: lm.reviewInterval,
            nextReviewDate: lm.nextReviewDate,
            reviewStatus: lm.reviewStatus,
          });
        }
      }
    }
    console.log("✅ Background medicine sync successful");
  } catch (e) {
    console.error("❌ Background medicine sync failed:", e);
  }

  // 3. Trigger the Personal Health Intelligence Engine (PIE)
  try {
    const STORAGE_KEY = "vitalhealth_steps_v2";
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    let steps = 0;
    let goal = 8000;
    if (raw) {
      const d = JSON.parse(raw);
      steps = d.steps ?? 0;
      goal = d.goal ?? 8000;
    }
    const { runPIEOrchestrator } = await import("../services/pie/PersonalIntelligenceEngine");
    await runPIEOrchestrator(steps, goal);
    console.log("✅ PIE Orchestrator background run successful");
  } catch (e) {
    console.error("❌ PIE Orchestrator background run failed:", e);
  }
}
