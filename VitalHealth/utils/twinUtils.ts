// utils/twinUtils.ts
import { UserProfile } from '../services/profileService';

/**
 * Generates a unique Health ID based on user demographics.
 * Matches registration logic to ensure consistency and avoid 404s.
 */
export function getTwinId(profile: Partial<UserProfile> | null): string {
  if (!profile) return 'temp_user';

  const fNameStr = String(profile.firstName || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const lNameStr = String(profile.lastName || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const phoneDigits = String(profile.phone || "").replace(/\D/g, "");
  const phoneExt = phoneDigits.length >= 4 ? phoneDigits.slice(-4) : "0000";

  if (fNameStr && lNameStr) {
    return `${fNameStr}_${lNameStr}_${phoneExt}`;
  }

  // Fallback to Firebase UID if available, otherwise temp_user
  return (profile as any).uid || 'temp_user';
}

/**
 * Normalizes vitals into qualitative health zones
 */
export function normalizeVitals(vitals: any) {
  const hr = vitals.heart_rate || 72;
  const sbp = vitals.systolic_bp || 120;
  const dbp = vitals.diastolic_bp || 80;

  let hrZone: 'low' | 'normal' | 'high' = 'normal';
  if (hr < 55) hrZone = 'low';
  if (hr > 100) hrZone = 'high';

  let bpZone: 'normal' | 'elevated' | 'hypertension' = 'normal';
  if (sbp >= 140 || dbp >= 90) bpZone = 'hypertension';
  else if (sbp >= 120 || dbp >= 80) bpZone = 'elevated';

  return { hrZone, bpZone };
}

/**
 * Calculates a rough "Biological Age" variance based on clinical indicators.
 * Note: This is an estimation for engagement, not a medical diagnosis.
 */
export function estimateBioAge(profile: any, currentVitals: any): number {
  if (!profile || !currentVitals) return 0;
  
  let variance = 0;
  
  // BMI factor (Weight in kg / (Height in m)^2)
  const hM = (parseInt(profile.height) || 170) / 100;
  const wK = parseInt(profile.weight) || 70;
  const bmi = wK / (hM * hM);
  
  if (bmi > 25) variance += (bmi - 25) * 0.5;
  if (bmi < 18.5) variance += (18.5 - bmi) * 0.3;

  // Cardiovascular factor
  const hr = currentVitals.heart_rate || 72;
  if (hr > 85) variance += (hr - 85) * 0.2;
  
  // Chronic factor
  if (profile.biogears_is_smoker) variance += 5;
  if (profile.biogears_has_type2_diabetes) variance += 3;

  return Math.round(variance);
}

/**
 * Returns YYYY-MM-DD in the local timezone for a given Date, timestamp (seconds or ms), or ISO string.
 */
export function getLocalDateString(dateInput?: Date | string | number | any): string {
  if (dateInput === undefined || dateInput === null) {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  let date: Date;
  if (dateInput instanceof Date) {
    date = dateInput;
  } else if (dateInput && typeof dateInput === "object" && typeof (dateInput as any).toDate === "function") {
    date = (dateInput as any).toDate();
  } else if (dateInput && typeof dateInput === "object" && "seconds" in dateInput && typeof (dateInput as any).seconds === "number") {
    date = new Date((dateInput as any).seconds * 1000);
  } else if (typeof dateInput === "number") {
    // If it's in seconds (like UNIX timestamp in todayEvents: e.g. 1783009865), convert to ms
    // Standard UNIX timestamps for our times are around 1.7e9, whereas millisecond timestamps are 1.7e12.
    if (dateInput < 10000000000) {
      date = new Date(dateInput * 1000);
    } else {
      date = new Date(dateInput);
    }
  } else {
    date = new Date(dateInput);
  }

  if (isNaN(date.getTime())) {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

