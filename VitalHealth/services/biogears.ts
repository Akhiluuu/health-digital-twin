// services/biogears.ts
// Central API client for the BioGears Digital Twin backend

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { doc, setDoc, deleteDoc, writeBatch, collection, getDocs, getDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "./firebase";

import { log, warn } from "../utils/logger";
import {
  getCentralBiogearsBaseUrl,
  getCentralHeartRateBaseUrl,
  BASE_URL_KEY,
  HEARTRATE_URL_KEY,
  fetchWithRetry,
} from "../constants/Config";

/** Ensure BioGears URL correctly targets port 8000 on the production/staging server */
function sanitizeBiogearsUrl(raw: string): string {
  const envUrl = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (!raw) return envUrl || 'http://151.185.45.137:8000';
  let cleaned = raw.trim().replace(/\/+$/, '');
  try {
    const u = new URL(cleaned);
    if ((!u.port || u.port === '80') && (u.hostname === '151.185.45.137' || u.hostname === '127.0.0.1')) {
      return `${u.protocol}//${u.hostname}:8000${u.pathname !== '/' ? u.pathname : ''}`;
    }
    return `${u.protocol}//${u.host}${u.pathname !== '/' ? u.pathname : ''}`;
  } catch {
    return cleaned;
  }
}

export async function getBiogearsBaseUrl(): Promise<string> {
  const centralUrl = await getCentralBiogearsBaseUrl();
  try {
    const stored = await AsyncStorage.getItem(BASE_URL_KEY);
    const raw = stored || centralUrl;
    const url = sanitizeBiogearsUrl(raw);

    // Auto-heal: if stored URL was pointing to bad port 80, fix to port 8000
    if (stored && url !== stored) {
      log(`[BioGears] Auto-fixed stored URL: ${stored} → ${url}`);
      await AsyncStorage.setItem(BASE_URL_KEY, url);
    }

    log(`[BioGears] Using Base URL: ${url}`);
    return url;
  } catch {
    log(`[BioGears] Using Default Base URL (Fallback): ${centralUrl}`);
    return sanitizeBiogearsUrl(centralUrl);
  }
}

export async function setBiogearsBaseUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(BASE_URL_KEY, url.replace(/\/$/, ''));
}

export async function getHeartRateBaseUrl(): Promise<string> {
  const centralHrUrl = await getCentralHeartRateBaseUrl();
  try {
    const stored = await AsyncStorage.getItem(HEARTRATE_URL_KEY);
    if (stored) return stored;

    // Derived fallback from BioGears URL
    const biogearsUrl = await getBiogearsBaseUrl();
    try {
      const u = new URL(biogearsUrl);
      return `${u.protocol}//${u.hostname}:5000`;
    } catch {
      return centralHrUrl;
    }
  } catch {
    return centralHrUrl;
  }
}

export async function setHeartRateBaseUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(HEARTRATE_URL_KEY, url.replace(/\/$/, ''));
}


// ─── API Key (stored securely, set once in Settings) ─────────────────────────

const API_KEY_STORE = 'biogears_api_key';
// Fallback key used when no key has been set in SecureStore.
// This must match DIGITAL_TWIN_API_KEY in the server's .env file.
// In production this should only be changed via the Settings screen.
export const FALLBACK_API_KEY = '505747c55d1dd92d8e7ef48534023ca4d9de516d624c7aaa0cda9452d2570f87';

