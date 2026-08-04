// services/journeyService.ts
// Health Journey Engine service layer for VitalHealth React Native app.
// All calls target the VitalHealth backend (/api/v5/journey/*).
// Graceful offline fallback to cached data via AsyncStorage.

import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Type Definitions ─────────────────────────────────────────────────────────

export interface JourneySnapshot {
  patient_id: string;
  health_score: number;
  health_status: string;
  status_color: 'green' | 'amber' | 'red';
  whats_changed_today: string;
  todays_top_priority: string;
  active_risk_count: number;
  active_risks: string[];
  twin_insight: string;
  active_goals_count: number;
  completed_milestones_count: number;
  latest_milestone: string | null;
  medication_adherence_pct: number;
  recent_insights: JourneyInsight[];
  updated_at: string;
}

export interface JourneyTimelineEvent {
  event_id: string;
  patient_id: string;
  event_type: string;
  timestamp: string;
  title: string;
  description: string;
  payload: Record<string, any>;
}

export interface HealthMilestone {
  milestone_id: string;
  patient_id: string;
  milestone_type: string;
  title: string;
  description: string;
  impact_score: number;
  achieved_at: string;
  payload: Record<string, any>;
}

export interface HealthGoal {
  goal_id: string;
  patient_id: string;
  title: string;
  description: string;
  category: string;
  metric_name: string;
  target_value: number;
  current_value: number;
  unit: string;
  progress_pct: number;
  trend: 'improving' | 'stable' | 'declining' | 'unknown';
  status: 'active' | 'completed' | 'paused' | 'failed';
  confidence: number;
  recommendations: string[];
  expected_completion_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface JourneyInsight {
  insight_id: string;
  patient_id: string;
  insight_type: string;
  title: string;
  body: string;
  severity: 'low' | 'moderate' | 'high' | 'critical';
  metric_name: string | null;
  old_value: number | null;
  new_value: number | null;
  unit: string | null;
  actionable_recommendation: string;
  detected_at: string;
}

export interface MetricProgress {
  metric_name: string;
  current_value: number;
  target_value: number | null;
  unit: string;
  progress_pct: number;
  trend: 'improving' | 'stable' | 'declining' | 'unknown';
  period_label: string;
}

export interface JourneyProgressReport {
  patient_id: string;
  medication_adherence_rate: number;
  lifestyle_adherence_score: number;
  exercise_progress: MetricProgress;
  weight_trend: MetricProgress | null;
  bp_trend: MetricProgress | null;
  glucose_trend: MetricProgress | null;
  sleep_trend: MetricProgress | null;
  overall_goal_completion_pct: number;
  active_goals_count: number;
  completed_goals_count: number;
  computed_at: string;
}

export interface DailyBriefingV2 {
  patient_id: string;
  briefing_date: string;
  greeting: string;
  health_score: number;
  health_score_display: string;
  health_status: string;
  status_color: 'green' | 'amber' | 'red';
  todays_priorities: string[];
  potential_risks: string[];
  medication_reminders: string[];
  health_insights: string[];
  goal_progress_summary: string[];
  twin_prediction: string;
  motivational_message: string;
  whats_new: string;
  generated_at: string;
}

export interface DoctorView {
  patient_id: string;
  profile_summary: string;
  master_summary: string;
  soap: {
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  };
  active_conditions: string[];
  active_medications: string[];
  latest_labs: any[];
  latest_vitals: any[];
  active_risks: any[];
  longitudinal_deltas: any;
  milestones: HealthMilestone[];
  twin_summary: string;
  generated_at: string;
}

// ─── API Configuration ────────────────────────────────────────────────────────

function getBaseUrl(): string {
  // Reads from environment, falls back to local dev server
  return (process.env.EXPO_PUBLIC_BRAIN_API_URL || 'http://10.0.2.2:8000');
}

function journeyUrl(patientId: string, path: string = ''): string {
  return `${getBaseUrl()}/api/v5/journey/${encodeURIComponent(patientId)}${path}`;
}

// ─── Cache Helpers ────────────────────────────────────────────────────────────

async function getCached<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp < CACHE_TTL_MS) return data as T;
  } catch {}
  return null;
}

async function setCache(key: string, data: any): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
  } catch {}
}

