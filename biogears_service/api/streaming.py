"""
streaming.py — Server-Sent Events (SSE) streaming for long-running BioGears simulations.

Architecture:
  POST /stream/start  → starts BioGears in a daemon thread, returns stream_id immediately
  GET  /stream/{stream_id}  → SSE endpoint; client connects with EventSource and receives:
      • {"type":"status",  "message":"..."}         — engine lifecycle messages
      • {"type":"vitals",  "time":N, "hr":X, ...}  — live vitals as CSV rows appear
      • {"type":"done",    "vitals":{...}, "report_url":"..."} — final summary
      • {"type":"error",   "message":"..."}         — if engine fails

BioGears writes the CSV progressively if it flushes stdout; we attempt row-by-row tailing.
If BioGears buffers the whole file, we still stream status updates and the final burst.

Fixes vs v1:
  - Correct sort key: events sorted by 'timestamp' (not 'time_offset' which is None for most)
  - build_batch_reconstruction returns 3 values (path, run_id, csv_prefix) — now unpacked correctly
  - Added './' prefix to bg-cli command so shell finds the binary in cwd (not in $PATH)
  - Added LD_LIBRARY_PATH injection so bg-cli can find libbiogears.so on Linux
  - CSV search now uses csv_prefix from scenario_builder (not the hardcoded batch_{user_id} name)
"""

import os
import json
import time
import uuid
import shutil
import asyncio
import datetime
import threading
import subprocess
import pandas as pd
from pathlib import Path
from typing import Dict, Any, Optional, AsyncGenerator

from biogears_service.simulation.config import (
    BIOGEARS_EXECUTABLE, BIOGEARS_BIN_DIR,
    USER_STATES_DIR, USER_HISTORY_DIR
)
from biogears_service.simulation import scenario_builder, visualizer
from biogears_service.api import db

BASE_URL = os.environ.get("SERVER_BASE_URL", "http://127.0.0.1:8000").rstrip("/")

# ---------------------------------------------------------------------------
# In-memory stream job store
# stream_id → {status, csv_prefix, dest_csv, user_id, error, process}
# ---------------------------------------------------------------------------
_stream_jobs: Dict[str, Dict[str, Any]] = {}


# ---------------------------------------------------------------------------
# NON-BLOCKING ENGINE RUNNER
# Runs bg-cli in a daemon thread; updates job record on completion.
# ---------------------------------------------------------------------------
def _engine_thread(job_id: str, scenario_path: str, user_id: str,
                   csv_prefix: str, dest_csv: Path, state_file: Path):
    """Worker thread: runs BioGears and finalises the job record."""
    job = _stream_jobs[job_id]
    try:
        rel_scenario = os.path.relpath(scenario_path, BIOGEARS_BIN_DIR)
        # Use "./" prefix so the shell resolves the binary relative to BIOGEARS_BIN_DIR.
        # Without it, the shell searches $PATH and fails to find bg-cli.
        command = f'"./{BIOGEARS_EXECUTABLE.name}" Scenario "{rel_scenario}"'

        # Inject LD_LIBRARY_PATH so bg-cli finds libbiogears.so and libboost_filesystem.so
        env = os.environ.copy()
        lib_path = f"{BIOGEARS_BIN_DIR}/lib:{BIOGEARS_BIN_DIR}/bin"
        if "LD_LIBRARY_PATH" in env:
            env["LD_LIBRARY_PATH"] = f"{lib_path}:{env['LD_LIBRARY_PATH']}"
        else:
            env["LD_LIBRARY_PATH"] = lib_path

        proc = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            shell=True,
            cwd=str(BIOGEARS_BIN_DIR),
            env=env,
        )
        job["process"] = proc
        job["status"] = "running"

        # Drain stdout so the process doesn't block on a full pipe
        for line in proc.stdout:
            pass  # Engine output already visible in server console via engine_runner for the main path

        proc.wait()

        if proc.returncode != 0:
            job["status"] = "failed"
            job["error"] = f"Engine exited with code {proc.returncode}"
            return

        # --- Locate and move the output CSV ---
        # Use csv_prefix from scenario_builder (e.g. "batch_alice_1746527823")
        target_filename = f"{csv_prefix}Results.csv"
        found_csv: Optional[Path] = None
        for _ in range(12):   # up to 12s
            candidates = list(BIOGEARS_BIN_DIR.rglob(target_filename))
            if candidates:
                found_csv = candidates[0]
                break
            time.sleep(1)

        if not found_csv:
            job["status"] = "failed"
            job["error"] = f"Engine output CSV '{target_filename}' not found after completion."
            return

        dest_csv.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(str(found_csv), str(dest_csv))
        os.remove(str(found_csv))

        # --- Update engine state ---
        # scenario_builder saves the state as batch_{user_id}.xml in BIOGEARS_BIN_DIR
        updated_state = f"batch_{user_id}.xml"
        state_candidates = list(BIOGEARS_BIN_DIR.rglob(updated_state))
        if state_candidates:
            try:
                os.replace(str(state_candidates[0]), str(state_file))
            except Exception:
                pass

        # --- Generate report ---
        report_url = visualizer.generate_health_report(user_id, custom_path=dest_csv)

        # --- Parse final vitals ---
        df = pd.read_csv(dest_csv, index_col=False)
        df = df.loc[:, ~df.columns.str.contains('^Unnamed')]
        df.columns = [c.split('(')[0].strip() for c in df.columns]
        latest = df.iloc[-1].to_dict()

        def _safe(k):
            try:
                v = float(latest.get(k, 0))
                return 0.0 if (v != v) else v   # NaN check without math import
            except (TypeError, ValueError):
                return 0.0

        vitals = {
            "heart_rate":     round(_safe("HeartRate"), 1),
            "blood_pressure": f"{int(_safe('SystolicArterialPressure'))}/{int(_safe('DiastolicArterialPressure'))}",
            "glucose":        round(_safe("Glucose-BloodConcentration"), 2),
            "respiration":    round(_safe("RespirationRate"), 1),
            "spo2":           round(_safe("OxygenSaturation") * 100, 1),
        }

        job["status"]     = "done"
        job["vitals"]     = vitals
        job["report_url"] = report_url
        job["dest_csv"]   = dest_csv

    except Exception as e:
        job["status"] = "failed"
        job["error"]  = str(e)


