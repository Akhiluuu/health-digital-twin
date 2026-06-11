// context/BiogearsTwinContext.tsx
// Global state for BioGears Digital Twin — registration, simulation, routines, sessions

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useProfile } from './ProfileContext';
import { useFamily } from './FamilyContext';
import { buildDefaultRoutine } from '../services/onboardingRoutineBuilder';
import * as BiogearsAPI from '../services/biogears';
import { auth } from '../services/firebase';
import {
  syncBiogearsAnalytics,
  fetchBiogearsAnalyticsFromFirebase,
} from '../services/firebaseSync';
import { getTwinId } from '../utils/twinUtils';
import { scheduleDailyLogReminder } from '../services/notifeeService';
import { useMedicine } from './MedicineContext';
import { useSteps } from './StepContext';
import type {
  BiogearsHealthEvent,
  BiogearsVitals,
  LocalSessionMeta,
  SavedRoutine,
  BiogearsRegistrationPayload,
  CVDRiskResponse,
  RecoveryReadinessResponse,
  OrganScoresResponse,
  VitalsTrendResponse,
  CaloricBalanceResponse,
} from '../services/biogears';
import {
  saveSimulationResult,
  getLastSimulation,
  recordToVitals,
} from '../database/simulationHistoryDB';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TwinStatus = 'unregistered' | 'checking' | 'registering' | 'ready' | 'error';
export type SimulationStatus = 'idle' | 'queued' | 'running' | 'done' | 'failed';

// A logged event in Today's routine — has wall-clock time for UI display
export interface RoutineEvent extends BiogearsHealthEvent {
  id: string;
  wallTime: string;       // "HH:MM" — wall clock time user selected
  displayLabel: string;   // e.g. "Idli (2 pieces) · 140 kcal"
  displayIcon: string;    // emoji
  source?: 'manual' | 'routine' | 'baseline'; // provenance tag
}

export interface EventConflict {
  incoming: RoutineEvent;
  existing: RoutineEvent;
  fingerprint: string;
}

export interface BiogearsTwinContextValue {
  // Status
  twinStatus: TwinStatus;
  twinStatusError: string | null;
  simulationStatus: SimulationStatus;
  simulationProgress: string;
  simulationError: string | null;

  // Twin identity
  twinUserId: string | null;

  // Last simulation vitals
  lastVitals: BiogearsVitals | null;
  lastAnomalies: any[];
  lastInteractionWarnings: string[];
  lastSessionId: string | null;
  lastAiInsights: string[];
  lastAiInsightsText: string;
  aiInsightsLoading: boolean;

  // BioGears AI Query
  querySimulation: (question: string) => Promise<string>;

  // AI Server URL (shared with healthbot)
  aiServerUrl: string;
  setAiServerUrl: (url: string) => void;

  // Today's routine
  todayEvents: RoutineEvent[];
  setTodayEvents: (events: RoutineEvent[]) => void;
  addEvent: (event: Omit<RoutineEvent, 'id'>) => void;
  addEventAndSimulate: (event: Omit<RoutineEvent, 'id'>, customSimName?: string) => Promise<void>;
  removeEvent: (id: string) => void;
  updateEvent: (id: string, updates: Partial<RoutineEvent>) => void;
  clearToday: () => void;
  refreshAnalytics: () => Promise<void>;

  // Analytics Data
  organScores: OrganScoresResponse | null;
  vitalsTrends: VitalsTrendResponse | null;
  cvdRisk: CVDRiskResponse | null;
  recoveryReadiness: RecoveryReadinessResponse | null;
  weeklySummary: any;
  todayMacros: { carbs: number; protein: number; fat: number; calories: number };
  healthScore: { score: number; grade: string; label: string; components: any } | null;
  bodyMetrics: any | null;
  caloricBalance: CaloricBalanceResponse | null;

  // Saved routines
  savedRoutines: SavedRoutine[];
  saveCurrentRoutine: (name: string, tags?: string[], overwriteId?: string, autoDefault?: boolean) => Promise<void>;
  loadRoutine: (routineId: string, anchorDate?: Date) => void;
  renameRoutine: (routineId: string, newName: string) => Promise<void>;
  deleteRoutine: (routineId: string) => Promise<void>;
  setDefaultRoutine: (routineId: string) => Promise<void>;
  editingRoutineId: string | null;
  setEditingRoutineId: (id: string | null) => void;
  restoreDefaultRoutine: () => Promise<void>;

  // Substances Library
  substances: Record<string, string[]>;
  refreshSubstances: () => Promise<void>;

  // Session history (local metadata)
  sessions: LocalSessionMeta[];
  refreshSessions: () => Promise<LocalSessionMeta[]>;
  deleteSession: (sessionId: string) => Promise<void>;

  // Simulation name
  simulationName: string;
  setSimulationName: (name: string) => void;

  // Actions
  registerTwin: (payload: BiogearsRegistrationPayload) => Promise<void>;
  runSimulation: () => Promise<void>;
  runMultiDayCatchup: (days: number) => Promise<void>;
  recheckTwinStatus: () => Promise<void>;
  undoLastSimulation: () => Promise<void>;
  fillBaselineEvents: () => Promise<void>;
  loadRoutineWithConflictCheck: (
    routineId: string,
    onConflicts: (conflicts: EventConflict[], resolve: (resolutions: Record<string, 'keep_mine' | 'use_routine' | 'keep_both'>) => void) => void
  ) => void;

  // Conflict resolution (surfaced from fillBaselineEvents / loadRoutineWithConflictCheck)
  pendingConflicts: EventConflict[];
  pendingConflictResolver: ((resolutions: Record<string, 'keep_mine' | 'use_routine' | 'keep_both'>) => void) | null;
  dismissConflicts: () => void;
}


// ─── Context ──────────────────────────────────────────────────────────────────

const BiogearsTwinContext = createContext<BiogearsTwinContextValue | null>(null);

export function useBiogearsTwin(): BiogearsTwinContextValue {
  const ctx = useContext(BiogearsTwinContext);
  if (!ctx) throw new Error('useBiogearsTwin must be used inside BiogearsTwinProvider');
  return ctx;
}

const TWIN_STATUS_KEY   = '@biogears_twin_status';
const AI_SERVER_URL_KEY = '@hai_server_ip';
const AI_SERVER_PORT_KEY = '@hai_server_port';
const TODAY_EVENTS_KEY = (uid: string) => `@biogears_today_${uid}`;

// ─── Helper: convert RoutineEvent wall time → Unix epoch timestamp ────────────

/**
 * Converts a "HH:MM" wall time string to a Unix epoch timestamp (seconds).
 *
 * Production-level chronology logic:
 *  • When anchorDate is provided (e.g., date of last simulation), events are
 *    stamped to that specific date — this is used when pulling saved states so
 *    the simulation continues from where it left off, not from today.
 *  • When no anchorDate is given (live event logging), we use today and apply
 *    smart retroactive inference: if the HH:MM is in the future relative to
 *    now, we assume the user is logging a yesterday event (e.g. logging last
 *    night's 10 PM sleep at 8 AM today).
 */
function wallTimeToTimestamp(wallTime: string, anchorDate?: Date): number {
  // wallTime = "HH:MM"
  const [hh, mm] = wallTime.split(':').map(Number);

  if (anchorDate) {
    // Anchored mode: stamp exactly to the given date + wall time.
    // No guessing — the caller has determined the correct date.
    const d = new Date(anchorDate);
    d.setHours(hh, mm, 0, 0);
    return Math.floor(d.getTime() / 1000);
  }

  // Live logging mode: anchor to today with retroactive inference.
  const now = new Date();
  const current_hh = now.getHours();
  const current_mm = now.getMinutes();

  now.setHours(hh, mm, 0, 0);

  // Smart Date Inference: Health logs are retroactive.
  // If the time the user entered is strictly in the future compared to right now
  // (e.g., it is 8:00 AM and they enter 10:00 PM for sleep), we safely 
  // assume they are logging an event that happened yesterday.
  if (hh > current_hh || (hh === current_hh && mm > current_mm)) {
    now.setDate(now.getDate() - 1);
  }

  return Math.floor(now.getTime() / 1000);
}

// ─── Event Fingerprinting & Conflict Detection ────────────────────────────────

/**
 * Produces a deterministic fingerprint for an event so near-duplicate events
 * from different sources (routine vs manual) can be detected before merging.
 *
 * Strategy:
 *  • event_type is an exact key.
 *  • wallTime is quantised to 30-minute buckets so "08:00" and "08:17" share a bucket.
 *  • value is quantised to 10-unit buckets to absorb minor portion differences.
 */
function getEventFingerprint(e: { event_type: string; wallTime?: string; value?: number }): string {
  const [hh = 0, mm = 0] = (e.wallTime || '00:00').split(':').map(Number);
  const totalMin = hh * 60 + mm;
  const timeBucket = Math.floor(totalMin / 30);
  const valueBucket = Math.floor((e.value || 0) / 10);
  return `${e.event_type}|t${timeBucket}|v${valueBucket}`;
}

/**
 * Compares incoming routine/baseline events against the existing todayEvents
 * queue and returns any fingerprint collisions as EventConflict[]. Only events
 * whose wallTime falls within the target time window are checked.
 */
function detectConflicts(
  incoming: RoutineEvent[],
  existing: RoutineEvent[]
): EventConflict[] {
  const conflicts: EventConflict[] = [];
  for (const inc of incoming) {
    const fp = getEventFingerprint(inc);
    const clash = existing.find(ex => getEventFingerprint(ex) === fp);
    if (clash) {
      conflicts.push({ incoming: inc, existing: clash, fingerprint: fp });
    }
  }
  return conflicts;
}

