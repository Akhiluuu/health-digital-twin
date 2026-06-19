// services/foregroundStepService.ts
// ─────────────────────────────────────────────────────────────────────────────
// REDESIGNED: This file now serves only as the Notifee notification helper.
// All sensor work is done by the native Kotlin StepForegroundService.
// On Android:  native service owns sensors → broadcasts steps via NativeEventEmitter
// On iOS:      not used (Pedometer + HealthKit poll in StepContext)
// ─────────────────────────────────────────────────────────────────────────────

import notifee, { AndroidImportance, EventType } from '@notifee/react-native';
import { Platform } from 'react-native';

export const CHANNEL_ID = 'step_foreground';
export const NOTIF_ID   = 'step_foreground_notif';

type StopListener = () => void;
const stopListeners: StopListener[] = [];
let stopTrackingCallback: (() => void) | null = null;

export function listenForegroundServiceEvents(onStop: StopListener): () => void {
  stopListeners.push(onStop);
  return () => {
    const idx = stopListeners.indexOf(onStop);
    if (idx !== -1) stopListeners.splice(idx, 1);
  };
}

export function registerStopTrackingCallback(cb: () => void) {
  stopTrackingCallback = cb;
}

// Notifee foreground event handler for the "Stop" notification button
if (Platform.OS === 'android') {
  notifee.onForegroundEvent(({ type, detail }) => {
    if (type === EventType.ACTION_PRESS && detail.pressAction?.id === 'stop_tracking') {
      stopTrackingCallback?.();
      stopListeners.forEach(fn => fn());
    }
  });
  notifee.onBackgroundEvent(async ({ type, detail }) => {
    if (type === EventType.ACTION_PRESS && detail.pressAction?.id === 'stop_tracking') {
      stopTrackingCallback?.();
      stopListeners.forEach(fn => fn());
    }
  });

  // Notifee foreground service stub — the native Kotlin service handles sensors.
  // We keep this only so Notifee can manage the notification channel.
  notifee.registerForegroundService(() => new Promise<void>(() => {
    // Never resolves — Notifee keeps the notification alive
    // Actual step counting is done by .steptracker.StepForegroundService
  }));
}

// ── Notification channel ──────────────────────────────────────────────────────
async function ensureChannel(): Promise<void> {
  await notifee.createChannel({
    id:         CHANNEL_ID,
    name:       'Step Tracking',
    importance: AndroidImportance.LOW,
  });
}

// ── Update step count in persistent notification ──────────────────────────────
export async function updateForegroundNotification(steps: number, calories: number): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await ensureChannel();
    await notifee.displayNotification({
      id:    NOTIF_ID,
      title: `👟 ${steps.toLocaleString('en-IN')} steps today`,
      body:  `${calories} kcal burned · tap to open`,
      android: {
        channelId:           CHANNEL_ID,
        asForegroundService: false, // native service owns the foreground; we just show a notification
        ongoing:             true,
        color:               '#f97316',
        smallIcon:           'ic_launcher',
        pressAction:         { id: 'default' },
        actions: [{ title: '⏹ Stop Tracking', pressAction: { id: 'stop_tracking' } }],
      },
    });
  } catch { /* non-critical */ }
}

// ── Cancel notification on stop ───────────────────────────────────────────────
export async function cancelForegroundNotification(): Promise<void> {
  try { await notifee.cancelNotification(NOTIF_ID); } catch { /* ignore */ }
}

// Legacy exports kept for API compatibility with step-intelligence.tsx
export async function startForegroundStepService(): Promise<void> {
  // No-op — native service is started by StepTrackerModule.startTracking()
}

export async function stopForegroundStepService(): Promise<void> {
  await cancelForegroundNotification();
}

// Legacy event emitter kept for backward compat (no longer used internally)
import EventEmitter from 'eventemitter3';
export const stepEventEmitter = new EventEmitter();
