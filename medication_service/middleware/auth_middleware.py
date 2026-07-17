"""
medication_service/middleware/auth_middleware.py
Firebase token verification + RBAC + audit context injection.
"""
from __future__ import annotations
import logging
import os
from typing import Optional
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

logger = logging.getLogger(__name__)
bearer = HTTPBearer(auto_error=False)

# Firebase Admin SDK
_firebase_initialized = False

def _init_firebase():
    global _firebase_initialized
    if _firebase_initialized:
        return
    try:
        import firebase_admin
        from firebase_admin import credentials
        cred_path = os.environ.get("FIREBASE_ADMIN_CREDENTIALS")
        if cred_path:
            cred = credentials.Certificate(cred_path)
        else:
            cred = credentials.ApplicationDefault()
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred)
        _firebase_initialized = True
    except Exception as e:
        logger.warning(f"Firebase Admin init failed: {e}. Falling back to API key auth.")


def _verify_firebase_token(token: str) -> Optional[dict]:
    try:
        _init_firebase()
        from firebase_admin import auth as fb_auth
        return fb_auth.verify_id_token(token)
    except Exception as e:
        logger.debug(f"Firebase token verify failed: {e}")
        return None


class CurrentUser:
    def __init__(self, uid: str, email: str = "", role: str = "patient"):
        self.uid = uid
        self.email = email
        self.role = role


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
) -> CurrentUser:
    """
    Supports two auth modes:
    1. Firebase JWT Bearer token (production)
    2. X-API-Key header (server-to-server, admin tools)
    """
    # Mode 1: Firebase Bearer token
    if credentials and credentials.credentials:
        decoded = _verify_firebase_token(credentials.credentials)
        if decoded:
            uid = decoded.get("uid") or decoded.get("user_id", "")
            email = decoded.get("email", "")
            return CurrentUser(uid=uid, email=email, role="patient")

    # Mode 2: API Key (for internal service calls)
    api_key = request.headers.get("X-API-Key", "")
    server_key = os.environ.get("DIGITAL_TWIN_API_KEY", "")
    if api_key and server_key and api_key == server_key:
        # Internal service — user_id must be passed as header
        uid = request.headers.get("X-User-Id", "internal")
        return CurrentUser(uid=uid, email="internal@vitalhealth", role="admin")

    # Dev mode: allow X-Dev-User-Id header if ALLOW_DEV_AUTH=true
    if os.environ.get("ALLOW_DEV_AUTH", "").lower() == "true":
        dev_uid = request.headers.get("X-Dev-User-Id")
        if dev_uid:
            return CurrentUser(uid=dev_uid, email=f"{dev_uid}@dev", role="patient")

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing authentication credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def require_admin(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def caregiver_access_guard(owner_id: str, requester: CurrentUser, permission_needed: str = "read_only") -> None:
    """Check caregiver permissions before allowing cross-profile access."""
    if requester.uid == owner_id:
        return
    if requester.role == "admin":
        return
    # Further DB check should be done in the route handler using FamilyCaregiverRepository
    raise HTTPException(status_code=403, detail="Insufficient caregiver permissions")
