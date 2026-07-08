// utils/medicineHistory.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { MedicineHistoryEntry } from "../app/MedicineHistory";
import { syncAddMedicineHistory } from "../services/firebaseSync";
import { getLocalDateString } from "./twinUtils";

const HISTORY_STORAGE_KEY = "medicine_history";

export const addToMedicineHistory = async (
  medicine: Omit<MedicineHistoryEntry, "id" | "date" | "takenAt"> & { targetUid?: string }
): Promise<MedicineHistoryEntry> => {
  try {
    const isMember = medicine.targetUid && medicine.targetUid !== "self";
    let history: MedicineHistoryEntry[] = [];

    if (!isMember) {
      const existing = await AsyncStorage.getItem(HISTORY_STORAGE_KEY);
      if (existing) { try { const p = JSON.parse(existing); if (Array.isArray(p)) history = p; } catch {} }
    }

    const now = new Date();

    const newEntry: MedicineHistoryEntry = {
      id:           `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      medicineId:   medicine.medicineId,
      medicineName: medicine.medicineName,
      dose:         medicine.dose,
      time:         medicine.time,
      status:       medicine.status,
      date:         getLocalDateString(now),
      takenAt:      now.toISOString(),
    };

    if (!isMember) {
      // Add newest at top
      history.unshift(newEntry);

      // Keep only last 200 records
      if (history.length > 200) history = history.slice(0, 200);

      // 1️⃣ Save locally
      await AsyncStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    }

    // 2️⃣ ✅ Sync to Firebase in background
    syncAddMedicineHistory({
      id:           newEntry.id,
      medicineId:   newEntry.medicineId,
      medicineName: newEntry.medicineName,
      dose:         newEntry.dose,
      time:         newEntry.time,
      status:       newEntry.status,
      date:         newEntry.date,
      takenAt:      newEntry.takenAt,
    }, medicine.targetUid);

    console.log("💊 Medicine history saved & synced to Firebase:", newEntry.medicineName, newEntry.status);

    return newEntry;
  } catch (error) {
    console.error("Error adding to medicine history:", error);
    throw error;
  }
};

export const getMedicineHistory = async (): Promise<MedicineHistoryEntry[]> => {
  try {
    const data = await AsyncStorage.getItem(HISTORY_STORAGE_KEY);
    if (!data) return [];
    try { const p = JSON.parse(data); return Array.isArray(p) ? p : []; } catch { return []; }
  } catch (error) {
    console.error("Error loading medicine history:", error);
    return [];
  }
};

export const clearMedicineHistory = async () => {
  try {
    await AsyncStorage.removeItem(HISTORY_STORAGE_KEY);
  } catch (error) {
    console.error("Error clearing medicine history:", error);
    throw error;
  }
};