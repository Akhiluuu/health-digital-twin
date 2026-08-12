"""
dpss_scheduler.py — Deferred Physiology Synchronization System Scheduler

Runs as a background thread inside the FastAPI process.
Responsibilities:
  1. Every 10 min — sweep all users with PENDING events and emit a
     SIM_READY notification if they haven't been notified yet today.
  2. Midnight sweep (00:05 AM server local time) — auto-execute simulations
     for every user who still has PENDING events from the previous calendar day.
  3. Multi-day recovery — if a user missed several days, the scheduler
     chains simulations day-by-day to maintain physiological continuity.
"""

import threading
import datetime
import time
import logging
import shutil
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger("DPSS.Scheduler")

# ---------------------------------------------------------------------------
# Helpers — imported lazily to avoid circular imports at module load
# ---------------------------------------------------------------------------

def _db():
    from biogears_service.api import dpss_db
    return dpss_db


def _resolve_profile_name(user_id: str) -> str:
    # 1. Try to read from db profile metadata
    try:
        from biogears_service.api import db as biogears_db
        profile = biogears_db.get_profile(user_id)
        if profile and profile.get("profile_name"):
            return profile["profile_name"]
    except Exception as e:
        logger.warning(f"Error reading profile metadata for {user_id}: {e}")

    # 2. Fallback to parsing user_id
    if "_" in user_id:
        parts = user_id.split("_")
        name_parts = [p for p in parts if not p.isdigit()]
        if name_parts:
            return " ".join(p.capitalize() for p in name_parts)

    return user_id


def _map_routine_event_to_date(event: dict, day_date: datetime.date) -> dict:
    import re
    # default hour and minute
    hour, minute = 12, 0
    
    # 1. Try wallTime
    wall_time = event.get("wallTime")
    if wall_time and isinstance(wall_time, str):
        # format could be HH:MM or HH:MM:SS or HH:MM AM/PM
        parts = re.findall(r'\d+', wall_time)
        if len(parts) >= 2:
            try:
                hour = int(parts[0])
                minute = int(parts[1])
                if "pm" in wall_time.lower() and hour < 12:
                    hour += 12
                elif "am" in wall_time.lower() and hour == 12:
                    hour = 0
            except Exception:
                pass
    else:
        # 2. Try timestamp
        ts = event.get("timestamp")
        if ts is not None:
            try:
                dt = datetime.datetime.fromtimestamp(float(ts))
                hour = dt.hour
                minute = dt.minute
            except Exception:
                pass
                
    # Combine day_date and time
    try:
        combined_ts = int(datetime.datetime.combine(day_date, datetime.time(hour, minute)).timestamp())
    except Exception:
        combined_ts = int(datetime.datetime.combine(day_date, datetime.time(12, 0)).timestamp())
    
    # Build the mapped event
    mapped = {
        "event_type": event.get("event_type"),
        "value": event.get("value", 0),
        "timestamp": combined_ts,
        "substance_name": event.get("substance_name"),
        "unit": event.get("unit"),
        "meal_type": event.get("meal_type"),
        "carb_g": event.get("carb_g"),
        "fat_g": event.get("fat_g"),
        "protein_g": event.get("protein_g"),
        "duration_seconds": event.get("duration_seconds"),
        "notes": event.get("notes") or f"Routine {event.get('event_type')}",
    }
    # Remove None values
    return {k: v for k, v in mapped.items() if v is not None}



def _parse_event_timestamp_to_unix(ts) -> float:
    if ts is None:
        return time.time()
    if isinstance(ts, (int, float)):
        return float(ts)
    if isinstance(ts, (datetime.datetime, datetime.date)):
        if isinstance(ts, datetime.date) and not isinstance(ts, datetime.datetime):
            ts = datetime.datetime.combine(ts, datetime.time())
        return ts.timestamp()
    if isinstance(ts, str):
        ts_clean = ts.replace("Z", "+00:00")
        try:
            return datetime.datetime.fromisoformat(ts_clean).timestamp()
        except Exception:
            pass
    return time.time()


