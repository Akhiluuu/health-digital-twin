// context/MedicineContext.tsx
// ─────────────────────────────────────────────────────────────────
// KEY FIX: When a family member profile is active (isSwitched=true),
// medicines are fetched directly from that member's Firebase doc
// instead of local SQLite (which is always the logged-in user's data).
// When switched back to self, local SQLite data is used as normal.
// ─────────────────────────────────────────────────────────────────

import React, { createContext, useContext, useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  addMedicine as dbAddMedicine,
  deleteMedicine,
  deleteAllMedicines,
  getMedicines,
  markMedicineTakenByNotificationId,
  updateMedicineNotificationId,
  insertOrReplaceMedicine,
  updateMedicineReview,
} from "../database/medicineDB";

import {
  scheduleMedicineAlarm,
  cancelMedicineAlarm,
} from "../services/medicineAlarmNative";

import {
  cancelMedicineNotification,
  scheduleMedicineDaily,
  scheduleMedicineOnce,
  medicineEventBus,
} from "../services/notifeeService";

import { syncMedicineFile } from "../services/medicineFileSync";

import {
  syncAddMedicine,
  syncDeleteMedicine,
  syncDeleteAllMedicines,
  syncMarkMedicineTaken,
  syncUpdateMedicineNotificationId,
  fetchMedicinesFromFirebase,
  syncUpdateMedicineStatus,
  syncUpdateMedicineReview,
} from "../services/firebaseSync";

import { useFamily } from "./FamilyContext";

import { log } from "../utils/logger";
import { getLocalDateString } from "../utils/twinUtils";
function getNextTriggerTime(timestamp: number, frequency: string): number {
  const dateObj = new Date(timestamp);
  const now = new Date();
  
  if (frequency.toLowerCase() === "daily") {
    const trigger = new Date();
    trigger.setHours(dateObj.getHours(), dateObj.getMinutes(), 0, 0);
    if (trigger.getTime() <= now.getTime()) {
      trigger.setDate(trigger.getDate() + 1);
    }
    return trigger.getTime();
  }
  
  return dateObj.getTime();
}

///////////////////////////////////////////////////////////
// TYPE
///////////////////////////////////////////////////////////

export type Medicine = {
  id: number;
  name: string;
  dose: string;
  type: string;
  time: string;
  timestamp: number;
  meal: string;
  frequency: string;
  startDate: string;
  endDate: string;
  reminder: number;
  notificationId: string | null;
  taken: number;
  takenDate: string | null;
  reviewInterval: string;
  nextReviewDate: string | null;
  reviewStatus: string;
};

///////////////////////////////////////////////////////////
// CONTEXT TYPE
///////////////////////////////////////////////////////////

type ContextType = {
  medicines: Medicine[];
  addMedicine: (
    name: string,
    dose: string,
    type: string,
    time: string,
    timestamp: number,
    meal: "before" | "after",
    frequency: string,
    startDate: string,
    endDate: string,
    reminder: number,
    reviewInterval?: string,
    nextReviewDate?: string | null,
    reviewStatus?: string
  ) => Promise<void>;
  removeMedicine: (id: number, reason?: string) => Promise<void>;
  clearAllMedicines: () => Promise<void>;
  reloadMedicines: () => Promise<void>;
  markMedicineAsTaken: (notificationId?: string) => Promise<void>;
  setMedicineStatus: (medicineId: number, status: "taken" | "missed" | "pending") => Promise<void>;
  updateMedicineReviewDetails: (
    id: number,
    reviewInterval: string,
    nextReviewDate: string | null,
    reviewStatus: string
  ) => Promise<void>;
  isLoadingMemberMedicines: boolean;
};

///////////////////////////////////////////////////////////
// CONTEXT
///////////////////////////////////////////////////////////

const MedicineContext = createContext<ContextType | null>(null);

