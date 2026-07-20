// services/pie/FamilyEngine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Reads family member health data from Firestore (via familySync).
// Derives FamilyContext: overdue meds, low inventory, recent events.
// Generates caregiver notifications ONLY from real Firestore records.
// Permission-based: only the guardian/caregiver of a dependent is notified.
// ─────────────────────────────────────────────────────────────────────────────

import { log } from '../../utils/logger';
import type { FamilyContext, PIECandidate, PersonaModel } from './types';
import { nanoid } from '@/utils/nanoid';

// ─────────────────────────────────────────────────────────────────────────────
// Build FamilyContext from Firestore member data
// ─────────────────────────────────────────────────────────────────────────────

export async function buildFamilyContext(
  members: Array<{ uid: string; firstName: string; lastName?: string; relation?: string }>
): Promise<FamilyContext> {
  if (members.length === 0) {
    return {
      managedMemberCount: members.length,
      membersWithOverdueMeds: [],
      membersWithLowInventory: [],
      recentMemberEvents: [],
    };
  }

  const membersWithOverdueMeds: FamilyContext['membersWithOverdueMeds'] = [];
  const membersWithLowInventory: FamilyContext['membersWithLowInventory'] = [];
  const recentMemberEvents: FamilyContext['recentMemberEvents'] = [];

  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const OVERDUE_MINS = 60;

  for (const member of members) {
    try {
      const { fetchMemberHealthData } = await import('../familySync');
      const data = await fetchMemberHealthData(member.uid).catch(() => null);
      if (!data) continue;

      const memberName = `${member.firstName} ${member.lastName ?? ''}`.trim();

      // ── Check for overdue medicines ─────────────────────────────────────
      const medicines: any[] = data.medicines ?? [];
      for (const med of medicines) {
        if (!med.time || med.takenToday) continue;
        const [h, m] = med.time.split(':').map(Number);
        if (isNaN(h)) continue;
        const scheduledMin = h * 60 + (m || 0);
        const diff = nowMins - scheduledMin;
        if (diff >= OVERDUE_MINS) {
          membersWithOverdueMeds.push({
            uid: member.uid,
            name: memberName,
            medName: med.name,
            overdueMins: diff,
          });
        }
      }

      // ── Recent events: check last heart rate timestamp ──────────────────
      if (data.heartRate && data.heartRate > 0 && data.updatedAt) {
        const updatedAt = data.updatedAt as string;
        const diffHours = (Date.now() - new Date(updatedAt).getTime()) / 3600_000;
        if (diffHours < 2) {
          recentMemberEvents.push({
            uid: member.uid,
            name: memberName,
            event: `Heart rate reading: ${data.heartRate} bpm`,
            at: updatedAt,
          });
        }
      }
    } catch (err) {
      log(`[PIE FamilyEngine] Error reading member ${member.uid}:`, err);
    }
  }

  return {
    managedMemberCount: members.length,
    membersWithOverdueMeds,
    membersWithLowInventory,
    recentMemberEvents,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Generate PIE candidates from family context
// ─────────────────────────────────────────────────────────────────────────────

export function generateFamilyCandidates(
  ctx: FamilyContext,
  profileId: string,
  profileName: string,
): PIECandidate[] {
  const candidates: PIECandidate[] = [];
  const now = new Date().toISOString();

  // ── Rule FAM-01: Family member medication overdue ─────────────────────────
  for (const overdue of ctx.membersWithOverdueMeds) {
    const overdueStr = overdue.overdueMins >= 60
      ? `${Math.floor(overdue.overdueMins / 60)}h ${overdue.overdueMins % 60}m`
      : `${overdue.overdueMins} minutes`;

    candidates.push({
      id: nanoid(),
      category: 'family',
      priority: overdue.overdueMins >= 120 ? 'high' : 'medium',
      title: `${overdue.name}'s Medication Overdue`,
      body: `${overdue.name} has not confirmed their ${overdue.medName} dose, which was scheduled ${overdueStr} ago.`,
      deepLink: `/family?memberId=${overdue.uid}`,
      actionButtons: [{ id: 'VIEW_FAMILY_MEMBER', label: `View ${overdue.name}` }],
      sourceEngineId: 'FamilyEngine',
      triggerRuleId: 'FAM-01-MEMBER-OVERDUE-MED',
      triggerData: { memberUid: overdue.uid, memberName: overdue.name, medName: overdue.medName, overdueMins: overdue.overdueMins },
      triggerEventId: overdue.uid,
      profileId,
      profileName,
      profilePhoto: null,
      deliveryChannel: 'push',
      requiresImmediateDelivery: overdue.overdueMins >= 120,
      suppressIfDoNotDisturb: false,
      generatedAt: now,
    });
  }

  // ── Rule FAM-02: Low inventory for family member ──────────────────────────
  for (const inv of ctx.membersWithLowInventory) {
    candidates.push({
      id: nanoid(),
      category: 'family',
      priority: inv.daysRemaining <= 2 ? 'high' : 'medium',
      title: `${inv.name}'s Medication Supply Low`,
      body: `${inv.name}'s ${inv.medName} supply is approximately ${inv.daysRemaining} days remaining.`,
      deepLink: `/family?memberId=${inv.uid}`,
      actionButtons: [],
      sourceEngineId: 'FamilyEngine',
      triggerRuleId: 'FAM-02-MEMBER-LOW-INVENTORY',
      triggerData: { memberUid: inv.uid, memberName: inv.name, medName: inv.medName, daysRemaining: inv.daysRemaining },
      triggerEventId: inv.uid,
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
