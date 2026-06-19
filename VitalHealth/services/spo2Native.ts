import { NativeModules, NativeEventEmitter, Platform } from "react-native";

const { Spo2Module } = NativeModules;

// Interface for SpO2 measurement frames
export interface Spo2FrameEvent {
  fingerDetected: boolean;
  avgRed: number;
  avgBlue: number;
  ppgValue: number; // for waveform compatibility
  timestamp: number;
}

// Interface for continuous progress updates
export interface Spo2UpdateEvent {
  spo2: number;
  confidence: number;
  signalQuality: number;
  sampleCount: number;
  progress: number; // 0.0 to 1.0
  qualityLabel: string;
  confidenceLabel: string;
}

// Interface for completed measurement result
export interface Spo2DoneEvent {
  spo2: number;
  confidence: number;
  signalQuality: number;
  duration: number;
  timestamp: number;
  qualityLabel: string;
  confidenceLabel: string;
}

// Interface for measurement error
export interface Spo2ErrorEvent {
  message: string;
}

// Check if native module is available
export function isNativeSpo2Available(): boolean {
  return !!Spo2Module;
}

// Start native CameraX SpO2 measurement loop
export function startSpo2Measurement(uid: string = "self"): void {
  if (Platform.OS !== "android") {
    console.warn("SpO2 camera measurement is only supported on Android");
    return;
  }
  if (!Spo2Module) {
    console.error("Spo2Module not linked/compiled in this build");
    return;
  }
  Spo2Module.startMeasurement(uid);
}

// Stop current SpO2 measurement loop
export function stopSpo2Measurement(): void {
  if (Platform.OS !== "android") return;
  Spo2Module?.stopMeasurement();
}

// Event Listeners
const eventEmitter = Spo2Module ? new NativeEventEmitter(Spo2Module) : null;

export function onSpo2Frame(callback: (event: Spo2FrameEvent) => void) {
  if (!eventEmitter) return () => {};
  let lastTime = 0;
  const throttledCallback = (event: Spo2FrameEvent) => {
    const now = Date.now();
    if (now - lastTime >= 33) {
      lastTime = now;
      callback(event);
    }
  };
  const sub = eventEmitter.addListener("Spo2Frame", throttledCallback);
  return () => sub.remove();
}

export function onSpo2Update(callback: (event: Spo2UpdateEvent) => void) {
  if (!eventEmitter) return () => {};
  const sub = eventEmitter.addListener("Spo2Update", callback);
  return () => sub.remove();
}

export function onSpo2Done(callback: (event: Spo2DoneEvent) => void) {
  if (!eventEmitter) return () => {};
  const sub = eventEmitter.addListener("Spo2Done", callback);
  return () => sub.remove();
}

export function onSpo2Error(callback: (event: Spo2ErrorEvent) => void) {
  if (!eventEmitter) return () => {};
  const sub = eventEmitter.addListener("Spo2Error", callback);
  return () => sub.remove();
}
