"""
healthbot_v4/apps/brain/reasoning/ui_selector.py

UI Component Selector for Personal Health Operating System (PHOS).
Maps response sections and data artifacts to optimal frontend widgets.
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from healthbot_v4.apps.brain.reasoning.response_strategy import ResponseStrategy, StrategyMode
from healthbot_v4.shared.logger.logger import logger


class UIWidget(BaseModel):
    widget_type: str        # alert_banner, summary_card, trend_chart, comparison_table, biogears_card, followup_chips
    title: str
    payload: Dict[str, Any] = Field(default_factory=dict)


class UIComponentSelection(BaseModel):
    widgets: List[UIWidget] = Field(default_factory=list)

    def to_json_contract(self) -> Dict[str, Any]:
        return {
            "widgets": [
                {
                    "type": w.widget_type,
                    "title": w.title,
                    "payload": w.payload,
                }
                for w in self.widgets
            ]
        }


class UIComponentSelector:
    """
    Selects UI widgets for rendering in mobile/web client.
    """

    def select_components(
        self,
        strategy: ResponseStrategy,
        summary_text: str,
        follow_ups: List[str],
        twin_data: Optional[Dict[str, Any]] = None
    ) -> UIComponentSelection:
        widgets: List[UIWidget] = []

        persona = getattr(strategy, "persona", None)

        # 1. Emergency Alert Banner
        if strategy.requires_alert_banner or strategy.mode == StrategyMode.URGENT_TRIAGE or (persona and persona.is_hyper_acute_vitals):
            msg = "Your query or vitals indicate potential urgent symptoms. Please seek emergency medical care immediately."
            if persona and persona.is_hyper_acute_vitals:
                msg = f"Critical vital anomaly for {persona.first_name}: {'; '.join(persona.hyper_acute_details)}. Seek medical evaluation."
            widgets.append(UIWidget(
                widget_type="alert_banner",
                title="🚨 Medical Alert / Immediate Attention Recommended",
                payload={"message": msg, "level": "critical"}
            ))

        # 2. Executive Summary Card
        widgets.append(UIWidget(
            widget_type="summary_card",
            title=f"Clinical Summary ({persona.first_name})" if persona and persona.first_name else "Clinical Summary",
            payload={"text": summary_text, "mode": strategy.mode.value}
        ))

        # 2b. Polypharmacy Safety Card (if 4+ active meds)
        if persona and persona.polypharmacy_risk.value == "HIGH":
            widgets.append(UIWidget(
                widget_type="medication_safety_card",
                title="💊 Polypharmacy Safety Audit",
                payload={
                    "active_med_count": len(persona.active_medications),
                    "medications": persona.active_medications,
                    "warning": "Concurrent medication regimen requires routine drug-interaction checks and timing adherence.",
                }
            ))

        # 2c. Active Symptoms Card (when schema is ACUTE_SYMPTOM or symptoms are evaluated)
        if strategy.formatting_schema == "ACUTE_SYMPTOM":
            widgets.append(UIWidget(
                widget_type="active_symptoms_card",
                title="🩺 Active Symptoms & Evidence-Based Remedies",
                payload={
                    "mode": "SYMPTOM_EVALUATION",
                    "guidance": "Focus on rest, hydration, monitoring symptom progression, and seeking medical evaluation if red flags develop.",
                }
            ))

        # 3. BioGears Simulation Digital Twin Card (ONLY for explicit simulation requests)
        if strategy.include_biogears_card and strategy.formatting_schema == "DIGITAL_TWIN_SIMULATION":
            widgets.append(UIWidget(
                widget_type="biogears_card",
                title="Digital Twin Physiological Simulation",
                payload=twin_data or {
                    "cardiac_output": "5.2 L/min (Normal)",
                    "map": "93 mmHg (Stable)",
                    "organ_perfusion": "Optimal",
                }
            ))

        # 4. Trend Chart (if applicable)
        if strategy.include_trend_chart:
            widgets.append(UIWidget(
                widget_type="trend_chart",
                title="6-Month Vitals Trend",
                payload={"metric": "Resting Heart Rate", "unit": "bpm", "status": "Stable Range"}
            ))

        # 5. Follow-up Chips
        if follow_ups:
            widgets.append(UIWidget(
                widget_type="followup_chips",
                title="Suggested Next Questions",
                payload={"chips": follow_ups}
            ))

        logger.info(f"📱 Selected {len(widgets)} UI components for rendering")
        return UIComponentSelection(widgets=widgets)