# ---------------------------------------------------------------------------
# PUBLIC: Start a streaming simulation
# ---------------------------------------------------------------------------
def start_stream(user_id: str, events: list) -> Dict[str, Any]:
    """
    Validates the twin exists, builds the scenario, kicks off the engine
    thread, and returns a stream_id the client can use to connect via SSE.
    """
    state_file = USER_STATES_DIR / f"{user_id}.xml"
    if not state_file.exists():
        raise FileNotFoundError(f"Twin '{user_id}' not found.")

    # Normalise events to dicts and assign timestamps
    now_ts = time.time()
    event_dicts = []
    for e in events:
        d = e if isinstance(e, dict) else e.dict()
        # Prefer explicit timestamp; fall back to time_offset (seconds from now)
        if not d.get("timestamp"):
            d["timestamp"] = now_ts + (d.get("time_offset") or 0)
        event_dicts.append(d)

    # Sort by timestamp (the field actually populated — time_offset is deprecated)
    sorted_events = sorted(event_dicts, key=lambda x: float(x.get("timestamp") or 0))

    # build_batch_reconstruction returns (path, run_id, csv_prefix)
    scenario_path, run_id, csv_prefix = scenario_builder.build_batch_reconstruction(
        user_id, str(state_file), sorted_events
    )

    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    dest_csv = USER_HISTORY_DIR / user_id / f"vitals_{timestamp}.csv"

    job_id = str(uuid.uuid4())
    _stream_jobs[job_id] = {
        "status":     "pending",
        "user_id":    user_id,
        "csv_prefix": csv_prefix,
        "dest_csv":   dest_csv,
        "vitals":     None,
        "report_url": None,
        "error":      None,
        "process":    None,
    }

    thread = threading.Thread(
        target=_engine_thread,
        args=(job_id, scenario_path, user_id, csv_prefix, dest_csv, state_file),
        daemon=True
    )
    thread.start()

    return {"stream_id": job_id, "user_id": user_id}


# ---------------------------------------------------------------------------
# SSE GENERATOR — async generator that yields SSE-formatted strings
# ---------------------------------------------------------------------------
def _sse(event_type: str, data: Dict[str, Any]) -> str:
    """Formats a single SSE message."""
    payload = json.dumps({"type": event_type, **data})
    return f"data: {payload}\n\n"


