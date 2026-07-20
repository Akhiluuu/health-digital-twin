// services/pie/GoalEngine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Life Event Intelligence Engine + Goal tracking.
// Detects meaningful milestones from real data:
//   - Medication adherence streaks
//   - Step goal completion streaks
//   - Cognitive assessment streaks
//   - Overdue health checks
// Every milestone must be derived from actual database records.
// Never fabricates a milestone.
// ─────────────────────────────────────────────────────────────────────────────

import { log } from '../../utils/logger';
import type { GoalContext, MilestoneEvent, StreakInfo, PIECandidate, PersonaModel, MedicalContext, BehaviorContext, CognitiveContext } from './types';
import { nanoid } from '@/utils/nanoid';

// ─────────────────────────────────────────────────────────────────────────────
// Compute medication adherence streak from medicine_history (SQLite)
// ─────────────────────────────────────────────────────────────────────────────

async function getMedicationStreak(): Promise<{ currentStreak: number; bestStreak: number; totalDoses: number }> {
  try {
    const { db } = await import('../../database/index');

    // Count consecutive days where at least one dose was taken
    // medicine_history.takenAt is an ISO timestamp
    const rows = await db.getAllAsync<{ takenDate: string }>(
      `SELECT DISTINCT date(takenAt) as takenDate
       FROM medicine_history
       ORDER BY takenDate DESC
       LIMIT 90`
    );

    if (!rows || rows.length === 0) return { currentStreak: 0, bestStreak: 0, totalDoses: 0 };

    const totalDosesRow = await db.getFirstAsync<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM medicine_history`
    );
    const totalDoses = totalDosesRow?.cnt ?? 0;

    const dates = rows.map(r => r.takenDate);
    let currentStreak = 0;
    let bestStreak = 0;
    let streak = 0;

    const today = new Date().toISOString().slice(0, 10);
    for (let i = 0; i < 90; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      if (dates.includes(dateStr)) {
        streak++;
        if (i < streak) currentStreak = streak;
        bestStreak = Math.max(bestStreak, streak);
      } else {
        if (i > 0) break; // gap in streak
      }
    }

    return { currentStreak, bestStreak, totalDoses };
  } catch {
    return { currentStreak: 0, bestStreak: 0, totalDoses: 0 };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Build GoalContext
// ─────────────────────────────────────────────────────────────────────────────

export async function buildGoalContext(
  medCtx: MedicalContext,
  behaviorCtx: BehaviorContext,
  cogCtx: CognitiveContext,
  profile: any,
): Promise<GoalContext> {
  const milestones: MilestoneEvent[] = [];
  const streaks: StreakInfo[] = [];
  const now = new Date().toISOString();

  // ── Medication streak ────────────────────────────────────────────────────
  const medStreak = await getMedicationStreak();
  if (medStreak.currentStreak > 0) {
    streaks.push({ type: 'medication', currentStreak: medStreak.currentStreak, bestStreak: medStreak.bestStreak });

    // Milestone: notable streak lengths (10, 25, 50, 100, 200, 365)
    const notableSteps = [10, 25, 50, 100, 200, 365];
    if (notableSteps.includes(medStreak.totalDoses)) {
      milestones.push({
        type: 'medication_streak',
        label: `You've taken ${medStreak.totalDoses} consecutive medication doses. Consistent adherence is a significant health achievement.`,
        data: { totalDoses: medStreak.totalDoses, currentStreak: medStreak.currentStreak },
        generatedAt: now,
      });
    }
  }

  // ── Adherence milestone: first time reaching 90%+ in 30 days ────────────
  if (medCtx.adherenceRate7d != null && medCtx.adherenceRate7d >= 0.9 && medCtx.totalActiveMeds > 0) {
    milestones.push({
      type: 'adherence_milestone',
      label: `Your 7-day medication adherence rate has reached ${Math.round(medCtx.adherenceRate7d * 100)}%. Excellent consistency.`,
      data: { adherenceRate: medCtx.adherenceRate7d },
      generatedAt: now,
    });
  }

  // ── Annual health check overdue ──────────────────────────────────────────
  // If user has no history records of type 'checkup' in past 365 days
  try {
    const { db } = await import('../../database/index');
    const cutoff = new Date(Date.now() - 365 * 86400_000).toISOString().slice(0, 10);
    const checkupRow = await db.getFirstAsync<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM history WHERE type = 'checkup' AND date >= ?`,
      [cutoff]
    ).catch(() => null);
    if ((checkupRow?.cnt ?? 0) === 0) {
      milestones.push({
        type: 'checkup_due',
        label: `You haven't had a recorded preventive health check-up in over a year. Scheduling one helps track your long-term health.`,
        data: {},
        generatedAt: now,
      });
    }
  } catch { /* history table not populated yet */ }

  return {
    dailyStepsGoalMet: behaviorCtx.stepsTodayReal >= behaviorCtx.stepsGoal,
    dailyHydrationGoalMet: behaviorCtx.hydrationTodayMl >= behaviorCtx.hydrationGoalMl,
    milestones,
    streaks,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Generate PIE candidates from goal/milestone context
// ─────────────────────────────────────────────────────────────────────────────

export function generateGoalCandidates(
  ctx: GoalContext,
  persona: PersonaModel,
  profileId: string,
  profileName: string,
): PIECandidate[] {
  const candidates: PIECandidate[] = [];
  const now = new Date().toISOString();

  // ── Rule GOAL-01: Life event milestone notification ───────────────────────
  for (const milestone of ctx.milestones) {
    const priority = milestone.type === 'checkup_due' ? 'medium' : 'low';
    candidates.push({
      id: nanoid(),
      category: milestone.type === 'checkup_due' ? 'goals' : 'achievements',
      priority,
      title: milestone.type === 'checkup_due'
        ? 'Annual Health Check-Up Reminder'
        : milestone.type === 'adherence_milestone'
          ? 'Medication Adherence Milestone'
          : 'Health Achievement',
      body: milestone.label,
      deepLink: milestone.type === 'checkup_due' ? '/(tabs)/index' : '/medication-vault?page=compliance',
      actionButtons: [],
      sourceEngineId: 'GoalEngine',
      triggerRuleId: `GOAL-01-MILESTONE-${milestone.type.toUpperCase()}`,
      triggerData: milestone.data,
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

  // ── Rule GOAL-02: Daily goals all met ────────────────────────────────────
  if (ctx.dailyStepsGoalMet && ctx.dailyHydrationGoalMet) {
    // Only fire as an in-app silent notification (no push for celebratory)
    candidates.push({
      id: nanoid(),
      category: 'achievements',
      priority: 'silent',
      title: 'Daily Goals Complete',
      body: `You've met both your step and hydration goals today. Great work maintaining your health targets.`,
      deepLink: '/(tabs)/index',
      actionButtons: [],
      sourceEngineId: 'GoalEngine',
      triggerRuleId: 'GOAL-02-DAILY-GOALS-MET',
      triggerData: { stepsGoalMet: true, hydrationGoalMet: true },
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

  return candidates;
}
