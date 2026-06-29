// app/(tabs)/twin.tsx — Clinical Command Center
// Mode 1: Dashboard — vitals, organ scores, analytics, session history
// Mode 2: Log Routine — 7-tab full-detail event logger perfectly wired to BioGears

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, Dimensions, FlatList,
  GestureResponderEvent,
  KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';


import { useBiogearsTwin } from '../../context/BiogearsTwinContext';
import { useTheme } from '../../context/ThemeContext';
import { useFamily } from '../../context/FamilyContext';
import { colors as themeColors } from '../../theme/colors';
import Header from '../components/Header';
import CircadianClock from '../../components/twin/CircadianClock';
import QuickAddRow from '../../components/twin/QuickAddRow';
import BodyMap from '../../components/twin/BodyMap';
import { CSV_FOOD_DB, CsvFoodItem, parseDisplayAmount, scaleNutrients, getQuickQuantities } from '../nutrition';
import { ConflictResolutionSheet } from '../components/ConflictResolutionSheet';

const CSV_CATEGORIES = [
  { id: 'all', label: 'All', icon: 'restaurant' },
  { id: 'breakfast', label: 'Breakfast', icon: 'cafe' },
  { id: 'meal', label: 'Meal', icon: 'pizza' },
  { id: 'snack', label: 'Snacks', icon: 'fast-food' },
  { id: 'beverage', label: 'Drinks', icon: 'pint' },
  { id: 'fruit', label: 'Fruits', icon: 'nutrition' },
  { id: 'protein', label: 'Protein', icon: 'egg' },
  { id: 'vegetable', label: 'Veggies', icon: 'leaf' },
];

function getCategoryIcon(cat: string) {
  const f = CSV_CATEGORIES.find(c => c.id === cat);
  return f ? f.icon : 'restaurant';
}

const { width: W } = Dimensions.get('window');

// ─── Helpers ────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

function parseBP(bp: any) {
  if (!bp || typeof bp !== 'string') return { sys: null, dia: null };
  const parts = bp.split('/');
  return { sys: parts[0] ? parseFloat(parts[0]) : null, dia: parts[1] ? parseFloat(parts[1]) : null };
}