async def sse_generator(stream_id: str) -> AsyncGenerator[str, None]:
    """
    Async generator for the SSE response.
    - Yields status updates while engine is pending/running
    - Tails the output CSV and streams vitals rows as they appear
    - Sends a final 'done' or 'error' event and stops
    """
    job = _stream_jobs.get(stream_id)
    if not job:
        yield _sse("error", {"message": f"Stream '{stream_id}' not found."})
        return

    yield _sse("status", {"message": "Simulation queued. Waiting for engine..."})

    # --- Wait for engine to start ---
    for _ in range(30):  # up to 15 seconds
        if job["status"] in ("running", "done", "failed"):
            break
        await asyncio.sleep(0.5)

    if job["status"] == "failed":
        yield _sse("error", {"message": job.get("error", "Engine failed to start.")})
        return

    yield _sse("status", {"message": "BioGears engine started. Streaming vitals..."})

    # --- Tail-read the CSV ---
    # BioGears may flush rows as it runs; we poll every 500ms for new lines.
    rows_sent = 0
    csv_path: Optional[Path] = None
    last_check = time.time()
    csv_prefix = job.get("csv_prefix", "")

    while True:
        status = job["status"]

        # Try to find the in-progress CSV using the correct prefix
        if csv_path is None and csv_prefix:
            target = f"{csv_prefix}Results.csv"
            candidates = list(BIOGEARS_BIN_DIR.rglob(target))
            if candidates:
                csv_path = Path(candidates[0])

        # Read new rows from the in-progress CSV
        if csv_path and csv_path.exists():
            try:
                df = pd.read_csv(csv_path, on_bad_lines="skip", index_col=False)
                df = df.loc[:, ~df.columns.str.contains('^Unnamed')]
                df.columns = [c.split('(')[0].strip() for c in df.columns]
                new_rows = df.iloc[rows_sent:]
                for _, row in new_rows.iterrows():
                    vital_event = {
                        "time":        round(float(row.get("Time", 0)), 1),
                        "heart_rate":  round(float(row.get("HeartRate", 0)), 1),
                        "glucose":     round(float(row.get("Glucose-BloodConcentration", 0)), 2),
                        "systolic":    round(float(row.get("SystolicArterialPressure", 0)), 1),
                        "diastolic":   round(float(row.get("DiastolicArterialPressure", 0)), 1),
                        "respiration": round(float(row.get("RespirationRate", 0)), 1),
                    }
                    yield _sse("vitals", vital_event)
                rows_sent += len(new_rows)
            except Exception:
                pass  # CSV may be mid-write; retry next loop

        # Send a heartbeat every 5s so the connection stays alive
        if time.time() - last_check > 5:
            if status == "running":
                yield _sse("status", {"message": "Engine running...", "rows_streamed": rows_sent})
            last_check = time.time()

        # Check for terminal states
        if status == "done":
            # One final pass to catch any remaining rows from dest_csv
            dest = job.get("dest_csv")
            if dest and Path(dest).exists():
                try:
                    df = pd.read_csv(dest, index_col=False)
                    df = df.loc[:, ~df.columns.str.contains('^Unnamed')]
                    df.columns = [c.split('(')[0].strip() for c in df.columns]
                    remaining = df.iloc[rows_sent:]
                    for _, row in remaining.iterrows():
                        yield _sse("vitals", {
                            "time":        round(float(row.get("Time", 0)), 1),
                            "heart_rate":  round(float(row.get("HeartRate", 0)), 1),
                            "glucose":     round(float(row.get("Glucose-BloodConcentration", 0)), 2),
                            "systolic":    round(float(row.get("SystolicArterialPressure", 0)), 1),
                            "diastolic":   round(float(row.get("DiastolicArterialPressure", 0)), 1),
                            "respiration": round(float(row.get("RespirationRate", 0)), 1),
                        })
                except Exception:
                    pass

            yield _sse("done", {
                "status":       "success",
                "vitals":       job.get("vitals"),
                "report_url":   job.get("report_url"),
                "rows_streamed": rows_sent,
            })
            break

        if status == "failed":
            yield _sse("error", {"message": job.get("error", "Simulation failed.")})
            break

        await asyncio.sleep(0.5)
