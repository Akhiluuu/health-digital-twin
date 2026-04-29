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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useProfile } from './ProfileContext';
import * as BiogearsAPI from '../services/biogears';
import { getTwinId } from '../utils/twinUtils';
import { useMedicine } from './MedicineContext';
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

  // Today's routine
  todayEvents: RoutineEvent[];
  addEvent: (event: Omit<RoutineEvent, 'id'>) => void;
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

  // Saved routines
  savedRoutines: SavedRoutine[];
  saveCurrentRoutine: (name: string, tags?: string[]) => Promise<void>;
  loadRoutine: (routineId: string) => void;
  deleteRoutine: (routineId: string) => Promise<void>;

  // Substances Library
  substances: Record<string, string[]>;
  refreshSubstances: () => Promise<void>;

  // Session history (local metadata)
  sessions: LocalSessionMeta[];
  refreshSessions: () => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;

  // Simulation name
  simulationName: string;
  setSimulationName: (name: string) => void;

  // Actions
  registerTwin: (payload: BiogearsRegistrationPayload) => Promise<void>;
  runSimulation: () => Promise<void>;
  recheckTwinStatus: () => Promise<void>;
  undoLastSimulation: () => Promise<void>;
}


// ─── Context ──────────────────────────────────────────────────────────────────

const BiogearsTwinContext = createContext<BiogearsTwinContextValue | null>(null);

export function useBiogearsTwin(): BiogearsTwinContextValue {
  const ctx = useContext(BiogearsTwinContext);
  if (!ctx) throw new Error('useBiogearsTwin must be used inside BiogearsTwinProvider');
  return ctx;
}

const TWIN_STATUS_KEY = '@biogears_twin_status';
const TODAY_EVENTS_KEY = (uid: string) => `@biogears_today_${uid}`;

// ─── Helper: convert RoutineEvent wall time → Unix epoch timestamp ────────────

