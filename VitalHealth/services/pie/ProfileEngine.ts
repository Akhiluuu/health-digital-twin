// services/pie/ProfileEngine.ts
// ─────────────────────────────────────────────────────────────────────────────
// Builds and continuously updates the Living User Persona Model.
// Sources: UserProfile (Firebase), local SQLite history, medicine history,
//          simulation history, cognitive sessions, hydration, steps.
// Outputs: PersonaModel + ProfileContext
// ─────────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { log } from '../../utils/logger';
import type { PersonaModel, BehavioralArchetype, ProfileContext } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Age utility
// ─────────────────────────────────────────────────────────────────────────────

function calcAge(dob: string | undefined | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const diffMs = Date.now() - birth.getTime();
  return Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000));
}

// ─────────────────────────────────────────────────────────────────────────────
// Parse conditions from profile fields
// ─────────────────────────────────────────────────────────────────────────────

function deriveConditions(profile: any): string[] {
  const conditions: string[] = [];
  if (profile.biogears_has_type1_diabetes) conditions.push('Type1Diabetes');
  if (profile.biogears_has_type2_diabetes) conditions.push('Type2Diabetes');
  if (profile.biogears_has_anemia)         conditions.push('Anemia');
  if (profile.biogears_is_smoker)          conditions.push('Smoker');
  // Parse history.selectedConditions if present
  const selected: string[] = profile.history?.selectedConditions ?? [];
  selected.forEach(c => { if (!conditions.includes(c)) conditions.push(c); });
  return conditions;
}

// ─────────────────────────────────────────────────────────────────────────────
// Archetype inference — derived from actual data signals, never hardcoded
// ─────────────────────────────────────────────────────────────────────────────

