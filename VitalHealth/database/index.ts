// database/index.ts
// ─── Canonical single SQLite connection for the entire VitalHealth app ────────
// All database modules import { db } from here instead of calling
// openDatabaseSync on their own.  This means every table lives inside
// one file: vital_health.db — making backup / restore trivially simple.

import * as SQLite from "expo-sqlite";

export const db = SQLite.openDatabaseSync("vital_health.db");

// ── Convenience wrappers (same API as before, just re-exported) ───────────────
export const run = (sql: string, params: any[] = []) => db.runAsync(sql, params);
export const get = (sql: string, params: any[] = []) => db.getFirstAsync(sql, params);
export const all = (sql: string, params: any[] = []) => db.getAllAsync(sql, params);
