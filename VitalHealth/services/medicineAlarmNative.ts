// services/medicineAlarmNative.ts
// TypeScript wrapper around the native Android MedicineAlarmModule
import { NativeModules, Platform } from 'react-native';

import { error } from "../utils/logger";

const { MedicineAlarmModule } = NativeModules;

export function scheduleMedicineAlarm(
  id: number,
  name: string,
  dose: string,
  timestampMs: number,
  frequency: string,
  profileId: string = "self"
): void {
  if (Platform.OS !== 'android' || !MedicineAlarmModule) return;
  try {
    MedicineAlarmModule.scheduleAlarm(id, name, dose, timestampMs, frequency, profileId);
  } catch (err: unknown) {
    error('❌ Failed to schedule native medicine alarm:', err);
  }
}

export function cancelMedicineAlarm(id: number): void {
  if (Platform.OS !== 'android' || !MedicineAlarmModule) return;
  try {
    MedicineAlarmModule.cancelAlarm(id);
  } catch (err: unknown) {
    error('❌ Failed to cancel native medicine alarm:', err);
  }
}

export function isNativeMedicineAlarmAvailable(): boolean {
  return Platform.OS === 'android' && !!MedicineAlarmModule;
}
