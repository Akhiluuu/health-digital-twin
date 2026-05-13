// context/MedicineContext.tsx
// ─────────────────────────────────────────────────────────────────
// KEY FIX: When a family member profile is active (isSwitched=true),
// medicines are fetched directly from that member's Firebase doc
// instead of local SQLite (which is always the logged-in user's data).
// When switched back to self, local SQLite data is used as normal.
// ─────────────────────────────────────────────────────────────────

import React, { createContext, useContext, useEffect, useState } from "react";
import { AppState } from "react-native";

import {
  addMedicine as dbAddMedicine,
  deleteMedicine,
  getMedicines,
  markMedicineTakenByNotificationId,
  updateMedicineNotificationId,
} from "../database/medicineDB";

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
  syncMarkMedicineTaken,
  syncUpdateMedicineNotificationId,
  fetchMedicinesFromFirebase,
} from "../services/firebaseSync";

import { useFamily } from "./FamilyContext";

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
    reminder: number
  ) => Promise<void>;
  removeMedicine: (id: number) => Promise<void>;
  reloadMedicines: () => Promise<void>;
  markMedicineAsTaken: (notificationId?: string) => Promise<void>;
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
    }));
  } catch (e) {
    console.log("❌ fetchMemberMedicinesFromFirebase error:", e);
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
  // Safe: if FamilyContext isn't ready yet, fall back to self behaviour
  let isSwitched     = false;
  let activeMemberId = "self";
  try {
    const family   = useFamily();
    isSwitched     = family.isSwitched;
    activeMemberId = family.activeMemberId;
  } catch (_) {}

  ///////////////////////////////////////////////////////////
  // LOAD MEDICINES
  // When switched → fetch from Firebase for that member UID
  // When on self  → read from local SQLite as normal
  ///////////////////////////////////////////////////////////

  const loadMedicines = async () => {
    try {
      if (isSwitched && activeMemberId && activeMemberId !== "self") {
        // ── Switched: load from member's Firebase doc ──────
        setIsLoadingMember(true);
        console.log("💊 Loading medicines from Firebase for member:", activeMemberId);
        const memberMeds = await fetchMemberMedicinesFromFirebase(activeMemberId);
        setMedicines(memberMeds);
        console.log(`💊 Loaded ${memberMeds.length} medicines for member:`, activeMemberId);
      } else {
        // ── Self: load from local SQLite ───────────────────
        const data = getMedicines() as Medicine[];
        setMedicines([...data]);
      }
    } catch (err) {
      console.log("💊 Load medicines error:", err);
    } finally {
      setIsLoadingMember(false);
    }
  };

  ///////////////////////////////////////////////////////////
  // Re-load whenever active member changes
  ///////////////////////////////////////////////////////////

  useEffect(() => {
    loadMedicines();
  }, [isSwitched, activeMemberId]);

  ///////////////////////////////////////////////////////////
  // Initial load + file sync
  ///////////////////////////////////////////////////////////

  useEffect(() => {
    const initialize = async () => {
      try {
        await loadMedicines();
        if (!isSwitched) await syncMedicineFile();
        console.log("💊 Medicine system ready");
      } catch (err) {
        console.log("💊 Init error:", err);
      }
    };
    initialize();
  }, []);

  ///////////////////////////////////////////////////////////
  // Event bus — medicine taken in foreground notification
  ///////////////////////////////////////////////////////////

  useEffect(() => {
    const onTaken = () => {
      console.log("🔄 medicine_taken event — reloading");
      loadMedicines();
    };
    medicineEventBus.on("medicine_taken", onTaken);
    return () => { medicineEventBus.off("medicine_taken", onTaken); };
  }, [isSwitched, activeMemberId]);

  ///////////////////////////////////////////////////////////
  // Reload on app foreground
  ///////////////////////////////////////////////////////////

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") loadMedicines();
    });
    return () => sub.remove();
  }, [isSwitched, activeMemberId]);

  ///////////////////////////////////////////////////////////
  // ADD — always adds to OWN local DB + Firebase (never member's)
  ///////////////////////////////////////////////////////////

  const addMedicine = async (
    name: string,
    dose: string,
    type: string,
    time: string,
    timestamp: number,
    meal: "before" | "after",
    frequency: string,
    startDate: string,
    endDate: string,
    reminder: number
  ) => {
    try {
      const normalisedTimestamp =
        timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;

      dbAddMedicine(name, dose, type, time, normalisedTimestamp, meal, frequency, startDate, endDate, reminder, null);

      const allMedicines = getMedicines() as Medicine[];
      const lastMedicine = allMedicines[allMedicines.length - 1];
      if (!lastMedicine) return;

      let notifId: string | null = null;

      if (reminder) {
        try {
          const dateObj = new Date(normalisedTimestamp);
          const now     = new Date();
          const freq    = frequency.toLowerCase();

          if (freq === "once" && dateObj.getTime() > now.getTime()) {
            notifId = await scheduleMedicineOnce(`${name} — ${dose}`, dateObj, lastMedicine.id);
          }
          if (freq === "daily") {
            notifId = await scheduleMedicineDaily(`${name} — ${dose}`, dateObj.getHours(), dateObj.getMinutes(), lastMedicine.id);
          }
          if (notifId) {
            updateMedicineNotificationId(lastMedicine.id, notifId);
          }
        } catch (notifError) {
          console.log("❌ Notification scheduling failed:", notifError);
        }
      }

      syncAddMedicine({
        id: lastMedicine.id, name, dose, type, time,
        timestamp: normalisedTimestamp, meal, frequency,
        startDate, endDate, reminder, notificationId: notifId,
      });

      if (notifId) syncUpdateMedicineNotificationId(lastMedicine.id, notifId);

      await loadMedicines();
      if (!isSwitched) await syncMedicineFile();
    } catch (err) {
      console.log("💊 Add medicine error:", err);
    }
  };

  ///////////////////////////////////////////////////////////
  // MARK TAKEN — only for own medicines
  ///////////////////////////////////////////////////////////

  const markMedicineAsTaken = async (notificationId?: string) => {
    try {
      if (!notificationId) return;
      markMedicineTakenByNotificationId(notificationId);
      const medicine = (getMedicines() as Medicine[]).find((m) => m.notificationId === notificationId);
      if (medicine) syncMarkMedicineTaken(medicine.id);
      await loadMedicines();
    } catch (err) {
      console.log("💊 Mark taken error:", err);
    }
  };

  ///////////////////////////////////////////////////////////
  // REMOVE — only for own medicines
  ///////////////////////////////////////////////////////////

  const removeMedicine = async (id: number) => {
    try {
      const item = medicines.find((m) => m.id === id);
      if (item?.notificationId) await cancelMedicineNotification(item.notificationId);
      deleteMedicine(id);
      syncDeleteMedicine(id);
      await loadMedicines();
    } catch (err) {
      console.log("💊 Delete medicine error:", err);
    }
  };

  const reloadMedicines = async () => { await loadMedicines(); };

  ///////////////////////////////////////////////////////////

  return (
    <MedicineContext.Provider
      value={{
        medicines,
        addMedicine,
        removeMedicine,
        reloadMedicines,
        markMedicineAsTaken,
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