"""
dpss_router.py — Deferred Physiology Synchronization System REST API

All DPSS endpoints are mounted under /dpss/* prefix.
Mount in server.py with:  app.include_router(dpss_router)
"""

import datetime
import time
import shutil
import threading
import logging
from pathlib import Path
from typing import List, Optional, Any, Dict

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel, field_validator
import re

logger = logging.getLogger("DPSS.Router")

dpss_router = APIRouter(prefix="/dpss", tags=["DPSS"])


# ---------------------------------------------------------------------------
# Auth dependency — re-use the one defined in server.py
# ---------------------------------------------------------------------------

def _auth():
    from biogears_service.api.server import require_api_key
    return require_api_key


def _db():
    from biogears_service.api import dpss_db
    return dpss_db


def _sched():
    from biogears_service.api import dpss_scheduler
    return dpss_scheduler


def _cfg():
    from biogears_service.simulation.config import USER_STATES_DIR
    return USER_STATES_DIR


# ---------------------------------------------------------------------------
# REQUEST / RESPONSE MODELS
# ---------------------------------------------------------------------------

class SanitizedRequestModel(BaseModel):
    @field_validator("user_id", check_fields=False)
    @classmethod
    def validate_user_id(cls, v: str) -> str:
        if not re.match(r'^[a-zA-Z0-9_\-\.]+$', v) or '..' in v:
            raise ValueError("Invalid user_id. Use only alphanumerics, underscores, hyphens, and dots.")
        return v

class StageEventRequest(SanitizedRequestModel):
    user_id: str
    event_type: str
    event_timestamp: str           # ISO-8601 e.g. "2026-07-06T08:30:00"
    payload: Dict[str, Any]
    device_id: str = "app"
    sequence_num: int = 0


class StageBatchRequest(SanitizedRequestModel):
    user_id: str
    events: List[StageEventRequest]


class RunSimulationRequest(SanitizedRequestModel):
    user_id: str
    initiated_by: Optional[str] = "user"


class UndoRequest(SanitizedRequestModel):
    user_id: str


class NotificationStatusRequest(BaseModel):
    notification_id: str
    status: str                    # UNREAD | READ | ACTIONED | DISMISSED


# ---------------------------------------------------------------------------
# HELPER — per-user run lock (re-uses dpss_scheduler's lock primitives)
# ---------------------------------------------------------------------------

def _try_run_sim_background(
    user_id: str,
    events_raw: list,
    sim_type: str,
    db,
    background_tasks: BackgroundTasks,
    initiated_by: str = "user",
) -> dict:
    """
    Queue a simulation in a background task. Returns immediately with sim_id.
    """
    from biogears_service.api.dpss_scheduler import _acquire_user_lock, _release_user_lock, _run_sim

    if not _acquire_user_lock(user_id, ttl_seconds=600):
        raise HTTPException(
            status_code=409,
            detail="A simulation is already running for this user. Please wait for it to complete."
        )

    # Create a RUNNING history entry now (before background task fires)
    sim_id = db.create_sim_history(
        user_id=user_id,
        sim_type=sim_type,
        initiated_by=initiated_by,
    )

    def _task():
        try:
            result = _run_sim(user_id, events_raw, sim_type=sim_type)
            # Notify completion
            today_str = datetime.date.today().isoformat()
            db.create_dpss_notification(
                user_id=user_id,
                notif_type="RERUN_COMPLETED" if sim_type == "REPLAY" else "AUTO_COMPLETED",
                sim_date=today_str,
                payload={
                    "title": "✅ Simulation Complete",
                    "body": "Your Digital Twin has been updated.",
                    "sim_id": result.get("sim_id"),
                    "vitals": result.get("vitals", {}),
                },
            )
        except Exception as e:
            logger.error(f"[{user_id}] Background sim task failed: {e}")
        finally:
            _release_user_lock(user_id)

    background_tasks.add_task(_task)
    return {"sim_id": sim_id, "status": "RUNNING"}


# ---------------------------------------------------------------------------
# ENDPOINTS
# ---------------------------------------------------------------------------

# ── 1. STAGE A SINGLE EVENT ──────────────────────────────────────────────────

@dpss_router.post("/events/stage", summary="Stage a health event for deferred simulation")
async def stage_event(req: StageEventRequest, auth=Depends(lambda: _auth())):
    db = _db()
    event_id = db.insert_pending_event(
        user_id=req.user_id,
        event_type=req.event_type,
        event_timestamp=req.event_timestamp,
        payload=req.payload,
        device_id=req.device_id,
        sequence_num=req.sequence_num,
    )
    db.upsert_scheduler_state(
        req.user_id,
        pending_event_count=db.count_pending_events(req.user_id),
    )
    # Trigger readiness check asynchronously
    t = threading.Thread(
        target=_db().count_pending_events,  # cheap ping
        args=(req.user_id,),
        daemon=True,
    )
    t.start()
    return {"event_id": event_id, "status": "PENDING"}


