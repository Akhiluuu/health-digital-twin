"""
medication_service/database/migrations.py
Full PostgreSQL schema for Medication Vault — normalized, indexed, audited, HIPAA-style.
Run via: python -m medication_service.database.migrations
"""

MIGRATION_SQL = """
-- ═══════════════════════════════════════════════════════════════
-- EXTENSIONS
-- ═══════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ═══════════════════════════════════════════════════════════════
-- ENUMS
-- ═══════════════════════════════════════════════════════════════
DO $$ BEGIN
    CREATE TYPE medication_status AS ENUM ('active','paused','discontinued','archived','completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE dose_status AS ENUM ('pending','taken','missed','skipped','late','rescheduled','deleted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE frequency_type AS ENUM ('once','daily','twice_daily','three_times','every_x_hours','weekly','monthly','prn','custom_rrule');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE interaction_severity AS ENUM ('none','minor','moderate','major','contraindicated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE priority_level AS ENUM ('critical','important','optional');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE dosage_form AS ENUM ('tablet','capsule','injection','drops','inhaler','syrup','patch','cream','suppository','powder','solution');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE report_format AS ENUM ('pdf','csv','fhir_json','hl7_v2','excel');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE caregiver_permission AS ENUM ('read_only','log_doses','full_access','emergency_only');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══════════════════════════════════════════════════════════════
-- HELPER: standard audit columns macro (applied via ALTER)
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- TABLE: drug_database (clinically reviewed master drug list)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS drug_database (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    brand_name          VARCHAR(255) NOT NULL,
    generic_name        VARCHAR(255) NOT NULL,
    atc_code            VARCHAR(20),
    ndc_code            VARCHAR(20),
    rxcui               VARCHAR(20),
    drug_class          VARCHAR(100),
    mechanism           TEXT,
    indications         JSONB DEFAULT '[]',
    contraindications   JSONB DEFAULT '[]',
    side_effects        JSONB DEFAULT '[]',
    warnings            TEXT,
    storage_conditions  VARCHAR(255),
    dosage_forms        JSONB DEFAULT '[]',
    standard_strengths  JSONB DEFAULT '[]',
    bioavailability_pct NUMERIC(5,2),
    half_life_hours     NUMERIC(8,2),
    protein_binding_pct NUMERIC(5,2),
    renal_adjustment    BOOLEAN DEFAULT FALSE,
    hepatic_adjustment  BOOLEAN DEFAULT FALSE,
    pregnancy_category  VARCHAR(5),
    controlled_substance BOOLEAN DEFAULT FALSE,
    dea_schedule        INTEGER,
    fda_approved        BOOLEAN DEFAULT TRUE,
    reference_sources   JSONB DEFAULT '[]',
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    version             INTEGER DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_drug_db_generic ON drug_database(LOWER(generic_name));
CREATE INDEX IF NOT EXISTS idx_drug_db_rxcui ON drug_database(rxcui);
CREATE INDEX IF NOT EXISTS idx_drug_db_atc ON drug_database(atc_code);

-- ═══════════════════════════════════════════════════════════════
-- TABLE: drug_interactions
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS drug_interactions (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    drug_a_id           UUID REFERENCES drug_database(id) ON DELETE CASCADE,
    drug_b_id           UUID REFERENCES drug_database(id) ON DELETE CASCADE,
    drug_a_name         VARCHAR(255) NOT NULL,
    drug_b_name         VARCHAR(255) NOT NULL,
    severity            interaction_severity NOT NULL DEFAULT 'minor',
    mechanism           TEXT,
    clinical_effect     TEXT,
    management          TEXT,
    contraindicated     BOOLEAN DEFAULT FALSE,
    confidence_score    NUMERIC(3,2) DEFAULT 0.80,
    reference_sources   JSONB DEFAULT '[]',
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT drug_interactions_unique UNIQUE(drug_a_id, drug_b_id)
);
CREATE INDEX IF NOT EXISTS idx_drug_int_a ON drug_interactions(drug_a_id);
CREATE INDEX IF NOT EXISTS idx_drug_int_b ON drug_interactions(drug_b_id);
CREATE INDEX IF NOT EXISTS idx_drug_int_severity ON drug_interactions(severity);

-- ═══════════════════════════════════════════════════════════════
-- TABLE: food_interactions
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS food_interactions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    drug_id         UUID REFERENCES drug_database(id) ON DELETE CASCADE,
    drug_name       VARCHAR(255) NOT NULL,
    food_item       VARCHAR(255) NOT NULL,
    severity        interaction_severity NOT NULL,
    effect          TEXT,
    recommendation  TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_food_int_drug ON food_interactions(drug_id);

-- ═══════════════════════════════════════════════════════════════
-- TABLE: doctors
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS doctors (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         VARCHAR(255) NOT NULL,
    full_name       VARCHAR(255) NOT NULL,
    specialty       VARCHAR(100),
    hospital        VARCHAR(255),
    phone           VARCHAR(30),
    email           VARCHAR(255),
    license_number  VARCHAR(50),
    npi_number      VARCHAR(20),
    address         TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      VARCHAR(255),
    version         INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_doctors_user ON doctors(user_id) WHERE deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════
-- TABLE: medicines (active medication vault)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS medicines (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             VARCHAR(255) NOT NULL,
    profile_id          VARCHAR(255),
    drug_db_id          UUID REFERENCES drug_database(id),
    name                VARCHAR(255) NOT NULL,
    brand_name          VARCHAR(255),
    generic_name        VARCHAR(255),
    strength            VARCHAR(100),
    dosage_form         dosage_form DEFAULT 'tablet',
    dose_quantity       VARCHAR(50) NOT NULL,
    dose_unit           VARCHAR(20) DEFAULT 'tablet',
    frequency           frequency_type NOT NULL DEFAULT 'daily',
    rrule               TEXT,
    scheduled_time      TIME,
    meal_relation       VARCHAR(20) DEFAULT 'after',
    start_date          DATE NOT NULL,
    end_date            DATE,
    is_ongoing          BOOLEAN DEFAULT TRUE,
    status              medication_status DEFAULT 'active',
    priority            priority_level DEFAULT 'important',
    doctor_id           UUID REFERENCES doctors(id),
    doctor_name         VARCHAR(255),
    hospital            VARCHAR(255),
    purpose             TEXT,
    side_effects        TEXT,
    warnings            TEXT,
    storage_conditions  VARCHAR(255),
    color               VARCHAR(20),
    shape               VARCHAR(50),
    disease_linked      VARCHAR(255),
    biogears_linked     BOOLEAN DEFAULT FALSE,
    reminder_enabled    BOOLEAN DEFAULT TRUE,
    notification_id     VARCHAR(255),
    inventory_count     INTEGER DEFAULT 30,
    refill_count        INTEGER DEFAULT 3,
    barcode             VARCHAR(50),
    firebase_synced     BOOLEAN DEFAULT FALSE,
    custom_metadata     JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    created_by          VARCHAR(255),
    modified_by         VARCHAR(255),
    version             INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_medicines_user ON medicines(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_medicines_status ON medicines(user_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_medicines_start_date ON medicines(start_date);
CREATE INDEX IF NOT EXISTS idx_medicines_drug_db ON medicines(drug_db_id);

-- ═══════════════════════════════════════════════════════════════
-- TABLE: medication_doses (generated schedule)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS medication_doses (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    medicine_id     UUID NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
    user_id         VARCHAR(255) NOT NULL,
    scheduled_at    TIMESTAMPTZ NOT NULL,
    taken_at        TIMESTAMPTZ,
    status          dose_status DEFAULT 'pending',
    delay_minutes   INTEGER,
    skip_reason     TEXT,
    notes           TEXT,
    logged_by       VARCHAR(255),
    biogears_sim_id VARCHAR(255),
    vitals_pre      JSONB,
    vitals_post     JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_doses_medicine ON medication_doses(medicine_id);
CREATE INDEX IF NOT EXISTS idx_doses_user_scheduled ON medication_doses(user_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_doses_user_status ON medication_doses(user_id, status);
CREATE INDEX IF NOT EXISTS idx_doses_scheduled_at ON medication_doses(scheduled_at);

-- ═══════════════════════════════════════════════════════════════
-- TABLE: medication_history (append-only event log)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS medication_history (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    medicine_id     UUID REFERENCES medicines(id) ON DELETE SET NULL,
    user_id         VARCHAR(255) NOT NULL,
    medicine_name   VARCHAR(255) NOT NULL,
    dose            VARCHAR(100),
    scheduled_time  VARCHAR(20),
    status          dose_status NOT NULL,
    event_at        TIMESTAMPTZ DEFAULT NOW(),
    reason          TEXT,
    biogears_sim_id VARCHAR(255),
    delta_vitals    JSONB,
    logged_by       VARCHAR(255) DEFAULT 'user',
    metadata        JSONB DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_history_user ON medication_history(user_id, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_medicine ON medication_history(medicine_id, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_status ON medication_history(user_id, status);

-- ═══════════════════════════════════════════════════════════════
-- TABLE: prescriptions
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS prescriptions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         VARCHAR(255) NOT NULL,
    doctor_id       UUID REFERENCES doctors(id),
    doctor_name     VARCHAR(255),
    hospital        VARCHAR(255),
    issue_date      DATE,
    expiry_date     DATE,
    status          VARCHAR(30) DEFAULT 'current',
    summary         TEXT,
    raw_ocr_text    TEXT,
    ocr_confidence  NUMERIC(3,2),
    medicines       JSONB DEFAULT '[]',
    file_url        VARCHAR(500),
    file_name       VARCHAR(255),
    file_mime       VARCHAR(100),
    file_size_bytes INTEGER,
    firebase_path   VARCHAR(500),
    is_verified     BOOLEAN DEFAULT FALSE,
    verified_by     VARCHAR(255),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    created_by      VARCHAR(255),
    version         INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_prescriptions_user ON prescriptions(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_prescriptions_status ON prescriptions(user_id, status);

-- ═══════════════════════════════════════════════════════════════
-- TABLE: inventory
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS inventory (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    medicine_id         UUID NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
    user_id             VARCHAR(255) NOT NULL,
    current_count       INTEGER NOT NULL DEFAULT 0,
    unit                VARCHAR(30) DEFAULT 'tablet',
    batch_number        VARCHAR(50),
    expiry_date         DATE,
    storage_location    VARCHAR(100),
    storage_temp_min_c  NUMERIC(5,2),
    storage_temp_max_c  NUMERIC(5,2),
    reorder_threshold   INTEGER DEFAULT 5,
    refill_count        INTEGER DEFAULT 3,
    unit_cost_usd       NUMERIC(10,2),
    is_generic          BOOLEAN DEFAULT FALSE,
    brand_cost_usd      NUMERIC(10,2),
    pharmacy_name       VARCHAR(255),
    pharmacy_phone      VARCHAR(30),
    last_refill_at      TIMESTAMPTZ,
    next_refill_pred    TIMESTAMPTZ,
    consumption_rate    NUMERIC(6,3),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT inventory_medicine_unique UNIQUE(medicine_id)
);
CREATE INDEX IF NOT EXISTS idx_inventory_user ON inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_inventory_low ON inventory(user_id, current_count) WHERE current_count <= 5;

-- ═══════════════════════════════════════════════════════════════
-- TABLE: refill_requests
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS refill_requests (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    inventory_id    UUID NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
    medicine_id     UUID NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
    user_id         VARCHAR(255) NOT NULL,
    quantity        INTEGER NOT NULL,
    status          VARCHAR(30) DEFAULT 'pending',
    pharmacy        VARCHAR(255),
    notes           TEXT,
    requested_at    TIMESTAMPTZ DEFAULT NOW(),
    fulfilled_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_refill_user ON refill_requests(user_id, status);

-- ═══════════════════════════════════════════════════════════════
-- TABLE: reminders
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS reminders (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    medicine_id         UUID NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
    user_id             VARCHAR(255) NOT NULL,
    scheduled_at        TIMESTAMPTZ NOT NULL,
    dose_id             UUID REFERENCES medication_doses(id),
    channel             VARCHAR(30) DEFAULT 'push',
    status              VARCHAR(30) DEFAULT 'pending',
    acknowledged_at     TIMESTAMPTZ,
    snoozed_until       TIMESTAMPTZ,
    snooze_count        INTEGER DEFAULT 0,
    escalated           BOOLEAN DEFAULT FALSE,
    escalated_at        TIMESTAMPTZ,
    caregiver_notified  BOOLEAN DEFAULT FALSE,
    retry_count         INTEGER DEFAULT 0,
    next_retry_at       TIMESTAMPTZ,
    payload             JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reminders_user_scheduled ON reminders(user_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_reminders_pending ON reminders(status, scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_reminders_medicine ON reminders(medicine_id);

-- ═══════════════════════════════════════════════════════════════
-- TABLE: compliance_logs (daily snapshots per user)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS compliance_logs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             VARCHAR(255) NOT NULL,
    log_date            DATE NOT NULL,
    total_scheduled     INTEGER DEFAULT 0,
    total_taken         INTEGER DEFAULT 0,
    total_missed        INTEGER DEFAULT 0,
    total_skipped       INTEGER DEFAULT 0,
    total_late          INTEGER DEFAULT 0,
    adherence_pct       NUMERIC(5,2),
    avg_delay_minutes   NUMERIC(8,2),
    streak_days         INTEGER DEFAULT 0,
    score               NUMERIC(5,2),
    grade               VARCHAR(5),
    computed_at         TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT compliance_user_date_unique UNIQUE(user_id, log_date)
);
CREATE INDEX IF NOT EXISTS idx_compliance_user_date ON compliance_logs(user_id, log_date DESC);

-- ═══════════════════════════════════════════════════════════════
-- TABLE: biogears_medication_simulations
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS biogears_medication_simulations (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                 VARCHAR(255) NOT NULL,
    medicine_id             UUID REFERENCES medicines(id) ON DELETE SET NULL,
    dose_id                 UUID REFERENCES medication_doses(id) ON DELETE SET NULL,
    biogears_job_id         VARCHAR(255),
    simulation_type         VARCHAR(50) DEFAULT 'medication_dose',
    substance_name          VARCHAR(255),
    dose_value              NUMERIC(10,4),
    dose_unit               VARCHAR(20),
    vitals_pre              JSONB,
    vitals_post             JSONB,
    expected_response       JSONB,
    measured_response       JSONB,
    deviation_pct           NUMERIC(6,2),
    confidence_score        NUMERIC(3,2),
    simulation_params       JSONB DEFAULT '{}',
    sim_duration_seconds    INTEGER,
    status                  VARCHAR(30) DEFAULT 'queued',
    error_message           TEXT,
    started_at              TIMESTAMPTZ,
    completed_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_biogears_sim_user ON biogears_medication_simulations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_biogears_sim_medicine ON biogears_medication_simulations(medicine_id);
CREATE INDEX IF NOT EXISTS idx_biogears_sim_status ON biogears_medication_simulations(status);

-- ═══════════════════════════════════════════════════════════════
-- TABLE: analytics_snapshots
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS analytics_snapshots (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         VARCHAR(255) NOT NULL,
    period          VARCHAR(20) NOT NULL,
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    data            JSONB NOT NULL DEFAULT '{}',
    computed_at     TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT analytics_user_period_unique UNIQUE(user_id, period, period_start)
);
CREATE INDEX IF NOT EXISTS idx_analytics_user ON analytics_snapshots(user_id, period, period_start DESC);

-- ═══════════════════════════════════════════════════════════════
-- TABLE: emergency_profiles
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS emergency_profiles (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             VARCHAR(255) NOT NULL UNIQUE,
    blood_group         VARCHAR(10),
    allergies           JSONB DEFAULT '[]',
    critical_medicines  JSONB DEFAULT '[]',
    medical_conditions  JSONB DEFAULT '[]',
    emergency_contacts  JSONB DEFAULT '[]',
    qr_token            VARCHAR(64) UNIQUE,
    offline_package     JSONB DEFAULT '{}',
    last_updated        TIMESTAMPTZ DEFAULT NOW(),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_emergency_user ON emergency_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_emergency_qr ON emergency_profiles(qr_token);

-- ═══════════════════════════════════════════════════════════════
-- TABLE: family_caregivers
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS family_caregivers (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_user_id       VARCHAR(255) NOT NULL,
    caregiver_user_id   VARCHAR(255) NOT NULL,
    caregiver_name      VARCHAR(255),
    relationship        VARCHAR(100),
    permission          caregiver_permission DEFAULT 'read_only',
    consent_given       BOOLEAN DEFAULT FALSE,
    consent_given_at    TIMESTAMPTZ,
    active              BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT family_caregivers_unique UNIQUE(owner_user_id, caregiver_user_id)
);
CREATE INDEX IF NOT EXISTS idx_caregivers_owner ON family_caregivers(owner_user_id) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_caregivers_caregiver ON family_caregivers(caregiver_user_id) WHERE active = TRUE;

-- ═══════════════════════════════════════════════════════════════
-- TABLE: achievements
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS achievements (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         VARCHAR(255) NOT NULL,
    badge_id        VARCHAR(50) NOT NULL,
    badge_name      VARCHAR(100),
    description     TEXT,
    earned_at       TIMESTAMPTZ DEFAULT NOW(),
    metadata        JSONB DEFAULT '{}',
    CONSTRAINT achievements_user_badge UNIQUE(user_id, badge_id)
);
CREATE INDEX IF NOT EXISTS idx_achievements_user ON achievements(user_id);

-- ═══════════════════════════════════════════════════════════════
-- TABLE: reports
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS reports (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         VARCHAR(255) NOT NULL,
    report_type     VARCHAR(50) NOT NULL,
    format          report_format NOT NULL DEFAULT 'pdf',
    title           VARCHAR(255),
    period_start    DATE,
    period_end      DATE,
    file_url        VARCHAR(500),
    firebase_path   VARCHAR(500),
    file_size_bytes INTEGER,
    status          VARCHAR(20) DEFAULT 'pending',
    generated_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    metadata        JSONB DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_reports_user ON reports(user_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- TABLE: audit_trail (immutable append-only PHI log)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS medication_audit_trail (
    id              BIGSERIAL PRIMARY KEY,
    event_at        TIMESTAMPTZ DEFAULT NOW(),
    user_id         VARCHAR(255) NOT NULL,
    actor_id        VARCHAR(255) NOT NULL,
    action          VARCHAR(100) NOT NULL,
    resource_type   VARCHAR(50),
    resource_id     UUID,
    ip_address      VARCHAR(50),
    user_agent      TEXT,
    request_id      VARCHAR(64),
    old_value       JSONB,
    new_value       JSONB,
    success         BOOLEAN DEFAULT TRUE,
    error_message   TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON medication_audit_trail(user_id, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON medication_audit_trail(resource_type, resource_id);

-- ═══════════════════════════════════════════════════════════════
-- TABLE: notification_log
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS notification_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         VARCHAR(255) NOT NULL,
    reminder_id     UUID REFERENCES reminders(id) ON DELETE SET NULL,
    channel         VARCHAR(30) NOT NULL,
    title           VARCHAR(255),
    body            TEXT,
    status          VARCHAR(20) DEFAULT 'sent',
    sent_at         TIMESTAMPTZ DEFAULT NOW(),
    delivered_at    TIMESTAMPTZ,
    read_at         TIMESTAMPTZ,
    error           TEXT
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notification_log(user_id, sent_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- TABLE: settings
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS medication_settings (
    user_id                     VARCHAR(255) PRIMARY KEY,
    voice_alarms_enabled        BOOLEAN DEFAULT TRUE,
    biometric_confirm           BOOLEAN DEFAULT FALSE,
    caregiver_escalation        BOOLEAN DEFAULT TRUE,
    escalation_delay_minutes    INTEGER DEFAULT 30,
    travel_mode                 BOOLEAN DEFAULT FALSE,
    timezone                    VARCHAR(50) DEFAULT 'UTC',
    snooze_limit                INTEGER DEFAULT 3,
    cloud_sync_enabled          BOOLEAN DEFAULT TRUE,
    push_backup_enabled         BOOLEAN DEFAULT TRUE,
    notification_sound          VARCHAR(50) DEFAULT 'default',
    reminder_advance_minutes    INTEGER DEFAULT 5,
    low_stock_threshold         INTEGER DEFAULT 5,
    updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- TRIGGERS: updated_at auto-update
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['medicines','doctors','prescriptions','reminders','compliance_logs','family_caregivers','medication_settings']
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_updated_at_%s ON %s', tbl, tbl);
        EXECUTE format('CREATE TRIGGER trg_updated_at_%s BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION set_updated_at()', tbl, tbl);
    END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- TRIGGER: inventory auto-decrement on dose taken
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION decrement_inventory_on_dose()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'taken' AND OLD.status != 'taken' THEN
        UPDATE inventory SET current_count = GREATEST(0, current_count - 1),
            consumption_rate = (SELECT COUNT(*) FROM medication_doses
                WHERE medicine_id = NEW.medicine_id AND status = 'taken'
                AND taken_at >= NOW() - INTERVAL '7 days') / 7.0,
            updated_at = NOW()
        WHERE medicine_id = NEW.medicine_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_decrement_inventory ON medication_doses;
CREATE TRIGGER trg_decrement_inventory
AFTER UPDATE ON medication_doses
FOR EACH ROW EXECUTE FUNCTION decrement_inventory_on_dose();

-- ═══════════════════════════════════════════════════════════════
-- TRIGGER: version increment on medicine update
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION increment_medicine_version()
RETURNS TRIGGER AS $$
BEGIN
    NEW.version = OLD.version + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_medicine_version ON medicines;
CREATE TRIGGER trg_medicine_version
BEFORE UPDATE ON medicines
FOR EACH ROW EXECUTE FUNCTION increment_medicine_version();
"""

import os
import logging

logger = logging.getLogger(__name__)


def run_migrations(conn=None):
    """Execute all DDL migrations. Accepts an existing psycopg2 connection or creates one."""
    if conn is None:
        import psycopg2  # type: ignore
        database_url = os.environ.get("DATABASE_URL")
        if not database_url:
            raise RuntimeError("DATABASE_URL environment variable not set")
        conn = psycopg2.connect(database_url)
        own_conn = True
    else:
        own_conn = False

    try:
        with conn.cursor() as cur:
            cur.execute(MIGRATION_SQL)
        conn.commit()
        logger.info("✅ Medication service migrations applied successfully")
    except Exception as e:
        conn.rollback()
        logger.error(f"❌ Migration failed: {e}")
        raise
    finally:
        if own_conn:
            conn.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_migrations()
    print("Migration complete.")