def _run_sim(user_id: str, events: list, sim_type: str = "AUTOMATIC", sim_date: Optional[str] = None) -> dict:
    """
    Core simulation executor used by the scheduler.
    Mirrors _run_batch_sync_blocking from server.py but logs into
    the DPSS simulation_history table.
    Returns a dict with 'success', 'vitals', and 'sim_id'.
    """
    import time as _time
    from biogears_service.api import dpss_db as db
    from biogears_service.simulation.config import USER_STATES_DIR
    from pydantic import BaseModel
    from typing import List, Optional

    t0 = _time.time()
    db_m = db

    # Build event objects compatible with _run_batch_sync_blocking
    # We lazily import the server helper to avoid circular dependency
    try:
        from biogears_service.api.server import _run_batch_sync_blocking
        from biogears_service.api.server import HealthEvent
    except Exception as import_err:
        logger.error(f"[{user_id}] Failed to import server helpers: {import_err}")
        return {"success": False, "vitals": {}, "sim_id": None}

    # Convert raw dicts to HealthEvent pydantic models
    he_events = []
    for e in (events or []):
        try:
            he_events.append(HealthEvent(**e) if isinstance(e, dict) else e)
        except Exception:
            pass

    # Record pre-vitals from the most recent snapshot
    pre_vitals = {}
    latest_snap = db_m.get_latest_snapshot(user_id)
    if latest_snap:
        pre_vitals = latest_snap.get("vitals_snapshot", {})

    # Create history entry
    event_ids: List[str] = [
        str(e["event_id"])
        for e in (events or [])
        if isinstance(e, dict) and e.get("event_id") is not None
    ]
    sim_id = db_m.create_sim_history(
        user_id=user_id,
        sim_type=sim_type,
        initiated_by="scheduler" if sim_type == "AUTOMATIC" else "user",
        input_events=events,
        pre_vitals=pre_vitals,
    )
    if not sim_id or not isinstance(sim_id, str):
        import uuid
        sim_id = str(uuid.uuid4())

    sim_id_short = sim_id[:8]

    # Save pre-sim state backup
    state_file = USER_STATES_DIR / f"{user_id}.xml"
    gz_file = USER_STATES_DIR / f"{user_id}.xml.gz"
    bak_dir = USER_STATES_DIR / "backups" / user_id
    bak_dir.mkdir(parents=True, exist_ok=True)
    pre_state_path = ""

    active_file = None
    if state_file.exists():
        active_file = state_file
    elif gz_file.exists():
        active_file = gz_file

    if active_file:
        ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d_%H%M%S")
        dest = bak_dir / f"{user_id}_{sim_id_short}_{ts}{active_file.suffix}"
        try:
            shutil.copy2(str(active_file), str(dest))
            pre_state_path = str(dest)
            logger.info(f"[{user_id}] Pre-sim backup saved: {dest.name}")
        except Exception as bak_err:
            logger.warning(f"[{user_id}] Pre-sim backup failed: {bak_err}")

    # Execute simulation
    try:
        result = _run_batch_sync_blocking(user_id, he_events)
        vitals = result.get("vitals", {})
        duration_ms = int((_time.time() - t0) * 1000)

        db_m.complete_sim_history(
            sim_id=sim_id,
            status="SUCCESS",
            post_vitals=vitals,
            duration_ms=duration_ms,
        )

        # Mark input events as simulated
        if event_ids:
            db_m.mark_events_simulated(event_ids)

        # Save snapshot
        today_str = sim_date if sim_date else datetime.date.today().isoformat()
        post_state_path = str(gz_file) if gz_file.exists() else str(state_file)
        db_m.create_snapshot(
            sim_id=sim_id,
            user_id=user_id,
            pre_state_path=pre_state_path,
            post_state_path=post_state_path,
            input_event_ids=event_ids,
            vitals_snapshot=vitals,
            biomarkers_snapshot={},
            sim_date=today_str,
        )

        # Update scheduler state
        db_m.upsert_scheduler_state(user_id, last_simulated_at=datetime.datetime.now(datetime.timezone.utc).isoformat())

        logger.info(f"✅ [{user_id}] {sim_type} simulation SUCCESS (sim_id={sim_id_short})")
        return {"success": True, "vitals": vitals, "sim_id": sim_id}

    except Exception as sim_err:
        logger.error(f"❌ [{user_id}] Simulation FAILED: {sim_err}")
        db_m.complete_sim_history(
            sim_id=sim_id,
            status="FAILED",
            failure_reason=str(sim_err),
            duration_ms=int((time.time() - t0) * 1000),
        )
        return {"success": False, "vitals": {}, "sim_id": sim_id}


