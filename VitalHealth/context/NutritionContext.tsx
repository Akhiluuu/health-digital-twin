// context/NutritionContext.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Shared Nutrition Context
// • Single source of truth for all nutrition data
// • Syncs between nutrition.tsx and calorie-intelligence.tsx
// • Persists via AsyncStorage & Firestore for multi-profile support
// ─────────────────────────────────────────────────────────────────────────────

import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import { safeJsonParse, safeJsonStringify, safeArray } from "../utils/safeJson";
import { auth, db } from "../services/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useFamily } from "./FamilyContext";
import { useBiogearsTwin } from "./BiogearsTwinContext";
import { log, error } from "../utils/logger";
import { getLocalDateString } from "../utils/twinUtils";
import { nanoid } from "../utils/nanoid";

import {
  syncAddFoodEntry,
  syncDeleteFoodEntry,
  syncClearFoodEntries,
  fetchFoodEntriesFromFirebase,
  syncAddActivityEntry,
  syncDeleteActivityEntry,
  syncClearActivityEntries,
  fetchActivityEntriesFromFirebase,
} from "../services/firebaseSync";

// ─── Keys ────────────────────────────────────────────────────────────────────
const NUTRITION_DATA_KEY   = "nutrition_data_v2";
const MEAL_REMINDER_KEY    = "meal_reminders_v2";
const ACTIVITY_LOG_KEY     = "activity_log_v1";
const DELETED_FOOD_IDS_KEY     = "@deleted_food_ids_v1";
const DELETED_ACTIVITY_IDS_KEY = "@deleted_activity_ids_v1";

// ─── Types ────────────────────────────────────────────────────────────────────
export type FoodEntry = {
  id: string;
  mealId: string;
  foodId: string;
  foodName: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar: number;
  sodium: number;
  fiber: number;
  timestamp: string; // ISO string for serialization
};

export type MealReminder = {
  id: string;
  mealId: string;
  mealName: string;
  enabled: boolean;
  time: string;
};

export type ActivityEntry = {
  id: string;
  activityName: string;
  activityIcon: string;
  durationMins: number;
  intensity: "Low" | "Moderate" | "High" | "Max";
  caloriesBurned: number;
  met: number;
  timestamp: string; // ISO string
};

export type NutritionTotals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar: number;
  sodium: number;
  fiber: number;
};

export type HealthProfileId =
  | "standard"
  | "diabetes"
  | "hypertension"
  | "cholesterol"
  | "keto"
  | "renal";

export type HealthProfile = {
  id: HealthProfileId;
  label: string;
  icon: string;
  color: string;
  activityMultiplier: number;
  recommendations: NutritionTotals;
  tips: string[];
};

// ─── Health Profiles ─────────────────────────────────────────────────────────
export const healthProfiles: HealthProfile[] = [
  {
    id: "standard",
    label: "Standard",
    icon: "🍽️",
    color: "#3b82f6",
    activityMultiplier: 1.375,
    recommendations: {
      calories: 2000, protein: 50, carbs: 250, fat: 65,
      sugar: 50, sodium: 2300, fiber: 25
    },
    tips: [
      "Eat a balanced diet with fruits and vegetables",
      "Include lean proteins in every meal",
      "Stay hydrated with 8 glasses of water",
      "Limit processed foods and added sugars",
    ],
  },
  {
    id: "diabetes",
    label: "Diabetes",
    icon: "🩸",
    color: "#ef4444",
    activityMultiplier: 1.2,
    recommendations: {
      calories: 1800, protein: 60, carbs: 150, fat: 60,
      sugar: 25, sodium: 2000, fiber: 35
    },
    tips: [
      "Choose complex carbs over simple sugars",
      "Monitor blood sugar before and after meals",
      "Eat smaller, more frequent meals",
      "Include fiber-rich foods in every meal",
      "Avoid sugary drinks and processed foods",
    ],
  },
  {
    id: "hypertension",
    label: "High BP",
    icon: "❤️",
    color: "#f97316",
    activityMultiplier: 1.2,
    recommendations: {
      calories: 1900, protein: 55, carbs: 220, fat: 55,
      sugar: 30, sodium: 1500, fiber: 30
    },
    tips: [
      "Limit sodium to less than 1500mg per day",
      "Eat potassium-rich foods (bananas, spinach)",
      "Follow DASH diet principles",
      "Avoid processed and canned foods",
      "Read labels for hidden sodium",
    ],
  },
  {
    id: "cholesterol",
    label: "Cholesterol",
    icon: "🥑",
    color: "#8b5cf6",
    activityMultiplier: 1.375,
    recommendations: {
      calories: 1900, protein: 60, carbs: 200, fat: 50,
      sugar: 30, sodium: 2000, fiber: 35
    },
    tips: [
      "Choose healthy fats (olive oil, avocado)",
      "Eat oats and barley for soluble fiber",
      "Include fatty fish twice a week",
      "Limit saturated and trans fats",
      "Add nuts and seeds to your diet",
    ],
  },
  {
    id: "keto",
    label: "Keto",
    icon: "🥓",
    color: "#f59e0b",
    activityMultiplier: 1.55,
    recommendations: {
      calories: 1800, protein: 75, carbs: 30, fat: 140,
      sugar: 10, sodium: 2500, fiber: 15
    },
    tips: [
      "Keep carbs under 30g per day",
      "Focus on healthy fats and moderate protein",
      "Stay hydrated to avoid keto flu",
      "Monitor electrolytes (sodium, potassium)",
      "Eat non-starchy vegetables",
    ],
  },
  {
    id: "renal",
    label: "Renal",
    icon: "🧂",
    color: "#6b7280",
    activityMultiplier: 1.2,
    recommendations: {
      calories: 2000, protein: 40, carbs: 250, fat: 60,
      sugar: 30, sodium: 1500, fiber: 20
    },
    tips: [
      "Limit protein to preserve kidney function",
      "Control potassium and phosphorus intake",
      "Monitor fluid intake",
      "Choose low-sodium options",
      "Avoid high-phosphorus foods",
    ],
  },
];

