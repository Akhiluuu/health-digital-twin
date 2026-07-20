// services/pie/CognitiveEngine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Reads cognitive_sessions from SQLite.
// Derives last session, trend direction, streak, and time since last assessment.
// Generates context-aware Brain Lab candidates.
// ─────────────────────────────────────────────────────────────────────────────

import { log } from '../../utils/logger';
import type { CognitiveContext as CogCtx, PIECandidate, PersonaModel } from './types';
import { nanoid } from '@/utils/nanoid';

// ─────────────────────────────────────────────────────────────────────────────
// Build CognitiveContext from SQLite cognitive_sessions
// ─────────────────────────────────────────────────────────────────────────────

export async function buildCognitiveContext(uid: string): Promise<CogCtx> {
  try {
    const { db } = await import('../../database/index');

    const rows = await db.getAllAsync<any>(
      `SELECT overall_score, completed_at FROM cognitive_sessions
       WHERE uid = ?
       ORDER BY completed_at DESC
       LIMIT 10`,
      [uid]
    );

    if (!rows || rows.length === 0) {
      return { lastSessionAt: null, daysSinceLastSession: null, lastScore: null, sessionCount: 0, trendDirection: 'unknown' };
    }

    const lastSessionAt = rows[0].completed_at as string;
    const daysSince = (Date.now() - new Date(lastSessionAt).getTime()) / 86400_000;
    const lastScore = rows[0].overall_score as number;
    const sessionCount = rows.length;

    // ── Trend: compare latest 3 sessions vs previous 3 ─────────────────────
    let trendDirection: CogCtx['trendDirection'] = 'unknown';
    if (rows.length >= 4) {
      const recent = rows.slice(0, 3).reduce((s: number, r: any) => s + (r.overall_score ?? 0), 0) / 3;
      const older  = rows.slice(3, 6).reduce((s: number, r: any) => s + (r.overall_score ?? 0), 0) / Math.min(3, rows.length - 3);
      const delta = recent - older;
      if (delta >= 3)       trendDirection = 'improving';
      else if (delta <= -3) trendDirection = 'declining';
      else                  trendDirection = 'stable';
    }

    return { lastSessionAt, daysSinceLastSession: daysSince, lastScore, sessionCount, trendDirection };
  } catch (err) {
    log('[PIE CognitiveEngine] buildCognitiveContext error:', err);
    return { lastSessionAt: null, daysSinceLastSession: null, lastScore: null, sessionCount: 0, trendDirection: 'unknown' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Generate PIE candidates from cognitive state
// ─────────────────────────────────────────────────────────────────────────────

export function generateCognitiveCandidates(
  ctx: CogCtx,
  persona: PersonaModel,
  profileId: string,
  profileName: string,
): PIECandidate[] {
  const candidates: PIECandidate[] = [];
  const now = new Date().toISOString();

  // ── Rule COG-01: Due for assessment ──────────────────────────────────────
  const DUE_AFTER_DAYS = 7;
  if (
    ctx.daysSinceLastSession == null ||
    ctx.daysSinceLastSession >= DUE_AFTER_DAYS
  ) {
    const dayStr = ctx.daysSinceLastSession != null
      ? `It's been ${Math.floor(ctx.daysSinceLastSession)} days since your last cognitive assessment.`
      : `You haven't completed a cognitive assessment yet.`;

    const trendNote = ctx.trendDirection === 'declining'
      ? ' Your recent scores show a declining trend — completing today\'s session improves long-term accuracy.'
      : ' Completing today\'s session improves long-term trend accuracy.';

    candidates.push({
      id: nanoid(),
      category: 'brain_lab',
      priority: ctx.trendDirection === 'declining' ? 'medium' : 'low',
      title: 'Cognitive Assessment Due',
      body: dayStr + trendNote,
      deepLink: '/brain',
      actionButtons: [{ id: 'OPEN_BRAIN_LAB', label: 'Open Brain Lab' }],
      sourceEngineId: 'CognitiveEngine',
      triggerRuleId: 'COG-01-DUE-ASSESSMENT',
      triggerData: { daysSince: ctx.daysSinceLastSession, trendDirection: ctx.trendDirection },
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

  // ── Rule COG-02: Declining trend alert ───────────────────────────────────
  if (ctx.trendDirection === 'declining' && ctx.sessionCount >= 6) {
    candidates.push({
      id: nanoid(),
      category: 'risk_alerts',
      priority: 'medium',
      title: 'Cognitive Score Trend',
      body: `Your cognitive assessment scores have declined over the past several sessions. This may be worth discussing with your healthcare provider.`,
      deepLink: '/brain',
      actionButtons: [{ id: 'VIEW_BRAIN_HISTORY', label: 'View History' }],
      sourceEngineId: 'CognitiveEngine',
      triggerRuleId: 'COG-02-DECLINING-TREND',
      triggerData: { trendDirection: 'declining', sessionCount: ctx.sessionCount, lastScore: ctx.lastScore },
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

  return candidates;
}
