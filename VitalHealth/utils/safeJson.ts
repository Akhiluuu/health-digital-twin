// utils/safeJson.ts
// ─────────────────────────────────────────────────────────────────────────────
// Production-grade safe JSON utilities — prevents crashes from malformed data
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Safely parse JSON — never throws. Returns fallback on any error.
 */
export function safeJsonParse<T = any>(raw: string | null | undefined, fallback: T): T {
  if (raw == null || raw === '' || raw === 'undefined' || raw === 'null') return fallback;
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || parsed === undefined) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

/**
 * Safely stringify JSON — never throws. Returns '' on error.
 */
export function safeJsonStringify(value: any): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
}

/**
 * Safely access a nested property path without crashing on null/undefined.
 * e.g. safeGet(obj, 'a.b.c', 0)
 */
export function safeGet<T>(obj: any, path: string, fallback: T): T {
  try {
    const keys = path.split('.');
    let current = obj;
    for (const key of keys) {
      if (current == null) return fallback;
      current = current[key];
    }
    return (current == null ? fallback : current) as T;
  } catch {
    return fallback;
  }
}

/**
 * Safely parse a number from any value. Returns fallback on NaN/null/undefined.
 */
export function safeNumber(value: any, fallback = 0): number {
  if (value == null) return fallback;
  const n = Number(value);
  return isFinite(n) ? n : fallback;
}

/**
 * Safely parse an integer from any value.
 */
export function safeInt(value: any, fallback = 0): number {
  if (value == null) return fallback;
  const n = parseInt(String(value), 10);
  return isNaN(n) ? fallback : n;
}

/**
 * Safely ensure a value is an array. Returns [] if not an array.
 */
export function safeArray<T>(value: any): T[] {
  if (Array.isArray(value)) return value as T[];
  return [];
}

/**
 * Safely ensure a value is a string.
 */
export function safeString(value: any, fallback = ''): string {
  if (value == null) return fallback;
  if (typeof value === 'string') return value;
  try { return String(value); } catch { return fallback; }
}
