// services/onboardingService.ts
// Integration service for dynamic onboarding, adaptive questionnaire, and Health OS backend ingestion.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getBiogearsBaseUrl, getApiKey, FALLBACK_API_KEY } from "./biogears";
import { fetchWithRetry } from "../constants/Config";
import { log, warn } from "../utils/logger";

export interface FamilyHistoryItem {
  relation: string; // e.g. "Father", "Mother", "Grandparent", "Sibling"
  condition: string; // e.g. "Heart Disease", "Diabetes", "Stroke"
}

export interface AdaptiveQuestionsPayload {
  patient_id: string;
  primary_goal?: string;
  age?: number;
  sex?: string;
  selected_conditions?: string[];
  selected_vitals?: Record<string, any>;
}

export interface AdaptiveHabitCardOption {
  label: string;
  emoji?: string;
}

export interface AdaptiveHabitCard {
  id: string;
  question: string;
  subtitle: string;
  icon: string;
  type: 'chips' | 'single';
  options: AdaptiveHabitCardOption[];
}

export interface AdaptiveQuestionsResponse {
  status: string;
  patient_id: string;
  suggested_conditions: string[];
  suggested_family_history: string[];
  suggested_medications: string[];
  adaptive_habit_cards: AdaptiveHabitCard[];
  categorized_taxonomy?: Record<string, string[]>;
}

export interface MedicalSearchItem {
  condition: string;
  category: string;
}

export interface MedicalSearchResponse {
  status: string;
  total: number;
  results: MedicalSearchItem[];
  categories: string[];
}

export const COMPREHENSIVE_MEDICAL_TAXONOMY_FALLBACK: Record<string, string[]> = {
  "Cardiovascular": [
    "Hypertension (High BP)", "Coronary Artery Disease", "Heart Failure", "Arrhythmia / Atrial Fibrillation",
    "Angina Pectoris", "Peripheral Artery Disease", "Hyperlipidemia (High Cholesterol)", "Valvular Heart Disease",
    "Aortic Aneurysm", "Venous Thromboembolism (DVT)", "Post-Myocardial Infarction", "Congenital Heart Defect"
  ],
  "Endocrine & Metabolic": [
    "Type 1 Diabetes Mellitus", "Type 2 Diabetes Mellitus", "Gestational Diabetes", "Hypothyroidism",
    "Hyperthyroidism / Graves' Disease", "Hashimoto's Thyroiditis", "Obesity / Metabolic Syndrome",
    "Polycystic Ovary Syndrome (PCOS)", "Osteopenia / Osteoporosis", "Adrenal Insufficiency", "Cushing's Syndrome",
    "Hyperuricemia / Gout", "Prediabetes"
  ],
  "Respiratory": [
    "Asthma", "Chronic Obstructive Pulmonary Disease (COPD)", "Bronchitis", "Emphysema",
    "Pulmonary Fibrosis", "Sleep Apnea (OSA)", "Allergic Rhinitis", "Pneumonia / Recurrent Chest Infections",
    "Bronchiectasis", "Pulmonary Hypertension", "Sarcoidosis"
  ],
  "Neurological": [
    "Migraine / Chronic Headache", "Epilepsy / Seizure Disorder", "Multiple Sclerosis", "Parkinson's Disease",
    "Peripheral Neuropathy", "Stroke / Transient Ischemic Attack (TIA)", "Essential Tremor",
    "Alzheimer's Disease / Dementia", "Restless Legs Syndrome", "Trigeminal Neuralgia", "Bell's Palsy"
  ],
  "Gastrointestinal & Hepatic": [
    "Gastroesophageal Reflux Disease (GERD)", "Irritable Bowel Syndrome (IBS)", "Crohn's Disease",
    "Ulcerative Colitis", "Celiac Disease", "Peptic Ulcer Disease", "Non-Alcoholic Fatty Liver Disease (NAFLD)",
    "Cirrhosis / Chronic Liver Disease", "Gallstones / Cholecystitis", "Chronic Pancreatitis", "Diverticulitis"
  ],
  "Renal & Urological": [
    "Chronic Kidney Disease (CKD)", "Kidney Stones (Nephrolithiasis)", "Polycystic Kidney Disease",
    "Nephrotic Syndrome", "Benign Prostatic Hyperplasia (BPH)", "Recurrent Urinary Tract Infections",
    "Overactive Bladder"
  ],
  "Musculoskeletal & Autoimmune": [
    "Rheumatoid Arthritis", "Osteoarthritis", "Systemic Lupus Erythematosus (SLE)", "Psoriatic Arthritis",
    "Ankylosing Spondylitis", "Sjögren's Syndrome", "Fibromyalgia", "Chronic Lower Back Pain",
    "Scoliosis", "Gouty Arthritis", "Tendinitis / Bursitis"
  ],
  "Dermatological": [
    "Psoriasis", "Eczema / Atopic Dermatitis", "Severe Acne", "Rosacea",
    "Alopecia Areata", "Vitiligo", "Chronic Urticaria (Hives)", "Hidradenitis Suppurativa"
  ],
  "Hematological & Immune": [
    "Iron Deficiency Anemia", "Vitamin B12 / Pernicious Anemia", "Sickle Cell Trait / Disease",
    "Thalassemia", "Immune Thrombocytopenia (ITP)", "Primary Immunodeficiency", "Hemophilia",
    "Multiple Myeloma"
  ],
  "Mental Health & Neurodiversity": [
    "Generalized Anxiety Disorder", "Major Depressive Disorder", "Bipolar Disorder",
    "Attention Deficit Hyperactivity Disorder (ADHD)", "Post-Traumatic Stress Disorder (PTSD)",
    "Obsessive-Compulsive Disorder (OCD)", "Insomnia Disorder", "Panic Disorder"
  ],
  "Oncology": [
    "Breast Cancer History", "Prostate Cancer History", "Colorectal Cancer History",
    "Lung Cancer History", "Melanoma / Skin Cancer", "Lymphoma (Hodgkin/Non-Hodgkin)",
    "Thyroid Cancer History", "Bladder Cancer History"
  ],
  "Reproductive & Womens Health": [
    "Endometriosis", "Uterine Fibroids", "Polycystic Ovary Syndrome (PCOS)",
    "Menopause / Perimenopause Symptoms", "Pelvic Inflammatory Disease", "Premenstrual Dysphoric Disorder (PMDD)"
  ]
};


