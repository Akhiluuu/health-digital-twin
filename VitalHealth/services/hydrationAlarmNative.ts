// services/hydrationAlarmNative.ts
// TypeScript wrapper around the native Android HydrationAlarmModule
import { NativeModules, Platform } from 'react-native';

const { HydrationAlarmModule } = NativeModules;

export function scheduleHydrationAlarm(intervalMinutes: number): void {
  if (Platform.OS !== 'android' || !HydrationAlarmModule) return;
  try {
    HydrationAlarmModule.scheduleAlarm(intervalMinutes);
  } catch (error) {
    console.error('❌ Failed to schedule native hydration alarm:', error);
  }
}

export function cancelHydrationAlarm(): void {
  if (Platform.OS !== 'android' || !HydrationAlarmModule) return;
  try {
    HydrationAlarmModule.cancelAlarm();
  } catch (error) {
    console.error('❌ Failed to cancel native hydration alarm:', error);
  }
}

export function isNativeHydrationAlarmAvailable(): boolean {
  return Platform.OS === 'android' && !!HydrationAlarmModule;
}
