// services/medicineAlarmNative.ts
// TypeScript wrapper around the native Android MedicineAlarmModule
import { NativeModules, Platform } from 'react-native';

const { MedicineAlarmModule } = NativeModules;

export function scheduleMedicineAlarm(
  id: number,
  name: string,
  dose: string,
  timestampMs: number,
  frequency: string
): void {
  if (Platform.OS !== 'android' || !MedicineAlarmModule) return;
  try {
    MedicineAlarmModule.scheduleAlarm(id, name, dose, timestampMs, frequency);
  } catch (error) {
    console.error('❌ Failed to schedule native medicine alarm:', error);
  }
}

export function cancelMedicineAlarm(id: number): void {
  if (Platform.OS !== 'android' || !MedicineAlarmModule) return;
  try {
    MedicineAlarmModule.cancelAlarm(id);
  } catch (error) {
    console.error('❌ Failed to cancel native medicine alarm:', error);
  }
}

export function isNativeMedicineAlarmAvailable(): boolean {
  return Platform.OS === 'android' && !!MedicineAlarmModule;
}
