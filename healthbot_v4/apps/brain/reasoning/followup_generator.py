"""
healthbot_v4/apps/brain/reasoning/followup_generator.py

Follow-Up Question Generator for Personal Health Operating System (PHOS).
Suggests contextual, evidence-informed next questions based on current insights and gaps.
"""

from typing import Any, Dict, List
from healthbot_v4.shared.logger.logger import logger


class FollowUpGenerator:
    """
    Generates structured follow-up question recommendations.
    """

    def generate_followups(self, intent: str, query: str, missing_gaps: List[Any] = None) -> Dict[str, List[str]]:
        i_upper = intent.upper()
        follow_ups: List[str] = []

        if i_upper in ["CARDIOVASCULARASSESSMENT", "GENERAL_HEALTH", "HEALTH_SUMMARY", "DIGITAL_TWIN"]:
            follow_ups = [
                "Would you like to see a 6-month resting heart rate trend?",
                "Should I explain your latest cholesterol lab results?",
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

        # Add gap-aware follow-up if gaps exist
        if missing_gaps:
            gap_name = getattr(missing_gaps[0], "data", "recent lab report")
            follow_ups[0] = f"Would you like to log or upload your missing {gap_name}?"

        logger.info(f"❓ Generated {len(follow_ups)} follow-up questions")
        return {"followUps": follow_ups}
