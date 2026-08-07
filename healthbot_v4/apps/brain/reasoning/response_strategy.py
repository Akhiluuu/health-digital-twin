"""
healthbot_v4/apps/brain/reasoning/response_strategy.py

Response Strategy Planner for Personal Health Operating System (PHOS).
Selects output mode (Assessment, Educational, Decision Support, Urgent Triage,
Comparison, Prediction) and tone based on intent, urgency, and confidence.
"""

from enum import Enum
from typing import Any, Dict, Optional
from pydantic import BaseModel
from healthbot_v4.shared.logger.logger import logger


class StrategyMode(str, Enum):
    ASSESSMENT       = "Assessment Mode"
    EDUCATIONAL      = "Educational Mode"
    DECISION_SUPPORT = "Decision Support Mode"
    URGENT_TRIAGE    = "Triage/Emergency Mode"
    COMPARISON       = "Comparison Mode"
    PREDICTION       = "Prediction Mode"
    CONVERSATIONAL   = "Conversational Mode"
    PHARMACOLOGY     = "Pharmacology Mode"
    MENTAL_WELLBEING = "Mental Wellbeing Mode"
    LIFESTYLE_ACTION = "Lifestyle Action Mode"


class QueryComplexity(str, Enum):
    MICRO_CHAT          = "MICRO_CHAT"           # Greetings, status, thanks
    BRIEF_QA            = "BRIEF_QA"             # Single definition or factual QA
    FOCUSED_ADVICE      = "FOCUSED_ADVICE"       # Single symptom or regimen question
    MULTI_PART_SYNTHESIS = "MULTI_PART_SYNTHESIS" # Multi-condition or multi-question
    DEEP_CLINICAL_AUDIT = "DEEP_CLINICAL_AUDIT"  # Full multi-source clinical review


class VerbosityBudget(str, Enum):
    MICRO         = "micro"          # ~40 words / 60 tokens
    COMPACT       = "compact"        # ~100 words / 150 tokens
    STANDARD      = "standard"       # ~250 words / 350 tokens
    COMPREHENSIVE = "comprehensive"  # ~450 words / 600 tokens


class UIModality(str, Enum):
    CONVERSATIONAL_TEXT = "CONVERSATIONAL_TEXT"
    BULLET_HIGHLIGHTS   = "BULLET_HIGHLIGHTS"
    COMPARISON_TABLE    = "COMPARISON_TABLE"
    ACTION_CARDS        = "ACTION_CARDS"
    CRITICAL_ALERT      = "CRITICAL_ALERT"


from healthbot_v4.apps.brain.reasoning.patient_persona import PatientPersona, EmotionalSentiment, HealthLiteracy, PatientPersonaEngine


class ResponseStrategy(BaseModel):
    mode: StrategyMode
    tone: str               # Reassuring, Cautionary, Urgent, Educational, Empathetic, Conversational
    complexity: QueryComplexity = QueryComplexity.FOCUSED_ADVICE
    verbosity: VerbosityBudget = VerbosityBudget.STANDARD
    ui_modality: UIModality = UIModality.BULLET_HIGHLIGHTS
    formatting_schema: str = "ADAPTIVE_HEALTH"
    persona: Optional[PatientPersona] = None
    temperature: float = 0.40
    top_p: float = 0.88
    max_tokens: int = 600
    requires_alert_banner: bool = False
    include_biogears_card: bool = True
    include_trend_chart: bool = False

    def to_json_contract(self) -> Dict[str, Any]:
        return {
            "mode": self.mode.value,
            "tone": self.tone,
            "complexity": self.complexity.value,
            "verbosity": self.verbosity.value,
            "ui_modality": self.ui_modality.value,
            "formatting_schema": self.formatting_schema,
            "persona": self.persona.model_dump() if self.persona else None,
            "temperature": self.temperature,
            "top_p": self.top_p,
            "max_tokens": self.max_tokens,
            "requires_alert_banner": self.requires_alert_banner,
            "include_biogears_card": self.include_biogears_card,
            "include_trend_chart": self.include_trend_chart,
        }


