"""
healthbot_v4/apps/brain/state/patient_state_manager.py
Patient State Management Subsystem for VitalHealth v5.0.
"""

from typing import Dict, Optional
from datetime import datetime
from healthbot_v4.apps.brain.core import HealthBrainSubsystem
from healthbot_v4.shared.logger.logger import logger
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
    """Subsystem managing in-memory active patient states."""

    _shared_states: Dict[str, PatientState] = {}

    def __init__(self):
        super().__init__("patient_state_manager")
        self._states = PatientStateManager._shared_states

    async def initialize(self) -> None:
        logger.info("🧠 Patient State Manager initialized")

    def create_profile(self, profile: PatientProfile) -> PatientState:
        state = PatientState(patient_id=profile.patient_id, profile=profile)
        self._states[profile.patient_id] = state
        logger.info(f"Created new PatientState for {profile.patient_id}")
        return state

    def get_or_create_state(self, patient_id: str) -> PatientState:
        if patient_id not in self._states:
            profile = PatientProfile(patient_id=patient_id)
            self._states[patient_id] = PatientState(patient_id=patient_id, profile=profile)
        return self._states[patient_id]

    def add_lab(self, patient_id: str, lab: NormalizedLab) -> PatientState:
        state = self.get_or_create_state(patient_id)
        state.recent_labs.insert(0, lab)
        state.last_updated = datetime.utcnow()
        return state

    def add_medication(self, patient_id: str, med: NormalizedMedication) -> PatientState:
        state = self.get_or_create_state(patient_id)
        state.active_medications.insert(0, med)
        state.last_updated = datetime.utcnow()
        return state

    def add_vital(self, patient_id: str, vital: NormalizedVital) -> PatientState:
        state = self.get_or_create_state(patient_id)
        state.recent_vitals.insert(0, vital)
        state.last_updated = datetime.utcnow()
        return state

    def update_risks(self, patient_id: str, risks: list[RiskFlag]) -> PatientState:
        state = self.get_or_create_state(patient_id)
        state.active_risks = risks
        if any(r.level in (RiskLevel.high, RiskLevel.critical) for r in risks):
            state.current_health_score = 85.0
        else:
            state.current_health_score = 100.0
        state.last_updated = datetime.utcnow()
        return state
