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
  // ✅ NEW: date the `taken` flag was last set — used for daily reset
  takenDate: string | null;
}

///////////////////////////////////////////////////////////
// HELPERS
///////////////////////////////////////////////////////////

/** Returns today's date string in YYYY-MM-DD format (local time). */
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

///////////////////////////////////////////////////////////
// INIT — no-op: table created by initAllTables in schema.ts
///////////////////////////////////////////////////////////

export async function initMedicineDB() {
  // ✅ FIX: Add takenDate column if it doesn't exist yet (safe migration).
  //    This runs once and is a no-op on subsequent launches.
  try {
    db.runSync(
      `ALTER TABLE medicines ADD COLUMN takenDate TEXT DEFAULT NULL`
    );
    console.log("💊 Added takenDate column to medicines");
  } catch {
    // Column already exists — ignore the error
  }
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
    (name, dose, type, time, timestamp, meal, frequency, startDate, endDate, reminder, notificationId, taken, takenDate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)`,
    [name, dose, type, time, timestamp, meal, frequency, startDate, endDate, reminder, notificationId]
  );
}

///////////////////////////////////////////////////////////
// GET ALL
// ✅ FIX (Auto-tick Bug): `taken` is now date-scoped.
//    If takenDate is not today, we treat the medicine as NOT taken
//    in the returned data. This means daily medicines automatically
//    appear un-ticked each new day without any data mutation.
///////////////////////////////////////////////////////////

export function getMedicines(): Medicine[] {
  const today = todayStr();
  const rows = db.getAllSync<Medicine>("SELECT * FROM medicines ORDER BY timestamp ASC");

  return rows.map((med) => ({
    ...med,
    // ✅ Only show the tick if taken was set TODAY
    taken: med.takenDate === today ? med.taken : 0,
  }));
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
// ✅ FIX: Now also writes takenDate so getMedicines() can date-scope it.
///////////////////////////////////////////////////////////

export async function markMedicineTaken(medicineId: string) {
  try {
    const today = todayStr();
    await db.runAsync(
      "UPDATE medicines SET taken = 1, takenDate = ? WHERE id = ?",
      [today, medicineId]
    );
    console.log("✅ Medicine marked as taken:", medicineId);
  } catch (error) {
    console.log("❌ Error marking medicine:", error);
  }
}

///////////////////////////////////////////////////////////
// MARK TAKEN (BY NOTIFICATION ID)
// ✅ FIX: Now also writes takenDate.
//    This is the path triggered by the notification "Taken" button.
///////////////////////////////////////////////////////////

export function markMedicineTakenByNotificationId(notificationId: string) {
  const today = todayStr();
  db.runSync(
    "UPDATE medicines SET taken = 1, takenDate = ? WHERE notificationId = ?",
    [today, notificationId]
  );
  console.log("✅ markMedicineTakenByNotificationId — set taken for today:", today);
}

///////////////////////////////////////////////////////////
// RESET DAILY TAKEN
// ✅ NEW: Call this at app startup (in _layout.tsx after initMedicineDB).
//    Resets taken=0 for all DAILY medicines whose takenDate is not today.
//    ONE-TIME medicines keep their taken=1 permanently.
///////////////////////////////////////////////////////////

export function resetDailyTakenIfNewDay() {
  const today = todayStr();
  db.runSync(
    `UPDATE medicines
     SET taken = 0, takenDate = NULL
     WHERE frequency = 'daily'
       AND (takenDate IS NULL OR takenDate != ?)`,
    [today]
  );
  console.log("🔄 Daily medicines reset for:", today);
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
      "UPDATE medicines SET taken = -1 WHERE timestamp < ? AND taken = 0 AND frequency = 'once'",
      [now]
    );
    console.log("⚠️ Missed once-medicines updated");
  } catch (error) {
    console.log("❌ Missed update error:", error);
  }
}

///////////////////////////////////////////////////////////
// TODAY STATS
///////////////////////////////////////////////////////////

export async function getTodayMedicineStats() {
  try {
    const today = todayStr();
    // ✅ FIX: Count taken only if takenDate is today
    const taken: any = await db.getFirstAsync(
      "SELECT COUNT(*) as count FROM medicines WHERE taken = 1 AND takenDate = ?",
      [today]
    );
    const missed: any = await db.getFirstAsync(
      "SELECT COUNT(*) as count FROM medicines WHERE taken = -1"
    );
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