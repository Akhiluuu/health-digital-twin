// services/pie/MedicalContextEngine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Reads live medication state from SQLite (getTodayMedicineStats, getMedicines)
// and from Medication Vault API (adherence, inventory, pending prescriptions).
// Produces MedicalContext + candidate PIE notifications.
// NEVER invents medication data. All output is traceable to SQLite records.
// ─────────────────────────────────────────────────────────────────────────────

import { log } from '../../utils/logger';
import type { MedicalContext, PIECandidate, PersonaModel } from './types';
import { nanoid } from '@/utils/nanoid';

// ─────────────────────────────────────────────────────────────────────────────
// Parse time string "HH:MM" → minutes since midnight
// ─────────────────────────────────────────────────────────────────────────────

function timeToMinutes(t: string): number {
  const parts = (t || '').split(':');
  const h = parseInt(parts[0] ?? '0', 10);
  const m = parseInt(parts[1] ?? '0', 10);
  if (isNaN(h) || isNaN(m)) return 0;
  return h * 60 + m;
}

function nowMinutes(): number {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

// ─────────────────────────────────────────────────────────────────────────────
// Build MedicalContext from real SQLite data
// ─────────────────────────────────────────────────────────────────────────────

export async function buildMedicalContext(profileId: string): Promise<MedicalContext> {
  try {
    const { getMedicines, getTodayMedicineStats } = await import('../../database/medicineDB');

    const allMeds = getMedicines();
    const stats = await getTodayMedicineStats();

    // Calculate derived counts safely since DB stats return { taken, missed }
    const totalScheduled = allMeds.length;
    const takenCount = stats.taken || 0;
    const missedCount = stats.missed || 0;
    const pendingCount = Math.max(0, totalScheduled - takenCount - missedCount);

    const todayStats = {
      total: totalScheduled,
      taken: takenCount,
      missed: missedCount,
      pending: pendingCount,
    };

    const now = nowMinutes();
    const OVERDUE_THRESHOLD_MINS = 30;  // med is overdue if 30+ min past schedule
    const DUE_WINDOW_MINS = 20;          // show as "due now" within ±20 min of scheduled time

    const dueNowMeds: MedicalContext['dueNowMeds'] = [];
    const overdueMeds: MedicalContext['overdueMeds'] = [];

    const overdueReviews: MedicalContext['overdueReviews'] = [];

    for (const med of allMeds) {
      if (med.nextReviewDate && med.reviewStatus !== "Archived" && med.reviewStatus !== "Stop") {
        try {
          const reviewDateObj = new Date(med.nextReviewDate + "T00:00:00");
          if (!isNaN(reviewDateObj.getTime())) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const diffTime = today.getTime() - reviewDateObj.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays > 0) {
              overdueReviews.push({
                id: med.id,
                name: med.name,
                daysOverdue: diffDays,
              });
            }
          }
        } catch {}
      }

      if (!med.time || med.taken) continue; // already taken today
      const scheduledMin = timeToMinutes(med.time);
      const diff = now - scheduledMin;

      if (diff >= OVERDUE_THRESHOLD_MINS) {
        overdueMeds.push({
          id: med.id,
          name: med.name,
          overdueMins: diff,
        });
      } else if (Math.abs(diff) <= DUE_WINDOW_MINS) {
        dueNowMeds.push({
          id: med.id,
          name: med.name,
          time: med.time,
          dose: med.dose ?? '',
        });
      }
    }

    // ── Inventory: estimate days remaining per med from adherence history ──────
    let lowInventoryMeds: MedicalContext['lowInventoryMeds'] = [];
    try {
      const { listInventory } = await import('../medicationVaultAPI');
      const inventoryRes = await listInventory().catch(() => null);
      const inventory = inventoryRes?.data ?? [];
      lowInventoryMeds = inventory
        .filter((inv: any) => inv.days_remaining != null && inv.days_remaining <= 7)
        .map((inv: any) => ({
          id: inv.medicine_id,
          name: inv.name || 'Unknown',
          daysRemaining: Math.round(inv.days_remaining),
        }));
    } catch {
      // Medication Vault API unavailable — skip inventory check
    }

    // ── Adherence 7-day rate ──────────────────────────────────────────────────
    let adherenceRate7d: number | null = null;
    try {
      const { getCompliance } = await import('../medicationVaultAPI');
      const complianceRes = await getCompliance(7).catch(() => null);
      adherenceRate7d = complianceRes?.data?.adherence_pct != null
        ? complianceRes.data.adherence_pct / 100
        : null;
    } catch {
      // Fall back to local stat estimate
      if (todayStats.total > 0) {
        adherenceRate7d = todayStats.taken / todayStats.total;
      }
    }

    // ── Last taken timestamp ──────────────────────────────────────────────────
    let lastTakenAt: string | null = null;
    try {
      const { db } = await import('../../database/index');
      const row = (await db.getFirstAsync(
        `SELECT takenAt FROM medicine_history ORDER BY takenAt DESC LIMIT 1`
      )) as { takenAt: string } | null;
      lastTakenAt = row?.takenAt ?? null;
    } catch {
      // Ignore
    }

    // ── Count meds without linked prescription (from Vault API) ──────────────
    let pendingDocuments = 0;
    try {
      const { listPrescriptions } = await import('../medicationVaultAPI');
      const prescriptionsRes = await listPrescriptions().catch(() => null);
      const prescriptionsCount = prescriptionsRes?.data?.length ?? 0;
      pendingDocuments = Math.max(0, allMeds.length - prescriptionsCount);
    } catch {
      // Skip
    }

    return {
      totalActiveMeds: allMeds.length,
      dueNowMeds,
      overdueMeds,
      lowInventoryMeds,
      overdueReviews,
      adherenceRate7d,
      lastTakenAt,
      pendingDocuments,
      todayStats,
    };
  } catch (err) {
    log('[PIE MedicalEngine] buildMedicalContext error:', err);
    return {
      totalActiveMeds: 0,
      dueNowMeds: [],
      overdueMeds: [],
      lowInventoryMeds: [],
      overdueReviews: [],
      adherenceRate7d: null,
      lastTakenAt: null,
      pendingDocuments: 0,
      todayStats: { total: 0, taken: 0, missed: 0, pending: 0 },
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Generate PIE candidates from medical state
// ─────────────────────────────────────────────────────────────────────────────

export function generateMedicalCandidates(
  ctx: MedicalContext,
  persona: PersonaModel,
  profileId: string,
  profileName: string,
): PIECandidate[] {
  const candidates: PIECandidate[] = [];
  const now = new Date().toISOString();

  // ── Rule MED-01: Low medication inventory ────────────────────────────────
  for (const inv of ctx.lowInventoryMeds) {
    const daysStr = inv.daysRemaining <= 1
      ? 'less than a day'
      : `approximately ${inv.daysRemaining} day${inv.daysRemaining !== 1 ? 's' : ''}`;

    const body = persona.hasDiabetes && inv.name.toLowerCase().includes('metformin')
      ? `You have ${daysStr} of ${inv.name} remaining based on your actual adherence history. Refilling now avoids gaps in your diabetes management.`
      : `You have ${daysStr} of ${inv.name} remaining based on your actual adherence history.`;

    candidates.push({
      id: nanoid(),
      category: 'medication',
      priority: inv.daysRemaining <= 2 ? 'high' : 'medium',
      title: 'Medication Supply Running Low',
      body,
      deepLink: '/medication-vault',
      actionButtons: [{ id: 'VIEW_INVENTORY', label: 'View Inventory' }],
      sourceEngineId: 'MedicalContextEngine',
      triggerRuleId: 'MED-01-LOW-INVENTORY',
      triggerData: { medicineId: inv.id, medicineName: inv.name, daysRemaining: inv.daysRemaining },
      triggerEventId: String(inv.id),
      profileId,
      profileName,
      profilePhoto: null,
      deliveryChannel: 'push',
      requiresImmediateDelivery: inv.daysRemaining <= 1,
      suppressIfDoNotDisturb: inv.daysRemaining > 2,
      generatedAt: now,
    });
  }

  // ── Rule MED-02: Overdue medication ──────────────────────────────────────
  for (const med of ctx.overdueMeds) {
    const overdueMins = med.overdueMins;
    const overdueStr = overdueMins >= 60
      ? `${Math.floor(overdueMins / 60)}h ${overdueMins % 60}m`
      : `${overdueMins} minutes`;

    const isElderly = persona.isElderly;
    const caregiverNote = persona.isCaregiver
      ? ' Your caregiver will only be notified if this dose remains unconfirmed beyond the grace period.'
      : '';

    const body = isElderly
      ? `Your ${med.name} dose is ${overdueStr} past schedule. Tap to confirm.${caregiverNote}`
      : `Your ${med.name} was due ${overdueStr} ago. Logging it now keeps your adherence record accurate.`;

    candidates.push({
      id: nanoid(),
      category: 'medication',
      priority: overdueMins >= 120 ? 'high' : 'medium',
      title: 'Medication Overdue',
      body,
      deepLink: '/medication-vault',
      actionButtons: [
        { id: 'MEDICINE_TAKEN', label: '✅ Taken' },
        { id: 'MEDICINE_MISSED', label: 'Mark Missed' },
      ],
      sourceEngineId: 'MedicalContextEngine',
      triggerRuleId: 'MED-02-OVERDUE',
      triggerData: { medicineId: med.id, medicineName: med.name, overdueMins },
      triggerEventId: String(med.id),
      profileId,
      profileName,
      profilePhoto: null,
      deliveryChannel: 'push',
      requiresImmediateDelivery: overdueMins >= 120,
      suppressIfDoNotDisturb: false,
      generatedAt: now,
    });
  }

  // ── Rule MED-03: Prescription missing for a tracked medication ────────────
  if (ctx.pendingDocuments > 0) {
    candidates.push({
      id: nanoid(),
      category: 'documents',
      priority: 'low',
      title: 'Prescription Document Missing',
      body: `${ctx.pendingDocuments} medication${ctx.pendingDocuments > 1 ? 's' : ''} ${ctx.pendingDocuments > 1 ? 'were' : 'was'} added without a linked prescription. Adding the prescription improves medication verification and emergency readiness.`,
      deepLink: '/medication-vault?page=vault',
      actionButtons: [{ id: 'OPEN_VAULT', label: 'Open Vault' }],
      sourceEngineId: 'MedicalContextEngine',
      triggerRuleId: 'MED-03-MISSING-PRESCRIPTION',
      triggerData: { count: ctx.pendingDocuments },
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

  // ── Rule MED-04: Low adherence trend ─────────────────────────────────────
  if (ctx.adherenceRate7d != null && ctx.adherenceRate7d < 0.6 && ctx.totalActiveMeds > 0) {
    const pct = Math.round(ctx.adherenceRate7d * 100);
    candidates.push({
      id: nanoid(),
      category: 'medication',
      priority: 'medium',
      title: 'Medication Adherence Needs Attention',
      body: `Your medication adherence over the past 7 days is ${pct}%. Consistent medication adherence is critical for treatment effectiveness.`,
      deepLink: '/medication-vault?page=analytics',
      actionButtons: [{ id: 'VIEW_SCHEDULE', label: 'View Schedule' }],
      sourceEngineId: 'MedicalContextEngine',
      triggerRuleId: 'MED-04-LOW-ADHERENCE',
      triggerData: { adherenceRate: ctx.adherenceRate7d, periodDays: 7 },
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
  // ── Rule MED-05: Overdue Clinical Review ──────────────────────────────────
  for (const rev of ctx.overdueReviews || []) {
    const daysStr = rev.daysOverdue === 1 ? '1 day' : `${rev.daysOverdue} days`;
    candidates.push({
      id: nanoid(),
      category: 'medication',
      priority: 'high',
      title: 'Medication Review Overdue',
      body: `Your clinical review for ${rev.name} is ${daysStr} overdue. Please review this medication to update your treatment plan.`,
      deepLink: '/medication-vault',
      actionButtons: [{ id: 'MANAGE_REVIEW', label: 'Review Now' }],
      sourceEngineId: 'MedicalContextEngine',
      triggerRuleId: 'MED-05-OVERDUE-REVIEW',
      triggerData: { medicineId: rev.id, medicineName: rev.name, daysOverdue: rev.daysOverdue },
      triggerEventId: String(rev.id),
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
