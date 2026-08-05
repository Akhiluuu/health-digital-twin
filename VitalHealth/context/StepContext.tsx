// context/StepContext.tsx — Production-grade, completely rebuilt
// Architecture:
//   Android → Native Kotlin service (hardware step counter → sensor fusion)
//             receives real-time updates via NativeEventEmitter broadcast
//   iOS     → expo-sensors Pedometer + 15s HealthKit poll
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules } from 'react-native';
let notifee: any = { createChannel: async () => {}, displayNotification: async () => {}, requestPermission: async () => ({ authorizationStatus: 1 }) };
let AndroidImportance: any = { HIGH: 4 };
if (Boolean(NativeModules?.NotifeeApiModule)) {
  try {
    const NotifeeModule = require('@notifee/react-native');
    if (NotifeeModule.default) notifee = NotifeeModule.default;
    if (NotifeeModule.AndroidImportance) AndroidImportance = NotifeeModule.AndroidImportance;
  } catch (e) {}
}
import { Accelerometer, Pedometer } from 'expo-sensors';
import React, {
  createContext, useCallback, useContext, useEffect,
  useRef, useState, useMemo,
} from 'react';
import { AppState, AppStateStatus, Platform, Alert, Linking, PermissionsAndroid } from 'react-native';
import { useFamily } from './FamilyContext';
import { syncStepsData, fetchStepsDataFromFirebase, fetchAllStepsFromFirebase } from '../services/firebaseSync';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { log, warn, error } from "../utils/logger";
import { getLocalDateString } from '../utils/twinUtils';

import {
  startNativeTracking,
  stopNativeTracking,
  resetNativeSteps,
  updateNativeSteps,
  getTodayStepsNative,
  getWeeklyStepsNative,
  getMonthlyStepsNative,
  subscribeToStepUpdates,
  getDataSourceInfoNative,
  isNativeModuleAvailable,
  type DataSource,
} from '../services/nativeStepTracker';

// ─────────────────────────────────────────────────────────────────────────────
// Storage key factory
// ─────────────────────────────────────────────────────────────────────────────
const KEY = (uid: string) => ({
  goal:         `step_goal_v7_${uid}`,
  date:         `step_date_v7_${uid}`,
  totalToday:   `step_total_today_v7_${uid}`,
  isTracking:   `step_is_tracking_v7_${uid}`,
  sessionStart: `step_session_start_v7_${uid}`,
  lastMoveTs:   `step_last_move_ts_v7_${uid}`,
});

const todayStr = () => getLocalDateString();

// ─────────────────────────────────────────────────────────────────────────────
// Background task (WorkManager equivalent via expo-background-fetch)
// ─────────────────────────────────────────────────────────────────────────────
const BG_TASK = 'BACKGROUND_STEP_SYNC_V2';