/**
 * Helper to build step exercise event for BioGears simulation / caloric balance
 */
function buildStepExerciseEvent(steps: number, weightKg: number, heightCm: number): BiogearsHealthEvent | null {
  if (steps <= 0) return null;
  const strideM = 0.413 * (heightCm / 100);
  const distanceM = steps * strideM;
  // Assume a walking speed of 1.34 m/s (3 mph)
  const speedMPS = 1.34;
  const durationSecs = Math.round(distanceM / speedMPS);
  if (durationSecs <= 0) return null;

  // MET for walking 3 mph (4.8 km/h) is 3.5
  // BioGears intensity = (MET - 1) / 13, clamped
  const met = 3.5;
  const biogearsIntensity = Math.max(0.05, Math.min(1.0, (met - 1.0) / 13.0));

  return {
    event_type: "exercise",
    value: parseFloat(biogearsIntensity.toFixed(3)),
    duration_seconds: durationSecs,
    timestamp: Math.round(Date.now() / 1000) - durationSecs,
    substance_name: undefined,
    meal_type: undefined,
    carb_g: 0,
    fat_g: 0,
    protein_g: 0,
    environment_name: undefined,
    notes: `Pedometer steps: ${steps}`,
  };
}

/**
 * Computes a local estimate of Basal Metabolic Rate and daily calorie burn
 */