# ── 2. STAGE A BATCH OF EVENTS ────────────────────────────────────────────────

@dpss_router.post("/events/stage/batch", summary="Stage a batch of health events")
async def stage_batch(req: StageBatchRequest, auth=Depends(lambda: _auth())):
    db = _db()
    results = []
    for ev in req.events:
        event_id = db.insert_pending_event(
            user_id=req.user_id,
            event_type=ev.event_type,
            event_timestamp=ev.event_timestamp,
            payload=ev.payload,
            device_id=ev.device_id,
            sequence_num=ev.sequence_num,
        )
        results.append({"event_id": event_id, "status": "PENDING"})
    db.upsert_scheduler_state(
        req.user_id,
        pending_event_count=db.count_pending_events(req.user_id),
    )
    return {"staged": results, "count": len(results)}


# ── 3. GET PENDING EVENTS ─────────────────────────────────────────────────────

@dpss_router.get("/events/pending/{user_id}", summary="Get all pending unprocessed events")
def get_pending(user_id: str, auth=Depends(lambda: _auth())):
    db = _db()
    events = db.get_pending_events(user_id) or []
    return {"user_id": user_id, "pending_count": len(events), "events": events}


# ── 4. MANUALLY RUN SIMULATION ────────────────────────────────────────────────

@dpss_router.post("/simulation/run", summary="Manually trigger simulation for pending events")
async def run_simulation(req: RunSimulationRequest, background_tasks: BackgroundTasks, auth=Depends(lambda: _auth())):
    db = _db()
    events = db.get_pending_events(req.user_id) or []
    if not events:
        raise HTTPException(
            status_code=404,
            detail="No pending events found. Stage events first using /dpss/events/stage."
        )

    # Validate state file exists
    USER_STATES_DIR = _cfg()
    state_file = USER_STATES_DIR / f"{req.user_id}.xml"
    gz_file = USER_STATES_DIR / f"{req.user_id}.xml.gz"
    if not state_file.exists() and not gz_file.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Twin '{req.user_id}' not found. Register first."
        )

    from biogears_service.api.dpss_scheduler import _parse_event_timestamp_to_unix

    # Convert DB events to raw dicts
    events_raw = []
    for e in events:
        payload = e.get("payload", {})
        ts_val = payload.get("timestamp")
        if ts_val is None:
            ts_val = _parse_event_timestamp_to_unix(e.get("event_timestamp"))
        row = {
            "event_id": e.get("event_id"),
            "event_type": e.get("event_type"),
            "value": payload.get("value", 0),
            "timestamp": ts_val,
            "substance_name": payload.get("substance_name"),
            "unit": payload.get("unit"),
            "meal_type": payload.get("meal_type"),
            "carb_g": payload.get("carb_g"),
            "fat_g": payload.get("fat_g"),
            "protein_g": payload.get("protein_g"),
            "duration_seconds": payload.get("duration_seconds"),
        }
        events_raw.append({k: v for k, v in row.items() if v is not None})

    result = _try_run_sim_background(
        user_id=req.user_id,
        events_raw=events_raw,
        sim_type="MANUAL",
        db=db,
        background_tasks=background_tasks,
        initiated_by=req.initiated_by or "user",
    )
    return {"status": "accepted", **result}


# ── 5. UNDO LAST SIMULATION ───────────────────────────────────────────────────

