// context/SymptomContext.tsx

import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  syncAddSymptom,
  syncDeleteSymptom,
  syncResolveSymptom,
  syncUpdateSymptom,
  fetchSymptomsFromFirebase,
  fetchSymptomHistoryFromFirebase,
} from "../services/firebaseSync";

import {
  // ✅ FIX 6: Removed scheduleSymptomCheck (deprecated) from imports.
  //    updateSymptom was calling the old daily-scheduled version instead
  //    of the hourly one, meaning rescheduled follow-ups fired at a fixed
  //    time of day (8pm default) rather than 1 hour from now.
  cancelSymptomNotification,
  scheduleSymptomHourly,
} from "../services/notifeeService";

const ACTIVE_KEY = "vitaltwin_active_symptoms";
const HISTORY_KEY = "vitaltwin_symptom_history";

//////////////////////////////////////////////////////////
// TYPES
//////////////////////////////////////////////////////////

export type Symptom = {
  id: number;
  categoryId: string;
  optionId: string;
  name: string;
  severity: "mild" | "moderate" | "severe" | "emergency" | string;
  startedAt: number;
  resolvedAt?: number;
  notes?: string;
  followUpMinutes?: number;
  followUpAnswers?: string;
};

export type HistorySymptom = Symptom & {
  resolvedAt: number;
  duration: number;
};

//////////////////////////////////////////////////////////

type SymptomContextType = {
  activeSymptoms: Symptom[];
  historySymptoms: HistorySymptom[];
  refreshSymptoms: () => Promise<void>;
  logSymptom: (
    categoryId: string,
    optionId: string,
    name: string,
    severity: Symptom["severity"],
    followUpMinutes?: number,
    notes?: string,
    followUpAnswers?: string
  ) => Promise<void>;
  resolveSymptom: (id: number) => Promise<void>;
  removeSymptom: (id: number) => Promise<void>;
  updateSymptom: (
    id: number,
    updates: Partial<Symptom>
  ) => Promise<void>;
  clearHistory: () => Promise<void>;
  logCustomSymptom: (
    description: string,
    severity?: Symptom["severity"],
    followUpMinutes?: number,
    followUpAnswers?: string
  ) => Promise<void>;
};

//////////////////////////////////////////////////////////

const SymptomContext = createContext<SymptomContextType>({
  activeSymptoms: [],
  historySymptoms: [],
  refreshSymptoms: async () => {},
  logSymptom: async () => {},
  resolveSymptom: async () => {},
  removeSymptom: async () => {},
  updateSymptom: async () => {},
  clearHistory: async () => {},
  logCustomSymptom: async () => {},
});

export function useSymptoms() {
  return useContext(SymptomContext);
}

//////////////////////////////////////////////////////////
// RETRY HELPER
//////////////////////////////////////////////////////////

const syncWithRetry = async (
  fn: () => Promise<void>,
  label: string
) => {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await fn();
      console.log(`✅ ${label} synced (attempt ${attempt})`);
      return;
    } catch (error) {
      console.log(`⚠️ ${label} attempt ${attempt} failed`, error);
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, attempt * 2000));
      }
    }
  }
};

//////////////////////////////////////////////////////////
// PROVIDER
//////////////////////////////////////////////////////////

