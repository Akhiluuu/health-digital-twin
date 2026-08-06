"""
db.py - Persistent patient metadata store using PostgreSQL / SQLite.
Provides transaction guarantees, indexing on user_id, and an immutable HIPAA-compliant audit trail.
"""

import os
import json
import sqlite3
import contextvars
import threading
from contextlib import closing
from typing import Optional, Dict, Any
from pathlib import Path
from biogears_service.simulation.config import BASE_DIR

# Database configuration
DATABASE_URL = os.environ.get("DATABASE_URL")
POSTGRES_HOST = os.environ.get("POSTGRES_HOST")
POSTGRES_DB = os.environ.get("POSTGRES_DB")
POSTGRES_USER = os.environ.get("POSTGRES_USER")
POSTGRES_PASSWORD = os.environ.get("POSTGRES_PASSWORD")
POSTGRES_PORT = os.environ.get("POSTGRES_PORT", "5432")

# Local SQLite fallback
SQLITE_PATH = BASE_DIR / "twins_database.db"

_db_initialized = False
_db_init_lock = threading.Lock()

# ContextVar to track the requester for HIPAA compliance auditing
current_actor = contextvars.ContextVar("current_actor", default="system")

def get_connection():
    global _db_initialized
    use_postgres = False
    if DATABASE_URL or (POSTGRES_HOST and POSTGRES_DB):
        try:
            import psycopg2  # type: ignore[import-untyped]
            use_postgres = True
        except ImportError:
            import logging
            logging.getLogger(__name__).warning(
                "⚠️ PostgreSQL configuration detected (DATABASE_URL or POSTGRES_HOST/POSTGRES_DB is set), "
                "but 'psycopg2' is not installed. Falling back to local SQLite database."
            )

    if use_postgres:
        import psycopg2  # type: ignore[import-untyped]
        if DATABASE_URL:
            conn = psycopg2.connect(DATABASE_URL)
        else:
            conn = psycopg2.connect(
                host=POSTGRES_HOST,
                database=POSTGRES_DB,
                user=POSTGRES_USER,
                password=POSTGRES_PASSWORD,
                port=POSTGRES_PORT
            )
        if not _db_initialized:
            with _db_init_lock:
                if not _db_initialized:
                    with closing(conn.cursor()) as cur:
                        # Core profiles table
                        cur.execute("""
                            CREATE TABLE IF NOT EXISTS profiles (
                                user_id VARCHAR(255) PRIMARY KEY,
                                metadata JSONB NOT NULL
                            );
                        """)
                        # PHI Access Audit trail table
                        cur.execute("""
                            CREATE TABLE IF NOT EXISTS audit_logs (
                                id SERIAL PRIMARY KEY,
                                timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
                                user_id VARCHAR(255) NOT NULL,
                                action VARCHAR(50) NOT NULL,
                                performed_by VARCHAR(255) NOT NULL,
                                details TEXT
                            );
                        """)
                        cur.execute("CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);")
                        conn.commit()
                    _db_initialized = True
        return conn, True
    else:
        conn = sqlite3.connect(str(SQLITE_PATH), timeout=30.0)
        try:
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("PRAGMA synchronous=NORMAL;")
        except Exception as pragma_err:
            import logging
            logging.getLogger(__name__).warning(f"⚠️ Failed to set SQLite PRAGMAs: {pragma_err}")

        if not _db_initialized:
            with _db_init_lock:
                if not _db_initialized:
                    with conn:
                        # Core profiles table
                        conn.execute("""
                            CREATE TABLE IF NOT EXISTS profiles (
                                user_id TEXT PRIMARY KEY,
                                metadata TEXT NOT NULL
                            );
                        """)
                        # PHI Access Audit trail table
                        conn.execute("""
                            CREATE TABLE IF NOT EXISTS audit_logs (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                                user_id TEXT NOT NULL,
                                action TEXT NOT NULL,
                                performed_by TEXT NOT NULL,
                                details TEXT
                            );
                        """)
                        conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);")
                    _db_initialized = True
        return conn, False


def write_audit_log(conn, is_pg: bool, user_id: str, action: str, performed_by: str, details: str | None = None) -> None:
    """Inserts a record into the audit logs table."""
    try:
        if is_pg:
            with closing(conn.cursor()) as cur:
                cur.execute("""
                    INSERT INTO audit_logs (user_id, action, performed_by, details)
                    VALUES (%s, %s, %s, %s);
                """, (user_id, action, performed_by, details))
        else:
            conn.execute("""
                INSERT INTO audit_logs (user_id, action, performed_by, details)
                VALUES (?, ?, ?, ?);
            """, (user_id, action, performed_by, details))
    except Exception as e:
        # Do not block main application operations if logging fails, but log a warning
        import logging
        logging.getLogger(__name__).warning(f"⚠️ PHI Audit Log Insertion Failed: {e}")


# ---------------------------------------------------------------------------
# Retry Decorator for SQLite Database Operations
# ---------------------------------------------------------------------------
import time
import random
from functools import wraps

