// utils/hydrationStorage.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { addHydrationEntry, initHydrationHistoryDB } from "../database/hydrationHistoryDB";

// ✅ FIX: Use LOCAL timezone date key, NOT UTC.
// The HydrationContext uses getLocalDateString() (local timezone) to build
// its hydration key. If this utility used toISOString() (UTC), the keys
// would NEVER match for users in UTC+ timezones after the UTC date rollover.
// For IST users (UTC+5:30), this mismatch happens every day after 6:30 PM:
//   - HydrationContext reads:   "hydration-2026-06-18"  (local)
//   - saveWaterToStorage wrote: "hydration-2026-06-19"  (UTC)
// Result: notification-based water additions were completely invisible to the app.
const getLocalDateStr = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const getTodayKey = () => `hydration-${getLocalDateStr()}`;

export const saveWaterToStorage = async (ml: number) => {
  const key = getTodayKey();
  const saved = await AsyncStorage.getItem(key);
  const current = saved ? Number(saved) : 0;
  const newValue = current + ml;
  await AsyncStorage.setItem(key, String(newValue));
  await initHydrationHistoryDB();
  await addHydrationEntry(ml, newValue, "notification");
  console.log(`💧 [background] +${ml}ml saved (total: ${newValue}ml) key: ${key}`);
};