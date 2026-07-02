// services/hydrationAlarmNative.ts
// TypeScript wrapper around the native Android HydrationAlarmModule
import { NativeModules, Platform } from 'react-native';

import { error } from "../utils/logger";

const { HydrationAlarmModule } = NativeModules;

export function scheduleHydrationAlarm(intervalMinutes: number): void {
  if (Platform.OS !== 'android' || !HydrationAlarmModule) return;
  try {
    HydrationAlarmModule.scheduleAlarm(intervalMinutes);
  } catch (err: unknown) {
    error('❌ Failed to schedule native hydration alarm:', err);
  }
}

export function cancelHydrationAlarm(): void {
  if (Platform.OS !== 'android' || !HydrationAlarmModule) return;
  try {
    HydrationAlarmModule.cancelAlarm();
  } catch (err: unknown) {
    error('❌ Failed to cancel native hydration alarm:', err);
  }
}

export function isNativeHydrationAlarmAvailable(): boolean {
  return Platform.OS === 'android' && !!HydrationAlarmModule;
}
