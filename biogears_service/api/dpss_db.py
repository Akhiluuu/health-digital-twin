"""
dpss_db.py — Deferred Physiology Synchronization System (DPSS) Database Layer

Creates and manages:
  • pending_events        — health events waiting to be simulated
  • simulation_history    — immutable log of every sim run
  • simulation_snapshots  — checkpoint blobs for undo/rollback
  • scheduler_state       — per-user scheduler tracking
  • dpss_notifications    — notification queue log

Compatible with both PostgreSQL (JSONB) and SQLite (TEXT/JSON).
"""

import json
import sqlite3
import datetime
import logging
from typing import Optional, Dict, Any, List
from pathlib import Path
from contextlib import closing

from biogears_service.simulation.config import BASE_DIR
from biogears_service.api.db import get_connection, with_sqlite_retry, write_audit_log

logger = logging.getLogger("DPSS.DB")

_dpss_initialized = False


# ---------------------------------------------------------------------------
# SCHEMA CREATION
# ---------------------------------------------------------------------------

_PG_SCHEMA = """
CREATE TABLE IF NOT EXISTS pending_events (
    event_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         VARCHAR(255) NOT NULL,
    event_type      VARCHAR(50)  NOT NULL,
    event_timestamp TIMESTAMPTZ  NOT NULL,
    payload         JSONB        NOT NULL,
    status          VARCHAR(20)  DEFAULT 'PENDING' NOT NULL,
    device_id       VARCHAR(100) NOT NULL DEFAULT 'app',
    sequence_num    BIGINT       NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, device_id, sequence_num)
);
CREATE INDEX IF NOT EXISTS idx_pe_user_status   ON pending_events(user_id, status);
CREATE INDEX IF NOT EXISTS idx_pe_timestamp     ON pending_events(event_timestamp);

CREATE TABLE IF NOT EXISTS simulation_history (
    sim_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         VARCHAR(255) NOT NULL,
    sim_type        VARCHAR(20)  NOT NULL,
    status          VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    initiated_by    VARCHAR(255) NOT NULL DEFAULT 'system',
    started_at      TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    completed_at    TIMESTAMPTZ,
    duration_ms     INTEGER,
    engine_version  VARCHAR(50)  NOT NULL DEFAULT '8.0',
    failure_reason  TEXT,
    input_events    JSONB,
    pre_vitals      JSONB,
    post_vitals     JSONB
);
CREATE INDEX IF NOT EXISTS idx_sh_user_status ON simulation_history(user_id, status);
CREATE INDEX IF NOT EXISTS idx_sh_started     ON simulation_history(started_at);

CREATE TABLE IF NOT EXISTS simulation_snapshots (
    snapshot_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sim_id              UUID NOT NULL UNIQUE,
    user_id             VARCHAR(255) NOT NULL,
    pre_state_path      VARCHAR(512) NOT NULL,
    post_state_path     VARCHAR(512),
    input_event_ids     JSONB NOT NULL DEFAULT '[]',
    vitals_snapshot     JSONB NOT NULL DEFAULT '{}',
    biomarkers_snapshot JSONB NOT NULL DEFAULT '{}',
    sim_date            DATE  NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ss_user ON simulation_snapshots(user_id);

CREATE TABLE IF NOT EXISTS scheduler_state (
    user_id             VARCHAR(255) PRIMARY KEY,
    last_simulated_at   TIMESTAMPTZ,
    last_checked_at     TIMESTAMPTZ,
    next_check_at       TIMESTAMPTZ,
    pending_event_count INTEGER NOT NULL DEFAULT 0,
    updated_at          TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dpss_notifications (
    notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         VARCHAR(255) NOT NULL,
    profile_name    VARCHAR(100) NOT NULL DEFAULT '',
    sim_date        DATE NOT NULL,
    notif_type      VARCHAR(40)  NOT NULL,
    status          VARCHAR(20)  DEFAULT 'UNREAD' NOT NULL,
    payload         JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dn_user_status ON dpss_notifications(user_id, status);
"""