// ─── Meal Types ───────────────────────────────────────────────────────────────
export const mealTypes = [
  { id: "breakfast",        label: "Breakfast",       icon: "🍳", time: "08:00", color: "#f97316" },
  { id: "morning_snack",   label: "Morning Snack",   icon: "🍎", time: "10:30", color: "#10b981" },
  { id: "lunch",           label: "Lunch",            icon: "🥗", time: "13:00", color: "#3b82f6" },
  { id: "afternoon_snack", label: "Afternoon Snack", icon: "🍪", time: "16:00", color: "#f59e0b" },
  { id: "dinner",          label: "Dinner",           icon: "🍲", time: "19:00", color: "#8b5cf6" },
  { id: "evening_snack",  label: "Evening Snack",   icon: "🥛", time: "21:00", color: "#6b7280" },
];

// ─── Food Database ────────────────────────────────────────────────────────────
export const foodDatabase = [
  { id: "1",  name: "Oatmeal",        calories: 150, protein: 5,    carbs: 27, fat: 3,    sugar: 1,    sodium: 0,   fiber: 4,   category: "breakfast" },
  { id: "2",  name: "Eggs (2)",       calories: 140, protein: 12,   carbs: 1,  fat: 10,   sugar: 0,    sodium: 140, fiber: 0,   category: "breakfast" },
  { id: "3",  name: "Greek Yogurt",   calories: 100, protein: 17,   carbs: 6,  fat: 0,    sugar: 5,    sodium: 50,  fiber: 0,   category: "breakfast" },
  { id: "4",  name: "Banana",         calories: 105, protein: 1,    carbs: 27, fat: 0,    sugar: 14,   sodium: 1,   fiber: 3,   category: "snack" },
  { id: "5",  name: "Apple",          calories: 95,  protein: 0.5,  carbs: 25, fat: 0,    sugar: 19,   sodium: 2,   fiber: 4,   category: "snack" },
  { id: "6",  name: "Chicken Breast", calories: 165, protein: 31,   carbs: 0,  fat: 3.6,  sugar: 0,    sodium: 70,  fiber: 0,   category: "lunch" },
  { id: "7",  name: "Salmon",         calories: 208, protein: 22,   carbs: 0,  fat: 13,   sugar: 0,    sodium: 59,  fiber: 0,   category: "dinner" },
  { id: "8",  name: "Brown Rice",     calories: 216, protein: 5,    carbs: 45, fat: 1.8,  sugar: 0.7,  sodium: 10,  fiber: 3.5, category: "lunch" },
  { id: "9",  name: "Quinoa",         calories: 222, protein: 8,    carbs: 39, fat: 3.6,  sugar: 1.5,  sodium: 13,  fiber: 5,   category: "lunch" },
  { id: "10", name: "Avocado",        calories: 234, protein: 2.9,  carbs: 12, fat: 21,   sugar: 0.7,  sodium: 10,  fiber: 9,   category: "snack" },
  { id: "11", name: "Almonds (1oz)",  calories: 164, protein: 6,    carbs: 6,  fat: 14,   sugar: 1,    sodium: 0,   fiber: 3.5, category: "snack" },
  { id: "12", name: "Broccoli",       calories: 55,  protein: 3.7,  carbs: 11, fat: 0.6,  sugar: 2.2,  sodium: 30,  fiber: 5,   category: "dinner" },
  { id: "13", name: "Sweet Potato",   calories: 103, protein: 2.3,  carbs: 24, fat: 0.2,  sugar: 7,    sodium: 41,  fiber: 4,   category: "dinner" },
  { id: "14", name: "Milk (1 cup)",   calories: 103, protein: 8,    carbs: 12, fat: 2.4,  sugar: 12,   sodium: 107, fiber: 0,   category: "breakfast" },
  { id: "15", name: "Cottage Cheese", calories: 110, protein: 13,   carbs: 5,  fat: 5,    sugar: 4,    sodium: 350, fiber: 0,   category: "breakfast" },
];

/**
 * Searches real-world foods dynamically via local backend air-gapped database or local client index.
 */
export async function searchOpenFoodFacts(query: string): Promise<typeof foodDatabase> {
  const clean = query.trim().toLowerCase();
  if (!clean) return [];

  // 1. Local client-side dataset matching
  const localMatches = foodDatabase.filter(f => f.name.toLowerCase().includes(clean) || f.category.toLowerCase().includes(clean));

  // 2. Query local backend air-gapped database endpoint
  try {
    const { API_BASE_URL } = require('../services/apiConfig');
    const res = await fetch(`${API_BASE_URL}/api/v6/nutrition/food-search?query=${encodeURIComponent(clean)}`);
    if (res.ok) {
      const data = await res.json();
      const serverItems = (data.items || []).map((item: any) => ({
        id: item.id || `loc_${Date.now()}`,
        name: item.name,
        calories: Math.round(item.calories || 0),
        protein: item.protein_g || 0,
        carbs: item.carbs_g || 0,
        fat: item.fat_g || 0,
        sodium: item.sodium_mg || 0,
        fiber: item.fiber_g || 0,
        category: item.category || "general"
      }));

      // Merge results without duplicate names
      const combined = [...localMatches];
      for (const sItem of serverItems) {
        if (!combined.some(c => c.name.toLowerCase() === sItem.name.toLowerCase())) {
          combined.push(sItem);
        }
      }
      return combined;
    }
  } catch (err) {
    // Silently fall back to client-side local database
  }

  return localMatches;
}

// ─── State & Actions ──────────────────────────────────────────────────────────
type State = {
  foodEntries: FoodEntry[];
  activityEntries: ActivityEntry[];
  mealReminders: MealReminder[];
  selectedProfileId: HealthProfileId;
  customCalorieTarget: number | null;
  loaded: boolean;
};