class ResponseStrategyPlanner:
    """
    Ultra-Adaptive Response Strategy Planner.
    Computes all 7 layers of response specs dynamically based on intent, query, persona, and context depth.
    """

    def plan_strategy(
        self,
        intent: str,
        query: str,
        confidence_label: str = "HIGH",
        persona: Optional[PatientPersona] = None,
    ) -> ResponseStrategy:
        i_upper = intent.upper()
        q_lower = query.strip().lower()
        words = q_lower.split()
        word_count = len(words)

        # ── Step 1: Detect Query Complexity Layer ─────────────────────────────
        if any(k in q_lower for k in ["hi", "hello", "hey", "thanks", "thank you", "who are you", "good morning", "good evening"]) and word_count <= 6:
            complexity = QueryComplexity.MICRO_CHAT
        elif word_count <= 7 and any(q_lower.startswith(prefix) for prefix in ["what is", "define", "what are", "meaning of"]):
            complexity = QueryComplexity.BRIEF_QA
        elif any(k in q_lower for k in ["and", "also", "plus", "both"]) and word_count > 12:
            complexity = QueryComplexity.MULTI_PART_SYNTHESIS
        elif i_upper in ["LAB_REPORT", "LONGITUDINAL_COMPARISON", "HEALTH_SUMMARY", "DIGITAL_TWIN"]:
            complexity = QueryComplexity.DEEP_CLINICAL_AUDIT
        else:
            complexity = QueryComplexity.FOCUSED_ADVICE

        def _finalize(strat: ResponseStrategy) -> ResponseStrategy:
            if persona:
                strat.persona = persona

                # ── Override 1: Hyper-Acute Vitals Anomaly Safeguard ─────────────
                if persona.is_hyper_acute_vitals:
                    strat.mode = StrategyMode.URGENT_TRIAGE
                    strat.ui_modality = UIModality.CRITICAL_ALERT
                    strat.requires_alert_banner = True
                    strat.formatting_schema = "EMERGENCY_TRIAGE"
                    strat.tone = f"🚨 URGENT CLINICAL ALERT: Critical Vitals ({persona.first_name})"
                    return strat

                # ── Override 2: Polypharmacy Risk Safeguard ──────────────────────
                if persona.polypharmacy_risk.value == "HIGH":
                    strat.include_biogears_card = True
                    if "Polypharmacy" not in strat.tone:
                        strat.tone += " | Polypharmacy Safety Audit"

                # ── Override 3: Geriatric & Pediatric Cohort Tuning ──────────────
                if persona.age_cohort.value == "GERIATRIC":
                    strat.verbosity = VerbosityBudget.COMPACT
                elif persona.pediatric_caregiver:
                    strat.tone = f"Reassuring Caregiver Guidance ({persona.first_name})"

                # ── Override 4: Emotional Sentiment Adaptation ──────────────────
                if persona.emotional_sentiment.value == "ANXIOUS" and not strat.requires_alert_banner:
                    strat.tone = f"Reassuring, Calm & Gentle ({persona.first_name})"
                elif persona.emotional_sentiment.value == "MOTIVATED":
                    strat.tone = f"Encouraging & Goal-Driven ({persona.first_name})"
                elif persona.emotional_sentiment.value == "CONFUSED":
                    strat.tone = f"Clear & Step-by-Step ({persona.first_name})"
            return strat

        # ── Priority 1: Emergency Triage ──────────────────────────────────────
        if i_upper == "EMERGENCY" or any(k in q_lower for k in ["chest pain", "shortness of breath", "stroke", "suicid", "severe bleed"]):
            return _finalize(ResponseStrategy(
                mode=StrategyMode.URGENT_TRIAGE,
                tone="Urgent & Direct",
                complexity=QueryComplexity.FOCUSED_ADVICE,
                verbosity=VerbosityBudget.COMPACT,
                ui_modality=UIModality.CRITICAL_ALERT,
                formatting_schema="EMERGENCY_TRIAGE",
                temperature=0.20,
                top_p=0.80,
                max_tokens=400,
                requires_alert_banner=True,
                include_biogears_card=False,
                include_trend_chart=False,
            ))

        # ── Priority 2: General Conversation / Chit-Chat ─────────────────────
        if complexity == QueryComplexity.MICRO_CHAT or i_upper == "GENERAL_CONVERSATION":
            return _finalize(ResponseStrategy(
                mode=StrategyMode.CONVERSATIONAL,
                tone="Warm, Human & Conversational",
                complexity=QueryComplexity.MICRO_CHAT,
                verbosity=VerbosityBudget.MICRO,
                ui_modality=UIModality.CONVERSATIONAL_TEXT,
                formatting_schema="CHIT_CHAT",
                temperature=0.70,
                top_p=0.95,
                max_tokens=150,
                requires_alert_banner=False,
                include_biogears_card=False,
                include_trend_chart=False,
            ))

        # ── Priority 3: Mental Health & Wellbeing ─────────────────────────────
        if i_upper == "MENTAL_HEALTH":
            return _finalize(ResponseStrategy(
                mode=StrategyMode.MENTAL_WELLBEING,
                tone="Empathetic, Reassuring & Supportive",
                complexity=complexity,
                verbosity=VerbosityBudget.STANDARD,
                ui_modality=UIModality.ACTION_CARDS,
                formatting_schema="MENTAL_HEALTH_WELLBEING",
                temperature=0.65,
                top_p=0.92,
                max_tokens=500,
                requires_alert_banner=False,
                include_biogears_card=False,
                include_trend_chart=False,
            ))

        # ── Priority 4: Medication / Pharmacology ─────────────────────────────
        if i_upper in ["MEDICATION", "PRESCRIPTION"]:
            return _finalize(ResponseStrategy(
                mode=StrategyMode.PHARMACOLOGY,
                tone="Actionable, Protective & Accurate",
                complexity=complexity,
                verbosity=VerbosityBudget.STANDARD,
                ui_modality=UIModality.BULLET_HIGHLIGHTS,
                formatting_schema="PHARMACOLOGY_SAFETY" if i_upper == "MEDICATION" else "PRESCRIPTION_AUDIT",
                temperature=0.28,
                top_p=0.82,
                max_tokens=550,
                requires_alert_banner=False,
                include_biogears_card=True,
                include_trend_chart=False,
            ))

        # ── Priority 5: Longitudinal / Comparison ────────────────────────────
        if i_upper in ["LONGITUDINAL_COMPARISON", "TIMELINE"]:
            return _finalize(ResponseStrategy(
                mode=StrategyMode.COMPARISON,
                tone="Analytical & Clear",
                complexity=QueryComplexity.DEEP_CLINICAL_AUDIT,
                verbosity=VerbosityBudget.COMPREHENSIVE,
                ui_modality=UIModality.COMPARISON_TABLE,
                formatting_schema="LONGITUDINAL_TREND" if i_upper == "LONGITUDINAL_COMPARISON" else "TIMELINE_HISTORY",
                temperature=0.35,
                top_p=0.85,
                max_tokens=700,
                requires_alert_banner=False,
                include_biogears_card=True,
                include_trend_chart=True,
            ))

        # ── Priority 6: Digital Twin / Prediction ─────────────────────────────
        if i_upper == "DIGITAL_TWIN":
            return _finalize(ResponseStrategy(
                mode=StrategyMode.PREDICTION,
                tone="Scientific & Forward-looking",
                complexity=QueryComplexity.DEEP_CLINICAL_AUDIT,
                verbosity=VerbosityBudget.COMPREHENSIVE,
                ui_modality=UIModality.ACTION_CARDS,
                formatting_schema="DIGITAL_TWIN_SIMULATION",
                temperature=0.35,
                top_p=0.85,
                max_tokens=650,
                requires_alert_banner=False,
                include_biogears_card=True,
                include_trend_chart=True,
            ))

        # ── Priority 7: Education & Labs ──────────────────────────────────────
        if i_upper in ["GENERAL_HEALTH_EDUCATION", "LAB_REPORT"]:
            is_lab = i_upper == "LAB_REPORT"
            return _finalize(ResponseStrategy(
                mode=StrategyMode.EDUCATIONAL,
                tone="Educational & Empathetic",
                complexity=complexity if not is_lab else QueryComplexity.DEEP_CLINICAL_AUDIT,
                verbosity=VerbosityBudget.COMPACT if complexity == QueryComplexity.BRIEF_QA else VerbosityBudget.STANDARD,
                ui_modality=UIModality.COMPARISON_TABLE if is_lab else UIModality.BULLET_HIGHLIGHTS,
                formatting_schema="LAB_REPORT_ANALYSIS" if is_lab else "HEALTH_EDUCATION",
                temperature=0.40,
                top_p=0.88,
                max_tokens=650 if is_lab else 450,
                requires_alert_banner=False,
                include_biogears_card=True,
                include_trend_chart=is_lab,
            ))

        # ── Priority 8: Nutrition / Exercise / Lifestyle ─────────────────────
        if i_upper in ["NUTRITION", "EXERCISE", "LIFESTYLE", "HEALTH_GOAL"]:
            schema_map = {
                "NUTRITION": "NUTRITION_DIETETICS",
                "EXERCISE": "EXERCISE_PHYSIOLOGY",
                "LIFESTYLE": "LIFESTYLE_HABITS",
                "HEALTH_GOAL": "HEALTH_GOALS",
            }
            return _finalize(ResponseStrategy(
                mode=StrategyMode.LIFESTYLE_ACTION,
                tone="Practical, Encouraging & Actionable",
                complexity=complexity,
                verbosity=VerbosityBudget.STANDARD,
                ui_modality=UIModality.ACTION_CARDS,
                formatting_schema=schema_map.get(i_upper, "LIFESTYLE_HABITS"),
                temperature=0.48,
                top_p=0.90,
                max_tokens=500,
                requires_alert_banner=False,
                include_biogears_card=True,
                include_trend_chart=False,
            ))

        # ── Priority 9: Acute Symptoms / Injury / Pediatric / Derm / Dental ────
        if i_upper in ["SYMPTOMS", "INJURY", "PEDIATRIC", "DERMATOLOGY", "DENTAL", "WOMENS_HEALTH", "TRAVEL_HEALTH", "PREVENTIVE_CARE", "DOCTOR_FOLLOWUP", "FAMILY", "REMINDER", "RISK"]:
            schema_map = {
                "SYMPTOMS": "ACUTE_SYMPTOM",
                "INJURY": "INJURY_FIRST_AID",
                "PEDIATRIC": "PEDIATRIC_CARE",
                "DERMATOLOGY": "DERMATOLOGY",
                "DENTAL": "DENTAL_CARE",
                "WOMENS_HEALTH": "WOMENS_HEALTH",
                "TRAVEL_HEALTH": "TRAVEL_HEALTH",
                "PREVENTIVE_CARE": "PREVENTIVE_CARE",
                "DOCTOR_FOLLOWUP": "DOCTOR_PREPARATION",
                "FAMILY": "FAMILY_HEALTH",
                "REMINDER": "REMINDER_SCHEDULE",
                "RISK": "RISK_STRATIFICATION",
            }
            return _finalize(ResponseStrategy(
                mode=StrategyMode.DECISION_SUPPORT if i_upper in ["MEDICATION", "DOCTOR_FOLLOWUP"] else StrategyMode.ASSESSMENT,
                tone="Calm, Clear & Clinical",
                complexity=complexity,
                verbosity=VerbosityBudget.STANDARD,
                ui_modality=UIModality.ACTION_CARDS if i_upper in ["INJURY", "PEDIATRIC"] else UIModality.BULLET_HIGHLIGHTS,
                formatting_schema=schema_map.get(i_upper, "ADAPTIVE_HEALTH"),
                temperature=0.35,
                top_p=0.85,
                max_tokens=550,
                requires_alert_banner=False,
                include_biogears_card=True,
                include_trend_chart=False,
            ))

        # ── Default Fallback: Adaptive Assessment Mode ─────────────────────────
        logger.info(f"🎨 Planned Strategy: Dynamic Assessment Mode for intent [{intent}]")
        return _finalize(ResponseStrategy(
            mode=StrategyMode.ASSESSMENT,
            tone="Reassuring & Empathetic",
            complexity=complexity,
            verbosity=VerbosityBudget.STANDARD,
            ui_modality=UIModality.BULLET_HIGHLIGHTS,
            formatting_schema="ADAPTIVE_HEALTH",
            temperature=0.45,
            top_p=0.90,
            max_tokens=500,
            requires_alert_banner=False,
            include_biogears_card=True,
            include_trend_chart=False,
        ))

