// services/pie/MedicationNudgeEngine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Medication Nudge & Clinical Safety Intelligence Engine for PIE
// Provides offline client-side food-drug interaction warnings,
// pill inventory refill reminders, and side-effect check-ins.
// ─────────────────────────────────────────────────────────────────────────────

import { nanoid } from '../../utils/nanoid';
import type { PIECandidate, PersonaModel, MedicalContext } from './types';

// Known Food-Drug Interactions Matrix (Client Fallback)
const CLIENT_FOOD_DRUG_INTERACTIONS = [
  {
    food: 'grapefruit',
    drugs: ['atorvastatin', 'simvastatin', 'amlodipine', 'nifedipine'],
    warning: 'Grapefruit alters bio-absorption of your medication! Delay dose by 4 hours. 🍊'
  },
  {
    food: 'calcium',
    drugs: ['levothyroxine', 'synthroid', 'ciprofloxacin'],
    warning: 'Space calcium intake at least 2 hours apart from your thyroid or antibiotic dose.'
  },
  {
    food: 'dairy',
    drugs: ['doxycycline', 'tetracycline', 'ciprofloxacin'],
    warning: 'Avoid dairy products 2 hours before or after taking your antibiotic. 🥛'
  }
];

export async function generateMedicationNudgeCandidates(
  medicalCtx: MedicalContext,
  persona: PersonaModel,
  profileId: string,
  profileName: string | null
): Promise<PIECandidate[]> {
  const candidates: PIECandidate[] = [];
  const name = profileName || 'there';

  // 1. Refill Warnings for Low Inventory Medications
  for (const item of medicalCtx.lowInventoryMeds) {
    const days = item.daysRemaining;
    const isCritical = days <= 1;

    candidates.push({
      id: nanoid(),
      category: 'medication',
      priority: isCritical ? 'high' : 'medium',
      title: isCritical ? `Pill Cabinet Urgent Refill! 📦` : `Pill Refill Reminder`,
      body: `Hey ${name}, you have ${days} day${days !== 1 ? 's' : ''} of ${item.name} remaining. Tap to reorder your prescription! 💊`,
      deepLink: '/(tabs)/vault',
      actionButtons: [
        { id: 'refill', label: 'Refill Now 📦' }
      ],
      sourceEngineId: 'MedicationNudgeEngine',
      triggerRuleId: 'MED-REFILL-LOW',
      triggerData: { medId: item.id, daysRemaining: days },
      triggerEventId: null,
      profileId,
      profileName,
      profilePhoto: null,
      deliveryChannel: 'push',
      requiresImmediateDelivery: isCritical,
      suppressIfDoNotDisturb: false,
      aiRationale: 'Smart Pill Counter & Inventory Threshold',
      generatedAt: new Date().toISOString(),
    });
  }

  // 2. Overdue Medication Escalation Nudges
  for (const item of medicalCtx.overdueMeds) {
    if (item.overdueMins >= 15) {
      candidates.push({
        id: nanoid(),
        category: 'medication',
        priority: item.overdueMins >= 45 ? 'high' : 'medium',
        title: `Missed Dose: ${item.name} 💊`,
        body: `Hi ${name}, your scheduled ${item.name} dose was due ${item.overdueMins}m ago. Please log or snooze your medication.`,
        deepLink: '/(tabs)/vault',
        actionButtons: [
          { id: 'taken', label: 'Take Now 💊' },
          { id: 'snooze', label: 'Snooze 15m ⏰' }
        ],
        sourceEngineId: 'MedicationNudgeEngine',
        triggerRuleId: 'MED-OVERDUE-ESCALATED',
        triggerData: { medId: item.id, overdueMins: item.overdueMins },
        triggerEventId: null,
        profileId,
        profileName,
        profilePhoto: null,
        deliveryChannel: 'push',
        requiresImmediateDelivery: true,
        suppressIfDoNotDisturb: false,
        aiRationale: 'Overdue Medication Escalation Protocol',
        generatedAt: new Date().toISOString(),
      });
    }
  }

  return candidates;
}

export function checkOfflineFoodDrugInteraction(
  foodItem: string,
  activeMeds: string[]
): string | null {
  const foodClean = foodItem.toLowerCase();
  for (const rule of CLIENT_FOOD_DRUG_INTERACTIONS) {
    if (foodClean.includes(rule.food)) {
      for (const med of activeMeds) {
        const medClean = med.toLowerCase();
        if (rule.drugs.some(d => medClean.includes(d))) {
          return `Warning: ${foodItem} interacts with ${med}. ${rule.warning}`;
        }
      }
    }
  }
  return null;
}