function inferArchetypes(params: {
  ageYears: number | null;
  conditions: string[];
  fitnessLevel: string | null;
  avgDailySteps: number | null;
  adherenceRate: number | null;
  hasLinkedMembers: boolean;
  managedDependents: number;
  vo2max: number | null;
  lastActiveAt: string | null;
}): BehavioralArchetype[] {
  const archetypes: BehavioralArchetype[] = [];

  const {
    ageYears, conditions, fitnessLevel, avgDailySteps,
    adherenceRate, hasLinkedMembers, managedDependents,
    vo2max, lastActiveAt,
  } = params;

  // ── Athlete
  if (
    (fitnessLevel === 'athlete') ||
    (avgDailySteps != null && avgDailySteps >= 12000) ||
    (vo2max != null && vo2max >= 50)
  ) {
    archetypes.push('athlete');
  }

  // ── Diabetes
  if (conditions.some(c => c.toLowerCase().includes('diabet'))) {
    archetypes.push('diabetes_patient');
  }

  // ── Hypertension (derived from profile conditions)
  if (conditions.some(c => c.toLowerCase().includes('hypert') || c.toLowerCase().includes('blood pressure'))) {
    archetypes.push('hypertension_patient');
  }

  // ── Senior citizen
  if (ageYears != null && ageYears >= 65) {
    archetypes.push('senior_citizen');
  }

  // ── Caregiver (manages dependents)
  if (managedDependents > 0) {
    archetypes.push('caregiver');
  }

  // ── Cardiac
  if (conditions.some(c => c.toLowerCase().includes('cardiac') || c.toLowerCase().includes('heart'))) {
    archetypes.push('cardiac_patient');
  }

  // ── Family manager (has linked members, possibly not dependents)
  if (hasLinkedMembers && managedDependents === 0) {
    archetypes.push('family_manager');
  }

  // ── Chronic patient (has any major condition)
  if (conditions.length >= 2 && !archetypes.includes('athlete')) {
    archetypes.push('chronic_patient');
  }

  // ── Low engagement (no health events in 5+ days)
  if (lastActiveAt) {
    const daysSince = (Date.now() - new Date(lastActiveAt).getTime()) / 86400_000;
    if (daysSince >= 5) archetypes.push('low_engagement');
  } else {
    archetypes.push('low_engagement');
  }

  // ── Highly engaged (adherence > 85%, steps goal met consistently)
  if (
    adherenceRate != null && adherenceRate >= 0.85 &&
    avgDailySteps != null && avgDailySteps >= 8000
  ) {
    archetypes.push('highly_engaged');
  }

  // ── Default
  if (archetypes.length === 0) archetypes.push('healthy_individual');

  return [...new Set(archetypes)] as BehavioralArchetype[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: compute persona from all available data sources
// ─────────────────────────────────────────────────────────────────────────────

export async function computePersona(params: {
  uid: string;
  profile: any;                  // UserProfile from Firebase/local
  linkedMemberCount: number;
  managedDependentCount: number;
  medicationAdherenceRate: number | null;
  avgDailySteps: number | null;
  avgHydrationMl: number | null;
  lastSimulationAt: string | null;
  lastCognitiveAt: string | null;
  lastMedLogAt: string | null;
  lastActiveAt: string | null;
  notificationOpenRate: number | null;
  avgResponseDelayMs: number | null;
}): Promise<PersonaModel> {
  const {
    uid, profile, linkedMemberCount, managedDependentCount,
    medicationAdherenceRate, avgDailySteps, avgHydrationMl,
    lastSimulationAt, lastCognitiveAt, lastMedLogAt, lastActiveAt,
    notificationOpenRate, avgResponseDelayMs,
  } = params;

  const ageYears = calcAge(profile.dateOfBirth || profile.dob);
  const conditions = deriveConditions(profile);
  const archetypes = inferArchetypes({
    ageYears,
    conditions,
    fitnessLevel: profile.biogears_fitness_level ?? null,
    avgDailySteps,
    adherenceRate: medicationAdherenceRate,
    hasLinkedMembers: linkedMemberCount > 0,
    managedDependents: managedDependentCount,
    vo2max: profile.biogears_vo2max ?? null,
    lastActiveAt,
  });

  const primaryArchetype: BehavioralArchetype =
    archetypes.length > 0 ? archetypes[0] : 'unknown';

  const persona: PersonaModel = {
    uid,
    archetypes,
    primaryArchetype,
    ageYears,
    gender: profile.gender || null,
    conditions,
    hasDiabetes: conditions.some(c => c.toLowerCase().includes('diabet')),
    hasHypertension: conditions.some(c => c.toLowerCase().includes('hypert') || c.toLowerCase().includes('blood pressure')),
    isElderly: ageYears != null && ageYears >= 65,
    isCaregiver: managedDependentCount > 0,
    medicationAdherenceRate,
    averageDailySteps: avgDailySteps,
    averageSleepHours: null,
    averageHydrationMl: avgHydrationMl,
    lastSimulationAt,
    lastCognitiveSessionAt: lastCognitiveAt,
    lastMedLogAt,
    lastActiveAt,
    notificationOpenRate,
    averageResponseDelayMs: avgResponseDelayMs,
    computedAt: new Date().toISOString(),
  };

  log(`[PIE ProfileEngine] Persona computed: ${uid} → ${archetypes.join(', ')}`);
  return persona;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build ProfileContext (DND, quiet hours)
// ─────────────────────────────────────────────────────────────────────────────

export async function buildProfileContext(persona: PersonaModel): Promise<ProfileContext> {
  // Quiet hours stored per user preference in AsyncStorage
  const quietStartRaw = await AsyncStorage.getItem('@pie_quiet_start').catch(() => null);
  const quietEndRaw   = await AsyncStorage.getItem('@pie_quiet_end').catch(() => null);
  const dndRaw        = await AsyncStorage.getItem('@pie_dnd').catch(() => null);

  const quietStart = quietStartRaw != null ? parseInt(quietStartRaw, 10) : 22; // 10 PM
  const quietEnd   = quietEndRaw   != null ? parseInt(quietEndRaw,   10) : 7;  // 7 AM

  const isDoNotDisturb = dndRaw === '1';

  return {
    persona,
    isDoNotDisturb,
    preferredQuietStart: isNaN(quietStart) ? 22 : quietStart,
    preferredQuietEnd:   isNaN(quietEnd)   ? 7  : quietEnd,
  };
}