@dpss_router.post("/simulation/undo", summary="Rollback the last simulation to its pre-sim checkpoint")
def undo_simulation(req: UndoRequest, auth=Depends(lambda: _auth())):
    db = _db()
    USER_STATES_DIR = _cfg()

    # Fetch the most recent successful snapshot
    snap = db.get_latest_snapshot(req.user_id)
    if not snap:
        raise HTTPException(
            status_code=404,
            detail="No successful simulation snapshot found. Nothing to undo."
        )

    pre_state_path = snap.get("pre_state_path", "")
    if not pre_state_path or not Path(pre_state_path).exists():
        raise HTTPException(
            status_code=404,
            detail="Pre-simulation backup file not found. Cannot restore checkpoint."
        )

    # Restore the pre-sim state
    state_file = USER_STATES_DIR / f"{req.user_id}.xml"
    gz_file = USER_STATES_DIR / f"{req.user_id}.xml.gz"

    pre_path = Path(pre_state_path)
    try:
        if pre_path.suffix == ".gz":
            if gz_file.exists():
                gz_file.unlink()
            if state_file.exists():
                state_file.unlink()
            shutil.copy2(str(pre_path), str(gz_file))
        else:
            if state_file.exists():
                state_file.unlink()
            shutil.copy2(str(pre_path), str(state_file))
        logger.info(f"⏪ [{req.user_id}] State restored from: {pre_path.name}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"State restore failed: {e}")

    # Rollback event statuses to PENDING
    event_ids = snap.get("input_event_ids", []) or []
    if event_ids:
        db.restore_events_to_pending(event_ids)

    # Mark history entry as UNDONE
    db.mark_sim_undone(snap["sim_id"])

    # Delete the snapshot
    db.delete_snapshot(snap["snapshot_id"])

    # Emit notification
    today_str = datetime.date.today().isoformat()
    db.create_dpss_notification(
        user_id=req.user_id,
        notif_type="UNDONE",
        sim_date=today_str,
        payload={
            "title": "⏪ Simulation Rolled Back",
            "body": "Your Digital Twin has been restored to the previous checkpoint. You can now edit events and re-run.",
            "restored_from_sim_id": snap["sim_id"],
        },
    )

    snap_id = str(snap.get('snapshot_id', ''))[:8]
    logger.info(f"✅ [{req.user_id}] Undo complete. Snapshot {snap_id} removed.")
    return {
        "status": "success",
        "message": "Digital Twin restored to pre-simulation checkpoint.",
        "restored_from_sim_id": snap["sim_id"],
        "events_restored_to_pending": len(event_ids),
    }


# ── 6. SIMULATION HISTORY ─────────────────────────────────────────────────────

@dpss_router.get("/simulation/history/{user_id}", summary="Full DPSS simulation history for a user")
def sim_history(user_id: str, limit: int = 50, auth=Depends(lambda: _auth())):
    db = _db()
    records = db.get_sim_history(user_id, limit=limit) or []
    return {"user_id": user_id, "count": len(records), "history": records}


# ── 7. SIMULATION STATUS ──────────────────────────────────────────────────────

@dpss_router.get("/simulation/status/{user_id}", summary="Current DPSS sync status for a user")
def sim_status(user_id: str, auth=Depends(lambda: _auth())):
    db = _db()
    pending_count = db.count_pending_events(user_id) or 0
    sched = db.get_scheduler_state(user_id)
    snap = db.get_latest_snapshot(user_id)
    return {
        "user_id": user_id,
        "pending_event_count": pending_count,
        "last_simulated_at": sched.get("last_simulated_at") if sched else None,
        "latest_snapshot": {
            "snapshot_id": snap.get("snapshot_id"),
            "sim_date": snap.get("sim_date"),
            "vitals": snap.get("vitals_snapshot"),
        } if snap else None,
        "is_ready_to_simulate": pending_count >= 3,
    }


# ── 8. CHECKPOINTS LIST ───────────────────────────────────────────────────────

@dpss_router.get("/checkpoints/{user_id}", summary="List available undo checkpoints")
def list_checkpoints(user_id: str, auth=Depends(lambda: _auth())):
    db = _db()
    records = db.get_sim_history(user_id, limit=10) or []
    checkpoints = [
        {
            "sim_id": r["sim_id"],
            "sim_type": r["sim_type"],
            "started_at": r["started_at"],
            "status": r["status"],
            "post_vitals": r.get("post_vitals"),
        }
        for r in records
        if r["status"] == "SUCCESS"
    ]
    return {"user_id": user_id, "checkpoints": checkpoints}


# ── 9. NOTIFICATIONS ─────────────────────────────────────────────────────────

@dpss_router.get("/notifications/{user_id}", summary="DPSS notification log for a user")
def get_notifications(user_id: str, limit: int = 30, auth=Depends(lambda: _auth())):
    db = _db()
    notifs = db.get_notifications(user_id, limit=limit) or []
    return {"user_id": user_id, "count": len(notifs), "notifications": notifs}


@dpss_router.post("/notifications/status", summary="Update notification read/actioned status")
def update_notification_status(req: NotificationStatusRequest, auth=Depends(lambda: _auth())):
    allowed = {"UNREAD", "READ", "ACTIONED", "DISMISSED"}
    if req.status not in allowed:
        raise HTTPException(status_code=422, detail=f"status must be one of: {allowed}")
    db = _db()
    db.mark_notification_status(req.notification_id, req.status)
    return {"notification_id": req.notification_id, "status": req.status}


# ── 10. ADMIN — TRIGGER MIDNIGHT SWEEP ────────────────────────────────────────

@dpss_router.post("/admin/trigger-midnight-sweep", summary="Admin: immediately run the midnight auto-sync sweep")
def admin_trigger_sweep(auth=Depends(lambda: _auth())):
    sched = _sched()
    sched.trigger_midnight_sweep_now()
    return {"status": "triggered", "message": "Midnight sweep started in background."}


@dpss_router.post("/admin/trigger-readiness-check", summary="Admin: immediately evaluate sim readiness for all users")
def admin_trigger_readiness(auth=Depends(lambda: _auth())):
    sched = _sched()
    sched.trigger_readiness_check_now()
    return {"status": "triggered", "message": "Readiness check started in background."}
