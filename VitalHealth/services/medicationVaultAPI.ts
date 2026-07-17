// VitalHealth/services/medicationVaultAPI.ts
// TypeScript client for the Medication Vault backend API.
// Fully typed — mirrors domain/models.py exactly.
//
// Architecture: All traffic goes through nginx on port 80.
//   http://151.185.45.137/medication/  → localhost:8002 (Medication Vault)
//   http://151.185.45.137/             → localhost:8000 (BioGears)
//   http://151.185.45.137/ai/          → localhost:8001 (Dr. Aria)

import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth } from './firebase';

// ─── Config ───────────────────────────────────────────────────────────────────

// The medication service is proxied via nginx at /medication/
// nginx strips the /medication/ prefix before forwarding to port 8002.
// So the actual FastAPI routes are at: /api/v1/medication/...
const MED_API_URL_KEY = '@medication_api_url';

// Production: same server IP as BioGears, nginx routes /medication/ → port 8002
const DEFAULT_MED_API_URL = 'http://151.185.45.137/medication';
const API_BASE = '/api/v1/medication';

export async function getMedApiUrl(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(MED_API_URL_KEY);
    return stored || DEFAULT_MED_API_URL;
  } catch {
    return DEFAULT_MED_API_URL;
  }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const user = auth.currentUser;
    if (user) {
      const token = await user.getIdToken();
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch (e) {
    console.warn('[MedAPI] Could not get Firebase token:', e);
  }
  return headers;
}

async function medFetch<T>(
  path: string,
  options?: RequestInit,
  timeoutMs = 20000,
): Promise<T> {
  const base = await getMedApiUrl();
  const url = `${base}${API_BASE}${path}`;
  const headers = await getAuthHeaders();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { ...headers, ...((options?.headers as any) || {}) },
      signal: controller.signal,
      ...options,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const detail = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(detail?.detail || detail?.message || `HTTP ${res.status}`);
    }
    return res.json() as Promise<T>;
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('Medication API request timed out');
    throw err;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type MedStatus = 'active' | 'paused' | 'discontinued' | 'archived' | 'completed';
export type DoseStatus = 'pending' | 'taken' | 'missed' | 'skipped' | 'late' | 'rescheduled';
export type FrequencyType = 'once' | 'daily' | 'twice_daily' | 'three_times' | 'every_x_hours' | 'weekly' | 'monthly' | 'prn' | 'custom_rrule';

export interface MedicineCreate {
  name: string;
  brand_name?: string;
  generic_name?: string;
  strength?: string;
  dosage_form?: string;
  dose_quantity: string;
  dose_unit?: string;
  frequency: FrequencyType;
  scheduled_time?: string;
  meal_relation?: 'before' | 'after' | 'with' | 'empty_stomach';
  start_date?: string;
  end_date?: string;
  is_ongoing?: boolean;
  priority?: 'critical' | 'important' | 'optional';
  doctor_name?: string;
  hospital?: string;
  purpose?: string;
  side_effects?: string;
  warnings?: string;
  storage_conditions?: string;
  color?: string;
  shape?: string;
  disease_linked?: string;
  biogears_linked?: boolean;
  reminder_enabled?: boolean;
  inventory_count?: number;
  refill_count?: number;
  barcode?: string;
  custom_metadata?: Record<string, any>;
}

