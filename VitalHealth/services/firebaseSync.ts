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

import { log } from "../utils/logger";

// ── Pending sync queue ───────────────────────────────────────────
// Stores failed syncs and retries when auth is ready or with exponential backoff.
// ✅ Module-level design: intentional singleton — survives component unmounts.
const pendingSyncs: Array<() => Promise<void>> = [];
let isFlushing = false; // Re-entrancy guard

const scheduleRetry = (fn: () => Promise<void>, retryCount: number) => {
  const baseDelay = 1000; // 1 second
  const maxDelay = 30000; // 30 seconds max delay
  const delay = Math.min(maxDelay, Math.pow(2, retryCount) * baseDelay + Math.random() * 1000);
  log(`⏳ [firebaseSync] Scheduling retry #${retryCount} in ${Math.round(delay)}ms...`);
  setTimeout(() => {
    pendingSyncs.push(fn);
    flushPendingSyncs();
  }, delay);
};

const flushPendingSyncs = async () => {
  // Guard: don't re-enter if a flush is already in progress
  // (prevents duplicate syncs if auth fires multiple times rapidly)
  if (isFlushing || pendingSyncs.length === 0) return;
  isFlushing = true;
  log(`🔄 Flushing ${pendingSyncs.length} pending Firebase syncs...`);
  // Capture current queue before draining — any new pushes during the flush
  // (e.g. syncAddSymptom re-queuing itself on failure) will not be in toFlush
  // and will be picked up in the NEXT flush cycle.
  const toFlush = pendingSyncs.splice(0, pendingSyncs.length);
  for (const fn of toFlush) {
    try { await fn(); } catch (e) { log("⚠️ Pending sync failed:", e); }
  }
  isFlushing = false;
};

// Listen for auth state and flush pending syncs when user logs in.
// Guard: only flush once per unique uid to avoid re-flushing on token refresh.
let lastFlushedForUid: string | null = null;
auth.onAuthStateChanged((user) => {
  if (user && user.uid !== lastFlushedForUid) {
    lastFlushedForUid = user.uid;
    log("🔥 Auth ready — flushing pending syncs for:", user.uid);
    setTimeout(flushPendingSyncs, 1000);
  }
  if (!user) {
    // User logged out — reset the uid guard so next login triggers a fresh flush
    lastFlushedForUid = null;
  }
});

// ── Data Sharing Permission Checks ──────────────────────────────────
export const isVitalsSyncEnabled = async (): Promise<boolean> => {
  try {
    const val = await AsyncStorage.getItem("@data_share_vitals");
    return val === null ? true : val === "true"; // Default to true
  } catch {
    return true;
  }
};

export const isBiometricSyncEnabled = async (): Promise<boolean> => {
  try {
    const val = await AsyncStorage.getItem("@data_share_biometric");
    return val === null ? false : val === "true"; // Default to false
  } catch {
    return false;
  }
};