///////////////////////////////////////////////////////////
// FETCH MEMBER MEDICINES FROM FIREBASE
// Reads from doc("users", uid).medicines array in Firestore
///////////////////////////////////////////////////////////

async function fetchMemberMedicinesFromFirebase(memberUid: string): Promise<Medicine[]> {
  try {
    // fetchMedicinesFromFirebase reads the logged-in user's medicines.
    // For a switched member we call it with their uid by temporarily
    // using the firebaseSync helper that accepts a uid override.
    const results = await fetchMedicinesFromFirebase(memberUid);
    if (!results || results.length === 0) return [];
    return results.map((m: any) => ({
      id:             m.id             ?? 0,
      name:           m.name           ?? "",
      dose:           m.dose           ?? "",
      type:           m.type           ?? "",
      time:           m.time           ?? "",
      timestamp:      m.timestamp      ?? 0,
      meal:           m.meal           ?? "",
      frequency:      m.frequency      ?? "daily",
      startDate:      m.startDate      ?? "",
      endDate:        m.endDate        ?? "",
      reminder:       m.reminder       ?? 0,
      notificationId: m.notificationId ?? null,
      taken:          m.taken          ?? 0,
      takenDate:      m.takenDate      ?? null,
      reviewInterval: m.reviewInterval ?? "90 days",
      nextReviewDate: m.nextReviewDate ?? null,
      reviewStatus:   m.reviewStatus   ?? "Started",
    }));
  } catch (e) {
    log("❌ fetchMemberMedicinesFromFirebase error:", e);
    return [];
  }
}

///////////////////////////////////////////////////////////
// PROVIDER
///////////////////////////////////////////////////////////

