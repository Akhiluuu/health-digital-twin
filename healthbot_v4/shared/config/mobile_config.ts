/**
 * healthbot_v4/shared/config/mobile_config.ts
 * React Native / Mobile Application API Client Integration Configuration.
 * Connects the mobile frontend directly to the E2E Production Server.
 */

export const VITALHEALTH_CONFIG = {
  // E2E Production Server Gateway URL
  API_BASE_URL: process.env.EXPO_PUBLIC_API_URL || 'http://151.185.45.137:8000',
  
  // Endpoint Paths
  ENDPOINTS: {
    HEALTH: '/health',
    PHOS_QUERY: '/api/v6/brain/phos/query',
    TWIN_SIMULATE: '/api/v5/twin/simulate',
    TELEMETRY_STREAM: '/telemetry/stream',
    CALORIC_BALANCE: '/analytics/caloric-balance',
    ORGAN_SCORES: '/analytics/organ-scores',
    OCR_UPLOAD: '/api/v5/ocr/upload',
    JOURNEY_GOALS: '/api/v5/journey',
  },
  
  // Request Timeouts
  TIMEOUT_MS: 30000,
};

/**
 * Helper to execute PHOS v6.0 AI Reasoning queries from React Native
 */
export async function queryPHOSEngine(patientId: str, queryText: string) {
  const url = `${VITALHEALTH_CONFIG.API_BASE_URL}${VITALHEALTH_CONFIG.ENDPOINTS.PHOS_QUERY}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      patient_id: patientId,
      query: queryText,
    }),
  });

  if (!response.ok) {
    throw new Error(`PHOS API Error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Helper to log daily telemetry (vitals, steps) from mobile sensors
 */
export async function streamMobileTelemetry(telemetryData: {
  patient_id: string;
  heart_rate?: number;
  systolic_bp?: number;
  diastolic_bp?: number;
  spo2?: number;
  steps?: number;
}) {
  const url = `${VITALHEALTH_CONFIG.API_BASE_URL}${VITALHEALTH_CONFIG.ENDPOINTS.TELEMETRY_STREAM}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      user_id: telemetryData.patient_id,
      heart_rate: telemetryData.heart_rate,
      systolic_bp: telemetryData.systolic_bp,
      diastolic_bp: telemetryData.diastolic_bp,
      spo2: telemetryData.spo2,
      steps: telemetryData.steps,
    }),
  });

  return await response.json();
}
