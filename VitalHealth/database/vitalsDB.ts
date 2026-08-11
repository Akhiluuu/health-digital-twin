// database/vitalsDB.ts
// Database module for Log Vitals feature

import { db } from "./index";
import { log } from "../utils/logger";

export interface VitalsRecord {
  id: string;
  timestamp: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  member_id?: string; // profile owner ('self' or member UID)
  heartRate?: number | null;
  bpSystolic?: number | null;
  bpDiastolic?: number | null;
  spo2?: number | null;
  temperature?: number | null;
  respiratoryRate?: number | null;
  weight?: number | null;
  bloodGlucose?: number | null;
  feeling?: string | null;
  medicationTaken?: number | null; // 1 = Yes, 0 = No, null = not selected
  notes?: string | null;
}

export const initVitalsDB = async () => {
  try {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS vitals_log (
        id                  TEXT PRIMARY KEY NOT NULL,
        timestamp           INTEGER NOT NULL,
        date                TEXT NOT NULL,
        time                TEXT NOT NULL,
        member_id           TEXT DEFAULT 'self',
        heartRate           INTEGER,
        bpSystolic          INTEGER,
        bpDiastolic         INTEGER,
        spo2                INTEGER,
        temperature         REAL,
        respiratoryRate     INTEGER,
        weight              REAL,
        bloodGlucose        INTEGER,
        feeling             TEXT,
        medicationTaken     INTEGER,
        notes               TEXT
      );
    `);
    try {
      await db.execAsync("ALTER TABLE vitals_log ADD COLUMN member_id TEXT DEFAULT 'self';");
    } catch (_) {
      // Column already exists
    }
    try {
      await db.execAsync("CREATE INDEX IF NOT EXISTS idx_vitals_member_ts ON vitals_log (member_id, timestamp DESC);");
    } catch (_) {
      // Index creation fallback
    }
    log("✅ Vitals Log DB ready (shared vital_health.db)");
  } catch (err) {
    log("❌ initVitalsDB error:", err);
    throw err;
  }
};

export const addVitalsRecord = async (
  record: Omit<VitalsRecord, "id" | "timestamp">,
  memberId: string = "self"
): Promise<string> => {
  try {
    const id = `vital_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = Date.now();
    const ownerId = memberId || record.member_id || "self";
    
    db.runSync(
      `INSERT INTO vitals_log (
        id, timestamp, date, time, member_id, heartRate, bpSystolic, bpDiastolic,
        spo2, temperature, respiratoryRate, weight, bloodGlucose, feeling, medicationTaken, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        timestamp,
        record.date,
        record.time,
        ownerId,
        record.heartRate !== undefined && record.heartRate !== null ? Number(record.heartRate) : null,
        record.bpSystolic !== undefined && record.bpSystolic !== null ? Number(record.bpSystolic) : null,
        record.bpDiastolic !== undefined && record.bpDiastolic !== null ? Number(record.bpDiastolic) : null,
        record.spo2 !== undefined && record.spo2 !== null ? Number(record.spo2) : null,
        record.temperature !== undefined && record.temperature !== null ? Number(record.temperature) : null,
        record.respiratoryRate !== undefined && record.respiratoryRate !== null ? Number(record.respiratoryRate) : null,
        record.weight !== undefined && record.weight !== null ? Number(record.weight) : null,
        record.bloodGlucose !== undefined && record.bloodGlucose !== null ? Number(record.bloodGlucose) : null,
        record.feeling ?? null,
        record.medicationTaken !== undefined && record.medicationTaken !== null ? Number(record.medicationTaken) : null,
        record.notes ?? null,
      ]
    );
    
    log("🟢 Vitals record added with ID:", id, "for member:", ownerId);
    return id;
  } catch (err) {
    log("❌ addVitalsRecord error:", err);
    throw err;
  }
};

export const updateVitalsRecord = async (record: VitalsRecord): Promise<void> => {
  try {
    const ownerId = record.member_id || "self";
    db.runSync(
      `UPDATE vitals_log SET
        date = ?,
        time = ?,
        member_id = ?,
        heartRate = ?,
        bpSystolic = ?,
        bpDiastolic = ?,
        spo2 = ?,
        temperature = ?,
        respiratoryRate = ?,
        weight = ?,
        bloodGlucose = ?,
        feeling = ?,
        medicationTaken = ?,
        notes = ?
      WHERE id = ?`,
      [
        record.date,
        record.time,
        ownerId,
        record.heartRate !== undefined && record.heartRate !== null ? Number(record.heartRate) : null,
        record.bpSystolic !== undefined && record.bpSystolic !== null ? Number(record.bpSystolic) : null,
        record.bpDiastolic !== undefined && record.bpDiastolic !== null ? Number(record.bpDiastolic) : null,
        record.spo2 !== undefined && record.spo2 !== null ? Number(record.spo2) : null,
        record.temperature !== undefined && record.temperature !== null ? Number(record.temperature) : null,
        record.respiratoryRate !== undefined && record.respiratoryRate !== null ? Number(record.respiratoryRate) : null,
        record.weight !== undefined && record.weight !== null ? Number(record.weight) : null,
        record.bloodGlucose !== undefined && record.bloodGlucose !== null ? Number(record.bloodGlucose) : null,
        record.feeling ?? null,
        record.medicationTaken !== undefined && record.medicationTaken !== null ? Number(record.medicationTaken) : null,
        record.notes ?? null,
        record.id
      ]
    );
    log("🟢 Vitals record updated with ID:", record.id);
  } catch (err) {
    log("❌ updateVitalsRecord error:", err);
    throw err;
  }
};

export const deleteVitalsRecord = async (id: string): Promise<void> => {
  try {
    db.runSync(`DELETE FROM vitals_log WHERE id = ?`, [id]);
    log("🗑 Vitals record deleted permanently:", id);
  } catch (err) {
    log("❌ deleteVitalsRecord error:", err);
    throw err;
  }
};

export const getAllVitalsRecords = async (memberId: string = "self"): Promise<VitalsRecord[]> => {
  try {
    const ownerId = memberId || "self";
    return (
      (db.getAllSync(
        `SELECT * FROM vitals_log WHERE member_id = ? OR (member_id IS NULL AND ? = 'self') ORDER BY timestamp DESC`,
        [ownerId, ownerId]
      ) as VitalsRecord[]) || []
    );
  } catch (err) {
    log("❌ getAllVitalsRecords error:", err);
    return [];
  }
};

export const getVitalsRecordById = async (id: string): Promise<VitalsRecord | null> => {
  try {
    return (db.getFirstSync(`SELECT * FROM vitals_log WHERE id = ?`, [id]) as VitalsRecord | null) || null;
  } catch (err) {
    log("❌ getVitalsRecordById error:", err);
    return null;
  }
};