export const MedicineProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [medicines, setMedicines]                       = useState<Medicine[]>([]);
  const [isLoadingMemberMedicines, setIsLoadingMember]  = useState(false);

  // ── Get active profile context ────────────────────────
  // MedicineProvider is always rendered inside FamilyProvider (see _layout.tsx),
  // so useFamily() is safe to call unconditionally at the top level.
  // Calling hooks inside try/catch is a React Rules of Hooks violation.
  const { isSwitched, activeMemberId, reportLoading, activeProfile } = useFamily();

  React.useEffect(() => {
    if (reportLoading) {
      reportLoading("medicine", isLoadingMemberMedicines);
    }
  }, [isLoadingMemberMedicines, reportLoading]);

  ///////////////////////////////////////////////////////////
  // LOAD MEDICINES
  // When switched → fetch from Firebase for that member UID
  // When on self  → read from local SQLite as normal
  ///////////////////////////////////////////////////////////

  const isMountedRef = React.useRef(true);
  React.useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);

  const loadMedicines = React.useCallback(async () => {
    setIsLoadingMember(true);
    try {
      if (isSwitched && activeMemberId && activeMemberId !== "self") {
        log("💊 Loading medicines from Firebase for member:", activeMemberId);
        const memberMeds = await fetchMemberMedicinesFromFirebase(activeMemberId);
        if (!isMountedRef.current) return;

        // Filter out empty medicines
        const cleanMemberMeds = memberMeds.filter((m) => m && m.name && m.name.trim() !== "");
        const emptyMemberMeds = memberMeds.filter((m) => !m || !m.name || !m.name.trim());
        
        // Clean up empty ones from Firebase
        if (emptyMemberMeds.length > 0) {
          for (const em of emptyMemberMeds) {
            log(`[MedicineContext] Cleaning up empty member medicine ${em.id} from Firebase`);
            syncDeleteMedicine(em.id, activeMemberId).catch(() => {});
          }
        }

        setMedicines(cleanMemberMeds);
        log(`💊 Loaded ${cleanMemberMeds.length} medicines for member:`, activeMemberId);
      } else {
        // ── Self: load from local SQLite ───────────────────
        let data = getMedicines() as Medicine[];
        if (!isMountedRef.current) return;

        // Clean up empty ones from local SQLite and Firebase
        const emptyMeds = data.filter((m) => !m || !m.name || !m.name.trim());
        if (emptyMeds.length > 0) {
          for (const em of emptyMeds) {
            log(`[MedicineContext] Cleaning up empty medicine ${em.id} from SQLite & Firebase`);
            deleteMedicine(em.id);
            syncDeleteMedicine(em.id).catch(() => {});
          }
          data = data.filter((m) => m && m.name && m.name.trim() !== "");
        }

        // Auto-clean notifications for expired medicines
        const todayStr = getLocalDateString();
        for (const med of data) {
          if (med.endDate && med.endDate !== 'ongoing' && med.endDate < todayStr && med.notificationId) {
            log(`[MedicineContext] Cancelling notification ${med.notificationId} for expired medicine: ${med.name}`);
            cancelMedicineNotification(med.notificationId).catch(() => {});
          }
        }

        setMedicines([...data]);

        // Background bidirectional sync/merge with Firebase
        (async () => {
          try {
            const firebaseMeds = await fetchMedicinesFromFirebase();
            if (!isMountedRef.current) return;
            if (firebaseMeds && firebaseMeds.length > 0) {
              let didChange = false;

              // 1. Sync Firebase -> SQLite (heal missing)
              for (const fm of firebaseMeds) {
                // If it's an empty medicine in Firebase, clean it up and skip
                if (!fm || !fm.name || !fm.name.trim()) {
                  log(`[MedicineContext] Cleaning up empty medicine ${fm.id} from Firebase`);
                  syncDeleteMedicine(fm.id).catch(() => {});
                  continue;
                }

                const exists = data.some((lm) => lm.id === fm.id);
                if (!exists) {
                  insertOrReplaceMedicine({
                    id: fm.id,
                    name: fm.name,
                    dose: fm.dose,
                    type: fm.type,
                    time: fm.time,
                    timestamp: fm.timestamp,
                    meal: fm.meal,
                    frequency: fm.frequency,
                    startDate: fm.startDate,
                    endDate: fm.endDate,
                    reminder: fm.reminder,
                    notificationId: fm.notificationId,
                    taken: fm.taken,
                    takenDate: fm.takenDate,
                    reviewInterval: fm.reviewInterval,
                    nextReviewDate: fm.nextReviewDate,
                    reviewStatus: fm.reviewStatus,
                  });
                  didChange = true;
                }
              }

              // 2. Sync SQLite -> Firebase (upload missing)
              const fbIds = new Set(
                firebaseMeds
                  .filter((fm) => fm && fm.name && fm.name.trim())
                  .map((fm) => fm.id)
              );
              for (const lm of data) {
                if (!fbIds.has(lm.id)) {
                  await syncAddMedicine({
                    id: lm.id,
                    name: lm.name,
                    dose: lm.dose,
                    type: lm.type,
                    time: lm.time,
                    timestamp: lm.timestamp,
                    meal: lm.meal,
                    frequency: lm.frequency,
                    startDate: lm.startDate,
                    endDate: lm.endDate,
                    reminder: lm.reminder,
                    notificationId: lm.notificationId,
                    reviewInterval: lm.reviewInterval,
                    nextReviewDate: lm.nextReviewDate,
                    reviewStatus: lm.reviewStatus,
                  }).catch(() => {});
                }
              }

              if (didChange && isMountedRef.current) {
                const updated = (getMedicines() as Medicine[]).filter(
                  (m) => m && m.name && m.name.trim() !== ""
                );
                setMedicines([...updated]);
              }
            } else if (data.length > 0) {
              // Firebase is empty but local has data, upload all
              for (const lm of data) {
                await syncAddMedicine({
                  id: lm.id,
                  name: lm.name,
                  dose: lm.dose,
                  type: lm.type,
                  time: lm.time,
                  timestamp: lm.timestamp,
                  meal: lm.meal,
                  frequency: lm.frequency,
                  startDate: lm.startDate,
                  endDate: lm.endDate,
                  reminder: lm.reminder,
                  notificationId: lm.notificationId,
                  reviewInterval: lm.reviewInterval,
                  nextReviewDate: lm.nextReviewDate,
                  reviewStatus: lm.reviewStatus,
                }).catch(() => {});
              }
            }
          } catch (syncErr) {
            log("⚠️ Background medicine sync failed:", syncErr);
          }
        })();
      }
    } catch (err) {
      log("💊 Load medicines error:", err);
    } finally {
      if (isMountedRef.current) setIsLoadingMember(false);
    }
  }, [isSwitched, activeMemberId]);

  ///////////////////////////////////////////////////////////
  // Re-load whenever active member changes (covers initial mount too)
  ///////////////////////////////////////////////////////////

  useEffect(() => {
    const run = async () => {
      await loadMedicines();
      // File sync only for self on first mount
      if (!isSwitched) {
        syncMedicineFile().catch((err) => log("💊 File sync error:", err));
        log("💊 Medicine system ready");
      }
    };
    run();
  }, [loadMedicines, isSwitched]);

  ///////////////////////////////////////////////////////////
  // Event bus — medicine taken in foreground notification
  ///////////////////////////////////////////////////////////

  // ✅ FIX: Use a ref so the event listener always calls the latest loadMedicines
  // without unsubscribing/resubscribing on every isSwitched/activeMemberId change.
  // The brief gap during unsubscribe/resubscribe could cause a medicine_taken event
  // (fired by notifeeService) to be missed, leaving the tick invisible to the user.
  const loadMedicinesRef = React.useRef(loadMedicines);
  React.useEffect(() => {
    loadMedicinesRef.current = loadMedicines;
  }, [loadMedicines]);

  useEffect(() => {
    const onTaken = () => {
      log("🔄 medicine_taken event — reloading");
      loadMedicinesRef.current();
    };
    medicineEventBus.on("medicine_taken", onTaken);
    return () => { medicineEventBus.off("medicine_taken", onTaken); };
  }, []); // ✅ Stable — loadMedicinesRef always points to latest version

  ///////////////////////////////////////////////////////////
  // Reload on app foreground
  ///////////////////////////////////////////////////////////

  useEffect(() => {
    const sub = AppState.addEventListener("change", (appState) => {
      if (appState === "active" && isMountedRef.current) loadMedicines();
    });
    return () => sub.remove();
  }, [loadMedicines]);

  ///////////////////////////////////////////////////////////
  // ADD — when switched: directly to Firestore; when self: local SQLite + sync
  ///////////////////////////////////////////////////////////

  const addMedicine = React.useCallback(async (
    name: string,
    dose: string,
    type: string,
    time: string,
    timestamp: number,
    meal: "before" | "after",
    frequency: string,
    startDate: string,
    endDate: string,
    reminder: number,
    reviewInterval: string = "90 days",
    nextReviewDate: string | null = null,
    reviewStatus: string = "Started"
  ) => {
    try {
      const normalisedTimestamp =
        timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;

      if (isSwitched && activeMemberId && activeMemberId !== "self") {
        // ✅ FIX: Collision-proof ID — Date.now() alone risks collision if two medicines
        // are added in the same millisecond (rapid saves on slow devices).
        const medId = Date.now() * 1000 + Math.floor(Math.random() * 1000);
        let notifId: string | null = null;

        if (reminder) {
          try {
            const dateObj = new Date(normalisedTimestamp);
            const now     = new Date();
            const freq    = frequency.toLowerCase();
            const activeProfileName = activeProfile?.firstName
              ? `${activeProfile.firstName} ${activeProfile.lastName || ""}`.trim()
              : "Family Member";

            if (Platform.OS === "android") {
              const { scheduleMedicineAlarm } = require("../services/medicineAlarmNative");
              const alarmTitle = `${name} (${activeProfileName})`;
              const triggerTime = getNextTriggerTime(normalisedTimestamp, freq);
              scheduleMedicineAlarm(
                medId,
                alarmTitle,
                dose,
                triggerTime,
                freq
              );
              notifId = String(medId);

              // Append to cache registry so it's not marked deleted on next sync pass
              const cacheKey = `family_med_ids_${activeMemberId}`;
              try {
                const cachedIdsStr = await AsyncStorage.getItem(cacheKey);
                const cachedIds: number[] = cachedIdsStr ? JSON.parse(cachedIdsStr) : [];
                if (!cachedIds.includes(medId)) {
                  cachedIds.push(medId);
                  await AsyncStorage.setItem(cacheKey, JSON.stringify(cachedIds));
                }
              } catch (_) {}
            } else {
              if (freq === "once" && dateObj.getTime() > now.getTime()) {
                notifId = await scheduleMedicineOnce(
                  `${name} — ${dose}`,
                  dateObj,
                  medId,
                  activeMemberId,
                  activeProfileName,
                  name,
                  dose,
                  time,
                  frequency
                );
              }
              if (freq === "daily") {
                notifId = await scheduleMedicineDaily(
                  `${name} — ${dose}`,
                  dateObj.getHours(),
                  dateObj.getMinutes(),
                  medId,
                  activeMemberId,
                  activeProfileName,
                  name,
                  dose,
                  time,
                  frequency
                );
              }
            }
          } catch (notifError) {
            log("❌ Notification scheduling failed for family member:", notifError);
          }
        }

        await syncAddMedicine({
          id: medId, name, dose, type, time,
          timestamp: normalisedTimestamp, meal, frequency,
          startDate, endDate, reminder, notificationId: notifId,
          reviewInterval, nextReviewDate, reviewStatus,
        }, activeMemberId);
        await loadMedicines();
        return;
      }

      dbAddMedicine(
        name, dose, type, time, normalisedTimestamp, meal, frequency, startDate, endDate, reminder, null,
        reviewInterval, nextReviewDate, reviewStatus
      );

      const allMedicines = getMedicines() as Medicine[];
      const lastMedicine = allMedicines[allMedicines.length - 1];
      if (!lastMedicine) return;

      let notifId: string | null = null;

      if (reminder) {
        try {
          const dateObj = new Date(normalisedTimestamp);
          const now     = new Date();
          const freq    = frequency.toLowerCase();
          const activeProfileName = activeProfile?.firstName
            ? `${activeProfile.firstName} ${activeProfile.lastName || ""}`.trim()
            : "You";

          if (Platform.OS === "android") {
            scheduleMedicineAlarm(lastMedicine.id, `${name} (${activeProfileName})`, dose, normalisedTimestamp, frequency);
            notifId = String(lastMedicine.id);
            updateMedicineNotificationId(lastMedicine.id, notifId);
          } else {
            if (freq === "once" && dateObj.getTime() > now.getTime()) {
              notifId = await scheduleMedicineOnce(
                `${name} — ${dose}`,
                dateObj,
                lastMedicine.id,
                "self",
                activeProfileName,
                name,
                dose,
                time,
                frequency
              );
            }
            if (freq === "daily") {
              notifId = await scheduleMedicineDaily(
                `${name} — ${dose}`,
                dateObj.getHours(),
                dateObj.getMinutes(),
                lastMedicine.id,
                "self",
                activeProfileName,
                name,
                dose,
                time,
                frequency
              );
            }
            if (notifId) {
              updateMedicineNotificationId(lastMedicine.id, notifId);
            }
          }
        } catch (notifError) {
          log("❌ Notification scheduling failed:", notifError);
        }
      }

      syncAddMedicine({
        id: lastMedicine.id, name, dose, type, time,
        timestamp: normalisedTimestamp, meal, frequency,
        startDate, endDate, reminder, notificationId: notifId,
        reviewInterval, nextReviewDate, reviewStatus,
      }).catch((err) => log("⚠️ syncAddMedicine (self) failed:", err));

      if (notifId) syncUpdateMedicineNotificationId(lastMedicine.id, notifId);

      await loadMedicines();
      if (!isSwitched) await syncMedicineFile();
    } catch (err) {
      log("💊 Add medicine error:", err);
    }
  }, [isSwitched, activeMemberId, activeProfile]);

  ///////////////////////////////////////////////////////////
  // MARK TAKEN — when switched: directly in Firestore; when self: local SQLite + sync
  ///////////////////////////////////////////////////////////

  const markMedicineAsTaken = React.useCallback(async (notificationId?: string) => {
    try {
      if (!notificationId) return;

      if (isSwitched && activeMemberId && activeMemberId !== "self") {
        const medicine = medicines.find((m) => m.notificationId === notificationId);
        if (medicine) await syncMarkMedicineTaken(medicine.id, activeMemberId);
        await loadMedicines();
        return;
      }

      markMedicineTakenByNotificationId(notificationId);
      const medicine = (getMedicines() as Medicine[]).find((m) => m.notificationId === notificationId);
      if (medicine) syncMarkMedicineTaken(medicine.id);
      await loadMedicines();
    } catch (err) {
      log("💊 Mark taken error:", err);
    }
  }, [isSwitched, activeMemberId, medicines]);

  ///////////////////////////////////////////////////////////
  // SET STATUS — taken, missed, pending
  ///////////////////////////////////////////////////////////

  const setMedicineStatus = React.useCallback(async (medicineId: number, status: "taken" | "missed" | "pending") => {
    try {
      if (isSwitched && activeMemberId && activeMemberId !== "self") {
        await syncUpdateMedicineStatus(medicineId, status, activeMemberId);
        await loadMedicines();
        return;
      }

      const {
        markMedicineTaken,
        markMedicineMissed,
        markMedicinePending,
      } = require("../database/medicineDB");

      if (status === "taken") {
        await markMedicineTaken(medicineId);
      } else if (status === "missed") {
        await markMedicineMissed(medicineId);
      } else {
        await markMedicinePending(medicineId);
      }

      await syncUpdateMedicineStatus(medicineId, status);

      // Log to history
      if (status !== "pending") {
        const medicine = medicines.find((m) => m.id === medicineId);
        if (medicine) {
          const { addToMedicineHistory } = require("../utils/medicineHistory");
          await addToMedicineHistory({
            medicineId: medicine.id,
            medicineName: medicine.name,
            dose: medicine.dose,
            time: medicine.time,
            status: status as "taken" | "missed",
          });
        }
      }

      await loadMedicines();
    } catch (err) {
      log("💊 setMedicineStatus error:", err);
    }
  }, [isSwitched, activeMemberId, medicines]);

  ///////////////////////////////////////////////////////////
  // UPDATE REVIEW DETAILS
  ///////////////////////////////////////////////////////////

  const updateMedicineReviewDetails = React.useCallback(async (
    id: number,
    reviewInterval: string,
    nextReviewDate: string | null,
    reviewStatus: string
  ) => {
    try {
      updateMedicineReview(id, reviewInterval, nextReviewDate, reviewStatus);

      if (isSwitched && activeMemberId && activeMemberId !== "self") {
        await syncUpdateMedicineReview(id, reviewInterval, nextReviewDate, reviewStatus, activeMemberId);
      } else {
        await syncUpdateMedicineReview(id, reviewInterval, nextReviewDate, reviewStatus);
      }

      await loadMedicines();
      if (!isSwitched) await syncMedicineFile();
    } catch (err) {
      log("💊 Update medicine review details error:", err);
    }
  }, [isSwitched, activeMemberId, loadMedicines]);

  ///////////////////////////////////////////////////////////
  // REMOVE — when switched: directly from Firestore; when self: local SQLite + cancel notification + sync
  ///////////////////////////////////////////////////////////

  const removeMedicine = React.useCallback(async (id: number, reason?: string) => {
    try {
      const item = medicines.find((m) => m.id === id);
      if (item) {
        // Log to history first
        const { addToMedicineHistory } = require("../utils/medicineHistory");
        await addToMedicineHistory({
          medicineId: item.id,
          medicineName: item.name,
          dose: item.dose,
          time: item.time,
          status: "deleted",
          reason: reason || "User deleted",
          targetUid: isSwitched ? activeMemberId : undefined,
        });
      }

      if (isSwitched && activeMemberId && activeMemberId !== "self") {
        if (Platform.OS === "android") {
          const { cancelMedicineAlarm } = require("../services/medicineAlarmNative");
          cancelMedicineAlarm(id);
          const cacheKey = `family_med_ids_${activeMemberId}`;
          try {
            const cachedIdsStr = await AsyncStorage.getItem(cacheKey);
            let cachedIds: number[] = cachedIdsStr ? JSON.parse(cachedIdsStr) : [];
            cachedIds = cachedIds.filter((cid) => cid !== id);
            await AsyncStorage.setItem(cacheKey, JSON.stringify(cachedIds));
          } catch (_) {}
        } else if (item?.notificationId) {
          await cancelMedicineNotification(item.notificationId);
        }
        await syncDeleteMedicine(id, activeMemberId);
        await loadMedicines();
        return;
      }

      if (Platform.OS === "android") {
        cancelMedicineAlarm(id);
      } else if (item?.notificationId) {
        await cancelMedicineNotification(item.notificationId);
      }
      deleteMedicine(id);
      syncDeleteMedicine(id).catch((err) => log("⚠️ syncDeleteMedicine (self) failed:", err));
      await loadMedicines();
    } catch (err) {
      log("💊 Delete medicine error:", err);
    }
  }, [isSwitched, activeMemberId, medicines]);

  const clearAllMedicines = React.useCallback(async () => {
    try {
      if (isSwitched && activeMemberId && activeMemberId !== "self") {
        for (const med of medicines) {
          if (Platform.OS === "android") {
            const { cancelMedicineAlarm } = require("../services/medicineAlarmNative");
            cancelMedicineAlarm(med.id);
          } else if (med.notificationId) {
            await cancelMedicineNotification(med.notificationId);
          }
        }
        if (Platform.OS === "android") {
          await AsyncStorage.removeItem(`family_med_ids_${activeMemberId}`);
        }
        await syncDeleteAllMedicines(activeMemberId);
        await loadMedicines();
        return;
      }

      for (const med of medicines) {
        if (Platform.OS === "android") {
          cancelMedicineAlarm(med.id);
        } else if (med.notificationId) {
          await cancelMedicineNotification(med.notificationId);
        }
      }
      deleteAllMedicines();
      await syncDeleteAllMedicines();
      await loadMedicines();
      if (!isSwitched) await syncMedicineFile();
    } catch (err) {
      log("💊 Clear all medicines error:", err);
    }
  }, [isSwitched, activeMemberId, medicines]);

  const reloadMedicines = React.useCallback(async () => { await loadMedicines(); }, [loadMedicines]);

  ///////////////////////////////////////////////////////////

  return (
    <MedicineContext.Provider
      value={{
        medicines,
        addMedicine,
        removeMedicine,
        clearAllMedicines,
        reloadMedicines,
        markMedicineAsTaken,
        setMedicineStatus,
        updateMedicineReviewDetails,
        isLoadingMemberMedicines,
      }}
    >
      {children}
    </MedicineContext.Provider>
  );
};

///////////////////////////////////////////////////////////

export const useMedicine = () => {
  const ctx = useContext(MedicineContext);
  if (!ctx) throw new Error("useMedicine must be inside provider");
  return ctx;
};