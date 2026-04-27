"""
app.py
VitalHealth Heart Rate Detection API

Architecture change: NEW /channels endpoint
───────────────────────────────────────────
Old flow: phone → base64 JPEG (~50 KB) → Python decodes → extract RGB → process
New flow: phone extracts RGB in JS → sends 3 numbers (~200 bytes) → Python processes

This is 250x less data per sample, enabling 10 fps instead of 2–3 fps.
Faster sampling = more signal = faster and more accurate BPM detection.

Endpoints:
  POST /start              → start new session
  POST /channels           → NEW: receive pre-extracted R,G,B averages (fast path)
  POST /frame              → LEGACY: receive full base64 frame (fallback)
  POST /reset_buffer/<id>  → reset engine buffer (finger lifted mid-scan)
  GET  /result/<id>        → get current result
  POST /stop/<id>          → stop session, get final result
  GET  /ping               → reachability check
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import uuid, threading, time
from typing import Dict

from core.heart_rate_engine import HeartRateEngine, HeartRateResult
from core.frame_extractor import FrameExtractor

app = Flask(__name__)
CORS(app)

sessions: Dict[str, dict] = {}
sessions_lock = threading.Lock()
SESSION_TIMEOUT = 300


# ── Session helpers ────────────────────────────────────────────────────────────

def create_session() -> str:
    sid = str(uuid.uuid4())
    with sessions_lock:
        sessions[sid] = {
            "engine":          HeartRateEngine(sample_rate=10),  # 10 fps from new client
            "extractor":       FrameExtractor(roi_fraction=0.6),
            "created_at":      time.time(),
            "frame_count":     0,
            "valid_frames":    0,
            "last_result":     None,
            "finger_detected": False,
        }
    return sid


def get_session(sid: str) -> dict | None:
    with sessions_lock:
        return sessions.get(sid)


def cleanup_old_sessions():
    now = time.time()
    with sessions_lock:
        expired = [s for s, d in sessions.items() if now - d["created_at"] > SESSION_TIMEOUT]
        for s in expired:
            del sessions[s]


def _result_to_dict(result: HeartRateResult | None) -> dict | None:
    if result is None:
        return None
    return {
        "bpm":              result.bpm,
        "confidence":       result.confidence,
        "hrv_ms":           result.hrv_ms,
        "spo2":             result.spo2,
        "signal_quality":   result.signal_quality,
        "measurement_time": result.measurement_time,
    }


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.route("/ping", methods=["GET"])
def ping():
    return jsonify({"status": "ok"}), 200


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "active_sessions": len(sessions)})


@app.route("/start", methods=["POST"])
def start_session():
    cleanup_old_sessions()
    sid = create_session()
    return jsonify({
        "session_id": sid,
        "message": "Session started.",
        "mode": "Use /channels (fast) or /frame (fallback)",
    }), 201


@app.route("/channels", methods=["POST"])
def add_channels():
    """
    NEW fast-path endpoint.

    Receives pre-extracted RGB channel averages computed on the phone.
    No image decoding needed — just signal processing.

    Body: {
      "session_id": "...",
      "red":   float,
      "green": float,
      "blue":  float
    }

    The phone-side JS already runs finger detection, so we trust that
    frames sent here always have a finger present.
    """
    body = request.get_json(silent=True)
    if not body:
        return jsonify({"error": "No JSON body"}), 400

    sid   = body.get("session_id")
    red   = body.get("red")
    green = body.get("green")
    blue  = body.get("blue")

    if not sid or red is None or green is None or blue is None:
        return jsonify({"error": "session_id, red, green, blue required"}), 400

    session = get_session(sid)
    if not session:
        return jsonify({"error": "Session not found. Call /start first."}), 404

    engine: HeartRateEngine = session["engine"]
    engine.add_frame(float(red), float(green), float(blue))

    session["frame_count"]    += 1
    session["valid_frames"]   += 1
    session["finger_detected"] = True

    result   = engine.get_result()
    progress = engine.get_progress()

    if result:
        session["last_result"] = result

    return jsonify({
        "frame_count":  session["frame_count"],
        "progress":     round(progress, 2),
        "ready":        result is not None,
        "live_bpm":     _result_to_dict(result) if result else None,
    })


@app.route("/frame", methods=["POST"])
def add_frame():
    """
    Legacy endpoint — receives full base64 JPEG frame.
    Used as fallback when JS canvas API is unavailable.
    """
    body = request.get_json(silent=True)
    if not body:
        return jsonify({"error": "No JSON body"}), 400

    sid        = body.get("session_id")
    frame_data = body.get("frame_data")

    if not sid or not frame_data:
        return jsonify({"error": "session_id and frame_data required"}), 400

    session = get_session(sid)
    if not session:
        return jsonify({"error": "Session not found"}), 404

    extractor: FrameExtractor = session["extractor"]
    channels = extractor.extract_from_base64(frame_data)

    if channels is None:
        return jsonify({"error": "Could not decode frame"}), 422

    session["frame_count"]    += 1
    session["finger_detected"] = channels.is_finger_detected

    engine: HeartRateEngine = session["engine"]

    if channels.is_finger_detected:
        engine.add_frame(channels.red, channels.green, channels.blue)
        session["valid_frames"] += 1
    else:
        if session["valid_frames"] > 0:
            engine.reset()
            session["valid_frames"] = 0

    result   = engine.get_result()
    progress = engine.get_progress()

    if result:
        session["last_result"] = result

    return jsonify({
        "frame_count":     session["frame_count"],
        "finger_detected": channels.is_finger_detected,
        "progress":        round(progress, 2),
        "ready":           result is not None,
        "live_bpm":        _result_to_dict(result) if result else None,
    })


@app.route("/reset_buffer", methods=["POST"])
def reset_buffer():
    """
    Called when the finger is lifted mid-measurement.
    Resets the signal buffer so stale data doesn't corrupt the next reading.
    """
    body = request.get_json(silent=True)
    if not body:
        return jsonify({"error": "No JSON body"}), 400

    sid = body.get("session_id")
    if not sid:
        return jsonify({"error": "session_id required"}), 400

    session = get_session(sid)
    if not session:
        return jsonify({"error": "Session not found"}), 404

    engine: HeartRateEngine = session["engine"]
    engine.reset()
    session["valid_frames"]    = 0
    session["finger_detected"] = False

    return jsonify({"status": "buffer reset", "session_id": sid})


@app.route("/result/<sid>", methods=["GET"])
def get_result(sid: str):
    session = get_session(sid)
    if not session:
        return jsonify({"error": "Session not found"}), 404

    engine: HeartRateEngine = session["engine"]
    result   = engine.get_result()
    progress = engine.get_progress()

    return jsonify({
        "session_id":      sid,
        "progress":        round(progress, 2),
        "finger_detected": session["finger_detected"],
        "frame_count":     session["frame_count"],
        "result":          _result_to_dict(result),
    })


@app.route("/stop/<sid>", methods=["POST"])
def stop_session(sid: str):
    session = get_session(sid)
    if not session:
        return jsonify({"error": "Session not found"}), 404

    engine: HeartRateEngine = session["engine"]
    result = engine.get_result()

    with sessions_lock:
        del sessions[sid]

    return jsonify({
        "session_id":   sid,
        "final_result": _result_to_dict(result),
        "total_frames": session["frame_count"],
        "valid_frames": session["valid_frames"],
        "message":      "Session ended successfully",
    })


if __name__ == "__main__":
    print("🫀 VitalHealth Heart Rate API starting...")
    print("   Listening on http://0.0.0.0:5000")
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)