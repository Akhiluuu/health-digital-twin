// services/heartRateNative.ts
// TypeScript bridge for the native Kotlin HeartRateModule
import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { HeartRateModule } = NativeModules;

let emitter: NativeEventEmitter | null = null;
if (Platform.OS === 'android' && HeartRateModule) {
  emitter = new NativeEventEmitter(HeartRateModule);
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface HeartRateFrameEvent {
  fingerDetected: boolean;
  ppgValue: number;
  avgRed: number;
  avgGreen: number;
  avgBlue: number;
  timestamp: number;
}

export interface HeartRateUpdateEvent {
  bpm: number;
  confidence: number;       // 0–100
  signalQuality: number;    // 0–100
  source: string;           // FUSION | PEAK | FFT | DEFAULT
  motionScore: number;      // 0–1
  hasExcessiveMotion: boolean;
  sampleCount: number;
  progress: number;         // 0–1 (measurement progress)
  qualityLabel: string;     // Excellent | Good | Fair | Poor
  confidenceLabel: string;  // Very High | High | Medium | Low
}

export interface HeartRateDoneEvent {
  bpm: number;
  confidence: number;
  signalQuality: number;
  source: string;
  duration: number;
  timestamp: number;
  qualityLabel: string;
  confidenceLabel: string;
}

export interface HeartRateErrorEvent {
  message: string;
}

export interface HeartRateReading {
  id: number;
  bpm: number;
  confidence: number;
  signalQuality: number;
  source: string;
  duration: number;
  timestamp: number;
}

// ── API ───────────────────────────────────────────────────────────────────────
export function startHeartRateMeasurement(uid: string): void {
  if (Platform.OS !== 'android' || !HeartRateModule) return;
  HeartRateModule.startMeasurement(uid);
}

export function stopHeartRateMeasurement(): void {
  if (Platform.OS !== 'android' || !HeartRateModule) return;
  HeartRateModule.stopMeasurement();
}

export async function getHeartRateHistory(uid: string): Promise<HeartRateReading[]> {
  if (Platform.OS !== 'android' || !HeartRateModule) return [];
  try {
    return await HeartRateModule.getMeasurementHistory(uid);
  } catch { return []; }
}

export async function getLatestHeartRate(uid: string): Promise<HeartRateReading | null> {
  if (Platform.OS !== 'android' || !HeartRateModule) return null;
  try {
    return await HeartRateModule.getLatestReading(uid);
  } catch { return null; }
}

// ── Event subscriptions ───────────────────────────────────────────────────────
export function onHeartRateFrame(cb: (e: HeartRateFrameEvent) => void) {
  if (!emitter) return () => {};
  const sub = emitter.addListener('HeartRateFrame', cb);
  return () => sub.remove();
}

export function onHeartRateUpdate(cb: (e: HeartRateUpdateEvent) => void) {
  if (!emitter) return () => {};
  const sub = emitter.addListener('HeartRateUpdate', cb);
  return () => sub.remove();
}

export function onHeartRateDone(cb: (e: HeartRateDoneEvent) => void) {
  if (!emitter) return () => {};
  const sub = emitter.addListener('HeartRateDone', cb);
  return () => sub.remove();
}

export function onHeartRateError(cb: (e: HeartRateErrorEvent) => void) {
  if (!emitter) return () => {};
  const sub = emitter.addListener('HeartRateError', cb);
  return () => sub.remove();
}

export function isNativeHeartRateAvailable(): boolean {
  return Platform.OS === 'android' && !!HeartRateModule;
}
