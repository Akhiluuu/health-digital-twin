"""
healthbot_v4/apps/brain/evidence/otm.py
Orchestration & Tool Manager (OTM) for VitalHealth PHIS.
Collects evidence from all relevant health modules and returns a structured EvidenceBundle.
The LLM receives ONLY this bundle — never raw database state.
"""
from __future__ import annotations
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from healthbot_v4.apps.brain.evidence.evidence_bundle import (
    ConfidenceLevel, EvidenceBundle, EvidenceConflict,
    EvidenceFinding, EvidenceSource, SourceStatus, TrendDirection,
)
from healthbot_v4.shared.models.base import PatientState
from healthbot_v4.apps.brain.reasoning.longitudinal_engine import LongitudinalAnalysisResult


def _fid() -> str:
    return str(uuid.uuid4())[:8]


def _now_label() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


# Intent → which collectors to run
_INTENT_MODULE_MAP: Dict[str, List[str]] = {
    "GENERAL_HEALTH":        ["medical_records","biogears_twin","vitals_history","medications","symptoms","labs","lifestyle","organ_scores"],
    "HEALTH_SUMMARY":        ["medical_records","biogears_twin","vitals_history","medications","symptoms","labs","telemetry","lifestyle","organ_scores"],
    "SYMPTOMS":              ["symptoms","medications","vitals_history","medical_records","labs","lifestyle"],
    "LAB_REPORT":            ["labs","medical_records","medications","biogears_twin"],
    "MEDICATION":            ["medications","medical_records","labs","symptoms"],
    "PRESCRIPTION":          ["medications","medical_records","labs"],
    "DIGITAL_TWIN":          ["biogears_twin","vitals_history","organ_scores","telemetry"],
    "EXERCISE":              ["telemetry","biogears_twin","vitals_history","lifestyle","medications"],
    "NUTRITION":             ["medications","labs","biogears_twin","lifestyle","family_history"],
    "MENTAL_HEALTH":         ["symptoms","lifestyle","telemetry","medications","cognitive"],
    "LONGITUDINAL_COMPARISON":["labs","vitals_history","biogears_twin","medications","telemetry","longitudinal"],
    "TIMELINE":              ["medical_records","labs","medications","vitals_history","longitudinal"],
    "DOCTOR_FOLLOWUP":       ["medical_records","medications","labs","vitals_history","biogears_twin","symptoms"],
    "LIFESTYLE":             ["lifestyle","telemetry","vitals_history","symptoms"],
    "PREVENTIVE_CARE":       ["medical_records","labs","medications","family_history"],
    "RISK":                  ["medical_records","labs","vitals_history","biogears_twin","family_history"],
    "FAMILY":                ["family_history","medical_records"],
    "HEALTH_GOAL":           ["telemetry","vitals_history","labs","medications","lifestyle"],
    "WOMENS_HEALTH":         ["medical_records","labs","medications","symptoms"],
    "PEDIATRIC":             ["medical_records","medications","symptoms","labs"],
    "DERMATOLOGY":           ["medical_records","medications","symptoms"],
    "DENTAL":                ["medical_records","medications","symptoms"],
    "INJURY":                ["symptoms","medications","medical_records"],
    "TRAVEL_HEALTH":         ["medical_records","medications"],
    "REMINDER":              ["medications"],
    "GENERAL_HEALTH_EDUCATION": ["medical_records","labs","medications"],
    "GENERAL_CONVERSATION":  ["medical_records","medications"],
    "EMERGENCY":             ["biogears_twin","vitals_history","medications"],
}


