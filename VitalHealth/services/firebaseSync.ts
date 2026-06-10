// services/firebaseSync.ts
// ─────────────────────────────────────────────────────────────────
// Firebase Firestore sync for medicines, symptoms and their histories.
// All operations are fire-and-forget — local SQLite/AsyncStorage is
// always the source of truth, Firebase is the cloud backup.
// ─────────────────────────────────────────────────────────────────

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch
} from "firebase/firestore";
import { auth, db } from "./firebase";

// ── Pending sync queue ───────────────────────────────────────────
// Stores failed syncs and retries when auth is ready
const pendingSyncs: Array<() => Promise<void>> = [];

const flushPendingSyncs = async () => {
  if (pendingSyncs.length === 0) return;
  console.log(`🔄 Flushing ${pendingSyncs.length} pending Firebase syncs...`);
  const toFlush = [...pendingSyncs];
  pendingSyncs.length = 0;
  for (const fn of toFlush) {
    try { await fn(); } catch (e) { console.log("⚠️ Pending sync failed:", e); }
  }
};

// Listen for auth state and flush pending syncs when user logs in
auth.onAuthStateChanged((user) => {
  if (user) {
    console.log("🔥 Auth ready — flushing pending syncs for:", user.uid);
    setTimeout(flushPendingSyncs, 1000);
  }
});

// ── Helper — get current user ID ────────────────────────────────
// Checks auth.currentUser first, then waits for auth state,
// then falls back to AsyncStorage cache
export const getUserId = async (): Promise<string | null> => {
  // 1. Check if already logged in
  if (auth.currentUser?.uid) return auth.currentUser.uid;

  // 2. Wait up to 8 seconds for Firebase Auth to restore session
  const uid = await new Promise<string | null>((resolve) => {
    const unsub = auth.onAuthStateChanged((user) => {
      unsub();
      resolve(user?.uid ?? null);
    });
    setTimeout(() => resolve(null), 8000);
  });

  if (uid) return uid;

  // 3. Fallback — read cached uid from AsyncStorage
  try {
    const cached = await AsyncStorage.getItem("@firebase_auth_user");
    if (cached) {
      const parsed = JSON.parse(cached);
      console.log("🔑 Using cached auth uid:", parsed.uid);
      return parsed.uid ?? null;
    }
  } catch (e) {
    console.log("⚠️ AsyncStorage auth cache read error:", e);
  }

  return null;
};

// ── Collection paths ──────────────────────────────────────────────
const medicinesCol     = (uid: string) => collection(db, "users", uid, "medicines");
const medicineHistCol  = (uid: string) => collection(db, "users", uid, "medicineHistory");
const symptomsCol      = (uid: string) => collection(db, "users", uid, "symptoms");
const symptomHistCol   = (uid: string) => collection(db, "users", uid, "symptomHistory");

// ─────────────────────────────────────────────────────────────────
// 💊 MEDICINE SYNC
// ─────────────────────────────────────────────────────────────────

/**
 * Save a new medicine to Firebase when user adds it.
 * Uses SQLite id as the Firestore document ID for easy lookup.
 */
export async function syncAddMedicine(
  medicine: {
    id:             number;
    name:           string;
    dose:           string;
    type:           string;
    time:           string;
    timestamp:      number;
    meal:           string;
    frequency:      string;
    startDate:      string;
    endDate:        string;
    reminder:       number;
    notificationId: string | null;
  },
  targetUid?: string
): Promise<void> {
  try {
    const uid = targetUid || await getUserId();
    if (!uid) { console.log("⚠️ No auth user for syncAddMedicine"); return; }

    await setDoc(doc(medicinesCol(uid), String(medicine.id)), {
      ...medicine,
      createdAt:   serverTimestamp(),
      updatedAt:   serverTimestamp(),
      takenToday:  false,
    });

    console.log("✅ Medicine synced to Firebase:", medicine.name);
  } catch (e) {
    console.log("⚠️ syncAddMedicine failed (non-critical):", e);
  }
}

/**
 * Delete a medicine from Firebase when user removes it.
 */
export async function syncDeleteMedicine(id: number, targetUid?: string): Promise<void> {
  try {
    const uid = targetUid || await getUserId();
    if (!uid) return;

    await deleteDoc(doc(medicinesCol(uid), String(id)));
    console.log("✅ Medicine deleted from Firebase:", id);
  } catch (e) {
    console.log("⚠️ syncDeleteMedicine failed (non-critical):", e);
  }
}

