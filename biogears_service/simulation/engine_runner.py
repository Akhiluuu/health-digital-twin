"""
engine_runner.py — BioGears subprocess launcher (v4).

Improvements vs v3:
  - Timeout configured via ENGINE_TIMEOUT_SECONDS env var (default 24h)
  - Expanded silent-failure detection: catches "Patient stabilization failed",
    "Serialization failed", "failed to stabilize", "[Fatal]", and more
  - Heartbeat interval exposed via env var ENGINE_HEARTBEAT_SECONDS
  - Better progress logging with elapsed time on every heartbeat
"""

import os
import subprocess
import datetime
import logging
import threading
import time
from pathlib import Path

from biogears_service.simulation.config import (
    BIOGEARS_EXECUTABLE, BIOGEARS_BIN_DIR, LOGS_DIR
)

logger = logging.getLogger("DigitalTwin.Engine")

# Default 24 hours — accommodates very long simulations on the VM.
# You can override this via ENGINE_TIMEOUT_SECONDS env var.
ENGINE_TIMEOUT_SECONDS   = int(os.environ.get("ENGINE_TIMEOUT_SECONDS", "86400"))
ENGINE_HEARTBEAT_SECONDS = int(os.environ.get("ENGINE_HEARTBEAT_SECONDS", "30"))

# BioGears output lines shown at INFO level (everything else at DEBUG)
_IMPORTANT_PREFIXES = (
    "Time:", "Simulation Time", "Completed", "Error", "Warning",
    "Physiology", "Patient", "Loading", "Running", "[Fatal]", "[ERROR]",
    "Serialization", "stabilize",
)

# Strings that indicate a silent failure even when exit code is 0.
# BioGears exits 0 even on XML parse errors, missing patient files, etc.
_FAILURE_STRINGS = (
    "Error while processing",
    "Unable to load",
    "no declaration found",
    "Patient stabilization failed",
    "failed to stabilize",
    "Serialization failed",
    "[Fatal]",
    "scenario failed",
    "Could not find",
    "unable to find",
    "Error reading",
)


class EngineResult:
    """Dict-like result that is truthy when the engine succeeded."""
    def __init__(self, success: bool, log_path: str, return_code: int):
        self.success     = success
        self.log_path    = log_path
        self.return_code = return_code

    def __bool__(self):
        return self.success

    def __repr__(self):
        return f"EngineResult(success={self.success}, rc={self.return_code})"


def _heartbeat(user_id: str, stop_evt: threading.Event, start_time: float,
               interval: int = ENGINE_HEARTBEAT_SECONDS):
    """Background thread: prints a progress line every `interval` seconds."""
    while not stop_evt.wait(interval):
        elapsed = round(time.time() - start_time, 0)
        logger.info(f"⏳  [{user_id}] BioGears still running... ({int(elapsed)}s elapsed)")


