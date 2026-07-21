// services/pie/DigitalTwinEngine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Reads BioGears simulation_history from SQLite.
// Determines: when the twin last ran, whether today's logged events warrant
// a new simulation, and whether anomalies need acknowledgement.
// NEVER invents simulation data.
// ─────────────────────────────────────────────────────────────────────────────

import { log } from '../../utils/logger';
import type { TwinContext, PIECandidate, PersonaModel, BehaviorContext, MedicalContext } from './types';
import { nanoid } from '@/utils/nanoid';

// ─────────────────────────────────────────────────────────────────────────────
// Build TwinContext from simulation_history SQLite table
// ─────────────────────────────────────────────────────────────────────────────

export async function buildTwinContext(
  uid: string,
  behaviorCtx: BehaviorContext,
  medicalCtx: MedicalContext,
): Promise<TwinContext> {
  try {
    const { db } = await import('../../database/index');

    // Most recent simulation for this user
    const row = (await db.getFirstAsync(
      `SELECT run_at, has_anomaly, anomaly_labels FROM simulation_history
       WHERE uid = ?
       ORDER BY run_at DESC
       LIMIT 1`,
      [uid]
    )) as any;

    if (!row) {
      return {
        lastRunAt: null,
        daysSinceLastRun: null,
        hasRunToday: false,
        todayHasLoggableEvents: false,
        lastAnomalies: [],
        hasUnacknowledgedAnomaly: false,
      };
    }

    const lastRunAt: string = row.run_at;
    const lastRunDate = new Date(lastRunAt);
    const daysSinceLastRun = (Date.now() - lastRunDate.getTime()) / 86400_000;
    const hasRunToday = lastRunDate.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);

    const lastAnomalies: string[] = row.has_anomaly
      ? JSON.parse(row.anomaly_labels || '[]')
      : [];

    // ── Check if enough events have been logged today to warrant a run ──────
    // Criteria: at least one of (steps logged, meals logged, meds logged)
    const hasMedsLogged = medicalCtx.todayStats.taken > 0;
    const hasStepsLogged = behaviorCtx.stepsTodayReal >= 500;
    let hasMealsLogged = false;
    try {
      const mealRow = (await db.getFirstAsync(
        `SELECT COUNT(*) as cnt FROM nutrition_log WHERE date = ?`,
        [new Date().toISOString().slice(0, 10)]
      ).catch(() => null)) as { cnt: number } | null;
      hasMealsLogged = (mealRow?.cnt ?? 0) > 0;
    } catch { /* nutrition_log table may not exist in all versions */ }

    const todayHasLoggableEvents = hasMedsLogged || hasStepsLogged || hasMealsLogged;

    // ── Check for unacknowledged anomaly ────────────────────────────────────
    const ackKey = `@pie_anomaly_acked_${lastRunAt}`;
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    const acked = await AsyncStorage.getItem(ackKey).catch(() => null);
    const hasUnacknowledgedAnomaly = row.has_anomaly === 1 && acked !== '1';

    return {
      lastRunAt,
      daysSinceLastRun,
      hasRunToday,
      todayHasLoggableEvents,
      lastAnomalies,
      hasUnacknowledgedAnomaly,
    };
  } catch (err) {
    log('[PIE TwinEngine] buildTwinContext error:', err);
    return {
      lastRunAt: null,
      daysSinceLastRun: null,
      hasRunToday: false,
      todayHasLoggableEvents: false,
      lastAnomalies: [],
      hasUnacknowledgedAnomaly: false,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Generate PIE candidates from twin state
// ─────────────────────────────────────────────────────────────────────────────

export function generateTwinCandidates(
  ctx: TwinContext,
  persona: PersonaModel,
  medCtx: MedicalContext,
  profileId: string,
  profileName: string,
): PIECandidate[] {
  const candidates: PIECandidate[] = [];
  const now = new Date().toISOString();

  // ── Rule TWIN-01: Run recommended — events logged, hasn't run today ────────
  if (ctx.todayHasLoggableEvents && !ctx.hasRunToday) {
    const meds = medCtx.todayStats.taken;
    const steps = ''; // Included via behavior context if needed

    const eventsSummary: string[] = [];
    if (medCtx.todayStats.taken > 0) eventsSummary.push('medication doses');
    if (eventsSummary.length === 0) eventsSummary.push('health data');

    candidates.push({
      id: nanoid(),
      category: 'digital_twin',
      priority: 'low',
      title: 'Digital Twin Update Available',
      body: `You've logged ${eventsSummary.join(', ')} today. Running your Digital Twin now will update your physiological profile with today's data.`,
      deepLink: '/(tabs)/twin',
      actionButtons: [{ id: 'RUN_TWIN', label: 'Run Simulation' }],
      sourceEngineId: 'DigitalTwinEngine',
      triggerRuleId: 'TWIN-01-EVENTS-LOGGED',
      triggerData: { todayHasLoggableEvents: true, hasRunToday: false, medsTaken: meds },
      triggerEventId: null,
      profileId,
      profileName,
      profilePhoto: null,
      deliveryChannel: 'silent',
      requiresImmediateDelivery: false,
      suppressIfDoNotDisturb: true,
      generatedAt: now,
    });
  }

  // ── Rule TWIN-02: Long gap since last simulation ───────────────────────────
  if (ctx.daysSinceLastRun != null && ctx.daysSinceLastRun >= 7) {
    const days = Math.floor(ctx.daysSinceLastRun);
    candidates.push({
      id: nanoid(),
      category: 'digital_twin',
      priority: 'medium',
      title: 'Digital Twin Out of Date',
      body: `Your Digital Twin hasn't run in ${days} days. Keeping it synchronised gives you more accurate physiological insights and trend tracking.`,
      deepLink: '/(tabs)/twin',
      actionButtons: [{ id: 'RUN_TWIN', label: 'Run Simulation' }],
      sourceEngineId: 'DigitalTwinEngine',
      triggerRuleId: 'TWIN-02-LONG-GAP',
      triggerData: { daysSinceLastRun: days, lastRunAt: ctx.lastRunAt },
      triggerEventId: null,
      profileId,
      profileName,
      profilePhoto: null,
      deliveryChannel: 'push',
      requiresImmediateDelivery: false,
      suppressIfDoNotDisturb: true,
      generatedAt: now,
    });
  }

  // ── Rule TWIN-03: Unacknowledged simulation anomaly ───────────────────────
  if (ctx.hasUnacknowledgedAnomaly && ctx.lastAnomalies.length > 0) {
    const anomalyList = ctx.lastAnomalies.slice(0, 3).join(', ');
    candidates.push({
      id: nanoid(),
      category: 'risk_alerts',
      priority: 'high',
      title: 'Digital Twin Anomaly Detected',
      body: `Your last simulation identified: ${anomalyList}. Review the simulation results and consult your healthcare provider if you have concerns.`,
      deepLink: '/(tabs)/twin',
      actionButtons: [{ id: 'VIEW_TWIN', label: 'View Results' }],
      sourceEngineId: 'DigitalTwinEngine',
      triggerRuleId: 'TWIN-03-UNACKED-ANOMALY',
      triggerData: { anomalies: ctx.lastAnomalies, lastRunAt: ctx.lastRunAt },
      triggerEventId: null,
      profileId,
      profileName,
      profilePhoto: null,
      deliveryChannel: 'push',
      requiresImmediateDelivery: true,
      suppressIfDoNotDisturb: false,
      generatedAt: now,
    });
  }

  return candidates;
}