type Action =
  | { type: "LOAD"; payload: Partial<State> }
  | { type: "ADD_ENTRY"; payload: FoodEntry }
  | { type: "REMOVE_ENTRY"; payload: string }
  | { type: "ADD_ACTIVITY"; payload: ActivityEntry }
  | { type: "REMOVE_ACTIVITY"; payload: string }
  | { type: "SET_PROFILE"; payload: HealthProfileId }
  | { type: "SET_CUSTOM_CALORIE_TARGET"; payload: number | null }
  | { type: "TOGGLE_REMINDER"; payload: string }
  | { type: "UPDATE_REMINDER_TIME"; payload: { id: string; time: string } }
  | { type: "RESET_TODAY" }
  | { type: "RESET_LOADED" };

const defaultReminders: MealReminder[] = mealTypes.map((m) => ({
  id: `reminder_${m.id}`,
  mealId: m.id,
  mealName: m.label,
  enabled: false,
  time: m.time,
}));

const initialState: State = {
  foodEntries: [],
  activityEntries: [],
  mealReminders: defaultReminders,
  selectedProfileId: "standard",
  customCalorieTarget: null,
  loaded: false,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "RESET_LOADED":
      return { ...state, loaded: false };

    case "LOAD":
      return { ...state, ...action.payload, loaded: true };

    case "ADD_ENTRY":
      return { ...state, foodEntries: [...state.foodEntries, action.payload] };

    case "REMOVE_ENTRY":
      return { ...state, foodEntries: state.foodEntries.filter((e) => e.id !== action.payload) };

    case "ADD_ACTIVITY":
      return { ...state, activityEntries: [...state.activityEntries, action.payload] };

    case "REMOVE_ACTIVITY":
      return { ...state, activityEntries: state.activityEntries.filter((e) => e.id !== action.payload) };

    case "SET_PROFILE":
      return { ...state, selectedProfileId: action.payload };

    case "SET_CUSTOM_CALORIE_TARGET":
      return { ...state, customCalorieTarget: action.payload };

    case "TOGGLE_REMINDER":
      return {
        ...state,
        mealReminders: state.mealReminders.map((r) =>
          r.id === action.payload ? { ...r, enabled: !r.enabled } : r
        ),
      };

    case "UPDATE_REMINDER_TIME":
      return {
        ...state,
        mealReminders: state.mealReminders.map((r) =>
          r.id === action.payload.id ? { ...r, time: action.payload.time } : r
        ),
      };

    case "RESET_TODAY":
      return { ...state, foodEntries: [], activityEntries: [] };

    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────
type NutritionContextType = {
  // Data
  foodEntries: FoodEntry[];
  activityEntries: ActivityEntry[];
  mealReminders: MealReminder[];
  selectedProfile: HealthProfile;
  customCalorieTarget: number | null;
  totals: NutritionTotals;
  totalActivityCalories: number;
  netCalories: number;
  loaded: boolean;

  // Actions
  addFoodEntry: (entry: Omit<FoodEntry, "id" | "timestamp"> & { timestamp?: string }) => Promise<void>;
  removeFoodEntry: (id: string) => void;
  addActivityEntry: (entry: Omit<ActivityEntry, "id" | "timestamp">) => void;
  removeActivityEntry: (id: string) => void;
  setProfile: (id: HealthProfileId) => void;
  setCustomCalorieTarget: (target: number | null) => void;
  toggleReminder: (reminderId: string) => void;
  updateReminderTime: (reminderId: string, time: string) => void;
  getMealEntries: (mealId: string) => FoodEntry[];
  resetToday: () => void;
  syncNutritionWithFirebase: () => Promise<void>;
};

const NutritionContext = createContext<NutritionContextType | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────
export function NutritionProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { isSwitched, activeMemberId, reportLoading } = useFamily();
  const { todayEvents, setTodayEvents, sessions } = useBiogearsTwin();

  useEffect(() => {
    if (reportLoading) {
      reportLoading("nutrition", !state.loaded);
    }
  }, [state.loaded, reportLoading]);

  // Safety timer to prevent state.loaded from staying false forever
  useEffect(() => {
    if (!state.loaded) {
      const timer = setTimeout(() => {
        dispatch({ type: "LOAD", payload: {} });
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [state.loaded]);

  // Sync / Load with Firebase
  const syncNutritionWithFirebase = useCallback(async () => {
    dispatch({ type: "RESET_LOADED" });
    if (isSwitched && activeMemberId && activeMemberId !== "self") {
      try {
        const [foodFirebase, activityFirebase, configDoc] = await Promise.all([
          fetchFoodEntriesFromFirebase(activeMemberId),
          fetchActivityEntriesFromFirebase(activeMemberId),
          getDoc(doc(db, "users", activeMemberId, "nutrition_config", "latest")),
        ]);

        const todayStr = getLocalDateString(); // ✅ Timezone-safe local date string (YYYY-MM-DD)
        const lastClearedKey = `nutrition_last_cleared_${activeMemberId}`;
        const lastClearedRaw = await AsyncStorage.getItem(lastClearedKey);
        const lastCleared = lastClearedRaw ? new Date(lastClearedRaw) : null;
        const lastClearedDateStr = lastCleared ? getLocalDateString(lastCleared) : null;

        const todayFood = foodFirebase.filter(
          (f) => {
            const isToday = getLocalDateString(f.timestamp) === todayStr;
            if (!isToday) return false;
            if (lastCleared && lastClearedDateStr === todayStr) {
              return new Date(f.timestamp) > lastCleared;
            }
            return true;
          }
        );
        const todayActivity = activityFirebase.filter(
          (a) => {
            const isToday = getLocalDateString(a.timestamp) === todayStr;
            if (!isToday) return false;
            if (lastCleared && lastClearedDateStr === todayStr) {
              return new Date(a.timestamp) > lastCleared;
            }
            return true;
          }
        );

        let selectedProfileId: HealthProfileId = "standard";
        let customCalorieTarget: number | null = null;
        let mealReminders = defaultReminders;

        if (configDoc.exists()) {
          const cfg = configDoc.data();
          if (cfg.selectedProfileId) selectedProfileId = cfg.selectedProfileId;
          if (cfg.customCalorieTarget !== undefined) customCalorieTarget = cfg.customCalorieTarget;
          if (cfg.mealReminders) mealReminders = cfg.mealReminders;
        }

        dispatch({
          type: "LOAD",
          payload: {
            foodEntries: todayFood,
            activityEntries: todayActivity,
            mealReminders,
            selectedProfileId,
            customCalorieTarget,
          },
        });
        log(`🍽️ Switched nutrition loaded for ${activeMemberId}`);
      } catch (err) {
        log("❌ Switched nutrition load error:", err);
        // Dispatch load with default/empty state so loading state is resolved
        dispatch({
          type: "LOAD",
          payload: {
            foodEntries: [],
            activityEntries: [],
            mealReminders: defaultReminders,
            selectedProfileId: "standard",
            customCalorieTarget: null,
          },
        });
      }
      return;
    }

    // Self
    try {
      const currentUser = auth.currentUser;
      const configDocRef = currentUser
        ? doc(db, "users", currentUser.uid, "nutrition_config", "latest")
        : null;

      // Wrap Firebase requests in individual try-catch blocks or Promise.all with catch/fallbacks
      // to make sure we still proceed to load from local storage even if Firestore is offline.
      let foodFirebase: FoodEntry[] = [];
      let activityFirebase: ActivityEntry[] = [];
      let configDocSnap: any = null;

      try {
        const results = await Promise.all([
          fetchFoodEntriesFromFirebase(),
          fetchActivityEntriesFromFirebase(),
          configDocRef ? getDoc(configDocRef) : Promise.resolve(null),
        ]);
        foodFirebase = results[0];
        activityFirebase = results[1];
        configDocSnap = results[2];
      } catch (fbErr) {
        log("⚠️ Firebase fetch error (offline fallback):", fbErr);
      }

      const todayStr = getLocalDateString(); // ✅ Timezone-safe local date string (YYYY-MM-DD)
      const lastClearedKey = `nutrition_last_cleared_${currentUser?.uid || "self"}`;
      const lastClearedRaw = await AsyncStorage.getItem(lastClearedKey);
      const lastCleared = lastClearedRaw ? new Date(lastClearedRaw) : null;
      const lastClearedDateStr = lastCleared ? getLocalDateString(lastCleared) : null;

      const todayFirebaseFood = foodFirebase.filter(
        (f) => {
          const isToday = getLocalDateString(f.timestamp) === todayStr;
          if (!isToday) return false;
          if (lastCleared && lastClearedDateStr === todayStr) {
            return new Date(f.timestamp) > lastCleared;
          }
          return true;
        }
      );
      const todayFirebaseActivity = activityFirebase.filter(
        (a) => {
          const isToday = getLocalDateString(a.timestamp) === todayStr;
          if (!isToday) return false;
          if (lastCleared && lastClearedDateStr === todayStr) {
            return new Date(a.timestamp) > lastCleared;
          }
          return true;
        }
      );

      // Load local
      const [dataRaw, remindersRaw, activityRaw, deletedFoodRaw, deletedActivityRaw] = await Promise.all([
        AsyncStorage.getItem(NUTRITION_DATA_KEY),
        AsyncStorage.getItem(MEAL_REMINDER_KEY),
        AsyncStorage.getItem(ACTIVITY_LOG_KEY),
        AsyncStorage.getItem(DELETED_FOOD_IDS_KEY),
        AsyncStorage.getItem(DELETED_ACTIVITY_IDS_KEY),
      ]);

      let localFood: FoodEntry[] = [];
      let localActivity: ActivityEntry[] = [];
      let selectedProfileId: HealthProfileId = "standard";
      let customCalorieTarget: number | null = null;
      let mealReminders = defaultReminders;
      let deletedFoodIds: string[] = deletedFoodRaw ? safeJsonParse<string[]>(deletedFoodRaw, []) : [];
      let deletedActivityIds: string[] = deletedActivityRaw ? safeJsonParse<string[]>(deletedActivityRaw, []) : [];
      const deletedFoodSet = new Set(deletedFoodIds);
      const deletedActivitySet = new Set(deletedActivityIds);

      if (dataRaw) {
        const data = safeJsonParse(dataRaw, { foodEntries: [], selectedProfileId: 'standard', customCalorieTarget: null });
        localFood = safeArray<FoodEntry>(data.foodEntries);
        selectedProfileId = (data.selectedProfileId ?? "standard") as HealthProfileId;
        customCalorieTarget = data.customCalorieTarget !== undefined ? data.customCalorieTarget : null;
      }
      if (remindersRaw) {
        const parsed = safeJsonParse<MealReminder[]>(remindersRaw, defaultReminders);
        mealReminders = Array.isArray(parsed) ? parsed : defaultReminders;
      }
      if (activityRaw) {
        const parsed = safeJsonParse<ActivityEntry[]>(activityRaw, []);
        localActivity = Array.isArray(parsed) ? parsed : [];
      }

      // Filter local to today only
      localFood = localFood.filter(
        (f) => getLocalDateString(f.timestamp) === todayStr
      );
      localActivity = localActivity.filter(
        (a) => getLocalDateString(a.timestamp) === todayStr
      );

      // Only perform Firebase sync operations if we actually fetched Firebase data successfully
      if (foodFirebase.length > 0 || activityFirebase.length > 0 || configDocSnap) {
        // Sync food: upload missing, download missing
        const localFoodIds = new Set(localFood.map((f) => f.id));
        const firebaseFoodIds = new Set(todayFirebaseFood.map((f) => f.id));

        for (const entry of localFood) {
          if (!firebaseFoodIds.has(entry.id) && !deletedFoodSet.has(entry.id)) {
            await syncAddFoodEntry(entry).catch(() => {});
          }
        }

        const remainingDeletedFoodIds = [...deletedFoodIds];
        for (const entry of todayFirebaseFood) {
          if (deletedFoodSet.has(entry.id)) {
            await syncDeleteFoodEntry(entry.id).catch(() => {});
            const idx = remainingDeletedFoodIds.indexOf(entry.id);
            if (idx > -1) remainingDeletedFoodIds.splice(idx, 1);
          } else if (!localFoodIds.has(entry.id)) {
            localFood.push(entry);
          }
        }
        if (remainingDeletedFoodIds.length !== deletedFoodIds.length) {
          await AsyncStorage.setItem(DELETED_FOOD_IDS_KEY, JSON.stringify(remainingDeletedFoodIds)).catch(() => {});
        }

        // Sync activity: upload missing, download missing
        const localActivityIds = new Set(localActivity.map((a) => a.id));
        const firebaseActivityIds = new Set(todayFirebaseActivity.map((a) => a.id));

        for (const entry of localActivity) {
          if (!firebaseActivityIds.has(entry.id) && !deletedActivitySet.has(entry.id)) {
            await syncAddActivityEntry(entry).catch(() => {});
          }
        }

        const remainingDeletedActivityIds = [...deletedActivityIds];
        for (const entry of todayFirebaseActivity) {
          if (deletedActivitySet.has(entry.id)) {
            await syncDeleteActivityEntry(entry.id).catch(() => {});
            const idx = remainingDeletedActivityIds.indexOf(entry.id);
            if (idx > -1) remainingDeletedActivityIds.splice(idx, 1);
          } else if (!localActivityIds.has(entry.id)) {
            localActivity.push(entry);
          }
        }
        if (remainingDeletedActivityIds.length !== deletedActivityIds.length) {
          await AsyncStorage.setItem(DELETED_ACTIVITY_IDS_KEY, JSON.stringify(remainingDeletedActivityIds)).catch(() => {});
        }

        // Sync config if firebase exists
        if (configDocSnap && configDocSnap.exists()) {
          const cfg = configDocSnap.data();
          if (cfg.selectedProfileId) selectedProfileId = cfg.selectedProfileId;
          if (cfg.customCalorieTarget !== undefined) customCalorieTarget = cfg.customCalorieTarget;
          if (cfg.mealReminders) mealReminders = cfg.mealReminders;
        } else {
          const user = auth.currentUser;
          if (user) {
            await setDoc(doc(db, "users", user.uid, "nutrition_config", "latest"), {
              selectedProfileId,
              customCalorieTarget,
              mealReminders,
            }).catch(() => {});
          }
        }
      }

      dispatch({
        type: "LOAD",
        payload: {
          foodEntries: localFood,
          activityEntries: localActivity,
          mealReminders,
          selectedProfileId,
          customCalorieTarget,
        },
      });

      // Write updated local back to AsyncStorage
      await Promise.all([
        AsyncStorage.setItem(
          NUTRITION_DATA_KEY,
          JSON.stringify({ foodEntries: localFood, selectedProfileId, customCalorieTarget })
        ),
        AsyncStorage.setItem(MEAL_REMINDER_KEY, JSON.stringify(mealReminders)),
        AsyncStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify(localActivity)),
      ]).catch(() => {});

      log(`🍽️ Self nutrition synced and loaded`);
    } catch (err) {
      log("❌ Self nutrition sync error:", err);
      // Fallback: try loading just AsyncStorage if everything else crashed
      try {
        const [dataRaw, remindersRaw, activityRaw] = await Promise.all([
          AsyncStorage.getItem(NUTRITION_DATA_KEY),
          AsyncStorage.getItem(MEAL_REMINDER_KEY),
          AsyncStorage.getItem(ACTIVITY_LOG_KEY),
        ]);
        let localFood: FoodEntry[] = [];
        let localActivity: ActivityEntry[] = [];
        let selectedProfileId: HealthProfileId = "standard";
        let customCalorieTarget: number | null = null;
        let mealReminders = defaultReminders;

        if (dataRaw) {
          const data = safeJsonParse(dataRaw, { foodEntries: [], selectedProfileId: 'standard', customCalorieTarget: null });
          localFood = safeArray<FoodEntry>(data.foodEntries);
          selectedProfileId = (data.selectedProfileId ?? "standard") as HealthProfileId;
          customCalorieTarget = data.customCalorieTarget !== undefined ? data.customCalorieTarget : null;
        }
        if (remindersRaw) {
          const parsed = safeJsonParse<MealReminder[]>(remindersRaw, defaultReminders);
          mealReminders = Array.isArray(parsed) ? parsed : defaultReminders;
        }
        if (activityRaw) {
          const parsed = safeJsonParse<ActivityEntry[]>(activityRaw, []);
          localActivity = Array.isArray(parsed) ? parsed : [];
        }

        dispatch({
          type: "LOAD",
          payload: {
            foodEntries: localFood,
            activityEntries: localActivity,
            mealReminders,
            selectedProfileId,
            customCalorieTarget,
          },
        });
      } catch (innerErr) {
        // Absolute worst case: load empty state so the loading overlay doesn't hang
        dispatch({
          type: "LOAD",
          payload: {
            foodEntries: [],
            activityEntries: [],
            mealReminders: defaultReminders,
            selectedProfileId: "standard",
            customCalorieTarget: null,
          },
        });
      }
    }
  }, [isSwitched, activeMemberId]);

  useEffect(() => {
    syncNutritionWithFirebase();
  // Only re-run when the profile identity actually changes, not when the
  // memoized callback itself changes (which would cause a redundant extra call).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSwitched, activeMemberId]);

  // ── Sync Nutrition Food Entries to BioGears Today Events ───────────────────
  // CRITICAL: Use a ref to track the last food IDs we pushed to BioGears so we
  // don't re-trigger on every todayEvents change (which would cause infinite loops).
  const lastSyncedFoodIdsRef = useRef<string>('');

  useEffect(() => {
    if (!state.loaded) return;

    // Build a stable fingerprint of the current food entries and sessions
    const currentFoodFingerprint = state.foodEntries.map(f => f.id).join(',');
    const sessionsFingerprint = (sessions || []).map(s => s?.session_id || '').join(',');
    const fingerprint = `${currentFoodFingerprint}|${sessionsFingerprint}`;

    // Skip if food entries and sessions haven't changed (prevents infinite re-render loop)
    if (fingerprint === lastSyncedFoodIdsRef.current) return;
    lastSyncedFoodIdsRef.current = fingerprint;

    const mealIcons: Record<string, string> = {
      breakfast: "🍳",
      morning_snack: "🍎",
      lunch: "🥪",
      afternoon_snack: "🍪",
      dinner: "🍲",
      evening_snack: "🥛",
      snacks: "🍎",
    };

    // Build a set of all simulated event IDs from sessions to prevent simulated events from returning to the queue
    const simulatedEventIds = new Set<string>();
    if (Array.isArray(sessions)) {
      for (const s of sessions) {
        if (s && Array.isArray(s.events)) {
          for (const ev of s.events) {
            const anyEv = ev as any;
            if (anyEv && anyEv.id) {
              simulatedEventIds.add(anyEv.id);
            }
          }
        }
      }
    }

    const todayStr = getLocalDateString();
    const mappedMealEvents = state.foodEntries
      .filter(fe => fe && fe.id && fe.calories >= 0 && getLocalDateString(fe.timestamp) === todayStr && !simulatedEventIds.has(`food_${fe.id}`))
      .map((fe) => {
        const cal = fe.calories || 0;
        const estimatedCarb    = fe.carbs  || Math.round(cal * 0.40 / 4);
        const estimatedFat     = fe.fat    || Math.round(cal * 0.30 / 9);
        const estimatedProtein = fe.protein || Math.round(cal * 0.30 / 4);

        let timestampMs = Date.now();
        let wallTime = new Date().toTimeString().slice(0, 5);
        try {
          if (fe.timestamp) {
            const d = new Date(fe.timestamp);
            if (!isNaN(d.getTime())) {
              timestampMs = d.getTime();
              wallTime = d.toTimeString().slice(0, 5);
            }
          }
        } catch { /* use defaults */ }

        const displayIcon = mealIcons[fe.mealId] || "🥗";

        return {
          id: `food_${fe.id}`,
          event_type: "meal" as const,
          value: cal,
          timestamp: Math.round(timestampMs / 1000),
          wallTime,
          meal_type: "custom" as const,
          carb_g: estimatedCarb,
          fat_g: estimatedFat,
          protein_g: estimatedProtein,
          displayLabel: fe.foodName || 'Meal',
          displayIcon,
          source: "manual" as const,
          notes: "Synced from nutrition log",
        };
      });

    // Update BioGears events — use functional form cast properly.
    // setTodayEvents in BiogearsTwinContext wraps setTodayEventsWrapped which
    // only accepts RoutineEvent[] (not a functional updater). We must call the
    // non-wrapped version. Since we don't have direct access to the raw state here,
    // we use the context's todayEvents snapshot (safe because we only run when
    // foodEntries change, not when todayEvents change).
    // The ref prevents re-triggering on todayEvents changes.
    setTodayEvents(((prev: any[]) => {
      const nonFoodEvents = prev.filter((ev: any) => !ev.id.startsWith("food_"));
      const newEvents = [...nonFoodEvents, ...mappedMealEvents].sort(
        (a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0)
      );
      log("[NutritionContext] Syncing food entries to BioGears twin:", mappedMealEvents.length, "meals");
      return newEvents;
    }) as any);
  // ⚠️ CRITICAL: DO NOT add todayEvents or setTodayEvents to this dependency array.
  // setTodayEvents is stable (useCallback with empty deps in BiogearsTwinContext).
  // Adding todayEvents would cause an infinite loop.
  }, [state.foodEntries, state.loaded, sessions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist whenever relevant state changes (only for SELF)
  useEffect(() => {
    if (!state.loaded || isSwitched) return;
    AsyncStorage.setItem(
      NUTRITION_DATA_KEY,
      JSON.stringify({
        foodEntries: state.foodEntries,
        selectedProfileId: state.selectedProfileId,
        customCalorieTarget: state.customCalorieTarget,
      })
    ).catch(error);
  }, [state.foodEntries, state.selectedProfileId, state.customCalorieTarget, state.loaded, isSwitched]);

  useEffect(() => {
    if (!state.loaded || isSwitched) return;
    AsyncStorage.setItem(MEAL_REMINDER_KEY, JSON.stringify(state.mealReminders)).catch(error);
  }, [state.mealReminders, state.loaded, isSwitched]);

  useEffect(() => {
    if (!state.loaded || isSwitched) return;
    AsyncStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify(state.activityEntries)).catch(error);
  }, [state.activityEntries, state.loaded, isSwitched]);

  // Persist config to Firestore for switched family members
  useEffect(() => {
    if (!state.loaded || !isSwitched || !activeMemberId || activeMemberId === "self") return;
    setDoc(doc(db, "users", activeMemberId, "nutrition_config", "latest"), {
      selectedProfileId: state.selectedProfileId,
      mealReminders: state.mealReminders,
      customCalorieTarget: state.customCalorieTarget,
    }, { merge: true }).catch(() => {});
  }, [state.selectedProfileId, state.mealReminders, state.customCalorieTarget, state.loaded, isSwitched, activeMemberId]);

  // ── Import Simulated Twin Events to Nutrition/Activity Context ─────────────
  // When a simulation completes, its events are stored in the session meta.
  // We scan the latest session's events and import any simulated meals/exercise
  // that were not already synced from the nutrition log.
  useEffect(() => {
    if (!state.loaded || !sessions || sessions.length === 0) return;

    const latestSession = sessions[0];
    if (!latestSession || !latestSession.events || latestSession.events.length === 0) return;

    // Only process sessions from today to prevent importing historic logs
    const sessionDate = new Date(latestSession.timestamp);
    if (sessionDate.toDateString() !== new Date().toDateString()) return;

    let didUpdate = false;

    for (const rawEvent of latestSession.events) {
      const event = rawEvent as any;
      if (!event.id || !event.timestamp) continue;

      // 🍳 Sync Meals (event_type === 'meal')
      if (event.event_type === 'meal') {
        const originFoodId = event.id.startsWith("food_") ? event.id.replace("food_", "") : null;
        
        const alreadyExists = originFoodId 
          ? state.foodEntries.some(fe => fe.id === originFoodId)
          : state.foodEntries.some(fe => fe.id === `sim_${event.id}`);

        if (!alreadyExists) {
          const simulatedFoodEntry: FoodEntry = {
            id: originFoodId || `sim_${event.id}`,
            mealId: event.meal_type || "lunch",
            foodId: "simulated",
            foodName: event.displayLabel || "Simulated Meal",
            calories: Math.round(event.value || 0),
            protein: Math.round(event.protein_g || 0),
            carbs: Math.round(event.carb_g || 0),
            fat: Math.round(event.fat_g || 0),
            sugar: 0,
            fiber: 0,
            sodium: 0,
            timestamp: new Date(event.timestamp * 1000).toISOString(),
          };

          dispatch({ type: "ADD_ENTRY", payload: simulatedFoodEntry });
          
          const syncTarget = isSwitched && activeMemberId && activeMemberId !== "self" ? activeMemberId : undefined;
          syncAddFoodEntry(simulatedFoodEntry, syncTarget).catch(
            (err: unknown) => log("⚠️ syncAddFoodEntry for simulated meal failed:", err)
          );
          didUpdate = true;
        }
      }

      // 🏃 Sync Exercise (event_type === 'exercise')
      if (event.event_type === 'exercise') {
        const originActivityId = event.id.startsWith("act_") ? event.id : null;

        const alreadyExists = originActivityId
          ? state.activityEntries.some(ae => ae.id === originActivityId)
          : state.activityEntries.some(ae => ae.id === `sim_${event.id}`);

        if (!alreadyExists) {
          const durationMins = Math.round((event.duration_seconds || 1800) / 60);
          const simulatedActivityEntry: ActivityEntry = {
            id: originActivityId || `sim_${event.id}`,
            activityName: event.displayLabel || "Simulated Exercise",
            activityIcon: event.displayIcon || "🏃",
            durationMins,
            intensity: "Moderate",
            caloriesBurned: Math.round(event.value || 0),
            met: 3.5,
            timestamp: new Date(event.timestamp * 1000).toISOString(),
          };

          dispatch({ type: "ADD_ACTIVITY", payload: simulatedActivityEntry });

          const syncTarget = isSwitched && activeMemberId && activeMemberId !== "self" ? activeMemberId : undefined;
          syncAddActivityEntry(simulatedActivityEntry, syncTarget).catch(
            (err: unknown) => log("⚠️ syncAddActivityEntry for simulated exercise failed:", err)
          );
          didUpdate = true;
        }
      }
    }

    if (didUpdate) {
      log("[NutritionContext] Successfully imported simulated twin events into nutrition log");
    }
  }, [sessions, state.loaded]);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const selectedProfile = useMemo(() => {
    const baseProfile = healthProfiles.find((p) => p.id === state.selectedProfileId) ?? healthProfiles[0];
    if (state.customCalorieTarget !== null) {
      const ratio = state.customCalorieTarget / baseProfile.recommendations.calories;
      return {
        ...baseProfile,
        recommendations: {
          calories: state.customCalorieTarget,
          protein: Math.round((baseProfile.recommendations.protein ?? 0) * ratio),
          carbs: Math.round((baseProfile.recommendations.carbs ?? 0) * ratio),
          fat: Math.round((baseProfile.recommendations.fat ?? 0) * ratio),
          sugar: Math.round((baseProfile.recommendations.sugar ?? 0) * ratio),
          sodium: Math.round((baseProfile.recommendations.sodium ?? 0) * ratio),
          fiber: Math.round((baseProfile.recommendations.fiber ?? 0) * ratio),
        },
      };
    }
    return baseProfile;
  }, [state.selectedProfileId, state.customCalorieTarget]);

  const totals = useMemo<NutritionTotals>(() => {
    return state.foodEntries.reduce(
      (acc, e) => ({
        calories: acc.calories + e.calories,
        protein:  acc.protein  + e.protein,
        carbs:    acc.carbs    + e.carbs,
        fat:      acc.fat      + e.fat,
        sugar:    acc.sugar    + e.sugar,
        sodium:   acc.sodium   + e.sodium,
        fiber:    acc.fiber    + e.fiber,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, sodium: 0, fiber: 0 }
    );
  }, [state.foodEntries]);

  const totalActivityCalories = useMemo(
    () => state.activityEntries.reduce((sum, e) => sum + e.caloriesBurned, 0),
    [state.activityEntries]
  );

  const netCalories = useMemo(
    () => Math.max(0, totals.calories - totalActivityCalories),
    [totals.calories, totalActivityCalories]
  );

  // ── Actions ──────────────────────────────────────────────────────────────────
  const addFoodEntry = useCallback(async (entry: Omit<FoodEntry, "id" | "timestamp"> & { timestamp?: string }) => {
    const id = `food_${Date.now()}_${nanoid(8)}`;
    
    let timestamp = entry.timestamp;
    if (!timestamp) {
      timestamp = new Date().toISOString();
    }
    
    const fullEntry: FoodEntry = { ...entry, id, timestamp };

    dispatch({ type: "ADD_ENTRY", payload: fullEntry });

    const syncTarget = isSwitched && activeMemberId && activeMemberId !== "self" ? activeMemberId : undefined;
    await syncAddFoodEntry(fullEntry, syncTarget).catch(
      (err: unknown) => log("⚠️ syncAddFoodEntry failed:", err)
    );
  }, [isSwitched, activeMemberId, state.mealReminders]);

  const removeFoodEntry = useCallback(async (id: string) => {
    dispatch({ type: "REMOVE_ENTRY", payload: id });

    // Track deleted ID for sync tombstoning
    try {
      const raw = await AsyncStorage.getItem(DELETED_FOOD_IDS_KEY);
      const currentDeleted = raw ? JSON.parse(raw) : [];
      if (!currentDeleted.includes(id)) {
        currentDeleted.push(id);
        await AsyncStorage.setItem(DELETED_FOOD_IDS_KEY, JSON.stringify(currentDeleted));
      }
    } catch (err) {
      log("⚠️ Failed to store deleted food ID:", err);
    }

    if (isSwitched && activeMemberId && activeMemberId !== "self") {
      await syncDeleteFoodEntry(id, activeMemberId).catch(() => {});
    } else {
      await syncDeleteFoodEntry(id).catch(() => {});
    }
  }, [isSwitched, activeMemberId]);

  const addActivityEntry = useCallback(async (entry: Omit<ActivityEntry, "id" | "timestamp">) => {
    const id = `act_${Date.now()}_${nanoid(8)}`;
    const timestamp = new Date().toISOString();
    const fullEntry: ActivityEntry = { ...entry, id, timestamp };

    dispatch({ type: "ADD_ACTIVITY", payload: fullEntry });

    const syncTarget = isSwitched && activeMemberId && activeMemberId !== "self" ? activeMemberId : undefined;
    await syncAddActivityEntry(fullEntry, syncTarget).catch(
      (err: unknown) => log("⚠️ syncAddActivityEntry failed:", err)
    );
  }, [isSwitched, activeMemberId]);

  const removeActivityEntry = useCallback(async (id: string) => {
    dispatch({ type: "REMOVE_ACTIVITY", payload: id });

    // Track deleted ID for sync tombstoning
    try {
      const raw = await AsyncStorage.getItem(DELETED_ACTIVITY_IDS_KEY);
      const currentDeleted = raw ? JSON.parse(raw) : [];
      if (!currentDeleted.includes(id)) {
        currentDeleted.push(id);
        await AsyncStorage.setItem(DELETED_ACTIVITY_IDS_KEY, JSON.stringify(currentDeleted));
      }
    } catch (err) {
      log("⚠️ Failed to store deleted activity ID:", err);
    }

    if (isSwitched && activeMemberId && activeMemberId !== "self") {
      await syncDeleteActivityEntry(id, activeMemberId).catch(() => {});
    } else {
      await syncDeleteActivityEntry(id).catch(() => {});
    }
  }, [isSwitched, activeMemberId]);

  const setProfile = useCallback(async (id: HealthProfileId) => {
    dispatch({ type: "SET_PROFILE", payload: id });

    const uid = isSwitched ? activeMemberId : auth.currentUser?.uid;
    if (uid) {
      await setDoc(
        doc(db, "users", uid, "nutrition_config", "latest"),
        { selectedProfileId: id },
        { merge: true }
      ).catch(() => {});
    }
  }, [isSwitched, activeMemberId]);

  const setCustomCalorieTarget = useCallback(async (target: number | null) => {
    dispatch({ type: "SET_CUSTOM_CALORIE_TARGET", payload: target });

    const uid = isSwitched ? activeMemberId : auth.currentUser?.uid;
    if (uid) {
      await setDoc(
        doc(db, "users", uid, "nutrition_config", "latest"),
        { customCalorieTarget: target },
        { merge: true }
      ).catch(() => {});
    }
  }, [isSwitched, activeMemberId]);

  const toggleReminder = useCallback((reminderId: string) => {
    dispatch({ type: "TOGGLE_REMINDER", payload: reminderId });
  }, []);

  const updateReminderTime = useCallback((reminderId: string, time: string) => {
    dispatch({ type: "UPDATE_REMINDER_TIME", payload: { id: reminderId, time } });
  }, []);

  const getMealEntries = useCallback(
    (mealId: string) => state.foodEntries.filter((e) => e.mealId === mealId),
    [state.foodEntries]
  );

  const resetToday = useCallback(async () => {
    dispatch({ type: "RESET_TODAY" });

    // ✅ FIX: Also clear AsyncStorage so ghost data doesn't reload on next cold start
    await Promise.all([
      AsyncStorage.setItem(
        NUTRITION_DATA_KEY,
        JSON.stringify({ foodEntries: [], selectedProfileId: state.selectedProfileId, customCalorieTarget: state.customCalorieTarget })
      ).catch(() => {}),
      AsyncStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify([])).catch(() => {}),
      AsyncStorage.setItem(DELETED_FOOD_IDS_KEY, JSON.stringify([])).catch(() => {}),
      AsyncStorage.setItem(DELETED_ACTIVITY_IDS_KEY, JSON.stringify([])).catch(() => {}),
    ]);

    const currentUser = auth.currentUser;
    const uid = isSwitched && activeMemberId && activeMemberId !== "self" ? activeMemberId : (currentUser?.uid || "self");
    const lastClearedKey = `nutrition_last_cleared_${uid}`;
    await AsyncStorage.setItem(lastClearedKey, new Date().toISOString()).catch(() => {});

    const syncTarget = isSwitched && activeMemberId && activeMemberId !== "self" ? activeMemberId : undefined;
    await syncClearFoodEntries(syncTarget).catch(
      (err: unknown) => log("⚠️ syncClearFoodEntries failed:", err)
    );
    await syncClearActivityEntries(syncTarget).catch(
      (err: unknown) => log("⚠️ syncClearActivityEntries failed:", err)
    );
  }, [isSwitched, activeMemberId, state.selectedProfileId, state.customCalorieTarget]);

  const value = useMemo<NutritionContextType>(
    () => ({
      foodEntries: state.foodEntries,
      activityEntries: state.activityEntries,
      mealReminders: state.mealReminders,
      selectedProfile,
      customCalorieTarget: state.customCalorieTarget,
      totals,
      totalActivityCalories,
      netCalories,
      loaded: state.loaded,
      addFoodEntry,
      removeFoodEntry,
      addActivityEntry,
      removeActivityEntry,
      setProfile,
      setCustomCalorieTarget,
      toggleReminder,
      updateReminderTime,
      getMealEntries,
      resetToday,
      syncNutritionWithFirebase,
    }),
    [state, selectedProfile, totals, totalActivityCalories, netCalories, addFoodEntry, removeFoodEntry, addActivityEntry, removeActivityEntry, setProfile, setCustomCalorieTarget, toggleReminder, updateReminderTime, getMealEntries, resetToday, syncNutritionWithFirebase]
  );

  return <NutritionContext.Provider value={value}>{children}</NutritionContext.Provider>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useNutrition() {
  const ctx = useContext(NutritionContext);
  if (!ctx) throw new Error("useNutrition must be used inside <NutritionProvider>");
  return ctx;
}