_SQLITE_SCHEMA = """
CREATE TABLE IF NOT EXISTS pending_events (
    event_id        TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    event_type      TEXT NOT NULL,
    event_timestamp TEXT NOT NULL,
    payload         TEXT NOT NULL,
    status          TEXT DEFAULT 'PENDING' NOT NULL,
    device_id       TEXT NOT NULL DEFAULT 'app',
    sequence_num    INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, device_id, sequence_num)
);
CREATE INDEX IF NOT EXISTS idx_pe_user_status   ON pending_events(user_id, status);
CREATE INDEX IF NOT EXISTS idx_pe_timestamp     ON pending_events(event_timestamp);

CREATE TABLE IF NOT EXISTS simulation_history (
    sim_id          TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    sim_type        TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'PENDING',
    initiated_by    TEXT NOT NULL DEFAULT 'system',
    started_at      TEXT DEFAULT (datetime('now')),
    completed_at    TEXT,
    duration_ms     INTEGER,
    engine_version  TEXT NOT NULL DEFAULT '8.0',
    failure_reason  TEXT,
    input_events    TEXT,
    pre_vitals      TEXT,
    post_vitals     TEXT
);
CREATE INDEX IF NOT EXISTS idx_sh_user_status ON simulation_history(user_id, status);

CREATE TABLE IF NOT EXISTS simulation_snapshots (
    snapshot_id         TEXT PRIMARY KEY,
    sim_id              TEXT NOT NULL UNIQUE,
    user_id             TEXT NOT NULL,
    pre_state_path      TEXT NOT NULL,
    post_state_path     TEXT,
    input_event_ids     TEXT NOT NULL DEFAULT '[]',
    vitals_snapshot     TEXT NOT NULL DEFAULT '{}',
    biomarkers_snapshot TEXT NOT NULL DEFAULT '{}',
    sim_date            TEXT NOT NULL,
    created_at          TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ss_user ON simulation_snapshots(user_id);

CREATE TABLE IF NOT EXISTS scheduler_state (
    user_id             TEXT PRIMARY KEY,
    last_simulated_at   TEXT,
    last_checked_at     TEXT,
    next_check_at       TEXT,
    pending_event_count INTEGER NOT NULL DEFAULT 0,
    updated_at          TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dpss_notifications (
    notification_id TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    profile_name    TEXT NOT NULL DEFAULT '',
    sim_date        TEXT NOT NULL,
    notif_type      TEXT NOT NULL,
    status          TEXT DEFAULT 'UNREAD' NOT NULL,
    payload         TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_dn_user_status ON dpss_notifications(user_id, status);
"""


def _init_dpss_schema(conn, is_pg: bool):
    """Create DPSS tables if they don't exist."""
    global _dpss_initialized
    if _dpss_initialized:
        return
    try:
        if is_pg:
            with closing(conn.cursor()) as cur:
                for stmt in _PG_SCHEMA.strip().split(";"):
                    s = stmt.strip()
                    if s:
                        cur.execute(s)
            conn.commit()
        else:
            for stmt in _SQLITE_SCHEMA.strip().split(";"):
                s = stmt.strip()
                if s:
                    conn.execute(s)
            conn.commit()
        _dpss_initialized = True
        logger.info("✅ DPSS schema initialized.")
    except Exception as e:
        logger.error(f"❌ DPSS schema init failed: {e}")
        raise


def get_dpss_conn():
    """Return (conn, is_pg) with DPSS schema guaranteed to exist."""
    conn, is_pg = get_connection()
    _init_dpss_schema(conn, is_pg)
    return conn, is_pg


def _uuid() -> str:
    import uuid
    return str(uuid.uuid4())


def _now_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def _json(obj) -> str:
    return json.dumps(obj, default=str)


def _load(val):
    """Parse JSON string or return dict/list directly."""
    if val is None:
        return None
    if isinstance(val, (dict, list)):
        return val
    try:
        return json.loads(val)
    except Exception:
        return val


# ---------------------------------------------------------------------------
# PENDING EVENTS
# ---------------------------------------------------------------------------

@with_sqlite_retry()
def insert_pending_event(
    user_id: str,
    event_type: str,
    event_timestamp: str,
    payload: dict,
    device_id: str = "app",
    sequence_num: int = 0,
) -> str:
    """Insert a single pending event. Returns the event_id."""
    conn, is_pg = get_dpss_conn()
    event_id = _uuid()
    payload_str = _json(payload)
    try:
        if is_pg:
            with closing(conn.cursor()) as cur:
                cur.execute(
                    """
                    INSERT INTO pending_events
                        (event_id, user_id, event_type, event_timestamp, payload, device_id, sequence_num)
                    VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s)
                    ON CONFLICT (user_id, device_id, sequence_num) DO NOTHING
                    """,
                    (event_id, user_id, event_type, event_timestamp,
                     payload_str, device_id, sequence_num)
                )
            conn.commit()
        else:
            with conn:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO pending_events
                        (event_id, user_id, event_type, event_timestamp, payload, device_id, sequence_num)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (event_id, user_id, event_type, event_timestamp,
                     payload_str, device_id, sequence_num)
                )
    finally:
        conn.close()
    return event_id