function currentTime(): string {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function wallTimeToLabel(wallTime: any): string {
  if (!wallTime || typeof wallTime !== 'string') return '';
  const [h, m] = wallTime.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr}:${pad(m)} ${ampm}`;
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

// ─── Event tab definitions ────────────────────────────────────────────────────

type EventTab = 'meal' | 'exercise' | 'sleep' | 'water' | 'substance' | 'stress' | 'other';
type DashTab = 'overview' | 'organs' | 'trends';

const EVENT_TABS: { id: EventTab; label: string; icon: any; accent: string }[] = [
  { id: 'meal', label: 'Meal', icon: 'restaurant', accent: '#f59e0b' },
  { id: 'exercise', label: 'Exercise', icon: 'fitness', accent: '#10b981' },
  { id: 'sleep', label: 'Sleep', icon: 'bed', accent: '#6366f1' },
  { id: 'water', label: 'Water', icon: 'water', accent: '#0ea5e9' },
  { id: 'substance', label: 'Substance', icon: 'thermometer', accent: '#8b5cf6' },
  { id: 'stress', label: 'Stress', icon: 'pulse', accent: '#ef4444' },
  { id: 'other', label: 'Other', icon: 'flash', accent: '#ec4899' },
];

// ─── Simulation stepper ───────────────────────────────────────────────────────

const SIM_STEPS = ['Queue', 'Engine', 'Analyzing', 'Done'];

function SimStepper({ progress, status }: { progress: string; status: string }) {
  const stepIdx =
    status === 'queued' ? 0
      : status === 'running' && progress.toLowerCase().includes('analy') ? 2
        : status === 'running' ? 1
          : status === 'done' ? 3
            : 0;
  return (
    <View style={ss.stepperRow}>
      {SIM_STEPS.map((s, i) => (
        <React.Fragment key={s}>
          <View style={ss.stepItem}>
            <View style={[ss.stepDot, i <= stepIdx && ss.stepDotActive]}>
              {i < stepIdx
                ? <Ionicons name="checkmark" size={12} color="#fff" />
                : <Text style={ss.stepNum}>{i + 1}</Text>}
            </View>
            <Text style={[ss.stepLabel, i <= stepIdx && ss.stepLabelActive]}>{s}</Text>
          </View>
          {i < SIM_STEPS.length - 1 && (
            <View style={[ss.stepLine, i < stepIdx && ss.stepLineActive]} />
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

// ─── Time Picker ─────────────────────────────────────────────────────────────
import TimePicker from '../../components/twin/TimePicker';

// ─── Reusable sub-components ──────────────────────────────────────────────────

function SectionLabel({ text, c }: { text: string; c: any }) {
  return <Text style={[ss.sectionLbl, { color: c.sub }]}>{text.toUpperCase()}</Text>;
}

function ChipRow<T extends string>({ options, selected, onSelect, accent }: {
  options: { label: string; value: T }[];
  selected: T;
  onSelect: (v: T) => void;
  accent: string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
      {options.map(opt => (
        <TouchableOpacity
          key={opt.value}
          onPress={() => onSelect(opt.value)}
          style={[ss.chip, selected === opt.value && { backgroundColor: accent, borderColor: accent }]}
        >
          <Text style={[ss.chipTxt, selected === opt.value && { color: '#fff' }]}>{opt.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function NumericInput({ value, onChange, placeholder, suffix, c }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  suffix?: string;
  c: any;
}) {
  return (
    <View style={[ss.numRow, { backgroundColor: c.card, borderColor: c.border }]}>
      <TextInput
        style={[ss.numInput, { color: c.text }]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.sub}
        keyboardType="numeric"
      />
      {suffix ? <Text style={[ss.numSuffix, { color: c.sub }]}>{suffix}</Text> : null}
    </View>
  );
}

function SliderRow({ label, value, min, max, step, onChange, accent, c }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  accent: string;
  c: any;
}) {
  const steps = Math.round((max - min) / step);
  const pct = (value - min) / (max - min);
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={ss.rowBetween}>
        <Text style={[ss.sliderLabel, { color: c.sub }]}>{label}</Text>
        <Text style={[ss.sliderVal, { color: accent }]}>{value.toFixed(step < 1 ? 1 : 0)}</Text>
      </View>
      <View style={[ss.sliderTrack, { backgroundColor: c.border }]}>
        <View style={[ss.sliderFill, { width: `${pct * 100}%`, backgroundColor: accent }]} />
      </View>
      <View style={ss.sliderBtns}>
        <TouchableOpacity onPress={() => onChange(clamp(parseFloat((value - step).toFixed(2)), min, max))}
          style={[ss.sliderBtn, { borderColor: c.border }]}>
          <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>−</Text>
        </TouchableOpacity>
        <Text style={[{ color: c.sub, fontSize: 11 }]}>{min} → {max}</Text>
        <TouchableOpacity onPress={() => onChange(clamp(parseFloat((value + step).toFixed(2)), min, max))}
          style={[ss.sliderBtn, { borderColor: c.border }]}>
          <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function AddButton({ label, accent, onPress }: { label: string; accent: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[ss.addBtn, { backgroundColor: accent }]} onPress={onPress} activeOpacity={0.85}>
      <Ionicons name="add-circle" size={18} color="#fff" />
      <Text style={ss.addBtnTxt}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Vital Card ──────────────────────────────────────────────────────────────

function VitalCard({ label, value, unit, icon, color, normal, c: themeC }: any) {
  return (
    <View style={[ss.vitalCard, { borderColor: color + '40', backgroundColor: themeC?.card ?? '#0f172a' }]}>
      <Text style={ss.vitalIcon}>{icon}</Text>
      <Text style={[ss.vitalValue, { color }]}>{value ?? '—'}</Text>
      <Text style={[ss.vitalUnit, { color: themeC?.sub ?? '#64748b' }]}>{unit}</Text>
      <Text style={[ss.vitalLabel, { color: themeC?.sub ?? '#94a3b8' }]}>{label}</Text>
      {normal && <Text style={[ss.vitalNormal, { color: themeC?.sub ?? '#475569' }]}>{normal}</Text>}
    </View>
  );
}

const LiverIcon = ({ size, color, style }: { size: number; color: string; style?: any }) => (
  <View style={style}>
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path
        d="M89.38,27.894c-4.961-1.701-10.136-2.604-15.381-2.684l-13.64-0.206c-0.496-0.131-2.139-0.618-7.255-2.385 C48.071,20.881,42.821,20,37.5,20C19.58,20,5,34.58,5,52.5v0.412l1.47,6.617c0.683,3.073,1.03,6.229,1.03,9.379 C7.5,75.024,12.476,80,18.592,80c2.59,0,5.112-0.913,7.101-2.571l11.002-9.168c0.936-0.781,1.998-1.372,3.157-1.758l7.281-2.427 c3.179-1.06,5.918-2.973,7.969-5.523c5.153,2.092,11.208,1.862,16.179-0.625c8.156-4.078,15.364-9.601,21.422-16.417l0.197-0.221 C94.254,39.765,95,37.802,95,35.763C95,32.209,92.742,29.047,89.38,27.894z"
        fill={color}
      />
    </Svg>
  </View>
);

function OrganCard({ name, score, status, c: themeC }: any) {
  const clr = status === 'critical' ? '#ef4444' : status === 'warning' ? '#f59e0b' : '#10b981';
  const icons: Record<string, string> = { heart: '🫀', lungs: '🫁', gut: '🦠', brain: '🧠', liver: '🟤', legs: '🦵' };
  return (
    <View style={[ss.organCard, { backgroundColor: themeC?.card ?? '#0f172a', borderColor: themeC?.border ?? '#1e293b' }]}>
      {name === 'liver' ? (
        <LiverIcon size={24} color="#a13c2f" style={{ marginVertical: 2 }} />
      ) : (
        <Text style={{ fontSize: 24 }}>{icons[name] ?? '🔬'}</Text>
      )}
      <Text style={[ss.organScore, { color: clr }]}>{score}%</Text>
      <Text style={[ss.organName, { color: themeC?.sub ?? '#94a3b8' }]}>{name.charAt(0).toUpperCase() + name.slice(1)}</Text>
      <View style={[ss.organBar, { backgroundColor: themeC?.border ?? '#1e293b' }]}>
        <View style={[ss.organBarFill, { width: `${score}%`, backgroundColor: clr }]} />
      </View>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function TwinScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { theme } = useTheme();
  const c = themeColors[theme as 'light' | 'dark'] ?? themeColors['dark'];
  const insets = useSafeAreaInsets();

  const [showCatchUpModal, setShowCatchUpModal] = useState(false);

  useEffect(() => {
    if (params.triggerReminderPopup === 'true') {
      setShowCatchUpModal(true);
      router.setParams({ triggerReminderPopup: undefined });
    }
  }, [params.triggerReminderPopup]);

  const {
    twinStatus, simulationStatus, simulationProgress, simulationError, simulationStartTime,
    lastVitals, lastAnomalies, lastInteractionWarnings, lastAiInsights,
    todayEvents, addEvent, addEventAndSimulate, removeEvent, clearToday, fillBaselineEvents,
    savedRoutines, saveCurrentRoutine, loadRoutine, loadRoutineWithConflictCheck, renameRoutine, deleteRoutine,
    editingRoutineId, setEditingRoutineId, setDefaultRoutine, restoreDefaultRoutine, copyPrimaryDefaultRoutine,
    sessions, refreshSessions,
    simulationName, setSimulationName,
    runSimulation,
    runMultiDayCatchup,
    organScores, cvdRisk, recoveryReadiness, healthScore,
    substances, refreshSubstances,
    undoLastSimulation,
    refreshAnalytics,
    todayMacros,
    twinUserId,
    pendingConflicts,
    pendingConflictResolver,
    dismissConflicts,
    calibrationJustSucceeded,
    dismissCalibrationSuccess,
  } = useBiogearsTwin();
   const { activeProfile: profile, isSwitched } = useFamily();
  const isFocused = useIsFocused();
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  useEffect(() => {
    if (calibrationJustSucceeded && isFocused) {
      setShowSuccessModal(true);
      dismissCalibrationSuccess();
    }
  }, [calibrationJustSucceeded, isFocused]);

  const handleFillBaseline = async () => {
    if (sessions.length > 0 && savedRoutines.length > 0) {
      const lastSimTime = new Date(sessions[0].timestamp).getTime();
      const hoursSinceLastSim = (Date.now() - lastSimTime) / (1000 * 60 * 60);

      if (hoursSinceLastSim > 28) {
        const daysMissed = Math.floor(hoursSinceLastSim / 24);
        if (daysMissed >= 1) {
          const defaultRoutine = savedRoutines.find(r => r.isDefault) || savedRoutines[0];
          if (defaultRoutine) {
            const lastSimDate = new Date(sessions[0].timestamp);
            const fromLabel = lastSimDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
            const toLabel = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

            Alert.alert(
              'Sync Digital Twin',
              `Your digital twin is behind by ${daysMissed} day(s) (last sim: ${fromLabel} → today: ${toLabel}).\n\nWould you like to run a catch-up simulation using "${defaultRoutine.name}" or just fill today's hourly baseline gaps?`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Fill Today Gaps',
                  onPress: async () => {
                    try {
                      setConflictSheetMode('baseline');
                      await fillBaselineEvents();
                    } catch (e: any) {
                      Alert.alert('Fill Failed', e.message);
                    }
                  }
                },
                {
                  text: `Simulate ${daysMissed} Days`,
                  onPress: async () => {
                    try {
                      await runMultiDayCatchup(daysMissed);
                      Alert.alert('Success', 'Digital Twin caught up successfully!');
                    } catch (e: any) {
                      Alert.alert('Catch-up Failed', e.message);
                    }
                  }
                }
              ]
            );
            return;
          }
        }
      }
    }

    try {
      setConflictSheetMode('baseline');
      await fillBaselineEvents();
    } catch (e: any) {
      Alert.alert('Fill Failed', e.message);
    }
  };

  // ── Custom Alert State ──────────────────────────────────────────────────────
  const [customAlert, setCustomAlert] = useState<{
    visible: boolean;
    title: string;
    message: string;
    buttons: { text: string; style?: 'cancel' | 'destructive' | 'default'; onPress?: () => void }[];
  } | null>(null);

  const Alert = {
    alert: (
      title: string,
      message?: string,
      buttons?: { text: string; style?: 'cancel' | 'destructive' | 'default'; onPress?: () => void }[]
    ) => {
      setCustomAlert({
        visible: true,
        title,
        message: message || '',
        buttons: buttons || [{ text: 'OK' }],
      });
    }
  };

  // ── Conflict Sheet Mode ─────────────────────────────────────────────────────
  const [conflictSheetMode, setConflictSheetMode] = useState<'routine' | 'baseline'>('routine');

  // ── Mode ──────────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<'dashboard' | 'routine'>((params.mode as any) || 'dashboard');
  const [dashTab, setDashTab] = useState<DashTab>('overview');  // dashboard inner tab
  const fabAnim = useRef(new Animated.Value(params.mode === 'routine' ? 1 : 0)).current;

  // ── Simulation elapsed timer ───────────────────────────────────────────────
  const [elapsedSecs, setElapsedSecs] = useState(0);

  useEffect(() => {
    if (simulationStatus === 'running' || simulationStatus === 'queued') {
      const startTime = simulationStartTime || Date.now();
      setElapsedSecs(Math.floor((Date.now() - startTime) / 1000));
      const id = setInterval(() => {
        setElapsedSecs(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
      return () => clearInterval(id);
    } else {
      setElapsedSecs(0);
    }
  }, [simulationStatus, simulationStartTime]);



  const fmtElapsed = (s: number) => {
    const m = Math.floor(s / 60); const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  const switchMode = (next: 'dashboard' | 'routine') => {
    Animated.spring(fabAnim, {
      toValue: next === 'routine' ? 1 : 0,
      useNativeDriver: true,
      tension: 120,
      friction: 14
    }).start();

    // Defer the heavy re-render to allow the animation to start smoothly
    setTimeout(() => {
      setMode(next);
    }, 50);
  };

  // ── Active Tab ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<EventTab>((params.tab as any) || 'meal');
  const tabAccent = EVENT_TABS.find(t => t.id === activeTab)?.accent ?? '#38bdf8';

  // ── Sync Params ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (params.mode) {
      const nextMode = params.mode as 'dashboard' | 'routine';
      setMode(nextMode);
      Animated.spring(fabAnim, { toValue: nextMode === 'routine' ? 1 : 0, useNativeDriver: true }).start();
    }
    if (params.tab) {
      setActiveTab(params.tab as EventTab);
    }
  }, [params.mode, params.tab]);

  // ── Shared time per tab ───────────────────────────────────────────────────
  const [mealTime, setMealTime] = useState(currentTime());
  const [exerciseTime, setExerciseTime] = useState(currentTime());
  const [sleepTime, setSleepTime] = useState(currentTime());
  const [waterTime, setWaterTime] = useState(currentTime());
  const [subTime, setSubTime] = useState(currentTime());
  const [stressTime, setStressTime] = useState(currentTime());
  const [otherTime, setOtherTime] = useState(currentTime());

  // ── Meal state ────────────────────────────────────────────────────────────
  const MEAL_TYPES = [
    { label: 'Balanced', value: 'balanced' },
    { label: 'High Carb', value: 'high_carb' },
    { label: 'High Protein', value: 'high_protein' },
    { label: 'Fast Food', value: 'fast_food' },
    { label: 'Ketogenic', value: 'ketogenic' },
    { label: 'Custom', value: 'custom' },
  ];
  const [mealType, setMealType] = useState<'balanced' | 'high_carb' | 'high_protein' | 'fast_food' | 'ketogenic' | 'custom'>('balanced');
  const [mealKcal, setMealKcal] = useState('500');
  const [mealCarb, setMealCarb] = useState('');
  const [mealFat, setMealFat] = useState('');
  const [mealProt, setMealProt] = useState('');
  // Meal tab mode: 'pick' = food-list picker | 'quick' = calories-only | 'custom' = full macros
  type MealPickerMode = 'pick' | 'quick' | 'custom';
  const [mealPickerMode, setMealPickerMode] = useState<MealPickerMode>('pick');
  const [mealSearch, setMealSearch] = useState('');
  const [mealCategory, setMealCategory] = useState('all');
  const [selectedCsvFood, setSelectedCsvFood] = useState<CsvFoodItem | null>(null);
  const [csvFoodAmount, setCsvFoodAmount] = useState(1);
  const [foodRenderLimit, setFoodRenderLimit] = useState(20);

  useEffect(() => {
    setFoodRenderLimit(20);
  }, [mealSearch, mealCategory]);

  const filteredRecipes = React.useMemo(() => {
    return CSV_FOOD_DB.filter(r => {
      const matchCat = mealCategory === 'all' || r.category === mealCategory;
      const matchQ = !mealSearch || r.food.toLowerCase().includes(mealSearch.toLowerCase());
      return matchCat && matchQ;
    });
  }, [mealCategory, mealSearch]);

  // ── Exercise state ────────────────────────────────────────────────────────
  const EXERCISE_PRESETS = [
    { label: 'Walk', value: '0.2' },
    { label: 'Easy Jog', value: '0.35' },
    { label: 'Run', value: '0.55' },
    { label: 'HIIT', value: '0.75' },
    { label: 'Max', value: '0.95' },
  ];
  const [exIntensity, setExIntensity] = useState(0.5);
  const [exDuration, setExDuration] = useState('30');  // minutes

  // ── Sleep state ───────────────────────────────────────────────────────────
  const [sleepHours, setSleepHours] = useState(7.5);

  // ── Water state ───────────────────────────────────────────────────────────
  const [waterMl, setWaterMl] = useState('300');
  const WATER_QUICK = [150, 250, 300, 500, 750, 1000];

  // ── Substance state ───────────────────────────────────────────────────────
  // Substances grouped by route — fetched from backend
  // We expose ORAL ones prominently + allow any
  const COMMON_SUBS = [
    'Acetaminophen',
    'Acetoacetate',
    'Albumin',
    'Albuterol',
    'Aspirin',
    'Bicarbonate',
    'Blood_ABNegative',
    'Blood_ABPositive',
    'Blood_ANegative',
    'Blood_APositive',
    'Blood_BNegative',
    'Blood_BPositive',
    'Blood_ONegative',
    'Blood_OPositive',
    'Caffeine',
    'Calcium',
    'Chloride',
    'Desflurane',
    'Epinephrine',
    'Ertapenem',
    'Ethanol',
    'Fentanyl',
    'Furosemide',
    'Globulin',
    'Glucagon',
    'Glucose',
    'Insulin',
    'Ketamine',
    'Lactate',
    'Magnesium',
    'Midazolam',
    'Morphine',
    'Moxifloxacin',
    'Naloxone',
    'Nicotine',
    'Norepinephrine',
    'Piperacillin',
    'PiperacillinTazobactam',
    'PlasmaLyteA',
    'Potassium',
    'Pralidoxime',
    'Prednisone',
    'RingersLactate',
    'Rocuronium',
    'Saline',
    'SalineSlowDrip',
    'Sarin',
    'Sodium',
    'Succinylcholine',
    'Tazobactam',
    'TranexamicAcid',
    'Urea',
    'Vasopressin'
  ];
  const [subName, setSubName] = useState('Caffeine');
  const [subSearch, setSubSearch] = useState('');
  const [subDose, setSubDose] = useState('200');
  const [showSubPicker, setShowSubPicker] = useState(false);

  const allSubNames = React.useMemo(() => {
    const fromBackend = Object.values(substances).flat().map((s: any) => typeof s === 'string' ? s : s.name);
    const combined = [...new Set([...COMMON_SUBS, ...fromBackend])];
    return combined.sort();
  }, [substances]);

  const filteredSubs = React.useMemo(() => {
    return subSearch.trim()
      ? allSubNames.filter(s => s.toLowerCase().includes(subSearch.toLowerCase()))
      : allSubNames;
  }, [allSubNames, subSearch]);

  // ── Stress state ──────────────────────────────────────────────────────────
  const STRESS_PRESETS = [
    { label: 'Mild', value: 0.2 },
    { label: 'Moderate', value: 0.5 },
    { label: 'High', value: 0.75 },
    { label: 'Severe', value: 1.0 },
  ];
  const [stressLevel, setStressLevel] = useState(0.3);
  const [stressDur, setStressDur] = useState('15'); // minutes

  // ── Other (Alcohol + Fast) ────────────────────────────────────────────────
  const [otherMode, setOtherMode] = useState<'alcohol' | 'fast'>('alcohol');
  const [alcoholDrinks, setAlcohol] = useState('1');
  const [fastHours, setFastHours] = useState(16);

  // ── UI modals ─────────────────────────────────────────────────────────────
  const [saveRoutineModal, setSaveRoutineModal] = useState(false);
  const [routineName, setRoutineName] = useState('');
  const [lastLoadedRoutineName, setLastLoadedRoutineName] = useState<string | null>(null);

  // ── Rename routine state ──────────────────────────────────────────────────
  const [renameRoutineModal, setRenameRoutineModal] = useState(false);
  const [renamingRoutineId, setRenamingRoutineId] = useState<string | null>(null);
  const [renamingNewName, setRenamingNewName] = useState('');

  useEffect(() => {
    refreshSubstances();
    refreshSessions();
    refreshAnalytics();
  }, []);

  // ── addEvent handlers ─────────────────────────────────────────────────────

  const addMeal = () => {
    const kcal = parseFloat(mealKcal);
    if (isNaN(kcal) || kcal < 5 || kcal > 10000) {
      return Alert.alert('Validation Error', 'Meal calories must be between 5 and 10,000 kcal.');
    }

    // ── Macro normalization ───────────────────────────────────────────────────
    // BioGears validator REQUIRES carb_g / fat_g / protein_g when meal_type is
    // 'custom'. If the user left the macro fields blank, we estimate them from
    // the balanced preset (40% carb / 30% fat / 30% protein) so the simulation
    // never fails with a validation error.
    let finalMealType = mealType;
    let mealMacros: { carb_g: number; fat_g: number; protein_g: number } | null = null;

    if (mealType === 'custom') {
      const carbVal = parseFloat(mealCarb);
      const fatVal = parseFloat(mealFat);
      const protVal = parseFloat(mealProt);
      const hasAllMacros = !isNaN(carbVal) && carbVal >= 0
        && !isNaN(fatVal) && fatVal >= 0
        && !isNaN(protVal) && protVal >= 0;
      if (hasAllMacros) {
        // User provided explicit macros — send as custom
        mealMacros = { carb_g: carbVal, fat_g: fatVal, protein_g: protVal };
      } else {
        // Estimate macros from balanced preset so the validator passes
        mealMacros = {
          carb_g: Math.round(kcal * 0.40 / 4),
          fat_g: Math.round(kcal * 0.30 / 9),
          protein_g: Math.round(kcal * 0.30 / 4),
        };
        // Keep 'custom' type so BioGears uses our explicit values
      }
    }

    const mealLabel = mealType === 'custom'
      ? 'Custom'
      : MEAL_TYPES.find(m => m.value === mealType)?.label ?? mealType;

    addEvent({
      event_type: 'meal', value: kcal, wallTime: mealTime,
      meal_type: finalMealType,
      ...(mealMacros ?? {}),
      displayLabel: `${mealLabel} Meal · ${kcal} kcal`,
      displayIcon: '🍽️',
    });
    setMealKcal('500');
    setMealCarb(''); setMealFat(''); setMealProt('');
  };

  const addExercise = () => {
    const mins = parseInt(exDuration, 10);
    if (isNaN(mins) || mins < 1 || mins > 240) {
      return Alert.alert('Validation Error', 'Workout duration must be between 1 and 240 minutes (4 hours).');
    }
    const dur = mins * 60;
    addEvent({
      event_type: 'exercise', value: exIntensity, wallTime: exerciseTime,
      duration_seconds: dur,
      displayLabel: `Exercise · ${Math.round(exIntensity * 100)}% intensity · ${mins}min`,
      displayIcon: '🏃',
    });
  };

  const addSleep = () => {
    const hours = clamp(sleepHours, 0.25, 12);
    addEvent({
      event_type: 'sleep', value: hours, wallTime: sleepTime,
      displayLabel: `Sleep · ${hours}h`,
      displayIcon: '😴',
    });
  };

  const addWater = () => {
    const ml = parseFloat(waterMl);
    if (isNaN(ml) || ml < 5 || ml > 10000) {
      return Alert.alert('Validation Error', 'Water volume must be between 5 and 10,000 mL.');
    }
    addEvent({
      event_type: 'water', value: ml, wallTime: waterTime,
      displayLabel: `Water · ${ml} mL`,
      displayIcon: '💧',
    });
  };

  const addSubstance = () => {
    const dose = parseFloat(subDose);
    if (!subName) return Alert.alert('Validation Error', 'Please select a substance.');
    if (isNaN(dose) || dose <= 0) return Alert.alert('Validation Error', 'Substance dose must be greater than 0.');
    addEvent({
      event_type: 'substance', value: dose, wallTime: subTime,
      substance_name: subName,
      displayLabel: `${subName} · ${dose}`,
      displayIcon: '💊',
    });
  };

  const addStress = () => {
    const mins = parseInt(stressDur, 10);
    if (isNaN(mins) || mins < 1 || mins > 240) {
      return Alert.alert('Validation Error', 'Stress duration must be between 1 and 240 minutes (4 hours).');
    }
    const dur = mins * 60;
    addEvent({
      event_type: 'stress', value: stressLevel, wallTime: stressTime,
      duration_seconds: dur,
      displayLabel: `Stress · ${Math.round(stressLevel * 100)}% · ${mins}min`,
      displayIcon: '🧘',
    });
  };

  const addAlcohol = () => {
    const drinks = parseFloat(alcoholDrinks);
    if (isNaN(drinks) || drinks <= 0 || drinks > 10) {
      return Alert.alert('Validation Error', 'Alcohol drinks must be between 0.1 and 10 standard drinks.');
    }
    addEvent({
      event_type: 'alcohol', value: drinks, wallTime: otherTime,
      displayLabel: `Alcohol · ${drinks} standard drink${drinks !== 1 ? 's' : ''}`,
      displayIcon: '🍺',
    });
  };

  const addFast = () => {
    const hours = clamp(fastHours, 1, 48);
    addEvent({
      event_type: 'fast', value: hours, wallTime: otherTime,
      displayLabel: `Fasting · ${hours}h`,
      displayIcon: '⏳',
    });
  };

  // ── Simulate ──────────────────────────────────────────────────────────────

  const handleSimulate = async () => {
    if (todayEvents.length === 0)
      return Alert.alert('No Events', 'Log at least one event before simulating.');
    if (twinStatus !== 'ready')
      return Alert.alert('Twin Not Ready', 'Complete your clinical profile first (Profile → Calibrate Twin).');

    // Auto-generate name based on loaded routine or date
    const baseName = lastLoadedRoutineName
      ? `${lastLoadedRoutineName} Sim`
      : `Sim ${new Date().toLocaleDateString('en-IN')}`;

    let finalName = baseName;
    let counter = 1;
    while (sessions.some(s => s.name === finalName)) {
      finalName = `${baseName} (${counter})`;
      counter++;
    }

    setSimulationName(finalName);
    switchMode('dashboard');
    setDashTab('overview'); // jump to overview so user sees the progress overlay
    try {
      await runSimulation();
    } catch (e: any) {
      // Error is already stored in simulationError state (shown in-page).
      console.warn('[Twin] Simulation error:', e.message);
    }
  };

  const handleLoadRoutine = (routineId: string, name: string) => {
    // If there are no events today, load directly without conflict check
    if (todayEvents.length === 0) {
      Alert.alert(`Load "${name}"`, 'Adds saved events to today\'s timeline.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Load', onPress: () => { loadRoutine(routineId); setLastLoadedRoutineName(name); switchMode('routine'); } },
      ]);
      return;
    }

    // There are existing events — use smart merge with conflict detection
    Alert.alert(
      `Load "${name}"`,
      `You already have ${todayEvents.length} event(s) logged today. The smart merge will check for overlapping events before adding routine events.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Smart Merge',
          onPress: () => {
            setConflictSheetMode('routine');
            setLastLoadedRoutineName(name);
            loadRoutineWithConflictCheck(routineId, (_conflicts, resolve) => {
              // onConflicts callback: context stores the conflicts in pendingConflicts
              // The ConflictResolutionSheet will pick it up automatically
            });
            switchMode('routine');
          },
        },
      ]
    );
  };

  const handleEditRoutine = (routineId: string, name: string) => {
    loadRoutine(routineId);
    setEditingRoutineId(routineId);
    setRoutineName(name);
    setLastLoadedRoutineName(name);
    switchMode('routine');
  };

  // Open rename modal for a routine — does NOT load events, just renames.
  const handleOpenRename = (routineId: string, currentName: string) => {
    setRenamingRoutineId(routineId);
    setRenamingNewName(currentName);
    setRenameRoutineModal(true);
  };

  const handleConfirmRename = async () => {
    if (!renamingRoutineId || !renamingNewName.trim()) return;
    try {
      await renameRoutine(renamingRoutineId, renamingNewName.trim());
      setRenameRoutineModal(false);
      setRenamingRoutineId(null);
      setRenamingNewName('');
      Alert.alert('Renamed', `Routine renamed to "${renamingNewName.trim()}".`);
    } catch (e: any) {
      Alert.alert('Cannot Rename', e.message);
    }
  };

  const handleSaveRoutine = async () => {
    const trimmedName = routineName.trim();
    if (!trimmedName) return;

    let finalName = trimmedName;

    // If NOT editing, or they changed the name while editing, check for duplicates
    const isOverwritingCurrent = editingRoutineId && savedRoutines.find(r => r.id === editingRoutineId)?.name === finalName;

    if (!isOverwritingCurrent) {
      let counter = 1;
      while (savedRoutines.some(r => r.name === finalName)) {
        finalName = `${trimmedName} (${counter})`;
        counter++;
      }
    }

    const isFirstRoutine = savedRoutines.length === 0;
    const noDefaultExists = !savedRoutines.some(r => r.isDefault);
    const shouldAutoDefault = isFirstRoutine || (editingRoutineId == null && noDefaultExists);

    await saveCurrentRoutine(finalName, undefined, editingRoutineId || undefined, shouldAutoDefault);
    setRoutineName('');
    setSaveRoutineModal(false);
    Alert.alert('Routine Saved', `"${finalName}" saved with ${todayEvents.length} events.${isFirstRoutine ? '\n\n⭐ Set as your default catch-up routine.' : ''}`);
  };

  const handleUndo = () => {
    Alert.alert('Undo Last Simulation', 'Revert twin engine to previous state?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Undo', style: 'destructive', onPress: async () => {
          try { await undoLastSimulation(); Alert.alert('Reverted', 'Engine state restored.'); }
          catch (e: any) { Alert.alert('Error', e.message); }
        }
      },
    ]);
  };

  const handleRestoreDefault = () => {
    Alert.alert(
      'Restore Default State',
      "Would you like to restore your initial onboarding routine ('My Saved State') as your default catch-up routine?",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore', onPress: restoreDefaultRoutine },
      ]
    );
  };

  // ────────────────────────────────────────────────────────────────────────────
  // TAB CONTENT
  // ────────────────────────────────────────────────────────────────────────────

  // ── Meal tab: add from recipe list ───────────────────────────────────
  const confirmCsvFoodAdd = () => {
    if (!selectedCsvFood) return;
    const { base } = parseDisplayAmount(selectedCsvFood.display_amount);
    const multiplier = csvFoodAmount / base;
    const scaled = scaleNutrients(selectedCsvFood, multiplier);

    addEvent({
      event_type: 'meal',
      value: scaled.calories,
      wallTime: mealTime,
      meal_type: 'custom',
      carb_g: scaled.carbs,
      fat_g: scaled.fat,
      protein_g: scaled.protein,
      displayLabel: `${selectedCsvFood.food} · ${scaled.calories} kcal`,
      displayIcon: 'restaurant',
    });
    Alert.alert('✅ Added', `${selectedCsvFood.food} logged at ${wallTimeToLabel(mealTime)}`);
    setSelectedCsvFood(null);
  };

  const MACRO_PRESETS: Record<string, { carb: number; fat: number; protein: number }> = {
    balanced: { carb: 0.40, fat: 0.30, protein: 0.30 },
    high_carb: { carb: 0.60, fat: 0.20, protein: 0.20 },
    high_protein: { carb: 0.30, fat: 0.20, protein: 0.50 },
    fast_food: { carb: 0.45, fat: 0.40, protein: 0.15 },
    ketogenic: { carb: 0.05, fat: 0.75, protein: 0.20 },
  };

  const renderMealTab = () => {
    return (
      <View>
        {/* ── Mode selector ─────────────────────────────── */}
        <View style={[ss.modeRow, { backgroundColor: c.card, borderColor: c.border }]}>
          {([
            { id: 'pick', label: '🍽️ Food List', icon: 'list' },
            { id: 'quick', label: '⚡ Quick', icon: 'flash' },
            { id: 'custom', label: '✏️ Custom', icon: 'create' },
          ] as { id: 'pick' | 'quick' | 'custom'; label: string; icon: any }[]).map(m => (
            <TouchableOpacity
              key={m.id}
              style={[ss.modeBtn, mealPickerMode === m.id && { backgroundColor: '#f59e0b' }]}
              onPress={() => setMealPickerMode(m.id)}
            >
              <Text style={[ss.modeBtnTxt, { color: mealPickerMode === m.id ? '#fff' : c.sub }]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Time picker (shared) ───────────────────────── */}
        <View style={[ss.timeRow, { marginBottom: 12 }]}>
          <Ionicons name="time-outline" size={14} color={c.sub} />
          <Text style={[ss.timeLbl, { color: c.sub }]}>Eaten at</Text>
          <TimePicker value={mealTime} onChange={setMealTime} accent="#f59e0b" />
        </View>

        {/* ════════════════════════════════════════════════
            MODE 1: FOOD PICKER
            ════════════════════════════════════════════════ */}
        {mealPickerMode === 'pick' && (
          <View>
            {/* Search */}
            <View style={[ss.searchRow, { backgroundColor: c.card, borderColor: c.border }]}>
              <Ionicons name="search" size={16} color={c.sub} />
              <TextInput
                style={[ss.searchInput, { color: c.text }]}
                placeholder="Search food..."
                placeholderTextColor={c.sub}
                value={mealSearch}
                onChangeText={setMealSearch}
              />
              {mealSearch.length > 0 && (
                <TouchableOpacity onPress={() => setMealSearch('')}>
                  <Ionicons name="close-circle" size={16} color={c.sub} />
                </TouchableOpacity>
              )}
            </View>

            {/* Category filter chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
              {CSV_CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={[ss.chip, mealCategory === cat.id && { backgroundColor: '#f59e0b', borderColor: '#f59e0b' }]}
                  onPress={() => setMealCategory(cat.id)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name={cat.icon as any} size={12} color={mealCategory === cat.id ? '#fff' : '#f59e0b'} />
                    <Text style={[ss.chipTxt, mealCategory === cat.id && { color: '#fff' }]}>
                      {cat.label}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Food cards grid */}
            {filteredRecipes.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                <Ionicons name="search-outline" size={32} color={c.sub} />
                <Text style={[{ color: c.sub, marginTop: 8, fontSize: 13 }]}>No food found. Try the Quick or Custom tab.</Text>
              </View>
            ) : (
              <View style={{ height: 450, marginTop: 4 }}>
                <ScrollView
                  nestedScrollEnabled={true}
                  showsVerticalScrollIndicator={false}
                  scrollEventThrottle={100}
                  onScroll={({ nativeEvent }) => {
                    const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
                    const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 300;
                    if (isCloseToBottom && foodRenderLimit < filteredRecipes.length) {
                      setFoodRenderLimit(prev => prev + 20);
                    }
                  }}
                >
                  <View style={ss.foodGrid}>
                    {filteredRecipes.slice(0, foodRenderLimit).map((recipe, idx) => {
                      const carbG = recipe.carbs_g;
                      const fatG = recipe.fat_g;
                      const protG = recipe.protein_g;
                      return (
                        <TouchableOpacity
                          key={`csv_${idx}`}
                          style={[ss.foodCard, { backgroundColor: c.card, borderColor: c.border }]}
                          onPress={() => {
                            setSelectedCsvFood(recipe);
                            setCsvFoodAmount(parseDisplayAmount(recipe.display_amount).base);
                          }}
                          activeOpacity={0.75}
                        >
                          <View style={ss.foodEmoji}>
                            <Ionicons name={getCategoryIcon(recipe.category) as any} size={16} color="#f59e0b" />
                          </View>
                          <Text style={[ss.foodName, { color: c.text }]} numberOfLines={2}>{recipe.food}</Text>
                          <Text style={[ss.foodCal, { color: '#f59e0b' }]}>{recipe.calories} kcal</Text>
                          <View style={ss.foodMacroRow}>
                            <Text style={[ss.foodMacro, { color: '#f59e0b' }]}>{carbG}g C</Text>
                            <Text style={[ss.foodMacro, { color: '#10b981' }]}>{protG}g P</Text>
                            <Text style={[ss.foodMacro, { color: '#ef4444' }]}>{fatG}g F</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            )}
          </View>
        )}

        {/* ════════════════════════════════════════════════
            MODE 2: QUICK ADD
            ════════════════════════════════════════════════ */}
        {mealPickerMode === 'quick' && (
          <View>
            <SectionLabel text="Meal Preset" c={c} />
            <ChipRow
              options={MEAL_TYPES.filter(m => m.value !== 'custom')}
              selected={mealType as any}
              onSelect={(v) => setMealType(v as typeof mealType)}
              accent="#f59e0b"
            />

            <SectionLabel text="Calories" c={c} />
            {/* Quick calorie presets */}
            <View style={ss.rowCentered}>
              {[200, 350, 450, 600, 750, 900].map(kcal => (
                <TouchableOpacity
                  key={kcal}
                  style={[ss.chipSm, mealKcal === String(kcal) && { backgroundColor: '#f59e0b', borderColor: '#f59e0b' }]}
                  onPress={() => setMealKcal(String(kcal))}
                >
                  <Text style={[ss.chipTxt, mealKcal === String(kcal) && { color: '#fff' }]}>{kcal}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <NumericInput value={mealKcal} onChange={setMealKcal} placeholder="e.g. 500" suffix="kcal" c={c} />

            {/* Auto macro preview */}
            <View style={[ss.previewBox, { backgroundColor: c.bg, borderColor: c.border }]}>
              <Text style={[ss.previewTitle, { color: c.sub }]}>AUTO MACRO SPLIT</Text>
              <View style={ss.triRow}>
                {(() => {
                  const kcal = parseFloat(mealKcal) || 0;
                  const p = MACRO_PRESETS[mealType] || MACRO_PRESETS['balanced'];
                  return [
                    { label: 'Carbs', g: Math.round(kcal * p.carb / 4), color: '#f59e0b' },
                    { label: 'Protein', g: Math.round(kcal * p.protein / 4), color: '#10b981' },
                    { label: 'Fat', g: Math.round(kcal * p.fat / 9), color: '#ef4444' },
                  ].map(item => (
                    <View key={item.label} style={{ flex: 1, alignItems: 'center' }}>
                      <Text style={[ss.macroG, { color: item.color }]}>{item.g}g</Text>
                      <Text style={[ss.macroLbl, { color: c.sub }]}>{item.label}</Text>
                    </View>
                  ));
                })()}
              </View>
            </View>

            <AddButton label="Add Meal" accent="#f59e0b" onPress={addMeal} />
          </View>
        )}

        {/* ════════════════════════════════════════════════
            MODE 3: CUSTOM (full macros)
            ════════════════════════════════════════════════ */}
        {mealPickerMode === 'custom' && (
          <View>
            <SectionLabel text="Food Name (optional)" c={c} />
            <View style={[ss.numRow, { backgroundColor: c.card, borderColor: c.border }]}>
              <TextInput
                style={[ss.numInput, { color: c.text, flex: 1 }]}
                placeholder="e.g. Poha, Dal Rice..."
                placeholderTextColor={c.sub}
                value={mealSearch}
                onChangeText={setMealSearch}
              />
            </View>

            <SectionLabel text="Calories" c={c} />
            <NumericInput value={mealKcal} onChange={setMealKcal} placeholder="e.g. 400" suffix="kcal" c={c} />

            <SectionLabel text="Macros in grams — Optional" c={c} />
            <View style={ss.triRow}>
              <View style={{ flex: 1 }}>
                <Text style={[ss.macroLbl, { color: '#f59e0b' }]}>Carbs</Text>
                <NumericInput value={mealCarb} onChange={setMealCarb} placeholder="g" c={c} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[ss.macroLbl, { color: '#10b981' }]}>Protein</Text>
                <NumericInput value={mealProt} onChange={setMealProt} placeholder="g" c={c} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[ss.macroLbl, { color: '#ef4444' }]}>Fat</Text>
                <NumericInput value={mealFat} onChange={setMealFat} placeholder="g" c={c} />
              </View>
            </View>

            <View style={[ss.infoBox, { backgroundColor: '#f59e0b15', borderColor: '#f59e0b40', marginTop: 6, marginBottom: 12 }]}>
              <Ionicons name="information-circle-outline" size={14} color="#f59e0b" />
              <Text style={{ color: '#f59e0b', fontSize: 12, flex: 1, marginLeft: 6 }}>
                Leave macros blank — BioGears auto-estimates from a balanced split.
              </Text>
            </View>

            <AddButton
              label={mealSearch.trim() ? `Add ${mealSearch.trim()}` : 'Add Custom Meal'}
              accent="#f59e0b"
              onPress={() => {
                setMealType('custom');
                addMeal();
                setMealSearch('');
              }}
            />
          </View>
        )}
      </View>
    );
  };


  const renderExerciseTab = () => (
    <View>
      {/* ── Activity Lab shortcut ── */}
      <TouchableOpacity
        style={[ss.actLabCard, { backgroundColor: '#10b98118', borderColor: '#10b98140' }]}
        onPress={() => router.push('/activity')}
        activeOpacity={0.85}
      >
        <View style={ss.actLabLeft}>
          <View style={ss.actLabIconContainer}>
            <Ionicons name="fitness" size={20} color="#10b981" />
          </View>
          <View>
            <Text style={[ss.actLabTitle, { color: c.text }]}>Activity Lab</Text>
            <Text style={[ss.actLabSub, { color: c.sub }]}>40+ activities · MET calorie burn · full detail</Text>
          </View>
        </View>
        <View style={[ss.actLabBtn, { backgroundColor: '#10b981' }]}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Open →</Text>
        </View>
      </TouchableOpacity>

      {/* ── BioGears quick add ── */}
      <SectionLabel text="Or quick-log for BioGears simulation" c={c} />
      <View style={ss.rowCentered}>
        {EXERCISE_PRESETS.map(p => (
          <TouchableOpacity
            key={p.value}
            onPress={() => setExIntensity(parseFloat(p.value))}
            style={[ss.chipSm, Math.abs(exIntensity - parseFloat(p.value)) < 0.01 && { backgroundColor: '#10b981', borderColor: '#10b981' }]}
          >
            <Text style={[ss.chipTxt, Math.abs(exIntensity - parseFloat(p.value)) < 0.01 && { color: '#fff' }]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <SliderRow
        label={`Intensity: ${Math.round(exIntensity * 100)}% (${exIntensity <= 0.25 ? 'Light' : exIntensity <= 0.5 ? 'Moderate' : exIntensity <= 0.75 ? 'Vigorous' : 'Maximum'})`}
        value={exIntensity} min={0.05} max={1.0} step={0.05}
        onChange={setExIntensity} accent="#10b981" c={c}
      />

      <SectionLabel text="Duration" c={c} />
      <View style={ss.rowCentered}>
        {['10', '20', '30', '45', '60', '90'].map(m => (
          <TouchableOpacity key={m} onPress={() => setExDuration(m)}
            style={[ss.chipSm, exDuration === m && { backgroundColor: '#10b981', borderColor: '#10b981' }]}>
            <Text style={[ss.chipTxt, exDuration === m && { color: '#fff' }]}>{m}m</Text>
          </TouchableOpacity>
        ))}
      </View>
      <NumericInput value={exDuration} onChange={setExDuration} placeholder="Duration (min)" suffix="min" c={c} />

      <View style={[ss.infoBox, { backgroundColor: '#10b98115', borderColor: '#10b98140' }]}>
        <Ionicons name="flash" size={14} color="#10b981" />
        <Text style={{ color: '#10b981', fontSize: 12, flex: 1, marginLeft: 6 }}>
          BioGears simulates cardiac output, O₂ consumption, glucose burn & exercise recovery in real-time.
        </Text>
      </View>

      <SectionLabel text="Occurred at" c={c} />
      <View style={ss.timeRow}>
        <Ionicons name="time-outline" size={14} color={c.sub} />
        <Text style={[ss.timeLbl, { color: c.sub }]}>Started at</Text>
        <TimePicker value={exerciseTime} onChange={setExerciseTime} accent="#10b981" />
      </View>

      <AddButton label="Add Exercise to BioGears" accent="#10b981" onPress={addExercise} />
    </View>
  );

  const renderSleepTab = () => (
    <View>
      <SectionLabel text="Hours of Sleep" c={c} />

      <View style={[ss.bigDisplay, { borderColor: '#6366f140' }]}>
        <Text style={[ss.bigNum, { color: '#6366f1' }]}>{sleepHours.toFixed(1)}</Text>
        <Text style={[ss.bigUnit, { color: c.sub }]}>hours</Text>
      </View>

      <SliderRow
        label="Sleep duration"
        value={sleepHours} min={0.5} max={12} step={0.5}
        onChange={setSleepHours} accent="#6366f1" c={c}
      />

      <View style={ss.rowCentered}>
        {[4, 5, 6, 7, 7.5, 8, 9].map(h => (
          <TouchableOpacity key={h} onPress={() => setSleepHours(h)}
            style={[ss.chipSm, sleepHours === h && { backgroundColor: '#6366f1', borderColor: '#6366f1' }]}>
            <Text style={[ss.chipTxt, sleepHours === h && { color: '#fff' }]}>{h}h</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={[ss.infoBox, { backgroundColor: '#6366f115', borderColor: '#6366f140', marginTop: 12 }]}>
        <Ionicons name="moon" size={14} color="#6366f1" />
        <Text style={{ color: '#6366f1', fontSize: 12, flex: 1, marginLeft: 6 }}>
          Sleep activates BioGears SleepData action — parasympathetic dominance, HR drops, glucose resets.
        </Text>
      </View>

      <SectionLabel text="Sleep start time" c={c} />
      <View style={ss.timeRow}>
        <Ionicons name="time-outline" size={14} color={c.sub} />
        <Text style={[ss.timeLbl, { color: c.sub }]}>Slept at</Text>
        <TimePicker value={sleepTime} onChange={setSleepTime} accent="#6366f1" />
      </View>

      <AddButton label="Log Sleep" accent="#6366f1" onPress={addSleep} />
    </View>
  );

  const renderWaterTab = () => (
    <View>
      <SectionLabel text="Amount" c={c} />

      <View style={[ss.bigDisplay, { borderColor: '#0ea5e940' }]}>
        <Text style={[ss.bigNum, { color: '#0ea5e9' }]}>{waterMl}</Text>
        <Text style={[ss.bigUnit, { color: c.sub }]}>mL</Text>
      </View>

      <SectionLabel text="Quick add" c={c} />
      <View style={ss.quickGrid}>
        {WATER_QUICK.map(ml => (
          <TouchableOpacity key={ml} onPress={() => setWaterMl(String(ml))}
            style={[ss.quickChip, waterMl === String(ml) && { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' }]}>
            <Text style={[ss.quickChipTxt, waterMl === String(ml) && { color: '#fff' }]}>{ml}mL</Text>
          </TouchableOpacity>
        ))}
      </View>

      <SectionLabel text="Custom amount" c={c} />
      <NumericInput value={waterMl} onChange={setWaterMl} placeholder="e.g. 350" suffix="mL" c={c} />

      <View style={[ss.infoBox, { backgroundColor: '#0ea5e915', borderColor: '#0ea5e940', marginTop: 4 }]}>
        <Ionicons name="water" size={14} color="#0ea5e9" />
        <Text style={{ color: '#0ea5e9', fontSize: 12, flex: 1, marginLeft: 6 }}>
          Modeled as ConsumeNutrientsData (Water). Affects blood volume, BP, and kidney function.
        </Text>
      </View>

      <SectionLabel text="Time" c={c} />
      <View style={ss.timeRow}>
        <Ionicons name="time-outline" size={14} color={c.sub} />
        <Text style={[ss.timeLbl, { color: c.sub }]}>Drank at</Text>
        <TimePicker value={waterTime} onChange={setWaterTime} accent="#0ea5e9" />
      </View>

      <AddButton label="Add Water" accent="#0ea5e9" onPress={addWater} />
    </View>
  );

  const renderSubstanceTab = () => (
    <View>
      <SectionLabel text="Substance" c={c} />

      {/* Selected substance display */}
      <TouchableOpacity
        style={[ss.subSelector, { backgroundColor: c.card, borderColor: '#8b5cf6' }]}
        onPress={() => setShowSubPicker(true)}
      >
        <Text style={{ fontSize: 16, fontWeight: '700', color: '#8b5cf6' }}>{subName}</Text>
        <Ionicons name="chevron-down" size={16} color="#8b5cf6" />
      </TouchableOpacity>

      {/* Common quick picks */}
      <SectionLabel text="Common substances" c={c} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        {['Caffeine', 'Aspirin', 'Acetaminophen', 'Albuterol', 'Insulin', 'Morphine'].map(s => (
          <TouchableOpacity key={s} onPress={() => { setSubName(s); setSubDose(s === 'Caffeine' ? '100' : s === 'Insulin' ? '10' : '500'); }}
            style={[ss.chip, subName === s && { backgroundColor: '#8b5cf6', borderColor: '#8b5cf6' }]}>
            <Text style={[ss.chipTxt, subName === s && { color: '#fff' }]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <SectionLabel text="Dose" c={c} />
      <NumericInput value={subDose} onChange={setSubDose} placeholder="Amount" suffix="mg / mL" c={c} />

      <View style={[ss.infoBox, { backgroundColor: '#8b5cf615', borderColor: '#8b5cf640' }]}>
        <Ionicons name="medical" size={14} color="#8b5cf6" />
        <Text style={{ color: '#8b5cf6', fontSize: 12, flex: 1, marginLeft: 6 }}>
          79 substances supported. Oral (Caffeine, Aspirin), Nasal (Albuterol), IV Bolus, IV Compound. BioGears models full PK/PD kinetics.
        </Text>
      </View>

      <SectionLabel text="Time taken" c={c} />
      <View style={ss.timeRow}>
        <Ionicons name="time-outline" size={14} color={c.sub} />
        <Text style={[ss.timeLbl, { color: c.sub }]}>Taken at</Text>
        <TimePicker value={subTime} onChange={setSubTime} accent="#8b5cf6" />
      </View>

      <AddButton label="Add Substance" accent="#8b5cf6" onPress={addSubstance} />
    </View>
  );

  const renderStressTab = () => (
    <View>
      <SectionLabel text="Stress Level" c={c} />

      <View style={[ss.bigDisplay, { borderColor: '#ef444440' }]}>
        <Text style={[ss.bigNum, { color: '#ef4444' }]}>{Math.round(stressLevel * 100)}%</Text>
        <Text style={[ss.bigUnit, { color: c.sub }]}>
          {stressLevel <= 0.25 ? 'Mild' : stressLevel <= 0.5 ? 'Moderate' : stressLevel <= 0.75 ? 'High' : 'Severe'}
        </Text>
      </View>

      {/* Preset buttons */}
      <View style={ss.rowCentered}>
        {STRESS_PRESETS.map(p => (
          <TouchableOpacity key={p.label} onPress={() => setStressLevel(p.value)}
            style={[ss.chipSm, Math.abs(stressLevel - p.value) < 0.01 && { backgroundColor: '#ef4444', borderColor: '#ef4444' }]}>
            <Text style={[ss.chipTxt, Math.abs(stressLevel - p.value) < 0.01 && { color: '#fff' }]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <SliderRow
        label="Intensity"
        value={stressLevel} min={0.05} max={1.0} step={0.05}
        onChange={setStressLevel} accent="#ef4444" c={c}
      />

      <SectionLabel text="Duration" c={c} />
      <View style={ss.rowCentered}>
        {['5', '10', '15', '20', '30', '60'].map(m => (
          <TouchableOpacity key={m} onPress={() => setStressDur(m)}
            style={[ss.chipSm, stressDur === m && { backgroundColor: '#ef4444', borderColor: '#ef4444' }]}>
            <Text style={[ss.chipTxt, stressDur === m && { color: '#fff' }]}>{m}m</Text>
          </TouchableOpacity>
        ))}
      </View>
      <NumericInput value={stressDur} onChange={setStressDur} placeholder="Duration (min)" suffix="min" c={c} />

      <View style={[ss.infoBox, { backgroundColor: '#ef444415', borderColor: '#ef444440', marginTop: 4 }]}>
        <Ionicons name="warning" size={14} color="#ef4444" />
        <Text style={{ color: '#ef4444', fontSize: 12, flex: 1, marginLeft: 6 }}>
          Modeled via PainStimulusData (sympathetic pathway). Raises HR, BP, glucose, and respiratory rate.
        </Text>
      </View>

      <SectionLabel text="Occurred at" c={c} />
      <View style={ss.timeRow}>
        <Ionicons name="time-outline" size={14} color={c.sub} />
        <Text style={[ss.timeLbl, { color: c.sub }]}>Started at</Text>
        <TimePicker value={stressTime} onChange={setStressTime} accent="#ef4444" />
      </View>

      <AddButton label="Add Stress Event" accent="#ef4444" onPress={addStress} />
    </View>
  );

  const renderOtherTab = () => (
    <View>
      <SectionLabel text="Event Type" c={c} />
      <View style={ss.modeSwitch}>
        {(['alcohol', 'fast'] as const).map(m => (
          <TouchableOpacity key={m} onPress={() => setOtherMode(m)}
            style={[ss.modeSwitchBtn, otherMode === m && { backgroundColor: '#ec4899' }]}>
            <Text style={[ss.modeSwitchTxt, otherMode === m && { color: '#fff' }]}>
              {m === 'alcohol' ? '🍺 Alcohol' : '⏳ Fasting'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {otherMode === 'alcohol' ? (
        <>
          <SectionLabel text="Standard Drinks" c={c} />
          <View style={[ss.bigDisplay, { borderColor: '#ec489940' }]}>
            <Text style={[ss.bigNum, { color: '#ec4899' }]}>{alcoholDrinks}</Text>
            <Text style={[ss.bigUnit, { color: c.sub }]}>drinks (1 = 14g ethanol)</Text>
          </View>
          <View style={ss.rowCentered}>
            {['0.5', '1', '2', '3', '4', '6'].map(n => (
              <TouchableOpacity key={n} onPress={() => setAlcohol(n)}
                style={[ss.chipSm, alcoholDrinks === n && { backgroundColor: '#ec4899', borderColor: '#ec4899' }]}>
                <Text style={[ss.chipTxt, alcoholDrinks === n && { color: '#fff' }]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <NumericInput value={alcoholDrinks} onChange={setAlcohol} placeholder="Number of drinks" suffix="drinks" c={c} />
          <View style={[ss.infoBox, { backgroundColor: '#ec489915', borderColor: '#ec489940' }]}>
            <Ionicons name="wine" size={14} color="#ec4899" />
            <Text style={{ color: '#ec4899', fontSize: 12, flex: 1, marginLeft: 6 }}>
              1 standard drink = 14g ethanol. BioGears oral ethanol action — vasodilation, mild bradycardia, impaired glucose.
            </Text>
          </View>
          <SectionLabel text="Time" c={c} />
          <View style={ss.timeRow}>
            <Ionicons name="time-outline" size={14} color={c.sub} />
            <Text style={[ss.timeLbl, { color: c.sub }]}>Consumed at</Text>
            <TimePicker value={otherTime} onChange={setOtherTime} accent="#ec4899" />
          </View>
          <AddButton label="Log Alcohol" accent="#ec4899" onPress={addAlcohol} />
        </>
      ) : (
        <>
          <SectionLabel text="Fasting Duration" c={c} />
          <View style={[ss.bigDisplay, { borderColor: '#ec489940' }]}>
            <Text style={[ss.bigNum, { color: '#ec4899' }]}>{fastHours}</Text>
            <Text style={[ss.bigUnit, { color: c.sub }]}>hours</Text>
          </View>
          <SliderRow
            label="Fasting hours"
            value={fastHours} min={1} max={48} step={1}
            onChange={setFastHours} accent="#ec4899" c={c}
          />
          <View style={ss.rowCentered}>
            {[8, 12, 14, 16, 18, 24, 36, 48].map(h => (
              <TouchableOpacity key={h} onPress={() => setFastHours(h)}
                style={[ss.chipSm, fastHours === h && { backgroundColor: '#ec4899', borderColor: '#ec4899' }]}>
                <Text style={[ss.chipTxt, fastHours === h && { color: '#fff' }]}>{h}h</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={[ss.infoBox, { backgroundColor: '#ec489915', borderColor: '#ec489940', marginTop: 8 }]}>
            <Ionicons name="timer" size={14} color="#ec4899" />
            <Text style={{ color: '#ec4899', fontSize: 12, flex: 1, marginLeft: 6 }}>
              BioGears advances time with zero nutrition. Glucose drops, ketones rise, mild sympathetic activation.
            </Text>
          </View>
          <SectionLabel text="Fast start time" c={c} />
          <View style={ss.timeRow}>
            <Ionicons name="time-outline" size={14} color={c.sub} />
            <Text style={[ss.timeLbl, { color: c.sub }]}>Started at</Text>
            <TimePicker value={otherTime} onChange={setOtherTime} accent="#ec4899" />
          </View>
          <AddButton label="Log Fasting Period" accent="#ec4899" onPress={addFast} />
        </>
      )}
    </View>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'meal': return renderMealTab();
      case 'exercise': return renderExerciseTab();
      case 'sleep': return renderSleepTab();
      case 'water': return renderWaterTab();
      case 'substance': return renderSubstanceTab();
      case 'stress': return renderStressTab();
      case 'other': return renderOtherTab();
      default: return null;
    }
  };

  // ────────────────────────────────────────────────────────────────────────────
  // DASHBOARD
  // ────────────────────────────────────────────────────────────────────────────

  // ─── Dashboard inner-tab renderers ──────────────────────────────────────────

  const renderOverviewTab = () => {
    const v = lastVitals;
    const bp = parseBP(v?.blood_pressure);

    // Per-vital status helper
    const vStatus = (val: number | null | undefined, lo: number, hi: number) =>
      val == null ? null : val < lo ? '#f59e0b' : val > hi ? '#ef4444' : '#10b981';

    return (
      <>
        {/* ── Inline Simulation Status Card (replaces floating overlay) ── */}
        {(simulationStatus === 'queued' || simulationStatus === 'running') && (
          <LinearGradient
            colors={['#0ea5e920', '#38bdf820', '#0ea5e910']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={[ss.simCard, { borderColor: '#38bdf840' }]}
          >
            {/* Top row: icon + title + elapsed */}
            <View style={ss.simCardHeader}>
              <View style={[ss.simPulse, { backgroundColor: '#38bdf820', borderColor: '#38bdf860' }]}>
                <ActivityIndicator color='#38bdf8' size='small' />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[ss.simCardTitle, { color: c.text }]}>BioGears Simulating…</Text>
                <Text style={[ss.simCardSub, { color: c.sub }]}>{simulationProgress || 'Initialising engine…'}</Text>
              </View>
              <View style={[ss.simElapsedBadge, { backgroundColor: '#38bdf815', borderColor: '#38bdf840' }]}>
                <Ionicons name='time-outline' size={11} color='#38bdf8' />
                <Text style={ss.simElapsedTxt}>{fmtElapsed(elapsedSecs)}</Text>
              </View>
            </View>
            {/* Progress dots */}
            <View style={ss.simDotsRow}>
              {['Engine init', 'Running physics', 'Computing vitals', 'Finalising'].map((label, i) => {
                // Realistic BioGears timing: init ~30s, physics bulk ~2min, vitals ~8min, done ~15min
                const thresholds = [30, 120, 480, 900];
                const done = simulationStatus === 'running' && elapsedSecs > thresholds[i];
                const active = simulationStatus === 'running' && !done &&
                  elapsedSecs > (i === 0 ? 0 : thresholds[i - 1]);
                return (
                  <View key={label} style={ss.simDotWrap}>
                    <View style={[
                      ss.simDotCircle,
                      done && { backgroundColor: '#38bdf8', borderColor: '#38bdf8' },
                      active && { borderColor: '#38bdf8' },
                      !done && !active && { borderColor: c.border },
                    ]}>
                      {done && <Ionicons name='checkmark' size={10} color='#fff' />}
                    </View>
                    <Text style={[ss.simDotLabel, { color: done || active ? '#38bdf8' : c.sub }]}>{label}</Text>
                  </View>
                );
              })}
            </View>
            <Text style={[ss.simNote, { color: c.sub }]}>
              ⏱ BioGears runs up to 12 h of physiology — this takes 10–25 min. You can use other parts of the app.
            </Text>
          </LinearGradient>
        )}

        {/* Simulation error banner */}
        {simulationStatus === 'failed' && (
          <View style={[ss.errorBox, { backgroundColor: '#ef444420' }]}>
            <Ionicons name="warning" size={18} color="#ef4444" />
            <Text style={ss.errorTxt}>{simulationError || 'Simulation failed — check server logs.'}</Text>
          </View>
        )}

        {/* Drug Interaction Banner */}
        {lastInteractionWarnings.length > 0 && (
          <View style={ss.interactionBanner}>
            <Ionicons name="medical" size={16} color="#fbbf24" />
            <Text style={ss.interactionTxt}>{lastInteractionWarnings[0]}</Text>
          </View>
        )}

        {/* Circadian Clock */}
        <CircadianClock />

        {/* Health Score */}
        {healthScore && (
          <LinearGradient
            colors={healthScore.grade === 'A' ? ['#10b981', '#059669'] : healthScore.grade === 'B' ? ['#38bdf8', '#0284c7'] : healthScore.grade === 'C' ? ['#f59e0b', '#d97706'] : ['#ef4444', '#dc2626']}
            style={ss.scoreBadge} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <View>
              <Text style={ss.scoreLetter}>{healthScore.grade}</Text>
              <Text style={ss.scoreLabel}>{healthScore.label}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={ss.scoreNum}>{healthScore.score}</Text>
              <Text style={ss.scoreSubLabel}>/ 100</Text>
            </View>
          </LinearGradient>
        )}

        {/* Quick Add row */}
        <QuickAddRow addEventAndSimulate={addEventAndSimulate} twinStatus={twinStatus} />

        {/* Saved Routines (Moved here for immediate access on Clinical Twin page) */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 15, marginBottom: 8, paddingHorizontal: 4 }}>
          <Text style={[ss.section, { color: c.text, marginTop: 0 }]}>Saved Routines</Text>
          <TouchableOpacity onPress={handleRestoreDefault}>
            <Text style={{ color: c.active, fontSize: 12, fontWeight: '600' }}>🔄 Restore Default State</Text>
          </TouchableOpacity>
        </View>

        {savedRoutines.length > 0 ? (
          savedRoutines.map(r => (
            <TouchableOpacity key={r.id} style={[ss.routineCard, { backgroundColor: c.card }]}
              onPress={() => handleLoadRoutine(r.id, r.name)}
              onLongPress={() => Alert.alert('Routine Options', `"${r.name}"`, [
                { text: r.isDefault ? 'Remove Default' : 'Set as Default', onPress: () => setDefaultRoutine(r.id) },
                { text: 'Rename', onPress: () => handleOpenRename(r.id, r.name) },
                { text: 'Edit Events', onPress: () => handleEditRoutine(r.id, r.name) },
                {
                  text: 'Delete Routine', style: 'destructive', onPress: () => {
                    if (r.isDefault) {
                      Alert.alert('Cannot Delete Default State', 'This routine is currently marked as your active Default Catch-up routine. Please select/set another routine as the default first before deleting this one.');
                      return;
                    }
                    if (savedRoutines.length <= 1) {
                      Alert.alert('Cannot Delete State', 'You must keep at least one saved routine/state to represent your baseline schedule.');
                      return;
                    }
                    Alert.alert('Delete Routine', `Delete "${r.name}"? This cannot be undone.`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => deleteRoutine(r.id) },
                    ]);
                  }
                },
                { text: 'Cancel', style: 'cancel' },
              ])}>
              <View style={ss.routineIcon}><Text style={{ fontSize: 20 }}>{r.isDefault ? '⭐' : '📋'}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={[ss.routineName, { color: c.text }]}>{r.name}</Text>
                <Text style={[ss.routineMeta, { color: c.sub }]}>
                  {r.eventCount} events · {new Date(r.createdAt).toLocaleDateString('en-IN')}
                  {r.isDefault && <Text style={{ color: '#f59e0b', fontWeight: 'bold' }}> · Default Catch-up</Text>}
                </Text>
              </View>
              <Ionicons name="play-circle" size={28} color={c.active} />
            </TouchableOpacity>
          ))
        ) : (
          <View style={[ss.emptyRoutineCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={ss.emptyRoutineIconContainer}>
              <Ionicons name="calendar-outline" size={24} color={c.active} />
            </View>
            <Text style={[ss.emptyRoutineTitle, { color: c.text }]}>No Saved Routines</Text>
            <Text style={[ss.emptyRoutineDesc, { color: c.sub }]}>
              {isSwitched 
                ? `No daily habits or routines have been logged for ${profile?.firstName || 'this member'}.`
                : "A saved routine represents your typical daily schedule (sleep, meals, activities) to automatically sync the clinical twin."
              }
            </Text>
            
            <View style={ss.emptyRoutineActions}>
              <TouchableOpacity
                style={[ss.emptyRoutineBtn, { backgroundColor: c.active }]}
                onPress={() => {
                  switchMode('routine');
                  setActiveTab('meal');
                  Animated.spring(fabAnim, { toValue: 1, useNativeDriver: true }).start();
                }}
              >
                <Ionicons name="add-circle" size={16} color="#fff" />
                <Text style={ss.emptyRoutineBtnTxt}>Log Custom Routine</Text>
              </TouchableOpacity>

              {isSwitched ? (
                <TouchableOpacity
                  style={[ss.emptyRoutineBtnSecondary, { borderColor: c.active, borderWidth: 1 }]}
                  onPress={copyPrimaryDefaultRoutine}
                >
                  <Ionicons name="copy-outline" size={16} color={c.active} />
                  <Text style={[ss.emptyRoutineBtnTxtSecondary, { color: c.active }]}>Copy Primary Routine</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[ss.emptyRoutineBtnSecondary, { borderColor: c.active, borderWidth: 1 }]}
                  onPress={handleRestoreDefault}
                >
                  <Ionicons name="sync-outline" size={16} color={c.active} />
                  <Text style={[ss.emptyRoutineBtnTxtSecondary, { color: c.active }]}>Retrieve Default State</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Vitals Grid */}
        <Text style={[ss.section, { color: c.text }]}>Simulation Vitals</Text>
        {v ? (
          <View style={ss.vitalsGrid}>
            {[
              { label: 'Heart Rate', val: v.heart_rate ? Math.round(v.heart_rate) : null, unit: 'bpm', icon: '🫀', color: '#ef4444', lo: 60, hi: 100 },
              { label: 'Systolic BP', val: bp.sys ? Math.round(bp.sys!) : null, unit: 'mmHg', icon: '🩸', color: '#f59e0b', lo: 90, hi: 120 },
              { label: 'Diastolic BP', val: bp.dia ? Math.round(bp.dia!) : null, unit: 'mmHg', icon: '🩸', color: '#f97316', lo: 60, hi: 80 },
              { label: 'Glucose', val: v.glucose ? Math.round(v.glucose) : null, unit: 'mg/dL', icon: '🍬', color: '#6366f1', lo: 70, hi: 140 },
              { label: 'SpO₂', val: v.spo2 ? Math.round(v.spo2) : null, unit: '%', icon: '🫁', color: '#38bdf8', lo: 94, hi: 100 },
              { label: 'Resp. Rate', val: v.respiration ? Math.round(v.respiration) : null, unit: 'br/min', icon: '💨', color: '#10b981', lo: 12, hi: 20 },
              ...(v.map != null ? [{ label: 'MAP', val: Math.round(v.map!), unit: 'mmHg', icon: '📈', color: '#a78bfa', lo: 70, hi: 100 }] : []),
              ...(v.core_temperature != null ? [{ label: 'Core Temp', val: Number((v.core_temperature!).toFixed(1)), unit: '°C', icon: '🌡️', color: '#fb923c', lo: 36.5, hi: 37.5 }] : []),
            ].map(({ label, val, unit, icon, color, lo, hi }) => {
              const dot = vStatus(val, lo, hi);
              return (
                <View key={label} style={[ss.vitalCard, { borderColor: color + '40', backgroundColor: c.card }]}>
                  <View style={ss.vitalTopRow}>
                    <Text style={ss.vitalIcon}>{icon}</Text>
                    {dot && <View style={[ss.statusDot, { backgroundColor: dot }]} />}
                  </View>
                  <Text style={[ss.vitalValue, { color }]}>{val ?? '—'}</Text>
                  <Text style={[ss.vitalUnit, { color: c.sub }]}>{unit}</Text>
                  <Text style={[ss.vitalLabel, { color: c.sub }]}>{label}</Text>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={[ss.emptyCard, { backgroundColor: c.card }]}>
            <Text style={{ fontSize: 40 }}>🔬</Text>
            <Text style={[ss.emptyTitle, { color: c.text }]}>No Simulation Yet</Text>
            <Text style={[ss.emptySub, { color: c.sub }]}>Tap + to log your routine and run a simulation</Text>
          </View>
        )}

        {/* AI Insights */}
        {lastAiInsights.length > 0 && (
          <>
            <Text style={[ss.section, { color: c.text }]}>AI Insights</Text>
            {lastAiInsights.map((ins, i) => (
              <View key={i} style={[ss.insightPill, { backgroundColor: c.card }]}>
                <Text style={{ color: c.text, fontSize: 13, lineHeight: 18 }}>{ins}</Text>
              </View>
            ))}
          </>
        )}

        {/* Macro Rings */}
        {todayMacros.calories > 0 && (
          <>
            <Text style={[ss.section, { color: c.text }]}>Today's Nutrition</Text>
            <View style={[ss.macroRingsCard, { backgroundColor: c.card }]}>
              {/* Calorie ring (large) */}
              <View style={ss.macroRingWrap}>
                <View style={[ss.macroOuterRing, { borderColor: '#f59e0b40', width: 100, height: 100, borderRadius: 50 }]}>
                  <View style={[ss.macroInnerRing, { backgroundColor: c.card, width: 72, height: 72, borderRadius: 36 }]}>
                    <Text style={[ss.macroRingVal, { color: '#f59e0b' }]}>{Math.round(todayMacros.calories)}</Text>
                    <Text style={[ss.macroRingUnit, { color: c.sub }]}>kcal</Text>
                  </View>
                </View>
                <Text style={[ss.macroRingLabel, { color: c.sub }]}>Calories</Text>
              </View>
              {/* Mini rings */}
              {[
                { label: 'Carbs', val: todayMacros.carbs, color: '#f59e0b', target: 250 },
                { label: 'Protein', val: todayMacros.protein, color: '#10b981', target: 60 },
                { label: 'Fat', val: todayMacros.fat, color: '#ef4444', target: 65 },
              ].map(m => {
                const pct = Math.min(m.val / m.target, 1);
                return (
                  <View key={m.label} style={ss.macroRingWrap}>
                    <View style={[ss.macroOuterRing, { borderColor: m.color + '40', width: 76, height: 76, borderRadius: 38 }]}>
                      <View style={[ss.macroInnerRing, { backgroundColor: c.card, width: 54, height: 54, borderRadius: 27 }]}>
                        <Text style={[ss.macroRingVal, { color: m.color, fontSize: 14 }]}>{Math.round(m.val)}g</Text>
                        <Text style={[ss.macroRingUnit, { color: c.sub }]}>{Math.round(pct * 100)}%</Text>
                      </View>
                    </View>
                    <Text style={[ss.macroRingLabel, { color: c.sub }]}>{m.label}</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* CVD / Recovery */}
        {(cvdRisk || recoveryReadiness) && (
          <View style={ss.row}>
            {cvdRisk && (
              <View style={[ss.analyticsCard, { backgroundColor: c.card, flex: 1, marginRight: 8 }]}>
                <Text style={[ss.analyticsTitle, { color: c.sub }]}>CVD Risk (10yr)</Text>
                <Text style={[ss.analyticsValue, { color: cvdRisk.color }]}>{cvdRisk.ten_year_risk_pct}%</Text>
                <Text style={[ss.analyticsLabel, { color: c.sub }]}>{cvdRisk.category}</Text>
              </View>
            )}
            {recoveryReadiness && (
              <View style={[ss.analyticsCard, { backgroundColor: c.card, flex: 1 }]}>
                <Text style={[ss.analyticsTitle, { color: c.sub }]}>Recovery</Text>
                <Text style={[ss.analyticsValue, { color: recoveryReadiness.status === 'Ready' ? '#10b981' : '#f59e0b' }]}>
                  {recoveryReadiness.readiness_score}
                </Text>
                <Text style={[ss.analyticsLabel, { color: c.sub }]}>{recoveryReadiness.status}</Text>
              </View>
            )}
          </View>
        )}
      </>
    );
  };

  const renderOrgansTab = () => (
    <>
      {sessions.length > 0 && organScores?.scores ? (
        <BodyMap scores={organScores.scores} c={c} lastVitals={lastVitals} sessions={sessions} profile={profile} />
      ) : sessions.length > 0 ? (
        <View style={[ss.emptyCard, { backgroundColor: c.card, minHeight: 250, justifyContent: 'center' }]}>
          <ActivityIndicator size="large" color={c.active} style={{ marginBottom: 12 }} />
          <Text style={[ss.emptyTitle, { color: c.text }]}>Analyzing Vitals...</Text>
          <Text style={[ss.emptySub, { color: c.sub }]}>Resolving organ health metrics from BioGears</Text>
        </View>
      ) : (
        <View style={[ss.emptyCard, { backgroundColor: c.card, alignItems: 'center', padding: 24, borderRadius: 20 }]}>
          <Text style={{ fontSize: 44, marginBottom: 12 }}>🫁</Text>
          <Text style={[ss.emptyTitle, { color: c.text, fontWeight: '800', fontSize: 16 }]}>Anatomical Twin Offline</Text>
          <Text style={[ss.emptySub, { color: c.sub, textAlign: 'center', marginTop: 8, lineHeight: 18, fontSize: 13, marginBottom: 16 }]}>
            Your physiological map will populate here once you run your first simulation.
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: c.active, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}
            onPress={() => setMode('routine')}
          >
            <Ionicons name="flash" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>Log Routine & Simulate</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );

  const renderTrendsTab = () => (
    <>
      {/* Session History */}
      {sessions.length > 0 ? (
        <>
          <View style={ss.rowBetween}>
            <Text style={[ss.section, { color: c.text }]}>Recent Simulations</Text>
            <TouchableOpacity onPress={handleUndo}>
              <Text style={{ color: '#ef4444', fontSize: 12 }}>⏪ Undo Last</Text>
            </TouchableOpacity>
          </View>
          {sessions.slice(0, 5).map(s => (
            <TouchableOpacity key={s.session_id}
              style={[ss.sessionCard, { backgroundColor: c.card }]}
              onPress={() => router.push(`/session/${s.session_id}`)}>
              <View style={[ss.sessionDot, { backgroundColor: s.has_anomaly ? '#ef444420' : '#10b98120' }]}>
                <Ionicons name={s.has_anomaly ? 'warning' : 'checkmark-circle'} size={22} color={s.has_anomaly ? '#ef4444' : '#10b981'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[ss.sessionName, { color: c.text }]}>{s.name || 'Simulation'}</Text>
                <Text style={[ss.sessionMeta, { color: c.sub }]}>
                  {s.timestamp ? new Date(s.timestamp).toLocaleDateString('en-IN') : 'Recent'} · {s.event_count ?? 0} events
                </Text>
                {s.ai_insights?.[0] && (
                  <Text style={[ss.sessionInsight, { color: c.sub }]} numberOfLines={1}>{s.ai_insights[0]}</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={16} color={c.sub} />
            </TouchableOpacity>
          ))}
        </>
      ) : (
        <View style={[ss.emptyCard, { backgroundColor: c.card }]}>
          <Text style={{ fontSize: 40 }}>📈</Text>
          <Text style={[ss.emptyTitle, { color: c.text }]}>No History Yet</Text>
          <Text style={[ss.emptySub, { color: c.sub }]}>Completed simulations will appear here</Text>
        </View>
      )}
    </>
  );

  const renderDashboard = () => {
    const DASH_TABS: { id: DashTab; label: string; icon: string }[] = [
      { id: 'overview', label: 'Overview', icon: '📊' },
      { id: 'organs', label: 'Organs', icon: '🏥' },
      { id: 'trends', label: 'Trends', icon: '📈' },
    ];

    return (
      <ScrollView style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingTop: insets.top + 62, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}>

        {/* Dashboard inner tabs */}
        <View style={[ss.dashTabBar, { borderBottomColor: c.border }]}>
          {DASH_TABS.map(t => {
            const active = dashTab === t.id;
            return (
              <TouchableOpacity key={t.id} style={ss.dashTabBtn} onPress={() => setDashTab(t.id)}>
                <Text style={ss.dashTabIcon}>{t.icon}</Text>
                <Text style={[ss.dashTabLabel, { color: active ? c.active : c.sub, borderBottomWidth: active ? 2.5 : 0, borderBottomColor: c.active }]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {dashTab === 'overview' && renderOverviewTab()}
        {dashTab === 'organs' && renderOrgansTab()}
        {dashTab === 'trends' && renderTrendsTab()}

      </ScrollView>
    );
  };



  // ────────────────────────────────────────────────────────────────────────────
  // ROUTINE PANEL
  // ────────────────────────────────────────────────────────────────────────────

  const renderRoutinePanel = () => (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + 62, paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}>

        {/* ── Event count banner ── */}
        {todayEvents.length > 0 && (
          <View style={[ss.eventBanner, { backgroundColor: tabAccent + '18', borderColor: tabAccent + '40' }]}>
            <Ionicons name="list" size={14} color={tabAccent} />
            <Text style={[ss.eventBannerTxt, { color: tabAccent }]}>
              {todayEvents.length} event{todayEvents.length !== 1 ? 's' : ''} queued for simulation
            </Text>
          </View>
        )}

        {/* Empty state card with Fill Baseline option */}
        {todayEvents.length === 0 && (
          <View style={[ss.emptyStateCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[ss.emptyStateTitle, { color: c.text }]}>No Events Logged Today</Text>
            <Text style={[ss.emptyStateDesc, { color: c.sub }]}>
              You haven't logged any daily habits yet. Fill in missing baseline events for the past hours of today to synchronize your twin.
            </Text>
            <TouchableOpacity
              style={[ss.fillBaselineBtn, { backgroundColor: c.active + '15', borderColor: c.active }]}
              onPress={handleFillBaseline}
            >
              <Ionicons name="flash-outline" size={14} color={c.active} />
              <Text style={[ss.fillBaselineBtnTxt, { color: c.active }]}>Fill Baseline Gaps</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Today's Timeline (Moved to Top) ── */}
        {todayEvents.length > 0 && (
          <View style={{ paddingHorizontal: 12, marginBottom: 16 }}>
            <View style={[ss.rowBetween, { marginTop: 10, marginBottom: 10 }]}>
              <Text style={[ss.section, { color: c.text, marginTop: 0 }]}>
                Today's Queue ({todayEvents.length})
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <TouchableOpacity
                  onPress={handleFillBaseline}
                  style={{
                    backgroundColor: c.active + '15',
                    borderColor: c.active,
                    borderWidth: 1,
                    borderRadius: 12,
                    paddingVertical: 5,
                    paddingHorizontal: 10,
                  }}
                >
                  <Text style={{ color: c.active, fontSize: 11, fontWeight: '700' }}>⚡ Fill Baseline</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => Alert.alert('Clear All', 'Remove all queued events?', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Clear', style: 'destructive', onPress: () => { clearToday(); setLastLoadedRoutineName(null); } },
                  ])}
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    borderColor: 'rgba(239, 68, 68, 0.4)',
                    borderWidth: 1,
                    borderRadius: 12,
                    paddingVertical: 5,
                    paddingHorizontal: 10,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Ionicons name="trash-outline" size={12} color="#ef4444" />
                  <Text style={{ color: '#ef4444', fontSize: 11, fontWeight: '700' }}>Clear All</Text>
                </TouchableOpacity>
              </View>
            </View>

            {todayEvents.map((ev, i) => {
              const tabInfo = EVENT_TABS.find(t => t.id === ev.event_type) || { icon: 'alert-circle' as any, accent: '#64748b' };
              return (
                <View key={ev.id} style={[ss.timelineRow, { backgroundColor: c.card, borderColor: c.border }]}>
                  {/* Left accent line */}
                  <View style={[ss.timelineLine, { backgroundColor: tabInfo.accent }]} />
                  <View style={[ss.timelineDot, { backgroundColor: tabInfo.accent + '30', borderColor: tabInfo.accent }]}>
                    <Ionicons name={tabInfo.icon || 'alert-circle'} size={12} color={tabInfo.accent} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[ss.eventLabel, { color: c.text }]} numberOfLines={1}>{ev.displayLabel}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <Text style={[ss.eventTime, { color: c.sub }]}>
                        {ev.timestamp
                          ? (() => {
                            const evDate = new Date(ev.timestamp * 1000);
                            const today = new Date();
                            const isToday = evDate.toDateString() === today.toDateString();
                            if (isToday) {
                              // Same day — just show time like before
                              return wallTimeToLabel(ev.wallTime);
                            }
                            // Past date (pulled from saved state / catch-up) — show full date+time
                            return evDate.toLocaleString('en-IN', {
                              day: 'numeric', month: 'short',
                              hour: '2-digit', minute: '2-digit',
                            });
                          })()
                          : wallTimeToLabel(ev.wallTime)}
                      </Text>
                      {/* Source badge */}
                      {(() => {
                        const src = ev.source || 'manual';
                        const badgeColor = src === 'baseline' ? '#10b981' : src === 'routine' ? '#f59e0b' : '#3b82f6';
                        const badgeBg = src === 'baseline' ? '#10b98115' : src === 'routine' ? '#f59e0b15' : '#3b82f615';
                        const badgeLabel = src === 'baseline' ? 'Baseline' : src === 'routine' ? 'Routine' : 'Manual';
                        return (
                          <View style={{
                            backgroundColor: badgeBg,
                            borderColor: badgeColor,
                            borderWidth: 0.5,
                            borderRadius: 4,
                            paddingHorizontal: 5,
                            paddingVertical: 1,
                          }}>
                            <Text style={{ color: badgeColor, fontSize: 8, fontWeight: '700', textTransform: 'uppercase' }}>
                              {badgeLabel}
                            </Text>
                          </View>
                        );
                      })()}
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => removeEvent(ev.id)} style={ss.deleteBtn}>
                    <Ionicons name="trash-outline" size={16} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              );
            })}

            {/* ── Action buttons (Moved to Top) ── */}
            <View style={[ss.actionRow, { marginTop: 10 }]}>
              <TouchableOpacity style={[ss.actionBtn, { backgroundColor: c.card, borderColor: c.border, borderWidth: 1 }]}
                onPress={() => setSaveRoutineModal(true)}>
                <Ionicons name="bookmark-outline" size={16} color={c.active} />
                <Text style={[ss.actionBtnTxt, { color: c.active }]}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[ss.actionBtn, { backgroundColor: tabAccent, flex: 1 }]}
                onPress={handleSimulate}
                disabled={simulationStatus === 'running' || simulationStatus === 'queued'}>
                <Ionicons name="flash" size={16} color="#fff" />
                <Text style={[ss.actionBtnTxt, { color: '#fff' }]}>
                  {simulationStatus === 'running' ? 'Simulating...' : `Simulate (${todayEvents.length} events)`}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Tab bar ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={[ss.tabBar, { borderBottomColor: c.border }]}
          contentContainerStyle={{ paddingHorizontal: 12 }}>
          {EVENT_TABS.map(t => {
            const active = activeTab === t.id;
            return (
              <TouchableOpacity key={t.id} onPress={() => setActiveTab(t.id)}
                style={[ss.tabBtn, active && { borderBottomWidth: 2.5, borderBottomColor: t.accent }]}>
                <Ionicons name={t.icon} size={18} color={active ? t.accent : c.sub} />
                <Text style={[ss.tabBtnLabel, { color: active ? t.accent : c.sub, marginTop: 4 }]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── Tab content panel ── */}
        <View style={[ss.tabPanel, { backgroundColor: c.card, marginHorizontal: 12, borderColor: c.border }]}>
          {renderTabContent()}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  // ────────────────────────────────────────────────────────────────────────────
  // SUBSTANCE PICKER MODAL
  // ────────────────────────────────────────────────────────────────────────────

  const renderSubPickerModal = () => (
    <Modal visible={showSubPicker} transparent animationType="slide" onRequestClose={() => setShowSubPicker(false)}>
      <Pressable style={ss.modalOverlay} onPress={() => setShowSubPicker(false)}>
        <Pressable style={[ss.modalCard, { backgroundColor: c.card, maxHeight: '80%' }]} onPress={(e) => e.stopPropagation()}>
          <View style={ss.rowBetween}>
            <Text style={[ss.modalTitle, { color: c.text }]}>Select Substance</Text>
            <TouchableOpacity onPress={() => setShowSubPicker(false)}>
              <Ionicons name="close" size={22} color={c.sub} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={[ss.searchInput, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
            placeholder="Search substances…"
            placeholderTextColor={c.sub}
            value={subSearch}
            onChangeText={setSubSearch}
          />
          <ScrollView showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }}>
            {filteredSubs.map(s => (
              <TouchableOpacity key={s}
                style={[ss.subPickerRow, { borderBottomColor: c.border }, s === subName && { backgroundColor: '#8b5cf615' }]}
                onPress={() => { setSubName(s); setShowSubPicker(false); setSubSearch(''); }}>
                <Text style={[ss.subPickerName, { color: c.text }]}>{s}</Text>
                {s === subName && <Ionicons name="checkmark" size={18} color="#8b5cf6" />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );

  // ────────────────────────────────────────────────────────────────────────────
  // MODALS
  // ────────────────────────────────────────────────────────────────────────────

  const renderModals = () => (
    <>
      {renderSubPickerModal()}

      {/* Catch-up Digital Twin Modal */}
      <Modal
        visible={showCatchUpModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCatchUpModal(false)}
      >
        <Pressable style={ss.modalOverlay} onPress={() => setShowCatchUpModal(false)}>
          <Pressable style={[ss.modalCard, { backgroundColor: c.card, borderWidth: 1, borderColor: c.border }]} onPress={(e) => e.stopPropagation()}>
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              <View style={{ backgroundColor: '#38bdf820', width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center', marginBottom: 10 }}>
                <Ionicons name="sync-circle" size={36} color="#38bdf8" />
              </View>
              <Text style={[ss.modalTitle, { color: c.text, textAlign: 'center' }]}>Synchronize Digital Twin</Text>
            </View>
            
            <Text style={[ss.modalSub, { color: c.sub, textAlign: 'center', lineHeight: 18, marginBottom: 16 }]}>
              You haven't updated your physiological twin recently. To maintain accurate cardiovascular, metabolic, and organ scores, let's catch up!
            </Text>

            {savedRoutines.length > 0 && (
              <View style={{ backgroundColor: c.border + '30', borderRadius: 12, padding: 12, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: '#f59e0b' }}>
                <Text style={{ fontWeight: '700', fontSize: 13, color: c.text }}>
                  ⭐ Default State: {savedRoutines.find(r => r.isDefault)?.name || savedRoutines[0].name}
                </Text>
                <Text style={{ fontSize: 11, color: c.sub, marginTop: 2 }}>
                  Will auto-simulate your standard daily routine events for the missed days.
                </Text>
              </View>
            )}

            <View style={{ width: '100%', gap: 10 }}>
              <TouchableOpacity
                style={[ss.modalBtn, { backgroundColor: c.active, width: '100%', justifyContent: 'center', paddingVertical: 14 }]}
                onPress={async () => {
                  setShowCatchUpModal(false);
                  let daysMissed = 1;
                  if (sessions.length > 0) {
                    const lastSimTime = new Date(sessions[0].timestamp).getTime();
                    const hoursSinceLastSim = (Date.now() - lastSimTime) / (1000 * 60 * 60);
                    daysMissed = Math.max(1, Math.floor(hoursSinceLastSim / 24));
                  }
                  
                  try {
                    Alert.alert("Simulating Catch-up", `Starting catch-up simulation for ${daysMissed} missed day(s)...`);
                    await runMultiDayCatchup(daysMissed);
                  } catch (e: any) {
                    Alert.alert("Catch-up Failed", e.message || "Could not complete simulation.");
                  }
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>⚡ Use Default Routine</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[ss.modalBtn, { backgroundColor: '#10b981', width: '100%', justifyContent: 'center', paddingVertical: 14 }]}
                onPress={() => {
                  setShowCatchUpModal(false);
                  setMode('routine');
                  setActiveTab('meal');
                  Animated.spring(fabAnim, { toValue: 1, useNativeDriver: true }).start();
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>✏️ Log Custom Routine</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[ss.modalBtn, { borderColor: c.border, borderWidth: 1, width: '100%', justifyContent: 'center', paddingVertical: 14 }]}
                onPress={() => setShowCatchUpModal(false)}
              >
                <Text style={{ color: c.text, fontWeight: '600' }}>Ignore for Now</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* CSV Food Quantity Modal */}
      {selectedCsvFood && (
        <Modal visible={true} transparent animationType="fade" onRequestClose={() => setSelectedCsvFood(null)}>
          <Pressable style={ss.modalOverlay} onPress={() => setSelectedCsvFood(null)}>
            <Pressable style={[ss.modalCard, { backgroundColor: c.card }]} onPress={(e) => e.stopPropagation()}>
              <View style={ss.rowBetween}>
                <Text style={[ss.modalTitle, { color: c.text }]}>{selectedCsvFood.food}</Text>
                <TouchableOpacity onPress={() => setSelectedCsvFood(null)}>
                  <Ionicons name="close" size={22} color={c.sub} />
                </TouchableOpacity>
              </View>
              <Text style={[ss.modalSub, { color: c.sub }]}>
                {selectedCsvFood.calories} kcal per {selectedCsvFood.display_amount}
              </Text>

              <Text style={{ color: c.text, marginBottom: 8, fontWeight: '600' }}>
                Quantity ({parseDisplayAmount(selectedCsvFood.display_amount).unitLabel})
              </Text>

              <View style={[ss.rowBetween, { flexWrap: 'wrap', justifyContent: 'flex-start', gap: 8, marginBottom: 12 }]}>
                {getQuickQuantities(parseDisplayAmount(selectedCsvFood.display_amount).base, parseDisplayAmount(selectedCsvFood.display_amount).unit).map(q => (
                  <TouchableOpacity
                    key={q}
                    style={[ss.chip, csvFoodAmount === q && { backgroundColor: '#f59e0b', borderColor: '#f59e0b' }]}
                    onPress={() => setCsvFoodAmount(q)}
                  >
                    <Text style={[ss.chipTxt, csvFoodAmount === q && { color: '#fff' }]}>{q}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <NumericInput
                value={String(csvFoodAmount)}
                onChange={(v) => setCsvFoodAmount(parseFloat(v) || 0)}
                placeholder="Amount"
                c={c}
              />

              <View style={{ marginTop: 12 }}>
                <TouchableOpacity style={[ss.modalBtn, { backgroundColor: '#f59e0b', justifyContent: 'center' }]} onPress={confirmCsvFoodAdd}>
                  <Text style={{ color: '#fff', fontWeight: 'bold' }}>Add Meal</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* Save Routine */}
      <Modal visible={saveRoutineModal} transparent animationType="slide" onRequestClose={() => setSaveRoutineModal(false)}>
        <Pressable style={ss.modalOverlay} onPress={() => setSaveRoutineModal(false)}>
          <Pressable style={[ss.modalCard, { backgroundColor: c.card }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[ss.modalTitle, { color: c.text }]}>Save Routine</Text>
            <Text style={[ss.modalSub, { color: c.sub }]}>Events saved with their wall times. Loading later adds them at the same times of day.</Text>
            <TextInput style={[ss.input, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
              placeholder="e.g. 'Gym Day'" placeholderTextColor={c.sub}
              value={routineName} onChangeText={setRoutineName} />
            <View style={ss.rowBetween}>
              <TouchableOpacity style={[ss.modalBtn, { borderColor: c.border, borderWidth: 1 }]} onPress={() => setSaveRoutineModal(false)}>
                <Text style={{ color: c.sub }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[ss.modalBtn, { backgroundColor: c.active }]} onPress={handleSaveRoutine}>
                <Text style={{ color: '#fff' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Rename Routine */}
      <Modal visible={renameRoutineModal} transparent animationType="fade" onRequestClose={() => setRenameRoutineModal(false)}>
        <Pressable style={ss.modalOverlay} onPress={() => setRenameRoutineModal(false)}>
          <Pressable style={[ss.modalCard, { backgroundColor: c.card }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[ss.modalTitle, { color: c.text }]}>✏️ Rename Routine</Text>
            <Text style={[ss.modalSub, { color: c.sub }]}>Enter a new name for this routine. Events are not affected.</Text>
            <TextInput
              style={[ss.input, { backgroundColor: c.bg, color: c.text, borderColor: c.border }]}
              placeholder="Routine name..."
              placeholderTextColor={c.sub}
              value={renamingNewName}
              onChangeText={setRenamingNewName}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleConfirmRename}
            />
            <View style={ss.rowBetween}>
              <TouchableOpacity style={[ss.modalBtn, { borderColor: c.border, borderWidth: 1 }]} onPress={() => setRenameRoutineModal(false)}>
                <Text style={{ color: c.sub }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[ss.modalBtn, { backgroundColor: c.active }]} onPress={handleConfirmRename}>
                <Ionicons name="checkmark" size={16} color="#fff" />
                <Text style={{ color: '#fff', marginLeft: 4, fontWeight: '700' }}>Rename</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>



      <ConflictResolutionSheet
        conflicts={pendingConflicts}
        visible={pendingConflicts.length > 0}
        onResolve={pendingConflictResolver || (() => {})}
        onDismiss={dismissConflicts}
        mode={conflictSheetMode}
      />

      {/* Themed Custom Alert Modal */}
      <Modal
        visible={customAlert !== null && customAlert.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setCustomAlert(null)}
      >
        <Pressable style={ss.modalOverlay} onPress={() => setCustomAlert(null)}>
          <Pressable style={[ss.modalCard, { backgroundColor: c.card, borderWidth: 1, borderColor: c.border }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[ss.modalTitle, { color: c.text }]}>{customAlert?.title}</Text>
            {customAlert?.message ? (
              <Text style={[ss.modalSub, { color: c.sub }]}>{customAlert.message}</Text>
            ) : null}
            <View style={{
              flexDirection: customAlert?.buttons && customAlert.buttons.length > 2 ? 'column' : 'row',
              justifyContent: 'flex-end',
              gap: 8,
              marginTop: 16,
              width: '100%'
            }}>
              {customAlert?.buttons.map((btn, idx) => {
                const isDestructive = btn.style === 'destructive';
                const isCancel = btn.style === 'cancel';
                const isStack = customAlert.buttons.length > 2;
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      ss.modalBtn,
                      isDestructive
                        ? { backgroundColor: '#ef4444' }
                        : isCancel
                          ? { borderColor: c.border, borderWidth: 1 }
                          : { backgroundColor: c.active },
                      isStack && { width: '100%', justifyContent: 'center' }
                    ]}
                    onPress={() => {
                      setCustomAlert(null);
                      if (btn.onPress) btn.onPress();
                    }}
                  >
                    <Text style={{ color: isCancel ? c.sub : '#fff', fontWeight: 'bold', fontSize: 14, textAlign: 'center' }}>
                      {btn.text}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Calibration Success Modal ── */}
      <Modal transparent visible={showSuccessModal} animationType="fade" onRequestClose={() => setShowSuccessModal(false)}>
        <Pressable style={ss.modalOverlay} onPress={() => setShowSuccessModal(false)}>
          <Pressable style={[ss.modalCard, { backgroundColor: c.card, borderColor: c.border, borderWidth: 1, alignItems: 'center', padding: 24, borderRadius: 24, width: '85%', maxWidth: 340 }]} onPress={(e) => e.stopPropagation()}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#10b98115', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
              <Ionicons name="checkmark-circle" size={44} color="#10b981" />
            </View>
            <Text style={[ss.modalTitle, { color: c.text, textAlign: 'center', marginBottom: 8, fontSize: 18, fontWeight: 'bold' }]}>
              Calibration Successful
            </Text>
            <Text style={{ color: c.sub, fontSize: 13, textAlign: 'center', lineHeight: 18, marginBottom: 20 }}>
              Your Digital Twin clinical parameters have been synced and calibrated successfully with the BioGears physiology engine.
            </Text>
            <TouchableOpacity
              style={[ss.modalBtn, { backgroundColor: c.active, width: '100%', borderRadius: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' }]}
              onPress={() => setShowSuccessModal(false)}
            >
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>Explore Digital Twin</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );

  // ────────────────────────────────────────────────────────────────────────────
  // ROOT RENDER
  // ────────────────────────────────────────────────────────────────────────────

  return (
    <View style={[ss.root, { backgroundColor: c.bg }]}>
      <Header
        title={mode === 'dashboard' ? 'Clinical Twin' : 'Log Routine'}
        showBack={mode === 'routine'}
        onBack={() => switchMode('dashboard')}
      />

      {twinStatus === 'unregistered' && (
        <View style={[ss.noticeBar, { backgroundColor: '#f59e0b20', borderColor: '#f59e0b', marginTop: insets.top + 52 }]}>
          <Ionicons name="warning-outline" size={14} color="#f59e0b" />
          <Text style={ss.noticeTxt}>No twin registered — Profile → Calibrate Twin</Text>
        </View>
      )}

      {twinStatus === 'checking' && (
        <View style={[ss.noticeBar, { backgroundColor: '#f59e0b20', borderColor: '#f59e0b', marginTop: insets.top + 52 }]}>
          <ActivityIndicator size="small" color="#f59e0b" style={{ marginRight: 6 }} />
          <Text style={ss.noticeTxt}>Checking twin status...</Text>
        </View>
      )}

      {twinStatus === 'registering' && (
        <View style={[ss.noticeBar, { backgroundColor: '#eab30820', borderColor: '#eab308', marginTop: insets.top + 52 }]}>
          <ActivityIndicator size="small" color="#eab308" style={{ marginRight: 6 }} />
          <Text style={[ss.noticeTxt, { color: '#eab308' }]}>Calibrating Twin Engine in background. Please wait...</Text>
        </View>
      )}

      <View style={{ flex: 1, display: mode === 'dashboard' ? 'flex' : 'none' }}>
        {renderDashboard()}
      </View>
      <View style={{ flex: 1, display: mode === 'routine' ? 'flex' : 'none' }}>
        {renderRoutinePanel()}
      </View>

      {/* FAB */}
      <TouchableOpacity
        style={[ss.fab, { backgroundColor: mode === 'dashboard' ? c.active : '#ef4444', bottom: insets.bottom + 8 }]}
        onPress={() => switchMode(mode === 'dashboard' ? 'routine' : 'dashboard')}>
        <Animated.View style={{ transform: [{ rotate: fabAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] }) }] }}>
          <Ionicons name="add" size={32} color="#fff" />
        </Animated.View>
      </TouchableOpacity>

      {renderModals()}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  root: { flex: 1 },
  section: { fontSize: 16, fontWeight: '700', marginTop: 20, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowCentered: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },

  // Notice bar
  noticeBar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, marginHorizontal: 12, borderRadius: 10, borderWidth: 1, marginBottom: 0 },
  noticeTxt: { color: '#f59e0b', fontSize: 12, flex: 1 },

  // Stepper
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  stepItem: { alignItems: 'center' },
  stepDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#334155', justifyContent: 'center', alignItems: 'center' },
  stepDotActive: { backgroundColor: '#38bdf8' },
  stepNum: { color: '#94a3b8', fontSize: 10, fontWeight: '700' },
  stepLabel: { color: '#64748b', fontSize: 10, marginTop: 2 },
  stepLabelActive: { color: '#38bdf8' },
  stepLine: { width: 24, height: 2, backgroundColor: '#334155', marginHorizontal: 2 },
  stepLineActive: { backgroundColor: '#38bdf8' },
  simBox: { borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, alignItems: 'center' },
  simMsg: { fontSize: 12, marginTop: 4, textAlign: 'center' },

  // Inline Simulation Status Card
  simCard: {
    borderRadius: 20, padding: 18, marginBottom: 16, borderWidth: 1,
  },
  simCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  simPulse: {
    width: 42, height: 42, borderRadius: 21, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  simCardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  simCardSub: { fontSize: 12, lineHeight: 17 },
  simElapsedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1,
  },
  simElapsedTxt: { color: '#38bdf8', fontSize: 12, fontWeight: '700' },
  simDotsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  simDotWrap: { alignItems: 'center', flex: 1 },
  simDotCircle: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', marginBottom: 5,
  },
  simDotLabel: { fontSize: 9, fontWeight: '600', textAlign: 'center', letterSpacing: 0.2 },
  simNote: { fontSize: 11, lineHeight: 17, textAlign: 'center', fontStyle: 'italic' },
  errorBox: { borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  errorTxt: { color: '#ef4444', fontSize: 13, flex: 1 },
  interactionBanner: { backgroundColor: '#fbbf2420', borderRadius: 10, padding: 10, flexDirection: 'row', gap: 8, marginBottom: 10, borderWidth: 1, borderColor: '#fbbf24' },
  interactionTxt: { color: '#fbbf24', fontSize: 12, flex: 1 },

  // Score
  scoreBadge: { borderRadius: 20, padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  scoreLetter: { fontSize: 48, fontWeight: '900', color: '#fff' },
  scoreLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '600' },
  scoreNum: { fontSize: 36, fontWeight: '800', color: '#fff' },
  scoreSubLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },

  // Vitals
  vitalsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  vitalCard: { width: (W - 52) / 2, borderRadius: 16, padding: 14, borderWidth: 1 },
  vitalIcon: { fontSize: 20, marginBottom: 4 },
  vitalValue: { fontSize: 28, fontWeight: '800' },
  vitalUnit: { color: '#64748b', fontSize: 11, marginTop: 1 },
  vitalLabel: { color: '#94a3b8', fontSize: 12, marginTop: 4, fontWeight: '600' },
  vitalNormal: { color: '#475569', fontSize: 10, marginTop: 2 },
  emptyCard: { borderRadius: 20, padding: 32, alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 12 },
  emptySub: { fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 20 },
  insightPill: { borderRadius: 12, padding: 12, marginBottom: 8 },
  organCard: { width: 100, alignItems: 'center', borderRadius: 16, padding: 12, marginRight: 10, borderWidth: 1 },
  organScore: { fontSize: 22, fontWeight: '800', marginTop: 4 },
  organName: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
  organBar: { width: '100%', height: 4, backgroundColor: '#1e293b', borderRadius: 2, marginTop: 6 },
  organBarFill: { height: 4, borderRadius: 2 },
  analyticsCard: { borderRadius: 16, padding: 16 },
  analyticsTitle: { fontSize: 11, marginBottom: 4 },
  analyticsValue: { fontSize: 28, fontWeight: '800' },
  analyticsLabel: { fontSize: 12, marginTop: 2 },
  macroCard: { borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center' },
  macroDiv: { width: 1, height: 32, marginHorizontal: 4 },
  routineCard: { borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  routineIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#1e293b', justifyContent: 'center', alignItems: 'center' },
  routineName: { fontWeight: '600', fontSize: 14 },
  routineMeta: { fontSize: 12, marginTop: 2 },
  sessionCard: { borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  sessionDot: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  sessionName: { fontWeight: '600', fontSize: 14 },
  sessionMeta: { fontSize: 12, marginTop: 2 },
  sessionInsight: { fontSize: 11, marginTop: 4, fontStyle: 'italic' },

  // Routine
  eventBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, marginHorizontal: 12, marginBottom: 8, borderRadius: 10, borderWidth: 1 },
  eventBannerTxt: { flex: 1, fontSize: 13, fontWeight: '600' },
  simBadgeBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },

  tabBar: { borderBottomWidth: 1 },
  tabBtn: { alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 2 },
  tabBtnLabel: { fontSize: 11, fontWeight: '600' },
  tabPanel: { borderRadius: 20, padding: 18, marginTop: 10, borderWidth: 1 },

  // Form elements
  sectionLbl: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8, marginTop: 14 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#334155', backgroundColor: 'transparent', marginRight: 6 },
  chipSm: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1, borderColor: '#334155', backgroundColor: 'transparent' },
  chipTxt: { fontSize: 12, fontWeight: '600', color: '#94a3b8' },
  numRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12 },
  numInput: { flex: 1, fontSize: 16, fontWeight: '600' },
  numSuffix: { fontSize: 13, marginLeft: 8 },
  addBtn: { borderRadius: 14, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10 },
  addBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  timeLbl: { fontSize: 12, fontWeight: '500' },


  // Slider
  sliderLabel: { fontSize: 12 },
  sliderVal: { fontSize: 14, fontWeight: '700' },
  sliderTrack: { height: 6, borderRadius: 3, marginBottom: 8 },
  sliderFill: { height: 6, borderRadius: 3 },
  sliderBtns: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sliderBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },

  // Big display
  bigDisplay: { alignItems: 'center', borderRadius: 20, borderWidth: 1.5, padding: 20, marginBottom: 14 },
  bigNum: { fontSize: 52, fontWeight: '900' },
  bigUnit: { fontSize: 14, marginTop: 2 },

  // Quick grid
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  quickChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#334155' },
  quickChipTxt: { color: '#94a3b8', fontWeight: '600', fontSize: 13 },

  // Info box
  infoBox: { borderRadius: 12, padding: 10, flexDirection: 'row', alignItems: 'flex-start', borderWidth: 1, marginBottom: 6 },

  // Substance selector
  subSelector: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 12 },
  searchInput: { flex: 1, borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 10, fontSize: 14 },
  subPickerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 0.5 },
  subPickerName: { fontSize: 14 },

  // Mode switch (alcohol/fast)
  modeSwitch: { flexDirection: 'row', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#334155', marginBottom: 12 },
  modeSwitchBtn: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  modeSwitchTxt: { fontWeight: '600', fontSize: 14, color: '#94a3b8' },

  // Macro preview
  previewBox: { borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 12 },
  previewTitle: { fontSize: 9, letterSpacing: 1, fontWeight: '700', marginBottom: 8 },
  triRow: { flexDirection: 'row', gap: 8 },
  macroG: { fontWeight: '800', fontSize: 15 },
  macroLbl: { fontSize: 11, marginTop: 1 },

  // Timeline
  timelineRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, marginBottom: 8, overflow: 'hidden', borderWidth: 1 },
  timelineLine: { width: 3, alignSelf: 'stretch' },
  timelineDot: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', margin: 8, borderWidth: 1 },
  eventLabel: { fontWeight: '600', fontSize: 13 },
  eventTime: { fontSize: 11, marginTop: 2 },
  deleteBtn: { padding: 12 },

  // Action row
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  actionBtn: { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionBtnTxt: { fontWeight: '700', fontSize: 14 },

  // FAB
  fab: { position: 'absolute', right: 20, width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  modalCard: { borderRadius: 24, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  modalSub: { fontSize: 13, marginBottom: 16, lineHeight: 20 },
  input: { borderRadius: 12, borderWidth: 1, padding: 12, fontSize: 14, marginBottom: 16 },
  modalBtn: { borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 4 },

  // Dashboard inner tabs
  dashTabBar: { flexDirection: 'row', borderBottomWidth: 1, marginBottom: 16 },
  dashTabBtn: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 2 },
  dashTabIcon: { fontSize: 18 },
  dashTabLabel: { fontSize: 11, fontWeight: '700', paddingBottom: 6 },

  // Vital card top row with status dot
  vitalTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },

  // Macro rings card
  macroRingsCard: { borderRadius: 20, padding: 16, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', marginBottom: 8 },
  macroRingWrap: { alignItems: 'center' },
  macroOuterRing: { justifyContent: 'center', alignItems: 'center', borderWidth: 7 },
  macroInnerRing: { position: 'absolute', justifyContent: 'center', alignItems: 'center' },
  macroRingVal: { fontWeight: '800', fontSize: 16, textAlign: 'center' },
  macroRingUnit: { fontSize: 9, textAlign: 'center', marginTop: -2 },
  macroRingLabel: { fontSize: 11, fontWeight: '600', marginTop: 8 },
  // ── Meal tab — food picker ────────────────────────────────────────────
  modeRow: {
    flexDirection: 'row', borderRadius: 16, borderWidth: 1,
    overflow: 'hidden', marginBottom: 12,
  },
  modeBtn: {
    flex: 1, paddingVertical: 10, alignItems: 'center', justifyContent: 'center',
  },
  modeBtnTxt: { fontSize: 13, fontWeight: '700' },

  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10,
  },

  foodGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  foodCard: {
    width: '48%', borderRadius: 16, borderWidth: 1,
    padding: 12, marginBottom: 10,
    alignItems: 'flex-start',
  },
  foodEmoji: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#f59e0b16',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  foodName: { fontSize: 13, fontWeight: '700', lineHeight: 17, marginBottom: 2 },
  foodCal: { fontSize: 14, fontWeight: '900', marginBottom: 4 },
  foodMacroRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  foodMacro: { fontSize: 10, fontWeight: '700' },

  // Activity Lab card
  actLabCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 18, borderWidth: 1.5, padding: 16, marginBottom: 14 },
  actLabLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  actLabIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#10b98120',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actLabTitle: { fontWeight: '800', fontSize: 15, marginBottom: 2 },
  actLabSub: { fontSize: 11 },
  actLabBtn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  emptyStateCard: {
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  emptyStateTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptyStateDesc: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 14,
  },
  fillBaselineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  fillBaselineBtnTxt: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyRoutineCard: {
    marginHorizontal: 4,
    marginVertical: 8,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyRoutineIconContainer: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyRoutineTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  emptyRoutineDesc: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
    paddingHorizontal: 10,
  },
  emptyRoutineActions: {
    width: '100%',
    gap: 10,
  },
  emptyRoutineBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyRoutineBtnTxt: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  emptyRoutineBtnSecondary: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyRoutineBtnTxtSecondary: {
    fontWeight: '700',
    fontSize: 13,
  },
});