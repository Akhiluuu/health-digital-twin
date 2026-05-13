// context/SymptomContext.tsx
// ─────────────────────────────────────────────────────────────────
// KEY FIX: When a family member profile is active (isSwitched=true),
// symptoms are fetched directly from that member's Firebase doc
// instead of local AsyncStorage (which is always the logged-in user).
// When switched back to self, normal local + Firebase merge is used.
// ─────────────────────────────────────────────────────────────────

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
  cancelSymptomNotification,
  scheduleSymptomHourly,
} from "../services/notifeeService";

import { useFamily } from "./FamilyContext";

const ACTIVE_KEY  = "vitaltwin_active_symptoms";
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
// CONTEXT TYPE
//////////////////////////////////////////////////////////

type SymptomContextType = {
  activeSymptoms:   Symptom[];
  historySymptoms:  HistorySymptom[];
  isLoadingMemberSymptoms: boolean;
  refreshSymptoms:  () => Promise<void>;
  logSymptom: (
    categoryId: string,
    optionId: string,
    name: string,
    severity: Symptom["severity"],
    followUpMinutes?: number,
    notes?: string,
    followUpAnswers?: string
  ) => Promise<void>;
  resolveSymptom:   (id: number) => Promise<void>;
  removeSymptom:    (id: number) => Promise<void>;
  updateSymptom:    (id: number, updates: Partial<Symptom>) => Promise<void>;
  clearHistory:     () => Promise<void>;
  logCustomSymptom: (
    description: string,
    severity?: Symptom["severity"],
    followUpMinutes?: number,
    followUpAnswers?: string
  ) => Promise<void>;
};

//////////////////////////////////////////////////////////
// CONTEXT DEFAULT
//////////////////////////////////////////////////////////

const SymptomContext = createContext<SymptomContextType>({
  activeSymptoms:  [],
  historySymptoms: [],
  isLoadingMemberSymptoms: false,
  refreshSymptoms:  async () => {},
  logSymptom:       async () => {},
  resolveSymptom:   async () => {},
  removeSymptom:    async () => {},
  updateSymptom:    async () => {},
  clearHistory:     async () => {},
  logCustomSymptom: async () => {},
});

export function useSymptoms() { return useContext(SymptomContext); }

//////////////////////////////////////////////////////////
// RETRY HELPER
//////////////////////////////////////////////////////////

const syncWithRetry = async (fn: () => Promise<void>, label: string) => {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await fn();
      return;
    } catch (error) {
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
};

//////////////////////////////////////////////////////////
// NORMALIZERS
//////////////////////////////////////////////////////////

const normalizeActiveSymptoms = (data: any[]): Symptom[] =>
  data
    .map((s) => ({
      id:              Number(s?.id ?? Date.now()),
      categoryId:      s?.categoryId      ?? "general",
      optionId:        s?.optionId        ?? "unknown",
      name:            s?.name            ?? "Unknown Symptom",
      severity:        s?.severity        ?? "mild",
      startedAt:       Number(s?.startedAt ?? Date.now()),
      notes:           s?.notes,
      followUpMinutes: s?.followUpMinutes,
      followUpAnswers: s?.followUpAnswers,
    }))
    .filter((s) => !isNaN(s.id));

const normalizeHistorySymptoms = (data: any[]): HistorySymptom[] =>
  data
    .map((s) => {
      const startedAt  = Number(s?.startedAt  ?? Date.now());
      const resolvedAt = Number(s?.resolvedAt ?? Date.now());
      return {
        id:              Number(s?.id ?? Date.now()),
        categoryId:      s?.categoryId      ?? "general",
        optionId:        s?.optionId        ?? "unknown",
        name:            s?.name            ?? "Unknown Symptom",
        severity:        s?.severity        ?? "mild",
        startedAt,
        resolvedAt,
        duration:        Number(s?.duration ?? resolvedAt - startedAt),
        notes:           s?.notes,
        followUpMinutes: s?.followUpMinutes,
        followUpAnswers: s?.followUpAnswers,
      };
    })
    .filter((s) => !isNaN(s.id));

//////////////////////////////////////////////////////////
// PROVIDER
//////////////////////////////////////////////////////////

