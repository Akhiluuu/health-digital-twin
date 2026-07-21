// database/pieDB.ts
// ─────────────────────────────────────────────────────────────────────────────
// SQLite persistence for the Personal Intelligence Engine (PIE)
// Tables: pie_persona, pie_audit_log, pie_interaction_signals, pie_rule_state
// ─────────────────────────────────────────────────────────────────────────────

import { db } from './index';
import { log, error as logError } from '../utils/logger';
import type { PIEAuditEntry, PIEInteractionSignal, PersonaModel } from '../services/pie/types';

// ─────────────────────────────────────────────────────────────────────────────
// Schema migration (called by initAllTables in schema.ts addendum)
// ─────────────────────────────────────────────────────────────────────────────

export async function initPIETables(): Promise<void> {
  try {
    await db.execAsync(`
      -- ── PIE Persona snapshot (one row per user, overwritten on each compute) ──
      CREATE TABLE IF NOT EXISTS pie_persona (
        uid                       TEXT PRIMARY KEY NOT NULL,
        archetypes_json           TEXT NOT NULL DEFAULT '[]',
        primary_archetype         TEXT NOT NULL DEFAULT 'unknown',
        age_years                 REAL,
        gender                    TEXT,
        conditions_json           TEXT NOT NULL DEFAULT '[]',
        medication_adherence_rate REAL,
        avg_daily_steps           REAL,
        avg_hydration_ml          REAL,
        last_simulation_at        TEXT,
        last_cognitive_at         TEXT,
        last_med_log_at           TEXT,
        last_active_at            TEXT,
        notification_open_rate    REAL,
        avg_response_delay_ms     REAL,
        computed_at               TEXT NOT NULL
      );

      -- ── PIE audit log (every candidate decision recorded) ─────────────────────
      CREATE TABLE IF NOT EXISTS pie_audit_log (
        id                  TEXT PRIMARY KEY NOT NULL,
        candidate_id        TEXT NOT NULL,
        profile_id          TEXT NOT NULL,
        category            TEXT NOT NULL,
        priority            TEXT NOT NULL,
        title               TEXT NOT NULL,
        decision            TEXT NOT NULL,
        reject_reason       TEXT,
        source_engine_id    TEXT NOT NULL,
        trigger_rule_id     TEXT NOT NULL,
        trigger_data        TEXT NOT NULL DEFAULT '{}',
        delivered_via       TEXT,
        evaluated_at        TEXT NOT NULL
      );

      -- ── PIE interaction signals (learning engine source of truth) ─────────────
      CREATE TABLE IF NOT EXISTS pie_interaction_signals (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        candidate_id    TEXT NOT NULL,
        profile_id      TEXT NOT NULL,
        interaction     TEXT NOT NULL,
        delay_ms        REAL,
        interacted_at   TEXT NOT NULL
      );

      -- ── PIE rule state (tracks per-rule cooldown + dedup) ────────────────────
      CREATE TABLE IF NOT EXISTS pie_rule_state (
        rule_id         TEXT NOT NULL,
        profile_id      TEXT NOT NULL,
        last_fired_at   TEXT,
        fire_count      INTEGER DEFAULT 0,
        suppressed_until TEXT,
        PRIMARY KEY (rule_id, profile_id)
      );

      -- ── PIE daily brief state (tracks if brief was sent today) ───────────────
      CREATE TABLE IF NOT EXISTS pie_brief_state (
        profile_id      TEXT NOT NULL,
        brief_type      TEXT NOT NULL,   -- 'morning' | 'evening' | 'weekly'
        sent_at         TEXT NOT NULL,
        PRIMARY KEY (profile_id, brief_type)
      );
    `);
    log('[PIE DB] Tables initialised');
  } catch (err) {
    logError('[PIE DB] initPIETables error:', err);
    // Non-fatal — app continues without PIE persistence
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Persona persistence
// ─────────────────────────────────────────────────────────────────────────────

export async function savePersonaToDB(persona: PersonaModel): Promise<void> {
  try {
    await db.runAsync(
      `INSERT OR REPLACE INTO pie_persona (
        uid, archetypes_json, primary_archetype, age_years, gender,
        conditions_json, medication_adherence_rate, avg_daily_steps,
        avg_hydration_ml, last_simulation_at, last_cognitive_at,
        last_med_log_at, last_active_at, notification_open_rate,
        avg_response_delay_ms, computed_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        persona.uid,
        JSON.stringify(persona.archetypes),
        persona.primaryArchetype,
        persona.ageYears,
        persona.gender,
        JSON.stringify(persona.conditions),
        persona.medicationAdherenceRate,
        persona.averageDailySteps,
        persona.averageHydrationMl,
        persona.lastSimulationAt,
        persona.lastCognitiveSessionAt,
        persona.lastMedLogAt,
        persona.lastActiveAt,
        persona.notificationOpenRate,
        persona.averageResponseDelayMs,
        persona.computedAt,
      ]
    );
  } catch (err) {
    logError('[PIE DB] savePersonaToDB error:', err);
  }
}

export async function loadPersonaFromDB(uid: string): Promise<PersonaModel | null> {
  try {
    const row = (await db.getFirstAsync(
      `SELECT * FROM pie_persona WHERE uid = ?`,
      [uid]
    )) as any;
    if (!row) return null;
    return {
      uid: row.uid,
      archetypes: JSON.parse(row.archetypes_json || '[]'),
      primaryArchetype: row.primary_archetype,
      ageYears: row.age_years,
      gender: row.gender,
      conditions: JSON.parse(row.conditions_json || '[]'),
      hasDiabetes: (JSON.parse(row.conditions_json || '[]') as string[]).some(c => c.toLowerCase().includes('diabet')),
      hasHypertension: (JSON.parse(row.conditions_json || '[]') as string[]).some(c => c.toLowerCase().includes('hypert')),
      isElderly: row.age_years != null && row.age_years >= 65,
      isCaregiver: false, // re-derived on each compute
      medicationAdherenceRate: row.medication_adherence_rate,
      averageDailySteps: row.avg_daily_steps,
      averageSleepHours: null,
      averageHydrationMl: row.avg_hydration_ml,
      lastSimulationAt: row.last_simulation_at,
      lastCognitiveSessionAt: row.last_cognitive_at,
      lastMedLogAt: row.last_med_log_at,
      lastActiveAt: row.last_active_at,
      notificationOpenRate: row.notification_open_rate,
      averageResponseDelayMs: row.avg_response_delay_ms,
      computedAt: row.computed_at,
    };
  } catch (err) {
    logError('[PIE DB] loadPersonaFromDB error:', err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit log
// ─────────────────────────────────────────────────────────────────────────────

export async function recordPIEAuditEntry(entry: PIEAuditEntry): Promise<void> {
  try {
    await db.runAsync(
      `INSERT OR REPLACE INTO pie_audit_log (
        id, candidate_id, profile_id, category, priority, title,
        decision, reject_reason, source_engine_id, trigger_rule_id,
        trigger_data, delivered_via, evaluated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        entry.id,
        entry.candidateId,
        entry.profileId,
        entry.category,
        entry.priority,
        entry.title,
        entry.decision,
        entry.rejectReason,
        entry.sourceEngineId,
        entry.triggerRuleId,
        entry.triggerData,
        entry.deliveredViaChannel,
        entry.evaluatedAt,
      ]
    );
  } catch (err) {
    logError('[PIE DB] recordPIEAuditEntry error:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Interaction signals (Learning Engine source)
// ─────────────────────────────────────────────────────────────────────────────

export async function recordInteractionSignal(signal: PIEInteractionSignal): Promise<void> {
  try {
    await db.runAsync(
      `INSERT INTO pie_interaction_signals
        (candidate_id, profile_id, interaction, delay_ms, interacted_at)
       VALUES (?,?,?,?,?)`,
      [signal.candidateId, signal.profileId, signal.interaction, signal.delayMs, signal.interactedAt]
    );
  } catch (err) {
    logError('[PIE DB] recordInteractionSignal error:', err);
  }
}

export async function getInteractionSignals(profileId: string, limitDays = 30): Promise<PIEInteractionSignal[]> {
  try {
    const cutoff = new Date(Date.now() - limitDays * 86400_000).toISOString();
    const rows = (await db.getAllAsync(
      `SELECT * FROM pie_interaction_signals
       WHERE profile_id = ? AND interacted_at >= ?
       ORDER BY interacted_at DESC`,
      [profileId, cutoff]
    )) as any[];
    return rows.map((r: any) => ({
      candidateId: r.candidate_id,
      profileId: r.profile_id,
      interaction: r.interaction,
      delayMs: r.delay_ms,
      interactedAt: r.interacted_at,
    }));
  } catch (err) {
    logError('[PIE DB] getInteractionSignals error:', err);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rule state (cooldown + deduplication)
// ─────────────────────────────────────────────────────────────────────────────

export async function getRuleState(ruleId: string, profileId: string) {
  try {
    return (await db.getFirstAsync(
      `SELECT * FROM pie_rule_state WHERE rule_id = ? AND profile_id = ?`,
      [ruleId, profileId]
    )) as any;
  } catch {
    return null;
  }
}

export async function updateRuleState(
  ruleId: string,
  profileId: string,
  suppressUntil: string | null = null
): Promise<void> {
  try {
    await db.runAsync(
      `INSERT INTO pie_rule_state (rule_id, profile_id, last_fired_at, fire_count, suppressed_until)
       VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(rule_id, profile_id) DO UPDATE SET
         last_fired_at    = excluded.last_fired_at,
         fire_count       = fire_count + 1,
         suppressed_until = excluded.suppressed_until`,
      [ruleId, profileId, new Date().toISOString(), suppressUntil]
    );
  } catch (err) {
    logError('[PIE DB] updateRuleState error:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Brief state (prevents duplicate morning/evening briefs)
// ─────────────────────────────────────────────────────────────────────────────

export async function wasBriefSentToday(profileId: string, briefType: 'morning' | 'evening' | 'weekly'): Promise<boolean> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const row = (await db.getFirstAsync(
      `SELECT sent_at FROM pie_brief_state WHERE profile_id = ? AND brief_type = ?`,
      [profileId, briefType]
    )) as any;
    if (!row) return false;
    return String(row.sent_at).slice(0, 10) === today;
  } catch {
    return false;
  }
}

export async function markBriefSent(profileId: string, briefType: 'morning' | 'evening' | 'weekly'): Promise<void> {
  try {
    await db.runAsync(
      `INSERT OR REPLACE INTO pie_brief_state (profile_id, brief_type, sent_at) VALUES (?,?,?)`,
      [profileId, briefType, new Date().toISOString()]
    );
  } catch (err) {
    logError('[PIE DB] markBriefSent error:', err);
  }
}
