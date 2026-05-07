// database/historySchema.ts
// Uses the unified vital_health.db — table is created by initAllTables in schema.ts

import { db } from "./index";

/**
 * Initialises History table.
 * No-op if initAllTables() was already called at app startup (table already exists).
 */
export const initHistoryTable = async (): Promise<void> => {
  try {
    // Table is created by initAllTables(). This is kept as a safe fallback.
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS history (
        id          TEXT PRIMARY KEY NOT NULL,
        title       TEXT,
        description TEXT,
        date        TEXT,
        time        TEXT,
        year        TEXT,
        type        TEXT,
        value       TEXT,
        unit        TEXT,
        doctor      TEXT,
        location    TEXT,
        attachments TEXT
      );
    `);
    console.log("History table ready (shared vital_health.db)");
  } catch (error) {
    console.error("History table error:", error);
    throw error;
  }
};
