"""
db.py - Persistent patient metadata store using twins_database.json
All read/write operations are atomic via temp-file + rename pattern.
Thread-safe via a threading.Lock (in-process) + atomic os.replace (cross-process).
"""

import json
import os
import shutil
import threading
from pathlib import Path
from typing import Optional, Dict, Any

from biogears_service.simulation.config import BASE_DIR

DB_PATH = BASE_DIR / "twins_database.json"
_db_lock = threading.Lock()


def _load() -> Dict[str, Any]:
    """Load the full database dict. Returns {} if file is missing or empty."""
    try:
        if DB_PATH.exists() and DB_PATH.stat().st_size > 0:
            with open(DB_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
    except (json.JSONDecodeError, IOError):
        pass
    return {}


def _save(data: Dict[str, Any]) -> None:
    """Atomically write the database dict to disk (POSIX-safe)."""
    tmp = DB_PATH.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    # os.replace() is atomic on POSIX (rename syscall) — avoids partial writes
    # and works on same filesystem. shutil.move() can fail cross-device.
    os.replace(str(tmp), str(DB_PATH))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def upsert_profile(user_id: str, metadata: Dict[str, Any]) -> None:
    """Create or fully overwrite a profile record. Thread-safe."""
    with _db_lock:
        db = _load()
        db[user_id] = metadata
        _save(db)


def get_profile(user_id: str) -> Optional[Dict[str, Any]]:
    """Return a single profile dict, or None if not found. Thread-safe."""
    with _db_lock:
        return _load().get(user_id)


def delete_profile(user_id: str) -> bool:
    """Remove a profile. Returns True if it existed, False otherwise. Thread-safe."""
    with _db_lock:
        db = _load()
        if user_id in db:
            del db[user_id]
            _save(db)
            return True
        return False


def list_profiles() -> Dict[str, Any]:
    """Return the entire database dict (keyed by user_id). Thread-safe."""
    with _db_lock:
        return _load()


def update_last_sleep_hours(user_id: str, events: list) -> None:
    """Scan events for sleep and update last_sleep_hours in user's profile. Thread-safe."""
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

