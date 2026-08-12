"""
healthbot_v4/infrastructure/metrics_exporter.py
Prometheus Telemetry & SLA Metrics Exporter for VitalHealth v5.0.
Exposes standard Prometheus counters, gauges, and histograms via `/metrics`.
Gracefully degrades if prometheus_client is not installed.
"""

import time
from typing import Dict, Any

try:
    from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST  # type: ignore
    _PROMETHEUS_AVAILABLE = True
except ImportError:
    _PROMETHEUS_AVAILABLE = False
    Counter = Histogram = Gauge = None  # type: ignore
    generate_latest = lambda: b""
    CONTENT_TYPE_LATEST = "text/plain"

from fastapi import Response


def _make_counter(name: str, doc: str, labels: Any = None):
    if _PROMETHEUS_AVAILABLE and Counter is not None:
        return Counter(name, doc, labels or [])
    return None

def _make_histogram(name: str, doc: str, labels: Any = None):
    if _PROMETHEUS_AVAILABLE and Histogram is not None:
        return Histogram(name, doc, labels or [])
    return None

def _make_gauge(name: str, doc: str):
    if _PROMETHEUS_AVAILABLE and Gauge is not None:
        return Gauge(name, doc)
    return None


# 1. HTTP Request Metrics
HTTP_REQUEST_COUNT = _make_counter(
    "vitalhealth_http_requests_total",
    "Total HTTP request count",
    ["method", "endpoint", "status"]
)

HTTP_REQUEST_LATENCY = _make_histogram(
    "vitalhealth_http_request_duration_seconds",
    "HTTP request execution latency in seconds",
    ["endpoint"]
)

# 2. AI Reasoning Metrics
AI_QUERY_COUNTER = _make_counter(
    "vitalhealth_ai_queries_total",
    "Total AI Physician queries processed",
    ["intent", "emergency"]
)

AI_INFERENCE_LATENCY = _make_histogram(
    "vitalhealth_ai_inference_duration_seconds",
    "AI reasoning inference latency in seconds"
)

# 3. OCR & Digital Twin Queue Gauges
OCR_QUEUE_DEPTH = _make_gauge(
    "vitalhealth_ocr_queue_depth",
    "Current active jobs in OCR processing queue"
)

TWIN_SIMULATION_COUNT = _make_counter(
    "vitalhealth_twin_simulations_total",
    "Total BioGears physiological simulations executed"
)

ACTIVE_SYSTEM_USERS = _make_gauge(
    "vitalhealth_active_users_online",
    "Estimated concurrent active users"
)


def export_prometheus_metrics() -> Response:
    """Returns Prometheus formatted metrics payload."""
    if _PROMETHEUS_AVAILABLE:
        return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
    return Response(
        content="# prometheus_client not installed — metrics unavailable\n",
        media_type="text/plain"
    )