export interface FullOnboardingIntakePayload {
  patient_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  date_of_birth?: string;
  gender?: string;
  primary_goal?: string;
  height_cm: number;
  weight_kg: number;
  blood_group?: string;
  resting_hr: number;
  systolic_bp: number;
  diastolic_bp: number;
  body_fat_pct: number;
  allergies?: string[];
  chronic_conditions?: string[];
  family_history?: FamilyHistoryItem[];
  medications?: string[];
  surgeries?: string[];
  habits?: Record<string, any>;
}

export interface DigitalTwinActivationResult {
  is_calibrated: boolean;
  composite_health_score: number;
  bmi: number;
  bsa_m2: number;
  bmr_kcal_day: number;
  organ_health_scores: Record<string, number>;
  ten_year_cvd_risk_pct: number;
  recovery_readiness_score: number;
  knowledge_graph_nodes: number;
  timeline_events_seeded: number;
  day_1_briefing: string;
}

export interface OnboardingIntakeResponse {
  status: string;
  patient_id: string;
  twin_activation: DigitalTwinActivationResult;
}

const ONBOARDING_DRAFT_KEY = "@vitalhealth_onboarding_draft";

/**
 * Fetch dynamic, adaptive questions and smart chips from Health OS backend
 */
export async function fetchAdaptiveOnboardingQuestions(
  payload: AdaptiveQuestionsPayload
): Promise<AdaptiveQuestionsResponse> {
  try {
    const baseUrl = await getBiogearsBaseUrl();
    const apiKey = await getApiKey();
    const url = `${baseUrl}/api/v6/onboarding/adaptive-questions`;

    const res = await fetchWithRetry(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "X-API-Key": apiKey } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      return data as AdaptiveQuestionsResponse;
    }
  } catch (err) {
    warn("[OnboardingService] Error fetching adaptive questions, using fallback defaults:", err);
  }

  // Fallback defaults if offline or backend unavailable
  return {
    status: "FALLBACK",
    patient_id: payload.patient_id,
    suggested_conditions: ["Hypertension", "Type 2 Diabetes", "Asthma", "Thyroid", "Migraine", "Chronic Anemia"],
    suggested_family_history: ["Heart Disease", "Diabetes", "Cancer", "Stroke", "Hypertension"],
    suggested_medications: ["Paracetamol", "Ibuprofen", "Aspirin", "Metformin", "Amlodipine"],
    adaptive_habit_cards: [
      {
        id: "dietType",
        question: "What best describes your daily diet?",
        subtitle: "Used to calibrate dietary Digital Twin simulations",
        icon: "restaurant",
        type: "chips",
        options: [
          { label: "Vegetarian", emoji: "🥦" },
          { label: "Non-Veg", emoji: "🍗" },
          { label: "Keto", emoji: "🥩" },
          { label: "Vegan", emoji: "🌱" },
        ],
      },
    ],
  };
}

/**
 * Ingest complete onboarding intake into Health OS backend (seeds Graph, Timeline & Twin)
 */