/**
 * Delete all medicines from Firebase.
 */
export async function syncDeleteAllMedicines(targetUid?: string): Promise<void> {
  try {
    const uid = targetUid || await getUserId();
    if (!uid) return;

    const querySnap = await getDocs(medicinesCol(uid));
    if (querySnap.empty) return;

    const batch = writeBatch(db);
    querySnap.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });
    await batch.commit();
    console.log("✅ All medicines deleted from Firebase");
  } catch (e) {
    console.log("⚠️ syncDeleteAllMedicines failed (non-critical):", e);
  }
}

/**
 * Mark medicine as taken in Firebase.
 */
export async function syncMarkMedicineTaken(id: number, targetUid?: string): Promise<void> {
  try {
    const uid = targetUid || await getUserId();
    if (!uid) return;

    await setDoc(doc(medicinesCol(uid), String(id)), {
      takenToday: true,
      takenAt:    serverTimestamp(),
      updatedAt:  serverTimestamp(),
    }, { merge: true });

    console.log("✅ Medicine marked taken in Firebase:", id);
  } catch (e) {
    console.log("⚠️ syncMarkMedicineTaken failed (non-critical):", e);
  }
}

/**
 * Update notificationId in Firebase after scheduling.
 */
export async function syncUpdateMedicineNotificationId(
  id: number,
  notificationId: string,
  targetUid?: string
): Promise<void> {
  try {
    const uid = targetUid || await getUserId();
    if (!uid) return;

    await setDoc(doc(medicinesCol(uid), String(id)), {
      notificationId,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (e) {
    console.log("⚠️ syncUpdateMedicineNotificationId failed (non-critical):", e);
  }
}

// ─────────────────────────────────────────────────────────────────
// 💊 MEDICINE HISTORY SYNC
// ─────────────────────────────────────────────────────────────────

/**
 * Add a medicine history entry to Firebase (taken/missed/snoozed).
 */
export async function syncAddMedicineHistory(entry: {
  id:           string;
  medicineId:   number;
  medicineName: string;
  dose:         string;
  time:         string;
  status:       string;
  date:         string;
  takenAt:      string;
}): Promise<void> {
  try {
    const uid = await getUserId();
    if (!uid) return;

    await setDoc(doc(medicineHistCol(uid), entry.id), {
      ...entry,
      syncedAt: serverTimestamp(),
    });

    console.log("✅ Medicine history synced to Firebase:", entry.medicineName, entry.status);
  } catch (e) {
    console.log("⚠️ syncAddMedicineHistory failed (non-critical):", e);
  }
}

/**
 * Fetch all medicine history from Firebase.
 * Called when loading history page on a new device.
 */
export async function fetchMedicineHistoryFromFirebase(): Promise<any[]> {
  try {
    const uid = await getUserId();
    if (!uid) return [];

    const snap = await getDocs(medicineHistCol(uid));
    const results = snap.docs.map(d => d.data());
    console.log("✅ Fetched medicine history from Firebase:", results.length, "records");
    return results;
  } catch (e) {
    console.log("⚠️ fetchMedicineHistoryFromFirebase failed:", e);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────
// 🩺 SYMPTOM SYNC
// ─────────────────────────────────────────────────────────────────

/**
 * Save a new symptom to Firebase when user logs it.
 * Uses symptom id (timestamp) as the Firestore document ID.
 */
export async function syncAddSymptom(
  symptom: {
    id:              number;
    name:            string;
    severity:        string;
    startedAt:       number;
    notes?:          string;
    followUpMinutes?: number;
    followUpAnswers?: string;
  },
  targetUid?: string
): Promise<void> {
  console.log("🔄 syncAddSymptom called:", symptom.name, "id:", symptom.id, "target:", targetUid);
  try {
    const uid = targetUid || await getUserId();
    console.log("🔑 syncAddSymptom uid:", uid ?? "NULL");

    if (!uid) {
      console.log("⚠️ No auth — queuing symptom:", symptom.name);
      pendingSyncs.push(() => syncAddSymptom(symptom, targetUid));
      return;
    }

    const path = `users/${uid}/symptoms/${String(symptom.id)}`;
    console.log("📝 Writing to Firestore:", path);

    await setDoc(doc(symptomsCol(uid), String(symptom.id)), {
      ...symptom,
      active:    true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    console.log("✅ Symptom synced to Firebase:", symptom.name);
  } catch (e: any) {
    console.log("❌ syncAddSymptom FAILED:", e?.code, e?.message ?? e);
    pendingSyncs.push(() => syncAddSymptom(symptom, targetUid));
  }
}

/**
 * Mark symptom as resolved in Firebase.
 */
export async function syncResolveSymptom(
  id: number,
  resolvedAt: number,
  duration: number,
  targetUid?: string
): Promise<void> {
  try {
    const uid = targetUid || await getUserId();

    if (!uid) {
      // ✅ queue retry (IMPORTANT)
      pendingSyncs.push(() => syncResolveSymptom(id, resolvedAt, duration, targetUid));
      return;
    }

    const symptomRef = doc(symptomsCol(uid), String(id));

    // ✅ fetch ONLY this symptom (efficient)
    const snap = await getDoc(symptomRef);

    if (!snap.exists()) {
      console.log("⚠️ Symptom not found:", id);
      return;
    }

    const existing = snap.data();

    // 🔹 Step 2: Add to HISTORY collection
    await setDoc(
      doc(symptomHistCol(uid), String(id)),
      {
        ...existing,
        active: false,
        resolvedAt,
        duration,
        syncedAt: serverTimestamp(),
      },
      { merge: true } // ✅ safer
    );

    // 🔹 Step 3: DELETE from ACTIVE collection
    try {
      await deleteDoc(symptomRef);
    } catch (e) {
      console.log("⚠️ Delete failed, retrying later:", e);
      pendingSyncs.push(() => syncResolveSymptom(id, resolvedAt, duration, targetUid));
    }

    console.log("🔥 Removed from active + added to history:", id);
  } catch (e) {
    console.log("⚠️ syncResolveSymptom failed:", e);

    // ✅ retry later
    pendingSyncs.push(() => syncResolveSymptom(id, resolvedAt, duration, targetUid));
  }
}

/**
 * Delete a symptom from Firebase.
 */
export async function syncDeleteSymptom(id: number, targetUid?: string): Promise<void> {
  try {
    const uid = targetUid || await getUserId();
    if (!uid) return;

    await deleteDoc(doc(symptomsCol(uid), String(id)));
    console.log("✅ Symptom deleted from Firebase:", id);
  } catch (e) {
    console.log("⚠️ syncDeleteSymptom failed (non-critical):", e);
  }
}

/**
 * Update symptom fields in Firebase.
 */
export async function syncUpdateSymptom(
  id:      number,
  updates: Record<string, any>,
  targetUid?: string
): Promise<void> {
  try {
    const uid = targetUid || await getUserId();
    if (!uid) return;

    // ✅ Use setDoc with merge so it works even if document doesn't exist
    await setDoc(doc(symptomsCol(uid), String(id)), {
      ...updates,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    console.log("✅ Symptom updated in Firebase:", id);
  } catch (e) {
    console.log("⚠️ syncUpdateSymptom failed (non-critical):", e);
  }
}

// ─────────────────────────────────────────────────────────────────
// 🩺 SYMPTOM HISTORY SYNC
// ─────────────────────────────────────────────────────────────────

/**
 * Save resolved symptom to symptom history in Firebase.
 */
export async function syncAddSymptomHistory(
  symptom: {
    id:              number;
    name:            string;
    severity:        string;
    startedAt:       number;
    resolvedAt:      number;
    duration:        number;
    notes?:          string;
    followUpAnswers?: string;
  },
  targetUid?: string
): Promise<void> {
  try {
    const uid = targetUid || await getUserId();
    if (!uid) return;

    await setDoc(doc(symptomHistCol(uid), String(symptom.id)), {
      ...symptom,
      syncedAt: serverTimestamp(),
    });

    console.log("✅ Symptom history synced to Firebase:", symptom.name);
  } catch (e) {
    console.log("⚠️ syncAddSymptomHistory failed (non-critical):", e);
  }
}

/**
 * Fetch all symptoms from Firebase.
 * Used when app loads on a new device to restore data.
 */
export async function fetchSymptomsFromFirebase(uid?: string): Promise<any[]> {
  try {
    const userId = uid || await getUserId();
    if (!userId) return [];

    const snap = await getDocs(symptomsCol(userId));
    return snap.docs.map(d => d.data());
  } catch (e) {
    console.log("⚠️ fetchSymptomsFromFirebase failed:", e);
    return [];
  }
}

export async function fetchSymptomsFromFirebaseForUser(uid: string): Promise<any[]> {
  return fetchSymptomsFromFirebase(uid);
}

/**
 * Fetch symptom history from Firebase.
 * Used when loading history on a new device.
 */
export async function fetchSymptomHistoryFromFirebase(uid?: string): Promise<any[]> {
  try {
    const userId = uid || await getUserId();
    if (!userId) return [];

    const snap = await getDocs(symptomHistCol(userId));
    return snap.docs.map(d => d.data());
  } catch (e) {
    console.log("⚠️ fetchSymptomHistoryFromFirebase failed:", e);
    return [];
  }
}

export async function fetchSymptomHistoryFromFirebaseForUser(uid: string): Promise<any[]> {
  return fetchSymptomHistoryFromFirebase(uid);
}

/**
 * Fetch all medicines from Firebase.
 * Used when restoring data on a new device.
 */
export async function fetchMedicinesFromFirebase(uid?: string): Promise<any[]> {
  try {
    const userId = uid || await getUserId();
    if (!userId) return [];

    const snap = await getDocs(medicinesCol(userId));
    return snap.docs.map(d => d.data());
  } catch (e) {
    console.log("⚠️ fetchMedicinesFromFirebase failed:", e);
    return [];
  }
}

export async function fetchMedicinesFromFirebaseForUser(uid: string): Promise<any[]> {
  return fetchMedicinesFromFirebase(uid);
}

// ─────────────────────────────────────────────────────────────────
// 💧 HYDRATION SYNC
// ─────────────────────────────────────────────────────────────────
const hydrationCol = (uid: string) => collection(db, "users", uid, "hydration");

export async function syncAddHydration(
  entry: {
    id: number;
    amount: number;
    total: number;
    timestamp: number;
    source: string;
  },
  targetUid?: string
): Promise<void> {
  try {
    const uid = targetUid || await getUserId();
    if (!uid) return;
    await setDoc(doc(hydrationCol(uid), String(entry.timestamp)), {
      ...entry,
      syncedAt: serverTimestamp(),
    });
    console.log(`✅ Hydration synced to Firebase: +${entry.amount}ml`);
  } catch (e) {
    console.log("⚠️ syncAddHydration failed:", e);
  }
}

export async function syncClearHydration(targetUid?: string): Promise<void> {
  try {
    const uid = targetUid || await getUserId();
    if (!uid) return;
    const snap = await getDocs(hydrationCol(uid));
    const batch = writeBatch(db);
    snap.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    console.log("✅ Hydration cleared in Firebase");
  } catch (e) {
    console.log("⚠️ syncClearHydration failed:", e);
  }
}

export async function fetchHydrationFromFirebase(uid?: string): Promise<any[]> {
  try {
    const userId = uid || await getUserId();
    if (!userId) return [];
    const snap = await getDocs(hydrationCol(userId));
    return snap.docs.map(d => d.data());
  } catch (e) {
    console.log("⚠️ fetchHydrationFromFirebase failed:", e);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────
// 🍽️ NUTRITION SYNC
// ─────────────────────────────────────────────────────────────────
const nutritionCol = (uid: string) => collection(db, "users", uid, "nutrition");

export async function syncAddFoodEntry(
  entry: {
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
    timestamp: string;
  },
  targetUid?: string
): Promise<void> {
  try {
    const uid = targetUid || await getUserId();
    if (!uid) return;
    await setDoc(doc(nutritionCol(uid), entry.id), {
      ...entry,
      syncedAt: serverTimestamp(),
    });
    console.log(`✅ Food entry synced to Firebase: ${entry.foodName}`);
  } catch (e) {
    console.log("⚠️ syncAddFoodEntry failed:", e);
  }
}

export async function syncDeleteFoodEntry(id: string, targetUid?: string): Promise<void> {
  try {
    const uid = targetUid || await getUserId();
    if (!uid) return;
    await deleteDoc(doc(nutritionCol(uid), id));
    console.log(`✅ Food entry deleted from Firebase: ${id}`);
  } catch (e) {
    console.log("⚠️ syncDeleteFoodEntry failed:", e);
  }
}

export async function syncClearFoodEntries(targetUid?: string): Promise<void> {
  try {
    const uid = targetUid || await getUserId();
    if (!uid) return;
    const snap = await getDocs(nutritionCol(uid));
    const batch = writeBatch(db);
    snap.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    console.log("✅ All food entries cleared in Firebase");
  } catch (e) {
    console.log("⚠️ syncClearFoodEntries failed:", e);
  }
}

export async function fetchFoodEntriesFromFirebase(uid?: string): Promise<any[]> {
  try {
    const userId = uid || await getUserId();
    if (!userId) return [];
    const snap = await getDocs(nutritionCol(userId));
    return snap.docs.map(d => d.data());
  } catch (e) {
    console.log("⚠️ fetchFoodEntriesFromFirebase failed:", e);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────
// 💪 ACTIVITY/EXERCISE SYNC
// ─────────────────────────────────────────────────────────────────
const activityCol = (uid: string) => collection(db, "users", uid, "activity");

export async function syncAddActivityEntry(
  entry: {
    id: string;
    activityName: string;
    activityIcon: string;
    durationMins: number;
    intensity: string;
    caloriesBurned: number;
    met: number;
    timestamp: string;
  },
  targetUid?: string
): Promise<void> {
  try {
    const uid = targetUid || await getUserId();
    if (!uid) return;
    await setDoc(doc(activityCol(uid), entry.id), {
      ...entry,
      syncedAt: serverTimestamp(),
    });
    console.log(`✅ Activity entry synced to Firebase: ${entry.activityName}`);
  } catch (e) {
    console.log("⚠️ syncAddActivityEntry failed:", e);
  }
}

export async function syncDeleteActivityEntry(id: string, targetUid?: string): Promise<void> {
  try {
    const uid = targetUid || await getUserId();
    if (!uid) return;
    await deleteDoc(doc(activityCol(uid), id));
    console.log(`✅ Activity entry deleted from Firebase: ${id}`);
  } catch (e) {
    console.log("⚠️ syncDeleteActivityEntry failed:", e);
  }
}

export async function syncClearActivityEntries(targetUid?: string): Promise<void> {
  try {
    const uid = targetUid || await getUserId();
    if (!uid) return;
    const snap = await getDocs(activityCol(uid));
    const batch = writeBatch(db);
    snap.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    console.log("✅ All activity entries cleared in Firebase");
  } catch (e) {
    console.log("⚠️ syncClearActivityEntries failed:", e);
  }
}

export async function fetchActivityEntriesFromFirebase(uid?: string): Promise<any[]> {
  try {
    const userId = uid || await getUserId();
    if (!userId) return [];
    const snap = await getDocs(activityCol(userId));
    return snap.docs.map(d => d.data());
  } catch (e) {
    console.log("⚠️ fetchActivityEntriesFromFirebase failed:", e);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────
// 🚶 STEPS SYNC
// ─────────────────────────────────────────────────────────────────
const stepsCol = (uid: string) => collection(db, "users", uid, "steps");

export async function syncStepsData(
  data: {
    steps: number;
    goal: number;
    isTracking: boolean;
    lastMoveTs: number;
    date: string;
  },
  targetUid?: string
): Promise<void> {
  try {
    const uid = targetUid || await getUserId();
    if (!uid) return;
    await setDoc(doc(stepsCol(uid), data.date), {
      ...data,
      syncedAt: serverTimestamp(),
    });
    console.log(`✅ Steps synced to Firebase: ${data.steps} steps`);
  } catch (e) {
    console.log("⚠️ syncStepsData failed:", e);
  }
}

export async function fetchStepsDataFromFirebase(date: string, uid?: string): Promise<any | null> {
  try {
    const userId = uid || await getUserId();
    if (!userId) return null;
    const snap = await getDoc(doc(stepsCol(userId), date));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.log("⚠️ fetchStepsDataFromFirebase failed:", e);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────
// 🧬 BIOGEARS ANALYTICS CACHE SYNC
// ─────────────────────────────────────────────────────────────────
const biogearsCol = (uid: string) => collection(db, "users", uid, "biogears_analytics");

export async function syncBiogearsAnalytics(analytics: any, targetUid?: string): Promise<void> {
  try {
    const uid = targetUid || await getUserId();
    if (!uid) return;
    await setDoc(doc(biogearsCol(uid), "latest"), {
      ...analytics,
      updatedAt: serverTimestamp(),
    });
    console.log("✅ BioGears analytics cached in Firestore");
  } catch (e) {
    console.log("⚠️ syncBiogearsAnalytics failed:", e);
  }
}

export async function fetchBiogearsAnalyticsFromFirebase(uid?: string): Promise<any | null> {
  try {
    const userId = uid || await getUserId();
    if (!userId) return null;
    const snap = await getDoc(doc(biogearsCol(userId), "latest"));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.log("⚠️ fetchBiogearsAnalyticsFromFirebase failed:", e);
    return null;
  }
}