"""
healthbot_v4/apps/brain/state/patient_state_manager.py
Patient State Management Subsystem for VitalHealth v5.0.
Supports L1 In-Memory Caching + L2 Redis Distributed Sync with Graceful Fallback.
"""

from typing import Dict, Optional
import json
from datetime import datetime, timezone
from healthbot_v4.apps.brain.core import HealthBrainSubsystem
from healthbot_v4.shared.logger.logger import logger
from healthbot_v4.shared.config.settings import settings
from healthbot_v4.shared.models.base import (
    PatientState,
    PatientProfile,
    NormalizedLab,
    NormalizedMedication,
    NormalizedVital,
    RiskFlag,
    RiskLevel,
)


class PatientStateManager(HealthBrainSubsystem):
    """Subsystem managing active patient states with L1 in-memory and L2 Redis caching."""

    _shared_states: Dict[str, PatientState] = {}
    _redis_client = None
    _redis_checked: bool = False

    def __init__(self):
        super().__init__("patient_state_manager")
        self._states = PatientStateManager._shared_states
        self._init_redis()

    def _init_redis(self):
        if PatientStateManager._redis_checked:
            return
        PatientStateManager._redis_checked = True
        if not getattr(settings, "ENABLE_REDIS_CACHE", True):
            logger.info("ℹ️ Redis cache disabled in settings, using L1 in-memory state manager.")
            return

        try:
            import redis
            client = redis.from_url(settings.REDIS_URL, decode_responses=True, socket_timeout=1.0)
            client.ping()
            PatientStateManager._redis_client = client
            logger.info(f"⚡ PatientStateManager connected to L2 Redis cache at {settings.REDIS_URL}")
        except Exception as e:
            logger.warning(f"⚠️ Redis connection unavaiable ({e}). Falling back to L1 in-memory state manager.")
            PatientStateManager._redis_client = None

    def _sync_to_redis(self, state: PatientState):
        if PatientStateManager._redis_client:
            try:
                key = f"patient_state:{state.patient_id}"
                PatientStateManager._redis_client.set(key, state.model_dump_json(), ex=86400) # 24hr TTL
            except Exception as e:
                logger.debug(f"Failed to sync state to Redis: {e}")

    def _fetch_from_redis(self, patient_id: str) -> Optional[PatientState]:
        if PatientStateManager._redis_client:
            try:
                key = f"patient_state:{patient_id}"
                raw = PatientStateManager._redis_client.get(key)
                if raw:
                    return PatientState.model_validate_json(raw)
            except Exception as e:
                logger.debug(f"Failed to fetch state from Redis: {e}")
        return None

    async def initialize(self) -> None:
        logger.info("🧠 Patient State Manager initialized")

    def create_profile(self, profile: PatientProfile) -> PatientState:
        state = PatientState(patient_id=profile.patient_id, profile=profile)
        self._states[profile.patient_id] = state
        self._sync_to_redis(state)
        logger.info(f"Created new PatientState for {profile.patient_id}")
        return state

    def get_or_create_state(self, patient_id: str) -> PatientState:
        if patient_id in self._states:
            return self._states[patient_id]

        # Try L2 Redis
        cached = self._fetch_from_redis(patient_id)
        if cached:
            self._states[patient_id] = cached
            return cached

        # Create new default state
        profile = PatientProfile(patient_id=patient_id)
        state = PatientState(patient_id=patient_id, profile=profile)
        self._states[patient_id] = state
        self._sync_to_redis(state)
        return state

    def add_lab(self, patient_id: str, lab: NormalizedLab) -> PatientState:
        state = self.get_or_create_state(patient_id)
        state.recent_labs.insert(0, lab)
        state.last_updated = datetime.now(timezone.utc)
        self._sync_to_redis(state)
        return state

    def add_medication(self, patient_id: str, med: NormalizedMedication) -> PatientState:
        state = self.get_or_create_state(patient_id)
        state.active_medications.insert(0, med)
        state.last_updated = datetime.now(timezone.utc)
        self._sync_to_redis(state)
        return state

    def add_vital(self, patient_id: str, vital: NormalizedVital) -> PatientState:
        state = self.get_or_create_state(patient_id)
        state.recent_vitals.insert(0, vital)
        state.last_updated = datetime.now(timezone.utc)
        self._sync_to_redis(state)
        return state

    def update_risks(self, patient_id: str, risks: list[RiskFlag]) -> PatientState:
        state = self.get_or_create_state(patient_id)
        state.active_risks = risks
        if any(r.level in (RiskLevel.high, RiskLevel.critical) for r in risks):
            state.current_health_score = 85.0
        else:
            state.current_health_score = 100.0
        state.last_updated = datetime.now(timezone.utc)
        self._sync_to_redis(state)
        return state

