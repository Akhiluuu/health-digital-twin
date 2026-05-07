// database/medicineDB.ts
// Uses the unified vital_health.db via shared connection from index.ts

import { db } from "./index";

///////////////////////////////////////////////////////////
// TYPE
///////////////////////////////////////////////////////////

export interface Medicine {
  id: number;
  name: string;
  dose: string;
  type: string;
  time: string;
  timestamp: number;
  meal: string;
  frequency: string;
  startDate: string;
  endDate: string;
  reminder: number;
  notificationId: string;
  taken: number;
}

///////////////////////////////////////////////////////////
// INIT — no-op: table created by initAllTables in schema.ts
///////////////////////////////////////////////////////////

export async function initMedicineDB() {
  // Table is already created by initAllTables(). Nothing to do here.
  console.log("💊 Medicine DB ready (shared vital_health.db)");
}

///////////////////////////////////////////////////////////
// ADD
///////////////////////////////////////////////////////////

export function addMedicine(
  name: string,
  dose: string,
  type: string,
  time: string,
  timestamp: number,
  meal: string,
  frequency: string,
  startDate: string,
  endDate: string,
  reminder: number,
  notificationId: string | null
) {
  db.runSync(
    `INSERT INTO medicines
    (name, dose, type, time, timestamp, meal, frequency, startDate, endDate, reminder, notificationId, taken)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [name, dose, type, time, timestamp, meal, frequency, startDate, endDate, reminder, notificationId]
  );
}

///////////////////////////////////////////////////////////
// GET ALL
///////////////////////////////////////////////////////////

export function getMedicines(): Medicine[] {
  return db.getAllSync<Medicine>("SELECT * FROM medicines ORDER BY timestamp ASC");
}

///////////////////////////////////////////////////////////
// DELETE
///////////////////////////////////////////////////////////

export function deleteMedicine(id: number) {
  db.runSync("DELETE FROM medicines WHERE id = ?", [id]);
}

///////////////////////////////////////////////////////////
// UPDATE NOTIFICATION ID
///////////////////////////////////////////////////////////

export function updateMedicineNotificationId(id: number, notificationId: string) {
  db.runSync("UPDATE medicines SET notificationId = ? WHERE id = ?", [notificationId, id]);
}

///////////////////////////////////////////////////////////
// MARK TAKEN (BY ID)
///////////////////////////////////////////////////////////

export async function markMedicineTaken(medicineId: string) {
  try {
    await db.runAsync("UPDATE medicines SET taken = 1 WHERE id = ?", [medicineId]);
    console.log("✅ Medicine marked as taken:", medicineId);
  } catch (error) {
    console.log("❌ Error marking medicine:", error);
  }
}

///////////////////////////////////////////////////////////
// MARK TAKEN (BY NOTIFICATION ID)
///////////////////////////////////////////////////////////

export function markMedicineTakenByNotificationId(notificationId: string) {
  db.runSync("UPDATE medicines SET taken = 1 WHERE notificationId = ?", [notificationId]);
}

///////////////////////////////////////////////////////////
// SAVE HISTORY
///////////////////////////////////////////////////////////

export async function saveMedicineHistory(medicineId: string) {
  try {
    const date = new Date().toISOString();
    await db.runAsync(
      "INSERT INTO medicine_history (medicineId, takenAt) VALUES (?, ?)",
      [medicineId, date]
    );
    console.log("📊 Medicine history saved");
  } catch (error) {
    console.log("❌ History error:", error);
  }
}

///////////////////////////////////////////////////////////
// MARK MISSED
///////////////////////////////////////////////////////////

export async function markMissedMedicines() {
  try {
    const now = Date.now();
    await db.runAsync(
      "UPDATE medicines SET taken = -1 WHERE timestamp < ? AND taken = 0",
      [now]
    );
    console.log("⚠️ Missed medicines updated");
  } catch (error) {
    console.log("❌ Missed update error:", error);
  }
}

///////////////////////////////////////////////////////////
// TODAY STATS
///////////////////////////////////////////////////////////

export async function getTodayMedicineStats() {
  try {
    const taken: any = await db.getFirstAsync("SELECT COUNT(*) as count FROM medicines WHERE taken = 1");
    const missed: any = await db.getFirstAsync("SELECT COUNT(*) as count FROM medicines WHERE taken = -1");
    return { taken: taken?.count || 0, missed: missed?.count || 0 };
  } catch (error) {
    console.log("❌ Stats error:", error);
    return { taken: 0, missed: 0 };
  }
}

///////////////////////////////////////////////////////////
// GET BY NOTIFICATION ID
///////////////////////////////////////////////////////////

export function getMedicineByNotificationId(notificationId: string): Medicine | null {
  try {
    const result = db.getAllSync<Medicine>(
      "SELECT * FROM medicines WHERE notificationId = ?",
      [notificationId]
    );
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.log("❌ getMedicineByNotificationId error:", error);
    return null;
  }
}

///////////////////////////////////////////////////////////
// DELETE BY NOTIFICATION ID
///////////////////////////////////////////////////////////

export function deleteMedicineByNotificationId(notificationId: string) {
  try {
    db.runSync("DELETE FROM medicines WHERE notificationId = ?", [notificationId]);
    console.log("🗑 Deleted medicine by notificationId");
  } catch (error) {
    console.log("❌ deleteMedicineByNotificationId error:", error);
  }
}

export { db };