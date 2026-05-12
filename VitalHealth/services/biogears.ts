// services/biogears.ts
// Central API client for the BioGears Digital Twin backend

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

// ─── Configuration ────────────────────────────────────────────────────────────
// LOCAL DEV:  your laptop's Wi-Fi IP (e.g. 'http://10.172.0.79:8000')
// PRODUCTION: change to your E2E Cloud URL (e.g. 'https://yourdomain.com')

const DEFAULT_BASE_URL = 'http://151.185.42.123';
const BASE_URL_KEY = '@biogears_base_url';

/** Strip redundant/wrong ports from a BioGears URL.
 *  :8000 was incorrectly stored by early versions — nginx exposes port 80. */
function sanitizeBiogearsUrl(raw: string): string {
  try {
    const u = new URL(raw);
    // Remove port 8000 (FastAPI internal, not public) or default HTTP/HTTPS ports
    if (
      u.port === '8000' ||
      (u.protocol === 'http:' && u.port === '80') ||
      (u.protocol === 'https:' && u.port === '443')
    ) {
      return `${u.protocol}//${u.hostname}${u.pathname !== '/' ? u.pathname : ''}`;
    }
  } catch { /* not a full URL — return as-is */ }
  return raw;
}

export async function getBiogearsBaseUrl(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(BASE_URL_KEY);
    const raw = stored || DEFAULT_BASE_URL;
    const url = sanitizeBiogearsUrl(raw);

    // Auto-heal: if we fixed a bad stored URL, persist the clean version
    if (stored && url !== stored) {
      console.log(`[BioGears] Auto-fixed stored URL: ${stored} → ${url}`);
      await AsyncStorage.setItem(BASE_URL_KEY, url);
    }

    console.log(`[BioGears] Using Base URL: ${url}`);
    return url;
  } catch {
    console.log(`[BioGears] Using Default Base URL (Fallback): ${DEFAULT_BASE_URL}`);
    return DEFAULT_BASE_URL;
  }
}

export async function setBiogearsBaseUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(BASE_URL_KEY, url.replace(/\/$/, ''));
}

// ─── API Key (stored securely, set once in Settings) ─────────────────────────

const API_KEY_STORE = 'biogears_api_key';
// Fallback key used when no key has been set in SecureStore.
// This must match DIGITAL_TWIN_API_KEY in the server's .env file.
// In production this should only be changed via the Settings screen.
const _FALLBACK_API_KEY = '8d82c9b7832e7f909ad6629e553888f2084c458a7e94c3d743d99bcc3860d5d6';

export async function setApiKey(key: string): Promise<void> {
  await SecureStore.setItemAsync(API_KEY_STORE, key);
}
export async function getApiKey(): Promise<string> {
  try {
    const stored = await SecureStore.getItemAsync(API_KEY_STORE);
    return stored && stored.trim().length > 0 ? stored.trim() : _FALLBACK_API_KEY;
  } catch {
    return _FALLBACK_API_KEY;
  }
}

export async function clearApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(API_KEY_STORE);
}

