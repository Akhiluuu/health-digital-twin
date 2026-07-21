// services/pie/PersonalIntelligenceEngine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Master Orchestrator for the VitalHealth Personal Intelligence & Notification Engine (PIE)
// Periodically executes to:
//   1. Build profile context and compute Living Persona
//   2. Build contexts from all sub-engines (Medical, Behavior, Twin, Cognitive, Family, Goal, Anomaly)
//   3. Compute Morning/Evening briefs dynamically (no fabrication, real data only)
//   4. Generate all rule-based candidate notifications
//   5. Filter/deduplicate and check fatigue via Decision Engine
//   6. Deliver approved messages via Delivery Engine
//   7. Learn from engagement signals to auto-suppress rules
// ─────────────────────────────────────────────────────────────────────────────

import { log, error as logError } from '../../utils/logger';
import { getAnyLocalProfile } from '../../database/userProfileDB';
import { fetchLinkedMembers } from '../familySync';
import { savePersonaToDB, wasBriefSentToday, markBriefSent } from '../../database/pieDB';
import { getNotificationPrefsDB } from '../../database/notificationDB';

// Sub-engines
import { computePersona, buildProfileContext } from './ProfileEngine';
import { buildMedicalContext, generateMedicalCandidates } from './MedicalContextEngine';
import { buildBehaviorContext, generateBehaviorCandidates } from './BehaviorEngine';
import { buildTwinContext, generateTwinCandidates } from './DigitalTwinEngine';
import { buildCognitiveContext, generateCognitiveCandidates } from './CognitiveEngine';
import { buildFamilyContext, generateFamilyCandidates } from './FamilyEngine';
import { buildGoalContext, generateGoalCandidates } from './GoalEngine';
import { buildAnomalyContext, generateAnomalyCandidates } from './AnomalyEngine';
import { buildLearningContext, processEngagementSignals } from './LearningEngine';

// Decision & Delivery
import { evaluateCandidates } from './DecisionEngine';
import { deliverNotification, deliverAll } from './DeliveryEngine';
import { nanoid } from '@/utils/nanoid';
import type { PIECandidate, EngineContext } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic Morning Brief generation (purely from real data)
// ─────────────────────────────────────────────────────────────────────────────

