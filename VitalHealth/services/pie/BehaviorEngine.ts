// services/pie/BehaviorEngine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Reads step counter history and hydration from SQLite.
// Derives behaviour context (steps, hydration, activity streaks).
// Generates context-aware notifications — NOT generic reminders.
// ─────────────────────────────────────────────────────────────────────────────

import { log } from '../../utils/logger';
import type { BehaviorContext, PIECandidate, PersonaModel } from './types';
import { nanoid } from '@/utils/nanoid';

// ─────────────────────────────────────────────────────────────────────────────
// Build BehaviorContext from SQLite + AsyncStorage
// ─────────────────────────────────────────────────────────────────────────────

export async function buildBehaviorContext(
  stepsTodayReal: number,
  stepsGoal: number,
): Promise<BehaviorContext> {
  try {
    // ── Today's hydration from SQLite ─────────────────────────────────────
    let hydrationTodayMl = 0;
    let hydrationGoalMl = 2000;
    try {
      const { db } = await import('../../database/index');
      const today = new Date().toISOString().slice(0, 10);
      const hydRow = (await db.getFirstAsync(
        `SELECT amount FROM hydration WHERE date = ?`,
        [today]
      )) as { amount: number } | null;
      hydrationTodayMl = hydRow?.amount ?? 0;

      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      const goalRaw = await AsyncStorage.getItem('@waterGoal').catch(() => null);
      hydrationGoalMl = goalRaw ? parseInt(goalRaw, 10) || 2000 : 2000;
    } catch { /* skip */ }

    // ── Consecutive active/inactive days (based on step records) ──────────
    let consecutiveActiveDays = 0;
    let consecutiveInactiveDays = 0;
    try {
      const { db } = await import('../../database/index');
      // We use the cloud step sync data stored in the steps collection as a proxy.
      // For local fallback we can check 30-day native step history.
      // If native steps not available, conservatively return 0.
      const ACTIVE_THRESHOLD = 5000;
      for (let i = 0; i < 30; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().slice(0, 10);
        const row = (await db.getFirstAsync(
          `SELECT steps FROM steps WHERE date = ?`,
          [dateStr]
        ).catch(() => null)) as { steps: number } | null;
        const daySteps = row?.steps ?? (i === 0 ? stepsTodayReal : null);
        if (daySteps == null) break;
        if (daySteps >= ACTIVE_THRESHOLD) {
          consecutiveActiveDays++;
          if (i === 0 && consecutiveInactiveDays === 0) consecutiveInactiveDays = 0;
        } else {
          if (consecutiveActiveDays === 0) consecutiveInactiveDays++;
          else break;
        }
      }
    } catch { /* no steps table — skip */ }

    return {
      stepsTodayReal,
      stepsGoal,
      hydrationTodayMl,
      hydrationGoalMl,
      stepsDeficit: Math.max(0, stepsGoal - stepsTodayReal),
      hydrationDeficit: Math.max(0, hydrationGoalMl - hydrationTodayMl),
      consecutiveActiveDays,
      consecutiveInactiveDays,
    };
  } catch (err) {
    log('[PIE BehaviorEngine] buildBehaviorContext error:', err);
    return {
      stepsTodayReal,
      stepsGoal,
      hydrationTodayMl: 0,
      hydrationGoalMl: 2000,
      stepsDeficit: stepsGoal,
      hydrationDeficit: 2000,
      consecutiveActiveDays: 0,
      consecutiveInactiveDays: 0,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Generate PIE candidates from behaviour data
// ─────────────────────────────────────────────────────────────────────────────

export function generateBehaviorCandidates(
  ctx: BehaviorContext,
  persona: PersonaModel,
  profileId: string,
  profileName: string,
): PIECandidate[] {
  const candidates: PIECandidate[] = [];
  const now = new Date().toISOString();
  const hourNow = new Date().getHours();

  // ── Rule BEH-01: Hydration deficit (context-aware) ────────────────────────
  // Only fire in afternoon/evening, and only if meaningfully behind
  if (
    ctx.hydrationDeficit >= 500 &&
    hourNow >= 12 &&
    hourNow <= 21
  ) {
    const intakePct = Math.round((ctx.hydrationTodayMl / ctx.hydrationGoalMl) * 100);
    const isAthlete = persona.archetypes.includes('athlete');
    const body = isAthlete
      ? `Based on today's activity and recorded intake (${ctx.hydrationTodayMl}ml of ${ctx.hydrationGoalMl}ml), you're ${ctx.hydrationDeficit}ml below your hydration target. Recovery performance depends on optimal hydration.`
      : `Based on today's activity and recorded intake, you're ${ctx.hydrationDeficit}ml below your daily hydration target (${intakePct}% complete).`;

    candidates.push({
      id: nanoid(),
      category: 'hydration',
      priority: ctx.hydrationDeficit >= 1000 ? 'medium' : 'low',
      title: 'Hydration Below Target',
      body,
      deepLink: '/(tabs)/index',
      actionButtons: [
        { id: 'LOG_WATER', label: '💧 Log Water' },
      ],
      sourceEngineId: 'BehaviorEngine',
      triggerRuleId: 'BEH-01-HYDRATION-DEFICIT',
      triggerData: { intakeMl: ctx.hydrationTodayMl, goalMl: ctx.hydrationGoalMl, deficitMl: ctx.hydrationDeficit },
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

  // ── Rule BEH-02: Consecutive inactivity ──────────────────────────────────
  if (ctx.consecutiveInactiveDays >= 3) {
    const days = ctx.consecutiveInactiveDays;
    candidates.push({
      id: nanoid(),
      category: 'exercise',
      priority: 'low',
      title: 'Activity Pattern Changed',
      body: `Your step count has been below your goal for ${days} consecutive days. Even light walking supports cardiovascular health and Digital Twin accuracy.`,
      deepLink: '/(tabs)/index',
      actionButtons: [],
      sourceEngineId: 'BehaviorEngine',
      triggerRuleId: 'BEH-02-INACTIVITY-STREAK',
      triggerData: { consecutiveInactiveDays: days },
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
