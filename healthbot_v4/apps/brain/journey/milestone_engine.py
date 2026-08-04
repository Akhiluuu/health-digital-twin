"""
healthbot_v4/apps/brain/journey/milestone_engine.py
Automatic Health Milestone Detection Engine.
Detects clinically meaningful patient achievements from PatientState data.
All detection is fully deterministic — no LLM calls.
"""

import uuid
from typing import List, Dict, Any
from datetime import datetime

from healthbot_v4.apps.brain.core import HealthBrainSubsystem
from healthbot_v4.shared.logger.logger import logger
from healthbot_v4.shared.models.base import (
    PatientState, HealthMilestone, MilestoneType,
    TimelineEventType,
)
from healthbot_v4.apps.brain.timeline.event_stream import MedicalTimelineEngine


class MilestoneEngine(HealthBrainSubsystem):
    """
    Detects and records health milestones automatically.
    Runs after each state update and compares against already-recorded milestones
    stored in the journey JSON store to prevent duplicates.
    """

    def __init__(self):
        super().__init__("milestone_engine")
        self.timeline_engine = MedicalTimelineEngine()

    async def initialize(self) -> None:
        logger.info("🏆 Milestone Detection Engine initialized")

    # ─── Public API ───────────────────────────────────────────────────────────

    def detect_milestones(
        self,
        state: PatientState,
        store: Dict[str, Any],
    ) -> List[HealthMilestone]:
        """
        Returns the complete list of milestones for this patient.
        Merges already-stored milestones with newly detected ones.
        """
        existing_ids = {m["milestone_id"] for m in store.get("milestones", [])}
        existing_types = {m["milestone_type"] for m in store.get("milestones", [])}

        newly_detected: List[HealthMilestone] = []

        newly_detected.extend(self._check_first_diagnosis(state, existing_types))
        newly_detected.extend(self._check_medication_started(state, existing_ids))
        newly_detected.extend(self._check_hba1c_improved(state, existing_types))
        newly_detected.extend(self._check_bp_controlled(state, existing_types))
        newly_detected.extend(self._check_weight_loss(state, existing_types))
        newly_detected.extend(self._check_adherence_streak(state, existing_types))
        newly_detected.extend(self._check_risk_reduction(state, existing_types))
        newly_detected.extend(self._check_onboarding_complete(state, existing_types))

        # Record new milestones in timeline
        for ms in newly_detected:
            self.timeline_engine.record_event(
                state.patient_id,
                TimelineEventType.journey_milestone_reached,
                f"🏆 {ms.title}",
                ms.description,
                payload={"milestone_id": ms.milestone_id, "type": ms.milestone_type.value},
            )
            logger.info(f"Milestone detected for {state.patient_id}: {ms.title}")

        # Merge with stored
        stored_milestones = [
            HealthMilestone(**m) for m in store.get("milestones", [])
            if m["milestone_id"] not in {nm.milestone_id for nm in newly_detected}
        ]
        all_milestones = stored_milestones + newly_detected
        all_milestones.sort(key=lambda m: m.achieved_at)

        return all_milestones

    # ─── Individual Milestone Detectors ──────────────────────────────────────

    def _check_first_diagnosis(
        self, state: PatientState, existing_types: set
    ) -> List[HealthMilestone]:
        results = []
        if (
            state.current_conditions
            and MilestoneType.first_diagnosis.value not in existing_types
        ):
            cond = state.current_conditions[0]
            results.append(HealthMilestone(
                milestone_id=str(uuid.uuid4()),
                patient_id=state.patient_id,
                milestone_type=MilestoneType.first_diagnosis,
                title="First Diagnosis Recorded",
                description=f"{cond.condition_name} was documented in your health record.",
                impact_score=2.0,
                payload={"condition": cond.condition_name},
            ))
        return results

    def _check_medication_started(
        self, state: PatientState, existing_ids: set
    ) -> List[HealthMilestone]:
        results = []
        for med in state.active_medications:
            ms_id = f"med_started_{med.name.lower().replace(' ', '_')}"
            if ms_id not in existing_ids:
                results.append(HealthMilestone(
                    milestone_id=ms_id,
                    patient_id=state.patient_id,
                    milestone_type=MilestoneType.medication_started,
                    title=f"Started {med.name}",
                    description=f"You began {med.name} {med.dose_quantity}{med.dosage_form} {med.frequency}.",
                    impact_score=2.5,
                    payload={"medication": med.name, "dose": med.dose_quantity},
                ))
        return results

    def _check_hba1c_improved(
        self, state: PatientState, existing_types: set
    ) -> List[HealthMilestone]:
        if MilestoneType.hba1c_improved.value in existing_types:
            return []
        hba1c_labs = [l for l in state.recent_labs if l.loinc_code == "4548-4"]
        if len(hba1c_labs) >= 2:
            latest, prev = hba1c_labs[0], hba1c_labs[1]
            improvement = prev.value - latest.value
            if improvement >= 0.5:
                return [HealthMilestone(
                    milestone_id=str(uuid.uuid4()),
                    patient_id=state.patient_id,
                    milestone_type=MilestoneType.hba1c_improved,
                    title=f"HbA1c Improved by {improvement:.1f}%",
                    description=f"HbA1c dropped from {prev.value}% to {latest.value}% — excellent glycemic progress.",
                    impact_score=4.0,
                    payload={"previous": prev.value, "current": latest.value, "improvement": improvement},
                )]
        return []

    def _check_bp_controlled(
        self, state: PatientState, existing_types: set
    ) -> List[HealthMilestone]:
        if MilestoneType.bp_controlled.value in existing_types:
            return []
        bp_vitals = [v for v in state.recent_vitals if v.vital_type == "blood_pressure"]
        # Controlled = last 2 readings both < 130 systolic
        if len(bp_vitals) >= 2 and all(v.value_primary < 130 for v in bp_vitals[:2]):
            return [HealthMilestone(
                milestone_id=str(uuid.uuid4()),
                patient_id=state.patient_id,
                milestone_type=MilestoneType.bp_controlled,
                title="Blood Pressure Controlled",
                description=f"Systolic BP {bp_vitals[0].value_primary:.0f} mmHg — within target range for 2+ readings.",
                impact_score=3.5,
                payload={"systolic": bp_vitals[0].value_primary},
            )]
        return []

    def _check_weight_loss(
        self, state: PatientState, existing_types: set
    ) -> List[HealthMilestone]:
        # Uses profile weight as baseline — in production would use weight history
        profile_weight = state.profile.weight_kg
        weight_vitals = [v for v in state.recent_vitals if v.vital_type == "weight"]
        if weight_vitals:
            current_weight = weight_vitals[0].value_primary
            loss = profile_weight - current_weight
            existing_weight_milestones = [
                t for t in existing_types if t.startswith("weight_loss")
            ]
            thresholds = [(3, "3 kg"), (5, "5 kg"), (10, "10 kg")]
            for kg_thresh, label in thresholds:
                ms_type_val = f"weight_loss_{kg_thresh}kg"
                if loss >= kg_thresh and ms_type_val not in existing_weight_milestones:
                    return [HealthMilestone(
                        milestone_id=str(uuid.uuid4()),
                        patient_id=state.patient_id,
                        milestone_type=MilestoneType.weight_loss,
                        title=f"Lost {label}",
                        description=f"Weight reduced from {profile_weight:.1f} kg to {current_weight:.1f} kg — {label} milestone reached.",
                        impact_score=3.0,
                        payload={"baseline_kg": profile_weight, "current_kg": current_weight, "lost_kg": loss},
                    )]
        return []

    def _check_adherence_streak(
        self, state: PatientState, existing_types: set
    ) -> List[HealthMilestone]:
        # Detect if medications are active (proxy for adherence; full streak needs history DB)
        if (
            state.active_medications
            and MilestoneType.adherence_streak.value not in existing_types
        ):
            return [HealthMilestone(
                milestone_id=str(uuid.uuid4()),
                patient_id=state.patient_id,
                milestone_type=MilestoneType.adherence_streak,
                title="Medication Adherence Milestone",
                description="Active medication regimen detected — adherence tracking has begun.",
                impact_score=2.0,
                payload={"medications": [m.name for m in state.active_medications]},
            )]
        return []

    def _check_risk_reduction(
        self, state: PatientState, existing_types: set
    ) -> List[HealthMilestone]:
        if (
            not state.active_risks
            and state.current_health_score >= 90
            and MilestoneType.risk_reduction.value not in existing_types
        ):
            return [HealthMilestone(
                milestone_id=str(uuid.uuid4()),
                patient_id=state.patient_id,
                milestone_type=MilestoneType.risk_reduction,
                title="All Clinical Risks Resolved",
                description="No active risk flags detected — excellent health management.",
                impact_score=5.0,
            )]
        return []

    def _check_onboarding_complete(
        self, state: PatientState, existing_types: set
    ) -> List[HealthMilestone]:
        """Fires when profile is fully populated (name + DOB + at least one condition or medication)."""
        if MilestoneType.onboarding_complete.value in existing_types:
            return []
        p = state.profile
        has_basic = p.first_name != "Anonymous" and p.age > 0
        has_medical = bool(state.current_conditions or state.active_medications or state.recent_labs)
        if has_basic and has_medical:
            return [HealthMilestone(
                milestone_id=str(uuid.uuid4()),
                patient_id=state.patient_id,
                milestone_type=MilestoneType.onboarding_complete,
                title="Health Journey Begins",
                description="Your health profile is set up. Your personal journey starts now.",
                impact_score=1.0,
            )]
        return []
