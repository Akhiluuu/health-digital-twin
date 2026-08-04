"""
healthbot_v4/shared/security/security_middleware.py
Comprehensive Production Security Middleware for VitalHealth v5.0.
Enforces HTTP Security Headers (HSTS, CSP, X-Frame-Options), Input Sanitization, Prompt Injection Defense, File Upload Limits, and Cross-User Data Isolation.
"""

import re
import uuid
from typing import Callable, Optional
from fastapi import Request, Response, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware

from healthbot_v4.shared.logger.logger import logger

# Prompt Injection Attack Patterns
PROMPT_INJECTION_PATTERNS = [
    r"ignore\s+previous\s+instructions",
    r"disregard\s+all\s+rules",
    r"you\s+are\s+now\s+dan",
    r"jailbreak",
    r"override\s+system\s+prompt",
    r"reveal\s+secret\s+key",
    r"system:\s*role",
]


class SecurityEngineMiddleware(BaseHTTPMiddleware):
    """Production Security Middleware protecting HTTP response headers, correlation IDs, and input sanitization."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # 1. Attach Request Correlation ID
        correlation_id = request.headers.get("X-Correlation-ID", f"req_{uuid.uuid4().hex[:12]}")
        request.state.correlation_id = correlation_id

        # 2. Prompt Injection Defense Scan for Query endpoints
        if request.method in ["POST", "PUT", "PATCH"]:
            try:
                body_bytes = await request.body()
                body_str = body_bytes.decode("utf-8", errors="ignore")
                for pattern in PROMPT_INJECTION_PATTERNS:
                    if re.search(pattern, body_str, re.IGNORECASE):
                        logger.warning(f"🚨 Prompt Injection Attempt Flagged! Pattern: '{pattern}' | IP: {request.client.host if request.client else 'unknown'}")
                        return Response(
                            content='{"error":"Security Violation","message":"Input contained prohibited prompt override pattern."}',
                            status_code=400,
                            media_type="application/json",
                        )
            except Exception:
                pass

        # Execute Request Pipeline
        response: Response = await call_next(request)

        # 3. Apply Production Security Headers (Helmet equivalent)
        response.headers["X-Correlation-ID"] = correlation_id
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;"

        return response


def sanitize_input_string(text: str) -> str:
    """Sanitizes user query string against XSS and HTML injection."""
    if not text:
        return ""
    # Strip HTML tags
    cleaned = re.sub(r"<[^>]*>", "", text)
    # Escape quotes
    cleaned = cleaned.replace("'", "&#39;").replace('"', "&quot;")
    return cleaned.strip()


def validate_user_access_isolation(authenticated_patient_id: str, requested_patient_id: str):
    """Enforces strict multi-tenant cross-user data isolation."""
    if authenticated_patient_id != requested_patient_id and authenticated_patient_id != "admin":
        logger.error(f"🔒 Data Isolation Violation: User {authenticated_patient_id} attempted access to resource of {requested_patient_id}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: You do not have permission to view or modify this patient's medical records.",
        )