async function generateMorningBrief(
  ctx: EngineContext,
  profileId: string,
  profileName: string,
): Promise<PIECandidate | null> {
  const todayStr = new Date().toISOString().slice(0, 10);
  const sent = await wasBriefSentToday(profileId, 'morning');
  if (sent) return null;

  const currentHour = new Date().getHours();
  if (currentHour < 6 || currentHour > 11) return null; // Only morning

  const bulletPoints: string[] = [];

  // Medications
  const medTotal = ctx.medicalEngine.todayStats.total;
  if (medTotal > 0) {
    bulletPoints.push(`• ${medTotal} medication${medTotal !== 1 ? 's' : ''} scheduled today`);
  }

  // Cognitive assessment
  if (ctx.cognitiveEngine.daysSinceLastSession == null || ctx.cognitiveEngine.daysSinceLastSession >= 7) {
    bulletPoints.push('• 1 cognitive assessment due');
  }

  // Digital Twin recommendation
  if (ctx.twinEngine.todayHasLoggableEvents && !ctx.twinEngine.hasRunToday) {
    bulletPoints.push('• Twin simulation recommended after breakfast');
  }

  // Blood pressure pending check (from history records)
  try {
    const { db } = await import('../../database/index');
    const bpRow = (await db.getFirstAsync(
      `SELECT COUNT(*) as cnt FROM history WHERE type = 'blood_pressure' AND date >= ?`,
      [todayStr]
    )) as { cnt: number } | null;
    if ((bpRow?.cnt ?? 0) === 0) {
      bulletPoints.push('• Blood pressure measurement pending');
    }
  } catch {}

  if (bulletPoints.length === 0) return null;

  const body = `Good morning.\n\nToday's agenda:\n${bulletPoints.join('\n')}`;

  return {
    id: nanoid(),
    category: 'ai_insights',
    priority: 'medium',
    title: 'Daily Health Brief',
    body,
    deepLink: '/(tabs)/index',
    actionButtons: [],
    sourceEngineId: 'PersonalIntelligenceEngine',
    triggerRuleId: 'PIE-BRIEF-MORNING',
    triggerData: { bulletPointsCount: bulletPoints.length },
    triggerEventId: null,
    profileId,
    profileName,
    profilePhoto: null,
    deliveryChannel: 'push',
    requiresImmediateDelivery: false,
    suppressIfDoNotDisturb: true,
    generatedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic Evening Brief reflection (purely from real data)
// ─────────────────────────────────────────────────────────────────────────────

async function generateEveningBrief(
  ctx: EngineContext,
  profileId: string,
  profileName: string,
): Promise<PIECandidate | null> {
  const sent = await wasBriefSentToday(profileId, 'evening');
  if (sent) return null;

  const currentHour = new Date().getHours();
  if (currentHour < 18 || currentHour > 22) return null; // Only evening

  const bulletPoints: string[] = [];

  // Medication adherence summary
  const medStats = ctx.medicalEngine.todayStats;
  if (medStats.total > 0) {
    const taken = medStats.taken;
    bulletPoints.push(`• Meds taken: ${taken}/${medStats.total} doses`);
  }

  // Hydration summary
  if (ctx.behaviorEngine.hydrationTodayMl > 0) {
    bulletPoints.push(`• Hydration: ${ctx.behaviorEngine.hydrationTodayMl}ml logged`);
  }

  // Activity summary
  if (ctx.behaviorEngine.stepsTodayReal > 0) {
    bulletPoints.push(`• Activity: ${ctx.behaviorEngine.stepsTodayReal} steps completed`);
  }

  // Twin update check
  if (!ctx.twinEngine.hasRunToday) {
    bulletPoints.push('• Twin simulation recommended before bed');
  }

  if (bulletPoints.length === 0) return null;

  const body = `Good evening.\n\nHere is your health reflection for today:\n${bulletPoints.join('\n')}`;

  return {
    id: nanoid(),
    category: 'ai_insights',
    priority: 'medium',
    title: 'Evening Health Reflection',
    body,
    deepLink: '/(tabs)/index',
    actionButtons: [],
    sourceEngineId: 'PersonalIntelligenceEngine',
    triggerRuleId: 'PIE-BRIEF-EVENING',
    triggerData: { bulletPointsCount: bulletPoints.length },
    triggerEventId: null,
    profileId,
    profileName,
    profilePhoto: null,
    deliveryChannel: 'push',
    requiresImmediateDelivery: false,
    suppressIfDoNotDisturb: true,
    generatedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Master execution routine (triggered periodically)
// ─────────────────────────────────────────────────────────────────────────────

export async function runPIEOrchestrator(
  stepsTodayReal = 0,
  stepsGoal = 8000,
): Promise<void> {
  log('[PIE Orchestrator] Starting cycle...');
  try {
    const profile = await getAnyLocalProfile();
    if (!profile || !profile.uid) {
      log('⚠️ PIE: No local user profile found. Aborting orchestrator run.');
      return;
    }

    const uid = profile.uid;
    const profileName = profile.firstName || 'User';

    // ── Fetch metadata for context building ──────────────────────────────────
    const members = await fetchLinkedMembers().catch(() => []);
    const managedMemberCount = members.length;
    const managedDependentCount = members.filter((m: any) => m.status === 'active').length;

    // ── Construct Contexts ────────────────────────────────────────────────────
    const learningCtx = await buildLearningContext(uid);
    const medicalCtx = await buildMedicalContext(uid);
    const behaviorCtx = await buildBehaviorContext(stepsTodayReal, stepsGoal);
    const twinCtx = await buildTwinContext(uid, behaviorCtx, medicalCtx);
    const cogCtx = await buildCognitiveContext(uid);
    const familyCtx = await buildFamilyContext(members);

    // Living Persona model computation
    const persona = await computePersona({
      uid,
      profile,
      linkedMemberCount: managedMemberCount,
      managedDependentCount,
      medicationAdherenceRate: medicalCtx.adherenceRate7d,
      avgDailySteps: behaviorCtx.stepsTodayReal, // simple daily step proxy
      avgHydrationMl: behaviorCtx.hydrationTodayMl,
      lastSimulationAt: twinCtx.lastRunAt,
      lastCognitiveAt: cogCtx.lastSessionAt,
      lastMedLogAt: medicalCtx.lastTakenAt,
      lastActiveAt: medicalCtx.lastTakenAt || twinCtx.lastRunAt || cogCtx.lastSessionAt,
      notificationOpenRate: learningCtx.openRate,
      avgResponseDelayMs: learningCtx.avgResponseMs,
    });

    // Save persona snapshot locally for inspectability
    await savePersonaToDB(persona);

    const profileEngineCtx = await buildProfileContext(persona);
    const goalCtx = await buildGoalContext(medicalCtx, behaviorCtx, cogCtx, profile);
    const anomalyCtx = await buildAnomalyContext(uid, medicalCtx, behaviorCtx, twinCtx);

    const engineContext: EngineContext = {
      profileEngine: profileEngineCtx,
      medicalEngine: medicalCtx,
      behaviorEngine: behaviorCtx,
      twinEngine: twinCtx,
      cognitiveEngine: cogCtx,
      familyEngine: familyCtx,
      goalEngine: goalCtx,
      anomalyEngine: anomalyCtx,
      learningEngine: learningCtx,
    };

    // ── Candidates Generation ───────────────────────────────────────────────
    const candidates: PIECandidate[] = [];

    // Sub-engine candidates
    candidates.push(...generateMedicalCandidates(medicalCtx, persona, uid, profileName));
    candidates.push(...generateBehaviorCandidates(behaviorCtx, persona, uid, profileName));
    candidates.push(...generateTwinCandidates(twinCtx, persona, medicalCtx, uid, profileName));
    candidates.push(...generateCognitiveCandidates(cogCtx, persona, uid, profileName));
    candidates.push(...generateFamilyCandidates(familyCtx, uid, profileName));
    candidates.push(...generateGoalCandidates(goalCtx, persona, uid, profileName));
    candidates.push(...generateAnomalyCandidates(anomalyCtx, uid, profileName));

    // Dynamic Morning/Evening briefs (treated as candidates passing through decision engine)
    const morningBrief = await generateMorningBrief(engineContext, uid, profileName);
    if (morningBrief) {
      candidates.push(morningBrief);
    }
    const eveningBrief = await generateEveningBrief(engineContext, uid, profileName);
    if (eveningBrief) {
      candidates.push(eveningBrief);
    }

    // ── Decision Gate & Deduplication ─────────────────────────────────────────
    const prefs = await getNotificationPrefsDB(uid).catch(() => null);
    const approved = await evaluateCandidates(candidates, engineContext, prefs);

    // ── Delivery ─────────────────────────────────────────────────────────────
    await deliverAll(approved);

    // Record brief delivery marks if successfully delivered
    for (const apprv of approved) {
      if (apprv.triggerRuleId === 'PIE-BRIEF-MORNING') {
        await markBriefSent(uid, 'morning');
      } else if (apprv.triggerRuleId === 'PIE-BRIEF-EVENING') {
        await markBriefSent(uid, 'evening');
      }
    }

    // ── Learning and Optimization ────────────────────────────────────────────
    await processEngagementSignals(uid);

    log('[PIE Orchestrator] Cycle completed successfully');
  } catch (err) {
    logError('[PIE Orchestrator] Execution crash:', err);
  }
}