class OrchestratorToolManager:
    """
    Collects evidence from every relevant health module based on intent,
    then assembles a structured EvidenceBundle for the LLM reasoning layer.
    """

    def collect_evidence(
        self,
        query: str,
        intent: str,
        state: PatientState,
        patient_context: Optional[Dict[str, Any]] = None,
        symptoms_logged: Optional[List[str]] = None,
        longitudinal_res: Optional[LongitudinalAnalysisResult] = None,
    ) -> EvidenceBundle:
        pc = patient_context or {}
        modules = _INTENT_MODULE_MAP.get(intent, list(_INTENT_MODULE_MAP["GENERAL_HEALTH"]))

        sources: List[EvidenceSource] = []
        all_findings: List[EvidenceFinding] = []
        missing_data: List[str] = []

        dispatch = {
            "medical_records": lambda: self._collect_medical_records(state, pc),
            "biogears_twin":   lambda: self._collect_biogears_twin(state, pc),
            "vitals_history":  lambda: self._collect_vitals_history(state, pc),
            "telemetry":       lambda: self._collect_telemetry(pc),
            "medications":     lambda: self._collect_medications(state),
            "symptoms":        lambda: self._collect_symptoms(state, symptoms_logged or [], pc),
            "labs":            lambda: self._collect_labs(state, pc),
            "family_history":  lambda: self._collect_family_history(pc),
            "lifestyle":       lambda: self._collect_lifestyle(pc),
            "cognitive":       lambda: self._collect_cognitive(pc),
            "organ_scores":    lambda: self._collect_organ_scores(pc),
            "longitudinal":    lambda: self._collect_longitudinal(longitudinal_res),
        }

        for module_key in modules:
            if module_key in dispatch:
                src = dispatch[module_key]()
                sources.append(src)
                all_findings.extend(src.findings)
                if src.status != SourceStatus.available and src.missing_reason:
                    missing_data.append(src.missing_reason)

        conflicts = self._detect_conflicts(all_findings)
        confidence = self._compute_confidence(sources)

        return EvidenceBundle(
            intent=intent,
            query=query,
            sources=sources,
            findings=all_findings,
            conflicts=conflicts,
            missing_data=missing_data,
            overall_confidence=confidence,
            overall_confidence_label=(
                ConfidenceLevel.high if confidence >= 0.80
                else ConfidenceLevel.medium if confidence >= 0.55
                else ConfidenceLevel.low
            ),
        )

    # -------------------------------------------------------------------------
    # Module Collectors
    # -------------------------------------------------------------------------

    def _collect_medical_records(self, state: Any, pc: Optional[Dict] = None) -> EvidenceSource:
        findings: List[EvidenceFinding] = []
        patient_ctx = pc or {}

        raw_conditions = getattr(state, "conditions", None) or getattr(state, "current_conditions", None) or []
        conditions = [getattr(c, "condition_name", getattr(c, "name", str(c))) for c in raw_conditions]
        if not conditions and patient_ctx.get("conditions"):
            ctx_conds = patient_ctx["conditions"]
            if isinstance(ctx_conds, list):
                conditions = [c.get("name", str(c)) if isinstance(c, dict) else str(c) for c in ctx_conds]
            elif isinstance(ctx_conds, str) and ctx_conds.strip():
                conditions = [c.strip() for c in ctx_conds.split(",") if c.strip()]
        
        allergies = []
        if hasattr(state, "get_allergy_names"):
            allergies = state.get_allergy_names()
        elif hasattr(getattr(state, "profile", None), "allergies") and getattr(state.profile, "allergies", None):
            allergies = getattr(state.profile, "allergies", [])
        else:
            raw_allergies = getattr(state, "allergies", None) or []
            allergies = [getattr(a, "substance", str(a)) for a in raw_allergies]

        if not allergies and patient_ctx.get("allergies"):
            ctx_algs = patient_ctx["allergies"]
            if isinstance(ctx_algs, list):
                allergies = [a.get("substance", str(a)) if isinstance(a, dict) else str(a) for a in ctx_algs]
            elif isinstance(ctx_algs, str) and ctx_algs.strip():
                allergies = [a.strip() for a in ctx_algs.split(",") if a.strip()]

        if conditions:
            for c_name in conditions:
                findings.append(EvidenceFinding(
                    finding_id=_fid(), label="Diagnosed Condition",
                    value=c_name, source_name="Medical Records",
                    source_type="medical_records", timestamp_label="On record",
                    confidence=ConfidenceLevel.high,
                ))
        if allergies:
            findings.append(EvidenceFinding(
                finding_id=_fid(), label="Known Allergies",
                value=", ".join(allergies) if isinstance(allergies, list) else str(allergies), source_name="Medical Records",
                source_type="medical_records", timestamp_label="On record",
                confidence=ConfidenceLevel.high,
            ))

        status = SourceStatus.available if findings else SourceStatus.missing
        return EvidenceSource(
            name="Medical Records", source_type="medical_records",
            status=status, records_count=len(findings),
            last_updated="On record", confidence=ConfidenceLevel.high,
            findings=findings,
            missing_reason="No diagnosed conditions or allergies on record" if not findings else None,
        )

    def _collect_biogears_twin(self, state: PatientState, pc: Dict) -> EvidenceSource:
        sim_v = pc.get("sim_vitals") or pc.get("simulation_vitals") or pc.get("vitals") or {}
        body_m = pc.get("body_measurements") or {}
        findings: List[EvidenceFinding] = []

        def _val(keys, default=None):
            for k in keys:
                v = sim_v.get(k)
                if v is not None:
                    return v
            return default

        hr = _val(["heart_rate","heartRate","hr"], body_m.get("resting_hr"))
        if hr:
            findings.append(EvidenceFinding(
                finding_id=_fid(), label="Heart Rate (BioGears Twin)",
                value=f"{hr} bpm", source_name="BioGears Digital Twin",
                source_type="biogears_twin", timestamp_label=_now_label(),
                confidence=ConfidenceLevel.high, confidence_pct=0.93,
            ))

        sys_bp = _val(["systolic_bp","systolicBp"])
        dia_bp = _val(["diastolic_bp","diastolicBp"])
        bp_raw = _val(["blood_pressure","bloodPressure"], body_m.get("blood_pressure"))
        bp_str = f"{sys_bp}/{dia_bp} mmHg" if (sys_bp and dia_bp) else (str(bp_raw) if bp_raw else None)
        if bp_str:
            findings.append(EvidenceFinding(
                finding_id=_fid(), label="Blood Pressure (BioGears Twin)",
                value=bp_str, source_name="BioGears Digital Twin",
                source_type="biogears_twin", timestamp_label=_now_label(),
                confidence=ConfidenceLevel.high, confidence_pct=0.93,
            ))

        for key, label, unit in [
            (["map","mean_arterial_pressure"], "Mean Arterial Pressure", "mmHg"),
            (["cardiac_output","cardiacOutput"], "Cardiac Output", "L/min"),
            (["stroke_volume","strokeVolume"], "Stroke Volume", "mL"),
            (["spo2","spO2"], "SpO2", "%"),
            (["respiration","respiration_rate","respirationRate"], "Respiration Rate", "br/min"),
            (["glucose"], "Glucose (Simulation)", "mg/dL"),
            (["core_temperature","coreTemperature"], "Core Temperature", "°C"),
        ]:
            v = _val(key)
            if v:
                findings.append(EvidenceFinding(
                    finding_id=_fid(), label=label,
                    value=f"{v} {unit}", source_name="BioGears Digital Twin",
                    source_type="biogears_twin", timestamp_label=_now_label(),
                    confidence=ConfidenceLevel.high, confidence_pct=0.93,
                ))

        status = SourceStatus.available if findings else SourceStatus.missing
        return EvidenceSource(
            name="BioGears Digital Twin", source_type="biogears_twin",
            status=status, records_count=len(findings),
            last_updated=_now_label(), confidence=ConfidenceLevel.high, confidence_pct=0.93,
            findings=findings,
            missing_reason="No BioGears simulation vitals received from mobile client" if not findings else None,
        )

    def _collect_vitals_history(self, state: Any, pc: Dict) -> EvidenceSource:
        body_m = pc.get("body_measurements") or {}
        findings: List[EvidenceFinding] = []

        vitals_list = getattr(state, "recent_vitals", None) or getattr(state, "latest_vitals", None) or []
        for vital in vitals_list:
            v_name = getattr(vital, "vital_type", None) or getattr(vital, "metric_name", "Vital")
            v_val = getattr(vital, "value_primary", getattr(vital, "value", ""))
            v_sec = getattr(vital, "value_secondary", None)
            v_unit = getattr(vital, "unit", "")
            val_str = f"{v_val}"
            if v_sec is not None:
                val_str += f"/{v_sec}"
            val_str += f" {v_unit}".rstrip()
            findings.append(EvidenceFinding(
                finding_id=_fid(), label=v_name.replace("_", " ").title(),
                value=val_str, source_name="Logged Vitals History",
                source_type="vital_logs", timestamp_label="Recent reading",
                confidence=ConfidenceLevel.high,
            ))

        if not findings and body_m:
            for key, label, unit in [
                ("resting_hr", "Resting Heart Rate", "bpm"),
                ("blood_pressure", "Blood Pressure", ""),
                ("bmi", "BMI", "kg/m²"),
                ("weight", "Weight", ""),
            ]:
                v = body_m.get(key)
                if v:
                    findings.append(EvidenceFinding(
                        finding_id=_fid(), label=label,
                        value=f"{v} {unit}".strip(), source_name="Logged Vitals History",
                        source_type="vital_logs", timestamp_label="Profile measurement",
                        confidence=ConfidenceLevel.medium,
                    ))

        status = SourceStatus.available if findings else SourceStatus.missing
        return EvidenceSource(
            name="Vital History", source_type="vital_logs",
            status=status, records_count=len(findings),
            last_updated="Recent", confidence=ConfidenceLevel.high,
            findings=findings,
            missing_reason="No vitals logged yet — start logging BP, HR in the Vitals tab" if not findings else None,
        )

    def _collect_telemetry(self, pc: Dict) -> EvidenceSource:
        fit_a = pc.get("fitness_activity") or {}
        hyd_a = pc.get("hydration") or {}
        telemetry_cache = pc.get("telemetry_cache") or {}
        findings: List[EvidenceFinding] = []

        steps = fit_a.get("steps") or telemetry_cache.get("daily_steps")
        if steps:
            findings.append(EvidenceFinding(
                finding_id=_fid(), label="Daily Steps (Hardware Telemetry)",
                value=f"{steps:,} steps", source_name="Telemetry Engine",
                source_type="telemetry", timestamp_label="Today",
                confidence=ConfidenceLevel.high,
            ))

        water = hyd_a.get("today_ml")
        if water:
            findings.append(EvidenceFinding(
                finding_id=_fid(), label="Hydration", value=f"{water} mL / 2500 mL goal",
                source_name="Telemetry Engine", source_type="telemetry",
                timestamp_label="Today", confidence=ConfidenceLevel.high,
            ))

        status = SourceStatus.available if findings else SourceStatus.missing
        return EvidenceSource(
            name="Telemetry Engine", source_type="telemetry",
            status=status, records_count=len(findings),
            last_updated="Today", confidence=ConfidenceLevel.medium,
            findings=findings,
            missing_reason="No activity/telemetry data received — connect wearable or log activity" if not findings else None,
        )

    def _collect_medications(self, state: Any) -> EvidenceSource:
        findings: List[EvidenceFinding] = []
        meds_list = getattr(state, "active_medications", None) or getattr(state, "active_regimen", None) or []
        for m in meds_list:
            m_name = getattr(m, "name", "Medication")
            m_dose = getattr(m, "dosage_form", None) or getattr(m, "dose", "")
            m_freq = getattr(m, "frequency", "")
            findings.append(EvidenceFinding(
                finding_id=_fid(),
                label=f"Active Medication: {m_name}",
                value=f"{m_dose}, {m_freq}".strip(", "),
                source_name="Medication Vault",
                source_type="medication_vault",
                timestamp_label="Current regimen",
                confidence=ConfidenceLevel.high,
            ))

        status = SourceStatus.available if findings else SourceStatus.missing
        return EvidenceSource(
            name="Medication Vault", source_type="medication_vault",
            status=status, records_count=len(findings),
            last_updated="Current", confidence=ConfidenceLevel.high,
            findings=findings,
            missing_reason="No active medications on record" if not findings else None,
        )

    def _collect_symptoms(self, state: Any, symptoms_logged: List[str], pc: Optional[Dict] = None) -> EvidenceSource:
        findings: List[EvidenceFinding] = []
        seen: set = set()
        patient_ctx = pc or {}

        def _add_finding(sym_text: str, ts_label: str = "Logged"):
            if not sym_text:
                return
            clean_text = sym_text.strip()
            if clean_text and clean_text not in seen:
                seen.add(clean_text)
                findings.append(EvidenceFinding(
                    finding_id=_fid(), label="Active Symptom",
                    value=clean_text, source_name="Symptom Journal",
                    source_type="symptom_journal", timestamp_label=ts_label,
                    confidence=ConfidenceLevel.high,
                ))

        # 1. From symptoms_logged list argument
        for s in symptoms_logged:
            if isinstance(s, dict):
                n = s.get("name") or s.get("title") or "Symptom"
                sev = s.get("severity") or "Active"
                val = f"{n} (Severity: {sev})"
                raw_notes = s.get("notes")
                if raw_notes:
                    val += f" - {raw_notes}"
                _add_finding(val)
            elif isinstance(s, str):
                _add_finding(s)

        # 2. From state.recent_symptoms, state.symptoms, state.logged_symptoms
        state_syms = (
            getattr(state, "recent_symptoms", []) or
            getattr(state, "symptoms", []) or
            getattr(state, "logged_symptoms", []) or
            getattr(state, "active_symptoms", [])
        )
        for s in state_syms:
            if isinstance(s, dict):
                n = s.get("name") or s.get("title") or "Symptom"
                sev = s.get("severity") or "Active"
                val = f"{n} (Severity: {sev})"
                raw_notes = s.get("notes")
                if raw_notes:
                    val += f" - {raw_notes}"
                _add_finding(val, s.get("date") or s.get("timestamp") or "Logged")
            elif isinstance(s, str):
                _add_finding(s)

        # 3. From patient_context activeSymptoms / symptoms
        ctx_syms = patient_ctx.get("active_symptoms") or patient_ctx.get("activeSymptoms") or patient_ctx.get("symptoms") or []
        for s in ctx_syms:
            if isinstance(s, dict):
                n = s.get("name") or s.get("title") or "Symptom"
                sev = s.get("severity") or "Active"
                val = f"{n} (Severity: {sev})"
                raw_notes = s.get("notes")
                if raw_notes:
                    val += f" - {raw_notes}"
                _add_finding(val)
            elif isinstance(s, str):
                _add_finding(s)

        status = SourceStatus.available if findings else SourceStatus.missing
        return EvidenceSource(
            name="Symptom Journal", source_type="symptom_journal",
            status=status, records_count=len(findings),
            last_updated="Recent", confidence=ConfidenceLevel.high,
            findings=findings,
            missing_reason="No symptoms currently logged in journal" if not findings else None,
        )


    def _collect_labs(self, state: Any, pc: Optional[Dict] = None) -> EvidenceSource:
        findings: List[EvidenceFinding] = []
        patient_ctx = pc or {}
        labs_list = getattr(state, "recent_labs", None) or getattr(state, "lab_trends", None) or []
        for lab in labs_list:
            name = getattr(lab, "canonical_name", None) or getattr(lab, "biomarker_name", "Lab Test")
            val = getattr(lab, "value", "")
            unit = getattr(lab, "unit", "")
            cls_status = getattr(lab, "classification", None) or getattr(lab, "status", "NORMAL")
            is_abn = str(cls_status).lower() not in ["normal", "optimal", "within range", ""]
            findings.append(EvidenceFinding(
                finding_id=_fid(), label=name,
                value=f"{val} {unit} ({cls_status})".strip(),
                source_name="Uploaded Lab Reports",
                source_type="lab_reports",
                timestamp_label="Recent",
                confidence=ConfidenceLevel.high,
                is_abnormal=is_abn,
            ))

        if not findings and patient_ctx.get("uploaded_labs"):
            up_labs = patient_ctx["uploaded_labs"]
            if isinstance(up_labs, list):
                for doc in up_labs:
                    if isinstance(doc, dict):
                        doc_name = doc.get("name", "Uploaded Lab Document")
                        chunks = doc.get("chunkCount", 1)
                        findings.append(EvidenceFinding(
                            finding_id=_fid(), label="Uploaded Document",
                            value=f"{doc_name} ({chunks} vector chunks indexed)",
                            source_name="Uploaded Lab Reports",
                            source_type="lab_reports",
                            timestamp_label="Indexed",
                            confidence=ConfidenceLevel.high,
                        ))

        status = SourceStatus.available if findings else SourceStatus.missing
        return EvidenceSource(
            name="Uploaded Lab Reports", source_type="lab_reports",
            status=status, records_count=len(findings),
            last_updated=findings[-1].timestamp_label if findings else "Never",
            confidence=ConfidenceLevel.high,
            findings=findings,
            missing_reason="No lab reports uploaded yet — upload reports via the Documents tab" if not findings else None,
        )

    def _collect_family_history(self, pc: Dict) -> EvidenceSource:
        fh = pc.get("family_history") or {}
        findings: List[EvidenceFinding] = []
        if isinstance(fh, dict):
            for condition, has_it in fh.items():
                if has_it:
                    findings.append(EvidenceFinding(
                        finding_id=_fid(), label="Family History",
                        value=condition.replace("_", " ").title(),
                        source_name="Family Health Profile",
                        source_type="family_history", timestamp_label="On record",
                        confidence=ConfidenceLevel.medium,
                    ))
        elif isinstance(fh, str) and fh.strip():
            findings.append(EvidenceFinding(
                finding_id=_fid(), label="Family History",
                value=fh.strip(), source_name="Family Health Profile",
                source_type="family_history", timestamp_label="On record",
                confidence=ConfidenceLevel.medium,
            ))

        status = SourceStatus.available if findings else SourceStatus.missing
        return EvidenceSource(
            name="Family Health Profile", source_type="family_history",
            status=status, records_count=len(findings),
            last_updated="On record", confidence=ConfidenceLevel.medium,
            findings=findings,
            missing_reason="No family history data recorded" if not findings else None,
        )

    def _collect_lifestyle(self, pc: Dict) -> EvidenceSource:
        ls = pc.get("lifestyle") or {}
        findings: List[EvidenceFinding] = []
        if isinstance(ls, dict):
            for key, label in [
                ("sleep_hours", "Sleep Duration"),
                ("exercise_days_per_week", "Exercise Frequency"),
                ("smoking", "Smoking Status"),
                ("alcohol", "Alcohol Consumption"),
                ("stress_level", "Stress Level"),
            ]:
                v = ls.get(key)
                if v is not None and str(v).strip():
                    v_str = str(v)
                    unit = ""
                    if key == "sleep_hours" and not any(u in v_str.lower() for u in ["hr", "hour"]):
                        unit = " hrs/night"
                    elif key == "exercise_days_per_week" and not any(u in v_str.lower() for u in ["day", "week", "active"]):
                        unit = " days/week"
                    findings.append(EvidenceFinding(
                        finding_id=_fid(), label=label,
                        value=f"{v_str}{unit}", source_name="Lifestyle Profile",
                        source_type="lifestyle", timestamp_label="Profile",
                        confidence=ConfidenceLevel.medium,
                    ))

        status = SourceStatus.available if findings else SourceStatus.missing
        return EvidenceSource(
            name="Lifestyle Profile", source_type="lifestyle",
            status=status, records_count=len(findings),
            last_updated="Profile", confidence=ConfidenceLevel.medium,
            findings=findings,
            missing_reason="No lifestyle data recorded (sleep, exercise, smoking)" if not findings else None,
        )

    def _collect_cognitive(self, pc: Dict) -> EvidenceSource:
        cog = pc.get("cognitive_assessment") or {}
        findings: List[EvidenceFinding] = []
        if isinstance(cog, dict) and cog:
            score = cog.get("overall_score")
            if score:
                findings.append(EvidenceFinding(
                    finding_id=_fid(), label="Cognitive Health Score",
                    value=f"{score}/100", source_name="Cognitive Assessments",
                    source_type="cognitive", timestamp_label="Last assessment",
                    confidence=ConfidenceLevel.medium,
                ))
            domains = cog.get("domain_scores") or {}
            if isinstance(domains, dict):
                for d, v in domains.items():
                    findings.append(EvidenceFinding(
                        finding_id=_fid(), label=f"Cognitive Domain: {d.title()}",
                        value=f"{v}/100", source_name="Cognitive Assessments",
                        source_type="cognitive", timestamp_label="Last assessment",
                        confidence=ConfidenceLevel.medium,
                    ))

        status = SourceStatus.available if findings else SourceStatus.missing
        return EvidenceSource(
            name="Cognitive Assessments", source_type="cognitive",
            status=status, records_count=len(findings),
            last_updated="Last assessment", confidence=ConfidenceLevel.medium,
            findings=findings,
            missing_reason="No cognitive assessments completed yet" if not findings else None,
        )

    def _collect_organ_scores(self, pc: Dict) -> EvidenceSource:
        organ_s = pc.get("organ_scores") or pc.get("organScores") or {}
        findings: List[EvidenceFinding] = []
        scores_dict = organ_s.get("scores") if isinstance(organ_s.get("scores"), dict) else organ_s
        if isinstance(scores_dict, dict):
            for k, v in scores_dict.items():
                if isinstance(v, (int, float)) and k not in ["overall_score", "timestamp"]:
                    findings.append(EvidenceFinding(
                        finding_id=_fid(), label=f"Organ Health: {k.title()}",
                        value=f"{v:.0f}/100", source_name="BioGears Organ Scores",
                        source_type="organ_scores", timestamp_label=_now_label(),
                        confidence=ConfidenceLevel.high, confidence_pct=0.90,
                        is_abnormal=(float(v) < 60),
                    ))

        status = SourceStatus.available if findings else SourceStatus.missing
        return EvidenceSource(
            name="BioGears Organ Scores", source_type="organ_scores",
            status=status, records_count=len(findings),
            last_updated=_now_label(), confidence=ConfidenceLevel.high, confidence_pct=0.90,
            findings=findings,
            missing_reason="No organ score simulation data available" if not findings else None,
        )

    def _collect_longitudinal(self, longitudinal_res: Optional[LongitudinalAnalysisResult]) -> EvidenceSource:
        findings: List[EvidenceFinding] = []
        if longitudinal_res:
            all_deltas = (longitudinal_res.lab_deltas or []) + (longitudinal_res.vital_deltas or [])
            for d in all_deltas:
                interp = getattr(d, "clinical_interpretation", None) or str(d)
                findings.append(EvidenceFinding(
                    finding_id=_fid(), label="Longitudinal Trend",
                    value=interp, source_name="Health Timeline",
                    source_type="longitudinal", timestamp_label="Historical",
                    confidence=ConfidenceLevel.medium,
                ))

        status = SourceStatus.available if findings else SourceStatus.missing
        return EvidenceSource(
            name="Health Timeline", source_type="longitudinal",
            status=status, records_count=len(findings),
            last_updated="Historical", confidence=ConfidenceLevel.medium,
            findings=findings,
            missing_reason="Insufficient historical data for trend analysis" if not findings else None,
        )

    # -------------------------------------------------------------------------
    # Cross-source conflict detection
    # -------------------------------------------------------------------------

    def _detect_conflicts(self, findings: List[EvidenceFinding]) -> List[EvidenceConflict]:
        conflicts: List[EvidenceConflict] = []

        # 1. Compare glucose: Lab vs BioGears Twin
        lab_glucose = next((f for f in findings if f.source_type == "lab_reports" and "glucose" in f.label.lower()), None)
        twin_glucose = next((f for f in findings if f.source_type == "biogears_twin" and "glucose" in f.label.lower()), None)
        if lab_glucose and twin_glucose and lab_glucose.value and twin_glucose.value:
            try:
                lv = float("".join(c for c in lab_glucose.value if c.isdigit() or c == "."))
                tv = float("".join(c for c in twin_glucose.value if c.isdigit() or c == "."))
                if abs(lv - tv) > 25:
                    conflicts.append(EvidenceConflict(
                        metric="Blood Glucose Discrepancy",
                        source_a="Uploaded Lab Reports", value_a=lab_glucose.value,
                        source_b="BioGears Digital Twin", value_b=twin_glucose.value,
                        possible_reasons=["Fasting vs post-prandial timing delta", "Sensor calibration baseline", "Acute metabolic flux"],
                        recommendation="Reconcile with a capillary fingerstick blood glucose measurement.",
                    ))
            except (ValueError, TypeError):
                pass

        # 2. Medication vs Known Allergies Contradiction
        med_findings = [f for f in findings if f.source_type in ["medication_vault", "medications"]]
        allergy_finding = next((f for f in findings if f.source_type == "medical_records" and "allerg" in f.label.lower()), None)
        if med_findings and allergy_finding and allergy_finding.value:
            allergen_text = str(allergy_finding.value).lower()
            for med in med_findings:
                med_name = f"{med.label} {med.value}".lower()
                for allergen in [a.strip() for a in allergen_text.split(",") if a.strip()]:
                    if allergen in med_name or (len(allergen) > 3 and allergen in med_name):
                        conflicts.append(EvidenceConflict(
                            metric=f"Allergy-Medication Risk ({allergen.title()})",
                            source_a="Medication Vault", value_a=med.value or med.label,
                            source_b="Medical Records", value_b=f"Allergic to {allergen.title()}",
                            possible_reasons=["Active prescription matches documented allergen", "Unintended drug exposure"],
                            recommendation=f"CRITICAL: Verify with prescribing physician before administering {med.value or med.label}.",
                        ))

        # 3. Heart Rate: Telemetry/Vitals vs BioGears Twin
        vital_hr = next((f for f in findings if f.source_type in ["vital_logs", "vitals_history", "telemetry"] and "heart rate" in f.label.lower()), None)
        twin_hr = next((f for f in findings if f.source_type == "biogears_twin" and "heart rate" in f.label.lower()), None)
        if vital_hr and twin_hr and vital_hr.value and twin_hr.value:
            try:
                vh = float("".join(c for c in vital_hr.value if c.isdigit() or c == "."))
                th = float("".join(c for c in twin_hr.value if c.isdigit() or c == "."))
                if abs(vh - th) > 20:
                    conflicts.append(EvidenceConflict(
                        metric="Heart Rate Variance",
                        source_a=vital_hr.source_name, value_a=vital_hr.value,
                        source_b="BioGears Digital Twin", value_b=twin_hr.value,
                        possible_reasons=["Acute physical activity / stress response", "Wearable PPG sensor artifact", "Simulation state drift"],
                        recommendation="Re-measure resting pulse for 60 seconds at rest.",
                    ))
            except (ValueError, TypeError):
                pass

        # 4. Blood Pressure: Logged Vitals vs BioGears Twin
        vital_bp = next((f for f in findings if f.source_type in ["vital_logs", "vitals_history", "telemetry"] and "blood pressure" in f.label.lower()), None)
        twin_bp = next((f for f in findings if f.source_type == "biogears_twin" and "blood pressure" in f.label.lower()), None)
        if vital_bp and twin_bp and vital_bp.value and twin_bp.value:
            try:
                v_sys = float(vital_bp.value.split("/")[0].strip()) if "/" in vital_bp.value else None
                t_sys = float(twin_bp.value.split("/")[0].strip()) if "/" in twin_bp.value else None
                if v_sys and t_sys and abs(v_sys - t_sys) > 20:
                    conflicts.append(EvidenceConflict(
                        metric="Systolic BP Discrepancy",
                        source_a=vital_bp.source_name, value_a=vital_bp.value,
                        source_b="BioGears Digital Twin", value_b=twin_bp.value,
                        possible_reasons=["White-coat effect", "Cuff size discrepancy", "Simulation autonomic response"],
                        recommendation="Take two blood pressure readings 5 minutes apart in a seated position.",
                    ))
            except (ValueError, TypeError):
                pass

        # 5. Biomarkers vs Organ Scores Discrepancy
        organ_findings = [f for f in findings if f.source_type == "organ_scores"]
        abnormal_labs = [f for f in findings if f.source_type == "lab_reports" and f.is_abnormal]
        if organ_findings and abnormal_labs:
            for lab in abnormal_labs:
                lab_name = lab.label.lower()
                if any(k in lab_name for k in ["creatinine", "bun", "gfr"]):
                    renal_score = next((f for f in organ_findings if "renal" in f.label.lower()), None)
                    if renal_score and renal_score.value:
                        try:
                            score_val = float("".join(c for c in renal_score.value if c.isdigit() or c == "."))
                            if score_val > 80:
                                conflicts.append(EvidenceConflict(
                                    metric="Renal Biomarker vs Organ Score Discrepancy",
                                    source_a="Uploaded Lab Reports", value_a=f"{lab.label}: {lab.value}",
                                    source_b="BioGears Organ Scores", value_b=f"{renal_score.label}: {renal_score.value}",
                                    possible_reasons=["Lab report shows abnormal renal marker but organ simulation score remains high"],
                                    recommendation="Re-run renal panel and update BioGears physiological baseline.",
                                ))
                        except (ValueError, TypeError):
                            pass

        return conflicts

    def _compute_confidence(self, sources: List[EvidenceSource]) -> float:
        available = [s for s in sources if s.status == SourceStatus.available]
        if not available:
            return 0.50
        total = len(sources)
        avail_count = len(available)
        base = avail_count / total
        conf_scores = [s.confidence_pct for s in available if s.confidence_pct]
        avg_conf = sum(conf_scores) / len(conf_scores) if conf_scores else 0.80
        return round(base * avg_conf, 2)
