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
  ppgValue: number;       // green channel value for waveform
  avgRed: number;
  avgGreen: number;
  avgBlue: number;
  timestamp: number;      // milliseconds
}

export interface HeartRateUpdateEvent {
  bpm: number;
  spo2: number;
  confidence: number;       // 0–100
  status: string;           // CALIBRATING | MEASURING | TOO_MUCH_PRESSURE | MOTION_ARTIFACT_DETECTED | SIGNAL_LOW_QUALITY
  pulseWave: number;        // latest bandpass-filtered PPG sample (for waveform)
  snr: number;              // signal-to-noise ratio in dB
  progress: number;         // 0–1 (fraction of 30-second window elapsed)
  qualityLabel: string;     // Excellent | Good | Fair | Poor
  confidenceLabel: string;  // Very High | High | Medium | Low
}

export interface HeartRateDoneEvent {
  bpm: number;
  spo2: number;
  confidence: number;
  signalQuality: number;
  source: string;
  duration: number;
  timestamp: number;
  progress: number;         // always 1.0
  snr: number;             // signal-to-noise ratio in dB
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

export async function getHeartRateFftSpectrum(): Promise<number[]> {
  if (Platform.OS !== 'android' || !HeartRateModule) return [];
  try {
    return await HeartRateModule.getFftSpectrum();
  } catch { return []; }
}

export async function getHeartRateDetectedPeaks(): Promise<number[]> {
  if (Platform.OS !== 'android' || !HeartRateModule) return [];
  try {
    return await HeartRateModule.getDetectedPeaks();
  } catch { return []; }
}

export function calibrateHeartRateDevice(refHr: number, refSpo2: number): void {
  if (Platform.OS !== 'android' || !HeartRateModule) return;
  HeartRateModule.calibrateDevice(refHr, refSpo2);
}

// ── Event subscriptions ───────────────────────────────────────────────────────

export function onHeartRateFrame(cb: (e: HeartRateFrameEvent) => void) {
  if (!emitter) return () => {};
  let lastTime = 0;
  const throttledCb = (e: HeartRateFrameEvent) => {
    const now = Date.now();
    if (now - lastTime >= 33) {   // ~30fps max
      lastTime = now;
      cb(e);
    }
  };
  const sub = emitter.addListener('HeartRateFrame', throttledCb);
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
