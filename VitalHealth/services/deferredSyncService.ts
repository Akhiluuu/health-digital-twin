// services/deferredSyncService.ts
// Client API layer for the Deferred Physiology Synchronization System (DPSS)

import { getBiogearsBaseUrl, getApiKey } from './biogears';
import { log, warn } from '../utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Types ───────────────────────────────────────────────────────────────────

export type DPSSEventType =
  | 'meal' | 'exercise' | 'sleep' | 'substance' | 'water'
  | 'stress' | 'alcohol' | 'fast' | 'environment';

export type DPSSNotifType =
  | 'SIM_READY' | 'AUTO_SCHEDULED' | 'AUTO_COMPLETED' | 'SIM_FAILED'
  | 'REVIEW_REQUIRED' | 'UNDONE' | 'RERUN_COMPLETED'
  | 'MULTIPLE_PENDING' | 'CONFLICT_DETECTED';

export interface DPSSHealthEvent {
  event_type: DPSSEventType;
  event_timestamp: string;       // ISO-8601: "2026-07-06T08:30:00"
  payload: Record<string, any>;  // event-specific data
  device_id?: string;
  sequence_num?: number;
}

export interface DPSSStageResult {
  event_id: string;
  status: 'PENDING';
}

export interface DPSSSimStatus {
  user_id: string;
  pending_event_count: number;
  last_simulated_at: string | null;
  latest_snapshot: {
    snapshot_id: string;
    sim_date: string;
    vitals: Record<string, any> | null;
  } | null;
  is_ready_to_simulate: boolean;
}

export interface DPSSSimHistory {
  sim_id: string;
  sim_type: 'MANUAL' | 'AUTOMATIC' | 'REPLAY' | 'UNDO' | 'RESTORE';
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'UNDONE';
  initiated_by: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  post_vitals: Record<string, any> | null;
}

export interface DPSSNotification {
  notification_id: string;
  notif_type: DPSSNotifType;
  status: 'UNREAD' | 'READ' | 'ACTIONED' | 'DISMISSED';
  sim_date: string;
  payload: {
    title: string;
    body: string;
    pending_count?: number;
    sim_id?: string;
    vitals?: Record<string, any>;
    action?: string;
  };
  created_at: string;
}

export interface DPSSUndoResult {
  status: 'success';
  message: string;
  restored_from_sim_id: string;
  events_restored_to_pending: number;
}

// ─── Storage Keys ─────────────────────────────────────────────────────────────

const OFFLINE_QUEUE_KEY = (userId: string) => `@dpss_offline_queue_${userId}`;
const LAST_SEQ_KEY      = (userId: string) => `@dpss_last_seq_${userId}`;

// ─── Internal fetch ────────────────────────────────────────────────────────────

async function dpssApiFetch<T>(
  path: string,
  options?: RequestInit,
  timeoutMs = 20_000,
): Promise<T> {
  const base   = await getBiogearsBaseUrl();
  const apiKey = await getApiKey();
  const url    = `${base}${path}`;
  const ctrl   = new AbortController();
  const timer  = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      signal: ctrl.signal,
      ...options,
    });
    clearTimeout(timer);
    if (!res.ok) {
      let detail: any;
      try { detail = await res.json(); } catch { detail = await res.text(); }
      throw new Error(
        (detail?.detail ?? detail?.message ?? JSON.stringify(detail)) || `HTTP ${res.status}`
      );
    }
    return res.json() as Promise<T>;
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('DPSS request timed out.');
    throw err;
  }
}

// ─── Offline Queue ────────────────────────────────────────────────────────────

/** Save an event to the local offline queue when the server is unreachable. */
async function enqueueOffline(userId: string, event: DPSSHealthEvent): Promise<void> {
  const key     = OFFLINE_QUEUE_KEY(userId);
  const rawJson = await AsyncStorage.getItem(key);
  const queue: DPSSHealthEvent[] = rawJson ? JSON.parse(rawJson) : [];
  queue.push(event);
  await AsyncStorage.setItem(key, JSON.stringify(queue));
  log(`[DPSS] Offline queued event: ${event.event_type}`);
}