export interface Medicine extends MedicineCreate {
  id: string;
  user_id: string;
  status: MedStatus;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface DoseRecord {
  id: string;
  medicine_id: string;
  user_id: string;
  scheduled_at: string;
  taken_at?: string;
  status: DoseStatus;
  delay_minutes?: number;
  skip_reason?: string;
  notes?: string;
  biogears_sim_id?: string;
}

export interface InteractionResult {
  drug_a: string;
  drug_b: string;
  severity: 'none' | 'minor' | 'moderate' | 'major' | 'contraindicated';
  mechanism?: string;
  clinical_effect?: string;
  management?: string;
  contraindicated: boolean;
  confidence_score: number;
  reference_sources: string[];
}

export interface ComplianceData {
  period_days: number;
  adherence_pct: number;
  streak_days: number;
  score: number;
  grade: string;
  daily_logs: any[];
}

export interface InventoryRecord {
  id: string;
  medicine_id: string;
  current_count: number;
  unit: string;
  reorder_threshold: number;
  is_low: boolean;
  days_remaining?: number;
  expiry_date?: string;
  pharmacy_name?: string;
  unit_cost_usd?: number;
  consumption_rate?: number;
}

export interface AIChat {
  reply: string;
  conversation_id: string;
  clinical_citations: string[];
  suggested_actions: string[];
  risk_flags: string[];
}

// ─── API Methods ──────────────────────────────────────────────────────────────

// ── Medicines ─────────────────────────────────────────────────────────────────

export const createMedicine = (payload: MedicineCreate): Promise<{ success: boolean; data: Medicine }> =>
  medFetch('/medicine', { method: 'POST', body: JSON.stringify(payload) });

export const listMedicines = (params?: {
  status?: MedStatus; page?: number; page_size?: number; search?: string;
}): Promise<{ data: Medicine[]; total: number; page: number }> => {
  const q = new URLSearchParams(params as any).toString();
  return medFetch(`/medicine${q ? '?' + q : ''}`);
};

export const getMedicine = (id: string): Promise<{ data: Medicine }> =>
  medFetch(`/medicine/${id}`);

export const updateMedicine = (id: string, updates: Partial<MedicineCreate>): Promise<{ data: Medicine }> =>
  medFetch(`/medicine/${id}`, { method: 'PUT', body: JSON.stringify(updates) });

export const deleteMedicine = (id: string): Promise<{ success: boolean }> =>
  medFetch(`/medicine/${id}`, { method: 'DELETE' });

export const setMedicineStatus = (id: string, status: MedStatus): Promise<{ data: Medicine }> =>
  medFetch(`/medicine/${id}/status?status=${status}`, { method: 'PATCH' });

// ── Dose Logging ──────────────────────────────────────────────────────────────

export const logDose = (payload: {
  medicine_id: string;
  status: DoseStatus;
  taken_at?: string;
  skip_reason?: string;
  notes?: string;
}): Promise<{ data: DoseRecord }> =>
  medFetch('/dose', { method: 'POST', body: JSON.stringify(payload) });

export const getTodaySchedule = (): Promise<{ data: DoseRecord[] }> =>
  medFetch('/schedule/today');

export const getUpcomingSchedule = (hours = 24): Promise<{ data: DoseRecord[] }> =>
  medFetch(`/schedule/upcoming?hours=${hours}`);

export const generateSchedule = (days = 14): Promise<{ data: { generated: number } }> =>
  medFetch(`/schedule/generate?days=${days}`, { method: 'POST' });

// ── History ───────────────────────────────────────────────────────────────────

export const getMedicationHistory = (params?: {
  page?: number; page_size?: number; status?: string;
}): Promise<{ data: any[]; total: number }> => {
  const q = new URLSearchParams(params as any).toString();
  return medFetch(`/history${q ? '?' + q : ''}`);
};

// ── Compliance ────────────────────────────────────────────────────────────────

export const getCompliance = (days = 30): Promise<{ data: ComplianceData }> =>
  medFetch(`/compliance?days=${days}`);

// ── Interactions ──────────────────────────────────────────────────────────────

export const checkInteractions = (medicine_ids: string[]): Promise<{
  data: { interactions: InteractionResult[]; highest_severity: string; summary: string; has_contraindication: boolean };
}> => medFetch('/interaction/check', { method: 'POST', body: JSON.stringify({ medicine_ids }) });

// ── Inventory ─────────────────────────────────────────────────────────────────

export const listInventory = (): Promise<{ data: InventoryRecord[] }> =>
  medFetch('/inventory');

export const getInventory = (medicineId: string): Promise<{ data: InventoryRecord }> =>
  medFetch(`/inventory/${medicineId}`);

export const updateInventory = (medicineId: string, updates: Partial<InventoryRecord>): Promise<{ data: InventoryRecord }> =>
  medFetch(`/inventory/${medicineId}`, { method: 'PUT', body: JSON.stringify(updates) });

export const refillInventory = (medicineId: string, quantity: number): Promise<{ data: InventoryRecord }> =>
  medFetch(`/inventory/${medicineId}/refill?quantity=${quantity}`, { method: 'POST' });

// ── Reminders ─────────────────────────────────────────────────────────────────

export const getPendingReminders = (): Promise<{ data: any[] }> =>
  medFetch('/reminders/pending');

export const acknowledgeReminder = (reminder_id: string): Promise<{ success: boolean }> =>
  medFetch('/reminders/ack', { method: 'POST', body: JSON.stringify({ reminder_id }) });

export const snoozeReminder = (reminder_id: string, snooze_minutes = 10): Promise<{ success: boolean }> =>
  medFetch('/reminders/snooze', { method: 'POST', body: JSON.stringify({ reminder_id, snooze_minutes }) });

// ── Analytics ─────────────────────────────────────────────────────────────────

export const getWeeklyAnalytics = (): Promise<{ data: any }> =>
  medFetch('/analytics/weekly');

export const getMonthlyAnalytics = (): Promise<{ data: any }> =>
  medFetch('/analytics/monthly');

export const getCostAnalysis = (): Promise<{ data: any }> =>
  medFetch('/analytics/cost');

// ── Reports ───────────────────────────────────────────────────────────────────

export const downloadReport = async (params: {
  report_type: string;
  format: 'pdf' | 'csv' | 'fhir_json' | 'hl7_v2';
  period_start?: string;
  period_end?: string;
}): Promise<Blob> => {
  const base = await getMedApiUrl();
  const headers = await getAuthHeaders();
  const res = await fetch(`${base}${API_BASE}/report`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Report generation failed: HTTP ${res.status}`);
  return res.blob();
};

// ── AI Chat ───────────────────────────────────────────────────────────────────

export const chatWithAria = (payload: {
  message: string;
  context_medicine_ids?: string[];
  conversation_id?: string;
}): Promise<{ data: AIChat }> =>
  medFetch('/ai/chat', { method: 'POST', body: JSON.stringify(payload) });

// ── BioGears Simulation ───────────────────────────────────────────────────────

export const triggerMedicationSim = (payload: {
  medicine_id: string;
  substance_name: string;
  dose_value: number;
  dose_unit?: string;
}): Promise<{ data: { simulation_id: string } }> =>
  medFetch('/simulation', { method: 'POST', body: JSON.stringify(payload) });

export const getSimulationHistory = (limit = 20): Promise<{ data: any[] }> =>
  medFetch(`/simulation/history?limit=${limit}`);

// ── Emergency ─────────────────────────────────────────────────────────────────

export const getEmergencyByQR = (qr_token: string): Promise<{ data: any }> =>
  medFetch(`/emergency/${qr_token}`);

export const getMyEmergencyProfile = (): Promise<{ data: any }> =>
  medFetch('/emergency');

export const updateEmergencyProfile = (payload: {
  blood_group?: string;
  allergies?: string[];
  medical_conditions?: string[];
  emergency_contacts?: any[];
  critical_medicine_ids?: string[];
}): Promise<{ data: any }> =>
  medFetch('/emergency', { method: 'PUT', body: JSON.stringify(payload) });

// ── OCR ───────────────────────────────────────────────────────────────────────

export const ocrPrescription = async (fileUri: string, mimeType = 'image/jpeg'): Promise<{ data: any }> => {
  const base = await getMedApiUrl();
  const headers = await getAuthHeaders();
  delete headers['Content-Type']; // FormData handles it

  const form = new FormData();
  form.append('file', { uri: fileUri, type: mimeType, name: 'prescription' } as any);

  const res = await fetch(`${base}${API_BASE}/ocr`, { method: 'POST', headers, body: form });
  if (!res.ok) throw new Error(`OCR failed: HTTP ${res.status}`);
  return res.json();
};

// ── Prescriptions ─────────────────────────────────────────────────────────────

export const listPrescriptions = (): Promise<{ data: any[] }> =>
  medFetch('/prescription');

// ── Settings ──────────────────────────────────────────────────────────────────

export const getMedSettings = (): Promise<{ data: any }> =>
  medFetch('/settings');

export const updateMedSettings = (settings: Record<string, any>): Promise<{ success: boolean }> =>
  medFetch('/settings', { method: 'PUT', body: JSON.stringify(settings) });

// ── Family ────────────────────────────────────────────────────────────────────

export const addCaregiver = (payload: {
  caregiver_user_id: string;
  caregiver_name?: string;
  relationship?: string;
  permission?: 'read_only' | 'log_doses' | 'full_access' | 'emergency_only';
}): Promise<{ data: any }> =>
  medFetch('/family/caregiver', { method: 'POST', body: JSON.stringify(payload) });

export const listCaregivers = (): Promise<{ data: any[] }> =>
  medFetch('/family/caregivers');

export const removeCaregiver = (caregiver_user_id: string): Promise<{ success: boolean }> =>
  medFetch(`/family/caregiver/${caregiver_user_id}`, { method: 'DELETE' });

// ── Achievements ──────────────────────────────────────────────────────────────

export const getAchievements = (): Promise<{ data: any[] }> =>
  medFetch('/achievements');

// ── Audit ─────────────────────────────────────────────────────────────────────

export const getAuditTrail = (page = 1): Promise<{ data: any[]; total: number }> =>
  medFetch(`/audit?page=${page}`);

// ── Health Check ──────────────────────────────────────────────────────────────

export const checkMedApiHealth = (): Promise<{ status: string }> =>
  medFetch('/health', undefined, 5000);
