// services/onboardingRoutineBuilder.ts
// Scientific, personalized conversion of onboarding habits + medical profile → BioGears SavedRoutine.

import { SavedRoutine } from './biogears';

export interface RoutineBlock {
  id: string;
  title: string;
  time: string; // "HH:MM"
  type: 'wake' | 'meal' | 'snack' | 'exercise' | 'custom' | 'sleep';
  icon?: string;
  kcalPercent?: number; // e.g. 25
  notes?: string;
}

export interface OnboardingHabits {
  wakeUp?:    string;   // "HH:MM" or "HH:MM AM/PM"
  breakfast?: string;
  lunch?:     string;
  dinner?:    string;
  sleep?:     string;
  water?:     string;   // "2L", "3L", "8 glasses" …
  activity?:  string;   // "Sedentary" | "Moderate" | "Active"
  customTimelineBlocks?: RoutineBlock[];
  scheduleVariability?: 'fixed' | 'weekday_weekend' | 'shift_work';
  naturalLanguageRoutineText?: string;
  foodHabits?: {
    dietType?: string;
    eatingRhythm?: 'morning_heavy' | 'balanced' | 'evening_heavy' | 'intermittent' | 'shift';
    foodBase?: 'plant_based' | 'plant_dairy' | 'plant_seafood' | 'omnivore' | 'high_protein' | 'low_carb';
    ingredientExclusions?: string[];
    mealPrep?: string;
    beverageHabit?: string;
    mealFreq?: string;
    snacking?: string;
    [key: string]: any;
  };
}