# ---------------------------------------------------------------------------
# Distributed soft-lock using a file-based mechanism (Redis-free)
# One lock file per user prevents duplicate concurrent runs.
# ---------------------------------------------------------------------------

_LOCK_DIR: Optional[Path] = None

def _get_lock_dir() -> Path:
    global _LOCK_DIR
    if _LOCK_DIR is None:
        from biogears_service.simulation.config import BASE_DIR
        _LOCK_DIR = BASE_DIR / "biogears_service" / "sim_locks"
        _LOCK_DIR.mkdir(parents=True, exist_ok=True)
    return _LOCK_DIR


def _acquire_user_lock(user_id: str, ttl_seconds: int = 300) -> bool:
    """
    Attempt to acquire a per-user simulation lock.
    Returns True if acquired, False if already locked.
    Lock expires automatically after ttl_seconds.
    """
    lock_file = _get_lock_dir() / f"{user_id}.lock"
    now = time.time()
    try:
        if lock_file.exists():
            # Check if stale
            age = now - lock_file.stat().st_mtime
            if age < ttl_seconds:
                return False  # still active
            lock_file.unlink()  # stale — remove it

        lock_file.write_text(str(now))
        return True
    except Exception as e:
        logger.warning(f"Lock acquisition failed for {user_id}: {e}")
        return False


def _release_user_lock(user_id: str):
    lock_file = _get_lock_dir() / f"{user_id}.lock"
    try:
        if lock_file.exists():
            lock_file.unlink()
    except Exception:
        pass


# ---------------------------------------------------------------------------
# CORE SCHEDULER LOGIC
# ---------------------------------------------------------------------------