export async function setApiKey(key: string): Promise<void> {
  await SecureStore.setItemAsync(API_KEY_STORE, key);
}
export async function getApiKey(): Promise<string> {
  // In production, always return the bundled fallback key — no user input needed.
  if (!__DEV__) return FALLBACK_API_KEY;
  try {
    const stored = await SecureStore.getItemAsync(API_KEY_STORE);
    return stored && stored.trim().length > 0 ? stored.trim() : FALLBACK_API_KEY;
  } catch {
    return FALLBACK_API_KEY;
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
  profile_name?: string;
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

export function sanitizeBiogearsVitals(raw?: BiogearsVitals | null): BiogearsVitals {
  if (!raw) {
    return {
      heart_rate: null as any,
      blood_pressure: null as any,
      map: null as any,
      stroke_volume: null as any,
      cardiac_output: null as any,
      respiration: null as any,
      tidal_volume: null as any,
      arterial_ph: null as any,
      glucose: null as any,
      spo2: null as any,
      core_temperature: null as any,
      exercise_level: 0,
    };
  }

  const v = raw;
  const heart_rate = v.heart_rate ?? null;
  const blood_pressure = v.blood_pressure || null;
  let sbp: number | null = null;
  let dbp: number | null = null;
  if (blood_pressure && blood_pressure.includes('/')) {
    const parts = blood_pressure.split('/');
    sbp = parseFloat(parts[0]) || null;
    dbp = parseFloat(parts[1]) || null;
  }
  
  // Mean Arterial Pressure (MAP) = DBP + (SBP - DBP) / 3
  const calculatedMap = (dbp !== null && sbp !== null) ? Math.round(dbp + (sbp - dbp) / 3) : null;
  const map = v.map ?? calculatedMap;

  const stroke_volume = v.stroke_volume ?? null;

  // Cardiac Output (CO) = (HR * SV) / 1000 in L/min
  const calculatedCO = (heart_rate !== null && stroke_volume !== null) 
    ? parseFloat(((heart_rate * stroke_volume) / 1000).toFixed(1)) 
    : null;
  const cardiac_output = v.cardiac_output ?? calculatedCO;

  const respiration = v.respiration ?? null;
  const tidal_volume = v.tidal_volume ?? null;
  const arterial_ph = v.arterial_ph ?? null;
  const glucose = v.glucose ?? null;
  const spo2 = v.spo2 !== undefined ? v.spo2 : null;
  const core_temperature = v.core_temperature ?? null;
  const exercise_level = v.exercise_level ?? 0;

  return {
    heart_rate,
    blood_pressure,
    map,
    stroke_volume,
    cardiac_output,
    respiration,
    tidal_volume,
    arterial_ph,
    glucose,
    spo2,
    core_temperature,
    exercise_level,
  };
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
    
    // Check if we have structured detail info
    if (detail) {
      if (detail.detail && Array.isArray(detail.detail.validation_errors)) {
        finalMessage = `Validation Errors:\n${detail.detail.validation_errors.map((e: string) => `• ${e}`).join('\n')}`;
      } else if (Array.isArray(detail.validation_errors)) {
        finalMessage = `Validation Errors:\n${detail.validation_errors.map((e: string) => `• ${e}`).join('\n')}`;
      } else if (detail.detail && typeof detail.detail === 'string') {
        finalMessage = detail.detail;
      } else if (detail.message && typeof detail.message === 'string') {
        finalMessage = detail.message;
      } else if (detail.detail && typeof detail.detail === 'object') {
        finalMessage = detail.detail.message || detail.detail.detail || JSON.stringify(detail.detail);
      } else {
        finalMessage = typeof detail === 'string' ? detail : JSON.stringify(detail);
      }
    } else if (typeof message === 'object' && message !== null) {
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
    const isFallback = apiKey === FALLBACK_API_KEY;
    log(`[BioGears] API REQUEST: ${options?.method || 'GET'} ${url} | Key: ${isFallback ? 'Default Fallback' : 'Custom Key (' + apiKey.slice(0, 4) + '...' + apiKey.slice(-4) + ')'}`);
    const res = await fetchWithRetry(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'X-API-Key': apiKey } : {}),
      },
      signal: controller.signal,
      ...options,
    });
    clearTimeout(timer);

    log(`[BioGears] API RESPONSE: ${res.status} ${url}`);
    if (!res.ok) {
      let detail: any;
      try { detail = await res.json(); } catch { detail = await res.text(); }
      log(`[BioGears] API ERROR DETAIL:`, detail);
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
 * Get active running/pending job for a specific user.
 */
export async function getActiveJobForUser(userId: string): Promise<{ job_id: string | null; status: string | null; user_id: string; created_at: number | null }> {
  return apiFetch(`/jobs/active/${userId}`, undefined, 10_000);
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
        } else if (job.status === 'done' && !job.result) {
          // FIX: job is 'done' but result is missing — this means the server
          // marked the job complete but didn't write the result (serialization error).
          // Reject immediately instead of silently looping until timeout.
          reject(new BiogearsError(
            'Simulation completed but returned no data. Check server logs for serialization errors.',
            500
          ));
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

export interface CaloricBalanceResponse {
  bmr_kcal_day: number;
  estimated_burn_kcal: number;
  burn_so_far_kcal: number;
  meal_intake_kcal: number;
  caloric_balance: number;
  balance_status: string;
  note: string;
}

/**
 * Get BMR and caloric balance estimation based on events
 */
export async function getCaloricBalance(userId: string, events: BiogearsHealthEvent[]): Promise<CaloricBalanceResponse> {
  return apiFetch(`/analytics/caloric-balance/${userId}`, {
    method: 'POST',
    body: JSON.stringify(events),
  }, 10_000);
}

/**
 * Get the full substance library from BioGears
 */
export async function getSubstances(): Promise<{ substances: Record<string, string[]>; total: number }> {
  return apiFetch('/substances', undefined, 10_000);
}

// ─── Enterprise Health OS (v6.0 / v7.0) API Methods ─────────────────────────

export interface CounterfactualResponse {
  status: string;
  patient_id: string;
  scenario: {
    scenario_title: string;
    query: string;
    baseline: Record<string, any>;
    predicted: Record<string, any>;
    delta: Record<string, any>;
    confidence: string;
    interpretation: string;
  };
}

export interface ConsentEvaluationResponse {
  decision_id: string;
  allowed: boolean;
  reason: string;
  policy_id_applied?: string;
}

export interface PHOSQueryResponse {
  query: string;
  patient_id: string;
  intentAnalysis: {
    primaryIntent: string;
    secondaryIntents?: string[];
    clinicalGoal?: string;
    confidence?: number;
  };
  confidence?: any;
  strategy?: any;
  answerText: string;
  followUps?: string[];
  uiComponents?: Array<{
    type: string;
    title: string;
    payload: any;
  }>;
  latencyMs: number;
}

/**
 * Execute PHOS v6.0 AI Multi-Agent Reasoning Query
 */
export async function queryPHOSEngine(patientId: string, queryText: string): Promise<PHOSQueryResponse> {
  return apiFetch('/api/v6/brain/phos/query', {
    method: 'POST',
    body: JSON.stringify({ patient_id: patientId, query: queryText }),
  }, 45_000);
}

/**
 * Execute Counterfactual Scenario Query ("What happens if I stop taking Metformin?")
 */
export async function queryCounterfactual(patientId: string, queryText: string): Promise<CounterfactualResponse> {
  return apiFetch('/api/v6/brain/query/counterfactual', {
    method: 'POST',
    body: JSON.stringify({ patient_id: patientId, query: queryText }),
  }, 30_000);
}

/**
 * Evaluate ABAC Patient Data Access Consent
 */
export async function evaluateConsentAccess(
  patientId: string,
  requesterId: string,
  requesterRole: 'PRACTITIONER' | 'PATIENT' | 'CAREGIVER' | 'RESEARCHER',
  targetCategory: 'VITALS' | 'MEDICATION' | 'LABS' | 'MENTAL_HEALTH' | 'GENETICS',
  isEmergencyBreakglass: boolean = false,
  justification: string = ''
): Promise<ConsentEvaluationResponse> {
  return apiFetch('/api/v6/patient/consent/evaluate', {
    method: 'POST',
    body: JSON.stringify({
      patient_id: patientId,
      requester_id: requesterId,
      requester_role: requesterRole,
      target_category: targetCategory,
      is_emergency_breakglass: isEmergencyBreakglass,
      justification: justification,
    }),
  }, 10_000);
}

/**
 * Fetch pending Practitioner Human-in-the-Loop (HITL) review tasks
 */
export async function getHITLTasks(): Promise<any[]> {
  return apiFetch('/api/v6/brain/safety/hitl-tasks', undefined, 10_000);
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
  is_automatic?: boolean;
  sim_type?: string;
}

export async function saveSessionMeta(userId: string, meta: LocalSessionMeta, ownerUid?: string): Promise<void> {
  const key = SESSION_META_KEY(userId);
  const existing = await loadSessionsMeta(userId);
  const updated = [meta, ...existing.filter(s => s.session_id !== meta.session_id)];
  await AsyncStorage.setItem(key, JSON.stringify(updated));

  try {
    const user = auth.currentUser;
    const firestoreUid = ownerUid || user?.uid;
    if (firestoreUid) {
      await setDoc(doc(db, "users", firestoreUid, "session_meta", meta.session_id), meta);
      log(`☁️ Session meta synced to Firestore: ${meta.session_id} for owner: ${firestoreUid}`);
    } else {
      // ✅ FIX: Auth not ready yet — session is safely in AsyncStorage;
      // it will be synced on the next app foreground via syncDigitalTwinDataFromFirestore.
      log("[BioGears] saveSessionMeta: auth not ready, skipping Firestore (AsyncStorage OK)");
    }
  } catch (err) {
    warn("⚠️ Failed to sync session meta to Firestore:", err);
  }
}

export async function loadSessionsMeta(userId: string): Promise<LocalSessionMeta[]> {
  const key = SESSION_META_KEY(userId);
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
  } catch {
    return [];
  }
}

export async function deleteSessionMeta(userId: string, sessionId: string, ownerUid?: string): Promise<void> {
  const key = SESSION_META_KEY(userId);
  const existing = await loadSessionsMeta(userId);
  const updated = existing.filter(s => s.session_id !== sessionId);
  await AsyncStorage.setItem(key, JSON.stringify(updated));

  try {
    const user = auth.currentUser;
    const firestoreUid = ownerUid || user?.uid;
    if (firestoreUid) {
      await deleteDoc(doc(db, "users", firestoreUid, "session_meta", sessionId));
      log(`☁️ Session meta deleted from Firestore: ${sessionId} for owner: ${firestoreUid}`);
    }
  } catch (err) {
    warn("⚠️ Failed to delete session meta from Firestore:", err);
  }
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
  isDefault?: boolean;
}

const ROUTINES_KEY = (userId: string) => `@biogears_routines_${userId}`;

export async function loadSavedRoutines(userId: string): Promise<SavedRoutine[]> {
  try {
    const raw = await AsyncStorage.getItem(ROUTINES_KEY(userId));
    if (!raw) return [];
    try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
  } catch {
    return [];
  }
}

export async function saveRoutine(userId: string, routine: SavedRoutine, ownerUid?: string): Promise<void> {
  const existing = await loadSavedRoutines(userId);
  const updated = [routine, ...existing.filter(r => r.id !== routine.id)];
  await AsyncStorage.setItem(ROUTINES_KEY(userId), JSON.stringify(updated));

  try {
    const user = auth.currentUser;
    const firestoreUid = ownerUid || user?.uid;
    if (firestoreUid) {
      await setDoc(doc(db, "users", firestoreUid, "routines", routine.id), routine);
      log(`☁️ Routine synced to Firestore: ${routine.id} for owner: ${firestoreUid}`);
    }
  } catch (err) {
    warn("⚠️ Failed to sync routine to Firestore:", err);
  }
}

export async function deleteRoutine(userId: string, routineId: string, ownerUid?: string): Promise<void> {
  const existing = await loadSavedRoutines(userId);
  const updated = existing.filter(r => r.id !== routineId);
  await AsyncStorage.setItem(ROUTINES_KEY(userId), JSON.stringify(updated));

  try {
    const user = auth.currentUser;
    const firestoreUid = ownerUid || user?.uid;
    if (firestoreUid) {
      await deleteDoc(doc(db, "users", firestoreUid, "routines", routineId));
      log(`☁️ Routine deleted from Firestore: ${routineId} for owner: ${firestoreUid}`);
    }
  } catch (err) {
    warn("⚠️ Failed to delete routine from Firestore:", err);
  }
}

export async function markRoutineUsed(userId: string, routineId: string, ownerUid?: string): Promise<void> {
  const existing = await loadSavedRoutines(userId);
  const updated = existing.map(r =>
    r.id === routineId ? { ...r, lastUsed: new Date().toISOString() } : r
  );
  await AsyncStorage.setItem(ROUTINES_KEY(userId), JSON.stringify(updated));

  try {
    const user = auth.currentUser;
    const routine = updated.find(r => r.id === routineId);
    const firestoreUid = ownerUid || user?.uid;
    if (firestoreUid && routine) {
      await setDoc(doc(db, "users", firestoreUid, "routines", routineId), routine);
      log(`☁️ Routine lastUsed synced to Firestore: ${routineId} for owner: ${firestoreUid}`);
    }
  } catch (err) {
    warn("⚠️ Failed to sync lastUsed for routine:", err);
  }
}

export async function setDefaultRoutine(userId: string, routineId: string, ownerUid?: string, forceValue: boolean = true): Promise<void> {
  const existing = await loadSavedRoutines(userId);
  const updated = existing.map(r => ({
    ...r,
    isDefault: r.id === routineId ? forceValue : false
  }));
  await AsyncStorage.setItem(ROUTINES_KEY(userId), JSON.stringify(updated));

  try {
    const user = auth.currentUser;
    const firestoreUid = ownerUid || user?.uid;
    if (firestoreUid) {
      const batch = writeBatch(db);
      for (const r of updated) {
        const ref = doc(db, "users", firestoreUid, "routines", r.id);
        batch.set(ref, r);
      }
      await batch.commit();
      log(`☁️ Routine defaults synced to Firestore for owner: ${firestoreUid}`);
    }
  } catch (err) {
    warn("⚠️ Failed to sync default routine status to Firestore:", err);
  }
}

// ─── Sync digital twin custom metadata from Firestore ─────────────────────────

/**
 * Syncs routines and session metadata from Firestore into local AsyncStorage.
 * @param userId     The twinId (HealthID slug) used as the AsyncStorage key.
 * @param ownerUid   The Firebase UID whose Firestore subcollections to read.
 *                   Defaults to auth.currentUser.uid (your own account).
 *                   Pass the member's UID when syncing a switched profile.
 */
export async function syncDigitalTwinDataFromFirestore(userId: string, ownerUid?: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;

  // If no ownerUid provided, fall back to the logged-in user
  const firestoreUid = ownerUid || user.uid;

  log(`☁️ Starting Firestore sync for user: ${user.uid} (HealthID: ${userId}, Firestore owner: ${firestoreUid})`);

  try {
    // 1. Sync Routines
    const routinesRef = collection(db, "users", firestoreUid, "routines");
    const routinesSnap = await getDocs(routinesRef);
    if (!routinesSnap.empty) {
      const firestoreRoutines: SavedRoutine[] = [];
      routinesSnap.forEach((docSnap) => {
        firestoreRoutines.push(docSnap.data() as SavedRoutine);
      });

      const localRoutines = await loadSavedRoutines(userId);
      const routineMap = new Map<string, SavedRoutine>();
      localRoutines.forEach(r => routineMap.set(r.id, r));
      firestoreRoutines.forEach(r => routineMap.set(r.id, r));

      const mergedRoutines = Array.from(routineMap.values());
      await AsyncStorage.setItem(ROUTINES_KEY(userId), JSON.stringify(mergedRoutines));
      log(`☁️ Routines synced: loaded ${firestoreRoutines.length} from Firestore`);
    }

    // 2. Sync Session Metadata
    const sessionsRef = collection(db, "users", firestoreUid, "session_meta");
    const sessionsSnap = await getDocs(sessionsRef);
    if (!sessionsSnap.empty) {
      const firestoreSessions: LocalSessionMeta[] = [];
      sessionsSnap.forEach((docSnap) => {
        firestoreSessions.push(docSnap.data() as LocalSessionMeta);
      });

      const localSessions = await loadSessionsMeta(userId);
      const sessionMap = new Map<string, LocalSessionMeta>();
      localSessions.forEach(s => sessionMap.set(s.session_id, s));
      firestoreSessions.forEach(s => sessionMap.set(s.session_id, s));

      const mergedSessions = Array.from(sessionMap.values()).sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      await AsyncStorage.setItem(SESSION_META_KEY(userId), JSON.stringify(mergedSessions));
      log(`☁️ Session meta synced: loaded ${firestoreSessions.length} from Firestore`);
    }

  } catch (err) {
    warn("⚠️ Failed to sync Digital Twin data from Firestore:", err);
  }
}

export async function syncPendingEvents(userId: string, events: any[], ownerUid?: string): Promise<void> {
  try {
    // ✅ FIX: Don't silently skip on cold-start null auth.
    // If ownerUid is provided (family member case), use it directly.
    // For self, if auth.currentUser is null (cold start), skip gracefully —
    // todayEvents are persisted to AsyncStorage too, so no data is lost.
    const user = auth.currentUser;
    const firestoreUid = ownerUid || user?.uid;
    if (!firestoreUid) {
      log("[BioGears] syncPendingEvents: auth not ready, skipping Firestore sync (AsyncStorage backup OK)");
      return;
    }
    await setDoc(doc(db, "users", firestoreUid, "biogears_pending", "today"), {
      userId,
      events,
      updatedAt: serverTimestamp(),
    });
    log(`☁️ Pending events synced to Firestore for owner: ${firestoreUid}`);
  } catch (err) {
    warn("⚠️ Failed to sync pending events to Firestore:", err);
  }
}

export async function fetchPendingEvents(userId: string, ownerUid?: string): Promise<any[] | null> {
  try {
    const user = auth.currentUser;
    const firestoreUid = ownerUid || user?.uid;
    if (firestoreUid) {
      const snap = await getDoc(doc(db, "users", firestoreUid, "biogears_pending", "today"));
      if (snap.exists()) {
        const data = snap.data();
        return data.events || [];
      }
    }
  } catch (err) {
    warn("⚠️ Failed to fetch pending events from Firestore:", err);
  }
  return null;
}

export async function updateProfileMetadata(userId: string, data: Record<string, any>): Promise<any> {
  return apiFetch(`/profiles/${userId}/metadata`, {
    method: 'POST',
    body: JSON.stringify(data),
  }, 15_000);
}

/**
 * Permanently delete a Digital Twin and all its server-side data from the BioGears engine backend
 */
export async function deleteProfile(userId: string): Promise<{ status: string; message: string }> {
  try {
    return await apiFetch(`/profiles/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    }, 15_000);
  } catch (err) {
    warn(`⚠️ BioGears deleteProfile warning for ${userId}:`, err);
    return { status: 'error', message: String(err) };
  }
}


