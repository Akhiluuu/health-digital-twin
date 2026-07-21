// database/medicineDB.ts
// Uses the unified vital_health.db via shared connection from index.ts

import { db } from "./index";

import { log } from "../utils/logger";

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
  reviewInterval: string;
  nextReviewDate: string | null;
  reviewStatus: string;
}

///////////////////////////////////////////////////////////
// HELPERS
///////////////////////////////////////////////////////////

/** Returns today's date string in YYYY-MM-DD format (local time). */
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function calculateNextReviewDate(startDate: string, interval: string): string {
  const d = new Date(startDate + "T00:00:00");
  if (isNaN(d.getTime())) {
    return startDate;
  }
  const match = interval.match(/^(\d+)\s+(day|month|year)s?$/i);
  if (match) {
    const val = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    if (unit.startsWith("day")) {
      d.setDate(d.getDate() + val);
    } else if (unit.startsWith("month")) {
      d.setMonth(d.getMonth() + val);
    } else if (unit.startsWith("year")) {
      d.setFullYear(d.getFullYear() + val);
    }
  } else {
    // Default to 90 days
    d.setDate(d.getDate() + 90);
  }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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
    log("💊 Added takenDate column to medicines");
  } catch {
    // Column already exists — ignore the error
  }
  try {
    db.runSync(
      `ALTER TABLE medicines ADD COLUMN reviewInterval TEXT DEFAULT '90 days'`
    );
  } catch {}
  try {
    db.runSync(
      `ALTER TABLE medicines ADD COLUMN nextReviewDate TEXT DEFAULT NULL`
    );
  } catch {}
  try {
    db.runSync(
      `ALTER TABLE medicines ADD COLUMN reviewStatus TEXT DEFAULT 'Started'`
    );
  } catch {}
  log("💊 Medicine DB ready (shared vital_health.db)");
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
  notificationId: string | null,
  reviewInterval: string = "90 days",
  nextReviewDate: string | null = null,
  reviewStatus: string = "Started"
) {
  const calculatedNextReviewDate = nextReviewDate || calculateNextReviewDate(startDate, reviewInterval);
  db.runSync(
    `INSERT INTO medicines
    (name, dose, type, time, timestamp, meal, frequency, startDate, endDate, reminder, notificationId, taken, takenDate, reviewInterval, nextReviewDate, reviewStatus)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?)`,
    [name, dose, type, time, timestamp, meal, frequency, startDate, endDate, reminder, notificationId, reviewInterval, calculatedNextReviewDate, reviewStatus]
  );
}

export function insertOrReplaceMedicine(med: {
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
  notificationId: string | null;
  taken?: number;
  takenDate?: string | null;
  reviewInterval?: string;
  nextReviewDate?: string | null;
  reviewStatus?: string;
}) {
  const reviewInterval = med.reviewInterval || "90 days";
  const nextReviewDate = med.nextReviewDate || calculateNextReviewDate(med.startDate, reviewInterval);
  const reviewStatus = med.reviewStatus || "Started";
  db.runSync(
    `INSERT OR REPLACE INTO medicines
    (id, name, dose, type, time, timestamp, meal, frequency, startDate, endDate, reminder, notificationId, taken, takenDate, reviewInterval, nextReviewDate, reviewStatus)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      med.id,
      med.name,
      med.dose,
      med.type,
      med.time,
      med.timestamp,
      med.meal,
      med.frequency,
      med.startDate,
      med.endDate,
      med.reminder,
      med.notificationId,
      med.taken ?? 0,
      med.takenDate ?? null,
      reviewInterval,
      nextReviewDate,
      reviewStatus,
    ]
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
  const rows = db.getAllSync("SELECT * FROM medicines ORDER BY timestamp ASC") as Medicine[];

  return rows
    .filter((med: Medicine) => med && med.name && med.name.trim() !== "")
    .map((med: Medicine) => ({
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

export function deleteAllMedicines() {
  db.runSync("DELETE FROM medicines");
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

export async function markMedicineTaken(medicineId: number | string) {
  try {
    const today = todayStr();
    await db.runAsync(
      "UPDATE medicines SET taken = 1, takenDate = ? WHERE id = ?",
      [today, medicineId]
    );
    log("✅ Medicine marked as taken:", medicineId);
  } catch (error) {
    log("❌ Error marking medicine:", error);
  }
}

export async function markMedicineMissed(medicineId: number | string) {
  try {
    const today = todayStr();
    await db.runAsync(
      "UPDATE medicines SET taken = -1, takenDate = ? WHERE id = ?",
      [today, medicineId]
    );
    log("✅ Medicine marked as missed:", medicineId);
  } catch (error) {
    log("❌ Error marking medicine missed:", error);
  }
}

export async function markMedicinePending(medicineId: number | string) {
  try {
    await db.runAsync(
      "UPDATE medicines SET taken = 0, takenDate = NULL WHERE id = ?",
      [medicineId]
    );
    log("✅ Medicine marked as pending/untaken:", medicineId);
  } catch (error) {
    log("❌ Error resetting medicine to pending:", error);
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
  log("✅ markMedicineTakenByNotificationId — set taken for today:", today);
}

export function markMedicineMissedByNotificationId(notificationId: string) {
  const today = todayStr();
  db.runSync(
    "UPDATE medicines SET taken = -1, takenDate = ? WHERE notificationId = ?",
    [today, notificationId]
  );
  log("✅ markMedicineMissedByNotificationId — set missed for today:", today);
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
  log("🔄 Daily medicines reset for:", today);
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
    log("📊 Medicine history saved");
  } catch (error) {
    log("❌ History error:", error);
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
    log("⚠️ Missed once-medicines updated");
  } catch (error) {
    log("❌ Missed update error:", error);
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
    log("❌ Stats error:", error);
    return { taken: 0, missed: 0 };
  }
}

///////////////////////////////////////////////////////////
// GET BY NOTIFICATION ID
///////////////////////////////////////////////////////////

export function getMedicineByNotificationId(notificationId: string): Medicine | null {
  try {
    const result = db.getAllSync(
      "SELECT * FROM medicines WHERE notificationId = ?",
      [notificationId]
    ) as Medicine[];
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    log("❌ getMedicineByNotificationId error:", error);
    return null;
  }
}

///////////////////////////////////////////////////////////
// DELETE BY NOTIFICATION ID
///////////////////////////////////////////////////////////

export function deleteMedicineByNotificationId(notificationId: string) {
  try {
    db.runSync("DELETE FROM medicines WHERE notificationId = ?", [notificationId]);
    log("🗑 Deleted medicine by notificationId");
  } catch (error) {
    log("❌ deleteMedicineByNotificationId error:", error);
  }
}

export function updateMedicineReview(
  id: number,
  reviewInterval: string,
  nextReviewDate: string | null,
  reviewStatus: string
) {
  try {
    db.runSync(
      "UPDATE medicines SET reviewInterval = ?, nextReviewDate = ?, reviewStatus = ? WHERE id = ?",
      [reviewInterval, nextReviewDate, reviewStatus, id]
    );
    log("🔄 Updated medicine review status in SQLite:", id);
  } catch (error) {
    log("❌ updateMedicineReview error:", error);
  }
}

export { db };