TaskManager.defineTask(BG_TASK, async () => {
  try {
    const uid = 'self';
    const k = KEY(uid);
    const tracking = await AsyncStorage.getItem(k.isTracking);
    if (tracking !== '1') return BackgroundFetch.BackgroundFetchResult.NoData;

    // On Android, pull the ground-truth from native service
    if (Platform.OS === 'android') {
      const { steps } = await getTodayStepsNative();
      if (steps > 0) {
        const rawGoal = await AsyncStorage.getItem(k.goal);
        const goal = parseInt(rawGoal ?? '10000', 10);
        await AsyncStorage.setItem(k.totalToday, String(steps));
        await syncStepsData({ steps, goal, isTracking: true, lastMoveTs: Date.now(), date: todayStr() });
      }
    }

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Accelerometer fallback step detector (iOS only / ultra-old Android)
// Gravity-subtraction + Kalman smoothing
// ─────────────────────────────────────────────────────────────────────────────
class StepDetector {
  private grav = { x: 0, y: 0, z: 0 };
  private kalman = 0;
  private kErr = 1;
  private lastAt = 0;
  private init = false;
  onStep: (() => void) | null = null;

  feed(x: number, y: number, z: number) {
    const A = 0.8;
    if (!this.init) { this.grav = { x, y, z }; this.init = true; return; }
    this.grav.x = A * this.grav.x + (1 - A) * x;
    this.grav.y = A * this.grav.y + (1 - A) * y;
    this.grav.z = A * this.grav.z + (1 - A) * z;
    const lx = x - this.grav.x, ly = y - this.grav.y, lz = z - this.grav.z;
    const mag = Math.sqrt(lx * lx + ly * ly + lz * lz);
    const gain = this.kErr / (this.kErr + 0.1);
    this.kalman += gain * (mag - this.kalman);
    this.kErr = (1 - gain) * this.kErr + 0.005;
    const now = Date.now();
    if (this.kalman > 0.09 && (now - this.lastAt) > 280) {
      this.lastAt = now; this.onStep?.();
    }
  }
  reset() { this.grav = { x: 0, y: 0, z: 0 }; this.kalman = 0; this.kErr = 1; this.lastAt = 0; this.init = false; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Context interface
// ─────────────────────────────────────────────────────────────────────────────
interface StepContextValue {
  steps: number;
  calories: number;
  distanceKm: number;
  goal: number;
  sessionSecs: number;
  isTracking: boolean;
  dataSource: DataSource;
  lastSyncAt: number;
  setGoal: (g: number) => void;
  startTracking: () => Promise<void>;
  stopTracking: () => Promise<void>;
  resetToday: () => Promise<void>;
  refreshFromNative: () => Promise<void>;
  // Weekly/monthly for history views
  weeklySteps: Array<{ date: string; steps: number }>;
  monthlySteps: Array<{ date: string; steps: number }>;
  yearlySteps: Array<{ date: string; steps: number }>;
  refreshHistory: () => Promise<void>;
}

const StepContext = createContext<StepContextValue>({} as StepContextValue);
export const useSteps = () => useContext(StepContext);

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────
export const StepProvider: React.FC<{
  children: React.ReactNode;
  weightKg?: number;
  heightCm?: number;
}> = ({ children, weightKg = 70, heightCm = 170 }) => {

  const [steps,       setStepsInternal] = useState(0);
  const setSteps = useCallback((val: number | ((prev: number) => number)) => {
    setStepsInternal(prev => {
      const next = typeof val === 'function' ? val(prev) : val;
      const safe = isNaN(next) || next < 0 ? 0 : Math.round(next);
      stepsRef.current = safe;
      return safe;
    });
  }, []);
  const [goal,        setGoalState]   = useState(10000);
  const [sessionSecs, setSessionSecs] = useState(0);
  const [isTracking,  setIsTracking]  = useState(false);
  const [dataSource,  setDataSource]  = useState<DataSource>('STEP_SENSOR');
  const [lastSyncAt,  setLastSyncAt]  = useState(0);
  const [weeklySteps, setWeeklySteps] = useState<Array<{ date: string; steps: number }>>([]);
  const [monthlySteps, setMonthlySteps] = useState<Array<{ date: string; steps: number }>>([]);
  const [yearlySteps, setYearlySteps] = useState<Array<{ date: string; steps: number }>>([]);

  const { isSwitched, activeMemberId, activeProfile } = useFamily();
  const userUid  = isSwitched && activeMemberId ? activeMemberId : 'self';
  const userKeys = useMemo(() => KEY(userUid), [userUid]);

  // Stable refs (avoid stale closures in event handlers)
  const stepsRef      = useRef(0);
  const goalRef       = useRef(10000);
  const isTrackingRef = useRef(false);
  const dirtyRef      = useRef(false);

  // Validate weight and height inputs to prevent 0 or NaN calculations
  const validWeight = weightKg && weightKg > 0 && !isNaN(weightKg) ? weightKg : 70;
  const validHeight = heightCm && heightCm > 0 && !isNaN(heightCm) ? heightCm : 170;

  const strideM       = 0.413 * (validHeight / 100);

  const distanceKm = parseFloat(((steps * strideM) / 1000).toFixed(2));
  const calories   = Math.round(steps * 0.04 * (validWeight / 70));

  // Timer refs
  const clockRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const flushRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const sedRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const midnightRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iosPollRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const nativePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // iOS sensor refs
  const pedometerSub = useRef<{ remove: () => void } | null>(null);
  const accelSub     = useRef<{ remove: () => void } | null>(null);
  const detector     = useRef(new StepDetector());

  // Android native subscription
  const nativeUnsubRef = useRef<(() => void) | null>(null);

  // ── Setters ──────────────────────────────────────────────────────────────
  const setStepsAndRef = useCallback((n: number) => {
    const v = Math.max(0, n);
    if (v === stepsRef.current) return;
    stepsRef.current = v;
    dirtyRef.current = true;
    setSteps(v);
  }, []);

  // ── Cloud sync ────────────────────────────────────────────────────────────
  const doCloudSync = useCallback(async () => {
    const s = stepsRef.current;
    await AsyncStorage.multiSet([
      [userKeys.totalToday, String(s)],
      [userKeys.lastMoveTs, String(Date.now())],
    ]);
    await syncStepsData({
      steps: s,
      goal: goalRef.current,
      isTracking: isTrackingRef.current,
      lastMoveTs: Date.now(),
      date: todayStr(),
    }, isSwitched ? activeMemberId : undefined).catch(() => {});
    setLastSyncAt(Date.now());
  }, [userKeys, isSwitched, activeMemberId]);

  const startFlushLoop = useCallback(() => {
    if (flushRef.current) clearInterval(flushRef.current);
    flushRef.current = setInterval(async () => {
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      await doCloudSync();
    }, 5000);
  }, [doCloudSync]);

  const stopFlushLoop = useCallback(() => {
    if (flushRef.current) { clearInterval(flushRef.current); flushRef.current = null; }
  }, []);

  // ── Android native direct-poll (safety net: 3s interval) ─────────────────
  const startNativePoll = useCallback(() => {
    if (Platform.OS !== 'android') return;
    if (nativePollRef.current) clearInterval(nativePollRef.current);
    nativePollRef.current = setInterval(async () => {
      if (!isTrackingRef.current) return;
      try {
        const { steps: nativeSteps, source } = await getTodayStepsNative();
        if (nativeSteps > 0 && nativeSteps > stepsRef.current) {
          stepsRef.current = nativeSteps;
          dirtyRef.current = true;
          setSteps(nativeSteps);
          setDataSource(source);
        } else if (stepsRef.current > nativeSteps && nativeSteps > 0) {
          updateNativeSteps(stepsRef.current);
        }
      } catch { /* ignore */ }
    }, 3000);
  }, []);

  const stopNativePoll = useCallback(() => {
    if (nativePollRef.current) { clearInterval(nativePollRef.current); nativePollRef.current = null; }
  }, []);

  // ── Background task ────────────────────────────────────────────────────────
  const registerBgTask = useCallback(async () => {
    try {
      const isReg = await TaskManager.isTaskRegisteredAsync(BG_TASK);
      if (!isReg) {
        await BackgroundFetch.registerTaskAsync(BG_TASK, {
          minimumInterval: 15 * 60,
          stopOnTerminate: false,
          startOnBoot: true,
        });
      }
    } catch { /* ignore */ }
  }, []);

  // ── Session clock ─────────────────────────────────────────────────────────
  const startClock = useCallback((elapsedMs = 0) => {
    if (clockRef.current) clearInterval(clockRef.current);
    const origin = Date.now() - elapsedMs;
    clockRef.current = setInterval(() => setSessionSecs(Math.floor((Date.now() - origin) / 1000)), 1000);
  }, []);
  const stopClock = useCallback(() => {
    if (clockRef.current) { clearInterval(clockRef.current); clockRef.current = null; }
  }, []);

  // ── Sedentary alerts ──────────────────────────────────────────────────────
  const startSedTimer = useCallback(() => {
    if (sedRef.current) clearInterval(sedRef.current);
    sedRef.current = setInterval(async () => {
      const raw = await AsyncStorage.getItem(userKeys.lastMoveTs);
      const last = parseInt(raw ?? String(Date.now()), 10);
      if ((Date.now() - last) / 60000 >= 60) {
        try {
          const { getProfileName } = require('../services/notifeeService');
          const profileId = await AsyncStorage.getItem("vitalhealth_active_member_id") || "self";
          const name = await getProfileName(profileId);

          await notifee.createChannel({ id: 'health', name: 'Health Notifications', importance: AndroidImportance.HIGH });
          await notifee.displayNotification({
            title: `[${name}] Move a little! 🚶`,
            body: "You've been inactive for over an hour.",
            data: {
              profileId: profileId,
              type: "sedentary",
              deepLink: "/(tabs)/twin",
            },
            android: { channelId: 'health', pressAction: { id: 'default' } },
          });
        } catch { /* ignore */ }
      }
    }, 5 * 60 * 1000);
  }, [userKeys.lastMoveTs]);
  const stopSedTimer = useCallback(() => {
    if (sedRef.current) { clearInterval(sedRef.current); sedRef.current = null; }
  }, []);

  // ── iOS sensors ───────────────────────────────────────────────────────────
  const stopIosSensors = useCallback(() => {
    pedometerSub.current?.remove(); pedometerSub.current = null;
    accelSub.current?.remove();     accelSub.current = null;
    detector.current.onStep = null;
    if (iosPollRef.current) { clearInterval(iosPollRef.current); iosPollRef.current = null; }
  }, []);

  const startIosSensors = useCallback(async () => {
    stopIosSensors();
    let pedoOk = false;
    try {
      const available = await Pedometer.isAvailableAsync();
      if (available) {
        let perm = await Pedometer.getPermissionsAsync();
        if (!perm.granted) perm = await Pedometer.requestPermissionsAsync();
        if (perm.granted) {
          let baseline: number | null = null;
          pedometerSub.current = Pedometer.watchStepCount((r) => {
            if (baseline === null) { baseline = r.steps; return; }
            const delta = r.steps - baseline!;
            if (delta > 0 && delta <= 300) { stepsRef.current += delta; dirtyRef.current = true; setSteps(stepsRef.current); }
            if (delta > 0) baseline = r.steps;
          });
          pedoOk = true;
          setDataSource('PEDOMETER');
          // 15s poll to catch batched HealthKit updates
          iosPollRef.current = setInterval(async () => {
            if (!isTrackingRef.current) return;
            const start = new Date(); start.setHours(0, 0, 0, 0);
            const r = await Pedometer.getStepCountAsync(start, new Date()).catch(() => null);
            if (r && r.steps > stepsRef.current) { stepsRef.current = r.steps; dirtyRef.current = true; setSteps(r.steps); }
          }, 15000);
        }
      }
    } catch { /* fall through */ }

    if (!pedoOk) {
      detector.current.reset();
      let lastStepTime = Date.now();
      let currentInterval = 50;

      detector.current.onStep = () => {
        stepsRef.current++;
        dirtyRef.current = true;
        setSteps(stepsRef.current);
        lastStepTime = Date.now();
        if (currentInterval !== 50) {
          currentInterval = 50;
          Accelerometer.setUpdateInterval(50);
          log("🏃 Active step detected. Accelerometer sampling scaled up to 50ms.");
        }
      };

      Accelerometer.setUpdateInterval(50);
      accelSub.current = Accelerometer.addListener(({ x, y, z }) => {
        detector.current.feed(x, y, z);
        
        const now = Date.now();
        const idleTime = now - lastStepTime;

        // If idle for > 60s, throttle to 250ms to save battery
        if (idleTime > 60000 && currentInterval === 50) {
          currentInterval = 250;
          Accelerometer.setUpdateInterval(250);
          log("🔋 Stationarity detected. Throttling accelerometer to 250ms.");
        }

        // If throttled, wake up immediately on motion spike
        if (currentInterval > 50) {
          const mag = Math.sqrt(x * x + y * y + z * z);
          if (Math.abs(mag - 1.0) > 0.15) {
            currentInterval = 50;
            Accelerometer.setUpdateInterval(50);
            log("🏃 Motion spike detected. Accelerometer sampling scaled up to 50ms.");
          }
        }
      });
      setDataSource('SENSOR_FUSION');
    }
  }, [stopIosSensors]);

  // ── Android native subscription ────────────────────────────────────────────
  const startAndroidNativeSubscription = useCallback(() => {
    nativeUnsubRef.current?.();
    nativeUnsubRef.current = subscribeToStepUpdates((event) => {
      // Native service sends absolute daily step count
      if (event.steps > stepsRef.current) {
        stepsRef.current = event.steps;
        dirtyRef.current = true;
        setSteps(event.steps);
      }
      setDataSource(event.source);
    });
  }, []);

  const stopAndroidNativeSubscription = useCallback(() => {
    nativeUnsubRef.current?.();
    nativeUnsubRef.current = null;
  }, []);

  // ── Pull steps from native DB on foreground resume ─────────────────────────
  // ── Refresh history ────────────────────────────────────────────────────────
  const refreshHistory = useCallback(async () => {
    try {
      const mergedMap = new Map<string, number>();

      // 1. Load native/local historical steps
      if (!isSwitched) {
        try {
          if (Platform.OS === 'android') {
            const wData = await getWeeklyStepsNative().catch(() => []);
            if (Array.isArray(wData)) {
              wData.forEach(d => {
                if (d && d.date) {
                  const dateStr = String(d.date);
                  mergedMap.set(dateStr, Math.max(mergedMap.get(dateStr) || 0, Number(d.steps) || 0));
                }
              });
            }
            const mData = await getMonthlyStepsNative().catch(() => []);
            if (Array.isArray(mData)) {
              mData.forEach(d => {
                if (d && d.date) {
                  const dateStr = String(d.date);
                  mergedMap.set(dateStr, Math.max(mergedMap.get(dateStr) || 0, Number(d.steps) || 0));
                }
              });
            }
          } else {
            // iOS Pedometer loop
            for (let i = 0; i < 30; i++) {
              const start = new Date();
              start.setDate(start.getDate() - i);
              start.setHours(0, 0, 0, 0);
              const end = new Date(start);
              end.setHours(23, 59, 59, 999);
              const dateStr = getLocalDateString(start);
              try {
                const r = await Pedometer.getStepCountAsync(start, end);
                if (r) {
                  mergedMap.set(dateStr, Math.max(mergedMap.get(dateStr) || 0, r.steps || 0));
                }
              } catch {
                // ignore
              }
            }
          }
        } catch (nativeErr) {
          warn("⚠️ Failed loading native steps:", nativeErr);
        }
      }

      // 2. Load Firestore synced cloud steps
      try {
        const cloudData = await fetchAllStepsFromFirebase(isSwitched ? activeMemberId : undefined).catch(() => []);
        if (Array.isArray(cloudData)) {
          cloudData.forEach(d => {
            if (d && d.date) {
              const dateStr = String(d.date);
              mergedMap.set(dateStr, Math.max(mergedMap.get(dateStr) || 0, Number(d.steps) || 0));
            }
          });
        }
      } catch (cloudErr) {
        warn("⚠️ Failed loading cloud steps:", cloudErr);
      }
      
      // No seeding of fake data: if no native or cloud steps exist for a date,
      // it will render as 0 steps, which is the honest representation.
      // Charts must only display data that originated from real sensors or cloud sync.

      // 3. Generate structured 7-day and 30-day arrays without gaps
      const last7Days: string[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        last7Days.push(getLocalDateString(d));
      }

      const last30Days: string[] = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        last30Days.push(getLocalDateString(d));
      }

      // Construct weekly steps (chronological order)
      const weekly = last7Days.map(date => ({
        date,
        steps: mergedMap.get(date) || 0
      }));
      setWeeklySteps(weekly);

      // Construct monthly steps (newest first for logs list)
      const monthly = last30Days.map(date => ({
        date,
        steps: mergedMap.get(date) || 0
      })).sort((a, b) => b.date.localeCompare(a.date));
      setMonthlySteps(monthly);

      // 4. Construct yearly steps (last 12 months)
      const yearlyMap = new Map<string, number>();
      
      // Initialize last 12 months with 0
      const last12Months: string[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const yearMonth = getLocalDateString(d).slice(0, 7); // "2026-07"
        last12Months.push(yearMonth);
        yearlyMap.set(yearMonth, 0);
      }
      
      // Sum steps by month
      mergedMap.forEach((sVal, date) => {
        if (date && typeof date === 'string') {
          const yearMonth = date.slice(0, 7);
          if (yearlyMap.has(yearMonth)) {
            yearlyMap.set(yearMonth, (yearlyMap.get(yearMonth) || 0) + sVal);
          }
        }
      });
      
      const yearly = last12Months.map(yearMonth => ({
        date: yearMonth,
        steps: yearlyMap.get(yearMonth) || 0
      }));
      setYearlySteps(yearly);

    } catch (e) {
      warn("⚠️ Failed to load weekly/monthly steps:", e);
    }
  }, [isSwitched, activeMemberId]);

  const refreshFromNative = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    if (isSwitched) return;
    const { steps: nativeSteps, source } = await getTodayStepsNative();
    if (nativeSteps > stepsRef.current) {
      stepsRef.current = nativeSteps;
      dirtyRef.current = true;
      setSteps(nativeSteps);
      setDataSource(source);
    } else if (stepsRef.current > nativeSteps) {
      updateNativeSteps(stepsRef.current);
    }
  }, [isSwitched]);

  // ── Midnight auto-reset ───────────────────────────────────────────────────
  const scheduleMidnightReset = useCallback(() => {
    if (midnightRef.current) clearTimeout(midnightRef.current);
    const now = new Date();
    const midnight = new Date(now);
    midnight.setDate(midnight.getDate() + 1);
    midnight.setHours(0, 0, 30, 0);
    midnightRef.current = setTimeout(async () => {
      await doCloudSync().catch(() => {});
      stepsRef.current = 0; dirtyRef.current = false;
      setSteps(0);
      await AsyncStorage.multiSet([[userKeys.totalToday, '0'], [userKeys.date, todayStr()]]);
      await refreshHistory().catch(() => {});
      scheduleMidnightReset();
    }, midnight.getTime() - now.getTime());
  }, [doCloudSync, userKeys, refreshHistory]);

  // ── setGoal ────────────────────────────────────────────────────────────────
  const setGoal = useCallback((g: number) => {
    setGoalState(g); goalRef.current = g;
    AsyncStorage.setItem(userKeys.goal, String(g));
    syncStepsData({ steps: stepsRef.current, goal: g, isTracking: isTrackingRef.current, lastMoveTs: Date.now(), date: todayStr() }, isSwitched ? activeMemberId : undefined).catch(() => {});
  }, [userKeys, isSwitched, activeMemberId]);

  // ── START TRACKING ─────────────────────────────────────────────────────────
  const startTracking = useCallback(async () => {
    if (isTrackingRef.current) return;

    // 1. Request Notification Permission
    const settings = await notifee.requestPermission();
    if (settings.authorizationStatus === 0) {
      Alert.alert(
        "Notification Permission Required",
        "VitalHealth needs notification permission to count steps and run the tracking service in the background.\n\nPlease enable notifications in App Settings.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() }
        ]
      );
      return;
    }

    // 2. Request Motion/Physical Activity Permission (ACTIVITY_RECOGNITION)
    // On Android 10+ (API 29+), this is a DANGEROUS runtime permission that MUST be
    // explicitly requested. Without it, the step counter sensor returns 0 events silently.
    let motionOk = false;
    try {
      if (Platform.OS === 'android') {
        // First check current state — if already granted skip the dialog
        const alreadyGranted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION
        );
        if (alreadyGranted) {
          motionOk = true;
        } else {
          const result = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION,
            {
              title: 'Physical Activity Permission Required',
              message:
                'VitalHealth needs access to Physical Activity data to count your steps accurately using the device\'s built-in step counter sensor.\n\nWithout this permission, step counting will not work.',
              buttonPositive: 'Allow',
              buttonNegative: 'Deny',
              buttonNeutral: 'Ask Me Later',
            }
          );
          if (result === PermissionsAndroid.RESULTS.GRANTED) {
            motionOk = true;
          } else if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
            // User chose "Don't ask again" — must redirect to Settings
            Alert.alert(
              'Physical Activity Permission Blocked',
              'You have permanently denied the Physical Activity permission.\n\nTo enable step counting, please go to:\nSettings → Apps → VitalHealth → Permissions → Physical activity → Allow.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Open Settings', onPress: () => Linking.openSettings() },
              ]
            );
            return;
          }
          // else: DENIED — fall through to motionOk === false alert below
        }
      } else {
        const perm = await Pedometer.requestPermissionsAsync();
        motionOk = perm.granted;
      }
    } catch (e) {
      error('[StepContext] ACTIVITY_RECOGNITION permission request failed:', e);
    }

    if (!motionOk) {
      Alert.alert(
        'Physical Activity Permission Required',
        'VitalHealth needs Physical Activity sensor access to count your steps.\n\nPlease tap "Open Settings" and enable the Physical activity permission.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
      return;
    }

    const now = Date.now();
    await AsyncStorage.multiSet([
      [userKeys.isTracking,   '1'],
      [userKeys.date,         todayStr()],
      [userKeys.sessionStart, String(now)],
      [userKeys.totalToday,   String(stepsRef.current)],
      [userKeys.lastMoveTs,   String(now)],
    ]);

    isTrackingRef.current = true;
    setIsTracking(true);
    setSessionSecs(0);

    if (Platform.OS === 'android') {
      const profileName = activeProfile ? `${activeProfile.firstName} ${activeProfile.lastName || ""}`.trim() : "";
      await startNativeTracking(userUid, profileName);
      startAndroidNativeSubscription();
      // Immediately pull current count from native DB
      await refreshFromNative();
      setDataSource('STEP_SENSOR');
      // Start 3-second poll as backup in case NativeEventEmitter events are missed
      startNativePoll();
    } else {
      await startIosSensors();
    }

    startClock(0);
    startSedTimer();
    startFlushLoop();
    scheduleMidnightReset();
    registerBgTask().catch(() => {});
  }, [userKeys, userUid, activeProfile, startAndroidNativeSubscription, startIosSensors, refreshFromNative, startClock, startSedTimer, startFlushLoop, scheduleMidnightReset, registerBgTask, startNativePoll]);

  // ── STOP TRACKING ──────────────────────────────────────────────────────────
  const stopTracking = useCallback(async () => {
    stopIosSensors();
    stopAndroidNativeSubscription();
    stopNativePoll();
    stopClock();
    stopSedTimer();
    stopFlushLoop();
    if (midnightRef.current) { clearTimeout(midnightRef.current); midnightRef.current = null; }
    await doCloudSync();

    await AsyncStorage.setItem(userKeys.isTracking, '0');
    isTrackingRef.current = false;
    setIsTracking(false);

    if (Platform.OS === 'android') {
      await stopNativeTracking();
    }
  }, [stopIosSensors, stopAndroidNativeSubscription, stopNativePoll, stopClock, stopSedTimer, stopFlushLoop, doCloudSync, userKeys]);

  // ── RESET TODAY ────────────────────────────────────────────────────────────
  const resetToday = useCallback(async () => {
    await stopTracking();
    stepsRef.current = 0; setSteps(0); setSessionSecs(0);
    await AsyncStorage.multiSet([
      [userKeys.totalToday,   '0'],
      [userKeys.date,         todayStr()],
      [userKeys.sessionStart, String(Date.now())],
      [userKeys.isTracking,   '0'],
    ]);
    if (Platform.OS === 'android') {
      await resetNativeSteps();
    }
    await syncStepsData({ steps: 0, goal: goalRef.current, isTracking: false, lastMoveTs: Date.now(), date: todayStr() }, isSwitched ? activeMemberId : undefined);
    await refreshHistory().catch(() => {});
  }, [stopTracking, userKeys, isSwitched, activeMemberId, refreshHistory]);

  // ── RESTORE ON MOUNT / PROFILE SWITCH ─────────────────────────────────────
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        // Clean up any prior subscriptions
        stopIosSensors(); stopAndroidNativeSubscription(); stopNativePoll(); stopClock(); stopSedTimer(); stopFlushLoop();
        stepsRef.current = 0; isTrackingRef.current = false; dirtyRef.current = false;
        setSteps(0); setSessionSecs(0); setIsTracking(false);

        const pairs = await AsyncStorage.multiGet([
          userKeys.goal, userKeys.date, userKeys.totalToday, userKeys.isTracking, userKeys.sessionStart,
        ]).catch(() => []);
        if (!alive) return;
        const m = Object.fromEntries(pairs.map(([k, v]) => [k, v ?? '']));
        const today = todayStr();
        let savedSteps = 0, savedGoal = 10000, savedTracking = false, sessionStart = Date.now();

        const fbData = await fetchStepsDataFromFirebase(today, isSwitched ? activeMemberId : undefined)
          .catch((err) => {
            warn("⚠️ [StepContext] fetchStepsDataFromFirebase failed:", err);
            return null;
          });
        if (!alive) return;

        savedGoal = m[userKeys.goal] ? parseInt(m[userKeys.goal], 10) : (fbData?.goal ?? 10000);
        if (isNaN(savedGoal)) savedGoal = 10000;
        setGoalState(savedGoal); goalRef.current = savedGoal;

        if (m[userKeys.date] === today) {
          savedSteps    = parseInt(m[userKeys.totalToday] || '0', 10);
          savedTracking = m[userKeys.isTracking] === '1';
          sessionStart  = parseInt(m[userKeys.sessionStart] || String(Date.now()), 10);
          if (fbData && fbData.steps > savedSteps) {
            savedSteps = fbData.steps;
            await AsyncStorage.setItem(userKeys.totalToday, String(savedSteps)).catch(() => {});
          }
        } else if (fbData) {
          savedSteps = fbData.steps; savedTracking = fbData.isTracking;
          await AsyncStorage.multiSet([[userKeys.date, today], [userKeys.totalToday, String(savedSteps)], [userKeys.isTracking, savedTracking ? '1' : '0']]).catch(() => {});
        }

        if (isNaN(savedSteps)) savedSteps = 0;

        // On Android, always prefer native DB (most accurate) - only for self
        if (Platform.OS === 'android' && !isSwitched) {
          const nativeData = await getTodayStepsNative().catch((err) => {
            warn("⚠️ [StepContext] getTodayStepsNative failed:", err);
            return { steps: 0, source: 'SENSOR_FUSION' as const };
          });
          if (nativeData.steps > savedSteps) { savedSteps = nativeData.steps; }
          setDataSource(nativeData.source);
        }

        // Force tracking off for family member profiles
        if (isSwitched) {
          savedTracking = false;
        }

        // ── Permission gate before restoring tracking state ───────────────────
        // CRITICAL: adb install -r and some OEM installs RESET runtime permissions
        // but keep AsyncStorage. We must verify ACTIVITY_RECOGNITION is actually
        // granted before starting the native service, otherwise sensors return 0.
        if (savedTracking && Platform.OS === 'android') {
          const permGranted = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION
          );
          if (!permGranted) {
            // Permission was revoked (reinstall wipes runtime grants).
            // Reset tracking state so the user explicitly presses Start,
            // which will trigger the proper permission request dialog.
            warn('⚠️ [StepContext] ACTIVITY_RECOGNITION revoked — resetting tracking state');
            savedTracking = false;
            await AsyncStorage.setItem(userKeys.isTracking, '0').catch(() => {});
          }
        }

        // Auto-start gate: only restore tracking if savedTracking was explicitly '1'
        // AND permission was not revoked above (checked via savedTracking flag).
        if (!savedTracking && m[userKeys.isTracking] === '1') {
          try {
            const settings = await notifee.getNotificationSettings();
            let physicalOk = false;
            if (Platform.OS === 'android') {
              physicalOk = await PermissionsAndroid.check(
                PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION
              );
            } else {
              const pedoPerm = await Pedometer.getPermissionsAsync();
              physicalOk = pedoPerm.granted;
            }
            if (settings.authorizationStatus >= 1 && physicalOk) {
              savedTracking = true;
              await AsyncStorage.setItem(userKeys.isTracking, '1').catch(() => {});
            }
          } catch (e) {
            // ignore
          }
        }

        stepsRef.current = savedSteps; setSteps(savedSteps);
        setIsTracking(savedTracking); isTrackingRef.current = savedTracking;

        if (savedTracking) {
          startClock(Date.now() - sessionStart);
          if (Platform.OS === 'android') {
            const profileName = activeProfile ? `${activeProfile.firstName} ${activeProfile.lastName || ""}`.trim() : "";
            if (savedSteps > 0) {
              await updateNativeSteps(savedSteps).catch(() => {});
            }
            await startNativeTracking(userUid, profileName).catch((err) => {
              warn("⚠️ [StepContext] startNativeTracking failed:", err);
            });
            startAndroidNativeSubscription();
            startNativePoll();
          } else {
            await startIosSensors().catch((err) => {
              warn("⚠️ [StepContext] startIosSensors failed:", err);
            });
          }
          startSedTimer(); startFlushLoop(); scheduleMidnightReset();
        }

        // Get data source info
        if (!isSwitched) {
          const info = await getDataSourceInfoNative().catch(() => null);
          if (info) setDataSource(info.activeSource);
        } else {
          setDataSource('CLOUD_SYNC');
        }

        registerBgTask().catch(() => {});
        await refreshHistory().catch(() => {});
      } catch (err) {
        error("🔴 [StepContext] Fatal error during load steps context:", err);
        setSteps(0);
        setIsTracking(false);
      }
    };

    load();
    return () => {
      alive = false;
      stopIosSensors(); stopAndroidNativeSubscription(); stopNativePoll(); stopClock(); stopSedTimer(); stopFlushLoop();
      if (midnightRef.current) clearTimeout(midnightRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userUid]);

  // ── App State: foreground resume ───────────────────────────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (next) => {
      const comingForeground = appStateRef.current.match(/inactive|background/) && next === 'active';
      const goingBackground  = next.match(/inactive|background/);

      if (goingBackground && isTrackingRef.current) await doCloudSync();

      if (comingForeground) {
        if (Platform.OS === 'android' && isTrackingRef.current) {
          // Pull latest count from native service
          await refreshFromNative();
        } else if (Platform.OS === 'ios' && isTrackingRef.current) {
          const start = new Date(); start.setHours(0, 0, 0, 0);
          const r = await Pedometer.getStepCountAsync(start, new Date()).catch(() => null);
          if (r && r.steps > stepsRef.current) { stepsRef.current = r.steps; dirtyRef.current = true; setSteps(r.steps); }
        }
        if (isTrackingRef.current) startFlushLoop();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [doCloudSync, refreshFromNative, startFlushLoop]);

  return (
    <StepContext.Provider value={{
      steps, calories, distanceKm, goal, sessionSecs,
      isTracking, dataSource, lastSyncAt, weeklySteps, monthlySteps, yearlySteps,
      setGoal, startTracking, stopTracking, resetToday, refreshFromNative, refreshHistory,
    }}>
      {children}
    </StepContext.Provider>
  );
};