@with_sqlite_retry()
def get_pending_events(user_id: str) -> List[Dict[str, Any]]:
    """Return all PENDING events for a user, ordered by event_timestamp asc."""
    conn, is_pg = get_dpss_conn()
    try:
        if is_pg:
            with closing(conn.cursor()) as cur:
                cur.execute(
                    "SELECT * FROM pending_events WHERE user_id=%s AND status='PENDING' ORDER BY event_timestamp ASC",
                    (user_id,)
                )
                cols = [d[0] for d in cur.description]
                rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        else:
            with closing(conn.cursor()) as cur:
                cur.execute(
                    "SELECT * FROM pending_events WHERE user_id=? AND status='PENDING' ORDER BY event_timestamp ASC",
                    (user_id,)
                )
                cols = [d[0] for d in cur.description]
                rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        for r in rows:
            r["payload"] = _load(r.get("payload", "{}"))
        return rows
    finally:
        conn.close()


@with_sqlite_retry()
def mark_events_simulated(event_ids: List[str]) -> None:
    """Mark a list of event IDs as SIMULATED."""
    if not event_ids:
        return
    conn, is_pg = get_dpss_conn()
    try:
        if is_pg:
            with closing(conn.cursor()) as cur:
                cur.execute(
                    "UPDATE pending_events SET status='SIMULATED' WHERE event_id = ANY(%s)",
                    (event_ids,)
                )
            conn.commit()
        else:
            placeholders = ",".join(["?"] * len(event_ids))
            with conn:
                conn.execute(
                    f"UPDATE pending_events SET status='SIMULATED' WHERE event_id IN ({placeholders})",
                    event_ids
                )
    finally:
        conn.close()


@with_sqlite_retry()
def restore_events_to_pending(event_ids: List[str]) -> None:
    """Revert event statuses back to PENDING (used by Undo)."""
    if not event_ids:
        return
    conn, is_pg = get_dpss_conn()
    try:
        if is_pg:
            with closing(conn.cursor()) as cur:
                cur.execute(
                    "UPDATE pending_events SET status='PENDING' WHERE event_id = ANY(%s)",
                    (event_ids,)
                )
            conn.commit()
        else:
            placeholders = ",".join(["?"] * len(event_ids))
            with conn:
                conn.execute(
                    f"UPDATE pending_events SET status='PENDING' WHERE event_id IN ({placeholders})",
                    event_ids
                )
    finally:
        conn.close()


@with_sqlite_retry()
def count_pending_events(user_id: str) -> int:
    """Count how many PENDING events a user has."""
    conn, is_pg = get_dpss_conn()
    try:
        if is_pg:
            with closing(conn.cursor()) as cur:
                cur.execute(
                    "SELECT COUNT(*) FROM pending_events WHERE user_id=%s AND status='PENDING'",
                    (user_id,)
                )
                res = cur.fetchone()
                return int(res[0]) if res and res[0] is not None else 0
        else:
            with closing(conn.cursor()) as cur:
                cur.execute(
                    "SELECT COUNT(*) FROM pending_events WHERE user_id=? AND status='PENDING'",
                    (user_id,)
                )
                res = cur.fetchone()
                return int(res[0]) if res and res[0] is not None else 0
    finally:
        conn.close()


@with_sqlite_retry()
def get_users_with_pending_events() -> List[str]:
    """Return distinct user_ids that have at least one PENDING event."""
    conn, is_pg = get_dpss_conn()
    try:
        if is_pg:
            with closing(conn.cursor()) as cur:
                cur.execute(
                    "SELECT DISTINCT user_id FROM pending_events WHERE status='PENDING'"
                )
                return [r[0] for r in cur.fetchall()]
        else:
            with closing(conn.cursor()) as cur:
                cur.execute(
                    "SELECT DISTINCT user_id FROM pending_events WHERE status='PENDING'"
                )
                return [r[0] for r in cur.fetchall()]
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# SIMULATION HISTORY
# ---------------------------------------------------------------------------