function computeLocalCaloricBalanceFallback(profile: any, todayEvents: RoutineEvent[], steps: number): CaloricBalanceResponse {
  const weightVal = profile ? parseFloat(String(profile.weight || '').replace(/[^0-9.]/g, '')) : 70;
  const heightVal = profile ? parseFloat(String(profile.height || '').replace(/[^0-9.]/g, '')) : 170;
  const ageVal = profile ? parseInt(String(profile.age || '').replace(/[^0-9]/g, '')) : 30;
  const isMale = (profile?.gender || 'male').toLowerCase() === 'male';

  // Mifflin-St Jeor BMR
  let bmr = 10 * weightVal + 6.25 * heightVal - 5 * ageVal;
  if (isMale) {
    bmr += 5;
  } else {
    bmr -= 161;
  }
  bmr = Math.round(bmr);

  // Exercise Kcal
  let exerciseKcal = 0;
  let mealKcal = 0;

  // Add step exercise kcal
  const stepEvent = buildStepExerciseEvent(steps, weightVal, heightVal);
  const eventsForBurn: any[] = [...todayEvents];
  if (stepEvent) {
    eventsForBurn.push({
      id: 'step_event',
      event_type: 'exercise',
      value: stepEvent.value,
      wallTime: '12:00',
      duration_seconds: stepEvent.duration_seconds,
    });
  }

  eventsForBurn.forEach(ev => {
    if (ev.event_type === 'exercise') {
      const mets = 3 + (ev.value || 0.5) * 9;
      const durHrs = (ev.duration_seconds || 1800) / 3600;
      exerciseKcal += mets * weightVal * durHrs;
    } else if (ev.event_type === 'meal') {
      mealKcal += (ev.value || 0);
    }
  });

  const totalBurn = Math.round(bmr + exerciseKcal);
  const balance = Math.round(mealKcal - totalBurn);

  return {
    bmr_kcal_day: bmr,
    estimated_burn_kcal: totalBurn,
    meal_intake_kcal: Math.round(mealKcal),
    caloric_balance: balance,
    balance_status: balance > 100 ? "Surplus" : (balance < -100 ? "Deficit" : "Balanced"),
    note: "Local estimated balance. Sync with engine for physiological details.",
  };
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function BiogearsTwinProvider({ children }: { children: React.ReactNode }) {
  const { activeProfile: profile, activeMemberId, isSwitched } = useFamily();
  const { steps } = useSteps();

  // Derive userId from profile: use Firebase UID stored in profile, or firstName+lastName slug
  const { medicines } = useMedicine();

  // Derive userId from profile using shared utility
  const twinUserId = profile ? getTwinId(profile) : null;

  // When switched, the member's Firebase UID is activeMemberId
  // We use this to read the correct Firestore subcollections (routines, session_meta)
  const firestoreOwnerUid = isSwitched ? activeMemberId : undefined;

  const [twinStatus, setTwinStatus] = useState<TwinStatus>('checking');
  const [twinStatusError, setTwinStatusError] = useState<string | null>(null);
  const [simulationStatus, setSimulationStatus] = useState<SimulationStatus>('idle');
  const [simulationProgress, setSimulationProgress] = useState('');
  const [simulationError, setSimulationError] = useState<string | null>(null);

  const [lastVitals, setLastVitals] = useState<BiogearsVitals | null>(null);
  const [lastAnomalies, setLastAnomalies] = useState<any[]>([]);
  const [lastInteractionWarnings, setLastInteractionWarnings] = useState<string[]>([]);
  const [lastSessionId, setLastSessionId] = useState<string | null>(null);
  const [lastAiInsights, setLastAiInsights] = useState<string[]>([]);
  const [lastAiInsightsText, setLastAiInsightsText] = useState<string>('');
  const [aiInsightsLoading, setAiInsightsLoading] = useState<boolean>(false);
  const [aiServerUrl, setAiServerUrlState] = useState<string>('');

  const [isTwinRegistered, setIsTwinRegistered] = useState(false);
  const [savedRoutines, setSavedRoutines] = useState<SavedRoutine[]>([]);
  const [editingRoutineId, setEditingRoutineId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<LocalSessionMeta[]>([]);
  const [simulationName, setSimulationName] = useState('');

  const [todayEvents, setTodayEvents] = useState<RoutineEvent[]>([]);

  // Analytics State
  const [organScores, setOrganScores] = useState<OrganScoresResponse | null>(null);
  const [vitalsTrends, setVitalsTrends] = useState<VitalsTrendResponse | null>(null);
  const [cvdRisk, setCvdRisk] = useState<CVDRiskResponse | null>(null);
  const [recoveryReadiness, setRecoveryReadiness] = useState<RecoveryReadinessResponse | null>(null);
  const [weeklySummary, setWeeklySummary] = useState<any>(null);
  const [healthScore, setHealthScore] = useState<any>(null);
  const [bodyMetrics, setBodyMetrics] = useState<any>(null);
  const [caloricBalance, setCaloricBalance] = useState<CaloricBalanceResponse | null>(null);
  const [todayMacros, setTodayMacros] = useState({ carbs: 0, protein: 0, fat: 0, calories: 0 });
  const [substances, setSubstances] = useState<Record<string, string[]>>({});

  // ── Conflict Resolution State ─────────────────────────────────────────────
  const [pendingConflicts, setPendingConflicts] = useState<EventConflict[]>([]);
  const [pendingConflictResolver, setPendingConflictResolver] =
    useState<((resolutions: Record<string, 'keep_mine' | 'use_routine' | 'keep_both'>) => void) | null>(null);

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const simStartRef = useRef<number | null>(null);   // epoch ms when simulation started
  const progressTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevTwinUserIdRef = useRef<string | null>(null); // tracks last loaded twinUserId
  const initDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null); // debounce rapid profile updates

  // ── Substances Library ────────────────────────────────────────────────────

  const substanceFetchingRef = useRef(false);

  const refreshSubstances = useCallback(async () => {
    // Guard: don't fire a second request if one is already in-flight
    if (substanceFetchingRef.current) return;
    substanceFetchingRef.current = true;
    try {
      const data = await BiogearsAPI.getSubstances();
      setSubstances(data.substances);
    } catch (err: any) {
      // Silently ignore network errors — the substance list is non-critical
      // and the server may simply not be reachable on this network.
      console.log('[BioGears] Substances unavailable (server unreachable) — will use defaults.');
    } finally {
      substanceFetchingRef.current = false;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  // ── Recheck twin status on server ─────────────────────────────────────────

  const recheckTwinStatus = useCallback(async () => {
    if (!twinUserId) { setTwinStatus('unregistered'); return; }
    setTwinStatus('checking');
    try {
      await BiogearsAPI.getTwinProfile(twinUserId);
      setTwinStatus('ready');
      setTwinStatusError(null);
    } catch (err: any) {
      if (err.statusCode === 404) {
        setTwinStatus('unregistered');
      } else {
        // Server unreachable — use persisted flag as offline fallback
        // so previously-calibrated users still see "Calibrated" status
        if (profile?.biogears_registered) {
          setTwinStatus('ready');
          setTwinStatusError(null);
        } else {
          setTwinStatusError(err.message || 'Cannot reach BioGears server');
          setTwinStatus('error');
        }
      }
    }
  }, [twinUserId, profile?.biogears_registered]);

  // ── Load persisted data on mount ─────────────────────────────────────────

  useEffect(() => {
    // Guard 1: skip if twinUserId is not yet resolved.
    // Guard 2: skip 'temp_user' — that's the AsyncStorage placeholder before
    //   the real Firebase profile loads. We'll fire again with the real ID.
    if (!twinUserId || twinUserId === 'temp_user') return;

    // Debounce: ProfileContext fires twice in quick succession —
    // first from AsyncStorage (temp_user), then from Firebase (real id).
    // The 200ms debounce collapses the second rapid update into one call.
    if (initDebounceRef.current) clearTimeout(initDebounceRef.current);

    initDebounceRef.current = setTimeout(() => {
      const isNewUser = prevTwinUserIdRef.current !== null && prevTwinUserIdRef.current !== twinUserId;
      prevTwinUserIdRef.current = twinUserId;

      if (isNewUser) {
        setLastVitals(null);
        setLastAnomalies([]);
        setLastInteractionWarnings([]);
        setLastSessionId(null);
        setLastAiInsights([]);
        setLastAiInsightsText('');
        setSavedRoutines([]);
        setSessions([]);
        setTodayEvents([]);
        setOrganScores(null);
        setVitalsTrends(null);
        setCvdRisk(null);
        setRecoveryReadiness(null);
        setWeeklySummary(null);
        setHealthScore(null);
        setBodyMetrics(null);
        setSimulationStatus('idle');
        setSimulationError(null);
      }

      recheckTwinStatus();
      loadTodayFromStorage();

      (async () => {
        try {
          await BiogearsAPI.syncDigitalTwinDataFromFirestore(twinUserId, firestoreOwnerUid);
          
          const remotePending = await BiogearsAPI.fetchPendingEvents(twinUserId, firestoreOwnerUid);
          if (remotePending && remotePending.length > 0) {
            const todayStr = new Date().toDateString();
            const fresh = remotePending.filter(e => {
              if (!e.timestamp) return false;
              return new Date(e.timestamp * 1000).toDateString() === todayStr;
            });
            setTodayEvents(fresh);
            await AsyncStorage.setItem(TODAY_EVENTS_KEY(twinUserId), JSON.stringify(fresh));
          }

          await loadRoutinesFromStorage();
          const syncedSessions = await refreshSessions();

          // Self-heal SQLite simulation_history table from synced sessions
          if (syncedSessions && syncedSessions.length > 0) {
            console.log(`[BiogearsTwin] Self-healing SQLite simulation_history with ${syncedSessions.length} sessions`);
            for (const s of syncedSessions) {
              if (s.vitals_snapshot) {
                const anomaliesList = s.has_anomaly ? [{ label: 'Anomaly' }] : [];
                await saveSimulationResult(twinUserId, s.session_id, s.vitals_snapshot, anomaliesList).catch(() => {});
              }
            }
          }

          const record = await getLastSimulation(twinUserId);
          if (record) {
            setLastVitals(recordToVitals(record));
            if (record.anomaly_labels) {
              try {
                const labels: string[] = JSON.parse(record.anomaly_labels);
                setLastAnomalies(labels.map(l => ({ label: l, severity: 'warning', value: 0, normal_range: '' })));
              } catch { /* ignore */ }
            }
            console.log('[BiogearsTwin] Loaded cached vitals from local DB (offline fallback)');
          } else {
            setLastVitals(null);
            setLastAnomalies([]);
          }

          await refreshAnalytics();
        } catch (e) {
          console.error('[BiogearsTwin] Sync & load error:', e);
        }
      })();

      resumeActiveJob();
    }, 200);

    return () => {
      if (initDebounceRef.current) clearTimeout(initDebounceRef.current);
    };
  }, [
    twinUserId,
    firestoreOwnerUid,
    profile?.weight,
    profile?.height,
    profile?.dateOfBirth,
    profile?.gender,
    profile?.biogears_resting_hr,
    profile?.biogears_systolic_bp,
    profile?.biogears_diastolic_bp,
    profile?.biogears_body_fat,
    profile?.biogears_is_smoker,
    profile?.biogears_has_anemia,
    profile?.biogears_has_type1_diabetes,
    profile?.biogears_has_type2_diabetes,
    profile?.biogears_hba1c,
    profile?.biogears_ethnicity,
    profile?.biogears_fitness_level,
    profile?.biogears_vo2max,
    profile?.biogears_registered,
    JSON.stringify((profile as any)?.habits),
  ]);


  const resumeActiveJob = async () => {
    try {
      const jobId = await AsyncStorage.getItem('biogears_active_job');
      if (!jobId) return;
      
      const statusRes = await BiogearsAPI.getJobStatus(jobId);
      if (statusRes.status === 'running' || statusRes.status === 'pending') {
        console.log(`[BiogearsTwin] Resuming active job: ${jobId}`);
        setSimulationStatus('running');
        setSimulationProgress('Resuming background simulation...');
        const result = await BiogearsAPI.pollUntilDone(jobId, 3000, 43_200_000);
        await finishSimulationSuccess(result);
      } else {
        await AsyncStorage.removeItem('biogears_active_job');
      }
    } catch (err) {
      console.log('Failed to resume active job:', err);
      await AsyncStorage.removeItem('biogears_active_job');
    }
  };

  const finishSimulationSuccess = async (result: any) => {
    const todayStr = new Date().toDateString();
    await AsyncStorage.setItem('@last_simulated_date', todayStr);
    await scheduleDailyLogReminder();

    setLastVitals(result.vitals);
    setLastAnomalies(result.anomalies || []);
    setLastInteractionWarnings(result.interaction_warnings || []);

    const sessionId = new Date().toISOString().replace(/[:.]/g, '-');
    await saveSimulationResult(
      twinUserId!,
      sessionId,
      result.vitals,
      result.anomalies || []
    ).catch(err => console.warn('[BiogearsTwin] Local save failed (non-fatal):', err));

    setLastSessionId(sessionId);

    // Generate quick fallback insights immediately (shown while AI loads)
    const fallbackInsights = generateInsights(result);
    setLastAiInsights(fallbackInsights);
    setLastAiInsightsText('');

    // Async: fetch richer AI insights from the healthbot server
    (async () => {
      try {
        const storedIp   = await AsyncStorage.getItem(AI_SERVER_URL_KEY) || '';
        const storedPort = await AsyncStorage.getItem(AI_SERVER_PORT_KEY) || '8000';
        if (!storedIp) return;   // AI server not configured — silently skip

        const baseUrl = storedIp.startsWith('http') ? storedIp : `http://${storedIp}:${storedPort}`;
        const eventsLabel = todayEvents
          .map(e => e.displayLabel)
          .filter(Boolean)
          .slice(0, 5)
          .join(', ');

        setAiInsightsLoading(true);
        const res = await fetch(`${baseUrl}/biogears-insights`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vitals:               result.vitals || {},
            anomalies:            result.anomalies || [],
            has_anomaly:          result.has_anomaly || false,
            has_drug_interaction: result.has_drug_interaction || false,
            interaction_warnings: result.interaction_warnings || [],
            data_gap_warning:     result.data_gap_warning || null,
            events_summary:       eventsLabel || null,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.insights_text) setLastAiInsightsText(data.insights_text);
          if (data.bullet_points?.length > 0) setLastAiInsights(data.bullet_points);
        }
      } catch (_e) {
        // Silently fall back to hardcoded insights
      } finally {
        setAiInsightsLoading(false);
      }
    })();

    const sessionMeta: LocalSessionMeta = {
      session_id: sessionId,
      name: simulationName || `Simulation ${new Date().toLocaleDateString('en-IN')}`,
      timestamp: new Date().toISOString(),
      vitals_snapshot: result.vitals,
      has_anomaly: result.has_anomaly,
      events: todayEvents,
      event_count: todayEvents.length,
      ai_insights: fallbackInsights,

    };
    await BiogearsAPI.saveSessionMeta(twinUserId!, sessionMeta, firestoreOwnerUid);
    setSessions(prev => [sessionMeta, ...prev]);

    setSimulationStatus('done');
    setSimulationProgress('Simulation complete!');
    setSimulationName('');
    // Stop progress ticker
    if (progressTickRef.current) {
      clearInterval(progressTickRef.current);
      progressTickRef.current = null;
    }
    simStartRef.current = null;
    setTodayEvents([]);
    if (twinUserId) {
      await AsyncStorage.removeItem(TODAY_EVENTS_KEY(twinUserId));
      await BiogearsAPI.syncPendingEvents(twinUserId, [], firestoreOwnerUid).catch(() => {});
    }

    await refreshSessions();
    await refreshAnalytics();
  };

  const loadTodayFromStorage = async () => {
    if (!twinUserId) return;
    try {
      const raw = await AsyncStorage.getItem(TODAY_EVENTS_KEY(twinUserId));
      if (raw) {
        const stored = JSON.parse(raw) as RoutineEvent[];
        // Only keep today's events (don't carry over from yesterday)
        const todayStr = new Date().toDateString();
        const fresh = stored.filter(e => {
          if (!e.timestamp) return false;
          return new Date(e.timestamp * 1000).toDateString() === todayStr;
        });
        setTodayEvents(fresh);
      }
    } catch { /* ignore */ }
  };

  const persistToday = async (events: RoutineEvent[]) => {
    if (!twinUserId) return;
    try {
      await AsyncStorage.setItem(TODAY_EVENTS_KEY(twinUserId), JSON.stringify(events));
      await BiogearsAPI.syncPendingEvents(twinUserId, events, firestoreOwnerUid);
    } catch { /* ignore */ }
  };

  const loadRoutinesFromStorage = async () => {
    if (!twinUserId) return;
    const r = await BiogearsAPI.loadSavedRoutines(twinUserId);

    // Auto-generate "My Saved State" for users who have onboarding habits
    // but no saved routines yet (covers new signups + existing users)
    if (r.length === 0) {
      try {
        let habits: any = null;

        // 1. Check if habits are stored in the synced Firestore profile
        if (profile && (profile as any).habits) {
          habits = (profile as any).habits;
          console.log('[BiogearsTwin] Found habits on profile from Firestore');
        } else {
          // 2. Fallback to AsyncStorage for offline / new onboarding completions
          const user = auth.currentUser;
          const habitsKey = user ? `@onboarding_habits_${user.uid}` : null;
          if (habitsKey) {
            const raw = await AsyncStorage.getItem(habitsKey);
            if (raw) {
              habits = JSON.parse(raw);
              console.log('[BiogearsTwin] Found habits in local AsyncStorage');
            }
          }
        }

        if (habits) {
          const heightVal = profile ? parseFloat(String(profile.height || '').replace(/[^0-9.]/g, '')) : 175;
          const weightVal = profile ? parseFloat(String(profile.weight || '').replace(/[^0-9.]/g, '')) : 70;
          const routine = buildDefaultRoutine(habits, {
            gender: profile ? profile.gender : 'Male',
            dateOfBirth: profile ? profile.dateOfBirth : '1995-01-01',
            height: heightVal || 175,
            weight: weightVal || 70,
          });
          await BiogearsAPI.saveRoutine(twinUserId, routine, firestoreOwnerUid);
          await BiogearsAPI.setDefaultRoutine(twinUserId, routine.id, firestoreOwnerUid, true);
          setSavedRoutines([routine]);
          console.log('[BiogearsTwin] ✅ Auto-generated default routine "My Saved State" from habits');
          return;
        }
      } catch (e) {
        console.log('[BiogearsTwin] Could not auto-generate default routine:', e);
      }
    }

    // 1. Deduplicate and self-heal onboarding/default routines (removes duplicate 'My Typical Day' etc)
    const onboardingRoutines = r.filter(routine => 
      routine.id.startsWith('routine_onboarding_') || 
      routine.tags?.includes('onboarding') ||
      routine.name === 'My Typical Day' ||
      routine.name === 'Saved State' ||
      routine.name === 'My Saved State'
    );

    if (onboardingRoutines.length > 0) {
      // Prioritize: isDefault, then latest createdAt
      const sortedOnboarding = [...onboardingRoutines].sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      const primary = sortedOnboarding[0];
      const toDelete = sortedOnboarding.slice(1);

      let needsRefresh = false;

      // Auto-rename ONLY if the routine still has its original onboarding ID
      // AND has a default placeholder name. If the user has already manually
      // renamed it (name differs from defaults), we respect that name.
      const isStillPlaceholderName = (
        primary.name === 'My Typical Day' ||
        primary.name === 'Saved State' ||
        primary.name === 'My Saved State'
      );
      const hasOnboardingId = primary.id.startsWith('routine_onboarding_');
      const shouldAutoRename = (hasOnboardingId || isStillPlaceholderName) && primary.name !== 'My Saved State';

      if (shouldAutoRename || !primary.isDefault) {
        if (shouldAutoRename) primary.name = 'My Saved State';
        primary.isDefault = true;
        await BiogearsAPI.saveRoutine(twinUserId, primary, firestoreOwnerUid);
        await BiogearsAPI.setDefaultRoutine(twinUserId, primary.id, firestoreOwnerUid, true);
        needsRefresh = true;
      }

      // Delete all other duplicate onboarding/default routines
      if (toDelete.length > 0) {
        console.log(`[BiogearsTwin] Cleaning up ${toDelete.length} duplicate onboarding routine(s).`);
        for (const dup of toDelete) {
          await BiogearsAPI.deleteRoutine(twinUserId, dup.id, firestoreOwnerUid);
        }
        needsRefresh = true;
      }

      if (needsRefresh) {
        const cleaned = await BiogearsAPI.loadSavedRoutines(twinUserId);
        setSavedRoutines(cleaned);
        return;
      }
    }

    // 2. Deduplicate remaining/other routines by name (cleans up any other duplicate names)
    const uniqueMap = new Map<string, typeof r[0]>();
    const duplicatesToRemove: typeof r = [];

    r.forEach(routine => {
      const existing = uniqueMap.get(routine.name);
      if (!existing) {
        uniqueMap.set(routine.name, routine);
      } else {
        // Prioritize keeping the default catch-up one
        if (routine.isDefault && !existing.isDefault) {
          duplicatesToRemove.push(existing);
          uniqueMap.set(routine.name, routine);
        } else {
          duplicatesToRemove.push(routine);
        }
      }
    });

    if (duplicatesToRemove.length > 0) {
      console.log(`[BiogearsTwin] Cleaned up ${duplicatesToRemove.length} duplicate routine(s).`);
      for (const dup of duplicatesToRemove) {
        await BiogearsAPI.deleteRoutine(twinUserId, dup.id, firestoreOwnerUid);
      }
      const cleaned = await BiogearsAPI.loadSavedRoutines(twinUserId);
      setSavedRoutines(cleaned);
      return;
    }

    // Ensure at least one routine is default if list is not empty
    const hasDefault = r.some(routine => routine.isDefault);
    if (r.length > 0 && !hasDefault) {
      console.log('[BiogearsTwin] No default routine found. Auto-designating first routine as default.');
      r[0].isDefault = true;
      await BiogearsAPI.saveRoutine(twinUserId, r[0], firestoreOwnerUid);
      await BiogearsAPI.setDefaultRoutine(twinUserId, r[0].id, firestoreOwnerUid, true);
    }

    setSavedRoutines(r);
  };

  const refreshSessions = useCallback(async () => {
    if (!twinUserId) return [];
    const s = await BiogearsAPI.loadSessionsMeta(twinUserId);
    setSessions(s);
    return s;
  }, [twinUserId]);

  const getVitalsTrendsFallback = useCallback((sessionsList: LocalSessionMeta[]): VitalsTrendResponse => {
    // Sort sessions chronologically (oldest first)
    const sorted = [...sessionsList]
      .filter(s => s.vitals_snapshot)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Map each session to a trend point matching the API schema
    const trendSessions = sorted.map(s => {
      const v = s.vitals_snapshot;
      let systolic_bp: number | undefined = undefined;
      let diastolic_bp: number | undefined = undefined;
      if (v?.blood_pressure) {
        const parts = v.blood_pressure.split('/');
        if (parts.length === 2) {
          systolic_bp = parseFloat(parts[0]);
          diastolic_bp = parseFloat(parts[1]);
        }
      }

      return {
        session_id: s.session_id,
        timestamp: s.timestamp,
        heart_rate: v?.heart_rate ?? undefined,
        respiration_rate: v?.respiration ?? undefined,
        systolic_bp,
        diastolic_bp,
        oxygen_saturation: v?.spo2 ?? undefined,
        temperature: v?.core_temperature ?? undefined,
        glucose: v?.glucose ?? undefined,
      };
    });

    const trends: Record<string, { direction: string; normal_range: string }> = {};
    const overall_averages: Record<string, number> = {};

    const metrics = ['heart_rate', 'respiration_rate', 'systolic_bp', 'diastolic_bp', 'oxygen_saturation', 'temperature', 'glucose'];
    metrics.forEach(m => {
      const values = trendSessions.map((s: any) => s[m]).filter(v => v != null);
      if (values.length > 0) {
        const sum = values.reduce((a, b) => a + b, 0);
        overall_averages[m] = sum / values.length;

        let direction = 'stable';
        if (values.length >= 2) {
          const first = values[0];
          const last = values[values.length - 1];
          const pct = (last - first) / first;
          if (pct > 0.05) direction = 'rising';
          else if (pct < -0.05) direction = 'falling';
        }
        trends[m] = { direction, normal_range: '' };
      }
    });

    return {
      sessions: trendSessions,
      trends,
      overall_averages,
    };
  }, []);

  const refreshAnalytics = useCallback(async () => {
    // Don't hammer the server when the twin isn't registered yet
    if (!twinUserId || twinStatus === 'unregistered' || twinStatus === 'checking') return;
    try {
      // Prepare events for caloric balance
      const eventsForBurn: BiogearsHealthEvent[] = todayEvents.map(e => ({
        event_type: e.event_type,
        value: e.value,
        timestamp: e.timestamp ?? wallTimeToTimestamp(e.wallTime),
        substance_name: e.substance_name,
        meal_type: e.meal_type,
        carb_g: e.carb_g,
        fat_g: e.fat_g,
        protein_g: e.protein_g,
        duration_seconds: e.duration_seconds,
        environment_name: e.environment_name,
        notes: e.notes,
      }));

      // Append steps exercise
      const weightVal = profile ? parseFloat(String(profile.weight || '').replace(/[^0-9.]/g, '')) : 70;
      const heightVal = profile ? parseFloat(String(profile.height || '').replace(/[^0-9.]/g, '')) : 170;
      const stepEvent = buildStepExerciseEvent(steps, weightVal || 70, heightVal || 170);
      if (stepEvent) {
        eventsForBurn.push(stepEvent);
      }

      const results = await Promise.allSettled([
        BiogearsAPI.getOrganScores(twinUserId),
        BiogearsAPI.getVitalsTrends(twinUserId),
        BiogearsAPI.getCVDRisk(twinUserId),
        BiogearsAPI.getRecoveryReadiness(twinUserId),
        BiogearsAPI.getWeeklySummary(twinUserId),
        BiogearsAPI.getHealthScore(twinUserId),
        BiogearsAPI.getBodyMetrics(twinUserId),
        BiogearsAPI.getCaloricBalance(twinUserId, eventsForBurn),
      ]);
      const [organs, trends, cvd, recovery, weekly, score, metrics, caloriesBal] = results;

      let activeTrends = trends.status === 'fulfilled' ? trends.value : null;

      // Fallback for vitalsTrends if API failed or empty
      if (!activeTrends || !activeTrends.sessions || activeTrends.sessions.length === 0) {
        console.log('[BiogearsTwin] Constructing local fallback for vitals trends from sessions...');
        activeTrends = getVitalsTrendsFallback(sessions);
      }

      if (organs.status === 'fulfilled') setOrganScores(organs.value);
      if (activeTrends) setVitalsTrends(activeTrends);
      if (cvd.status === 'fulfilled') setCvdRisk(cvd.value);
      if (recovery.status === 'fulfilled') setRecoveryReadiness(recovery.value);
      if (weekly.status === 'fulfilled') setWeeklySummary(weekly.value);
      if (score.status === 'fulfilled') setHealthScore(score.value);
      if (metrics.status === 'fulfilled') setBodyMetrics(metrics.value);
      if (caloriesBal.status === 'fulfilled') {
        setCaloricBalance(caloriesBal.value);
      } else {
        const localEst = computeLocalCaloricBalanceFallback(profile, todayEvents, steps);
        setCaloricBalance(localEst);
      }

      // Cache all resolved analytics to Firestore
      const cacheObj = {
        organScores: organs.status === 'fulfilled' ? organs.value : organScores,
        vitalsTrends: activeTrends,
        cvdRisk: cvd.status === 'fulfilled' ? cvd.value : cvdRisk,
        recoveryReadiness: recovery.status === 'fulfilled' ? recovery.value : recoveryReadiness,
        weeklySummary: weekly.status === 'fulfilled' ? weekly.value : weeklySummary,
        healthScore: score.status === 'fulfilled' ? score.value : healthScore,
        bodyMetrics: metrics.status === 'fulfilled' ? metrics.value : bodyMetrics,
        caloricBalance: caloriesBal.status === 'fulfilled' ? caloriesBal.value : caloricBalance,
      };
      await syncBiogearsAnalytics(cacheObj, firestoreOwnerUid);
    } catch (err) {
      console.error('Failed to fetch analytics:', err);

      // Offline/failure fallback: load from Firestore cache
      const cached = await fetchBiogearsAnalyticsFromFirebase(firestoreOwnerUid);
      if (cached) {
        if (cached.organScores) setOrganScores(cached.organScores);
        if (cached.vitalsTrends) setVitalsTrends(cached.vitalsTrends);
        if (cached.cvdRisk) setCvdRisk(cached.cvdRisk);
        if (cached.recoveryReadiness) setRecoveryReadiness(cached.recoveryReadiness);
        if (cached.weeklySummary) setWeeklySummary(cached.weeklySummary);
        if (cached.healthScore) setHealthScore(cached.healthScore);
        if (cached.bodyMetrics) setBodyMetrics(cached.bodyMetrics);
        if (cached.caloricBalance) setCaloricBalance(cached.caloricBalance);
      } else {
        // Construct fallback trends as a last resort
        setVitalsTrends(getVitalsTrendsFallback(sessions));
        const localEst = computeLocalCaloricBalanceFallback(profile, todayEvents, steps);
        setCaloricBalance(localEst);
      }
    }
  }, [
    twinUserId,
    twinStatus,
    sessions,
    getVitalsTrendsFallback,
    firestoreOwnerUid,
    organScores,
    vitalsTrends,
    cvdRisk,
    recoveryReadiness,
    weeklySummary,
    healthScore,
    bodyMetrics,
    todayEvents,
    steps,
    profile,
    caloricBalance,
  ]);

  const refreshAnalyticsRef = useRef(refreshAnalytics);
  useEffect(() => {
    refreshAnalyticsRef.current = refreshAnalytics;
  }, [refreshAnalytics]);

  useEffect(() => {
    if (!twinUserId || twinStatus === 'unregistered' || twinStatus === 'checking') return;

    const timer = setTimeout(() => {
      console.log('[BiogearsTwin] Steps or todayEvents changed. Refreshing analytics (debounced)...');
      refreshAnalyticsRef.current();
    }, 2000);

    return () => clearTimeout(timer);
  }, [steps, todayEvents, twinUserId, twinStatus]);

  useEffect(() => {
    const macros = todayEvents.reduce((acc, e) => {
      if (e.event_type === 'meal') {
        acc.carbs += (e.carb_g || 0);
        acc.protein += (e.protein_g || 0);
        acc.fat += (e.fat_g || 0);
        acc.calories += (e.value || 0);
      }
      return acc;
    }, { carbs: 0, protein: 0, fat: 0, calories: 0 });
    setTodayMacros(macros);
  }, [todayEvents]);

  const updateCaloricBalance = useCallback(async () => {
    if (!profile) return;
    
    const weightVal = parseFloat(String(profile.weight || '').replace(/[^0-9.]/g, '')) || 70;
    const heightVal = parseFloat(String(profile.height || '').replace(/[^0-9.]/g, '')) || 170;
    const stepEvent = buildStepExerciseEvent(steps, weightVal, heightVal);
    const eventsForBurn: BiogearsHealthEvent[] = todayEvents.map(e => ({
      event_type: e.event_type,
      value: e.value,
      timestamp: e.timestamp ?? wallTimeToTimestamp(e.wallTime),
      substance_name: e.substance_name,
      meal_type: e.meal_type,
      carb_g: e.carb_g,
      fat_g: e.fat_g,
      protein_g: e.protein_g,
      duration_seconds: e.duration_seconds,
      environment_name: e.environment_name,
      notes: e.notes,
    }));
    if (stepEvent) {
      eventsForBurn.push(stepEvent);
    }

    if (twinUserId && twinStatus !== 'unregistered' && twinStatus !== 'checking') {
      try {
        const bal = await BiogearsAPI.getCaloricBalance(twinUserId, eventsForBurn);
        setCaloricBalance(bal);
        return;
      } catch (err) {
        console.log('[BiogearsTwin] Failed to get BioGears caloric balance, using local fallback:', err);
      }
    }

    const localEst = computeLocalCaloricBalanceFallback(profile, todayEvents, steps);
    setCaloricBalance(localEst);
  }, [profile, todayEvents, steps, twinUserId, twinStatus]);

  // Update caloric balance as steps, profile, or todayEvents change with debounce
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      updateCaloricBalance();
    }, 1000);

    return () => clearTimeout(delayDebounceFn);
  }, [profile, todayEvents, steps, updateCaloricBalance]);

  // ── Today's Events ────────────────────────────────────────────────────────

  const addEvent = useCallback((event: Omit<RoutineEvent, 'id'>) => {
    const newEvent: RoutineEvent = {
      ...event,
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      // Convert wallTime → timestamp
      timestamp: wallTimeToTimestamp(event.wallTime),
    };
    setTodayEvents(prev => {
      const updated = [...prev, newEvent].sort((a, b) =>
        (a.timestamp || 0) - (b.timestamp || 0)
      );
      persistToday(updated);
      return updated;
    });
  }, [twinUserId]);

  const removeEvent = useCallback((id: string) => {
    setTodayEvents(prev => {
      const updated = prev.filter(e => e.id !== id);
      persistToday(updated);
      return updated;
    });
  }, [twinUserId]);

  const updateEvent = useCallback((id: string, updates: Partial<RoutineEvent>) => {
    setTodayEvents(prev => {
      const updated = prev.map(e => {
        if (e.id !== id) return e;
        const merged = { ...e, ...updates };
        // Recalculate timestamp if wallTime changed
        if (updates.wallTime) {
          merged.timestamp = wallTimeToTimestamp(updates.wallTime);
        }
        return merged;
      }).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      persistToday(updated);
      return updated;
    });
  }, [twinUserId]);

  const setTodayEventsWrapped = useCallback((events: RoutineEvent[]) => {
    setTodayEvents(events);
    persistToday(events);
  }, [twinUserId, firestoreOwnerUid]);

  const clearToday = useCallback(() => {
    setTodayEvents([]);
    if (twinUserId) {
      AsyncStorage.removeItem(TODAY_EVENTS_KEY(twinUserId));
      BiogearsAPI.syncPendingEvents(twinUserId, [], firestoreOwnerUid).catch(() => {});
    }
  }, [twinUserId, firestoreOwnerUid]);

  // ── Saved Routines ────────────────────────────────────────────────────────

  const saveCurrentRoutine = useCallback(async (name: string, tags?: string[], overwriteId?: string, autoDefault?: boolean) => {
    if (!twinUserId || todayEvents.length === 0) return;
    const routine: SavedRoutine = {
      id: overwriteId || `routine_${Date.now()}`,
      name,
      events: todayEvents,
      eventCount: todayEvents.length,
      createdAt: new Date().toISOString(),
      tags,
    };
    // Preserve isDefault if overwriting an existing default routine
    if (overwriteId) {
      const existing = savedRoutines.find(r => r.id === overwriteId);
      if (existing?.isDefault) routine.isDefault = true;
    }
    // Auto-mark as default when caller requests it (e.g. first routine ever saved)
    if (autoDefault) {
      routine.isDefault = true;
    }
    await BiogearsAPI.saveRoutine(twinUserId, routine, firestoreOwnerUid);
    // If we just set a new default, clear isDefault on all others in storage
    if (routine.isDefault) {
      await BiogearsAPI.setDefaultRoutine(twinUserId, routine.id, firestoreOwnerUid);
    }
    setSavedRoutines(prev => {
      const filtered = prev.filter(r => r.id !== routine.id);
      // If new routine is default, unmark all others
      const base = routine.isDefault ? filtered.map(r => ({ ...r, isDefault: false })) : filtered;
      return [routine, ...base];
    });
    setEditingRoutineId(null);
  }, [twinUserId, todayEvents, savedRoutines, firestoreOwnerUid]);

  const loadRoutine = useCallback((routineId: string, anchorDate?: Date) => {
    const routine = savedRoutines.find(r => r.id === routineId);
    if (!routine) return;

    const remapped: RoutineEvent[] = routine.events.map(e => ({
      ...(e as RoutineEvent),
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      source: 'routine' as const,
      timestamp: (e as RoutineEvent).wallTime
        ? wallTimeToTimestamp((e as RoutineEvent).wallTime, anchorDate)
        : undefined,
    }));
    const sorted = remapped.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    setTodayEvents(sorted);
    persistToday(sorted);
    if (twinUserId) BiogearsAPI.markRoutineUsed(twinUserId, routineId, firestoreOwnerUid);
  }, [savedRoutines, twinUserId, firestoreOwnerUid]);

  /**
   * Smart-merge: loads a routine into today's timeline, first detecting conflicts
   * between incoming routine events and manually-entered todayEvents.
   *
   * If conflicts exist, calls onConflicts() so the UI can show a resolution sheet.
   * The resolve() callback (passed into onConflicts) applies the user's decisions.
   *
   * If no conflicts, merges directly — appending only events whose wallTime <= now
   * and deduplicating by fingerprint automatically.
   */
  const loadRoutineWithConflictCheck = useCallback((
    routineId: string,
    onConflicts?: (
      conflicts: EventConflict[],
      resolve: (resolutions: Record<string, 'keep_mine' | 'use_routine' | 'keep_both'>) => void
    ) => void
  ) => {
    const routine = savedRoutines.find(r => r.id === routineId);
    if (!routine) return;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // Parse a wallTime string into minutes-since-midnight
    const toMin = (wt: string) => {
      const [h = 0, m = 0] = wt.split(':').map(Number);
      return h * 60 + m;
    };

    // Only consider events whose wallTime has already passed (past events only)
    const incoming: RoutineEvent[] = routine.events
      .filter(e => {
        const wt = (e as any).wallTime || '00:00';
        return toMin(wt) <= currentMinutes;
      })
      .map(e => ({
        ...(e as RoutineEvent),
        id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        source: 'routine' as const,
        timestamp: (e as RoutineEvent).wallTime
          ? wallTimeToTimestamp((e as RoutineEvent).wallTime)
          : undefined,
      }));

    const conflicts = detectConflicts(incoming, todayEvents);

    // Commit safe/non-conflicting events immediately
    const conflictFps = new Set(conflicts.map(c => c.fingerprint));
    const safeToAdd = incoming.filter(inc => !conflictFps.has(getEventFingerprint(inc)));

    const commitSafeEvents = () => {
      if (safeToAdd.length === 0) return;
      setTodayEvents(prev => {
        const merged = [...prev, ...safeToAdd].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        persistToday(merged);
        return merged;
      });
    };

    if (conflicts.length === 0) {
      commitSafeEvents();
      if (twinUserId) BiogearsAPI.markRoutineUsed(twinUserId, routineId, firestoreOwnerUid);
      return;
    }

    // Surface conflicts using context state for ConflictResolutionSheet
    commitSafeEvents();
    setPendingConflicts(conflicts);
    setPendingConflictResolver(() => (resolutions: Record<string, 'keep_mine' | 'use_routine' | 'keep_both'> | null) => {
      setPendingConflicts([]);
      setPendingConflictResolver(null);

      if (!resolutions) {
        return;
      }

      // Apply resolutions: incoming routine events
      const toAppend: RoutineEvent[] = [];
      for (const c of conflicts) {
        const r = resolutions[c.fingerprint] ?? 'keep_mine';
        if (r === 'use_routine' || r === 'keep_both') {
          toAppend.push(c.incoming);
        }
      }

      // Remove replaced events when 'use_routine' is chosen
      setTodayEvents(prev => {
        let current = [...prev];
        for (const c of conflicts) {
          const r = resolutions[c.fingerprint] ?? 'keep_mine';
          if (r === 'use_routine') {
            current = current.filter(e => e.id !== c.existing.id);
          }
        }
        const merged = [...current, ...toAppend].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        persistToday(merged);
        return merged;
      });

      if (twinUserId) BiogearsAPI.markRoutineUsed(twinUserId, routineId, firestoreOwnerUid);
    });

    if (onConflicts) {
      onConflicts(conflicts, () => {});
    }
  }, [savedRoutines, todayEvents, twinUserId, firestoreOwnerUid]);

  /**
   * Rename a saved routine in-place without changing its events or ID.
   * Respects Firestore sync. Also updates the in-memory savedRoutines list.
   */
  const renameRoutine = useCallback(async (routineId: string, newName: string) => {
    if (!twinUserId) return;
    const trimmed = newName.trim();
    if (!trimmed) return;

    // Detect name collision with other routines (not itself)
    const conflict = savedRoutines.some(r => r.id !== routineId && r.name === trimmed);
    if (conflict) throw new Error(`A routine named "${trimmed}" already exists.`);

    const existing = savedRoutines.find(r => r.id === routineId);
    if (!existing) return;

    const updated: typeof existing = { ...existing, name: trimmed };
    await BiogearsAPI.saveRoutine(twinUserId, updated, firestoreOwnerUid);
    setSavedRoutines(prev => prev.map(r => r.id === routineId ? { ...r, name: trimmed } : r));
  }, [twinUserId, savedRoutines, firestoreOwnerUid]);

  const deleteRoutine = useCallback(async (routineId: string) => {
    if (!twinUserId) return;
    await BiogearsAPI.deleteRoutine(twinUserId, routineId, firestoreOwnerUid);
    setSavedRoutines(prev => prev.filter(r => r.id !== routineId));
  }, [twinUserId, firestoreOwnerUid]);

  const setDefaultRoutine = useCallback(async (routineId: string) => {
    if (!twinUserId) return;
    await BiogearsAPI.setDefaultRoutine(twinUserId, routineId, firestoreOwnerUid);
    setSavedRoutines(prev => prev.map(r => ({
      ...r,
      isDefault: r.id === routineId ? !r.isDefault : false
    })));
  }, [twinUserId, firestoreOwnerUid]);

  // ── Session History ───────────────────────────────────────────────────────

  const deleteSession = useCallback(async (sessionId: string) => {
    if (!twinUserId) return;
    await BiogearsAPI.deleteSessionMeta(twinUserId, sessionId, firestoreOwnerUid);
    setSessions(prev => prev.filter(s => s.session_id !== sessionId));
  }, [twinUserId, firestoreOwnerUid]);

  // ── Register Twin ─────────────────────────────────────────────────────────

  const registerTwin = useCallback(async (payload: BiogearsRegistrationPayload) => {
    console.log(`[BioGearsContext] Registering Twin: ${payload.user_id}...`);
    setTwinStatus('registering');
    setTwinStatusError(null);
    try {
      await BiogearsAPI.registerTwin(payload);
      console.log(`[BioGearsContext] Registration SUCCESS for ${payload.user_id}`);
      setTwinStatus('ready');
    } catch (err: any) {
      console.log(`[BioGearsContext] Registration FAILED:`, err);
      setTwinStatus('error');
      // BiogearsError.detail can be a FastAPI validation dict or a plain string
      const detail = err.detail;
      const msg = typeof detail === 'string'
        ? detail
        : (detail?.detail || detail?.message || err.message || 'Registration failed');
      setTwinStatusError(msg);
      throw err;
    }
  }, []);

  // ── Add Event and Run Simulation Immediately ──────────────────────────────

  const addEventAndSimulate = useCallback(async (event: Omit<RoutineEvent, 'id'>, customSimName?: string) => {
    if (!twinUserId || twinStatus !== 'ready') {
      throw new Error('Baseline Calibration Required. Please calibrate your clinical twin profile first.');
    }
    if (simulationStatus === 'running' || simulationStatus === 'queued') {
      throw new Error('Simulation already in progress.');
    }

    const newEvent: RoutineEvent = {
      ...event,
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: wallTimeToTimestamp(event.wallTime),
    };

    const updatedEvents = [...todayEvents, newEvent].sort((a, b) =>
      (a.timestamp || 0) - (b.timestamp || 0)
    );

    setTodayEvents(updatedEvents);
    await persistToday(updatedEvents);

    setSimulationStatus('queued');
    setSimulationError(null);
    setSimulationProgress('Queuing simulation...');

    const finalName = customSimName || `Sim ${new Date().toLocaleDateString('en-IN')}`;

    try {
      const events: BiogearsHealthEvent[] = updatedEvents.map(e => ({
        event_type: e.event_type,
        value: e.value,
        timestamp: e.timestamp ?? wallTimeToTimestamp(e.wallTime),
        substance_name: e.substance_name,
        meal_type: e.meal_type,
        carb_g: e.carb_g,
        fat_g: e.fat_g,
        protein_g: e.protein_g,
        duration_seconds: e.duration_seconds,
        environment_name: e.environment_name,
        notes: e.notes,
      }));

      const weightVal = profile ? parseFloat(String(profile.weight || '').replace(/[^0-9.]/g, '')) : 70;
      const heightVal = profile ? parseFloat(String(profile.height || '').replace(/[^0-9.]/g, '')) : 170;
      const stepEvent = buildStepExerciseEvent(steps, weightVal || 70, heightVal || 170);
      if (stepEvent) {
        events.push(stepEvent);
      }

      setSimulationProgress('Starting BioGears engine...');
      setSimulationStatus('running');
      const { job_id } = await BiogearsAPI.simulateAsync(twinUserId, events);
      await AsyncStorage.setItem('biogears_active_job', job_id);

      simStartRef.current = Date.now();
      setSimulationProgress('BioGears engine initialising...');
      progressTickRef.current = setInterval(() => {
        const elapsed = Math.round((Date.now() - (simStartRef.current ?? Date.now())) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
        setSimulationProgress(`BioGears computing physiology... (${timeStr} elapsed)`);
      }, 5000);

      const result = await BiogearsAPI.pollUntilDone(job_id, 3000, 43_200_000);
      await finishSimulationSuccess(result);

    } catch (err: any) {
      if (progressTickRef.current) {
        clearInterval(progressTickRef.current);
        progressTickRef.current = null;
      }
      simStartRef.current = null;
      setSimulationStatus('failed');
      setSimulationError(err.message || 'Simulation failed');
      setSimulationProgress('');
      throw err;
    }
  }, [twinUserId, twinStatus, todayEvents, simulationStatus]);

  // ── Run Simulation ────────────────────────────────────────────────────────

  const runSimulation = useCallback(async () => {
    if (!twinUserId || twinStatus !== 'ready') {
      throw new Error('Twin not registered');
    }
    if (simulationStatus === 'running' || simulationStatus === 'queued') {
      console.warn('Simulation already in progress');
      return;
    }
    if (todayEvents.length === 0) {
      throw new Error('No events logged for today');
    }

    setSimulationStatus('queued');
    setSimulationError(null);
    setSimulationProgress('Queuing simulation...');

    try {
      // Prepare events — ensure timestamps are set
      const events: BiogearsHealthEvent[] = todayEvents.map(e => ({
        event_type: e.event_type,
        value: e.value,
        timestamp: e.timestamp ?? wallTimeToTimestamp(e.wallTime),
        substance_name: e.substance_name,
        meal_type: e.meal_type,
        carb_g: e.carb_g,
        fat_g: e.fat_g,
        protein_g: e.protein_g,
        duration_seconds: e.duration_seconds,
        environment_name: e.environment_name,
        notes: e.notes,
      }));

      const weightVal = profile ? parseFloat(String(profile.weight || '').replace(/[^0-9.]/g, '')) : 70;
      const heightVal = profile ? parseFloat(String(profile.height || '').replace(/[^0-9.]/g, '')) : 170;
      const stepEvent = buildStepExerciseEvent(steps, weightVal || 70, heightVal || 170);
      if (stepEvent) {
        events.push(stepEvent);
      }

      // Start async job
      setSimulationProgress('Starting BioGears engine...');
      setSimulationStatus('running');
      const { job_id } = await BiogearsAPI.simulateAsync(twinUserId, events);
      await AsyncStorage.setItem('biogears_active_job', job_id);

      // Start live elapsed-time ticker so user sees progress
      simStartRef.current = Date.now();
      setSimulationProgress('BioGears engine initialising...');
      progressTickRef.current = setInterval(() => {
        const elapsed = Math.round((Date.now() - (simStartRef.current ?? Date.now())) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
        setSimulationProgress(`BioGears computing physiology... (${timeStr} elapsed)`);
      }, 5000);

      // Poll progress — BioGears engine can take 10–25 minutes for a full-day scenario
      const result = await BiogearsAPI.pollUntilDone(job_id, 3000, 43_200_000);  // 12 hour timeout

      await finishSimulationSuccess(result);


    } catch (err: any) {
      // Stop progress ticker on failure too
      if (progressTickRef.current) {
        clearInterval(progressTickRef.current);
        progressTickRef.current = null;
      }
      simStartRef.current = null;
      setSimulationStatus('failed');
      setSimulationError(err.message || 'Simulation failed');
      setSimulationProgress('');
      throw err;
    }
  }, [twinUserId, twinStatus, todayEvents, simulationName]);

  const runMultiDayCatchup = useCallback(async (days: number) => {
    if (!twinUserId) return;
    if (simulationStatus === 'running' || simulationStatus === 'queued') {
      console.warn('Simulation already in progress');
      return;
    }
    const defaultRoutine = savedRoutines.find(r => r.isDefault) || savedRoutines[0];
    if (!defaultRoutine) {
      throw new Error('No default routine available for catch-up');
    }

    setSimulationStatus('queued');
    setSimulationError(null);
    setSimulationProgress(`Queuing catch-up for ${days} days...`);

    try {
      const catchUpEvents: BiogearsHealthEvent[] = [];
      const now = new Date();

      // Generate events for each missed day chronologically
      for (let i = days; i >= 1; i--) {
        const targetDate = new Date();
        targetDate.setDate(now.getDate() - i);

        for (const e of defaultRoutine.events) {
          const [hh, mm] = ((e as any).wallTime || '08:00').split(':').map(Number);
          const eventDate = new Date(targetDate);
          eventDate.setHours(hh || 0, mm || 0, 0, 0);
          const timestamp = Math.floor(eventDate.getTime() / 1000);

          catchUpEvents.push({
            event_type: e.event_type,
            value: e.value,
            timestamp,
            substance_name: e.substance_name,
            meal_type: e.meal_type,
            carb_g: e.carb_g,
            fat_g: e.fat_g,
            protein_g: e.protein_g,
            duration_seconds: e.duration_seconds,
            environment_name: e.environment_name,
            notes: `Catch-up day -${i}: ${e.notes || ''}`,
          });
        }
      }

      // Sort chronological
      catchUpEvents.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      setSimulationProgress(`Running multi-day catch-up (${days} days)...`);
      setSimulationStatus('running');
      const { job_id } = await BiogearsAPI.simulateAsync(twinUserId, catchUpEvents);
      await AsyncStorage.setItem('biogears_active_job', job_id);

      simStartRef.current = Date.now();
      progressTickRef.current = setInterval(() => {
        const elapsed = Math.round((Date.now() - (simStartRef.current ?? Date.now())) / 1000);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
        setSimulationProgress(`BioGears simulating gaps... (${timeStr} elapsed)`);
      }, 5000);

      const result = await BiogearsAPI.pollUntilDone(job_id, 3000, 43_200_000);
      await finishSimulationSuccess(result);

    } catch (err: any) {
      if (progressTickRef.current) {
        clearInterval(progressTickRef.current);
        progressTickRef.current = null;
      }
      simStartRef.current = null;
      setSimulationStatus('failed');
      setSimulationError(err.message || 'Catch-up simulation failed');
      setSimulationProgress('');
      throw err;
    }
  }, [twinUserId, savedRoutines, simulationStatus]);

  // ── Fill Baseline Events ───────────────────────────────────────────────────
  /**
   * Fills missing default-routine events for the gap between the last simulation
   * and now. Returns an EventConflict[] if any ambiguities are detected so the
   * caller (UI) can show a ConflictResolutionSheet.
   *
   * - Events are stamped with source='baseline'.
   * - Dedup window is ±30 min (tighter than load-routine's ±30 min fingerprint bucket).
   * - Baseline events are always lower priority: default resolution = 'keep_mine'.
   */
  const fillBaselineEvents = useCallback(async (): Promise<void> => {
    if (!twinUserId) return;
    const defaultRoutine = savedRoutines.find(r => r.isDefault) || savedRoutines[0];
    if (!defaultRoutine) {
      Alert.alert('No Default Routine', 'Please create or set a default routine first.');
      return;
    }

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const parseTime = (timeStr: string) => {
      const [hh, mm] = timeStr.split(':').map(Number);
      return (hh || 0) * 60 + (mm || 0);
    };

    // Find the last simulation time if it happened today
    const lastSession = sessions && sessions.length > 0
      ? [...sessions].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0]
      : null;

    let startMinutes = 0;
    if (lastSession) {
      const lastSessionDate = new Date(lastSession.timestamp);
      const today = new Date();
      if (lastSessionDate.toDateString() === today.toDateString()) {
        startMinutes = lastSessionDate.getHours() * 60 + lastSessionDate.getMinutes();
      }
    }

    // Build candidate baseline events in the gap window
    const candidates: RoutineEvent[] = [];
    for (const de of defaultRoutine.events) {
      const deTime = (de as any).wallTime || '08:00';
      const deMinutes = parseTime(deTime);
      if (deMinutes > startMinutes && deMinutes <= currentMinutes) {
        candidates.push({
          ...(de as RoutineEvent),
          id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          wallTime: deTime,
          source: 'baseline' as const,
          timestamp: wallTimeToTimestamp(deTime),
          notes: de.notes ? `${de.notes} (Filled Baseline)` : 'Filled from baseline',
          displayLabel: (de as any).displayLabel || de.notes || de.event_type,
          displayIcon: (de as any).displayIcon || '📝',
        });
      }
    }

    if (candidates.length === 0) {
      const msg = startMinutes > 0
        ? `No missing baseline events found between the last simulation (${Math.floor(startMinutes / 60)}:${String(startMinutes % 60).padStart(2, '0')}) and now.`
        : 'No missing baseline events found for the past hours of today.';
      Alert.alert('Baseline Up to Date', msg);
      return;
    }

    // Run conflict detection — baseline events win only if explicitly accepted
    const conflicts = detectConflicts(candidates, todayEvents);

    // Non-conflicting candidates can be merged straight away
    const conflictFps = new Set(conflicts.map(c => c.fingerprint));
    const safeToAdd = candidates.filter(c => !conflictFps.has(getEventFingerprint(c)));

    const commitSafeEvents = () => {
      if (safeToAdd.length === 0) return;
      setTodayEvents(prev => {
        const updated = [...prev, ...safeToAdd].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        persistToday(updated);
        return updated;
      });
    };

    if (conflicts.length === 0) {
      commitSafeEvents();
      Alert.alert('Baseline Filled', `Added ${safeToAdd.length} missing event(s) to today's timeline.`);
      return;
    }

    // Surface conflicts to the UI via the context's pending-conflict state
    // We commit safe events now and store conflicts for the resolution sheet
    commitSafeEvents();
    setPendingConflicts(conflicts);
    setPendingConflictResolver(() => (resolutions: Record<string, 'keep_mine' | 'use_routine' | 'keep_both'> | null) => {
      setPendingConflicts([]);
      setPendingConflictResolver(null);

      if (!resolutions) {
        return;
      }

      // Apply resolutions: baseline events are 'incoming'
      const toAppend: RoutineEvent[] = [];
      for (const c of conflicts) {
        const r = resolutions[c.fingerprint] ?? 'keep_mine';
        if (r === 'use_routine' || r === 'keep_both') {
          toAppend.push(c.incoming);
        }
      }

      if (toAppend.length === 0) return;

      // Remove replaced events when 'use_routine' is chosen
      setTodayEvents(prev => {
        let current = [...prev];
        for (const c of conflicts) {
          const r = resolutions[c.fingerprint] ?? 'keep_mine';
          if (r === 'use_routine') {
            current = current.filter(e => e.id !== c.existing.id);
          }
        }
        const merged = [...current, ...toAppend].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        persistToday(merged);
        return merged;
      });
    });
  }, [twinUserId, savedRoutines, todayEvents, sessions]);

  // ─── Undo Last Simulation ─────────────────────────────────────────────────────
  const undoLastSimulation = useCallback(async () => {
    if (!twinUserId) throw new Error('No twin registered.');
    await BiogearsAPI.undoLastSimulation(twinUserId);
    // Clear last vitals so UI reverts to empty state
    setLastVitals(null);
    setLastAnomalies([]);
    setLastAiInsights([]);
    setLastAiInsightsText('');
    setAiInsightsLoading(false);
    await refreshSessions();
    await refreshAnalytics();
  }, [twinUserId, refreshSessions, refreshAnalytics]);

  const restoreDefaultRoutine = useCallback(async () => {
    if (!twinUserId) return;
    try {
      let habits: any = null;

      // 1. Check if habits are stored in the synced Firestore profile
      if (profile && (profile as any).habits) {
        habits = (profile as any).habits;
      } else {
        // 2. Fallback to AsyncStorage
        const user = auth.currentUser;
        const habitsKey = user ? `@onboarding_habits_${user.uid}` : null;
        if (habitsKey) {
          const raw = await AsyncStorage.getItem(habitsKey);
          if (raw) habits = JSON.parse(raw);
        }
      }

      if (!habits) {
        throw new Error("No onboarding habits found. Please complete onboarding first.");
      }

      const heightVal = profile ? parseFloat(String(profile.height || '').replace(/[^0-9.]/g, '')) : 175;
      const weightVal = profile ? parseFloat(String(profile.weight || '').replace(/[^0-9.]/g, '')) : 70;
      const routine = buildDefaultRoutine(habits, {
        gender: profile ? profile.gender : 'Male',
        dateOfBirth: profile ? profile.dateOfBirth : '1995-01-01',
        height: heightVal || 175,
        weight: weightVal || 70,
      });

      // Ensure exact id and name of the default routine
      routine.id = 'routine_onboarding_saved_state';
      routine.name = 'My Saved State';
      routine.isDefault = true;

      await BiogearsAPI.saveRoutine(twinUserId, routine, firestoreOwnerUid);
      await BiogearsAPI.setDefaultRoutine(twinUserId, routine.id, firestoreOwnerUid);

      // Refresh saved routines list and clear isDefault on all other routines
      setSavedRoutines(prev => {
        const filtered = prev.filter(r => r.id !== routine.id).map(r => ({ ...r, isDefault: false }));
        return [routine, ...filtered];
      });

      Alert.alert("Success", "Restored your initial 'My Saved State' default routine successfully.");
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to restore default routine.");
    }
  }, [twinUserId, profile, firestoreOwnerUid]);

  // ─────────────────────────────────────────────────────────────────────────────

  // ── AI Server URL helpers ──────────────────────────────────────────────────
  const setAiServerUrl = useCallback(async (url: string) => {
    setAiServerUrlState(url);
    await AsyncStorage.setItem(AI_SERVER_URL_KEY, url).catch(() => {});
  }, []);

  // Load AI server URL on mount
  useEffect(() => {
    AsyncStorage.getItem(AI_SERVER_URL_KEY).then(v => {
      if (v) setAiServerUrlState(v);
    }).catch(() => {});
  }, []);

  // ── Query AI about last simulation ─────────────────────────────────────────
  const querySimulation = useCallback(async (question: string): Promise<string> => {
    if (!lastVitals) return 'No simulation data available yet. Run a simulation first.';
    const storedIp   = await AsyncStorage.getItem(AI_SERVER_URL_KEY).catch(() => '') || '';
    const storedPort = await AsyncStorage.getItem(AI_SERVER_PORT_KEY).catch(() => '8000') || '8000';
    if (!storedIp) return 'AI server not configured. Please set your server IP in the AI Health tab.';
    const baseUrl = storedIp.startsWith('http') ? storedIp : `http://${storedIp}:${storedPort}`;
    const res = await fetch(`${baseUrl}/biogears-query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query:   question,
        vitals:  lastVitals,
        anomalies:            lastAnomalies || [],
        has_anomaly:          lastAnomalies?.length > 0,
        interaction_warnings: lastInteractionWarnings || [],
      }),
    });
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    const data = await res.json();
    return data.response || 'No response from AI.';
  }, [lastVitals, lastAnomalies, lastInteractionWarnings]);

  const value: BiogearsTwinContextValue = {
    twinStatus,
    twinStatusError,
    simulationStatus,
    simulationProgress,
    simulationError,
    twinUserId,
    lastVitals,
    lastAnomalies,
    lastInteractionWarnings,
    lastSessionId,
    lastAiInsights,
    lastAiInsightsText,
    aiInsightsLoading,
    aiServerUrl,
    setAiServerUrl,
    querySimulation,
    todayEvents,
    setTodayEvents: setTodayEventsWrapped,
    addEvent,
    removeEvent,
    updateEvent,
    clearToday,
    refreshAnalytics,
    organScores,
    vitalsTrends,
    cvdRisk,
    recoveryReadiness,
    weeklySummary,
    todayMacros,
    healthScore,
    bodyMetrics,
    caloricBalance,
    savedRoutines,
    saveCurrentRoutine,
    loadRoutine,
    renameRoutine,
    deleteRoutine,
    setDefaultRoutine,
    editingRoutineId,
    setEditingRoutineId,
    restoreDefaultRoutine,
    substances,
    refreshSubstances,
    sessions,
    refreshSessions,
    deleteSession,
    simulationName,
    setSimulationName,
    registerTwin,
    runSimulation,
    runMultiDayCatchup,
    recheckTwinStatus,
    addEventAndSimulate,
    fillBaselineEvents,
    loadRoutineWithConflictCheck,

    undoLastSimulation,

    // Conflict resolution
    pendingConflicts,
    pendingConflictResolver,
    dismissConflicts: () => {
      setPendingConflicts([]);
      setPendingConflictResolver(null);
    },
  };


  return (
    <BiogearsTwinContext.Provider value={value}>
      {children}
    </BiogearsTwinContext.Provider>
  );
}

// ─── AI Insight Generator ─────────────────────────────────────────────────────

function generateInsights(result: any): string[] {
  const insights: string[] = [];
  const v = result.vitals || {};

  if (result.has_anomaly && result.anomalies?.length > 0) {
    result.anomalies.forEach((a: any) => {
      insights.push(`⚠️ ${a.label}: ${a.value} ${a.severity === 'critical' ? '— Critical' : '— Monitor'}`);
    });
  }

  if (v.heart_rate) {
    if (v.heart_rate > 100) insights.push(`🫀 Elevated heart rate at ${v.heart_rate} bpm — consider rest and hydration.`);
    else if (v.heart_rate < 55) insights.push(`🫀 Low heart rate at ${v.heart_rate} bpm — normal if well-conditioned athlete.`);
    else insights.push(`✅ Heart rate is optimal at ${v.heart_rate} bpm.`);
  }

  if (v.spo2 != null) {
    if (v.spo2 < 94) insights.push(`🫁 SpO₂ at ${v.spo2}% is below normal — watch for breathlessness.`);
    else insights.push(`✅ Oxygen saturation healthy at ${v.spo2}%.`);
  }

  if (v.glucose != null) {
    if (v.glucose > 140) insights.push(`🩸 Post-simulation glucose ${v.glucose} mg/dL elevated — consider lower-carb meal next time.`);
    else if (v.glucose < 70) insights.push(`🩸 Glucose dropped to ${v.glucose} mg/dL — ensure adequate carbohydrate intake.`);
    else insights.push(`✅ Blood glucose ${v.glucose} mg/dL is in healthy range.`);
  }

  if (result.has_drug_interaction) {
    result.interaction_warnings?.forEach((w: string) => insights.push(`💊 ${w}`));
  }

  if (result.data_gap_warning) {
    insights.push(`⏱️ ${result.data_gap_warning}`);
  }

  if (insights.length === 0) {
    insights.push('✅ All vitals within normal range. Good physiological balance today!');
  }

  return insights;
}