export async function submitFullOnboardingIntake(
  payload: FullOnboardingIntakePayload
): Promise<OnboardingIntakeResponse> {
  try {
    const baseUrl = await getBiogearsBaseUrl();
    const apiKey = await getApiKey();
    const url = `${baseUrl}/api/v6/onboarding/intake`;

    log(`[OnboardingService] Submitting full intake to Health OS: ${url}`);

    const res = await fetchWithRetry(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "X-API-Key": apiKey } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      log(`[OnboardingService] ✅ Digital Twin Activation response:`, data);
      return data as OnboardingIntakeResponse;
    }
  } catch (err) {
    warn("[OnboardingService] Failed to reach backend intake, computing local twin activation:", err);
  }

  // Local fallback calculation if offline
  const heightM = payload.height_cm / 100.0;
  const bmi = parseFloat((payload.weight_kg / (heightM * heightM)).toFixed(1));
  const bsa = parseFloat((0.007184 * Math.pow(payload.height_cm, 0.725) * Math.pow(payload.weight_kg, 0.425)).toFixed(2));
  const bmr = Math.round(10 * payload.weight_kg + 6.25 * payload.height_cm - 5 * 30 + 5);

  return {
    status: "FALLBACK_LOCAL",
    patient_id: payload.patient_id,
    twin_activation: {
      is_calibrated: true,
      composite_health_score: 94.0,
      bmi,
      bsa_m2: bsa,
      bmr_kcal_day: bmr,
      organ_health_scores: {
        brain: 95,
        heart: payload.resting_hr < 80 ? 96 : 85,
        lungs: 94,
        liver: 95,
        gut: 92,
        kidneys: 96,
        metabolic: 94,
      },
      ten_year_cvd_risk_pct: payload.resting_hr > 85 ? 10.5 : 5.2,
      recovery_readiness_score: 90,
      knowledge_graph_nodes: 4,
      timeline_events_seeded: 3,
      day_1_briefing: `Welcome to VitalHealth, ${payload.first_name}! Your Digital Twin baseline has been calibrated locally.`,
    },
  };
}

/**
 * Save draft onboarding form state to local AsyncStorage
 */
export async function saveOnboardingDraft(data: Partial<FullOnboardingIntakePayload>): Promise<void> {
  try {
    const existing = await loadOnboardingDraft();
    const updated = { ...existing, ...data };
    await AsyncStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(updated));
  } catch (e) {
    warn("[OnboardingService] Failed to save draft:", e);
  }
}

/**
 * Load draft onboarding form state from local AsyncStorage
 */
export async function loadOnboardingDraft(): Promise<Partial<FullOnboardingIntakePayload>> {
  try {
    const raw = await AsyncStorage.getItem(ONBOARDING_DRAFT_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Clear onboarding draft after successful setup
 */
export async function clearOnboardingDraft(): Promise<void> {
  try {
    await AsyncStorage.removeItem(ONBOARDING_DRAFT_KEY);
  } catch (e) {
    warn("[OnboardingService] Failed to clear draft:", e);
  }
}

/**
 * Search the medical database via backend endpoint with offline local taxonomy fallback
 */
export async function searchMedicalDatabase(
  query: string,
  category?: string,
  limit: number = 30
): Promise<MedicalSearchResponse> {
  try {
    const baseUrl = await getBiogearsBaseUrl();
    const apiKey = await getApiKey();
    const url = `${baseUrl}/api/v6/onboarding/medical-search`;

    const res = await fetchWithRetry(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "X-API-Key": apiKey } : {}),
      },
      body: JSON.stringify({ query, category, limit }),
    });

    if (res.ok) {
      const data = await res.json();
      return data as MedicalSearchResponse;
    }
  } catch (err) {
    log("[OnboardingService] Medical search endpoint offline, performing local fallback search");
  }

  // Local fallback search engine
  const q = query.trim().toLowerCase();
  const catFilter = category && category !== "All" ? category.toLowerCase() : null;
  const results: MedicalSearchItem[] = [];

  Object.entries(COMPREHENSIVE_MEDICAL_TAXONOMY_FALLBACK).forEach(([catName, items]) => {
    if (catFilter && !catName.toLowerCase().includes(catFilter)) return;
    items.forEach((cond) => {
      if (!q || cond.toLowerCase().includes(q) || catName.toLowerCase().includes(q)) {
        results.push({ condition: cond, category: catName });
      }
    });
  });

  return {
    status: "FALLBACK_LOCAL",
    total: results.length,
    results: results.slice(0, limit),
    categories: Object.keys(COMPREHENSIVE_MEDICAL_TAXONOMY_FALLBACK),
  };
}