export interface UserMedicalProfile {
  gender?: string;
  dateOfBirth?: string;
  height?: number; // cm
  weight?: number; // kg
  allergies?: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

function parseHM(t?: string): { h: number; m: number } {
  if (!t) return { h: 8, m: 0 };
  
  // Handle AM/PM format (e.g. "08:00 AM", "8 PM", "11:30 pm")
  let clean = t.trim().toLowerCase();
  const isPM = clean.includes('pm');
  const isAM = clean.includes('am');
  clean = clean.replace(/(am|pm)/g, '').trim();
  
  const parts = clean.split(':').map(Number);
  let h = parts[0] || 0;
  let m = parts[1] || 0;
  
  // 12-hour converter
  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;
  
  return { h: Math.min(23, Math.max(0, h)), m: Math.min(59, Math.max(0, m)) };
}

function wallTimeToTimestamp(wallTime: string): number {
  const { h, m } = parseHM(wallTime);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

type BioMealType = 'balanced' | 'high_carb' | 'high_protein' | 'fast_food' | 'ketogenic' | 'custom';

function dietToMealType(diet?: string, foodBase?: string): BioMealType {
  const fb = (foodBase || '').toLowerCase();
  const d = (diet || '').toLowerCase();

  if (fb === 'low_carb' || d.includes('keto')) return 'ketogenic';
  if (fb === 'high_protein' || fb === 'omnivore' || d.includes('paleo') || d.includes('protein') || d.includes('meat')) return 'high_protein';
  if (fb === 'plant_based' || d.includes('carb')) return 'high_carb';
  return 'balanced';
}

function calculateAge(dob?: string): number {
  if (!dob) return 30; // average fallback
  try {
    const birth = new Date(dob);
    if (isNaN(birth.getTime())) return 30;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return Math.max(1, Math.min(120, age));
  } catch {
    return 30;
  }
}

// ── Daily Energy Needs & Macro Calculations (Physiologically Grounded) ──

interface MacroGrams {
  carb_g: number;
  protein_g: number;
  fat_g: number;
  glycemicVariancePct?: number; // ±15% variance band for variable cuisines
  cuisineStyle?: 'consistent_typical' | 'variable_diverse';
}

function getMacronutrientGrams(kcal: number, mealType: BioMealType, cuisineVariability: 'consistent_typical' | 'variable_diverse' = 'consistent_typical'): MacroGrams {
  let carbPct = 0.55;
  let protPct = 0.20;
  let fatPct  = 0.25;

  if (mealType === 'ketogenic') {
    carbPct = 0.05;
    protPct = 0.20;
    fatPct  = 0.75;
  } else if (mealType === 'high_protein') {
    carbPct = 0.35;
    protPct = 0.35;
    fatPct  = 0.30;
  } else if (mealType === 'high_carb') {
    carbPct = 0.70;
    protPct = 0.15;
    fatPct  = 0.15;
  }

  // If user consumes diverse/variable cuisines, expand glycemic tolerance band (±15%)
  const glycemicVariancePct = cuisineVariability === 'variable_diverse' ? 15 : 5;

  return {
    carb_g:    Math.round((kcal * carbPct) / 4),
    protein_g: Math.round((kcal * protPct) / 4),
    fat_g:     Math.round((kcal * fatPct) / 9),
    glycemicVariancePct,
    cuisineStyle: cuisineVariability,
  };
}

interface REvent {
  id: string;
  event_type: string;
  value: number;
  wallTime: string;
  timestamp: number;
  displayLabel: string;
  displayIcon: string;
  meal_type?: BioMealType;
  carb_g?: number;
  protein_g?: number;
  fat_g?: number;
  duration_seconds?: number;
  notes?: string;
}

// ── Builder ───────────────────────────────────────────────────────────────────

export function buildDefaultRoutine(habits: OnboardingHabits, profile?: UserMedicalProfile): SavedRoutine {
  const events: REvent[] = [];

  const gender = profile?.gender || 'Male';
  const age = calculateAge(profile?.dateOfBirth);
  
  // Clamp weight & height to safe ranges to avoid negative BMR values or extremes
  const w = Math.max(30, Math.min(300, profile?.weight || 70));
  const h = Math.max(100, Math.min(250, profile?.height || 175));
  const allergies = profile?.allergies || [];
  const allergyNote = allergies.length > 0 ? `Allergic to: ${allergies.join(', ')}` : '';

  // Mifflin-St Jeor Equation
  let bmr = 1500;
  if (gender.toLowerCase() === 'male') {
    bmr = 10 * w + 6.25 * h - 5 * age + 5;
  } else if (gender.toLowerCase() === 'female') {
    bmr = 10 * w + 6.25 * h - 5 * age - 161;
  } else {
    // Gender-neutral average baseline
    bmr = 10 * w + 6.25 * h - 5 * age - 78;
  }

  const activity = (habits.activity || 'Moderate').toLowerCase();
  let multiplier = 1.375;
  if (activity.includes('sedentary')) {
    multiplier = 1.2;
  } else if (activity.includes('active') || activity.includes('vigor')) {
    multiplier = 1.725;
  } else {
    // moderate / fallback
    multiplier = 1.55;
  }

  // TDEE capped to safe physiological bounds to keep simulation stable
  const tdee = Math.max(1200, Math.min(4500, Math.round(bmr * multiplier)));

  const foodBase = habits.foodHabits?.foodBase;
  const dietType = habits.foodHabits?.dietType || 'Plant-based';
  const mealType = dietToMealType(dietType, foodBase);
  const eatingRhythm = habits.foodHabits?.eatingRhythm || 'balanced';
  const ingredientExclusions = habits.foodHabits?.ingredientExclusions || [];
  
  const allExclusions = [...new Set([...allergies, ...ingredientExclusions])];
  const exclusionNote = allExclusions.length > 0 ? `Avoid: ${allExclusions.join(', ')}` : '';

  const mealFreq = habits.foodHabits?.mealFreq  || '3 meals';
  const snacking = habits.foodHabits?.snacking  || 'Sometimes';
  const addSnacks = mealFreq === '4–5 meals' || mealFreq === '6+ meals'
                 || snacking === 'Often' || snacking === 'All the time';

  const wakeStr  = habits.wakeUp    || '07:00';
  const bfStr    = habits.breakfast || '08:00';
  const luStr    = habits.lunch     || '13:00';
  const diStr    = habits.dinner    || '20:00';
  const slStr    = habits.sleep     || '23:00';

  // 1. Sleep Event
  const slHM = parseHM(slStr);
  const wkHM = parseHM(wakeStr);
  let sleepHrs = ((wkHM.h + 24) - slHM.h) % 24;
  if (sleepHrs <= 0 || sleepHrs > 14) sleepHrs = 7.5;
  events.push({
    id: 'onb_sleep',
    event_type: 'sleep',
    value: sleepHrs * 3600,
    wallTime: slStr,
    timestamp: wallTimeToTimestamp(slStr),
    displayLabel: `Sleep · ${sleepHrs} hours`,
    displayIcon: '🌙',
    duration_seconds: sleepHrs * 3600,
  });

  // Calculate meal calorie distribution based on eating rhythm and frequency preference
  let hasBf = true;
  let bfKcal = 0;
  let luKcal = 0;
  let diKcal = 0;
  let snKcal = 0;

  if (eatingRhythm === 'morning_heavy') {
    // 🌅 Morning Heavy: 40% Breakfast, 35% Lunch, 25% Dinner
    bfKcal = Math.round(tdee * 0.40);
    luKcal = Math.round(tdee * 0.35);
    diKcal = Math.round(tdee * 0.25);
  } else if (eatingRhythm === 'evening_heavy') {
    // 🌙 Evening Heavy: 20% Breakfast, 30% Lunch, 50% Dinner
    bfKcal = Math.round(tdee * 0.20);
    luKcal = Math.round(tdee * 0.30);
    diKcal = Math.round(tdee * 0.50);
  } else if (eatingRhythm === 'intermittent' || mealFreq.includes('2 meals')) {
    // ⏳ Intermittent 16:8 Window: 2 concentrated meals (Lunch & Dinner)
    hasBf = false;
    luKcal = Math.round(tdee * 0.45);
    diKcal = Math.round(tdee * 0.55);
  } else if (mealFreq.includes('1 meal')) {
    // OMAD: 100% Dinner
    hasBf = false;
    luKcal = 0;
    diKcal = tdee;
  } else if (addSnacks) {
    bfKcal = Math.round(tdee * 0.25);
    luKcal = Math.round(tdee * 0.35);
    diKcal = Math.round(tdee * 0.30);
    snKcal = Math.round(tdee * 0.05); // 5% for mid-day snacks
  } else {
    // Default Balanced 3 meals
    bfKcal = Math.round(tdee * 0.30);
    luKcal = Math.round(tdee * 0.40);
    diKcal = Math.round(tdee * 0.30);
  }

  // 0. If user provided custom visual timeline blocks, ingest them directly!
  if (habits.customTimelineBlocks && habits.customTimelineBlocks.length > 0) {
    habits.customTimelineBlocks.forEach(blk => {
      if (blk.type === 'meal' || blk.type === 'snack') {
        const pct = blk.kcalPercent || 25;
        const mealKcal = Math.round((tdee * pct) / 100);
        events.push({
          id: `custom_${blk.id}`,
          event_type: 'meal',
          value: mealKcal,
          wallTime: blk.time,
          timestamp: wallTimeToTimestamp(blk.time),
          meal_type: mealType,
          ...getMacronutrientGrams(mealKcal, mealType),
          displayLabel: `${blk.title} · ${mealKcal} kcal`,
          displayIcon: blk.icon || '🥗',
          notes: blk.notes || exclusionNote,
        });
      } else if (blk.type === 'exercise') {
        events.push({
          id: `custom_${blk.id}`,
          event_type: 'exercise',
          value: 0.50,
          wallTime: blk.time,
          timestamp: wallTimeToTimestamp(blk.time),
          duration_seconds: 1800,
          displayLabel: `${blk.title} · Exercise`,
          displayIcon: blk.icon || '🏃‍♂️',
          notes: blk.notes,
        });
      }
    });
  }

  // 2. Breakfast Meal (only if eating >= 3 meals and no custom blocks specified)
  if (hasBf && bfKcal > 0 && (!habits.customTimelineBlocks || habits.customTimelineBlocks.length === 0)) {
    events.push({
      id: 'onb_breakfast',
      event_type: 'meal',
      value: bfKcal,
      wallTime: bfStr,
      timestamp: wallTimeToTimestamp(bfStr),
      meal_type: mealType,
      ...getMacronutrientGrams(bfKcal, mealType),
      displayLabel: `Breakfast · ${bfKcal} kcal`,
      displayIcon: '🍳',
      notes: allergyNote,
    });
  }

  // 3. Mid-morning snack (between Breakfast and Lunch)
  if (addSnacks && snKcal > 0 && hasBf) {
    const bfH = parseHM(bfStr).h;
    const luH = parseHM(luStr).h;
    const snH = pad(Math.round((bfH + luH) / 2));
    const snW = `${snH}:00`;
    events.push({
      id: 'onb_snack1',
      event_type: 'meal',
      value: snKcal,
      wallTime: snW,
      timestamp: wallTimeToTimestamp(snW),
      meal_type: mealType,
      ...getMacronutrientGrams(snKcal, mealType),
      displayLabel: `Morning Snack · ${snKcal} kcal`,
      displayIcon: '🍎',
      notes: allergyNote,
    });
  }

  // 4. Lunch Meal (only if eating >= 2 meals)
  if (luKcal > 0) {
    events.push({
      id: 'onb_lunch',
      event_type: 'meal',
      value: luKcal,
      wallTime: luStr,
      timestamp: wallTimeToTimestamp(luStr),
      meal_type: mealType,
      ...getMacronutrientGrams(luKcal, mealType),
      displayLabel: `Lunch · ${luKcal} kcal`,
      displayIcon: '🥗',
      notes: allergyNote,
    });
  }

  // 5. Afternoon snack (between Lunch and Dinner)
  if (addSnacks && snKcal > 0) {
    const luH = parseHM(luStr).h;
    const diH = parseHM(diStr).h;
    const snH = pad(Math.round((luH + diH) / 2));
    const snW = `${snH}:00`;
    events.push({
      id: 'onb_snack2',
      event_type: 'meal',
      value: snKcal,
      wallTime: snW,
      timestamp: wallTimeToTimestamp(snW),
      meal_type: mealType,
      ...getMacronutrientGrams(snKcal, mealType),
      displayLabel: `Afternoon Snack · ${snKcal} kcal`,
      displayIcon: '🍌',
      notes: allergyNote,
    });
  }

  // 6. Dinner Meal
  if (diKcal > 0) {
    events.push({
      id: 'onb_dinner',
      event_type: 'meal',
      value: diKcal,
      wallTime: diStr,
      timestamp: wallTimeToTimestamp(diStr),
      meal_type: mealType,
      ...getMacronutrientGrams(diKcal, mealType),
      displayLabel: `Dinner · ${diKcal} kcal`,
      displayIcon: '🍽️',
      notes: allergyNote,
    });
  }

  // 7. Exercise (intensity is a fraction from 0.0 to 1.0)
  const exerciseMap: Record<string, { intensity: number; duration: number; label: string; icon: string }> = {
    active:     { intensity: 0.70, duration: 2700, label: '45min vigorous exercise', icon: '🏋️' },
    moderate:   { intensity: 0.45, duration: 1800, label: '30min moderate exercise', icon: '🚶' },
    sedentary:  { intensity: 0.20, duration: 1200, label: '20min light walk',       icon: '🪑' },
  };
  
  let userActKey = 'moderate';
  if (activity.includes('sedentary')) userActKey = 'sedentary';
  else if (activity.includes('active') || activity.includes('vigor')) userActKey = 'active';

  const ex = exerciseMap[userActKey] || exerciseMap['moderate'];
  const exH = pad((parseHM(wakeStr).h + 3) % 24); // 3 hours after waking up
  const exW = `${exH}:00`;
  events.push({
    id: 'onb_exercise',
    event_type: 'exercise',
    value: ex.intensity,
    wallTime: exW,
    timestamp: wallTimeToTimestamp(exW),
    duration_seconds: ex.duration,
    displayLabel: ex.label,
    displayIcon: ex.icon,
  });

  // 8. Water (250 ml cups)
  let waterLiters = 2;
  const cleanWater = String(habits.water || '2L').toLowerCase();
  if (cleanWater.includes('glass')) {
    const num = parseInt(cleanWater.replace(/[^0-9]/g, '')) || 8;
    waterLiters = (num * 250) / 1000;
  } else {
    waterLiters = parseFloat(cleanWater.replace(/[^0-9.]/g, '')) || 2;
  }
  
  // Clamping water target safely to keep simulator stable
  waterLiters = Math.max(1, Math.min(8, waterLiters));

  const numGlasses  = Math.max(4, Math.min(24, Math.round((waterLiters * 1000) / 250)));
  const wkH  = parseHM(wakeStr).h;
  const bedH = parseHM(slStr).h < wkH ? parseHM(slStr).h + 24 : parseHM(slStr).h;
  const span = Math.max(12, bedH - wkH);
  const step = span / numGlasses;

  for (let i = 0; i < numGlasses; i++) {
    const rawH = wkH + step * i;
    const h24  = Math.floor(rawH) % 24;
    const m    = rawH % 1 >= 0.5 ? 30 : 0;
    const wT   = `${pad(h24)}:${pad(m)}`;
    events.push({
      id: `onb_water_${i}`,
      event_type: 'water',
      value: 250,
      wallTime: wT,
      timestamp: wallTimeToTimestamp(wT),
      displayLabel: 'Water · 250 ml',
      displayIcon: '💧',
    });
  }

  // Sort chronologically by wall time
  const sorted = [...events].sort((a, b) => {
    const { h: ah, m: am } = parseHM(a.wallTime);
    const { h: bh, m: bm } = parseHM(b.wallTime);
    return (ah * 60 + am) - (bh * 60 + bm);
  });

  return {
    id: 'routine_onboarding_saved_state',
    name: 'My Saved State',
    events: sorted as any,
    eventCount: sorted.length,
    createdAt: new Date().toISOString(),
    isDefault: true,
    tags: ['default', 'onboarding', dietType.toLowerCase()],
  };
}