// ── Helper — get current user ID ────────────────────────────────
// Checks auth.currentUser first, then waits for auth state,
// then falls back to AsyncStorage cache.
//
// ✅ FIX (cold-start race): `onAuthStateChanged` fires once immediately
//    with `null` if Firebase hasn't restored the persisted session yet.
//    The old code called unsub() on that first null and returned null —
//    dropping all syncs from the first ~300ms of app startup.
//    Fix: ignore the first null-only emission during a brief window and
//    wait for a real user to appear before giving up.
export const getUserId = async (): Promise<string | null> => {
  // 1. Check if already logged in (fast path — no async needed)
  if (auth.currentUser?.uid) return auth.currentUser.uid;

  // 2. Wait up to 8 seconds for Firebase Auth to restore session.
  //    IMPORTANT: skip the initial null emission that fires synchronously
  //    before the persisted session has been read from disk.
  const uid = await new Promise<string | null>((resolve) => {
    let timer: any = null;
    let firstEmission = true;

    const unsub = auth.onAuthStateChanged((user) => {
      // The very first callback fires synchronously with null during cold start.
      // Give Firebase a beat to rehydrate before treating null as "logged out".
      if (firstEmission && !user) {
        firstEmission = false;
        // Don't unsub yet — wait for the real auth state
        return;
      }
      firstEmission = false;

      if (timer) clearTimeout(timer);
      unsub();
      resolve(user?.uid ?? null);
    });

    // Fallback timeout: if auth never fires a confirmed state, give up after 8s
    timer = setTimeout(() => {
      unsub();
      resolve(null);
    }, 8000);
  });

  if (uid) return uid;

  // 3. Fallback — read cached uid from AsyncStorage
  try {
    const cached = await AsyncStorage.getItem("@firebase_auth_user");
    if (cached) {
      let parsed: any = null;
      try { parsed = JSON.parse(cached); } catch { return null; }
      if (parsed && parsed.uid) { log('🔑 Using cached auth uid:', parsed.uid); return parsed.uid; }
      return null;
    }
  } catch (e) {
    log("⚠️ AsyncStorage auth cache read error:", e);
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
  if (!(await isVitalsSyncEnabled())) return;
  try {
    const uid = targetUid || await getUserId();
    if (!uid) { log("⚠️ No auth user for syncAddMedicine"); return; }

    await setDoc(doc(medicinesCol(uid), String(medicine.id)), {
      ...medicine,
      createdAt:   serverTimestamp(),
      updatedAt:   serverTimestamp(),
      takenToday:  false,
    });

    log("✅ Medicine synced to Firebase:", medicine.name);
  } catch (e) {
    log("⚠️ syncAddMedicine failed (non-critical):", e);
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
    log("✅ Medicine deleted from Firebase:", id);
  } catch (e) {
    log("⚠️ syncDeleteMedicine failed (non-critical):", e);
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
    log("✅ All medicines deleted from Firebase");
  } catch (e) {
    log("⚠️ syncDeleteAllMedicines failed (non-critical):", e);
  }
}

/**
 * Mark medicine as taken in Firebase.
 */
export async function syncMarkMedicineTaken(id: number, targetUid?: string): Promise<void> {
  return syncUpdateMedicineStatus(id, "taken", targetUid);
}

/**
 * Update medicine status in Firebase.
 */
export async function syncUpdateMedicineStatus(
  id: number,
  status: "taken" | "missed" | "pending",
  targetUid?: string
): Promise<void> {
  if (!(await isVitalsSyncEnabled())) return;
  try {
    const uid = targetUid || await getUserId();
    if (!uid) return;

    let updates: any = {
      updatedAt: serverTimestamp(),
    };

    if (status === "taken") {
      updates.takenToday = true;
      updates.taken = 1;
      updates.takenDate = new Date().toISOString().split("T")[0];
      updates.takenAt = serverTimestamp();
    } else if (status === "missed") {
      updates.takenToday = false;
      updates.taken = -1;
      updates.takenDate = new Date().toISOString().split("T")[0];
      updates.takenAt = null;
    } else {
      updates.takenToday = false;
      updates.taken = 0;
      updates.takenDate = null;
      updates.takenAt = null;
    }

    await setDoc(doc(medicinesCol(uid), String(id)), updates, { merge: true });
    log(`✅ Medicine status updated in Firebase (${status}):`, id);
  } catch (e) {
    log(`⚠️ syncUpdateMedicineStatus (${status}) failed (non-critical):`, e);
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
    log("⚠️ syncUpdateMedicineNotificationId failed (non-critical):", e);
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
}, targetUid?: string): Promise<void> {
  if (!(await isVitalsSyncEnabled())) return;
  try {
    const uid = targetUid || await getUserId();
    if (!uid) return;

    await setDoc(doc(medicineHistCol(uid), entry.id), {
      ...entry,
      syncedAt: serverTimestamp(),
    });

    log("✅ Medicine history synced to Firebase:", entry.medicineName, entry.status);
  } catch (e) {
    log("⚠️ syncAddMedicineHistory failed (non-critical):", e);
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
    log("✅ Fetched medicine history from Firebase:", results.length, "records");
    return results;
  } catch (e) {
    log("⚠️ fetchMedicineHistoryFromFirebase failed:", e);
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
  targetUid?: string,
  retryCount: number = 0
): Promise<void> {
  if (!(await isVitalsSyncEnabled())) return;
  log("🔄 syncAddSymptom called:", symptom.name, "id:", symptom.id, "target:", targetUid, "retryCount:", retryCount);
  try {
    const uid = targetUid || await getUserId();
    log("🔑 syncAddSymptom uid:", uid ?? "NULL");

    if (!uid) {
      log("⚠️ No auth — queuing symptom:", symptom.name);
      if (retryCount < 5) {
        pendingSyncs.push(() => syncAddSymptom(symptom, targetUid, retryCount + 1));
      } else {
        log("🛑 syncAddSymptom retry limit reached (5 attempts). Dropping pending sync.");
      }
      return;
    }

    const path = `users/${uid}/symptoms/${String(symptom.id)}`;
    log("📝 Writing to Firestore:", path);

    await setDoc(doc(symptomsCol(uid), String(symptom.id)), {
      ...symptom,
      active:    true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    log("✅ Symptom synced to Firebase:", symptom.name);
  } catch (e: any) {
    log("❌ syncAddSymptom FAILED:", e?.code, e?.message ?? e);
    if (retryCount < 5) {
      scheduleRetry(() => syncAddSymptom(symptom, targetUid, retryCount + 1), retryCount + 1);
    } else {
      log("🛑 syncAddSymptom retry limit reached (5 attempts). Dropping pending sync.");
    }
  }
}

/**
 * Mark symptom as resolved in Firebase.
 */
export async function syncResolveSymptom(
  id: number,
  resolvedAt: number,
  duration: number,
  targetUid?: string,
  retryCount: number = 0
): Promise<void> {
  if (!(await isVitalsSyncEnabled())) return;
  try {
    const uid = targetUid || await getUserId();

    if (!uid) {
      // ✅ queue retry (IMPORTANT)
      if (retryCount < 5) {
        pendingSyncs.push(() => syncResolveSymptom(id, resolvedAt, duration, targetUid, retryCount + 1));
      } else {
        log("🛑 syncResolveSymptom retry limit reached (5 attempts). Dropping pending sync.");
      }
      return;
    }

    const symptomRef = doc(symptomsCol(uid), String(id));

    // ✅ fetch ONLY this symptom (efficient)
    const snap = await getDoc(symptomRef);

    if (!snap.exists()) {
      log("⚠️ Symptom not found:", id);
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
      log("⚠️ Delete failed, retrying later:", e);
      if (retryCount < 5) {
        scheduleRetry(() => syncResolveSymptom(id, resolvedAt, duration, targetUid, retryCount + 1), retryCount + 1);
      } else {
        log("🛑 syncResolveSymptom retry limit reached (5 attempts). Dropping pending sync.");
      }
    }

    log("🔥 Removed from active + added to history:", id);
  } catch (e) {
    log("⚠️ syncResolveSymptom failed:", e);

    // ✅ retry later
    if (retryCount < 5) {
      scheduleRetry(() => syncResolveSymptom(id, resolvedAt, duration, targetUid, retryCount + 1), retryCount + 1);
    } else {
      log("🛑 syncResolveSymptom retry limit reached (5 attempts). Dropping pending sync.");
    }
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
    log("✅ Symptom deleted from Firebase:", id);
  } catch (e) {
    log("⚠️ syncDeleteSymptom failed (non-critical):", e);
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
  if (!(await isVitalsSyncEnabled())) return;
  try {
    const uid = targetUid || await getUserId();
    if (!uid) return;

    // ✅ Use setDoc with merge so it works even if document doesn't exist
    await setDoc(doc(symptomsCol(uid), String(id)), {
      ...updates,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    log("✅ Symptom updated in Firebase:", id);
  } catch (e) {
    log("⚠️ syncUpdateSymptom failed (non-critical):", e);
  }
}

/**
 * Batch-delete all documents from the current user's symptomHistory sub-collection.
 * Called by SymptomContext.clearHistory() so that cleared history does NOT bleed
 * back on the next Firebase → local merge/refresh.
 */
export async function syncClearSymptomHistory(targetUid?: string): Promise<void> {
  try {
    const uid = targetUid || await getUserId();
    if (!uid) return;

    const snap = await getDocs(symptomHistCol(uid));
    if (snap.empty) return;

    const batch = writeBatch(db);
    snap.forEach((docSnap) => { batch.delete(docSnap.ref); });
    await batch.commit();
    log("✅ Symptom history cleared from Firebase");
  } catch (e) {
    log("⚠️ syncClearSymptomHistory failed (non-critical):", e);
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
  if (!(await isVitalsSyncEnabled())) return;
  try {
    const uid = targetUid || await getUserId();
    if (!uid) return;

    await setDoc(doc(symptomHistCol(uid), String(symptom.id)), {
      ...symptom,
      syncedAt: serverTimestamp(),
    });

    log("✅ Symptom history synced to Firebase:", symptom.name);
  } catch (e) {
    log("⚠️ syncAddSymptomHistory failed (non-critical):", e);
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
    log("⚠️ fetchSymptomsFromFirebase failed:", e);
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
    log("⚠️ fetchSymptomHistoryFromFirebase failed:", e);
    return [];
  }
}

export async function fetchSymptomHistoryFromFirebaseForUser(uid: string): Promise<any[]> {
  return fetchSymptomHistoryFromFirebase(uid);
}

function normalizeDateToString(val: any): string {
  if (!val) return "";
  if (val === "ongoing") return "ongoing";
  if (typeof val === "object") {
    let d: Date | null = null;
    if (typeof val.toDate === "function") {
      d = val.toDate();
    } else if (val.seconds) {
      d = new Date(val.seconds * 1000);
    } else {
      d = new Date(val);
    }
    if (d && !isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
  }
  if (typeof val === "string") {
    if (val.includes("T")) {
      return val.split("T")[0];
    }
    return val;
  }
  return String(val);
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
    return snap.docs.map(d => {
      const data = d.data();
      return {
        ...data,
        startDate: normalizeDateToString(data.startDate),
        endDate:   normalizeDateToString(data.endDate),
        takenDate: data.takenDate ? normalizeDateToString(data.takenDate) : null,
      };
    });
  } catch (e) {
    log("⚠️ fetchMedicinesFromFirebase failed:", e);
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
  if (!(await isVitalsSyncEnabled())) return;
  try {
    const uid = targetUid || await getUserId();
    if (!uid) return;
    await setDoc(doc(hydrationCol(uid), String(entry.timestamp)), {
      ...entry,
      syncedAt: serverTimestamp(),
    });
    log(`✅ Hydration synced to Firebase: +${entry.amount}ml`);
  } catch (e) {
    log("⚠️ syncAddHydration failed:", e);
  }
}

export async function syncDeleteHydrationEntry(timestamp: number, targetUid?: string): Promise<void> {
  if (!(await isVitalsSyncEnabled())) return;
  try {
    const uid = targetUid || await getUserId();
    if (!uid) return;
    const docRef = doc(hydrationCol(uid), String(timestamp));
    await deleteDoc(docRef);
    log(`✅ Hydration entry deleted from Firebase for timestamp: ${timestamp}`);
  } catch (e) {
    log("⚠️ syncDeleteHydrationEntry failed:", e);
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
    log("✅ Hydration cleared in Firebase");
  } catch (e) {
    log("⚠️ syncClearHydration failed:", e);
  }
}

export async function fetchHydrationFromFirebase(uid?: string): Promise<any[]> {
  try {
    const userId = uid || await getUserId();
    if (!userId) return [];
    const snap = await getDocs(hydrationCol(userId));
    return snap.docs.map(d => d.data());
  } catch (e) {
    log("⚠️ fetchHydrationFromFirebase failed:", e);
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
  targetUid?: string,
  retryCount: number = 0
): Promise<void> {
  if (!(await isVitalsSyncEnabled())) return;
  try {
    const uid = targetUid || await getUserId();
    if (!uid) {
      if (retryCount < 5) {
        pendingSyncs.push(() => syncAddFoodEntry(entry, targetUid, retryCount + 1));
      }
      return;
    }
    await setDoc(doc(nutritionCol(uid), entry.id), {
      ...entry,
      syncedAt: serverTimestamp(),
    });
    log(`✅ Food entry synced to Firebase: ${entry.foodName}`);
  } catch (e) {
    log("⚠️ syncAddFoodEntry failed:", e);
    if (retryCount < 5) {
      scheduleRetry(() => syncAddFoodEntry(entry, targetUid, retryCount + 1), retryCount + 1);
    }
  }
}

export async function syncDeleteFoodEntry(id: string, targetUid?: string, retryCount: number = 0): Promise<void> {
  if (!(await isVitalsSyncEnabled())) return;
  try {
    const uid = targetUid || await getUserId();
    if (!uid) {
      if (retryCount < 5) {
        pendingSyncs.push(() => syncDeleteFoodEntry(id, targetUid, retryCount + 1));
      }
      return;
    }
    await deleteDoc(doc(nutritionCol(uid), id));
    log(`✅ Food entry deleted from Firebase: ${id}`);
  } catch (e) {
    log("⚠️ syncDeleteFoodEntry failed:", e);
    if (retryCount < 5) {
      scheduleRetry(() => syncDeleteFoodEntry(id, targetUid, retryCount + 1), retryCount + 1);
    }
  }
}

export async function syncClearFoodEntries(targetUid?: string, retryCount: number = 0): Promise<void> {
  if (!(await isVitalsSyncEnabled())) return;
  try {
    const uid = targetUid || await getUserId();
    if (!uid) {
      if (retryCount < 5) {
        pendingSyncs.push(() => syncClearFoodEntries(targetUid, retryCount + 1));
      }
      return;
    }
    const snap = await getDocs(nutritionCol(uid));
    const batch = writeBatch(db);
    snap.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    log("✅ All food entries cleared in Firebase");
  } catch (e) {
    log("⚠️ syncClearFoodEntries failed:", e);
    if (retryCount < 5) {
      scheduleRetry(() => syncClearFoodEntries(targetUid, retryCount + 1), retryCount + 1);
    }
  }
}

export async function fetchFoodEntriesFromFirebase(uid?: string): Promise<any[]> {
  try {
    const userId = uid || await getUserId();
    if (!userId) return [];
    const snap = await getDocs(nutritionCol(userId));
    return snap.docs.map(d => d.data());
  } catch (e) {
    log("⚠️ fetchFoodEntriesFromFirebase failed:", e);
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
  targetUid?: string,
  retryCount: number = 0
): Promise<void> {
  if (!(await isVitalsSyncEnabled())) return;
  try {
    const uid = targetUid || await getUserId();
    if (!uid) {
      if (retryCount < 5) {
        pendingSyncs.push(() => syncAddActivityEntry(entry, targetUid, retryCount + 1));
      }
      return;
    }
    await setDoc(doc(activityCol(uid), entry.id), {
      ...entry,
      syncedAt: serverTimestamp(),
    });
    log(`✅ Activity entry synced to Firebase: ${entry.activityName}`);
  } catch (e) {
    log("⚠️ syncAddActivityEntry failed:", e);
    if (retryCount < 5) {
      scheduleRetry(() => syncAddActivityEntry(entry, targetUid, retryCount + 1), retryCount + 1);
    }
  }
}

export async function syncDeleteActivityEntry(id: string, targetUid?: string, retryCount: number = 0): Promise<void> {
  if (!(await isVitalsSyncEnabled())) return;
  try {
    const uid = targetUid || await getUserId();
    if (!uid) {
      if (retryCount < 5) {
        pendingSyncs.push(() => syncDeleteActivityEntry(id, targetUid, retryCount + 1));
      }
      return;
    }
    await deleteDoc(doc(activityCol(uid), id));
    log(`✅ Activity entry deleted from Firebase: ${id}`);
  } catch (e) {
    log("⚠️ syncDeleteActivityEntry failed:", e);
    if (retryCount < 5) {
      scheduleRetry(() => syncDeleteActivityEntry(id, targetUid, retryCount + 1), retryCount + 1);
    }
  }
}

export async function syncClearActivityEntries(targetUid?: string, retryCount: number = 0): Promise<void> {
  if (!(await isVitalsSyncEnabled())) return;
  try {
    const uid = targetUid || await getUserId();
    if (!uid) {
      if (retryCount < 5) {
        pendingSyncs.push(() => syncClearActivityEntries(targetUid, retryCount + 1));
      }
      return;
    }
    const snap = await getDocs(activityCol(uid));
    const batch = writeBatch(db);
    snap.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    log("✅ All activity entries cleared in Firebase");
  } catch (e) {
    log("⚠️ syncClearActivityEntries failed:", e);
    if (retryCount < 5) {
      scheduleRetry(() => syncClearActivityEntries(targetUid, retryCount + 1), retryCount + 1);
    }
  }
}

export async function fetchActivityEntriesFromFirebase(uid?: string): Promise<any[]> {
  try {
    const userId = uid || await getUserId();
    if (!userId) return [];
    const snap = await getDocs(activityCol(userId));
    return snap.docs.map(d => d.data());
  } catch (e) {
    log("⚠️ fetchActivityEntriesFromFirebase failed:", e);
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
  if (!(await isVitalsSyncEnabled())) return;
  try {
    const uid = targetUid || await getUserId();
    if (!uid) return;
    await setDoc(doc(stepsCol(uid), data.date), {
      ...data,
      syncedAt: serverTimestamp(),
    });
    log(`✅ Steps synced to Firebase: ${data.steps} steps`);
  } catch (e) {
    log("⚠️ syncStepsData failed:", e);
  }
}

export async function fetchStepsDataFromFirebase(date: string, uid?: string): Promise<any | null> {
  try {
    const userId = uid || await getUserId();
    if (!userId) return null;
    const snap = await getDoc(doc(stepsCol(userId), date));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    log("⚠️ fetchStepsDataFromFirebase failed:", e);
    return null;
  }
}

export async function fetchAllStepsFromFirebase(uid?: string): Promise<any[]> {
  try {
    const userId = uid || await getUserId();
    if (!userId) return [];
    const snap = await getDocs(stepsCol(userId));
    return snap.docs.map(d => d.data());
  } catch (e) {
    log("⚠️ fetchAllStepsFromFirebase failed:", e);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────
// 🧬 BIOGEARS ANALYTICS CACHE SYNC
// ─────────────────────────────────────────────────────────────────
const biogearsCol = (uid: string) => collection(db, "users", uid, "biogears_analytics");

export async function syncBiogearsAnalytics(analytics: any, targetUid?: string): Promise<void> {
  if (!(await isBiometricSyncEnabled())) return;
  try {
    const uid = targetUid || await getUserId();
    if (!uid) return;
    await setDoc(doc(biogearsCol(uid), "latest"), {
      ...analytics,
      updatedAt: serverTimestamp(),
    });
    log("✅ BioGears analytics cached in Firestore");
  } catch (e) {
    log("⚠️ syncBiogearsAnalytics failed:", e);
  }
}

export async function fetchBiogearsAnalyticsFromFirebase(uid?: string): Promise<any | null> {
  try {
    const userId = uid || await getUserId();
    if (!userId) return null;
    const snap = await getDoc(doc(biogearsCol(userId), "latest"));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    log("⚠️ fetchBiogearsAnalyticsFromFirebase failed:", e);
    return null;
  }
}