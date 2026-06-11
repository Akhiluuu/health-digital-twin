// context/HydrationContext.tsx

import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, AppStateStatus } from "react-native";

import {
  scheduleHydrationReminder,
  cancelHydrationReminders,
} from "../services/notifeeService";

import {
  HydrationEntry,
  addHydrationEntry,
  clearTodayHydrationHistory,
  getTodayHydrationHistory,
  initHydrationHistoryDB,
} from "../database/hydrationHistoryDB";

import { useFamily } from "./FamilyContext";
import {
  syncAddHydration,
  syncClearHydration,
  fetchHydrationFromFirebase,
} from "../services/firebaseSync";

// ✅ Delegates to the shared utility so background and foreground
//    both write through the same code path
import { saveWaterToStorage } from "../utils/hydrationStorage";

///////////////////////////////////////////////////////////
// TYPES
///////////////////////////////////////////////////////////

type HydrationType = {
  water: number;
  history: HydrationEntry[];
  addWater: (ml: number, source?: "manual" | "notification") => void;
  reset: () => void;
  reloadHistory: () => void;
};

const HydrationContext = createContext<HydrationType | null>(null);

// Global reference so addWaterFromNotification can update live state
// when the app is foregrounded and the provider is mounted
let globalAddWater: ((ml: number, source?: "manual" | "notification") => void) | null = null;

///////////////////////////////////////////////////////////
// HELPERS
///////////////////////////////////////////////////////////

const getTodayKey = () =>
  `hydration-${new Date().toISOString().split("T")[0]}`;

const getTodayDate = () =>
  new Date().toISOString().split("T")[0];

///////////////////////////////////////////////////////////
// PROVIDER
///////////////////////////////////////////////////////////

