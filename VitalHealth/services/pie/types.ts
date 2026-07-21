// services/pie/types.ts
// ─────────────────────────────────────────────────────────────────────────────
// Shared type system for the VitalHealth Personal Intelligence Engine (PIE)
// ─────────────────────────────────────────────────────────────────────────────

// ── Priority levels ───────────────────────────────────────────────────────────
export type PIEPriority = 'emergency' | 'critical' | 'high' | 'medium' | 'low' | 'silent';

// ── Notification categories (maps to notificationDB categories + extras) ──────
export type PIECategory =
  | 'medication'
  | 'health_monitoring'
  | 'digital_twin'
  | 'appointments'
  | 'lab_results'
  | 'documents'
  | 'caregiver'
  | 'emergency'
  | 'ai_insights'
  | 'brain_lab'
  | 'exercise'
  | 'recovery'
  | 'hydration'
  | 'nutrition'
  | 'sleep'
  | 'stress'
  | 'family'
  | 'goals'
  | 'achievements'
  | 'life_events'
  | 'predictions'
  | 'risk_alerts'
  | 'system'
  | 'vitals';

// ── Behavioural archetypes — derived, never manually assigned ─────────────────
export type BehavioralArchetype =
  | 'athlete'
  | 'chronic_patient'
  | 'hypertension_patient'
  | 'diabetes_patient'
  | 'senior_citizen'
  | 'caregiver'
  | 'rehabilitation_patient'
  | 'weight_loss_journey'
  | 'healthy_individual'
  | 'shift_worker'
  | 'busy_professional'
  | 'post_surgery_recovery'
  | 'cardiac_patient'
  | 'sleep_deprived'
  | 'low_engagement'
  | 'highly_engaged'
  | 'family_manager'
  | 'unknown';

// ── Living persona: the continuously evolving user model ──────────────────────
export interface PersonaModel {
  uid: string;
  archetypes: BehavioralArchetype[];       // One or more, ordered by confidence
  primaryArchetype: BehavioralArchetype;

  // Derived from profile
  ageYears: number | null;
  gender: string | null;
  conditions: string[];                    // e.g. ['Type2Diabetes', 'Hypertension']
  hasDiabetes: boolean;
  hasHypertension: boolean;
  isElderly: boolean;                      // age >= 65
  isCaregiver: boolean;                    // has managed dependents

  // Derived from behaviour
  medicationAdherenceRate: number | null;  // 0–1, last 30 days
  averageDailySteps: number | null;
  averageSleepHours: number | null;        // not yet wired — placeholder for future sensor
  averageHydrationMl: number | null;
  lastSimulationAt: string | null;         // ISO
  lastCognitiveSessionAt: string | null;   // ISO
  lastMedLogAt: string | null;             // ISO
  lastActiveAt: string | null;             // ISO — any health event

  // Engagement signals
  notificationOpenRate: number | null;     // 0–1
  averageResponseDelayMs: number | null;

  // Computed at
  computedAt: string;                      // ISO
}

// ── Data that each engine contributes to the decision ─────────────────────────
export interface EngineContext {
  profileEngine:     ProfileContext;
  medicalEngine:     MedicalContext;
  behaviorEngine:    BehaviorContext;
  twinEngine:        TwinContext;
  cognitiveEngine:   CognitiveContext;
  familyEngine:      FamilyContext;
  goalEngine:        GoalContext;
  anomalyEngine:     AnomalyContext;
  learningEngine:    LearningContext;
}

export interface ProfileContext {
  persona: PersonaModel;
  isDoNotDisturb: boolean;
  preferredQuietStart: number; // hour 0-23
  preferredQuietEnd: number;
}

export interface MedicalContext {
  totalActiveMeds: number;
  dueNowMeds: Array<{ id: number; name: string; time: string; dose: string }>;
  overdueMeds: Array<{ id: number; name: string; overdueMins: number }>;
  lowInventoryMeds: Array<{ id: number; name: string; daysRemaining: number }>;
  overdueReviews: Array<{ id: number; name: string; daysOverdue: number }>;
  adherenceRate7d: number | null;   // 0–1
  lastTakenAt: string | null;
  pendingDocuments: number;         // meds without linked prescription
  todayStats: { total: number; taken: number; missed: number; pending: number };
}