@with_sqlite_retry()
def create_sim_history(
    user_id: str,
    sim_type: str,
    initiated_by: str = "system",
    engine_version: str = "8.0",
    input_events: Optional[List] = None,
    pre_vitals: Optional[dict] = None,
) -> str:
    """Insert a RUNNING simulation history entry. Returns sim_id."""
    conn, is_pg = get_dpss_conn()
    sim_id = _uuid()
    try:
        if is_pg:
            with closing(conn.cursor()) as cur:
                cur.execute(
                    """
                    INSERT INTO simulation_history
                        (sim_id, user_id, sim_type, status, initiated_by, engine_version, input_events, pre_vitals)
                    VALUES (%s, %s, %s, 'RUNNING', %s, %s, %s::jsonb, %s::jsonb)
                    """,
                    (sim_id, user_id, sim_type, initiated_by, engine_version,
                     _json(input_events or []), _json(pre_vitals or {}))
                )
            conn.commit()
        else:
            with conn:
                conn.execute(
                    """
                    INSERT INTO simulation_history
                        (sim_id, user_id, sim_type, status, initiated_by, engine_version, input_events, pre_vitals)
                    VALUES (?, ?, ?, 'RUNNING', ?, ?, ?, ?)
                    """,
                    (sim_id, user_id, sim_type, initiated_by, engine_version,
                     _json(input_events or []), _json(pre_vitals or {}))
                )
    finally:
        conn.close()
    return sim_id


@with_sqlite_retry()
def complete_sim_history(
    sim_id: str,
    status: str,
    post_vitals: Optional[dict] = None,
    failure_reason: Optional[str] = None,
    duration_ms: Optional[int] = None,
) -> None:
    """Mark a simulation history entry as SUCCESS or FAILED."""
    conn, is_pg = get_dpss_conn()
    completed_at = _now_iso()
    try:
        if is_pg:
            with closing(conn.cursor()) as cur:
                cur.execute(
                    """
                    UPDATE simulation_history
                    SET status=%s, completed_at=%s, duration_ms=%s,
                        post_vitals=%s::jsonb, failure_reason=%s
                    WHERE sim_id=%s
                    """,
                    (status, completed_at, duration_ms,
                     _json(post_vitals or {}), failure_reason, sim_id)
                )
            conn.commit()
        else:
            with conn:
                conn.execute(
                    """
                    UPDATE simulation_history
                    SET status=?, completed_at=?, duration_ms=?,
                        post_vitals=?, failure_reason=?
                    WHERE sim_id=?
                    """,
                    (status, completed_at, duration_ms,
                     _json(post_vitals or {}), failure_reason, sim_id)
                )
    finally:
        conn.close()


@with_sqlite_retry()
def mark_sim_undone(sim_id: str) -> None:
    """Mark a history entry as UNDONE."""
    conn, is_pg = get_dpss_conn()
    try:
        if is_pg:
            with closing(conn.cursor()) as cur:
                cur.execute(
                    "UPDATE simulation_history SET status='UNDONE' WHERE sim_id=%s",
                    (sim_id,)
                )
            conn.commit()
        else:
            with conn:
                conn.execute(
                    "UPDATE simulation_history SET status='UNDONE' WHERE sim_id=?",
                    (sim_id,)
                )
    finally:
        conn.close()


