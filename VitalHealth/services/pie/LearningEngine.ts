// services/pie/LearningEngine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Observes how users interact with notifications (open, snooze, dismiss, ignore).
// Calculates open/fatigue rates, preferred hours, and average response times.
// Automatically suppresses rules that are ignored repeatedly (Deduplication).
// ─────────────────────────────────────────────────────────────────────────────

import { log } from '../../utils/logger';
import type { LearningContext } from './types';
import { getInteractionSignals, updateRuleState } from '../../database/pieDB';

// ─────────────────────────────────────────────────────────────────────────────
// Build LearningContext from SQLite interaction signals
// ─────────────────────────────────────────────────────────────────────────────

export async function buildLearningContext(profileId: string): Promise<LearningContext> {
  try {
    const signals = await getInteractionSignals(profileId, 30);

    if (signals.length === 0) {
      return { openRate: 1.0, avgResponseMs: 0, snoozeRate: 0.0, dismissRate: 0.0, bestHourOfDay: null, worstHours: [] };
    }

    const total = signals.length;
    const opened = signals.filter(s => s.interaction === 'opened' || s.interaction === 'acted').length;
    const snoozed = signals.filter(s => s.interaction === 'snoozed').length;
    const dismissed = signals.filter(s => s.interaction === 'dismissed').length;

    const openRate = opened / total;
    const snoozeRate = snoozed / total;
    const dismissRate = dismissed / total;

    // Calculate average response delay
    const validDelays = signals.filter(s => s.delayMs != null).map(s => s.delayMs as number);
    const avgResponseMs = validDelays.length > 0
      ? validDelays.reduce((s, v) => s + v, 0) / validDelays.length
      : 0;

    // ── Find best and worst hours of the day (highest open rates) ───────────
    const hourlyOpens: Record<number, { total: number; opened: number }> = {};
    for (const signal of signals) {
      const date = new Date(signal.interactedAt);
      const hour = date.getHours();
      if (!hourlyOpens[hour]) hourlyOpens[hour] = { total: 0, opened: 0 };
      hourlyOpens[hour].total++;
      if (signal.interaction === 'opened' || signal.interaction === 'acted') {
        hourlyOpens[hour].opened++;
      }
    }

    let bestHour: number | null = null;
    let maxRate = -1;
    const worstHours: number[] = [];

    Object.entries(hourlyOpens).forEach(([hourStr, stats]) => {
      const hour = parseInt(hourStr, 10);
      const rate = stats.opened / stats.total;
      if (rate > maxRate) {
        maxRate = rate;
        bestHour = hour;
      }
      if (rate < 0.25) {
        worstHours.push(hour);
      }
    });

    return {
      openRate,
      avgResponseMs,
      snoozeRate,
      dismissRate,
      bestHourOfDay: bestHour,
      worstHours,
    };
  } catch (err) {
    log('[PIE LearningEngine] buildLearningContext error:', err);
    return { openRate: 1.0, avgResponseMs: 0, snoozeRate: 0.0, dismissRate: 0.0, bestHourOfDay: null, worstHours: [] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Train Learning Rules: auto-suppress notification rules ignored repeatedly
// ─────────────────────────────────────────────────────────────────────────────

export async function processEngagementSignals(profileId: string): Promise<void> {
  try {
    const signals = await getInteractionSignals(profileId, 7);

    // Group signals by rule ID
    // Note: candidateId needs to map to rule ID. In delivery context,
    // we should fetch audit log or parse data fields.
    // For simplicity, we can query recent signals and look at matching rule records.
    const { db } = await import('../../database/index');

    // Find any rules that were dismissed or ignored 3+ times in a row
    const ignoredRules = (await db.getAllAsync(
      `SELECT trigger_rule_id, COUNT(*) as cnt
       FROM pie_audit_log
       WHERE profile_id = ? AND decision = 'approved'
         AND candidate_id IN (
           SELECT candidate_id FROM pie_interaction_signals
           WHERE profile_id = ? AND interaction IN ('dismissed', 'ignored')
         )
       GROUP BY trigger_rule_id
       HAVING cnt >= 3`
    )) as any[];

    for (const row of ignoredRules) {
      const ruleId = row.trigger_rule_id;
      // Suppress this rule for 3 days to avoid fatigue
      const suppressUntil = new Date(Date.now() + 3 * 86400 * 1000).toISOString();
      await updateRuleState(ruleId, profileId, suppressUntil);
      log(`[PIE LearningEngine] Suppressing fatigue-heavy rule: ${ruleId} until ${suppressUntil}`);
    }
  } catch (err) {
    log('[PIE LearningEngine] processEngagementSignals error:', err);
  }
}
