"""
healthbot_v4/shared/logger/logger.py
Centralized Contextual Logger for VitalHealth v5.0.
"""

import logging
import sys

logger = logging.getLogger("vitalhealth.core")
logger.setLevel(logging.INFO)

if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    formatter = logging.Formatter(
        "[%(asctime)s] [%(levelname)s] [%(name)s] [req:%(request_id)s] [patient:%(patient_id)s] %(message)s",
        defaults={"request_id": "-", "patient_id": "-"},
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