export function SymptomsProvider({ children }: { children: React.ReactNode }) {
  const [activeSymptoms,  setActiveSymptoms]  = useState<Symptom[]>([]);
  const [historySymptoms, setHistorySymptoms] = useState<HistorySymptom[]>([]);
  const [isLoaded,        setIsLoaded]        = useState(false);
  const [isLoadingMemberSymptoms, setIsLoadingMember] = useState(false);

  // ── Get active profile context ────────────────────────
  let isSwitched     = false;
  let activeMemberId = "self";
  try {
    const family   = useFamily();
    isSwitched     = family.isSwitched;
    activeMemberId = family.activeMemberId;
  } catch (_) {}

  //////////////////////////////////////////////////////////
  // REFRESH — reacts to profile switching
  // When switched → fetch ONLY from member's Firebase doc
  // When on self  → merge local AsyncStorage + own Firebase
  //////////////////////////////////////////////////////////

  const refreshSymptoms = useCallback(async () => {
    try {
      if (isSwitched && activeMemberId && activeMemberId !== "self") {
        // ── Switched: load member's symptoms from Firebase ──
        setIsLoadingMember(true);
        console.log("🩺 Loading symptoms from Firebase for member:", activeMemberId);

        const firebaseActive  = await fetchSymptomsFromFirebase(activeMemberId);
        const firebaseHistory = await fetchSymptomHistoryFromFirebase(activeMemberId);

        const normalizedActive  = normalizeActiveSymptoms(firebaseActive   || []);
        const normalizedHistory = normalizeHistorySymptoms(firebaseHistory || []);

        // Filter out any active symptom that also appears in history
        const filteredActive = normalizedActive.filter(
          (a) => !normalizedHistory.some((h) => h.id === a.id)
        );

        setActiveSymptoms(filteredActive);
        setHistorySymptoms(normalizedHistory);

        console.log(
          `🩺 Member symptoms loaded — active: ${filteredActive.length}, history: ${normalizedHistory.length}`
        );
      } else {
        // ── Self: merge local AsyncStorage + own Firebase ──
        console.log("🔄 Syncing own symptoms from Firebase...");

        const activeRaw  = await AsyncStorage.getItem(ACTIVE_KEY);
        const historyRaw = await AsyncStorage.getItem(HISTORY_KEY);

        const localActive:  Symptom[]        = activeRaw  ? JSON.parse(activeRaw)  : [];
        const localHistory: HistorySymptom[]  = historyRaw ? JSON.parse(historyRaw) : [];

        const firebaseActive  = await fetchSymptomsFromFirebase();
        const firebaseHistory = await fetchSymptomHistoryFromFirebase();

        const normalizedActive  = normalizeActiveSymptoms(firebaseActive   || []);
        const normalizedHistory = normalizeHistorySymptoms(firebaseHistory || []);

        const mergedHistory = [...localHistory, ...normalizedHistory].filter(
          (item, index, self) => index === self.findIndex((t) => t.id === item.id)
        );

        const mergedActive = [...localActive, ...normalizedActive]
          .filter((item, index, self) => index === self.findIndex((t) => t.id === item.id))
          .filter((item) => !mergedHistory.some((h) => h.id === item.id));

        setActiveSymptoms(mergedActive);
        setHistorySymptoms(mergedHistory);

        await AsyncStorage.setItem(ACTIVE_KEY,  JSON.stringify(mergedActive));
        await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(mergedHistory));

        console.log("✅ Own symptoms synced successfully");
      }
    } catch (error) {
      console.log("❌ refreshSymptoms error:", error);
    } finally {
      setIsLoadingMember(false);
    }
  }, [isSwitched, activeMemberId]);

  //////////////////////////////////////////////////////////
  // Re-load whenever active member changes
  //////////////////////////////////////////////////////////

  useEffect(() => {
    refreshSymptoms();
  }, [isSwitched, activeMemberId]);

  //////////////////////////////////////////////////////////
  // Initial load
  //////////////////////////////////////////////////////////

  useEffect(() => {
    const initialize = async () => {
      await refreshSymptoms();
      setIsLoaded(true);
    };
    initialize();
  }, []);

  //////////////////////////////////////////////////////////
  // Auto-save OWN symptoms to AsyncStorage (only when on self)
  //////////////////////////////////////////////////////////

  useEffect(() => {
    if (isLoaded && !isSwitched) {
      AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify(activeSymptoms));
    }
  }, [activeSymptoms, isLoaded, isSwitched]);

  useEffect(() => {
    if (isLoaded && !isSwitched) {
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(historySymptoms));
    }
  }, [historySymptoms, isLoaded, isSwitched]);

  //////////////////////////////////////////////////////////
  // LOG SYMPTOM — always logs to OWN data
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
        id: now, categoryId, optionId,
        name: name.trim(), severity, startedAt: now,
        notes, followUpMinutes, followUpAnswers,
      };

      setActiveSymptoms((prev) => [...prev, newSymptom]);

      try {
        await scheduleSymptomHourly(name.trim());
      } catch (err) {
        console.log("❌ Symptom notification scheduling failed:", err);
      }

      syncWithRetry(() => syncAddSymptom({ ...newSymptom }), "AddSymptom");
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
      await logSymptom("custom", "other", description.trim(), severity, followUpMinutes, description, followUpAnswers);
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
        const duration   = resolvedAt - symptom.startedAt;
        const resolved: HistorySymptom = { ...symptom, resolvedAt, duration };

        const updatedActive = activeSymptoms.filter((s) => s.id !== id);
        setActiveSymptoms([...updatedActive]);
        setHistorySymptoms((prev) => [resolved, ...prev]);

        await AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify(updatedActive));
        const existingHistory = await AsyncStorage.getItem(HISTORY_KEY);
        const parsedHistory   = existingHistory ? JSON.parse(existingHistory) : [];
        await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify([resolved, ...parsedHistory]));

        await cancelSymptomNotification();
        syncWithRetry(() => syncResolveSymptom(id, resolvedAt, duration), "ResolveSymptom");
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
    syncWithRetry(() => syncDeleteSymptom(id), "DeleteSymptom");
  }, []);

  //////////////////////////////////////////////////////////
  // UPDATE SYMPTOM
  //////////////////////////////////////////////////////////

  const updateSymptom = useCallback(
    async (id: number, updates: Partial<Symptom>) => {
      setActiveSymptoms((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
      );
      if (updates.name) {
        await cancelSymptomNotification();
        await scheduleSymptomHourly(updates.name);
      }
      syncWithRetry(() => syncUpdateSymptom(id, updates), "UpdateSymptom");
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
        isLoadingMemberSymptoms,
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