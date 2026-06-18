// database/schema.ts
// ─── Unified schema initialiser ───────────────────────────────────────────────
// Replaces four separate schema files.  All tables live in vital_health.db.
// Call initAllTables() once at app startup (e.g. in _layout.tsx).

import { db } from "./index";

export { db };

// ── Version tracking so future migrations know the current schema ─────────────
// v4: Added takenDate column directly to medicines schema (was previously added
//     only via ALTER TABLE in initMedicineDB, which was not authoritative)
const SCHEMA_VERSION = 4;

export const initAllTables = async (): Promise<void> => {
  try {
    // ── Core transaction: create all tables atomically ────────────────────────
    await db.execAsync(`
      PRAGMA journal_mode=WAL;

      -- ── Schema version tracking ─────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS db_meta (
        key   TEXT PRIMARY KEY NOT NULL,
        value TEXT
      );

      -- ── Medicines ───────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS medicines (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        name           TEXT,
        dose           TEXT,
        type           TEXT,
        time           TEXT,
        timestamp      INTEGER,
        meal           TEXT,
        frequency      TEXT,
        startDate      TEXT,
        endDate        TEXT,
        reminder       INTEGER,
        notificationId TEXT,
        taken          INTEGER DEFAULT 0,
        takenDate      TEXT DEFAULT NULL
      );

      -- ── Medicine history ────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS medicine_history (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        medicineId TEXT,
        takenAt    TEXT
      );

      -- ── Hydration ───────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS hydration (
        date   TEXT PRIMARY KEY,
        amount INTEGER
      );

      -- ── Hydration history (per-entry log for charts) ────────────────────────
      CREATE TABLE IF NOT EXISTS hydration_history (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        amount    INTEGER NOT NULL,
        total     INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        source    TEXT DEFAULT 'manual'
      );

      -- ── Symptoms ────────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS symptoms (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        categoryId     TEXT NOT NULL,
        optionId       TEXT NOT NULL,
        name           TEXT NOT NULL,
        severity       TEXT NOT NULL,
        startedAt      INTEGER NOT NULL,
        active         INTEGER DEFAULT 1,
        followupTime   INTEGER,
        resolvedAt     INTEGER,
        notes          TEXT,
        followUpAnswers TEXT
      );

      -- ── Medical history records (documents, visits, labs) ──────────────────
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

      -- ── User profile (local mirror of Firebase doc) ─────────────────────────
      CREATE TABLE IF NOT EXISTS user_profile (
        uid                 TEXT PRIMARY KEY,
        firstName           TEXT,
        lastName            TEXT,
        inviteCode          TEXT,
        bloodGroup          TEXT,
        gender              TEXT,
        dateOfBirth         TEXT,
        height              REAL,
        weight              REAL,
        phone               TEXT,
        profileImage        TEXT,
        registered_at       TEXT,
        biogears_registered INTEGER DEFAULT 0,
        biogears_user_id    TEXT
      );

      -- ── BioGears simulation history (last known vitals per run) ─────────────
      CREATE TABLE IF NOT EXISTS simulation_history (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        uid              TEXT    NOT NULL,
        session_id       TEXT    UNIQUE,
        heart_rate       REAL,
        blood_pressure   TEXT,
        glucose          REAL,
        respiration      REAL,
        spo2             REAL,
        core_temperature REAL,
        cardiac_output   REAL,
        map              REAL,
        stroke_volume    REAL,
        tidal_volume     REAL,
        arterial_ph      REAL,
        exercise_level   REAL,
        has_anomaly      INTEGER DEFAULT 0,
        anomaly_labels   TEXT,
        run_at           TEXT    NOT NULL
      );

      -- ── Backup metadata ─────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS backup_meta (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        backup_at      TEXT    NOT NULL,
        drive_file_id  TEXT,
        status         TEXT DEFAULT 'success',
        size_bytes     INTEGER
      );
    `);

    // Migrate simulation_history table for older installations
    try {
      await db.execAsync("ALTER TABLE simulation_history ADD COLUMN map REAL;");
    } catch (_) {}
    try {
      await db.execAsync("ALTER TABLE simulation_history ADD COLUMN stroke_volume REAL;");
    } catch (_) {}
    try {
      await db.execAsync("ALTER TABLE simulation_history ADD COLUMN tidal_volume REAL;");
    } catch (_) {}
    try {
      await db.execAsync("ALTER TABLE simulation_history ADD COLUMN arterial_ph REAL;");
    } catch (_) {}
    try {
      await db.execAsync("ALTER TABLE simulation_history ADD COLUMN exercise_level REAL;");
    } catch (_) {}

    // ── Write schema version ─────────────────────────────────────────────────
    await db.runAsync(
      `INSERT OR REPLACE INTO db_meta (key, value) VALUES (?, ?)`,
      ["schema_version", String(SCHEMA_VERSION)]
    );

    console.log("✅ VitalHealth DB — all tables initialised (v" + SCHEMA_VERSION + ")");
  } catch (error) {
    console.error("❌ initAllTables error:", error);
    throw error;
  }
};

// ── Legacy alias: kept so any existing import of initDB still works ───────────
export const initDB = initAllTables;

export const clearAllSqliteTables = async (): Promise<void> => {
  try {
    await db.execAsync(`
      DELETE FROM medicines;
      DELETE FROM medicine_history;
      DELETE FROM hydration;
      DELETE FROM hydration_history;
      DELETE FROM symptoms;
      DELETE FROM history;
      DELETE FROM user_profile;
      DELETE FROM simulation_history;
      DELETE FROM backup_meta;
    `);
    console.log("🧹 Cleared all SQLite database tables");
  } catch (error) {
    console.error("❌ Failed to clear SQLite database tables:", error);
  }
};