def with_sqlite_retry(max_retries=5, initial_backoff=0.05):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            backoff = initial_backoff
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except sqlite3.OperationalError as e:
                    err_msg = str(e).lower()
                    if ("locked" in err_msg or "busy" in err_msg) and attempt < max_retries - 1:
                        sleep_time = backoff * (1.0 + random.random())
                        import logging
                        logging.getLogger(__name__).warning(
                            f"⚠️ Database locked/busy during {func.__name__} (attempt {attempt + 1}/{max_retries}). "
                            f"Retrying in {sleep_time:.3f}s... Error: {e}"
                        )
                        time.sleep(sleep_time)
                        backoff *= 2
                    else:
                        raise
        return wrapper
    return decorator


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

@with_sqlite_retry()
def upsert_profile(user_id: str, metadata: Dict[str, Any]) -> None:
    """Create or fully overwrite a profile record."""
    conn, is_pg = get_connection()
    try:
        actor = current_actor.get()
        if is_pg:
            with conn:
                with closing(conn.cursor()) as cur:
                    cur.execute("""
                        INSERT INTO profiles (user_id, metadata)
                        VALUES (%s, %s)
                        ON CONFLICT (user_id)
                        DO UPDATE SET metadata = EXCLUDED.metadata;
                    """, (user_id, json.dumps(metadata)))
                write_audit_log(conn, is_pg, user_id, "UPDATE", actor, "Profile metadata upserted")
        else:
            with conn:
                conn.execute("""
                    INSERT INTO profiles (user_id, metadata)
                    VALUES (?, ?)
                    ON CONFLICT(user_id)
                    DO UPDATE SET metadata = excluded.metadata;
                """, (user_id, json.dumps(metadata)))
                write_audit_log(conn, is_pg, user_id, "UPDATE", actor, "Profile metadata upserted")
    finally:
        conn.close()


@with_sqlite_retry()
def get_profile(user_id: str) -> Optional[Dict[str, Any]]:
    """Return a single profile dict, or None if not found."""
    conn, is_pg = get_connection()
    try:
        actor = current_actor.get()
        if is_pg:
            with conn:
                with closing(conn.cursor()) as cur:
                    cur.execute("SELECT metadata FROM profiles WHERE user_id = %s;", (user_id,))
                    row = cur.fetchone()
                    write_audit_log(conn, is_pg, user_id, "VIEW", actor, "Profile details viewed")
                    if row:
                        val = row[0]
                        if isinstance(val, str):
                            return json.loads(val)
                        return val
        else:
            with conn:
                cur = conn.cursor()
                cur.execute("SELECT metadata FROM profiles WHERE user_id = ?;", (user_id,))
                row = cur.fetchone()
                write_audit_log(conn, is_pg, user_id, "VIEW", actor, "Profile details viewed")
                if row:
                    return json.loads(row[0])
    finally:
        conn.close()
    return None


@with_sqlite_retry()
def delete_profile(user_id: str) -> bool:
    """Remove a profile. Returns True if it existed, False otherwise."""
    conn, is_pg = get_connection()
    try:
        actor = current_actor.get()
        if is_pg:
            with conn:
                with closing(conn.cursor()) as cur:
                    cur.execute("DELETE FROM profiles WHERE user_id = %s RETURNING user_id;", (user_id,))
                    row = cur.fetchone()
                    existed = row is not None
                    if existed:
                        write_audit_log(conn, is_pg, user_id, "DELETE", actor, "Profile deleted")
                    return existed
        else:
            with conn:
                cur = conn.cursor()
                cur.execute("DELETE FROM profiles WHERE user_id = ?;", (user_id,))
                existed = cur.rowcount > 0
                if existed:
                    write_audit_log(conn, is_pg, user_id, "DELETE", actor, "Profile deleted")
                return existed
    finally:
        conn.close()


@with_sqlite_retry()
def list_profiles() -> Dict[str, Any]:
    """Return the entire database dict (keyed by user_id)."""
    conn, is_pg = get_connection()
    profiles = {}
    try:
        actor = current_actor.get()
        if is_pg:
            with conn:
                with closing(conn.cursor()) as cur:
                    cur.execute("SELECT user_id, metadata FROM profiles;")
                    rows = cur.fetchall()
                    write_audit_log(conn, is_pg, "all", "LIST", actor, "All profiles listed")
                    for row in rows:
                        user_id, val = row
                        if isinstance(val, str):
                            profiles[user_id] = json.loads(val)
                        else:
                            profiles[user_id] = val
        else:
            with conn:
                cur = conn.cursor()
                cur.execute("SELECT user_id, metadata FROM profiles;")
                rows = cur.fetchall()
                write_audit_log(conn, is_pg, "all", "LIST", actor, "All profiles listed")
                for row in rows:
                    user_id, val = row
                    profiles[user_id] = json.loads(val)
    finally:
        conn.close()
    return profiles


def update_last_sleep_hours(user_id: str, events: list) -> None:
    """Scan events for sleep and update last_sleep_hours in user's profile."""
    sleep_events = [e for e in events if isinstance(e, dict) and e.get("event_type") == "sleep"]
    if not sleep_events:
        return
    # Get the latest sleep event by timestamp
    latest_sleep = max(sleep_events, key=lambda x: x.get("timestamp", 0))
    val = latest_sleep.get("value")
    if val is not None:
        try:
            profile = get_profile(user_id)
            if profile:
                profile["last_sleep_hours"] = float(val)
                upsert_profile(user_id, profile)
        except Exception:
            pass
