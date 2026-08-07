"""
healthbot_v4/apps/brain/reasoning/followup_generator.py

Follow-Up Question Generator for Personal Health Operating System (PHOS).
Suggests contextual, evidence-informed next questions based on current insights, gaps, and patient persona.
"""

from typing import Any, Dict, List, Optional
from healthbot_v4.apps.brain.reasoning.patient_persona import PatientPersona
from healthbot_v4.shared.logger.logger import logger


class FollowUpGenerator:
    """
    Generates structured, hyper-personalized follow-up question recommendations.
    """

    def generate_followups(
        self,
        intent: str,
        query: str,
        missing_gaps: List[Any] = None,
        persona: Optional[PatientPersona] = None,
    ) -> Dict[str, List[str]]:
        i_upper = intent.upper()
        follow_ups: List[str] = []

        # ── Base Contextual Intent Questions ──────────────────────────────────
        if i_upper in ["CARDIOVASCULARASSESSMENT", "GENERAL_HEALTH", "HEALTH_SUMMARY", "DIGITAL_TWIN"]:
            follow_ups = [
                "Would you like to see a 6-month resting heart rate trend?",
                "Should I explain your latest lab results?",
                "How does my physical activity compare to recommended guidelines?",
            ]
        elif i_upper in ["SYMPTOMS", "INJURY", "DERMATOLOGY"]:
            follow_ups = [
                "Have these symptoms changed or worsened over time?",
                "Are there any associated symptoms like fever or shortness of breath?",
                "Would you like advice on when to consult a physician?",
            ]
        elif i_upper in ["MEDICATION", "PRESCRIPTION"]:
            follow_ups = [
                "Are there any known drug-food interactions with my active regimen?",
                "What should I do if I accidentally miss a dose?",
                "Should I schedule a routine lab check for kidney or liver function?",
            ]
        else:
            follow_ups = [
                "Would you like me to summarize your health timeline for a doctor visit?",
                "Should we track these health parameters over the next week?",
                "Do you have any specific dietary or exercise goals?",
            ]

        # ── Persona Hyper-Personalization Overrides ──────────────────────────
        if persona:
            # Hyper-Acute Vitals
            if persona.is_hyper_acute_vitals:
                follow_ups.insert(0, f"Should I locate the nearest urgent care center for your current vital readings, {persona.first_name}?")

            # Polypharmacy Audit
            elif persona.polypharmacy_risk.value == "HIGH":
                meds_str = ", ".join(persona.active_medications[:3])
                follow_ups[0] = f"Would you like a full interaction check across your active regimen ({meds_str})?"

            # Chronic Condition Follow-up
            elif persona.chronic_conditions:
                cond = persona.chronic_conditions[0]
                follow_ups[1] = f"Should we log a specific monitoring entry for your {cond} management?"

            # Active Medication Follow-up
            elif persona.active_medications:
                med = persona.active_medications[0]
                follow_ups[0] = f"Are you experiencing any side effects with your active dose of {med}?"

            # Pediatric / Caregiver
            if persona.pediatric_caregiver:
                follow_ups.append("Would you like a list of pediatric warning signs to monitor at home?")
            elif persona.age_cohort.value == "GERIATRIC":
                follow_ups.append(f"Should I prepare a large-print summary for {persona.first_name}'s next physician visit?")

        # ── Data Gap Interrogation ───────────────────────────────────────────
        if missing_gaps:
            gap_name = getattr(missing_gaps[0], "data", "recent lab report")
            follow_ups[0] = f"Would you like to log or upload your missing {gap_name}?"

        # Keep top 3 crisp, relevant follow-up questions
        follow_ups = follow_ups[:3]

        logger.info(f"❓ Generated {len(follow_ups)} persona-personalized follow-up questions")
        return {"followUps": follow_ups}