function wallTimeToTimestamp(wallTime: string): number {
  // wallTime = "HH:MM"
  const [hh, mm] = wallTime.split(':').map(Number);
  const now = new Date();
  now.setHours(hh, mm, 0, 0);
  return Math.floor(now.getTime() / 1000);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function BiogearsTwinProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useProfile();

  // Derive userId from profile: use Firebase UID stored in profile, or firstName+lastName slug
  const { medicines } = useMedicine();

  // Derive userId from profile using shared utility
  const twinUserId = profile ? getTwinId(profile) : null;

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

  const [todayEvents, setTodayEvents] = useState<RoutineEvent[]>([]);
  const [savedRoutines, setSavedRoutines] = useState<SavedRoutine[]>([]);
  const [sessions, setSessions] = useState<LocalSessionMeta[]>([]);
  const [simulationName, setSimulationName] = useState('');

  // Analytics State
  const [organScores, setOrganScores] = useState<OrganScoresResponse | null>(null);
  const [vitalsTrends, setVitalsTrends] = useState<VitalsTrendResponse | null>(null);
  const [cvdRisk, setCvdRisk] = useState<CVDRiskResponse | null>(null);
  const [recoveryReadiness, setRecoveryReadiness] = useState<RecoveryReadinessResponse | null>(null);
  const [weeklySummary, setWeeklySummary] = useState<any>(null);
  const [healthScore, setHealthScore] = useState<any>(null);
  const [bodyMetrics, setBodyMetrics] = useState<any>(null);
  const [todayMacros, setTodayMacros] = useState({ carbs: 0, protein: 0, fat: 0, calories: 0 });
  const [substances, setSubstances] = useState<Record<string, string[]>>({});

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        // Server unreachable — don't mark as unregistered, just unknown
        setTwinStatusError(err.message || 'Cannot reach BioGears server');
        setTwinStatus('error');
      }
    }
  }, [twinUserId]);

  // ── Load persisted data on mount ─────────────────────────────────────────

  useEffect(() => {
    // NOTE: substances are NOT fetched here — twin.tsx calls refreshSubstances()
    // explicitly so this doesn't fire on every screen load.
    if (!twinUserId) return;
    recheckTwinStatus();
    loadTodayFromStorage();
    loadRoutinesFromStorage();
    refreshSessions();
    refreshAnalytics();
    // ── Load cached vitals from SQLite so Dashboard works offline ─────────
    getLastSimulation(twinUserId).then((record) => {
      if (record && !lastVitals) {
        setLastVitals(recordToVitals(record));
        if (record.anomaly_labels) {
          try {
            const labels: string[] = JSON.parse(record.anomaly_labels);
            setLastAnomalies(labels.map(l => ({ label: l, severity: 'warning', value: 0, normal_range: '' })));
          } catch { /* ignore */ }
        }
        console.log('[BiogearsTwin] Loaded cached vitals from local DB (offline fallback)');
      }
    }).catch(() => {});
  }, [twinUserId]);

  const loadTodayFromStorage = async () => {
    if (!twinUserId) return;
    try {
      const raw = await AsyncStorage.getItem(TODAY_EVENTS_KEY(twinUserId));
      if (raw) {
        const stored = JSON.parse(raw) as RoutineEvent[];
        // Only keep today's events (don't carry over from yesterday)
        const todayStr = new Date().toDateString();
        const fresh = stored.filter(e => {
          if (!e.timestamp) return true;
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
    } catch { /* ignore */ }
  };

  const loadRoutinesFromStorage = async () => {
    if (!twinUserId) return;
    const r = await BiogearsAPI.loadSavedRoutines(twinUserId);
    setSavedRoutines(r);
  };

  const refreshSessions = useCallback(async () => {
    if (!twinUserId) return;
    const s = await BiogearsAPI.loadSessionsMeta(twinUserId);
    setSessions(s);
  }, [twinUserId]);

  const refreshAnalytics = useCallback(async () => {
    if (!twinUserId) return;  // Only skip if no user ID
    try {
      const results = await Promise.allSettled([
        BiogearsAPI.getOrganScores(twinUserId),
        BiogearsAPI.getVitalsTrends(twinUserId),
        BiogearsAPI.getCVDRisk(twinUserId),
        BiogearsAPI.getRecoveryReadiness(twinUserId),
        BiogearsAPI.getWeeklySummary(twinUserId),
        BiogearsAPI.getHealthScore(twinUserId),
        BiogearsAPI.getBodyMetrics(twinUserId),
      ]);
      const [organs, trends, cvd, recovery, weekly, score, metrics] = results;
      if (organs.status === 'fulfilled') setOrganScores(organs.value);
      if (trends.status === 'fulfilled') setVitalsTrends(trends.value);
      if (cvd.status === 'fulfilled') setCvdRisk(cvd.value);
      if (recovery.status === 'fulfilled') setRecoveryReadiness(recovery.value);
      if (weekly.status === 'fulfilled') setWeeklySummary(weekly.value);
      if (score.status === 'fulfilled') setHealthScore(score.value);
      if (metrics.status === 'fulfilled') setBodyMetrics(metrics.value);
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    }
  }, [twinUserId]);


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

  const clearToday = useCallback(() => {
    setTodayEvents([]);
    if (twinUserId) AsyncStorage.removeItem(TODAY_EVENTS_KEY(twinUserId));
  }, [twinUserId]);

  // ── Saved Routines ────────────────────────────────────────────────────────

  const saveCurrentRoutine = useCallback(async (name: string, tags?: string[]) => {
    if (!twinUserId || todayEvents.length === 0) return;
    const routine: SavedRoutine = {
      id: `routine_${Date.now()}`,
      name,
      events: todayEvents,
      eventCount: todayEvents.length,
      createdAt: new Date().toISOString(),
      tags,
    };
    await BiogearsAPI.saveRoutine(twinUserId, routine);
    setSavedRoutines(prev => [routine, ...prev]);
  }, [twinUserId, todayEvents]);

  const loadRoutine = useCallback((routineId: string) => {
    const routine = savedRoutines.find(r => r.id === routineId);
    if (!routine) return;
    // Retime events to today (keep relative time between events if they had timestamps)
    const now = new Date();
    const remapped: RoutineEvent[] = routine.events.map(e => ({
      ...(e as RoutineEvent),
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      // Re-stamp to today using wallTime
      timestamp: (e as RoutineEvent).wallTime
        ? wallTimeToTimestamp((e as RoutineEvent).wallTime)
        : undefined,
    }));
    const sorted = remapped.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    setTodayEvents(sorted);
    persistToday(sorted);
    if (twinUserId) BiogearsAPI.markRoutineUsed(twinUserId, routineId);
  }, [savedRoutines, twinUserId]);

  const deleteRoutine = useCallback(async (routineId: string) => {
    if (!twinUserId) return;
    await BiogearsAPI.deleteRoutine(twinUserId, routineId);
    setSavedRoutines(prev => prev.filter(r => r.id !== routineId));
  }, [twinUserId]);

  // ── Session History ───────────────────────────────────────────────────────

  const deleteSession = useCallback(async (sessionId: string) => {
    if (!twinUserId) return;
    await BiogearsAPI.deleteSessionMeta(twinUserId, sessionId);
    setSessions(prev => prev.filter(s => s.session_id !== sessionId));
  }, [twinUserId]);

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
      setTwinStatusError(err.detail?.detail || err.message || 'Registration failed');
      throw err;
    }
  }, []);

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

      // Start async job
      setSimulationProgress('Starting BioGears engine...');
      setSimulationStatus('running');
      const { job_id } = await BiogearsAPI.simulateAsync(twinUserId, events);

      // Poll progress — BioGears engine can take 10–25 minutes for a full-day scenario
      setSimulationProgress('BioGears engine computing physiology (10–25 min)...');
      const result = await BiogearsAPI.pollUntilDone(job_id, 3000, 43_200_000);  // 12 hour timeout

      // Success: update state
      setLastVitals(result.vitals);
      setLastAnomalies(result.anomalies || []);
      setLastInteractionWarnings(result.interaction_warnings || []);

      // ── Persist result locally (offline cache + Drive backup) ─────────
      const sessionId = new Date().toISOString().replace(/[:.]/g, '-');
      await saveSimulationResult(
        twinUserId,
        sessionId,
        result.vitals,
        result.anomalies || []
      ).catch(err => console.warn('[BiogearsTwin] Local save failed (non-fatal):', err));
      setLastSessionId(sessionId);

      // Generate AI insights from anomalies + vitals
      const insights = generateInsights(result);
      setLastAiInsights(insights);

      const sessionMeta: LocalSessionMeta = {
        session_id: sessionId,
        name: simulationName || `Simulation ${new Date().toLocaleDateString('en-IN')}`,
        timestamp: new Date().toISOString(),
        vitals_snapshot: result.vitals,
        has_anomaly: result.has_anomaly,
        events: todayEvents,
        event_count: todayEvents.length,
        ai_insights: insights,
      };
      await BiogearsAPI.saveSessionMeta(twinUserId, sessionMeta);
      setSessions(prev => [sessionMeta, ...prev]);

      setSimulationStatus('done');
      setSimulationProgress('Simulation complete!');
      setSimulationName('');
      
      // Refresh historical data and analytics
      refreshSessions();
      refreshAnalytics();
    } catch (err: any) {
      setSimulationStatus('failed');
      setSimulationError(err.message || 'Simulation failed');
      setSimulationProgress('');
      throw err;
    }
  }, [twinUserId, twinStatus, todayEvents, simulationName]);

  // ─── Undo Last Simulation ─────────────────────────────────────────────────────
  const undoLastSimulation = useCallback(async () => {
    if (!twinUserId) throw new Error('No twin registered.');
    await BiogearsAPI.undoLastSimulation(twinUserId);
    // Clear last vitals so UI reverts to empty state
    setLastVitals(null);
    setLastAnomalies([]);
    setLastAiInsights([]);
    await refreshSessions();
    await refreshAnalytics();
  }, [twinUserId, refreshSessions, refreshAnalytics]);

  // ─────────────────────────────────────────────────────────────────────────────

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
    todayEvents,
    addEvent,
    removeEvent,
    updateEvent,
    clearToday,
    savedRoutines,
    saveCurrentRoutine,
    loadRoutine,
    deleteRoutine,
    sessions,
    refreshSessions,
    deleteSession,
    simulationName,
    setSimulationName,
    registerTwin,
    runSimulation,
    recheckTwinStatus,
    refreshAnalytics,
    organScores,
    vitalsTrends,
    cvdRisk,
    recoveryReadiness,
    weeklySummary,
    healthScore,
    bodyMetrics,
    todayMacros,
    substances,
    refreshSubstances,
    undoLastSimulation,
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
    const spoPct = Math.round(v.spo2 * 100);
    if (spoPct < 94) insights.push(`🫁 SpO₂ at ${spoPct}% is below normal — watch for breathlessness.`);
    else insights.push(`✅ Oxygen saturation healthy at ${spoPct}%.`);
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
