// database/simulationHistoryDB.ts
// ─── Persists the last-known BioGears vitals locally ─────────────────────────
// Lets the Dashboard show real data even when the BioGears server is
// unreachable (e.g. plane mode, phone change after Drive restore).

import { db } from "./index";
import type { BiogearsVitals } from "../services/biogears";

import { log } from "../utils/logger";

export interface SimulationRecord {
  id: number;
  uid: string;
  session_id: string;
  heart_rate: number | null;
  blood_pressure: string | null;
  glucose: number | null;
  respiration: number | null;
  spo2: number | null;
  core_temperature: number | null;
  cardiac_output: number | null;
  map: number | null;
  stroke_volume: number | null;
  tidal_volume: number | null;
  arterial_ph: number | null;
  exercise_level: number | null;
  has_anomaly: number;
  anomaly_labels: string | null;   // JSON array of label strings
  event_count: number | null;
  run_at: string;                  // ISO timestamp
}

// ─── Save a simulation result locally ────────────────────────────────────────

export async function saveSimulationResult(
  uid: string,
  sessionId: string,
  vitals: BiogearsVitals,
  anomalies: Array<{ label: string }> = [],
  eventCount: number = 0,
  customTimestamp?: string
): Promise<void> {
  try {
    const anomalyLabels = anomalies.length > 0
      ? JSON.stringify(anomalies.map(a => a.label))
      : null;

    const runAt = customTimestamp || new Date().toISOString();

    await db.runAsync(
      `INSERT INTO simulation_history
        (uid, session_id, heart_rate, blood_pressure, glucose, respiration,
         spo2, core_temperature, cardiac_output, map, stroke_volume, tidal_volume,
         arterial_ph, exercise_level, has_anomaly, anomaly_labels, event_count, run_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(session_id) DO UPDATE SET
         heart_rate = excluded.heart_rate,
         blood_pressure = excluded.blood_pressure,
         glucose = excluded.glucose,
         respiration = excluded.respiration,
         spo2 = excluded.spo2,
         core_temperature = excluded.core_temperature,
         cardiac_output = excluded.cardiac_output,
         map = excluded.map,
         stroke_volume = excluded.stroke_volume,
         tidal_volume = excluded.tidal_volume,
         arterial_ph = excluded.arterial_ph,
         exercise_level = excluded.exercise_level,
         has_anomaly = excluded.has_anomaly,
         anomaly_labels = excluded.anomaly_labels,
         event_count = excluded.event_count,
         run_at = excluded.run_at`,
      [
        uid,
        sessionId,
        vitals.heart_rate ?? null,
        vitals.blood_pressure ?? null,
        vitals.glucose ?? null,
        vitals.respiration ?? null,
        vitals.spo2 ?? null,
        vitals.core_temperature ?? null,
        vitals.cardiac_output ?? null,
        vitals.map ?? null,
        vitals.stroke_volume ?? null,
        vitals.tidal_volume ?? null,
        vitals.arterial_ph ?? null,
        vitals.exercise_level ?? null,
        anomalies.length > 0 ? 1 : 0,
        anomalyLabels,
        eventCount,
        runAt,
      ]
    );
    // Keep all simulation records for comprehensive history logs
    log("💾 Simulation result saved locally:", sessionId);
  } catch (error) {
    log("❌ saveSimulationResult error:", error);
  }
}

export async function deleteSimulationResult(uid: string, sessionId: string): Promise<void> {
  try {
    await db.runAsync(
      "DELETE FROM simulation_history WHERE uid = ? AND session_id = ?",
      [uid, sessionId]
    );
    log("🗑️ Simulation result deleted locally:", sessionId);
  } catch (error) {
    log("❌ deleteSimulationResult error:", error);
  }
}


// ─── Get the most recent simulation for a user ────────────────────────────────

export async function getLastSimulation(uid: string): Promise<SimulationRecord | null> {
  try {
    return ((await db.getFirstAsync(
      "SELECT * FROM simulation_history WHERE uid = ? ORDER BY run_at DESC LIMIT 1",
      [uid]
    )) as SimulationRecord | null) ?? null;
  } catch (error) {
    log("❌ getLastSimulation error:", error);
    return null;
  }
}

// ─── Get last N simulations (for history / trend chart) ───────────────────────

export async function getSimulationHistory(uid: string, limit: number = 10000): Promise<SimulationRecord[]> {
  try {
    return ((await db.getAllAsync(
      "SELECT * FROM simulation_history WHERE uid = ? ORDER BY run_at DESC LIMIT ?",
      [uid, limit]
    )) as SimulationRecord[]) || [];
  } catch (error) {
    log("❌ getSimulationHistory error:", error);
    return [];
  }
}

// ─── Convert SimulationRecord back to BiogearsVitals shape ───────────────────
// Useful when the server is unreachable and we want to show cached vitals.

export function recordToVitals(record: SimulationRecord): BiogearsVitals {
  return {
    heart_rate: record.heart_rate,
    blood_pressure: record.blood_pressure,
    glucose: record.glucose,
    respiration: record.respiration,
    spo2: record.spo2,
    core_temperature: record.core_temperature,
    cardiac_output: record.cardiac_output,
    map: record.map,
    stroke_volume: record.stroke_volume,
    tidal_volume: record.tidal_volume,
    arterial_ph: record.arterial_ph,
    exercise_level: record.exercise_level,
  };
}
