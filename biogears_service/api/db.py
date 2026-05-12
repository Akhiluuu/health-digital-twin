"""
db.py - Persistent patient metadata store using twins_database.json
All read/write operations are atomic via temp-file + rename pattern.
"""

import json
import os
import shutil
from pathlib import Path
from typing import Optional, Dict, Any

from biogears_service.simulation.config import BASE_DIR

DB_PATH = BASE_DIR / "twins_database.json"


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
    """Create or fully overwrite a profile record."""
    db = _load()
    db[user_id] = metadata
    _save(db)


def get_profile(user_id: str) -> Optional[Dict[str, Any]]:
    """Return a single profile dict, or None if not found."""
    return _load().get(user_id)


def delete_profile(user_id: str) -> bool:
    """Remove a profile. Returns True if it existed, False otherwise."""
    db = _load()
    if user_id in db:
        del db[user_id]
        _save(db)
        return True
    return False


def list_profiles() -> Dict[str, Any]:
    """Return the entire database dict (keyed by user_id)."""
    return _load()
