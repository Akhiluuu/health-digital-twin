"""
healthbot_v4/shared/logger/structured_logger.py
Centralized Structured JSON Logging Engine & Dedicated Security Audit Event Logger.
Formats all system, API, AI, OCR, and twin events in structured JSON for Loki / Elasticsearch scraping.
"""

import logging
import json
import os
import sys
from datetime import datetime
from typing import Dict, Any, Optional

AUDIT_LOG_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "logs", "security_audit.log"))


class JSONFormatter(logging.Formatter):
    """Structured JSON Log Formatter."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry: Dict[str, Any] = {
            "timestamp": datetime.utcfromtimestamp(record.created).isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "func_name": record.funcName,
            "line_no": record.lineno,
        }

        if hasattr(record, "correlation_id"):
            log_entry["correlation_id"] = getattr(record, "correlation_id")

        if hasattr(record, "patient_id"):
            log_entry["patient_id"] = getattr(record, "patient_id")

        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_entry)


def get_structured_logger(name: str = "vitalhealth") -> logging.Logger:
    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)

    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(JSONFormatter())
        logger.addHandler(handler)

    return logger


# Security Audit Logger
os.makedirs(os.path.dirname(AUDIT_LOG_FILE), exist_ok=True)
audit_logger = logging.getLogger("security_audit")
audit_logger.setLevel(logging.INFO)

if not audit_logger.handlers:
    file_handler = logging.FileHandler(AUDIT_LOG_FILE)
    file_handler.setFormatter(JSONFormatter())
    audit_logger.addHandler(file_handler)


def log_security_audit(event_type: str, user_id: str, action: str, status: str = "SUCCESS", details: Optional[Dict[str, Any]] = None):
    """Logs security audit event to dedicated audit log file."""
    audit_entry = {
        "event_type": event_type,
        "user_id": user_id,
        "action": action,
        "status": status,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "details": details or {},
    }
    audit_logger.info(f"AUDIT_EVENT: {json.dumps(audit_entry)}")
