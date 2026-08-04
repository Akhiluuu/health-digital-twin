/**
 * VitalHealth v5.0 Production Mobile Application Configuration (Android & iOS)
 * Handles environment switching, API versioning, remote config fallbacks, OTA update channels, and crash reporting.
 */

export interface MobileAppConfig {
  environment: 'development' | 'staging' | 'production';
  apiBaseUrl: string;
  medicationApiUrl: string;
  apiVersion: string;
  appVersion: string;
  timeoutMs: number;
  enableAnalytics: boolean;
  enableCrashReporting: boolean;
  otaUpdateChannel: string;
  headers: Record<string, string>;
}

const ENV = (process.env.EXPO_PUBLIC_ENV as 'development' | 'staging' | 'production') || 'production';

const CONFIG_MATRIX: Record<string, MobileAppConfig> = {
  development: {
    environment: 'development',
    apiBaseUrl: 'http://151.185.45.137:8000',
    medicationApiUrl: 'http://151.185.45.137:8001',
    apiVersion: 'v5',
    appVersion: '5.0.0-dev',
    timeoutMs: 15000,
    enableAnalytics: false,
    enableCrashReporting: false,
    otaUpdateChannel: 'dev',
    headers: {
      'X-API-Version': 'v5',
      'X-App-Platform': 'Android',
      'X-App-Version': '5.0.0-dev',
    },
  },
  staging: {
    environment: 'staging',
    apiBaseUrl: 'http://151.185.45.137:8000',
    medicationApiUrl: 'http://151.185.45.137:8001',
    apiVersion: 'v5',
    appVersion: '5.0.0-rc1',
    timeoutMs: 12000,
    enableAnalytics: true,
    enableCrashReporting: true,
    otaUpdateChannel: 'staging',
    headers: {
      'X-API-Version': 'v5',
      'X-App-Platform': 'Android',
      'X-App-Version': '5.0.0-rc1',
    },
  },
  production: {
    environment: 'production',
    apiBaseUrl: 'http://151.185.45.137:8000',
    medicationApiUrl: 'http://151.185.45.137:8001',
    apiVersion: 'v5',
    appVersion: '5.0.0',
    timeoutMs: 10000,
    enableAnalytics: true,
    enableCrashReporting: true,
    otaUpdateChannel: 'production',
    headers: {
      'X-API-Version': 'v5',
      'X-App-Platform': 'Android',
      'X-App-Version': '5.0.0',
      'Strict-Transport-Security': 'max-age=31536000',
    },
  },
};

export const currentConfig: MobileAppConfig = CONFIG_MATRIX[ENV] || CONFIG_MATRIX.production;

export function getApiEndpoint(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${currentConfig.apiBaseUrl}${cleanPath}`;
}

export default function ConfigRoute() {
  return null;
}