export interface BehaviorContext {
  stepsTodayReal: number;
  stepsGoal: number;
  hydrationTodayMl: number;
  hydrationGoalMl: number;
  stepsDeficit: number;
  hydrationDeficit: number;
  consecutiveActiveDays: number;
  consecutiveInactiveDays: number;
}

export interface TwinContext {
  lastRunAt: string | null;
  daysSinceLastRun: number | null;
  hasRunToday: boolean;
  todayHasLoggableEvents: boolean;   // steps, meals, meds all > 0
  lastAnomalies: string[];           // anomaly labels from last simulation
  hasUnacknowledgedAnomaly: boolean;
}

export interface CognitiveContext {
  lastSessionAt: string | null;
  daysSinceLastSession: number | null;
  lastScore: number | null;
  sessionCount: number;
  trendDirection: 'improving' | 'declining' | 'stable' | 'unknown';
}

export interface FamilyContext {
  managedMemberCount: number;
  membersWithOverdueMeds: Array<{ uid: string; name: string; medName: string; overdueMins: number }>;
  membersWithLowInventory: Array<{ uid: string; name: string; medName: string; daysRemaining: number }>;
  recentMemberEvents: Array<{ uid: string; name: string; event: string; at: string }>;
}

export interface GoalContext {
  dailyStepsGoalMet: boolean;
  dailyHydrationGoalMet: boolean;
  milestones: MilestoneEvent[];
  streaks: StreakInfo[];
}

export interface MilestoneEvent {
  type: 'medication_streak' | 'step_goal' | 'cognitive_streak' | 'adherence_milestone' | 'checkup_due' | 'custom';
  label: string;
  data: Record<string, unknown>;
  generatedAt: string;
}

export interface StreakInfo {
  type: string;
  currentStreak: number;
  bestStreak: number;
}

export interface AnomalyContext {
  detectedAnomalies: DetectedAnomaly[];
}

export interface DetectedAnomaly {
  ruleId: string;
  category: PIECategory;
  severity: PIEPriority;
  summary: string;
  evidence: Record<string, unknown>;
  detectedAt: string;
}

export interface LearningContext {
  openRate: number;         // 0–1
  avgResponseMs: number;
  snoozeRate: number;       // 0–1
  dismissRate: number;      // 0–1
  bestHourOfDay: number | null;  // 0–23
  worstHours: number[];
}

// ── A candidate notification before the Decision Engine evaluates it ──────────
export interface PIECandidate {
  id: string;
  category: PIECategory;
  priority: PIEPriority;
  title: string;
  body: string;
  deepLink: string | null;
  actionButtons: PIEAction[];

  // Explainability
  sourceEngineId: string;
  triggerRuleId: string;
  triggerData: Record<string, unknown>;  // what real data triggered this
  triggerEventId: string | null;         // DB record ID that originated this

  // Targeting
  profileId: string;
  profileName: string | null;
  profilePhoto: string | null;

  // Delivery hints
  deliveryChannel: 'push' | 'silent' | 'in_app' | 'banner';
  requiresImmediateDelivery: boolean;
  suppressIfDoNotDisturb: boolean;

  generatedAt: string;
}

export interface PIEAction {
  id: string;
  label: string;
}

// ── Audit log entry: every decision is recorded ───────────────────────────────
export interface PIEAuditEntry {
  id: string;
  candidateId: string;
  profileId: string;
  category: PIECategory;
  priority: PIEPriority;
  title: string;
  decision: 'approved' | 'rejected';
  rejectReason: string | null;
  sourceEngineId: string;
  triggerRuleId: string;
  triggerData: string;             // JSON
  deliveredViaChannel: string | null;
  evaluatedAt: string;             // ISO
}

// ── Learning signal: one row per notification interaction ─────────────────────
export interface PIEInteractionSignal {
  candidateId: string;
  profileId: string;
  interaction: 'opened' | 'dismissed' | 'snoozed' | 'acted' | 'ignored';
  delayMs: number | null;
  interactedAt: string;
}