@with_sqlite_retry()
def get_sim_history(user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    """Return simulation history for a user, newest first."""
    conn, is_pg = get_dpss_conn()
    try:
        if is_pg:
            with closing(conn.cursor()) as cur:
                cur.execute(
                    "SELECT * FROM simulation_history WHERE user_id=%s ORDER BY started_at DESC LIMIT %s",
                    (user_id, limit)
                )
                cols = [d[0] for d in cur.description]
                rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        else:
            with closing(conn.cursor()) as cur:
                cur.execute(
                    "SELECT * FROM simulation_history WHERE user_id=? ORDER BY started_at DESC LIMIT ?",
                    (user_id, limit)
                )
                cols = [d[0] for d in cur.description]
                rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        for r in rows:
            for k in ("input_events", "pre_vitals", "post_vitals"):
                r[k] = _load(r.get(k))
        return rows
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# SIMULATION SNAPSHOTS
# ---------------------------------------------------------------------------

@with_sqlite_retry()
def create_snapshot(
    sim_id: str,
    user_id: str,
    pre_state_path: str,
    post_state_path: str,
    input_event_ids: List[str],
    vitals_snapshot: dict,
    biomarkers_snapshot: dict,
    sim_date: str,
) -> str:
    """Create a simulation checkpoint snapshot. Returns snapshot_id."""
    conn, is_pg = get_dpss_conn()
    snapshot_id = _uuid()
    try:
        if is_pg:
            with closing(conn.cursor()) as cur:
                cur.execute(
                    """
                    INSERT INTO simulation_snapshots
                        (snapshot_id, sim_id, user_id, pre_state_path, post_state_path,
                         input_event_ids, vitals_snapshot, biomarkers_snapshot, sim_date)
                    VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s)
                    ON CONFLICT (sim_id) DO UPDATE SET
                        post_state_path = EXCLUDED.post_state_path,
                        vitals_snapshot = EXCLUDED.vitals_snapshot,
                        biomarkers_snapshot = EXCLUDED.biomarkers_snapshot
                    """,
                    (snapshot_id, sim_id, user_id, pre_state_path, post_state_path,
                     _json(input_event_ids), _json(vitals_snapshot),
                     _json(biomarkers_snapshot), sim_date)
                )
            conn.commit()
        else:
            with conn:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO simulation_snapshots
                        (snapshot_id, sim_id, user_id, pre_state_path, post_state_path,
                         input_event_ids, vitals_snapshot, biomarkers_snapshot, sim_date)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (snapshot_id, sim_id, user_id, pre_state_path, post_state_path,
                     _json(input_event_ids), _json(vitals_snapshot),
                     _json(biomarkers_snapshot), sim_date)
                )
    finally:
        conn.close()
    return snapshot_id


@with_sqlite_retry()
def get_latest_snapshot(user_id: str) -> Optional[Dict[str, Any]]:
    """Return the most recent non-undone snapshot for a user."""
    conn, is_pg = get_dpss_conn()
    try:
        if is_pg:
            with closing(conn.cursor()) as cur:
                cur.execute(
                    """
                    SELECT ss.* FROM simulation_snapshots ss
                    JOIN simulation_history sh ON ss.sim_id = sh.sim_id
                    WHERE ss.user_id=%s AND sh.status='SUCCESS'
                    ORDER BY ss.sim_date DESC, ss.created_at DESC LIMIT 1
                    """,
                    (user_id,)
                )
                cols = [d[0] for d in cur.description]
                row = cur.fetchone()
        else:
            with closing(conn.cursor()) as cur:
                cur.execute(
                    """
                    SELECT ss.* FROM simulation_snapshots ss
                    JOIN simulation_history sh ON ss.sim_id = sh.sim_id
                    WHERE ss.user_id=? AND sh.status='SUCCESS'
                    ORDER BY ss.sim_date DESC, ss.created_at DESC LIMIT 1
                    """,
                    (user_id,)
                )
                cols = [d[0] for d in cur.description]
                row = cur.fetchone()
        if not row:
            return None
        r = dict(zip(cols, row))
        r["input_event_ids"] = _load(r.get("input_event_ids", "[]"))
        r["vitals_snapshot"] = _load(r.get("vitals_snapshot", "{}"))
        r["biomarkers_snapshot"] = _load(r.get("biomarkers_snapshot", "{}"))
        return r
    finally:
        conn.close()


@with_sqlite_retry()
def delete_snapshot(snapshot_id: str) -> None:
    """Delete a snapshot by ID (used during undo cleanup)."""
    conn, is_pg = get_dpss_conn()
    try:
        if is_pg:
            with closing(conn.cursor()) as cur:
                cur.execute("DELETE FROM simulation_snapshots WHERE snapshot_id=%s", (snapshot_id,))
            conn.commit()
        else:
            with conn:
                conn.execute("DELETE FROM simulation_snapshots WHERE snapshot_id=?", (snapshot_id,))
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# SCHEDULER STATE
# ---------------------------------------------------------------------------