def run_biogears(scenario_path: str, user_id: str = "unknown") -> EngineResult:
    """
    Launches BioGears CLI for the given scenario file.
    Streams stdout in real-time and logs a heartbeat every 30s.
    """
    ts           = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    log_path     = LOGS_DIR / f"engine_{user_id}_{ts}.log"
    rel_scenario = os.path.relpath(scenario_path, BIOGEARS_BIN_DIR)
    # Use "./" prefix so the shell resolves the binary relative to BIOGEARS_BIN_DIR
    # (bg-cli is not on $PATH, only present in that directory).
    command      = f'"./{BIOGEARS_EXECUTABLE.name}" Scenario "{rel_scenario}"'

    logger.info("")
    logger.info("=" * 55)
    logger.info(f"🚀  [{user_id}] BioGears engine STARTING")
    logger.info(f"    Scenario : {rel_scenario}")
    logger.info(f"    Timeout  : {ENGINE_TIMEOUT_SECONDS}s max")
    logger.info("=" * 55)

    start_time = time.time()

    # Inject LD_LIBRARY_PATH so bg-cli can find libbiogears.so.7.3 and libboost_filesystem.so
    env = os.environ.copy()
    lib_path = f"{BIOGEARS_BIN_DIR}/lib:{BIOGEARS_BIN_DIR}/bin"
    if "LD_LIBRARY_PATH" in env:
        env["LD_LIBRARY_PATH"] = f"{lib_path}:{env['LD_LIBRARY_PATH']}"
    else:
        env["LD_LIBRARY_PATH"] = lib_path

    try:
        proc = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            shell=True,
            cwd=str(BIOGEARS_BIN_DIR),
            env=env,
            bufsize=1,      # line-buffered → real-time output
        )

        # ── Start heartbeat thread ───────────────────────────────────────────
        stop_heartbeat   = threading.Event()
        heartbeat_thread = threading.Thread(
            target=_heartbeat,
            args=(user_id, stop_heartbeat, start_time, ENGINE_HEARTBEAT_SECONDS),
            daemon=True,
        )
        heartbeat_thread.start()

        # ── Stream stdout lines in real-time ─────────────────────────────────
        output_lines = []
        timed_out    = False
        deadline     = start_time + ENGINE_TIMEOUT_SECONDS

        try:
            for line in proc.stdout:
                line = line.rstrip()
                if not line:
                    continue
                output_lines.append(line)

                # Enforce deadline on each line read
                if time.time() > deadline:
                    proc.kill()
                    proc.communicate()
                    timed_out = True
                    break

                # Important lines → INFO, rest → DEBUG
                stripped = line.strip()
                if any(stripped.startswith(p) or p.lower() in stripped.lower()
                       for p in _IMPORTANT_PREFIXES):
                    logger.info(f"⚙️   [{user_id}] {stripped}")
                else:
                    logger.debug(f"     {stripped}")

        except Exception as read_err:
            logger.warning(f"⚠️  Stream read error: {read_err}")
        finally:
            stop_heartbeat.set()
            heartbeat_thread.join(timeout=3)

        elapsed = round(time.time() - start_time, 1)

        if timed_out:
            logger.error(f"⏰  [{user_id}] Engine TIMEOUT after {elapsed}s — killed.")
            _write_log(log_path, output_lines + [f"[TIMEOUT after {elapsed}s]"])
            return EngineResult(success=False, log_path=str(log_path), return_code=-1)

        proc.wait(timeout=10)
        rc = proc.returncode

        # ── Detect "silent failure": engine exits 0 but scenario did not run ─
        # BioGears exits 0 even when it fails to parse the scenario XML.
        engine_failed = any(
            any(fail_str.lower() in line.lower() for fail_str in _FAILURE_STRINGS)
            for line in output_lines
        )
        success = (rc == 0) and not engine_failed

        _write_log(log_path, output_lines)

        logger.info("=" * 55)
        if success:
            logger.info(f"✅  [{user_id}] Engine FINISHED OK  ({elapsed}s)")
        elif engine_failed:
            logger.error(f"❌  [{user_id}] Engine SCENARIO ERROR ({elapsed}s) | log={log_path}")
            # Log the first failure line found for quick diagnosis
            for line in output_lines:
                if any(fs.lower() in line.lower() for fs in _FAILURE_STRINGS):
                    logger.error(f"    ↳ Failure hint: {line.strip()[:200]}")
                    break
        else:
            logger.error(f"❌  [{user_id}] Engine FAILED rc={rc}  ({elapsed}s) | log={log_path}")
        logger.info("=" * 55)
        logger.info("")

        return EngineResult(success=success, log_path=str(log_path), return_code=rc)


    except Exception as e:
        logger.error(f"❌  [{user_id}] Engine launch exception: {e}")
        _write_log(log_path, [f"[LAUNCH ERROR] {e}"])
        return EngineResult(success=False, log_path=str(log_path), return_code=-2)


def _write_log(path: Path, lines: list):
    try:
        Path(path).write_text("\n".join(lines), encoding="utf-8")
    except Exception:
        pass  # Best-effort


def get_latest_log(user_id: str) -> str | None:
    """Returns the content of the most recent engine log for a user, or None."""
    logs = sorted(LOGS_DIR.glob(f"engine_{user_id}_*.log"),
                  key=os.path.getmtime, reverse=True)
    if not logs:
        return None
    try:
        return logs[0].read_text(encoding="utf-8")
    except Exception:
        return None