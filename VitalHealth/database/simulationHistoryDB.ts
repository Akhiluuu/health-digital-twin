// database/simulationHistoryDB.ts
// ─── Persists the last-known BioGears vitals locally ─────────────────────────
// Lets the Dashboard show real data even when the BioGears server is
// unreachable (e.g. plane mode, phone change after Drive restore).

import { db } from "./index";
import type { BiogearsVitals } from "../services/biogears";

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
  has_anomaly: number;
  anomaly_labels: string | null;   // JSON array of label strings
  run_at: string;                  // ISO timestamp
}

// ─── Save a simulation result locally ────────────────────────────────────────

export async function saveSimulationResult(
  uid: string,
  sessionId: string,
  vitals: BiogearsVitals,
  anomalies: Array<{ label: string }> = []
): Promise<void> {
  try {
    const anomalyLabels = anomalies.length > 0
      ? JSON.stringify(anomalies.map(a => a.label))
      : null;

    await db.runAsync(
      `INSERT INTO simulation_history
        (uid, session_id, heart_rate, blood_pressure, glucose, respiration,
         spo2, core_temperature, cardiac_output, has_anomaly, anomaly_labels, run_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(session_id) DO NOTHING`,
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
        anomalies.length > 0 ? 1 : 0,
        anomalyLabels,
        new Date().toISOString(),
      ]
    );
    // Keep only the last 30 records per user to control storage
    await db.runAsync(
      `DELETE FROM simulation_history
       WHERE uid = ? AND id NOT IN (
         SELECT id FROM simulation_history WHERE uid = ?
         ORDER BY run_at DESC LIMIT 30
       )`,
      [uid, uid]
    );
    console.log("💾 Simulation result saved locally:", sessionId);
  } catch (error) {
    console.log("❌ saveSimulationResult error:", error);
  }
}

// ─── Get the most recent simulation for a user ────────────────────────────────

export async function getLastSimulation(uid: string): Promise<SimulationRecord | null> {
  try {
    return (await db.getFirstAsync<SimulationRecord>(
      "SELECT * FROM simulation_history WHERE uid = ? ORDER BY run_at DESC LIMIT 1",
      [uid]
    )) ?? null;
  } catch (error) {
    console.log("❌ getLastSimulation error:", error);
    return null;
  }
}

// ─── Get last N simulations (for history / trend chart) ───────────────────────

export async function getSimulationHistory(uid: string, limit: number = 10): Promise<SimulationRecord[]> {
  try {
    return (await db.getAllAsync<SimulationRecord>(
      "SELECT * FROM simulation_history WHERE uid = ? ORDER BY run_at DESC LIMIT ?",
      [uid, limit]
    )) || [];
  } catch (error) {
    console.log("❌ getSimulationHistory error:", error);
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
  };
}