async function getUrl(path: string): Promise<string> {
  const base = await getBiogearsBaseUrl();
  return `${base}${path}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BiogearsRegistrationPayload {
  user_id: string;
  age: number;
  weight: number;        // kg
  height: number;        // cm
  sex: 'Male' | 'Female';
  body_fat?: number;     // fraction e.g. 0.2 = 20%
  resting_hr?: number;
  systolic_bp?: number;
  diastolic_bp?: number;
  is_smoker?: boolean;
  has_anemia?: boolean;
  has_type1_diabetes?: boolean;
  has_type2_diabetes?: boolean;
  hba1c?: number | null;
  ethnicity?: string;
  fitness_level?: string;
  vo2max?: number | null;
  current_medications?: string[];
}

export interface BiogearsHealthEvent {
  event_type: 'exercise' | 'sleep' | 'meal' | 'substance' | 'water' | 'stress' | 'alcohol' | 'fast' | 'environment';
  value: number;
  timestamp?: number;         // Unix epoch seconds
  time_offset?: number;       // deprecated, use timestamp
  substance_name?: string;
  meal_type?: 'balanced' | 'high_carb' | 'high_protein' | 'fast_food' | 'ketogenic' | 'custom';
  carb_g?: number;
  fat_g?: number;
  protein_g?: number;
  duration_seconds?: number;
  environment_name?: string;
  notes?: string;
}

export interface BiogearsVitals {
  heart_rate?: number | null;
  blood_pressure?: string | null;    // "SBP/DBP" format
  glucose?: number | null;           // mg/dL
  respiration?: number | null;       // breaths/min
  spo2?: number | null;              // % (1–100)
  core_temperature?: number | null;  // °C
  cardiac_output?: number | null;    // L/min
  // ── Extended Vitals ───────────────────────────────────────────
  map?: number | null;               // Mean Arterial Pressure (mmHg)
  stroke_volume?: number | null;     // mL
  tidal_volume?: number | null;      // mL
  arterial_ph?: number | null;       // unitless
  exercise_level?: number | null;    // unitless (0–1)
}


export interface BiogearsSimulationResult {
  status: 'success' | 'error';
  vitals: BiogearsVitals;
  report_url?: string;
  data_gap_warning?: string | null;
  gap_hours_advanced?: number;
  anomalies?: Array<{ label: string; severity: string; value: number; normal_range: string }>;
  has_anomaly?: boolean;
  interaction_warnings?: string[];
  has_drug_interaction?: boolean;
}

export interface BiogearsJob {
  job_id: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  user_id: string;
  result?: BiogearsSimulationResult | null;
  error?: string | null;
}

export interface BiogearsSession {
  session_id: string;
  timestamp: string;      // ISO timestamp
  name?: string;          // User-defined display name
  vitals_snapshot?: BiogearsVitals;
  event_count?: number;
  has_anomaly?: boolean;
  events?: BiogearsHealthEvent[];
}

export interface HealthScoreResponse {
  user_id: string;
  composite_score: number;
  grade: string;
  confidence: string;
  components: Record<string, { score: number; grade: string }>;
}

export interface CVDRiskResponse {
  ten_year_risk_pct: number;
  category: string;
  color: string;
  action: string;
  modifiable_risk_factors: string[];
}

export interface RecoveryReadinessResponse {
  readiness_score: number;
  status: string;
  color: string;
  recommendation: string;
  factors: string[];
}

export interface OrganScoresResponse {
  user_id: string;
  scores: Record<string, { score: number; status: string }>;
  overall_health_score: number;
}

export interface VitalsTrendResponse {
  sessions: any[];
  trends: Record<string, { direction: string; normal_range: string }>;
  overall_averages: Record<string, number>;
}

// ─── Error Handling ────────────────────────────────────────────────────────────

export class BiogearsError extends Error {
  constructor(
    message: string | any,
    public statusCode?: number,
    public detail?: any
  ) {
    let finalMessage = 'Unknown error';
    if (typeof message === 'object' && message !== null) {
      finalMessage = message.message || message.detail || JSON.stringify(message);
    } else if (message) {
      finalMessage = String(message);
    }
    super(finalMessage);
    this.name = 'BiogearsError';
  }
}

async function apiFetch<T>(path: string, options?: RequestInit, timeoutMs = 30000): Promise<T> {
  const url = await getUrl(path);
  const apiKey = await getApiKey();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    console.log(`[BioGears] API REQUEST: ${options?.method || 'GET'} ${url}`);
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'X-API-Key': apiKey } : {}),
      },
      signal: controller.signal,
      ...options,
    });
    clearTimeout(timer);

    console.log(`[BioGears] API RESPONSE: ${res.status} ${url}`);
    if (!res.ok) {
      let detail: any;
      try { detail = await res.json(); } catch { detail = await res.text(); }
      console.log(`[BioGears] API ERROR DETAIL:`, detail);
      throw new BiogearsError(
        `BioGears API error ${res.status}`,
        res.status,
        detail
      );
    }
    return res.json() as Promise<T>;
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new BiogearsError('Request timed out. Is the BioGears server running?', 408);
    }
    if (err instanceof BiogearsError) throw err;
    throw new BiogearsError(err.message || 'Network error', 0);
  }
}

// ─── API Methods ──────────────────────────────────────────────────────────────

/**
 * Health check — lightweight ping, use to test connectivity
 */
export async function healthCheck(): Promise<{ status: string; version: string; engine: string; checks?: Record<string, any> }> {
  return apiFetch('/health', undefined, 5000);
}

/**
 * Register a new Digital Twin (calibrates BioGears engine)
 * This takes 30–120 seconds. Call from a non-blocking context.
 */
export async function registerTwin(payload: BiogearsRegistrationPayload): Promise<{ status: string; message: string }> {
  return apiFetch('/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, 600_000); // 10 min timeout — BioGears patient stabilization takes 2–8 min
}

/**
 * Run a synchronous batch simulation (blocking)
 * Prefer simulateAsync for UI use.
 */
export async function syncBatch(
  userId: string,
  events: BiogearsHealthEvent[]
): Promise<BiogearsSimulationResult> {
  return apiFetch('/sync/batch', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, events }),
  }, 300_000);
}

/**
 * Start an async simulation — returns job_id immediately.
 * Poll getJobStatus() until status === 'done' or 'failed'.
 */
export async function simulateAsync(
  userId: string,
  events: BiogearsHealthEvent[]
): Promise<{ job_id: string; status: string; poll_url: string }> {
  return apiFetch('/simulate/async', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, events }),
  }, 10_000);
}

/**
 * Poll job status. Call every 2–3 seconds until done or failed.
 */
export async function getJobStatus(jobId: string): Promise<BiogearsJob> {
  return apiFetch(`/jobs/${jobId}`, undefined, 10_000);
}

/**
 * Poll until job completes. Resolves with result or rejects on failure/timeout.
 */
export async function pollUntilDone(
  jobId: string,
  intervalMs = 3000,
  maxWaitMs = 43_200_000  // 12 hours — BioGears can take 10–25 min for full-day scenarios
): Promise<BiogearsSimulationResult> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = async () => {
      const elapsed = Date.now() - start;
      if (elapsed > maxWaitMs) {
        reject(new BiogearsError(
          `Simulation exceeded ${Math.round(maxWaitMs / 60000)}-minute limit. ` +
          'The engine may still be running — check the server logs.',
          408
        ));
        return;
      }
      try {
        const job = await getJobStatus(jobId);
        if (job.status === 'done' && job.result) {
          resolve(job.result);
        } else if (job.status === 'failed') {
          reject(new BiogearsError(job.error || 'Simulation failed', 500));
        } else {
          // Still running — keep polling
          setTimeout(check, intervalMs);
        }
      } catch (err) {
        // Network hiccup — keep polling unless we've timed out
        if (Date.now() - start < maxWaitMs) {
          setTimeout(check, intervalMs * 2);
        } else {
          reject(err);
        }
      }
    };
    setTimeout(check, intervalMs);
  });
}

/**
 * Run forecast (predict next N hours of physiology, no interventions)
 */
export async function predictRecovery(
  userId: string,
  hours = 4
): Promise<{ status: string; forecast_chart?: string; hours: number }> {
  return apiFetch('/predict/recovery', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, hours }),
  }, 300_000);
}

/**
 * List all simulation sessions for a user
 */
export async function getHistory(userId: string): Promise<{ user_id: string; sessions: BiogearsSession[] }> {
  return apiFetch(`/history/${userId}`, undefined, 15_000);
}

/**
 * Get timeseries vitals data for a specific session (up to 100 points)
 */
export async function getSessionData(userId: string, sessionId: string): Promise<Record<string, number>[]> {
  return apiFetch(`/history/${userId}/${sessionId}`, undefined, 15_000);
}

/**
 * Get composite health score
 */
export async function getHealthScore(userId: string): Promise<HealthScoreResponse> {
  return apiFetch(`/health-score/${userId}`, undefined, 15_000);
}

/**
 * Get organ health scores
 */
export async function getOrganScores(userId: string): Promise<any> {
  return apiFetch(`/analytics/organ-scores/${userId}`, undefined, 15_000);
}

/**
 * Delete a twin profile entirely
 */
export async function deleteTwin(userId: string): Promise<{ status: string; message: string }> {
  return apiFetch(`/profiles/${userId}`, { method: 'DELETE' }, 15_000);
}

/**
 * Undo the last simulation (revert engine state to previous backup)
 */
export async function undoLastSimulation(userId: string): Promise<{ status: string; message: string }> {
  return apiFetch(`/sync/undo/${userId}`, { method: 'POST' }, 15_000);
}

/**
 * Get body composition metrics (BMI, BSA, ideal weight) from stored profile
 */
export async function getBodyMetrics(userId: string): Promise<any> {
  return apiFetch(`/metrics/${userId}`, undefined, 10_000);
}

/**
 * Get 10-year cardiovascular risk
 */
export async function getCVDRisk(userId: string): Promise<CVDRiskResponse> {
  return apiFetch(`/analytics/cvd-risk/${userId}`, undefined, 15_000);
}

/**
 * Get Recovery Readiness score
 */
export async function getRecoveryReadiness(userId: string): Promise<RecoveryReadinessResponse> {
  return apiFetch(`/analytics/recovery-readiness/${userId}`, undefined, 15_000);
}

/**
 * Get Vitals Trends
 */
export async function getVitalsTrends(userId: string): Promise<VitalsTrendResponse> {
  return apiFetch(`/vitals/${userId}/trends`, undefined, 15_000);
}

/**
 * Get Weekly Summary
 */
export async function getWeeklySummary(userId: string): Promise<any> {
  return apiFetch(`/analytics/weekly-summary/${userId}`, undefined, 15_000);
}

/**
 * Check whether a twin is registered (state file exists)
 */
export async function getTwinProfile(userId: string): Promise<any> {
  return apiFetch(`/profiles/${userId}`, undefined, 10_000);
}

/**
 * Get the full substance library from BioGears
 */
export async function getSubstances(): Promise<{ substances: Record<string, string[]>; total: number }> {
  return apiFetch('/substances', undefined, 10_000);
}


// ─── Session Metadata (local AsyncStorage) ───────────────────────────────────
// We store session names and local metadata since the backend only tracks CSVs

const SESSION_META_KEY = (userId: string) => `@biogears_sessions_${userId}`;

export interface LocalSessionMeta {
  session_id: string;
  name: string;
  timestamp: string;
  vitals_snapshot?: BiogearsVitals;
  has_anomaly?: boolean;
  events?: BiogearsHealthEvent[];
  event_count?: number;
  ai_insights?: string[];
}

export async function saveSessionMeta(userId: string, meta: LocalSessionMeta): Promise<void> {
  const key = SESSION_META_KEY(userId);
  const existing = await loadSessionsMeta(userId);
  const updated = [meta, ...existing.filter(s => s.session_id !== meta.session_id)];
  await AsyncStorage.setItem(key, JSON.stringify(updated));
}

export async function loadSessionsMeta(userId: string): Promise<LocalSessionMeta[]> {
  const key = SESSION_META_KEY(userId);
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function deleteSessionMeta(userId: string, sessionId: string): Promise<void> {
  const key = SESSION_META_KEY(userId);
  const existing = await loadSessionsMeta(userId);
  const updated = existing.filter(s => s.session_id !== sessionId);
  await AsyncStorage.setItem(key, JSON.stringify(updated));
}

// ─── Saved Routines (local AsyncStorage) ────────────────────────────────────

export interface SavedRoutine {
  id: string;
  name: string;
  events: BiogearsHealthEvent[];
  eventCount: number;
  createdAt: string;
  lastUsed?: string;
  tags?: string[];  // e.g. ['gym day', 'rest day']
}

const ROUTINES_KEY = (userId: string) => `@biogears_routines_${userId}`;

export async function loadSavedRoutines(userId: string): Promise<SavedRoutine[]> {
  try {
    const raw = await AsyncStorage.getItem(ROUTINES_KEY(userId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveRoutine(userId: string, routine: SavedRoutine): Promise<void> {
  const existing = await loadSavedRoutines(userId);
  const updated = [routine, ...existing.filter(r => r.id !== routine.id)];
  await AsyncStorage.setItem(ROUTINES_KEY(userId), JSON.stringify(updated));
}

export async function deleteRoutine(userId: string, routineId: string): Promise<void> {
  const existing = await loadSavedRoutines(userId);
  const updated = existing.filter(r => r.id !== routineId);
  await AsyncStorage.setItem(ROUTINES_KEY(userId), JSON.stringify(updated));
}

export async function markRoutineUsed(userId: string, routineId: string): Promise<void> {
  const existing = await loadSavedRoutines(userId);
  const updated = existing.map(r =>
    r.id === routineId ? { ...r, lastUsed: new Date().toISOString() } : r
  );
  await AsyncStorage.setItem(ROUTINES_KEY(userId), JSON.stringify(updated));
}
