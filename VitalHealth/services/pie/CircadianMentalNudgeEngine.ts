// services/pie/CircadianMentalNudgeEngine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Offline Client-Side Engine for Sleep Architecture, Lab Fasting,
// and Autonomic Stress Reset Candidates.
// ─────────────────────────────────────────────────────────────────────────────

import { nanoid } from '../../utils/nanoid';
import type { PIECandidate, PersonaModel, BehaviorContext, TwinContext } from './types';

export async function generateCircadianMentalCandidates(
  behaviorCtx: BehaviorContext,
  twinCtx: TwinContext,
  persona: PersonaModel,
  profileId: string,
  profileName: string | null
): Promise<PIECandidate[]> {
  const candidates: PIECandidate[] = [];
  const name = profileName || 'there';
  const hour = new Date().getHours();

  // 1. Sleep Wind-Down Prompt (9 PM - 10 PM)
  if (hour === 21 || hour === 22) {
    candidates.push({
      id: nanoid(),
      category: 'sleep_circadian',
      priority: 'medium',
      title: 'Power Down for Deep Sleep 🌙',
      body: `Hey ${name}, dimming screen lights 45 minutes before sleep boosts natural melatonin by up to 34%! 🌙`,
      deepLink: '/(tabs)/index',
      actionButtons: [
        { id: 'wind_down', label: 'Start Wind-Down 🌙' }
      ],
      sourceEngineId: 'CircadianMentalNudgeEngine',
      triggerRuleId: 'SLEEP-WIND-DOWN',
      triggerData: { hour },
      triggerEventId: null,
      profileId,
      profileName,
      profilePhoto: null,
      deliveryChannel: 'push',
      requiresImmediateDelivery: false,
      suppressIfDoNotDisturb: true,
      aiRationale: 'Pineal Melatonin Circadian Protocol',
      generatedAt: new Date().toISOString(),
    });
  }

  // 2. Evening Mindfulness Check-in (8 PM - 9 PM)
  if (hour === 20) {
    candidates.push({
      id: nanoid(),
      category: 'stress_reset',
      priority: 'low',
      title: 'Mindful Evening Reflection 🌿',
      body: `Hi ${name}, take 30 seconds to reflect on today. Log a mood tag to train your mental wellness digital twin!`,
      deepLink: '/(tabs)/index',
      actionButtons: [
        { id: 'log_mood', label: 'Log Mood 📝' }
      ],
      sourceEngineId: 'CircadianMentalNudgeEngine',
      triggerRuleId: 'MENTAL-EVENING-CHECKIN',
      triggerData: { hour },
      triggerEventId: null,
      profileId,
      profileName,
      profilePhoto: null,
      deliveryChannel: 'in_app',
      requiresImmediateDelivery: false,
      suppressIfDoNotDisturb: true,
      aiRationale: 'Emotional Well-Being Check-In',
      generatedAt: new Date().toISOString(),
    });
  }

  return candidates;
}