export const HydrationProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [water, setWater] = useState<number>(0);
  const [history, setHistory] = useState<HydrationEntry[]>([]);
  const { isSwitched, activeMemberId } = useFamily();

  const appState = useRef<AppStateStatus>(AppState.currentState);
  const lastStoredValue = useRef<number>(0);
  const lastCheckedDate = useRef<string>(getTodayDate());
  const lastSyncTimeRef = useRef<number>(0);

  /////////////////////////////////////////////////////////
  // Sync / Reload with Firebase
  /////////////////////////////////////////////////////////

  const syncHydrationWithFirebase = useCallback(async () => {
    if (isSwitched && activeMemberId && activeMemberId !== "self") {
      try {
        const firebaseEntries = await fetchHydrationFromFirebase(activeMemberId);
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const startMs = startOfDay.getTime();

        const todayEntries = firebaseEntries
          .filter((e) => e.timestamp >= startMs)
          .sort((a, b) => b.timestamp - a.timestamp);

        const total = todayEntries.reduce((sum, e) => sum + e.amount, 0);
        setWater(total);
        setHistory(todayEntries);
        console.log(`💧 Switched hydration synced from Firestore for ${activeMemberId}: ${total}ml`);
      } catch (err) {
        console.log("❌ Switched hydration sync error:", err);
      }
      return;
    }

    // Self
    try {
      const firebaseEntries = await fetchHydrationFromFirebase();
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const startMs = startOfDay.getTime();

      const todayFirebase = firebaseEntries.filter((e) => e.timestamp >= startMs);
      const todayLocal = getTodayHydrationHistory();

      const firebaseTimestamps = new Set(todayFirebase.map((e) => e.timestamp));
      const localTimestamps = new Set(todayLocal.map((e) => e.timestamp));

      // Upload local missing ones
      for (const entry of todayLocal) {
        if (!firebaseTimestamps.has(entry.timestamp)) {
          await syncAddHydration(entry);
        }
      }

      // Download Firebase missing ones
      let didInsertLocal = false;
      for (const entry of todayFirebase) {
        if (!localTimestamps.has(entry.timestamp)) {
          await addHydrationEntry(entry.amount, entry.total, entry.source);
          didInsertLocal = true;
        }
      }

      if (didInsertLocal) {
        const updatedLocal = getTodayHydrationHistory();
        const total = updatedLocal.length > 0 ? updatedLocal[0].total : 0;
        await AsyncStorage.setItem(getTodayKey(), String(total));
        setWater(total);
        setHistory(updatedLocal);
      } else {
        const localWater = await AsyncStorage.getItem(getTodayKey());
        setWater(localWater ? Number(localWater) : 0);
        setHistory(todayLocal);
      }
      console.log(`💧 Self hydration synced and loaded`);
    } catch (err) {
      console.log("❌ Self hydration sync error:", err);
    }
  }, [isSwitched, activeMemberId]);

  const reloadHistory = useCallback(() => {
    if (isSwitched) {
      syncHydrationWithFirebase();
    } else {
      try {
        const entries = getTodayHydrationHistory();
        setHistory(entries);
      } catch (err) {
        console.log("❌ History reload error:", err);
      }
    }
  }, [isSwitched, syncHydrationWithFirebase]);

  /////////////////////////////////////////////////////////
  // Schedule Hydration Reminder
  /////////////////////////////////////////////////////////

  const initializeHydrationReminder = useCallback(async () => {
    try {
      await cancelHydrationReminders();
      await scheduleHydrationReminder();
      console.log("💧 Hydration reminder scheduled");
    } catch (err) {
      console.log("❌ Hydration reminder error:", err);
    }
  }, []);

  /////////////////////////////////////////////////////////
  // Add Water (manual or foreground notification)
  /////////////////////////////////////////////////////////

  const addWater = useCallback(
    (ml: number, source: "manual" | "notification" = "manual") => {
      if (isSwitched && activeMemberId && activeMemberId !== "self") {
        const timestamp = Date.now();
        const entry = {
          id: timestamp,
          amount: ml,
          total: water + ml,
          timestamp,
          source,
        };
        setWater((prev) => prev + ml);
        setHistory((prev) => [entry, ...prev]);
        syncAddHydration(entry, activeMemberId);
        console.log(`💧 Switched addWater: +${ml}ml for ${activeMemberId}`);
      } else {
        setWater((prev) => {
          const newValue = prev + ml;
          lastStoredValue.current = newValue;

          AsyncStorage.setItem(getTodayKey(), String(newValue)).catch(
            (err: unknown) => console.log("❌ Hydration save error:", err)
          );

          addHydrationEntry(ml, newValue, source)
            .then(() => {
              const entries = getTodayHydrationHistory();
              setHistory(entries);
              const lastEntry = entries[0];
              if (lastEntry) {
                syncAddHydration(lastEntry);
              }
            })
            .catch((err: unknown) => console.log("❌ History entry error:", err));

          console.log(`💧 addWater: +${ml}ml (${source}) → total: ${newValue}ml`);

          return newValue;
        });
      }
    },
    [isSwitched, activeMemberId, water]
  );

  /////////////////////////////////////////////////////////
  // Reset Water Intake + History
  /////////////////////////////////////////////////////////

  const reset = useCallback(() => {
    if (isSwitched && activeMemberId && activeMemberId !== "self") {
      setWater(0);
      setHistory([]);
      syncClearHydration(activeMemberId);
      console.log(`💧 Switched hydration reset for ${activeMemberId}`);
    } else {
      lastStoredValue.current = 0;
      setWater(0);
      setHistory([]);

      AsyncStorage.setItem(getTodayKey(), "0").catch((err: unknown) =>
        console.log("❌ Hydration reset error:", err)
      );

      clearTodayHydrationHistory().catch((err: unknown) =>
        console.log("❌ History clear error:", err)
      );

      syncClearHydration();
      console.log(`💧 Self hydration reset`);
    }
  }, [isSwitched, activeMemberId]);

  /////////////////////////////////////////////////////////
  // Initial Load & Profile Switch Trigger
  /////////////////////////////////////////////////////////

  useEffect(() => {
    const init = async () => {
      await initHydrationHistoryDB();
      lastSyncTimeRef.current = Date.now();
      await syncHydrationWithFirebase();

      if (!isSwitched) {
        setTimeout(() => {
          initializeHydrationReminder();
        }, 800);
      }
    };
    init();
  }, [isSwitched, activeMemberId, syncHydrationWithFirebase, initializeHydrationReminder]);

  /////////////////////////////////////////////////////////
  // Reload when returning from background
  /////////////////////////////////////////////////////////

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextState === "active"
      ) {
        const today = getTodayDate();

        if (lastCheckedDate.current !== today) {
          lastCheckedDate.current = today;
          console.log("💧 New day detected — resetting hydration");
          reset();
          lastSyncTimeRef.current = Date.now();
          syncHydrationWithFirebase();
          if (!isSwitched) {
            initializeHydrationReminder();
          }
        } else {
          const now = Date.now();
          if (now - lastSyncTimeRef.current > 10000) {
            lastSyncTimeRef.current = now;
            console.log("💧 Returning to app — syncing hydration");
            syncHydrationWithFirebase();
          }
        }
      }

      appState.current = nextState;
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );

    return () => subscription.remove();
  }, [isSwitched, reset, syncHydrationWithFirebase, initializeHydrationReminder]);

  /////////////////////////////////////////////////////////
  // Expose addWater globally so addWaterFromNotification
  // can call it when the provider is mounted (app foregrounded)
  /////////////////////////////////////////////////////////

  useEffect(() => {
    globalAddWater = addWater;
    return () => {
      globalAddWater = null;
    };
  }, [addWater]);

  /////////////////////////////////////////////////////////
  // PROVIDER RETURN
  /////////////////////////////////////////////////////////

  return (
    <HydrationContext.Provider value={{ water, history, addWater, reset, reloadHistory }}>
      {children}
    </HydrationContext.Provider>
  );
};

///////////////////////////////////////////////////////////
// CUSTOM HOOK
///////////////////////////////////////////////////////////

export const useHydration = () => {
  const ctx = useContext(HydrationContext);
  if (!ctx) {
    throw new Error("useHydration must be used inside HydrationProvider");
  }
  return ctx;
};

export const addWaterFromNotification = async (ml: number) => {
  await saveWaterToStorage(ml);

  if (globalAddWater) {
    console.log(`💧 Provider mounted — reloading water state from storage`);
    globalAddWater(ml, "notification");
  } else {
    console.log(`💧 Provider not mounted — AsyncStorage updated by saveWaterToStorage`);
  }
};