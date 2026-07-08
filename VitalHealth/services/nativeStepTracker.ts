// services/nativeStepTracker.ts
// ─────────────────────────────────────────────────────────────────────────────
// TypeScript bridge to the native Kotlin StepTrackerModule.
// On Android: wraps the Kotlin module (hardware step counter + sensor fusion).
// On iOS: falls back to expo-sensors Pedometer.
// ─────────────────────────────────────────────────────────────────────────────

import {
  NativeModules,
  NativeEventEmitter,
  Platform,
  EmitterSubscription,
} from 'react-native';
import { Pedometer } from 'expo-sensors';

import { warn } from "../utils/logger";

// ── Types ─────────────────────────────────────────────────────────────────────
export type DataSource = 'STEP_SENSOR' | 'SENSOR_FUSION' | 'HEALTH_CONNECT' | 'PEDOMETER' | 'NONE' | 'CLOUD_SYNC';

export interface StepUpdateEvent {
  steps: number;
  source: DataSource;
  timestamp: number;
}

export interface DailyStepData {
  date: string;
  steps: number;
  source: DataSource;
}

export interface DataSourceInfo {
  hasStepCounter: boolean;
  hasAccelerometer: boolean;
  activeSource: DataSource;
}

// ── Android native module ─────────────────────────────────────────────────────
const { StepTrackerModule } = NativeModules;
let emitter: NativeEventEmitter | null = null;

if (Platform.OS === 'android' && StepTrackerModule) {
  emitter = new NativeEventEmitter(StepTrackerModule);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Start native step tracking (Android only — on iOS the Pedometer is used).
 */
export async function startNativeTracking(uid: string, profileName?: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (!StepTrackerModule) {
    warn('[NativeStepTracker] StepTrackerModule not available');
    return;
  }
  StepTrackerModule.startTracking(uid, profileName || '');
}

/**
 * Stop native step tracking.
 */
export async function stopNativeTracking(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (!StepTrackerModule) return;
  StepTrackerModule.stopTracking();
}

/**
 * Reset native step tracking data.
 */
export async function resetNativeSteps(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (!StepTrackerModule) return;
  if (typeof StepTrackerModule.resetSteps === 'function') {
    StepTrackerModule.resetSteps();
  }
}

/**
 * Get today's step count from native DB (Android) or Pedometer API (iOS).
 */
export async function getTodayStepsNative(): Promise<{ steps: number; source: DataSource }> {
  if (Platform.OS === 'android') {
    if (!StepTrackerModule) return { steps: 0, source: 'NONE' };
    try {
      const result = await StepTrackerModule.getTodaySteps();
      return { steps: result.steps ?? 0, source: result.source ?? 'STEP_SENSOR' };
    } catch (e) {
      warn('[NativeStepTracker] getTodaySteps error:', e);
      return { steps: 0, source: 'NONE' };
    }
  } else {
    // iOS — use HealthKit via Pedometer
    try {
      const available = await Pedometer.isAvailableAsync();
      if (!available) return { steps: 0, source: 'NONE' };
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const result = await Pedometer.getStepCountAsync(start, new Date());
      return { steps: result?.steps ?? 0, source: 'PEDOMETER' };
    } catch {
      return { steps: 0, source: 'NONE' };
    }
  }
}

/**
 * Get weekly step data.
 */
export async function getWeeklyStepsNative(): Promise<DailyStepData[]> {
  if (Platform.OS !== 'android' || !StepTrackerModule) return [];
  try {
    const result = await StepTrackerModule.getWeeklySteps();
    return Array.isArray(result) ? result : [];
  } catch (e) {
    warn('[NativeStepTracker] getWeeklySteps error:', e);
    return [];
  }
}

/**
 * Get monthly step data.
 */
export async function getMonthlyStepsNative(): Promise<DailyStepData[]> {
  if (Platform.OS !== 'android' || !StepTrackerModule) return [];
  try {
    const result = await StepTrackerModule.getMonthlySteps();
    return Array.isArray(result) ? result : [];
  } catch (e) {
    warn('[NativeStepTracker] getMonthlySteps error:', e);
    return [];
  }
}

/**
 * Get step data for a custom date range.
 */
export async function getHistoricalStepsNative(
  startDate: string,
  endDate: string
): Promise<DailyStepData[]> {
  if (Platform.OS !== 'android' || !StepTrackerModule) return [];
  try {
    const result = await StepTrackerModule.getHistoricalSteps(startDate, endDate);
    return Array.isArray(result) ? result : [];
  } catch (e) {
    warn('[NativeStepTracker] getHistoricalSteps error:', e);
    return [];
  }
}

/**
 * Get info about which sensor/source is active.
 */
export async function getDataSourceInfoNative(): Promise<DataSourceInfo> {
  if (Platform.OS !== 'android' || !StepTrackerModule) {
    return { hasStepCounter: false, hasAccelerometer: true, activeSource: 'PEDOMETER' };
  }
  try {
    return await StepTrackerModule.getDataSourceInfo();
  } catch {
    return { hasStepCounter: false, hasAccelerometer: true, activeSource: 'SENSOR_FUSION' };
  }
}

/**
 * Subscribe to real-time step updates from the native service.
 * Returns an unsubscribe function.
 */
export function subscribeToStepUpdates(
  callback: (event: StepUpdateEvent) => void
): () => void {
  if (Platform.OS !== 'android' || !emitter) {
    return () => {};
  }

  const subscription: EmitterSubscription = emitter.addListener(
    'StepUpdate',
    callback
  );

  return () => subscription.remove();
}

/**
 * Returns true if the native module is available (Android only).
 */
export function isNativeModuleAvailable(): boolean {
  return Platform.OS === 'android' && !!StepTrackerModule;
}