export function SymptomsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [activeSymptoms, setActiveSymptoms] = useState<Symptom[]>([]);
  const [historySymptoms, setHistorySymptoms] = useState<HistorySymptom[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  //////////////////////////////////////////////////////////
  // NORMALIZE FIREBASE DATA
  //////////////////////////////////////////////////////////

  const normalizeActiveSymptoms = (data: any[]): Symptom[] => {
    return data
      .map((s) => ({
        id: Number(s?.id ?? Date.now()),
        categoryId: s?.categoryId ?? "general",
        optionId: s?.optionId ?? "unknown",
        name: s?.name ?? "Unknown Symptom",
        severity: s?.severity ?? "mild",
        startedAt: Number(s?.startedAt ?? Date.now()),
        notes: s?.notes,
        followUpMinutes: s?.followUpMinutes,
        followUpAnswers: s?.followUpAnswers,
      }))
      .filter((s) => !isNaN(s.id));
  };

  const normalizeHistorySymptoms = (data: any[]): HistorySymptom[] => {
    return data
      .map((s) => {
        const startedAt = Number(s?.startedAt ?? Date.now());
        const resolvedAt = Number(s?.resolvedAt ?? Date.now());
        return {
          id: Number(s?.id ?? Date.now()),
          categoryId: s?.categoryId ?? "general",
          optionId: s?.optionId ?? "unknown",
          name: s?.name ?? "Unknown Symptom",
          severity: s?.severity ?? "mild",
          startedAt,
          resolvedAt,
          duration: Number(s?.duration ?? resolvedAt - startedAt),
          notes: s?.notes,
          followUpMinutes: s?.followUpMinutes,
          followUpAnswers: s?.followUpAnswers,
        };
      })
      .filter((s) => !isNaN(s.id));
  };

  //////////////////////////////////////////////////////////
  // REFRESH FROM FIREBASE + LOCAL STORAGE
  //////////////////////////////////////////////////////////

  const refreshSymptoms = useCallback(async () => {
    try {
      console.log("🔄 Syncing symptoms from Firebase...");

      const activeRaw = await AsyncStorage.getItem(ACTIVE_KEY);
      const historyRaw = await AsyncStorage.getItem(HISTORY_KEY);

      const localActive: Symptom[] = activeRaw ? JSON.parse(activeRaw) : [];
      const localHistory: HistorySymptom[] = historyRaw ? JSON.parse(historyRaw) : [];

      const firebaseActive = await fetchSymptomsFromFirebase();
      const firebaseHistory = await fetchSymptomHistoryFromFirebase();

      const normalizedActive = normalizeActiveSymptoms(firebaseActive || []);
      const normalizedHistory = normalizeHistorySymptoms(firebaseHistory || []);

      

      // ✅ FIRST create history
const mergedHistory = [...localHistory, ...normalizedHistory].filter(
  (item, index, self) =>
    index === self.findIndex((t) => t.id === item.id)
);

// ✅ THEN create active
const mergedActive = [...localActive, ...normalizedActive]
  .filter(
    (item, index, self) =>
      index === self.findIndex((t) => t.id === item.id)
  )
  .filter(
    (item) => !(mergedHistory || []).some((h) => h.id === item.id)
  );

      setActiveSymptoms(mergedActive);
      setHistorySymptoms(mergedHistory);

      await AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify(mergedActive));
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(mergedHistory));

      console.log("✅ Symptoms synced successfully");
    } catch (error) {
      console.log("❌ Refresh error:", error);
    }
  }, []);

  //////////////////////////////////////////////////////////
  // LOAD & SYNC ON APP START
  //////////////////////////////////////////////////////////

  useEffect(() => {
    const initialize = async () => {
      await refreshSymptoms();
      setIsLoaded(true);
    };
    initialize();
  }, [refreshSymptoms]);

  //////////////////////////////////////////////////////////
  // AUTO SAVE TO ASYNC STORAGE
  //////////////////////////////////////////////////////////

  useEffect(() => {
    if (isLoaded) {
      AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify(activeSymptoms));
    }
  }, [activeSymptoms, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(historySymptoms));
    }
  }, [historySymptoms, isLoaded]);

  //////////////////////////////////////////////////////////
  // LOG SYMPTOM
  //////////////////////////////////////////////////////////

  const logSymptom = useCallback(
    async (
      categoryId: string,
      optionId: string,
      name: string,
      severity: Symptom["severity"],
      followUpMinutes?: number,
      notes?: string,
      followUpAnswers?: string
    ) => {
      const now = Date.now();

      const newSymptom: Symptom = {
        id: now,
        categoryId,
        optionId,
        name: name.trim(),
        severity,
        startedAt: now,
        notes,
        followUpMinutes,
        followUpAnswers,
      };

      setActiveSymptoms((prev) => [...prev, newSymptom]);

      // 🔔 Schedule hourly follow-up notification
      try {
        await scheduleSymptomHourly(name.trim());
        console.log("🩺 Symptom hourly notification scheduled for:", name);
      } catch (err) {
        console.log("❌ Symptom notification scheduling failed:", err);
      }

      syncWithRetry(
        () => syncAddSymptom({ ...newSymptom }),
        "AddSymptom"
      );
    },
    []
  );

  //////////////////////////////////////////////////////////
  // LOG CUSTOM SYMPTOM
  //////////////////////////////////////////////////////////

  const logCustomSymptom = useCallback(
    async (
      description: string,
      severity: Symptom["severity"] = "mild",
      followUpMinutes?: number,
      followUpAnswers?: string
    ) => {
      if (!description.trim()) return;

      await logSymptom(
        "custom",
        "other",
        description.trim(),
        severity,
        followUpMinutes,
        description,
        followUpAnswers
      );
    },
    [logSymptom]
  );

  //////////////////////////////////////////////////////////
  // RESOLVE SYMPTOM
  //////////////////////////////////////////////////////////

  const resolveSymptom = useCallback(
    async (id: number) => {
      try {
        const symptom = activeSymptoms.find((s) => s.id === id);
        if (!symptom) return;

        const resolvedAt = Date.now();
        const duration = resolvedAt - symptom.startedAt;

        const resolved: HistorySymptom = {
          ...symptom,
          resolvedAt,
          duration,
        };

        const updatedActive = activeSymptoms.filter((s) => s.id !== id);
        setActiveSymptoms([...updatedActive]);

        setHistorySymptoms((prev) => [resolved, ...prev]);

        await AsyncStorage.setItem(
          ACTIVE_KEY,
          JSON.stringify(updatedActive)
        );

        const existingHistory = await AsyncStorage.getItem(HISTORY_KEY);
        const parsedHistory = existingHistory
          ? JSON.parse(existingHistory)
          : [];

        await AsyncStorage.setItem(
          HISTORY_KEY,
          JSON.stringify([resolved, ...parsedHistory])
        );

        await cancelSymptomNotification();

        syncWithRetry(
          () => syncResolveSymptom(id, resolvedAt, duration),
          "ResolveSymptom"
        );

        console.log("✅ Symptom moved to history:", id);
      } catch (err) {
        console.log("❌ Resolve error:", err);
      }
    },
    [activeSymptoms]
  );

  //////////////////////////////////////////////////////////
  // REMOVE SYMPTOM
  //////////////////////////////////////////////////////////

  const removeSymptom = useCallback(async (id: number) => {
    setActiveSymptoms((prev) => prev.filter((s) => s.id !== id));

    await cancelSymptomNotification();

    syncWithRetry(
      () => syncDeleteSymptom(id),
      "DeleteSymptom"
    );
  }, []);

  //////////////////////////////////////////////////////////
  // UPDATE SYMPTOM
  // ✅ FIX 6: Replaced deprecated scheduleSymptomCheck (which fired at a
  //    fixed time of day) with scheduleSymptomHourly (fires 1 hour from now).
  //    The old function was also still imported — now removed from imports.
  //////////////////////////////////////////////////////////

  const updateSymptom = useCallback(
    async (id: number, updates: Partial<Symptom>) => {
      setActiveSymptoms((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
      );

      if (updates.name) {
        await cancelSymptomNotification();
        await scheduleSymptomHourly(updates.name);
        console.log("🩺 Rescheduled hourly notification for updated symptom:", updates.name);
      }

      syncWithRetry(
        () => syncUpdateSymptom(id, updates),
        "UpdateSymptom"
      );
    },
    []
  );

  //////////////////////////////////////////////////////////
  // CLEAR HISTORY
  //////////////////////////////////////////////////////////

  const clearHistory = useCallback(async () => {
    setHistorySymptoms([]);
    await AsyncStorage.removeItem(HISTORY_KEY);
  }, []);

  //////////////////////////////////////////////////////////
  // PROVIDER
  //////////////////////////////////////////////////////////

  return (
    <SymptomContext.Provider
      value={{
        activeSymptoms,
        historySymptoms,
        refreshSymptoms,
        logSymptom,
        resolveSymptom,
        removeSymptom,
        updateSymptom,
        clearHistory,
        logCustomSymptom,
      }}
    >
      {children}
    </SymptomContext.Provider>
  );
}