/** Get monotonically-increasing sequence number for a device/user pair. */
async function nextSeq(userId: string): Promise<number> {
  const key = LAST_SEQ_KEY(userId);
  const raw = await AsyncStorage.getItem(key);
  const seq = raw ? parseInt(raw, 10) + 1 : 1;
  await AsyncStorage.setItem(key, String(seq));
  return seq;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Stage a single health event for deferred simulation.
 * Falls back to offline queue if the server is unreachable.
 */
export async function stageEvent(
  userId: string,
  event: DPSSHealthEvent,
): Promise<DPSSStageResult | null> {
  const seq      = await nextSeq(userId);
  const enriched = {
    ...event,
    device_id:    event.device_id    ?? 'app',
    sequence_num: event.sequence_num ?? seq,
  };

  try {
    const result = await dpssApiFetch<DPSSStageResult>('/dpss/events/stage', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, ...enriched }),
    });
    log(`[DPSS] Staged event ${event.event_type}: ${result.event_id}`);
    return result;
  } catch (err: any) {
    warn('[DPSS] Server unreachable, queuing offline:', err.message);
    await enqueueOffline(userId, enriched);
    return null;
  }
}

/**
 * Stage a batch of health events at once.
 */
export async function stageBatch(
  userId: string,
  events: DPSSHealthEvent[],
): Promise<{ staged: DPSSStageResult[]; count: number } | null> {
  const enriched = await Promise.all(
    events.map(async (e) => ({
      ...e,
      device_id:    e.device_id    ?? 'app',
      sequence_num: e.sequence_num ?? await nextSeq(userId),
    }))
  );

  try {
    const result = await dpssApiFetch<{ staged: DPSSStageResult[]; count: number }>(
      '/dpss/events/stage/batch',
      { method: 'POST', body: JSON.stringify({ user_id: userId, events: enriched }) },
    );
    log(`[DPSS] Batch staged ${result.count} events`);
    return result;
  } catch (err: any) {
    warn('[DPSS] Batch staging failed:', err.message);
    for (const e of enriched) await enqueueOffline(userId, e);
    return null;
  }
}

/**
 * Flush the offline queue when network reconnects.
 * Call on app foreground or network change events.
 */
export async function flushOfflineQueue(userId: string): Promise<void> {
  const key     = OFFLINE_QUEUE_KEY(userId);
  const rawJson = await AsyncStorage.getItem(key);
  if (!rawJson) return;

  let queue: DPSSHealthEvent[] = [];
  try { queue = JSON.parse(rawJson); } catch { return; }
  if (queue.length === 0) return;

  log(`[DPSS] Flushing ${queue.length} offline events…`);
  try {
    await dpssApiFetch('/dpss/events/stage/batch', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, events: queue }),
    });
    await AsyncStorage.removeItem(key);
    log('[DPSS] Offline queue flushed successfully.');
  } catch (err: any) {
    warn('[DPSS] Flush failed, queue retained:', err.message);
  }
}

/**
 * Fetch all pending unprocessed events for the user.
 */
export async function getPendingEvents(userId: string) {
  return dpssApiFetch<{ user_id: string; pending_count: number; events: any[] }>(
    `/dpss/events/pending/${userId}`,
  );
}

/**
 * Get current DPSS sync status (pending count, last sim timestamp, etc).
 */
export async function getSyncStatus(userId: string): Promise<DPSSSimStatus> {
  return dpssApiFetch<DPSSSimStatus>(`/dpss/simulation/status/${userId}`);
}

/**
 * Manually trigger a simulation for all pending events.
 */
export async function runSimulation(
  userId: string,
  initiatedBy: string = 'user',
): Promise<{ status: string; sim_id: string }> {
  return dpssApiFetch('/dpss/simulation/run', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, initiated_by: initiatedBy }),
  }, 30_000);
}

/**
 * Undo the last simulation and restore the pre-sim checkpoint.
 */
export async function undoSimulation(userId: string): Promise<DPSSUndoResult> {
  return dpssApiFetch('/dpss/simulation/undo', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  }, 30_000);
}

