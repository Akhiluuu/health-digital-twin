// services/pie/DecisionEngine.ts
// ─────────────────────────────────────────────────────────────────────────────
// The gatekeeper of the Personal Intelligence Engine.
// Evaluates all PIECandidate notifications against:
//   - Priority rules
//   - User preferences (DND, muted, category enabled)
//   - Frequency limits (no double notifications in the same category)
//   - Notification fatigue limits (from learning engine signals)
// Records the final decision (approved/rejected) to pie_audit_log.
// ─────────────────────────────────────────────────────────────────────────────

import { log } from '../../utils/logger';
import type { PIECandidate, EngineContext } from './types';
import { recordPIEAuditEntry, getRuleState, updateRuleState } from '../../database/pieDB';
import { nanoid } from '@/utils/nanoid';

// ─────────────────────────────────────────────────────────────────────────────
// Check quiet hours (DND)
// ─────────────────────────────────────────────────────────────────────────────

function isInQuietHours(start: number, end: number): boolean {
  const currentHour = new Date().getHours();
  if (start < end) {
    return currentHour >= start && currentHour < end;
  } else {
    // Over midnight, e.g. 22:00 to 07:00
    return currentHour >= start || currentHour < end;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Check if category is enabled in user preferences
// ─────────────────────────────────────────────────────────────────────────────

function isCategoryEnabled(category: string, prefs: any): boolean {
  if (!prefs) return true;
  if (prefs.muted === 1) return false;

  switch (category) {
    case 'medication':
      return prefs.medsEnabled === 1;
    case 'vitals':
    case 'risk_alerts':
    case 'health_monitoring':
      return prefs.alertsEnabled === 1;
    case 'exercise':
    case 'recovery':
      return prefs.stepsEnabled === 1;
    case 'hydration':
      return prefs.hydrationEnabled === 1;
    case 'reports':
    case 'lab_results':
    case 'documents':
      return prefs.reportsEnabled === 1;
    case 'digital_twin':
      return prefs.twinReminderEnabled === 1;
    default:
      return true;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Decision Evaluator
// ─────────────────────────────────────────────────────────────────────────────

export async function evaluateCandidates(
  candidates: PIECandidate[],
  ctx: EngineContext,
  prefs: any, // SQLite notification_preferences row
): Promise<PIECandidate[]> {
  const approved: PIECandidate[] = [];
  const now = new Date().toISOString();

  // Load quiet hour settings from profile context
  const { isDoNotDisturb, preferredQuietStart, preferredQuietEnd } = ctx.profileEngine;
  const quietHoursActive = isInQuietHours(preferredQuietStart, preferredQuietEnd);

  for (const cand of candidates) {
    let decision: 'approved' | 'rejected' = 'approved';
    let rejectReason: string | null = null;

    // ── Check 1: Master preferences mute or category disabled ────────────────
    if (!isCategoryEnabled(cand.category, prefs)) {
      decision = 'rejected';
      rejectReason = `Category "${cand.category}" is disabled in user preferences`;
    }

    // ── Check 2: Do Not Disturb ──────────────────────────────────────────────
    if (decision === 'approved' && cand.suppressIfDoNotDisturb) {
      if (isDoNotDisturb) {
        decision = 'rejected';
        rejectReason = 'User profile has Do Not Disturb enabled';
      } else if (quietHoursActive) {
        decision = 'rejected';
        rejectReason = `Quiet hours active (${preferredQuietStart}:00 - ${preferredQuietEnd}:00)`;
      }
    }

    // ── Check 3: Rule Cooldown (Prevent Spamming) ─────────────────────────────
    if (decision === 'approved') {
      const state = await getRuleState(cand.triggerRuleId, cand.profileId);
      if (state) {
        // Cooldown depends on priority
        let cooldownMs = 24 * 3600 * 1000; // default 24 hours
        if (cand.priority === 'emergency') cooldownMs = 0; // never cool down emergencies
        else if (cand.priority === 'critical') cooldownMs = 15 * 60 * 1000; // 15 mins
        else if (cand.priority === 'high') cooldownMs = 2 * 3600 * 1000; // 2 hours
        else if (cand.priority === 'medium') cooldownMs = 8 * 3600 * 1000; // 8 hours

        const lastFired = state.last_fired_at ? new Date(state.last_fired_at).getTime() : 0;
        const elapsed = Date.now() - lastFired;

        if (elapsed < cooldownMs) {
          decision = 'rejected';
          rejectReason = `Rule cooldown active. Last fired: ${state.last_fired_at}`;
        }

        // Suppressed state check (from learning engine rules)
        if (state.suppressed_until) {
          const suppressUntil = new Date(state.suppressed_until).getTime();
          if (Date.now() < suppressUntil) {
            decision = 'rejected';
            rejectReason = `Rule suppressed by Learning Engine until ${state.suppressed_until}`;
          }
        }
      }
    }

    // ── Check 4: Fatigue Limits ──────────────────────────────────────────────
    // If the open rate for this category is extremely low (<10%), reduce frequency
    if (decision === 'approved' && cand.priority === 'low') {
      const openRate = ctx.learningEngine.openRate;
      const candidateHash = cand.id ? [...cand.id].reduce((acc, ch) => acc + ch.charCodeAt(0), 0) : 0;
      if (openRate < 0.15 && candidateHash % 10 < 7) {
        decision = 'rejected';
        rejectReason = `High fatigue warning: user open rate is ${Math.round(openRate * 100)}%`;
      }
    }

    // ── Check 5: Emergency Escalation Bypass ──────────────────────────────────
    if (cand.priority === 'emergency') {
      decision = 'approved';
      rejectReason = null;
    }

    // ── Record the decision to the audit log ─────────────────────────────────
    await recordPIEAuditEntry({
      id: nanoid(),
      candidateId: cand.id,
      profileId: cand.profileId,
      category: cand.category,
      priority: cand.priority,
      title: cand.title,
      decision,
      rejectReason,
      sourceEngineId: cand.sourceEngineId,
      triggerRuleId: cand.triggerRuleId,
      triggerData: JSON.stringify(cand.triggerData),
      deliveredViaChannel: decision === 'approved' ? cand.deliveryChannel : null,
      evaluatedAt: now,
    });

    if (decision === 'approved') {
      approved.push(cand);
      // Update cooldown state
      await updateRuleState(cand.triggerRuleId, cand.profileId);
    }
  }

  log(`[PIE DecisionEngine] Evaluated ${candidates.length} candidates. Approved: ${approved.length}`);
  return approved;
}
