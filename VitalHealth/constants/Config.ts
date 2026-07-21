// constants/Config.ts
// Central environment configuration for VitalHealth

import AsyncStorage from "@react-native-async-storage/async-storage";

// Environment variables are bundled into the app via EXPO_PUBLIC_* prefix
const BUNDLED_BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// conceptional environments
export type AppEnvironment = "development" | "testing" | "production";

export function getAppEnvironment(): AppEnvironment {
  // If NODE_ENV is production but we are pointing to the testing IP, it is staging/testing
  if (BUNDLED_BACKEND_URL?.includes("151.185.45.137")) {
    return "testing";
  }
  if (!__DEV__ && BUNDLED_BACKEND_URL && !BUNDLED_BACKEND_URL.includes("151.185.45.137")) {
    return "production";
  }
  return "development";
}

// Default fallbacks per environment
const DEFAULTS = {
  development: "http://10.172.0.79:8000",
  testing: "http://151.185.45.137",
  production: "https://REQUIRED_PRODUCTION_HTTPS_DOMAIN", // Obvious placeholder for future launch
};

export const BASE_URL_KEY = "@biogears_base_url";
export const HEARTRATE_URL_KEY = "@heartrate_base_url";
export const MED_API_URL_KEY = "@medication_api_url";

/** Get the configured BioGears base URL with environment and AsyncStorage fallbacks */
export async function getCentralBiogearsBaseUrl(): Promise<string> {
  const env = getAppEnvironment();
  
  // In production builds, we strictly use the bundled environment variable
  if (env === "production") {
    return BUNDLED_BACKEND_URL || DEFAULTS.production;
  }
  
  // In testing/staging builds, we default to the VM IP, but let testers override in settings if needed
  try {
    const stored = await AsyncStorage.getItem(BASE_URL_KEY);
    if (stored) return stored;
  } catch {}
  
  return BUNDLED_BACKEND_URL || DEFAULTS.testing;
}

/** Get the configured Heart Rate base URL */
export async function getCentralHeartRateBaseUrl(): Promise<string> {
  const env = getAppEnvironment();
  
  if (env === "production") {
    return `${BUNDLED_BACKEND_URL || DEFAULTS.production}:5000`;
  }
  
  try {
    const stored = await AsyncStorage.getItem(HEARTRATE_URL_KEY);
    if (stored) return stored;
  } catch {}
  
  const base = BUNDLED_BACKEND_URL || DEFAULTS.testing;
  try {
    const u = new URL(base);
    return `${u.protocol}//${u.hostname}:5000`;
  } catch {
    return `${base}:5000`;
  }
}

/** Get the Medication API base URL */
export async function getCentralMedApiUrl(): Promise<string> {
  const env = getAppEnvironment();
  
  if (env === "production") {
    return `${BUNDLED_BACKEND_URL || DEFAULTS.production}/medication`;
  }
  
  try {
    const stored = await AsyncStorage.getItem(MED_API_URL_KEY);
    if (stored) return stored;
  } catch {}
  
  const base = BUNDLED_BACKEND_URL || DEFAULTS.testing;
  return `${base}/medication`;
}

/** Get the AI/Dr. Aria API base URL */
export async function getCentralAiBaseUrl(): Promise<string> {
  const base = await getCentralBiogearsBaseUrl();
  return `${base}/ai`;
}
