// context/StepContext.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Step Provider with Multi-Profile Sandboxing and Firestore Sync
// ─────────────────────────────────────────────────────────────────────────────

import AsyncStorage from "@react-native-async-storage/async-storage";
import notifee, {
  AndroidImportance,
} from "@notifee/react-native";
import { Accelerometer, Pedometer } from "expo-sensors";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";
import { AppState, AppStateStatus, Platform } from "react-native";
import { useFamily } from "./FamilyContext";
import { syncStepsData, fetchStepsDataFromFirebase } from "../services/firebaseSync";
import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import {
  startForegroundStepService,
  stopForegroundStepService,
  updateForegroundNotification,
  registerStopTrackingCallback,
  listenForegroundServiceEvents,
  stepEventEmitter,
} from "../services/foregroundStepService";

// ── Storage Keys Generator ───────────────────────────────────────────────────
const getKeysForUser = (uid: string) => ({
  goal:         `step_goal_v7_${uid}`,
  date:         `step_date_v7_${uid}`,
  totalToday:   `step_total_today_v7_${uid}`,
  isTracking:   `step_is_tracking_v7_${uid}`,
  sessionStart: `step_session_start_v7_${uid}`,
  lastMoveTs:   `step_last_move_ts_v7_${uid}`,
});

const todayString = () => new Date().toISOString().slice(0, 10);

const BACKGROUND_STEP_SYNC_TASK = "BACKGROUND_STEP_SYNC_TASK";