async function fetchWithCache<T>(
  url: string,
  cacheKey: string,
  options?: RequestInit,
): Promise<T> {
  try {
    const response = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data: T = await response.json();
    await setCache(cacheKey, data);
    return data;
  } catch (err) {
    // Offline fallback
    const cached = await getCached<T>(cacheKey);
    if (cached) return cached;
    throw err;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the compressed journey snapshot for the dashboard home screen.
 * Answers all 6 core questions in a single call.
 */
export async function getJourneySnapshot(patientId: string): Promise<JourneySnapshot> {
  return fetchWithCache<JourneySnapshot>(
    journeyUrl(patientId, '/snapshot'),
    `journey_snapshot_${patientId}`,
  );
}

/**
 * Get the full journey with all events, goals, milestones, insights, and progress.
 */
export async function getFullJourney(patientId: string): Promise<any> {
  return fetchWithCache<any>(
    journeyUrl(patientId),
    `journey_full_${patientId}`,
  );
}

/**
 * Get the filtered/searchable health timeline.
 */
export async function getJourneyTimeline(
  patientId: string,
  filterType?: string,
  search?: string,
  limit: number = 100,
): Promise<{ events: JourneyTimelineEvent[]; count: number }> {
  const params = new URLSearchParams();
  if (filterType) params.append('filter_type', filterType);
  if (search) params.append('search', search);
  params.append('limit', String(limit));
  const url = `${journeyUrl(patientId, '/timeline')}?${params.toString()}`;
  return fetchWithCache(url, `journey_timeline_${patientId}_${filterType || 'all'}`);
}

/**
 * Get all detected health milestones.
 */
export async function getJourneyMilestones(
  patientId: string,
): Promise<{ milestones: HealthMilestone[]; count: number }> {
  return fetchWithCache(
    journeyUrl(patientId, '/milestones'),
    `journey_milestones_${patientId}`,
  );
}

/**
 * Get all active and completed health goals.
 */
export async function getJourneyGoals(
  patientId: string,
): Promise<{ goals: HealthGoal[]; active_count: number; completed_count: number }> {
  return fetchWithCache(
    journeyUrl(patientId, '/goals'),
    `journey_goals_${patientId}`,
  );
}

/**
 * Create a custom health goal.
 */
export async function createJourneyGoal(
  patientId: string,
  goal: {
    title: string;
    description: string;
    category: string;
    metric_name: string;
    target_value: number;
    current_value: number;
    unit: string;
    recommendations?: string[];
  },
): Promise<{ status: string; goal: HealthGoal }> {
  const response = await fetch(journeyUrl(patientId, '/goals'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(goal),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/**
 * Get the multi-dimensional health progress report.
 */
export async function getJourneyProgress(
  patientId: string,
): Promise<JourneyProgressReport> {
  return fetchWithCache(
    journeyUrl(patientId, '/progress'),
    `journey_progress_${patientId}`,
  );
}

/**
 * Get the AI-generated daily health briefing (v2).
 */
export async function getJourneyBriefing(
  patientId: string,
): Promise<DailyBriefingV2> {
  return fetchWithCache(
    journeyUrl(patientId, '/briefing'),
    `journey_briefing_${patientId}`,
  );
}

/**
 * Get auto-detected health insights sorted by severity.
 */
export async function getJourneyInsights(
  patientId: string,
): Promise<{ insights: JourneyInsight[]; count: number }> {
  return fetchWithCache(
    journeyUrl(patientId, '/insights'),
    `journey_insights_${patientId}`,
  );
}

/**
 * Get the clinician-optimized doctor view with SOAP summary.
 */
export async function getDoctorView(patientId: string): Promise<DoctorView> {
  return fetchWithCache(
    journeyUrl(patientId, '/doctor-view'),
    `journey_doctor_view_${patientId}`,
  );
}

/**
 * Invalidate all cached journey data for a patient (call after major state changes).
 */
export async function invalidateJourneyCache(patientId: string): Promise<void> {
  const keys = [
    `journey_snapshot_${patientId}`,
    `journey_full_${patientId}`,
    `journey_milestones_${patientId}`,
    `journey_goals_${patientId}`,
    `journey_progress_${patientId}`,
    `journey_briefing_${patientId}`,
    `journey_insights_${patientId}`,
    `journey_doctor_view_${patientId}`,
  ];
  await AsyncStorage.multiRemove(keys);
}