class DPSSScheduler:
    """
    Background scheduler thread for the Deferred Physiology Sync System.

    Thread-safe singleton. Start once with DPSSScheduler.start().
    """

    _instance: Optional["DPSSScheduler"] = None
    _lock = threading.Lock()

    def __init__(self):
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._last_midnight_date: Optional[datetime.date] = None

    @classmethod
    def start(cls) -> "DPSSScheduler":
        with cls._lock:
            if cls._instance is None:
                cls._instance = cls()
                cls._instance._spawn()
            return cls._instance

    def _spawn(self):
        self._thread = threading.Thread(
            target=self._run_loop,
            name="DPSSScheduler",
            daemon=True,
        )
        self._thread.start()
        logger.info("🕐 DPSS Scheduler started.")

    def stop(self):
        self._stop_event.set()

    def _run_loop(self):
        """Main loop: runs every 10 minutes."""
        while not self._stop_event.is_set():
            try:
                self._tick()
            except Exception as loop_err:
                logger.error(f"DPSS Scheduler loop error: {loop_err}")
            # Sleep in 30-second increments so stop() responds quickly
            for _ in range(20):  # 20 × 30s = 10 min
                if self._stop_event.is_set():
                    break
                time.sleep(30)

    def _tick(self):
        """Called every 10 minutes."""
        now = datetime.datetime.now()
        today = now.date()

        # 1. Evaluate readiness and send SIM_READY notifications
        self._evaluate_readiness()

        # 2. Midnight sweep / Day-change catchup
        # Trigger if either self._last_midnight_date is None (first run after startup)
        # OR if a new day has started (today != self._last_midnight_date)
        if self._last_midnight_date != today:
            logger.info(f"🌙 Midnight sweep/catchup for {today} (last run: {self._last_midnight_date})")
            self._midnight_sweep()
            self._last_midnight_date = today

    def _evaluate_readiness(self):
        """
        For every user with PENDING events, check if they're ready to simulate
        and haven't been notified yet. If so, push a SIM_READY notification.
        """
        db = _db()
        try:
            user_ids = db.get_users_with_pending_events() or []
        except Exception as e:
            logger.warning(f"evaluate_readiness DB error: {e}")
            return

        for user_id in user_ids:
            try:
                self._maybe_notify_ready(user_id, db)
            except Exception as e:
                logger.warning(f"[{user_id}] readiness check error: {e}")

    def _maybe_notify_ready(self, user_id: str, db):
        """Send SIM_READY notification if threshold is met and not already notified today."""
        count = db.count_pending_events(user_id) or 0
        if count < 3:
            return  # Not enough events yet

        # Check if we already sent a SIM_READY notification today
        today_str = datetime.date.today().isoformat()
        existing = db.get_notifications(user_id, limit=10) or []
        already_sent = any(
            n["notif_type"] in ("SIM_READY", "MULTIPLE_PENDING") and
            n["sim_date"] == today_str and
            n["status"] == "UNREAD"
            for n in existing
        )
        if already_sent:
            return

        # Check the scheduler state — don't spam if simulated recently
        sched = db.get_scheduler_state(user_id)
        if sched and sched.get("last_simulated_at"):
            last_sim = sched["last_simulated_at"]
            try:
                if isinstance(last_sim, str):
                    last_sim_dt = datetime.datetime.fromisoformat(last_sim)
                else:
                    last_sim_dt = last_sim
                if last_sim_dt.tzinfo is None:
                    last_sim_dt = last_sim_dt.replace(tzinfo=datetime.timezone.utc)
                hours_since = (datetime.datetime.now(datetime.timezone.utc) - last_sim_dt).total_seconds() / 3600
                if hours_since < 4:
                    return  # Simulated less than 4 hours ago
            except Exception:
                pass

        notif_type = "MULTIPLE_PENDING" if count > 10 else "SIM_READY"
        profile_name = _resolve_profile_name(user_id)
        db.create_dpss_notification(
            user_id=user_id,
            notif_type=notif_type,
            sim_date=today_str,
            profile_name=profile_name,
            payload={
                "title": f"🧬 Physiology Ready to Sync ({profile_name})",
                "body": f"{profile_name} has {count} unprocessed health events. Tap to synchronize their Digital Twin.",
                "pending_count": count,
                "action": "open_twin",
            },
        )
        db.upsert_scheduler_state(user_id, pending_event_count=count)
        logger.info(f"[{user_id}] SIM_READY notification created (pending={count})")

    def _midnight_sweep(self):
        """
        Auto-simulate every user who still has PENDING events from prior to today.
        Also runs automatic baseline calibration for any days the user missed
        (e.g., if they didn't log any events and ignored notifications for several days).
        Handles multi-day gaps by chaining simulations in chronological order.
        """
        db = _db()
        from biogears_service.api.db import list_profiles
        try:
            profiles = list_profiles() or {}
            user_ids = list(profiles.keys()) if profiles else []
        except Exception as e:
            logger.warning(f"midnight_sweep list_profiles error: {e}")
            try:
                user_ids = db.get_users_with_pending_events() or []
            except Exception:
                user_ids = []

        logger.info(f"🌙 Midnight sweep: checking {len(user_ids)} digital twins.")

        for user_id in user_ids:
            if not _acquire_user_lock(user_id, ttl_seconds=600):
                logger.info(f"[{user_id}] Skipping — simulation already running.")
                continue
            try:
                self._auto_simulate_user(user_id, db)
            except Exception as e:
                logger.error(f"[{user_id}] Auto-sim error: {e}")
            finally:
                _release_user_lock(user_id)

    def _auto_simulate_user(self, user_id: str, db):
        """
        Run the automatic simulation for a user.
        Groups pending events by calendar day and chains them sequentially
        to maintain physiological continuity across multi-day gaps.
        If a day was missed (no user-logged events), automatically generates
        and simulates standard baseline routine events to keep twin calibrated.
        """
        today = datetime.date.today()
        pending = db.get_pending_events(user_id) or []

        # Group existing pending events by calendar day
        from collections import defaultdict
        days = defaultdict(list)
        for event in pending:
            ts = event.get("event_timestamp", "")
            try:
                if isinstance(ts, (datetime.datetime, datetime.date)):
                    day_str = ts.strftime("%Y-%m-%d")
                else:
                    day_str = str(ts)[:10]  # YYYY-MM-DD
                days[day_str].append(event)
            except Exception:
                days[str(today)].append(event)

        # Find the gap between last simulated date and today
        snap = db.get_latest_snapshot(user_id)
        if snap and snap.get("sim_date"):
            try:
                last_sim_date = datetime.date.fromisoformat(snap["sim_date"])
            except Exception:
                last_sim_date = today - datetime.timedelta(days=1)
        else:
            # If no snapshot exists yet, default to yesterday
            last_sim_date = today - datetime.timedelta(days=1)

        # Collect all days to process chronologically (last_sim_date + 1 up to today - 1)
        days_to_process = []
        curr = last_sim_date + datetime.timedelta(days=1)
        while curr < today:
            days_to_process.append(curr.strftime("%Y-%m-%d"))
            curr += datetime.timedelta(days=1)

        # Ensure we also process any day before today that has pending events
        for d in days.keys():
            if d < today.strftime("%Y-%m-%d") and d not in days_to_process:
                days_to_process.append(d)

        days_to_process = sorted(list(set(days_to_process)))

        if not days_to_process:
            # If there are no historical missed days, but there are pending events from today,
            # we only auto-simulate if there is a pending event count.
            # Otherwise return.
            if pending:
                days_to_process = sorted(list(days.keys()))
            else:
                return

        for day_str in days_to_process:
            day_events = days[day_str]
            
            # Convert events to plain dicts for the engine
            events_raw = []
            
            if not day_events:
                day_date = datetime.date.fromisoformat(day_str)
                # Check for a saved default routine in profile metadata
                profile = None
                try:
                    from biogears_service.api import db as biogears_db
                    profile = biogears_db.get_profile(user_id)
                except Exception as e:
                    logger.warning(f"[{user_id}] Error reading profile for default routine: {e}")

                default_routine_events = profile.get("default_routine") if profile else None
                
                if default_routine_events and isinstance(default_routine_events, list):
                    logger.info(f"[{user_id}] Generating events using default routine 'My Saved State' for missed day {day_str}")
                    events_raw = []
                    for ev in default_routine_events:
                        if not isinstance(ev, dict):
                            continue
                        mapped_ev = _map_routine_event_to_date(ev, day_date)
                        if mapped_ev:
                            events_raw.append(mapped_ev)
                
                if not events_raw:
                    # Fallback to generating standard baseline events.
                    logger.info(f"[{user_id}] Generating baseline calibration events for missed day {day_str}")
                    t_8_00 = int(datetime.datetime.combine(day_date, datetime.time(8, 0)).timestamp())
                    t_8_30 = int(datetime.datetime.combine(day_date, datetime.time(8, 30)).timestamp())
                    t_12_30 = int(datetime.datetime.combine(day_date, datetime.time(12, 30)).timestamp())
                    t_17_30 = int(datetime.datetime.combine(day_date, datetime.time(17, 30)).timestamp())
                    t_23_00 = int(datetime.datetime.combine(day_date, datetime.time(23, 0)).timestamp())

                    events_raw = [
                        {"event_type": "water", "value": 250.0, "timestamp": t_8_00, "notes": "Baseline hydration"},
                        {"event_type": "meal", "value": 500.0, "timestamp": t_8_30, "meal_type": "balanced", "carb_g": 60, "fat_g": 15, "protein_g": 20, "notes": "Baseline breakfast"},
                        {"event_type": "water", "value": 300.0, "timestamp": t_12_30, "notes": "Baseline hydration"},
                        {"event_type": "meal", "value": 700.0, "timestamp": t_12_30, "meal_type": "balanced", "carb_g": 85, "fat_g": 22, "protein_g": 28, "notes": "Baseline lunch"},
                        {"event_type": "water", "value": 300.0, "timestamp": t_17_30, "notes": "Baseline hydration"},
                        {"event_type": "meal", "value": 800.0, "timestamp": t_17_30, "meal_type": "balanced", "carb_g": 100, "fat_g": 25, "protein_g": 35, "notes": "Baseline dinner"},
                        {"event_type": "sleep", "value": 8.0, "timestamp": t_23_00, "duration_seconds": 28800, "notes": "Baseline sleep"}
                    ]
            else:
                logger.info(f"[{user_id}] Auto-simulating day {day_str} ({len(day_events)} events)")
                for e in day_events:
                    payload = e.get("payload", {})
                    if isinstance(payload, str):
                        import json
                        try:
                            payload = json.loads(payload)
                        except Exception:
                            payload = {}
                    ts_val = payload.get("timestamp")
                    if ts_val is None:
                        ts_val = _parse_event_timestamp_to_unix(e.get("event_timestamp"))
                    row = {
                        "event_id": e.get("event_id"),
                        "event_type": e.get("event_type"),
                        "value": payload.get("value", 0),
                        "timestamp": ts_val,
                        "time_offset": payload.get("time_offset"),
                        "substance_name": payload.get("substance_name"),
                        "unit": payload.get("unit"),
                        "meal_type": payload.get("meal_type"),
                        "carb_g": payload.get("carb_g"),
                        "fat_g": payload.get("fat_g"),
                        "protein_g": payload.get("protein_g"),
                        "duration_seconds": payload.get("duration_seconds"),
                        "notes": payload.get("notes"),
                    }
                    events_raw.append({k: v for k, v in row.items() if v is not None})

            result = _run_sim(user_id, events_raw, sim_type="AUTOMATIC", sim_date=day_str)

            # Create an AUTO_COMPLETED notification
            today_str = datetime.date.today().isoformat()
            profile_name = _resolve_profile_name(user_id)
            db.create_dpss_notification(
                user_id=user_id,
                notif_type="AUTO_COMPLETED" if result["success"] else "SIM_FAILED",
                sim_date=day_str,
                profile_name=profile_name,
                payload={
                    "title": (
                        f"✅ Auto-Sync Complete ({profile_name})"
                        if result["success"]
                        else f"❌ Sync Failed ({profile_name})"
                    ),
                    "body": (
                        f"{profile_name}'s physiology for {day_str} was automatically synchronized."
                        if result["success"]
                        else f"Auto-sync for {day_str} failed ({profile_name}). Please run manually."
                    ),
                    "sim_id": result.get("sim_id"),
                    "vitals": result.get("vitals", {}),
                },
            )

            if not result["success"]:
                logger.error(f"[{user_id}] Auto-sim FAILED for day {day_str}. Stopping chain.")
                break  # Do not continue chaining on failure


# ---------------------------------------------------------------------------
# PUBLIC API — called from server.py startup
# ---------------------------------------------------------------------------

def start_scheduler():
    """Start the DPSS background scheduler. Safe to call multiple times."""
    DPSSScheduler.start()


def trigger_midnight_sweep_now():
    """Force an immediate midnight sweep (for testing or admin use)."""
    sched = DPSSScheduler.start()
    t = threading.Thread(target=sched._midnight_sweep, daemon=True)
    t.start()
    logger.info("🌙 Manual midnight sweep triggered.")


def trigger_readiness_check_now():
    """Force an immediate readiness evaluation."""
    sched = DPSSScheduler.start()
    t = threading.Thread(target=sched._evaluate_readiness, daemon=True)
    t.start()