/**
 * Fetch full simulation history for a user.
 */
export async function getSimHistory(
  userId: string,
  limit: number = 50,
): Promise<{ user_id: string; count: number; history: DPSSSimHistory[] }> {
  return dpssApiFetch(`/dpss/simulation/history/${userId}?limit=${limit}`);
}

/**
 * Fetch available undo checkpoints for a user.
 */
export async function getCheckpoints(userId: string) {
  return dpssApiFetch<{ user_id: string; checkpoints: any[] }>(
    `/dpss/checkpoints/${userId}`,
  );
}

/**
 * Fetch DPSS notifications for a user.
 */
export async function getDPSSNotifications(
  userId: string,
  limit: number = 30,
): Promise<{ user_id: string; count: number; notifications: DPSSNotification[] }> {
  return dpssApiFetch(`/dpss/notifications/${userId}?limit=${limit}`);
}

/**
 * Mark a DPSS notification as READ, ACTIONED, or DISMISSED.
 */
export async function markNotificationStatus(
  notificationId: string,
  status: 'READ' | 'ACTIONED' | 'DISMISSED',
): Promise<void> {
  await dpssApiFetch('/dpss/notifications/status', {
    method: 'POST',
    body: JSON.stringify({ notification_id: notificationId, status }),
  });
}

// ─── Convenience builders ─────────────────────────────────────────────────────

/** Build a meal event payload from the standard BioGears meal fields. */
export function buildMealEvent(params: {
  calories: number;
  meal_type?: string;
  carb_g?: number;
  fat_g?: number;
  protein_g?: number;
  timestamp?: number;
}): DPSSHealthEvent {
  return {
    event_type: 'meal',
    event_timestamp: new Date((params.timestamp ?? Date.now() / 1000) * 1000).toISOString(),
    payload: {
      value:        params.calories,
      meal_type:    params.meal_type ?? 'balanced',
      carb_g:       params.carb_g,
      fat_g:        params.fat_g,
      protein_g:    params.protein_g,
      timestamp:    params.timestamp ?? Date.now() / 1000,
    },
  };
}

/** Build an exercise event payload. */
export function buildExerciseEvent(params: {
  intensity: number;         // 0.0–1.0
  duration_seconds?: number;
  timestamp?: number;
}): DPSSHealthEvent {
  return {
    event_type: 'exercise',
    event_timestamp: new Date((params.timestamp ?? Date.now() / 1000) * 1000).toISOString(),
    payload: {
      value:            params.intensity,
      duration_seconds: params.duration_seconds ?? 1800,
      timestamp:        params.timestamp ?? Date.now() / 1000,
    },
  };
}

/** Build a sleep event payload. */
export function buildSleepEvent(params: {
  hours: number;
  timestamp?: number;
}): DPSSHealthEvent {
  return {
    event_type: 'sleep',
    event_timestamp: new Date((params.timestamp ?? Date.now() / 1000) * 1000).toISOString(),
    payload: {
      value:     params.hours,
      timestamp: params.timestamp ?? Date.now() / 1000,
    },
  };
}

/** Build a medication/substance event payload. */
export function buildMedicationEvent(params: {
  substance_name: string;
  dose: number;
  unit?: string;
  timestamp?: number;
}): DPSSHealthEvent {
  return {
    event_type: 'substance',
    event_timestamp: new Date((params.timestamp ?? Date.now() / 1000) * 1000).toISOString(),
    payload: {
      value:           params.dose,
      substance_name:  params.substance_name,
      unit:            params.unit ?? 'mg',
      timestamp:       params.timestamp ?? Date.now() / 1000,
    },
  };
}

/** Build a water/hydration event payload. */
export function buildWaterEvent(params: {
  ml: number;
  timestamp?: number;
}): DPSSHealthEvent {
  return {
    event_type: 'water',
    event_timestamp: new Date((params.timestamp ?? Date.now() / 1000) * 1000).toISOString(),
    payload: {
      value:     params.ml,
      timestamp: params.timestamp ?? Date.now() / 1000,
    },
  };
}
