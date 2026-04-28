// database/symptomDB.ts
// Uses the unified vital_health.db via shared connection from index.ts
//
// ✅ FIX 5 preserved: reminderEngine imports removed entirely.
//    Notification scheduling lives exclusively in:
//      - SymptomContext.tsx → scheduleSymptomHourly()
//      - notifeeService.ts → all scheduling functions

import { db } from "./index";

let isInitialized = false;

//////////////////////////////////////////////////////////
// TYPE DEFINITIONS
//////////////////////////////////////////////////////////

export type Symptom = {
  id: number;
  categoryId: string;
  optionId: string;
  name: string;
  severity: string;
  startedAt: number;
  active: number;
  followupTime: number;
  resolvedAt?: number | null;
  notes?: string | null;
  followUpAnswers?: string | null;
};

//////////////////////////////////////////////////////////
// INITIALIZE — no-op: table created by initAllTables
//////////////////////////////////////////////////////////

export const initSymptomDB = async () => {
  if (isInitialized) return;
  isInitialized = true;
  console.log("✅ Symptom DB ready (shared vital_health.db)");
};

//////////////////////////////////////////////////////////
// ADD SYMPTOM
//////////////////////////////////////////////////////////

export const addSymptom = async (
  categoryId: string,
  optionId: string,
  name: string,
  severity: string,
  followupMinutes: number,
  notes?: string,
  followUpAnswers?: string
): Promise<void> => {
  try {
    const now = Date.now();
    db.runSync(
      `INSERT INTO symptoms
      (categoryId, optionId, name, severity, startedAt, active, followupTime, resolvedAt, notes, followUpAnswers)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [categoryId, optionId, name, severity, now, 1, followupMinutes, null, notes ?? null, followUpAnswers ?? null]
    );
    const result = db.getFirstSync("SELECT last_insert_rowid() as id") as { id: number };
    if (!result?.id) throw new Error("Failed to retrieve inserted symptom ID");
    console.log("🟢 Symptom inserted with ID:", result.id);
  } catch (err) {
    console.log("❌ Add symptom error:", err);
    throw err;
  }
};

//////////////////////////////////////////////////////////
// GET ACTIVE SYMPTOMS
//////////////////////////////////////////////////////////

export const getActiveSymptoms = async (): Promise<Symptom[]> => {
  try {
    return (db.getAllSync(`SELECT * FROM symptoms WHERE active = 1 ORDER BY startedAt DESC`) as Symptom[]) || [];
  } catch (err) {
    console.log("❌ Error fetching active symptoms:", err);
    return [];
  }
};

//////////////////////////////////////////////////////////
// GET HISTORY (RESOLVED)
//////////////////////////////////////////////////////////

export const getResolvedSymptoms = async (): Promise<Symptom[]> => {
  try {
    return (db.getAllSync(`SELECT * FROM symptoms WHERE active = 0 ORDER BY resolvedAt DESC`) as Symptom[]) || [];
  } catch (err) {
    console.log("❌ Fetch history error:", err);
    return [];
  }
};

//////////////////////////////////////////////////////////
// GET ALL
//////////////////////////////////////////////////////////

export const getAllSymptoms = async (): Promise<Symptom[]> => {
  try {
    return (db.getAllSync(`SELECT * FROM symptoms ORDER BY startedAt DESC`) as Symptom[]) || [];
  } catch (err) {
    console.log("❌ Fetch all error:", err);
    return [];
  }
};

//////////////////////////////////////////////////////////
// RESOLVE BY CATEGORY + OPTION IDs
//////////////////////////////////////////////////////////

export const resolveSymptomByIds = async (categoryId: string, optionId: string) => {
  try {
    const symptom = db.getFirstSync(
      `SELECT id FROM symptoms WHERE categoryId=? AND optionId=? AND active=1`,
      [categoryId, optionId]
    ) as { id: number } | null;
    if (!symptom) return;
    await resolveSymptom(symptom.id);
  } catch (err) {
    console.log("❌ Resolve by IDs error:", err);
  }
};

//////////////////////////////////////////////////////////
// RESOLVE BY ID
//////////////////////////////////////////////////////////

export const resolveSymptom = async (id: number): Promise<void> => {
  try {
    const symptom = db.getFirstSync("SELECT * FROM symptoms WHERE id=?", [id]) as Symptom | null;
    if (!symptom) return;
    if (symptom.active === 0) { console.log("⚠️ Already resolved:", id); return; }
    db.runSync(
      `UPDATE symptoms SET active=0, resolvedAt=? WHERE id=?`,
      [Date.now(), id]
    );
    console.log("✅ Symptom resolved & stored in history:", id);
  } catch (err) {
    console.log("❌ Resolve symptom error:", err);
  }
};

//////////////////////////////////////////////////////////
// DELETE
//////////////////////////////////////////////////////////

export const deleteSymptom = async (id: number): Promise<void> => {
  try {
    db.runSync("DELETE FROM symptoms WHERE id=?", [id]);
    console.log("🗑 Symptom deleted permanently:", id);
  } catch (err) {
    console.log("❌ Delete error:", err);
  }
};

//////////////////////////////////////////////////////////
// SAVE FOLLOW-UP ANSWERS
//////////////////////////////////////////////////////////

export const saveFollowUpAnswers = (id: number, answers: string): void => {
  try {
    db.runSync(`UPDATE symptoms SET followUpAnswers=? WHERE id=?`, [answers, id]);
  } catch (err) {
    console.log("❌ Save follow-up error:", err);
  }
};

//////////////////////////////////////////////////////////
// CLEAR ALL
//////////////////////////////////////////////////////////

export const clearSymptoms = (): void => {
  try {
    db.runSync("DELETE FROM symptoms");
  } catch (err) {
    console.log("❌ Clear error:", err);
  }
};

//////////////////////////////////////////////////////////
// GET BY ID
//////////////////////////////////////////////////////////

export const getSymptomById = (id: number): Symptom | null => {
  try {
    return db.getFirstSync("SELECT * FROM symptoms WHERE id=?", [id]) as Symptom | null;
  } catch (err) {
    console.log("❌ Get by ID error:", err);
    return null;
  }
};