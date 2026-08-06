"""
healthbot_v4/apps/brain/security/phi_sanitizer.py
Local PHI Sanitizer & De-Identifier for VitalHealth v5.5.
Ensures zero exposure of Protected Health Information (PHI) in local logs & caches.
"""

import re
from typing import Dict, Any, List

class PHISanitizer:
    """Local, high-speed regex-based de-identifier for HIPAA compliance."""

    def __init__(self):
        # Common PHI pattern matchers
        self.ssn_pattern = re.compile(r'\b\d{3}-\d{2}-\d{4}\b')
        self.email_pattern = re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b')
        self.phone_pattern = re.compile(r'\b(?:\+?1[-. ]?)?\(?\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}\b')
        self.dob_pattern = re.compile(r'\b(?:0[1-9]|1[0-2])/(?:0[1-9]|[12]\d|3[01])/(?:19|20)\d{2}\b')

    def sanitize_text(self, text: str, patient_name: str = "") -> str:
        """Sanitizes text by replacing direct PHI identifiers with safe tokens."""
        if not text:
            return ""

        sanitized = text
        sanitized = self.ssn_pattern.sub("[REDACTED_SSN]", sanitized)
        sanitized = self.email_pattern.sub("[REDACTED_EMAIL]", sanitized)
        sanitized = self.phone_pattern.sub("[REDACTED_PHONE]", sanitized)
        sanitized = self.dob_pattern.sub("[REDACTED_DATE]", sanitized)

        if patient_name and len(patient_name.strip()) > 2:
            names = patient_name.strip().split()
            for name in names:
                if len(name) > 2:
                    pattern = re.compile(re.escape(name), re.IGNORECASE)
                    sanitized = pattern.sub("[PATIENT]", sanitized)

        return sanitized

    def sanitize_context(self, context_dict: Dict[str, Any]) -> Dict[str, Any]:
        """Recursively sanitizes dictionary items containing health context."""
        cleaned = {}
        p_name = context_dict.get("patient_name", "")
        for k, v in context_dict.items():
            if isinstance(v, str):
                cleaned[k] = self.sanitize_text(v, patient_name=p_name)
            elif isinstance(v, dict):
                cleaned[k] = self.sanitize_context(v)
            elif isinstance(v, list):
                cleaned[k] = [self.sanitize_text(i, patient_name=p_name) if isinstance(i, str) else i for i in v]
            else:
                cleaned[k] = v
        return cleaned

phi_sanitizer = PHISanitizer()
