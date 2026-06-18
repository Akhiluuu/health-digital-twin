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
  isLoadingHydration: boolean;
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

// Use LOCAL date string (YYYY-MM-DD) to avoid midnight UTC vs local timezone mismatch.
// e.g. if the user is in UTC+5:30, midnight local is 6:30pm UTC of the previous day.
const getLocalDateString = (): string => {
  const d = new Date();
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
};

const getTodayKey = () => `hydration-${getLocalDateString()}`;
const getTodayDate = () => getLocalDateString();

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
  const [isLoadingHydration, setIsLoadingHydration] = useState<boolean>(false);
  const { isSwitched, activeMemberId, reportLoading } = useFamily();

  useEffect(() => {
    if (reportLoading) {
      reportLoading("hydration", isLoadingHydration);
    }
  }, [isLoadingHydration, reportLoading]);

  const isMountedRef = React.useRef(true);
  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);

  const appState = useRef<AppStateStatus>(AppState.currentState);
  const lastStoredValue = useRef<number>(0);
  const lastCheckedDate = useRef<string>(getTodayDate());
  const lastSyncTimeRef = useRef<number>(0);

  /////////////////////////////////////////////////////////
  // Sync / Reload with Firebase
  /////////////////////////////////////////////////////////

  const syncHydrationWithFirebase = useCallback(async () => {
    setIsLoadingHydration(true);
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
        if (!isMountedRef.current) return;
        setWater(total);
        setHistory(todayEntries);
        console.log(`💧 Switched hydration synced from Firestore for ${activeMemberId}: ${total}ml`);
      } catch (err) {
        console.log("❌ Switched hydration sync error:", err);
      } finally {
        setIsLoadingHydration(false);
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
        if (!isMountedRef.current) return;
        setWater(total);
        setHistory(updatedLocal);
      } else {
        const localWater = await AsyncStorage.getItem(getTodayKey());
        if (!isMountedRef.current) return;
        setWater(localWater ? Number(localWater) : 0);
        setHistory(todayLocal);
      }
      console.log(`💧 Self hydration synced and loaded`);
    } catch (err) {
      console.log("❌ Self hydration sync error:", err);
    } finally {
      setIsLoadingHydration(false);
    }
  }, [isSwitched, activeMemberId]);

  const reloadHistory = useCallback(async () => {
    setIsLoadingHydration(true);
    if (isSwitched) {
      await syncHydrationWithFirebase();
    } else {
      try {
        const entries = getTodayHydrationHistory();
        setHistory(entries);
      } catch (err) {
        console.log("❌ History reload error:", err);
      } finally {
        setIsLoadingHydration(false);
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
        // ✅ FIX: use functional updater so `total` is always computed from
        // the latest committed state, not a potentially stale closure value.
        setWater((prev) => {
          const newTotal = prev + ml;
          const timestamp = Date.now();
          const entry = {
            id: timestamp,
            amount: ml,
            total: newTotal,
            timestamp,
            source,
          };
          // Update history with the correct total
          setHistory((prevHistory) => [entry, ...prevHistory]);
          syncAddHydration(entry, activeMemberId).catch(
            (err: unknown) => console.log("❌ Switched hydration sync error:", err)
          );
          console.log(`💧 Switched addWater: +${ml}ml → total: ${newTotal}ml for ${activeMemberId}`);
          return newTotal;
        });
      } else {
        setWater((prev) => {
          const newValue = prev + ml;
          lastStoredValue.current = newValue;

          AsyncStorage.setItem(getTodayKey(), String(newValue)).catch(
            (err: unknown) => console.log("❌ Hydration save error:", err)
          );

          addHydrationEntry(ml, newValue, source)
            .then(() => {
              if (!isMountedRef.current) return;
              const entries = getTodayHydrationHistory();
              setHistory(entries);
              const lastEntry = entries[0];
              if (lastEntry) {
                syncAddHydration(lastEntry).catch(
                  (err: unknown) => console.log("❌ Self hydration sync error:", err)
                );
              }
            })
            .catch((err: unknown) => console.log("❌ History entry error:", err));

          console.log(`💧 addWater: +${ml}ml (${source}) → total: ${newValue}ml`);

          return newValue;
        });
      }
    },
    [isSwitched, activeMemberId]
  );

  /////////////////////////////////////////////////////////
  // Reset Water Intake + History
  /////////////////////////////////////////////////////////

  const reset = useCallback(() => {
    if (isSwitched && activeMemberId && activeMemberId !== "self") {
      setWater(0);
      setHistory([]);
      syncClearHydration(activeMemberId).catch((err: unknown) =>
        console.log("❌ Switched hydration clear error:", err)
      );
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

      syncClearHydration().catch((err: unknown) =>
        console.log("❌ Self hydration Firebase clear error:", err)
      );
      console.log(`💧 Self hydration reset`);
    }
  }, [isSwitched, activeMemberId]);

  /////////////////////////////////////////////////////////
  // Initial Load & Profile Switch Trigger
  /////////////////////////////////////////////////////////

  // ── One-time DB initialization on mount ─────────────────────────────
  // initHydrationHistoryDB must only run once — not on every profile switch.
  useEffect(() => {
    initHydrationHistoryDB().catch((err: unknown) => {
      console.log("❌ HydrationHistoryDB init error:", err);
    });
  }, []);

  // ── Sync + Reminder on profile switch ─────────────────────────────────
  useEffect(() => {
    // Instantly clear hydration data on profile switch to avoid rendering previous user's data
    setWater(0);
    setHistory([]);

    lastSyncTimeRef.current = Date.now();
    syncHydrationWithFirebase();

    if (!isSwitched) {
      setTimeout(() => {
        initializeHydrationReminder();
      }, 800);
    }
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
    <HydrationContext.Provider value={{ water, history, isLoadingHydration, addWater, reset, reloadHistory }}>
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
  if (globalAddWater) {
    console.log(`💧 Provider mounted — adding water via active context`);
    globalAddWater(ml, "notification");
  } else {
    console.log(`💧 Provider not mounted — writing directly to storage/DB`);
    await saveWaterToStorage(ml);
  }
};