@with_sqlite_retry()
def upsert_scheduler_state(user_id: str, **kwargs) -> None:
    """Upsert a scheduler_state row. kwargs: last_simulated_at, pending_event_count, etc."""
    conn, is_pg = get_dpss_conn()
    now = _now_iso()
    try:
        if is_pg:
            with closing(conn.cursor()) as cur:
                cur.execute(
                    """
                    INSERT INTO scheduler_state (user_id, last_checked_at, updated_at)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (user_id) DO UPDATE SET
                        last_checked_at = EXCLUDED.last_checked_at,
                        updated_at = EXCLUDED.updated_at
                    """,
                    (user_id, now, now)
                )
                for k, v in kwargs.items():
                    cur.execute(
                        f"UPDATE scheduler_state SET {k}=%s, updated_at=%s WHERE user_id=%s",
                        (v, now, user_id)
                    )
            conn.commit()
        else:
            with conn:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO scheduler_state (user_id, last_checked_at, updated_at)
                    VALUES (?, ?, ?)
                    """,
                    (user_id, now, now)
                )
                for k, v in kwargs.items():
                    conn.execute(
                        f"UPDATE scheduler_state SET {k}=?, updated_at=? WHERE user_id=?",
                        (v, now, user_id)
                    )
    finally:
        conn.close()


@with_sqlite_retry()
def get_scheduler_state(user_id: str) -> Optional[Dict[str, Any]]:
    """Fetch scheduler state for a single user."""
    conn, is_pg = get_dpss_conn()
    try:
        if is_pg:
            with closing(conn.cursor()) as cur:
                cur.execute("SELECT * FROM scheduler_state WHERE user_id=%s", (user_id,))
                cols = [d[0] for d in cur.description]
                row = cur.fetchone()
        else:
            with closing(conn.cursor()) as cur:
                cur.execute("SELECT * FROM scheduler_state WHERE user_id=?", (user_id,))
                cols = [d[0] for d in cur.description]
                row = cur.fetchone()
        return dict(zip(cols, row)) if row else None
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# NOTIFICATIONS
# ---------------------------------------------------------------------------

@with_sqlite_retry()
def create_dpss_notification(
    user_id: str,
    notif_type: str,
    sim_date: str,
    payload: dict,
    profile_name: str = "",
) -> str:
    """Insert a new DPSS notification. Returns notification_id."""
    conn, is_pg = get_dpss_conn()
    notif_id = _uuid()
    try:
        if is_pg:
            with closing(conn.cursor()) as cur:
                cur.execute(
                    """
                    INSERT INTO dpss_notifications
                        (notification_id, user_id, profile_name, sim_date, notif_type, payload)
                    VALUES (%s, %s, %s, %s, %s, %s::jsonb)
                    """,
                    (notif_id, user_id, profile_name, sim_date, notif_type, _json(payload))
                )
            conn.commit()
        else:
            with conn:
                conn.execute(
                    """
                    INSERT INTO dpss_notifications
                        (notification_id, user_id, profile_name, sim_date, notif_type, payload)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (notif_id, user_id, profile_name, sim_date, notif_type, _json(payload))
                )
    finally:
        conn.close()
    return notif_id


@with_sqlite_retry()
def mark_notification_status(notification_id: str, status: str) -> None:
    conn, is_pg = get_dpss_conn()
    now = _now_iso()
    try:
        if is_pg:
            with closing(conn.cursor()) as cur:
                cur.execute(
                    "UPDATE dpss_notifications SET status=%s, updated_at=%s WHERE notification_id=%s",
                    (status, now, notification_id)
                )
            conn.commit()
        else:
            with conn:
                conn.execute(
                    "UPDATE dpss_notifications SET status=?, updated_at=? WHERE notification_id=?",
                    (status, now, notification_id)
                )
    finally:
        conn.close()


@with_sqlite_retry()
def get_notifications(user_id: str, limit: int = 30) -> List[Dict[str, Any]]:
    conn, is_pg = get_dpss_conn()
    try:
        if is_pg:
            with closing(conn.cursor()) as cur:
                cur.execute(
                    "SELECT * FROM dpss_notifications WHERE user_id=%s ORDER BY created_at DESC LIMIT %s",
                    (user_id, limit)
                )
                cols = [d[0] for d in cur.description]
                rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        else:
            with closing(conn.cursor()) as cur:
                cur.execute(
                    "SELECT * FROM dpss_notifications WHERE user_id=? ORDER BY created_at DESC LIMIT ?",
                    (user_id, limit)
                )
                cols = [d[0] for d in cur.description]
                rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        for r in rows:
            r["payload"] = _load(r.get("payload", "{}"))
        return rows
    finally:
        conn.close()