TaskManager.defineTask(BACKGROUND_STEP_SYNC_TASK, async () => {
  try {
    console.log("[BACKGROUND_STEP_SYNC_TASK] Syncing steps from native history database...");
    
    // Read the active profile member UID
    const activeUid = await AsyncStorage.getItem("vitalhealth_active_member_id") || "self";
    const keys = getKeysForUser(activeUid);
    const trackingState = await AsyncStorage.getItem(keys.isTracking);
    
    // Only run if active tracking is on
    if (trackingState === "1") {
      let stepsToSync = 0;
      
      if (Platform.OS === "ios") {
        const available = await Pedometer.isAvailableAsync();
        if (available) {
          const start = new Date();
          start.setHours(0, 0, 0, 0);
          const end = new Date();
          const response = await Pedometer.getStepCountAsync(start, end);
          if (response && typeof response.steps === "number") {
            stepsToSync = response.steps;
          }
        }
      } else {
        // Android: Read the last known accumulated step count from AsyncStorage
        const rawToday = await AsyncStorage.getItem(keys.totalToday);
        stepsToSync = parseInt(rawToday ?? "0", 10);
      }

      if (stepsToSync > 0) {
        // If iOS and response.steps is greater than local storage
        if (Platform.OS === "ios") {
          const rawToday = await AsyncStorage.getItem(keys.totalToday);
          const currentSteps = parseInt(rawToday ?? "0", 10);
          if (stepsToSync > currentSteps) {
            await AsyncStorage.setItem(keys.totalToday, String(stepsToSync));
          } else {
            // If native iOS count is less, use what we have in local storage
            stepsToSync = currentSteps;
          }
        }

        const rawGoal = await AsyncStorage.getItem(keys.goal);
        const goal = parseInt(rawGoal ?? "10000", 10);
        
        // Read weight to compute calories
        const rawWeight = await AsyncStorage.getItem(`profile_weight_${activeUid}`) || "70";
        const weightVal = parseFloat(rawWeight.replace(/[^0-9.]/g, "")) || 70;
        const kcal = Math.round(stepsToSync * 0.04 * (weightVal / 70));
        
        // Update Android foreground notification if active
        if (Platform.OS === "android") {
          await updateForegroundNotification(stepsToSync, kcal).catch(() => {});
        }

        await syncStepsData({
          steps: stepsToSync,
          goal: goal,
          isTracking: true,
          lastMoveTs: Date.now(),
          date: todayString(),
        }, activeUid !== "self" ? activeUid : undefined);
        console.log(`[BACKGROUND_STEP_SYNC_TASK] Successfully updated background steps to: ${stepsToSync}`);
      }
    }
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (err) {
    console.error("[BACKGROUND_STEP_SYNC_TASK] Error running background step task:", err);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

const ARM_THRESH  = 2.3;   // g-force to arm the detector
const FIRE_THRESH = 1.05;  // g-force to fire (must fall this low after arming)
const PEAK_MIN    = 2.5;   // peak must exceed this to count (rejects soft bumps)
const STEP_GAP_MS = 650;   // minimum ms between steps (~92 steps/min max)

class StepDetector {
  private armed       = false;
  private peak        = 0;
  private lastStepAt  = 0;
  onStep: (() => void) | null = null;

  feed(x: number, y: number, z: number) {
    const mag = Math.sqrt(x * x + y * y + z * z);

    if (!this.armed) {
      if (mag > ARM_THRESH) {
        this.armed = true;
        this.peak  = mag;
      }
      return;
    }

    if (mag > this.peak) {
      this.peak = mag;
    }

    if (mag < FIRE_THRESH) {
      const peaked = this.peak;
      this.armed   = false;
      this.peak    = 0;

      if (peaked < PEAK_MIN) return;
      const now = Date.now();
      if (now - this.lastStepAt < STEP_GAP_MS) return;

      this.lastStepAt = now;
      this.onStep?.();
    }
  }

  reset() {
    this.armed      = false;
    this.peak       = 0;
    this.lastStepAt = 0;
  }
}

interface StepContextValue {
  steps:         number;
  calories:      number;
  distanceKm:    number;
  goal:          number;
  sessionSecs:   number;
  isTracking:    boolean;
  usingFallback: boolean;
  setGoal:       (g: number) => void;
  startTracking: () => Promise<void>;
  stopTracking:  () => Promise<void>;
  resetToday:    () => Promise<void>;
}

const StepContext = createContext<StepContextValue>({} as StepContextValue);
export const useSteps = () => useContext(StepContext);

export const StepProvider: React.FC<{
  children:  React.ReactNode;
  weightKg?: number;
  heightCm?: number;
}> = ({ children, weightKg = 70, heightCm = 170 }) => {

  const [steps,         setSteps]         = useState(0);
  const [goal,          setGoalState]     = useState(10000);
  const [sessionSecs,   setSessionSecs]   = useState(0);
  const [isTracking,    setIsTracking]    = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);

  const { isSwitched, activeMemberId } = useFamily();
  const userUid = isSwitched && activeMemberId ? activeMemberId : "self";
  const userKeys = useMemo(() => getKeysForUser(userUid), [userUid]);

  // ── Core refs ─────────────────────────────────────────────────────────────
  const stepsRef        = useRef(0);
  const goalRef         = useRef(10000);
  const isTrackingRef   = useRef(false);
  const dirtyRef        = useRef(false);

  // ── Sensor & timer refs ───────────────────────────────────────────────────
  const pedometerSub    = useRef<{ remove: () => void } | null>(null);
  const accelSub        = useRef<{ remove: () => void } | null>(null);
  const clockRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const flushRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const sedRef          = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef     = useRef<AppStateStatus>(AppState.currentState);
  const detector        = useRef(new StepDetector());

  // ── Derived metrics ───────────────────────────────────────────────────────
  const strideM    = 0.413 * (heightCm / 100);
  const distanceKm = parseFloat(((steps * strideM) / 1000).toFixed(2));
  const calories   = Math.round(steps * 0.04 * (weightKg / 70));

  // ─────────────────────────────────────────────────────────────────────────
  // STEP UPDATE
  // ─────────────────────────────────────────────────────────────────────────
  const addSteps = useCallback((delta: number) => {
    if (delta <= 0) return;
    stepsRef.current += delta;
    dirtyRef.current  = true;
    setSteps(stepsRef.current);

    if (isTrackingRef.current && Platform.OS === "android") {
      const kcal = Math.round(stepsRef.current * 0.04 * (weightKg / 70));
      updateForegroundNotification(stepsRef.current, kcal).catch(() => {});
    }
  }, [weightKg]);

  const setStepsAbsolute = useCallback((n: number) => {
    stepsRef.current = Math.max(0, n);
    setSteps(stepsRef.current);

    if (isTrackingRef.current && Platform.OS === "android") {
      const kcal = Math.round(stepsRef.current * 0.04 * (weightKg / 70));
      updateForegroundNotification(stepsRef.current, kcal).catch(() => {});
    }
  }, [weightKg]);

  // ── Native Hardware Pedometer Sync Helper ───────────────────────────────────
  const syncWithHardwarePedometer = useCallback(async (currentVal: number) => {
    if (Platform.OS === "android") {
      return currentVal;
    }
    try {
      const available = await Pedometer.isAvailableAsync();
      if (!available) {
        console.log("[StepContext] Native pedometer history not available on this device.");
        return currentVal;
      }
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      const response = await Pedometer.getStepCountAsync(start, end);
      if (response && typeof response.steps === "number") {
        console.log(`[StepContext] Fetched steps from native OS pedometer database: ${response.steps}`);
        if (response.steps > currentVal) {
          return response.steps;
        }
      }
    } catch (err) {
      console.warn("[StepContext] Error querying native pedometer history:", err);
    }
    return currentVal;
  }, []);

  const registerBgTask = useCallback(async () => {
    try {
      const isReg = await TaskManager.isTaskRegisteredAsync(BACKGROUND_STEP_SYNC_TASK);
      if (!isReg) {
        await BackgroundFetch.registerTaskAsync(BACKGROUND_STEP_SYNC_TASK, {
          minimumInterval: 15 * 60, // 15 minutes
          stopOnTerminate: false,
          startOnBoot: true,
        });
        console.log("[StepContext] Registered BACKGROUND_STEP_SYNC_TASK successfully.");
      }
    } catch (err) {
      console.warn("[StepContext] Failed to register background step task:", err);
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // FLUSH loop
  // ─────────────────────────────────────────────────────────────────────────
  const startFlushLoop = useCallback(() => {
    if (Platform.OS === "android") return;
    if (flushRef.current) clearInterval(flushRef.current);
    flushRef.current = setInterval(async () => {
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      const currentSteps = stepsRef.current;
      await AsyncStorage.multiSet([
        [userKeys.totalToday, String(currentSteps)],
        [userKeys.lastMoveTs, String(Date.now())],
      ]);

      await syncStepsData({
        steps: currentSteps,
        goal: goalRef.current,
        isTracking: isTrackingRef.current,
        lastMoveTs: Date.now(),
        date: todayString(),
      }, isSwitched ? activeMemberId : undefined);
    }, 5000);
  }, [userKeys, isSwitched, activeMemberId]);

  const stopFlushLoop = useCallback(() => {
    if (flushRef.current) { clearInterval(flushRef.current); flushRef.current = null; }
  }, []);

  const flushNow = useCallback(async () => {
    if (Platform.OS === "android") return;
    dirtyRef.current = false;
    const currentSteps = stepsRef.current;
    await AsyncStorage.multiSet([
      [userKeys.totalToday, String(currentSteps)],
      [userKeys.lastMoveTs, String(Date.now())],
    ]);

    await syncStepsData({
      steps: currentSteps,
      goal: goalRef.current,
      isTracking: isTrackingRef.current,
      lastMoveTs: Date.now(),
      date: todayString(),
    }, isSwitched ? activeMemberId : undefined);
  }, [userKeys, isSwitched, activeMemberId]);

  // ── Goal ──────────────────────────────────────────────────────────────────
  const setGoal = useCallback((g: number) => {
    setGoalState(g);
    goalRef.current = g;
    AsyncStorage.setItem(userKeys.goal, String(g));

    syncStepsData({
      steps: stepsRef.current,
      goal: g,
      isTracking: isTrackingRef.current,
      lastMoveTs: Date.now(),
      date: todayString(),
    }, isSwitched ? activeMemberId : undefined).catch(() => {});

    if (Platform.OS === "android" && isTrackingRef.current) {
      const kcal = Math.round(stepsRef.current * 0.04 * (weightKg / 70));
      updateForegroundNotification(stepsRef.current, kcal).catch(() => {});
    }
  }, [userKeys, isSwitched, activeMemberId, weightKg]);

  // ── Session clock ─────────────────────────────────────────────────────────
  const startClock = useCallback((elapsedMs = 0) => {
    if (clockRef.current) clearInterval(clockRef.current);
    const origin = Date.now() - elapsedMs;
    clockRef.current = setInterval(() => {
      setSessionSecs(Math.floor((Date.now() - origin) / 1000));
    }, 1000);
  }, []);

  const stopClock = useCallback(() => {
    if (clockRef.current) { clearInterval(clockRef.current); clockRef.current = null; }
  }, []);

  // ── Sedentary notification ───────────────────────────────────────────────
  const startSedTimer = useCallback(() => {
    if (sedRef.current) clearInterval(sedRef.current);
    sedRef.current = setInterval(async () => {
      const raw = await AsyncStorage.getItem(userKeys.lastMoveTs);
      const last = parseInt(raw ?? String(Date.now()), 10);
      if ((Date.now() - last) / 60000 >= 60) {
        try {
          await notifee.createChannel({
            id: "health",
            name: "Health Notifications",
            importance: AndroidImportance.HIGH,
          });
          await notifee.displayNotification({
            title: "Move a little! 🚶",
            body: "You've been inactive for over an hour.",
            android: {
              channelId: "health",
              pressAction: {
                id: "default",
              },
            },
          });
        } catch (error) {
          console.log("Sedentary notification error:", error);
        }
      }
    }, 5 * 60 * 1000);
  }, [userKeys.lastMoveTs]);

  const stopSedTimer = useCallback(() => {
    if (sedRef.current) { clearInterval(sedRef.current); sedRef.current = null; }
  }, []);

  // ── Tear down sensors ─────────────────────────────────────────────────────
  const stopSensors = useCallback(() => {
    pedometerSub.current?.remove();
    accelSub.current?.remove();
    pedometerSub.current    = null;
    accelSub.current        = null;
    detector.current.onStep = null;
  }, []);

  const subscribePedometer = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === "android") return false;
    try {
      const available = await Pedometer.isAvailableAsync();
      if (!available) return false;

      pedometerSub.current?.remove();
      pedometerSub.current = null;

      let sessionBaseline: number | null = null;
      let lastOsSteps: number | null     = null;

      pedometerSub.current = Pedometer.watchStepCount((result) => {
        const osSteps = result.steps;

        if (sessionBaseline === null) {
          sessionBaseline = osSteps;
          lastOsSteps     = osSteps;
          return;
        }

        if (lastOsSteps === null) {
          lastOsSteps = osSteps;
          return;
        }

        const delta = osSteps - lastOsSteps;
        lastOsSteps = osSteps;

        if (delta <= 0) return;
        if (delta > 20) return;

        addSteps(delta);
      });

      return true;
    } catch {
      return false;
    }
  }, [addSteps]);

  const subscribeAccelerometer = useCallback(() => {
    if (Platform.OS === "android") return;
    accelSub.current?.remove();
    accelSub.current = null;
    detector.current.reset();
    detector.current.onStep = () => addSteps(1);

    Accelerometer.setUpdateInterval(200);
    accelSub.current = Accelerometer.addListener(({ x, y, z }) => {
      detector.current.feed(x, y, z);
    });
  }, [addSteps]);

  const startBestSensor = useCallback(async () => {
    stopSensors();
    const pedoOk = await subscribePedometer();
    if (pedoOk) {
      setUsingFallback(false);
    } else {
      subscribeAccelerometer();
      setUsingFallback(true);
    }
  }, [stopSensors, subscribePedometer, subscribeAccelerometer]);

  // ─────────────────────────────────────────────────────────────────────────
  // START TRACKING
  // ─────────────────────────────────────────────────────────────────────────
  const startTracking = useCallback(async () => {
    if (isTrackingRef.current) return;

    await notifee.requestPermission();
    if (Platform.OS === "android") {
      try {
        await (Pedometer as any).requestPermissionsAsync?.();
      } catch (e) {
        console.warn("Failed to request Pedometer permissions:", e);
      }
    }
    const now = Date.now();

    // Query hardware pedometer before starting to set baseline correctly
    let currentSteps = stepsRef.current;
    const freshSteps = await syncWithHardwarePedometer(currentSteps);
    if (freshSteps > currentSteps) {
      currentSteps = freshSteps;
      setStepsAbsolute(freshSteps);
    }

    await AsyncStorage.multiSet([
      [userKeys.isTracking,   "1"],
      [userKeys.date,         todayString()],
      [userKeys.sessionStart, String(now)],
      [userKeys.totalToday,   String(currentSteps)],
      [userKeys.lastMoveTs,   String(now)],
    ]);

    isTrackingRef.current = true;
    setIsTracking(true);
    setSessionSecs(0);

    await startBestSensor();
    startClock(0);
    startSedTimer();
    startFlushLoop();

    if (Platform.OS === "android") {
      await startForegroundStepService();
      const kcal = Math.round(currentSteps * 0.04 * (weightKg / 70));
      await updateForegroundNotification(currentSteps, kcal);
    }
  }, [startBestSensor, startClock, startSedTimer, startFlushLoop, userKeys, syncWithHardwarePedometer, setStepsAbsolute, weightKg]);

  // ─────────────────────────────────────────────────────────────────────────
  // STOP TRACKING
  // ─────────────────────────────────────────────────────────────────────────
  const stopTracking = useCallback(async () => {
    // Query native pedometer one final time to catch up on everything
    let currentSteps = stepsRef.current;
    const freshSteps = await syncWithHardwarePedometer(currentSteps);
    if (freshSteps > currentSteps) {
      setStepsAbsolute(freshSteps);
    }

    stopSensors();
    stopClock();
    stopSedTimer();
    stopFlushLoop();
    await flushNow();

    await AsyncStorage.setItem(userKeys.isTracking, "0");

    isTrackingRef.current = false;
    setIsTracking(false);

    if (Platform.OS === "android") {
      await stopForegroundStepService();
    }
  }, [stopSensors, stopClock, stopSedTimer, stopFlushLoop, flushNow, userKeys, syncWithHardwarePedometer, setStepsAbsolute]);

  // ─────────────────────────────────────────────────────────────────────────
  // RESET TODAY
  // ─────────────────────────────────────────────────────────────────────────
  const resetToday = useCallback(async () => {
    stopSensors();
    stopClock();
    stopSedTimer();
    stopFlushLoop();

    stepsRef.current      = 0;
    isTrackingRef.current = false;
    dirtyRef.current      = false;

    setSteps(0);
    setSessionSecs(0);
    setIsTracking(false);

    await AsyncStorage.multiSet([
      [userKeys.totalToday,   "0"],
      [userKeys.date,         todayString()],
      [userKeys.sessionStart, String(Date.now())],
      [userKeys.isTracking,   "0"],
    ]);

    await syncStepsData({
      steps: 0,
      goal: goalRef.current,
      isTracking: false,
      lastMoveTs: Date.now(),
      date: todayString(),
    }, isSwitched ? activeMemberId : undefined);

    if (Platform.OS === "android") {
      await stopForegroundStepService();
    }
  }, [stopSensors, stopClock, stopSedTimer, stopFlushLoop, userKeys, isSwitched, activeMemberId]);

  // ─────────────────────────────────────────────────────────────────────────
  // RESTORE & SYNC ON USER / MOUNT CHANGE
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;

    const loadAndSync = async () => {
      stopSensors();
      stopClock();
      stopSedTimer();
      stopFlushLoop();

      stepsRef.current = 0;
      isTrackingRef.current = false;
      dirtyRef.current = false;
      setSteps(0);
      setSessionSecs(0);
      setIsTracking(false);

      const pairs = await AsyncStorage.multiGet([
        userKeys.goal, userKeys.date, userKeys.totalToday, userKeys.isTracking, userKeys.sessionStart,
      ]);
      if (!alive) return;

      const m = Object.fromEntries(pairs.map(([k, v]) => [k, v ?? ""]));
      const today = todayString();

      let savedSteps = 0;
      let savedGoal = 10000;
      let savedIsTracking = false;
      let savedSessionStart = Date.now();

      const firebaseData = await fetchStepsDataFromFirebase(today, isSwitched ? activeMemberId : undefined);
      if (!alive) return;

      if (m[userKeys.goal]) {
        savedGoal = parseInt(m[userKeys.goal], 10);
      } else if (firebaseData?.goal) {
        savedGoal = firebaseData.goal;
      }
      setGoalState(savedGoal);
      goalRef.current = savedGoal;

      if (m[userKeys.date] && m[userKeys.date] === today) {
        savedSteps = parseInt(m[userKeys.totalToday] || "0", 10);
        savedIsTracking = m[userKeys.isTracking] === "1";
        savedSessionStart = parseInt(m[userKeys.sessionStart] || String(Date.now()), 10);

        if (firebaseData && firebaseData.steps > savedSteps) {
          savedSteps = firebaseData.steps;
          await AsyncStorage.setItem(userKeys.totalToday, String(savedSteps));
        } else if (firebaseData && savedSteps > firebaseData.steps) {
          await syncStepsData({
            steps: savedSteps,
            goal: savedGoal,
            isTracking: savedIsTracking,
            lastMoveTs: Date.now(),
            date: today,
          }, isSwitched ? activeMemberId : undefined);
        }
      } else {
        if (firebaseData) {
          savedSteps = firebaseData.steps;
          savedIsTracking = firebaseData.isTracking;
          savedSessionStart = firebaseData.sessionStart || Date.now();
        } else {
          savedSteps = 0;
          savedIsTracking = false;
          savedSessionStart = Date.now();
        }

        await AsyncStorage.multiSet([
          [userKeys.date, today],
          [userKeys.totalToday, String(savedSteps)],
          [userKeys.isTracking, savedIsTracking ? "1" : "0"],
          [userKeys.sessionStart, String(savedSessionStart)],
        ]);
      }

      // Register the background fetch task on mount / profile change
      registerBgTask().catch(() => {});

      // Query native hardware pedometer to recover/sync steps taken while app was closed
      let finalSteps = await syncWithHardwarePedometer(savedSteps);
      if (finalSteps > savedSteps) {
        savedSteps = finalSteps;
        await AsyncStorage.setItem(userKeys.totalToday, String(savedSteps));
        await syncStepsData({
          steps: savedSteps,
          goal: savedGoal,
          isTracking: savedIsTracking,
          lastMoveTs: Date.now(),
          date: today,
        }, isSwitched ? activeMemberId : undefined);
      }

      setStepsAbsolute(savedSteps);
      setIsTracking(savedIsTracking);
      isTrackingRef.current = savedIsTracking;

      if (savedIsTracking) {
        const elapsed = Date.now() - savedSessionStart;
        startClock(elapsed);
        await startBestSensor();
        startSedTimer();
        startFlushLoop();
        if (Platform.OS === "android") {
          await startForegroundStepService().catch(() => {});
        }
      }
    };

    loadAndSync();

    return () => {
      alive = false;
      stopSensors();
      stopClock();
      stopSedTimer();
      stopFlushLoop();
    };
  }, [userUid, userKeys, isSwitched, activeMemberId, startClock, startBestSensor, startSedTimer, startFlushLoop, setStepsAbsolute, syncWithHardwarePedometer, registerBgTask, stopSensors, stopClock, stopSedTimer, stopFlushLoop]);

  // ─────────────────────────────────────────────────────────────────────────
  // APP STATE
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (next) => {
      const goingBackground = next.match(/inactive|background/);
      const comingForeground =
        appStateRef.current.match(/inactive|background/) && next === "active";

      if (goingBackground && isTrackingRef.current) {
        await flushNow();
      }

      if (comingForeground) {
        // First check if tracking was disabled in background via notification
        const rawTracking = await AsyncStorage.getItem(userKeys.isTracking);
        if (rawTracking === "0" && isTrackingRef.current) {
          console.log("[StepContext] Detected tracking stopped in background");
          stopSensors();
          stopClock();
          stopSedTimer();
          stopFlushLoop();
          isTrackingRef.current = false;
          setIsTracking(false);
          return;
        }

        // Query hardware pedometer first to catch up on steps taken in background
        const currentSteps = stepsRef.current;
        const freshSteps = await syncWithHardwarePedometer(currentSteps);
        if (freshSteps > currentSteps) {
          setStepsAbsolute(freshSteps);
          await AsyncStorage.setItem(userKeys.totalToday, String(freshSteps));
          await syncStepsData({
            steps: freshSteps,
            goal: goalRef.current,
            isTracking: true,
            lastMoveTs: Date.now(),
            date: todayString(),
          }, isSwitched ? activeMemberId : undefined);
        }

        const raw    = await AsyncStorage.getItem(userKeys.totalToday);
        const saved  = parseInt(raw ?? "0", 10);
        if (saved > stepsRef.current) {
          setStepsAbsolute(saved);
        }
        if (isTrackingRef.current) {
          await startBestSensor();
          startFlushLoop();
        }
      }

      appStateRef.current = next;
    });

    return () => sub.remove();
  }, [userKeys, startBestSensor, startFlushLoop, flushNow, setStepsAbsolute, syncWithHardwarePedometer, isSwitched, activeMemberId, stopSensors, stopClock, stopSedTimer]);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    registerStopTrackingCallback(() => {
      stopTracking();
    });

    const unsubForeground = listenForegroundServiceEvents(() => {
      stopTracking();
    });

    return () => {
      registerStopTrackingCallback(() => {});
      unsubForeground();
    };
  }, [stopTracking]);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const handleStepsUpdated = (newSteps: number) => {
      stepsRef.current = newSteps;
      setSteps(newSteps);
    };

    stepEventEmitter.on("stepsUpdated", handleStepsUpdated);

    return () => {
      stepEventEmitter.off("stepsUpdated", handleStepsUpdated);
    };
  }, []);

  return (
    <StepContext.Provider value={{
      steps,
      calories,
      distanceKm,
      goal,
      sessionSecs,
      isTracking,
      usingFallback,
      setGoal,
      startTracking,
      stopTracking,
      resetToday,
    }}>
      {children}
    </StepContext.Provider>
  );
};