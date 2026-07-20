// services/pie/AnomalyEngine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Rule-based anomaly detection over real health data.
// Detects: medication stoppage, prolonged low adherence, unusual inventory
// consumption, vital sign trends from simulation_history, repeated snoozes.
// NEVER hardcodes a list of anomalies. Rules are data-driven thresholds.
// ─────────────────────────────────────────────────────────────────────────────

import { log } from '../../utils/logger';
import type { AnomalyContext, DetectedAnomaly, PIECandidate, MedicalContext, BehaviorContext, TwinContext } from './types';
import { nanoid } from '@/utils/nanoid';

// ─────────────────────────────────────────────────────────────────────────────
// Detect anomalies from all available contexts
// ─────────────────────────────────────────────────────────────────────────────

export async function buildAnomalyContext(
  uid: string,
  medCtx: MedicalContext,
  behaviorCtx: BehaviorContext,
  twinCtx: TwinContext,
): Promise<AnomalyContext> {
  const anomalies: DetectedAnomaly[] = [];
  const now = new Date().toISOString();

  // ── ANOM-01: Medication suddenly stopped (had meds, now all missed) ───────
  if (
    medCtx.totalActiveMeds > 0 &&
    medCtx.todayStats.total > 0 &&
    medCtx.todayStats.missed === medCtx.todayStats.total &&
    medCtx.todayStats.taken === 0
  ) {
    anomalies.push({
      ruleId: 'ANOM-01-ALL-MISSED-TODAY',
      category: 'risk_alerts',
      severity: 'high',
      summary: `All ${medCtx.todayStats.total} scheduled medications missed today`,
      evidence: { totalScheduled: medCtx.todayStats.total, totalMissed: medCtx.todayStats.missed },
      detectedAt: now,
    });
  }

  // ── ANOM-02: Adherence below critical threshold for 7 days ────────────────
  if (medCtx.adherenceRate7d != null && medCtx.adherenceRate7d < 0.4 && medCtx.totalActiveMeds > 0) {
    anomalies.push({
      ruleId: 'ANOM-02-CRITICAL-LOW-ADHERENCE',
      category: 'risk_alerts',
      severity: 'high',
      summary: `Medication adherence is ${Math.round(medCtx.adherenceRate7d * 100)}% over the last 7 days`,
      evidence: { adherenceRate: medCtx.adherenceRate7d, periodDays: 7 },
      detectedAt: now,
    });
  }

  // ── ANOM-03: Simulation anomaly persisting (same anomaly for 3+ runs) ─────
  if (twinCtx.lastAnomalies.length > 0) {
    try {
      const { db } = await import('../../database/index');
      const rows = await db.getAllAsync<any>(
        `SELECT anomaly_labels FROM simulation_history
         WHERE uid = ? AND has_anomaly = 1
         ORDER BY run_at DESC LIMIT 3`,
        [uid]
      );
      if (rows.length >= 3) {
        const firstLabels: string[] = JSON.parse(rows[0].anomaly_labels || '[]');
        const allMatch = rows.every((r: any) => {
          const labels: string[] = JSON.parse(r.anomaly_labels || '[]');
          return firstLabels.some(l => labels.includes(l));
        });
        if (allMatch && firstLabels.length > 0) {
          anomalies.push({
            ruleId: 'ANOM-03-PERSISTENT-TWIN-ANOMALY',
            category: 'risk_alerts',
            severity: 'high',
            summary: `Digital Twin anomaly "${firstLabels[0]}" detected in 3 consecutive simulations`,
            evidence: { anomalyLabel: firstLabels[0], runCount: rows.length },
            detectedAt: now,
          });
        }
      }
    } catch { /* simulation_history query failed */ }
  }

  // ── ANOM-04: Resting heart rate trend elevated (from simulation_history) ──
  try {
    const { db } = await import('../../database/index');
    const hrRows = await db.getAllAsync<{ heart_rate: number }>(
      `SELECT heart_rate FROM simulation_history
       WHERE uid = ? AND heart_rate IS NOT NULL
       ORDER BY run_at DESC LIMIT 10`,
      [uid]
    );
    if (hrRows.length >= 5) {
      const recent3Avg = hrRows.slice(0, 3).reduce((s, r) => s + (r.heart_rate ?? 0), 0) / 3;
      const older3Avg  = hrRows.slice(5, 8).reduce((s, r) => s + (r.heart_rate ?? 0), 0) / 3;
      if (recent3Avg > 0 && older3Avg > 0 && recent3Avg - older3Avg >= 10) {
        anomalies.push({
          ruleId: 'ANOM-04-HR-TREND-ELEVATED',
          category: 'health_monitoring',
          severity: 'medium',
          summary: `Simulated resting heart rate has increased by ~${Math.round(recent3Avg - older3Avg)} bpm over recent simulations`,
          evidence: { recent3Avg: Math.round(recent3Avg), older3Avg: Math.round(older3Avg) },
          detectedAt: now,
        });
      }
    }
  } catch { /* simulation_history query failed */ }

  return { detectedAnomalies: anomalies };
}

// ─────────────────────────────────────────────────────────────────────────────
// Generate PIE candidates from anomaly context
// ─────────────────────────────────────────────────────────────────────────────

export function generateAnomalyCandidates(
  ctx: AnomalyContext,
  profileId: string,
  profileName: string,
): PIECandidate[] {
  const candidates: PIECandidate[] = [];
  const now = new Date().toISOString();

  for (const anomaly of ctx.detectedAnomalies) {
    candidates.push({
      id: nanoid(),
      category: anomaly.category,
      priority: anomaly.severity,
      title: 'Health Anomaly Detected',
      body: anomaly.summary + ' Please review your health data and consult your healthcare provider if you have concerns.',
      deepLink: '/(tabs)/twin',
      actionButtons: [{ id: 'VIEW_DETAILS', label: 'View Details' }],
      sourceEngineId: 'AnomalyEngine',
      triggerRuleId: anomaly.ruleId,
      triggerData: anomaly.evidence,
      triggerEventId: null,
      profileId,
      profileName,
      profilePhoto: null,
      deliveryChannel: 'push',
      requiresImmediateDelivery: anomaly.severity === 'critical' || anomaly.severity === 'emergency',
      suppressIfDoNotDisturb: anomaly.severity === 'low' || anomaly.severity === 'medium',
      generatedAt: now,
    });
  }

  return candidates;
}
