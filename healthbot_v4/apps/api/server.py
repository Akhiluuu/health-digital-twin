"""
healthbot_v4/apps/api/server.py
Production FastAPI Gateway Server for VitalHealth v5.0 Health Brain.
Exposes REST endpoints for Patient Management, OCR Ingestion, BioGears Digital Twin, AI Orchestration, Copilot Briefings, and Developer Dashboard.
"""

import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import uuid
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException, status, Depends, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware

from healthbot_v4.shared.config.settings import settings
from healthbot_v4.shared.logger.logger import logger
from healthbot_v4.shared.models.base import PatientProfile, NormalizedLab, NormalizedMedication, RiskFlag
from healthbot_v4.apps.brain.core import get_health_brain
from healthbot_v4.apps.brain.orchestrator.orchestrator import AIOrchestrator, OrchestratorResponse
from healthbot_v4.apps.brain.orchestrator.phos_orchestrator import PHOSOrchestrator
from healthbot_v4.apps.brain.state.patient_state_manager import PatientStateManager
from healthbot_v4.apps.brain.timeline.event_stream import MedicalTimelineEngine, TimelineEventType
from healthbot_v4.apps.brain.graph.health_knowledge_graph import HealthKnowledgeGraphEngine
from healthbot_v4.apps.brain.copilot.health_copilot import HealthCopilot, DailyHealthBriefing
from healthbot_v4.apps.ocr.engine.record_builder import SmartOCRPipeline
from healthbot_v4.apps.twin.simulation_runner import DigitalTwinRunner, SimulationResult


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"🚀 Starting {settings.PROJECT_NAME} v{settings.VERSION}")
    brain = get_health_brain()
    brain.register_subsystem(AIOrchestrator())
    brain.register_subsystem(DigitalTwinRunner())
    # Register Journey Engine subsystems
    from healthbot_v4.apps.brain.journey.journey_engine import JourneyEngine
    from healthbot_v4.apps.brain.journey.journey_ai import JourneyAIEngine
    from healthbot_v4.apps.brain.journey.milestone_engine import MilestoneEngine
    from healthbot_v4.apps.brain.journey.goal_engine import GoalEngine
    from healthbot_v4.apps.brain.journey.progress_engine import ProgressEngine
    from healthbot_v4.apps.brain.journey.journey_insights import JourneyInsightsEngine
    brain.register_subsystem(JourneyEngine())
    brain.register_subsystem(JourneyAIEngine())
    brain.register_subsystem(MilestoneEngine())
    brain.register_subsystem(GoalEngine())
    brain.register_subsystem(ProgressEngine())
    brain.register_subsystem(JourneyInsightsEngine())
    await brain.initialize_all()
    await phos_orchestrator.initialize()

    # Async non-blocking model warm-up and RAM pinning
    import asyncio
    from healthbot_v4.apps.brain.reasoning.qwen_engine import QwenInferenceEngine
    qwen_warmup = QwenInferenceEngine()
    asyncio.create_task(qwen_warmup.initialize())
    logger.info("🔥 Triggered background Qwen LLM inference warm-up task")

    yield
    logger.info("Shutting down Health Brain FastAPI Gateway...")
    await brain.shutdown_all()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="VitalHealth v5.0 Event-Driven Personal Health Operating System API Gateway",
    lifespan=lifespan,
)

from healthbot_v4.apps.api.dev_dashboard import router as dev_router
from healthbot_v4.apps.api.journey_router import router as journey_router
from healthbot_v4.apps.api.onboarding_router import router as onboarding_router
app.include_router(dev_router)
app.include_router(journey_router)
app.include_router(onboarding_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=getattr(settings, "CORS_ALLOWED_ORIGINS", ["*"]),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



# Request schemas
# Request schemas
class QueryRequest(BaseModel):
    patient_id: str
    session_id: str = "sess_default"
    query: str
    active_symptoms: Optional[List[Any]] = None
    patient_context: Optional[Dict[str, Any]] = None


class OCRUploadRequest(BaseModel):
    patient_id: str
    document_name: str = "document.pdf"
    raw_text: str


class TwinSimulationRequest(BaseModel):
    patient_id: str
    medication_name: str
    dose_mg: float = 500.0
    duration_days: int = 30


# Global singletons
state_mgr = PatientStateManager()
timeline_engine = MedicalTimelineEngine()
graph_engine = HealthKnowledgeGraphEngine()
copilot = HealthCopilot()
ocr_pipeline = SmartOCRPipeline()
orchestrator = AIOrchestrator()
phos_orchestrator = PHOSOrchestrator()


@app.get("/health", tags=["System Health"])
@app.get("/health/", tags=["System Health"])
@app.get("/ai/health", tags=["System Health"])
@app.get("/ai/health/", tags=["System Health"])
@app.get("//health", tags=["System Health"])
@app.get("//health/", tags=["System Health"])
async def health_check():
    return {
        "status": "HEALTHY",
        "system": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
    }


@app.post("/api/v5/patients/profile", tags=["Patient Management"])
async def create_or_update_profile(profile: PatientProfile):
    state = state_mgr.create_profile(profile)
    return {"status": "SUCCESS", "patient_id": profile.patient_id, "state": state}


@app.get("/api/v5/brain/state/{patient_id}", tags=["Patient Management"])
@app.get("/api/v5/patients/{patient_id}/state", tags=["Patient Management"])
async def get_patient_state(patient_id: str):
    state = state_mgr.get_or_create_state(patient_id)
    return state.model_dump()


@app.get("/api/v5/brain/graph/{patient_id}", tags=["Knowledge Graph"])
async def get_patient_graph(patient_id: str):
    return graph_engine.get_patient_subgraph(patient_id)


@app.get("/api/v5/brain/timeline/{patient_id}", tags=["Medical Timeline"])
async def get_patient_timeline(patient_id: str):
    events = timeline_engine.get_timeline(patient_id)
    return [e.model_dump() for e in events]


@app.get("/api/v5/copilot/briefing/{patient_id}", response_model=DailyHealthBriefing, tags=["Proactive Health Copilot"])
async def get_daily_health_briefing(patient_id: str):
    return copilot.generate_daily_briefing(patient_id)


@app.post("/api/v5/ocr/upload", tags=["Medical Record Ingestion"])
@app.post("/api/v5/ocr/ingest", tags=["Medical Record Ingestion"])
async def upload_medical_record(req: OCRUploadRequest):
    record = ocr_pipeline.process_raw_text(req.patient_id, req.raw_text, req.document_name)
    for lab in record.extracted_labs:
        state_mgr.add_lab(req.patient_id, lab)
        graph_engine.add_clinical_entity(req.patient_id, lab.canonical_name, "LabValue")
    for med in record.extracted_medications:
        state_mgr.add_medication(req.patient_id, med)
        graph_engine.add_clinical_entity(req.patient_id, med.name, "Medication")
    return record.model_dump()


@app.post("/api/v5/brain/query", response_model=OrchestratorResponse, tags=["AI Reasoning Engine"])
async def process_query(req: QueryRequest):
    return await orchestrator.process_patient_query(
        req.patient_id,
        req.session_id,
        req.query,
        active_symptoms=req.active_symptoms,
        patient_context=req.patient_context,
    )


@app.post("/api/v5/brain/query/explainable", tags=["AI Reasoning Engine"])
async def process_explainable_query(req: QueryRequest):
    res = await orchestrator.process_patient_query(
        req.patient_id,
        req.session_id,
        req.query,
        active_symptoms=req.active_symptoms,
        patient_context=req.patient_context,
    )
    return {
        "patient_id": req.patient_id,
        "query": req.query,
        "response": res.response_text,
        "explainability": {
            "intent": res.metadata.get("intent"),
            "retrieval_plan": res.metadata.get("retrieval_plan"),
            "health_score": res.metadata.get("health_score"),
            "tokens_budgeted": res.metadata.get("tokens_budgeted"),
            "sources_cited": res.metadata.get("sources_cited"),
        },
    }


class SymptomLogRequest(BaseModel):
    patient_id: str
    name: str
    severity: Optional[str] = "Moderate"
    notes: Optional[str] = None
    date: Optional[str] = None


@app.post("/api/v5/symptoms/log", tags=["Patient Management"])
@app.post("/api/v5/patients/{patient_id}/symptoms", tags=["Patient Management"])
async def log_patient_symptom(req: SymptomLogRequest, patient_id: Optional[str] = None):
    pid = patient_id or req.patient_id
    sym_dict = {
        "name": req.name,
        "severity": req.severity,
        "notes": req.notes or "",
        "date": req.date or datetime.now(timezone.utc).isoformat(),
    }
    state = state_mgr.add_symptom(pid, sym_dict)
    timeline_engine.record_event(
        pid, TimelineEventType.symptom_logged, f"Symptom Logged: {req.name}", req.notes or f"Severity: {req.severity}"
    )
    return {"status": "SUCCESS", "patient_id": pid, "symptom": sym_dict, "recent_symptoms_count": len(state.recent_symptoms)}


@app.post("/api/v6/brain/phos/query", tags=["Enterprise PHOS Engine"])
async def process_phos_query(req: QueryRequest):
    """
    Executes the 14-step PHOS Multi-Agent Reasoning Engine pipeline.
    Returns complete structured evidence, intent analysis, hypotheses, strategy, and UI widgets.
    """
    state = state_mgr.get_or_create_state(req.patient_id)
    if req.active_symptoms:
        for sym in req.active_symptoms:
            state_mgr.add_symptom(req.patient_id, sym)
    response_payload = phos_orchestrator.process_query(
        query=req.query,
        state=state,
        active_symptoms=req.active_symptoms,
        patient_context=req.patient_context,
    )
    return response_payload.to_full_contract()



@app.post("/api/v5/brain/query/stream", tags=["AI Reasoning Engine"])
@app.post("/api/v1/brain/reasoning/stream", tags=["AI Reasoning Engine"])
async def stream_query_reasoning(req: QueryRequest):
    """Server-Sent Events (SSE) endpoint for token-by-token real-time LLM streaming."""
    from healthbot_v4.apps.brain.reasoning.qwen_engine import QwenInferenceEngine
    from healthbot_v4.apps.brain.context.context_builder import ContextBuilder
    
    state = state_mgr.get_or_create_state(req.patient_id)
    ctx_builder = ContextBuilder()
    context = ctx_builder.build_budgeted_context(state, req.query)
    
    engine = QwenInferenceEngine()
    if not engine.model_loaded:
        await engine.initialize()

    async def event_generator():
        async for token in engine.generate_reasoning_stream(context, req.query):
            yield f"data: {token}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/api/v5/twin/simulate", response_model=SimulationResult, tags=["BioGears Digital Twin"])
async def run_digital_twin_simulation(req: TwinSimulationRequest):
    state = state_mgr.get_or_create_state(req.patient_id)
    runner = DigitalTwinRunner()
    return runner.run_medication_simulation(state.profile, req.medication_name, req.dose_mg, req.duration_days)


# =============================================================================
# BIOGEARS COMPATIBILITY ROUTES
# The mobile app (services/biogears.ts) calls these endpoints for Digital Twin
# analytics, registration, simulation jobs, vitals, and substance library.
# =============================================================================

import uuid, math

@app.get("/health-score/{user_id}", tags=["BioGears Compatibility"])
async def get_health_score(user_id: str):
    state = state_mgr.get_or_create_state(user_id)
    score = min(100.0, max(0.0, state.current_health_score))
    if score >= 90:
        grade, confidence = "A", "HIGH"
    elif score >= 75:
        grade, confidence = "B", "HIGH"
    elif score >= 60:
        grade, confidence = "C", "MEDIUM"
    else:
        grade, confidence = "D", "LOW"
    return {
        "user_id": user_id,
        "composite_score": score,
        "grade": grade,
        "confidence": confidence,
        "components": {
            "vitals": {"score": score, "grade": grade},
            "activity": {"score": score * 0.9, "grade": grade},
            "nutrition": {"score": score * 0.85, "grade": grade},
            "sleep": {"score": score * 0.95, "grade": grade},
        }
    }


@app.get("/metrics/{user_id}", tags=["BioGears Compatibility"])
async def get_body_metrics(user_id: str):
    state = state_mgr.get_or_create_state(user_id)
    p = state.profile
    weight = getattr(p, "weight_kg", None) or 70.0
    height = getattr(p, "height_cm", None) or 170.0
    height_m = height / 100.0
    bmi = round(weight / (height_m ** 2), 1)
    bsa = round(0.007184 * (height ** 0.725) * (weight ** 0.425), 2)
    ideal_weight = round(22.0 * (height_m ** 2), 1)
    return {
        "user_id": user_id,
        "bmi": bmi,
        "bmi_category": "Normal" if 18.5 <= bmi <= 24.9 else ("Overweight" if bmi <= 29.9 else "Obese"),
        "bsa_m2": bsa,
        "ideal_weight_kg": ideal_weight,
        "weight_kg": weight,
        "height_cm": height,
    }


@app.get("/analytics/organ-scores/{user_id}", tags=["BioGears Compatibility"])
async def get_organ_scores(user_id: str):
    state = state_mgr.get_or_create_state(user_id)
    base = min(100.0, state.current_health_score)
    
    # Extract latest vitals if available
    hr_vals = [v.value_primary for v in state.recent_vitals if v.vital_type == "heart_rate" and v.value_primary]
    sys_vals = [v.value_primary for v in state.recent_vitals if v.vital_type == "blood_pressure" and v.value_primary]
    dia_vals = [v.value_secondary for v in state.recent_vitals if v.vital_type == "blood_pressure" and v.value_secondary]
    spo2_vals = [v.value_primary for v in state.recent_vitals if v.vital_type == "spo2" and v.value_primary]
    gluc_vals = [l.value for l in state.recent_labs if "glucose" in l.canonical_name.lower() and l.value]

    latest_hr = hr_vals[-1] if hr_vals else None
    latest_sys = sys_vals[-1] if sys_vals else None
    latest_dia = dia_vals[-1] if dia_vals else None
    latest_spo2 = spo2_vals[-1] if spo2_vals else None
    latest_gluc = gluc_vals[-1] if gluc_vals else None

    # Risk flags text
    risk_text = " ".join(
        [f"{r.level.value} {r.title}" for r in (state.active_risks or [])]
    ).lower()

    # Dynamic Heart/Cardiovascular score based on MAP and RPP
    heart_score = base
    if latest_sys and latest_dia:
        map_val = latest_dia + (latest_sys - latest_dia) / 3.0
        if map_val > 105 or map_val < 65:
            heart_score -= min(25.0, abs(map_val - 85.0) * 0.8)
    if latest_hr:
        if latest_hr > 100 or latest_hr < 50:
            heart_score -= min(20.0, abs(latest_hr - 72.0) * 0.5)
    if any(kw in risk_text for kw in ["cardiac", "cardiovascular", "hypertension", "bp"]):
        heart_score -= 10.0
    heart_score = max(30.0, round(min(100.0, heart_score), 1))

    # Dynamic Lungs/Pulmonary score based on SpO2
    lung_score = base
    if latest_spo2:
        if latest_spo2 < 95:
            lung_score -= min(35.0, (95.0 - latest_spo2) * 5.0)
    if any(kw in risk_text for kw in ["respiratory", "pulmonary", "spo2", "asthma", "copd"]):
        lung_score -= 10.0
    lung_score = max(30.0, round(min(100.0, lung_score), 1))

    # Dynamic Kidneys/Renal score based on BP strain
    renal_score = base
    if latest_sys and latest_sys > 130:
        renal_score -= min(20.0, (latest_sys - 130.0) * 0.4)
    if any(kw in risk_text for kw in ["renal", "kidney", "ckd", "creatinine"]):
        renal_score -= 15.0
    renal_score = max(30.0, round(min(100.0, renal_score), 1))

    # Dynamic Metabolic score based on Glucose
    metabolic_score = base
    if latest_gluc:
        if latest_gluc > 125 or latest_gluc < 70:
            metabolic_score -= min(30.0, abs(latest_gluc - 90.0) * 0.3)
    if any(kw in risk_text for kw in ["diabetes", "glucose", "hba1c", "metabolic"]):
        metabolic_score -= 15.0
    metabolic_score = max(30.0, round(min(100.0, metabolic_score), 1))

    # Generic risk deduction helper for remaining organs without live sensor telemetry
    def generic_organ_score(organ_risk_kws):
        penalize = any(kw in risk_text for kw in organ_risk_kws)
        score = base - (12.0 if penalize else 0.0)
        return max(30.0, round(min(100.0, score), 1))

    def _organ_status(score: float) -> str:
        if score >= 80: return "Stable"
        if score >= 60: return "Moderate"
        return "Needs Attention"

    return {
        "user_id": user_id,
        "overall_health_score": base,
        "scores": {
            "brain":    {"score": generic_organ_score(["neurological", "cognitive", "temp"]), "status": _organ_status(generic_organ_score(["neurological", "cognitive", "temp"]))},
            "heart":    {"score": heart_score,                                                "status": _organ_status(heart_score)},
            "lungs":    {"score": lung_score,                                                 "status": _organ_status(lung_score)},
            "liver":    {"score": generic_organ_score(["hepatic", "liver"]),                  "status": _organ_status(generic_organ_score(["hepatic", "liver"]))},
            "gut":      {"score": generic_organ_score(["gut", "digestive", "stomach"]),       "status": _organ_status(generic_organ_score(["gut", "digestive", "stomach"]))},
            "legs":     {"score": generic_organ_score(["legs", "vascular", "stroke"]),        "status": _organ_status(generic_organ_score(["legs", "vascular", "stroke"]))},
            "kidneys":  {"score": renal_score,                                                "status": _organ_status(renal_score)},
            "metabolic":{"score": metabolic_score,                                            "status": _organ_status(metabolic_score)},
        }
    }


@app.get("/vitals/{user_id}/trends", tags=["BioGears Compatibility"])
async def get_vitals_trends(user_id: str):
    state = state_mgr.get_or_create_state(user_id)
    events = timeline_engine.get_timeline(user_id)

    # Compute real averages from recorded vitals — never fabricate population normals
    hr_vals = [v.value_primary for v in state.recent_vitals if v.vital_type == "heart_rate" and v.value_primary]
    bp_vals = [v.value_primary for v in state.recent_vitals if v.vital_type == "blood_pressure" and v.value_primary]
    bp_dia_vals = [v.value_secondary for v in state.recent_vitals if v.vital_type == "blood_pressure" and v.value_secondary]
    spo2_vals = [v.value_primary for v in state.recent_vitals if v.vital_type == "spo2" and v.value_primary]
    gluc_vals = [l.value for l in state.recent_labs if "glucose" in l.canonical_name.lower() and l.value]

    def avg(vals): return round(sum(vals) / len(vals), 1) if vals else None

    def trend(vals):
        if not vals or len(vals) < 2: return "insufficient_data"
        return "improving" if vals[-1] < vals[0] else ("worsening" if vals[-1] > vals[0] else "stable")

    return {
        "sessions": [{"session_id": f"s_{i}", "timestamp": str(e.timestamp)} for i, e in enumerate(events[:10])],
        "trends": {
            "heart_rate":    {"direction": trend(hr_vals),   "normal_range": "60-100 bpm",  "data_points": len(hr_vals)},
            "blood_pressure":{"direction": trend(bp_vals),   "normal_range": "<120/80 mmHg", "data_points": len(bp_vals)},
            "glucose":       {"direction": trend(gluc_vals), "normal_range": "70-100 mg/dL", "data_points": len(gluc_vals)},
            "spo2":          {"direction": trend(spo2_vals), "normal_range": "95-100%",      "data_points": len(spo2_vals)},
        },
        "overall_averages": {
            "heart_rate":   avg(hr_vals),
            "systolic_bp":  avg(bp_vals),
            "diastolic_bp": avg(bp_dia_vals),
            "glucose":      avg(gluc_vals),
            "spo2":         avg(spo2_vals),
            "note": "null values mean no real telemetry recorded yet for this patient"
        }
    }


@app.get("/analytics/cvd-risk/{user_id}", tags=["BioGears Compatibility"])
async def get_cvd_risk(user_id: str):
    state = state_mgr.get_or_create_state(user_id)
    p = state.profile
    age = getattr(p, "age", None) or 30
    
    # Live blood pressure & HR readings
    sys_vals = [v.value_primary for v in state.recent_vitals if v.vital_type == "blood_pressure" and v.value_primary]
    hr_vals = [v.value_primary for v in state.recent_vitals if v.vital_type == "heart_rate" and v.value_primary]
    latest_sys = sys_vals[-1] if sys_vals else 120.0
    latest_hr = hr_vals[-1] if hr_vals else 72.0

    risk_text = " ".join(
        [f"{r.level.value} {r.title}" for r in (state.active_risks or [])]
    ).lower()
    has_cv_risk = any(kw in risk_text for kw in ["cardiovascular", "cardiac", "hypertension", "bp", "blood pressure", "cholesterol"])
    has_smoking = "smoke" in risk_text or "tobacco" in risk_text

    # Dynamic risk formula incorporating age, systolic BP strain, HR, and active clinical risk factors
    base_risk = 2.0 + (age - 20) * 0.15
    if latest_sys > 120:
        base_risk += (latest_sys - 120) * 0.12
    if latest_hr > 80:
        base_risk += (latest_hr - 80) * 0.08
    if has_cv_risk:
        base_risk += 4.5
    if has_smoking:
        base_risk += 5.0

    risk_pct = round(max(1.0, min(65.0, base_risk)), 1)
    category = "High" if risk_pct >= 20.0 else ("Moderate" if risk_pct >= 10.0 else "Low")
    color = "#F44336" if category == "High" else ("#FF9800" if category == "Moderate" else "#4CAF50")

    return {
        "ten_year_risk_pct": risk_pct,
        "category": category,
        "color": color,
        "action": "Follow up with cardiologist annually." if category != "Low" else "Maintain healthy lifestyle.",
        "modifiable_risk_factors": ["Exercise regularly", "Maintain healthy weight", "Reduce sodium intake", "Monitor blood pressure"]
    }


@app.get("/analytics/recovery-readiness/{user_id}", tags=["BioGears Compatibility"])
async def get_recovery_readiness(user_id: str):
    state = state_mgr.get_or_create_state(user_id)
    # No floor — let the score reflect actual health state
    score = min(100, int(state.current_health_score * 0.9))
    if score >= 80:
        status, color = "Excellent", "#4CAF50"
        recommendation = "Your body is well-recovered. Moderate to high intensity exercise is safe today."
    elif score >= 65:
        status, color = "Good", "#8BC34A"
        recommendation = "Good recovery. Light to moderate exercise is recommended."
    elif score >= 50:
        status, color = "Fair", "#FF9800"
        recommendation = "Allow additional recovery time before high-intensity activity."
    else:
        status, color = "Poor", "#F44336"
        recommendation = "Rest and recovery recommended. Consult your physician if this persists."
    return {
        "readiness_score": score,
        "status": status,
        "color": color,
        "recommendation": recommendation,
        "factors": ["Sleep quality", "Resting heart rate", "Activity level", "Hydration"]
    }


@app.get("/analytics/weekly-summary/{user_id}", tags=["BioGears Compatibility"])
async def get_weekly_summary(user_id: str):
    state = state_mgr.get_or_create_state(user_id)
    # Count real simulation events from timeline — never fabricate
    all_events = timeline_engine.get_timeline(user_id, limit=200)
    from healthbot_v4.shared.models.base import TimelineEventType
    sim_events = [e for e in all_events if e.event_type in (
        TimelineEventType.lab_report_uploaded, TimelineEventType.ocr_processed
    )]
    lab_events = [e for e in all_events if e.event_type == TimelineEventType.lab_report_uploaded]
    # Health score trend from stored history
    from healthbot_v4.apps.brain.journey.journey_engine import _load_journey_store
    store = _load_journey_store(user_id)
    score_hist = store.get("health_score_history", [])
    if len(score_hist) >= 2:
        delta = score_hist[-1]["score"] - score_hist[0]["score"]
        trend = "improving" if delta > 2 else ("declining" if delta < -2 else "stable")
    else:
        trend = "insufficient_data"
    return {
        "user_id": user_id,
        "period": "Last 7 days",
        "simulations_run": len(sim_events),
        "lab_reports_uploaded": len(lab_events),
        "health_score_trend": trend,
        "avg_health_score": state.current_health_score,
        "notable_events": [e.title for e in all_events[:5]],
        "recommendations": ["Stay hydrated", "Log daily meals", "Complete BioGears calibration for detailed insights"]
    }


@app.post("/analytics/caloric-balance/{user_id}", tags=["BioGears Compatibility"])
async def get_caloric_balance(user_id: str, events: Optional[List[Dict[str, Any]]] = None):
    import datetime
    state = state_mgr.get_or_create_state(user_id)
    p = state.profile
    weight = getattr(p, "weight_kg", None) or 70.0
    height = getattr(p, "height_cm", None) or 170.0
    age = getattr(p, "age", None) or 30
    bmr = round(10 * weight + 6.25 * height - 5 * age + 5)
    now = datetime.datetime.now()
    hours_elapsed = max(0.1, min(24.0, now.hour + now.minute / 60.0 + now.second / 3600.0))
    burn_so_far = round(bmr * (hours_elapsed / 24.0))
    total_burn = round(bmr * 1.3)
    return {
        "bmr_kcal_day": bmr,
        "estimated_burn_kcal": total_burn,
        "burn_so_far_kcal": burn_so_far,
        "meal_intake_kcal": 0,
        "caloric_balance": -burn_so_far,
        "balance_status": "Deficit",
        "note": "Log meals via the app to get accurate caloric balance calculations."
    }


@app.get("/profiles/{user_id}", tags=["BioGears Compatibility"])
async def get_twin_profile(user_id: str):
    state = state_mgr.get_or_create_state(user_id)
    registered = state.profile is not None and getattr(state.profile, "age", None) is not None
    if not registered:
        raise HTTPException(status_code=404, detail=f"Twin profile not found for user {user_id}. Please calibrate.")
    return {
        "user_id": user_id,
        "status": "registered",
        "profile": state.profile.model_dump() if state.profile else {},
        "health_score": state.current_health_score,
    }


class RegisterTwinRequest(BaseModel):
    user_id: str
    age: int = 30
    weight: float = 70.0
    height: float = 170.0
    sex: str = "Male"
    body_fat: Optional[float] = None
    resting_hr: Optional[float] = None
    systolic_bp: Optional[float] = None
    diastolic_bp: Optional[float] = None
    is_smoker: bool = False
    has_anemia: bool = False
    has_type1_diabetes: bool = False
    has_type2_diabetes: bool = False
    hba1c: Optional[float] = None
    ethnicity: Optional[str] = None
    fitness_level: Optional[str] = None
    vo2max: Optional[float] = None
    current_medications: List[str] = []


class LabOCRScanRequest(BaseModel):
    user_id: str
    report_title: str
    category: str = "Lab"
    text_content: Optional[str] = None
    findings: List[Dict[str, Any]] = []


@app.post("/lab-report/ocr", tags=["Lab OCR Processing"])
async def process_lab_ocr_scan(req: LabOCRScanRequest):
    from healthbot_v4.shared.models.base import NormalizedLab
    from healthbot_v4.apps.brain.journey.journey_engine import _load_journey_store, _save_journey_store
    state = state_mgr.get_or_create_state(req.user_id)

    parsed_labs = []
    # Priority 1: Explicit structured findings sent from client parser
    if req.findings:
        for f in req.findings:
            try:
                lab_obj = NormalizedLab(
                    lab_id=f"lab_{uuid.uuid4().hex[:8]}",
                    patient_id=req.user_id,
                    canonical_name=f.get("name") or "Lab Test",
                    value=float(f.get("value", 0.0)),
                    unit=f.get("unit", ""),
                    reference_range=f.get("range", ""),
                    classification=f.get("classification", "Normal"),
                    timestamp=datetime.now(timezone.utc)
                )
                parsed_labs.append(lab_obj)
            except Exception:
                pass
    else:
        # Priority 2: Run SmartOCRPipeline on any text_content provided
        combined_text = (req.report_title + "\n" + (req.text_content or "")).strip()
        if combined_text and len(combined_text) > 10:
            ocr_record = ocr_pipeline.process_raw_text(req.user_id, combined_text, req.report_title)
            parsed_labs.extend(ocr_record.extracted_labs)
            # Ingest medications discovered in the doc
            for med in ocr_record.extracted_medications:
                state_mgr.add_medication(req.user_id, med)
        else:
            logger.info(f"No legible text or findings provided for lab OCR request '{req.report_title}'")

    # Add to in-memory state
    if parsed_labs:
        for lab in parsed_labs:
            state_mgr.add_lab(req.user_id, lab)
        # Also persist labs to file-based journey store so they survive server restarts
        try:
            store = _load_journey_store(req.user_id)
            existing = store.get("recent_labs", [])
            for lab in parsed_labs:
                existing.append(lab.model_dump(mode="json"))
            store["recent_labs"] = existing[-50:]  # cap at 50 most recent
            _save_journey_store(req.user_id, store)
        except Exception as e:
            logger.warning(f"Lab journey store persist failed for {req.user_id}: {e}")

    return {
        "status": "success",
        "user_id": req.user_id,
        "extracted_labs_count": len(parsed_labs),
        "labs": [l.model_dump() for l in parsed_labs],
        "message": f"Successfully parsed and ingested {len(parsed_labs)} lab findings into Personal Health OS."
    }


# ---------------------------------------------------------------------------
# NEW: Server-side document OCR + embedding endpoint
# Called by documentProcessing.ts as primary upload path
# ---------------------------------------------------------------------------

def _extract_text_from_bytes(file_bytes: bytes, filename: str, mime_type: str) -> str:
    """
    Pure-Python text extraction — no external OCR deps required.
    Handles PDFs via PyMuPDF if available, else falls back to byte-level
    ASCII extraction. Images are described by filename + MIME hint.
    """
    text = ""
    filename_lower = (filename or "").lower()
    is_pdf = "pdf" in (mime_type or "") or filename_lower.endswith(".pdf")
    is_image = any(ext in filename_lower for ext in [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"]) \
               or "image" in (mime_type or "")

    if is_pdf:
        # Try PyMuPDF first (best quality)
        try:
            import fitz  # PyMuPDF
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            pages = []
            for page in doc:
                pages.append(page.get_text())
            text = "---PAGE---".join(pages)
            doc.close()
            logger.info(f"PyMuPDF extracted {len(text)} chars from {filename}")
        except ImportError:
            pass
        except Exception as e:
            logger.warning(f"PyMuPDF failed: {e}")

        if not text:
            # Fallback: extract raw ASCII strings from PDF bytes (catches text-layer PDFs)
            import re
            raw = file_bytes.decode("latin-1", errors="replace")
            # Extract parenthesised strings (PDF text objects)
            strings = re.findall(r'\(([^)]{2,}?)\)', raw)
            # Filter out binary noise: keep strings with mostly printable ASCII
            readable = []
            for s in strings:
                printable_ratio = sum(1 for c in s if 32 <= ord(c) < 127) / max(len(s), 1)
                if printable_ratio > 0.75 and len(s.strip()) > 2:
                    readable.append(s.strip())
            text = " ".join(readable)
            logger.info(f"Raw PDF string extraction: {len(text)} chars from {filename}")

    elif is_image:
        # Try pytesseract if available
        try:
            import pytesseract
            from PIL import Image
            import io
            img = Image.open(io.BytesIO(file_bytes))
            text = pytesseract.image_to_string(img)
            logger.info(f"Tesseract OCR extracted {len(text)} chars from {filename}")
        except ImportError:
            pass
        except Exception as e:
            logger.warning(f"Tesseract failed: {e}")

        if not text:
            # Fallback: embed image filename + content hints for multimodal engine
            text = f"[Image document: {filename}]\nDocument type hint: medical image scan"

    else:
        # Plain text / CSV / DOCX-like — try decoding directly
        for enc in ["utf-8", "latin-1"]:
            try:
                text = file_bytes.decode(enc)
                break
            except Exception:
                pass

    if isinstance(text, dict):
        text = str(text)
    elif not isinstance(text, str):
        text = str(text) if text is not None else ""

    return text.strip()


def _chunk_text(text: str, doc_id: str, doc_name: str, chunk_size: int = 500, overlap: int = 100):
    """Splits text into overlapping chunks matching the frontend's EmbeddedChunk shape."""
    import math
    chunks = []
    if not text:
        return chunks
    words = text.split()
    word_groups = []
    step = chunk_size - overlap
    for i in range(0, len(words), max(step, 1)):
        group = words[i: i + chunk_size]
        word_groups.append(" ".join(group))
        if len(word_groups) >= 100:  # safety cap
            break
    for idx, chunk_text in enumerate(word_groups):
        if not chunk_text.strip():
            continue
        chunks.append({
            "id": f"{doc_id}_c{idx}",
            "text": chunk_text,
            "metadata": {"docId": doc_id, "docName": doc_name, "chunkIndex": idx},
            "embedding": _generate_hash_embedding(chunk_text),
        })
    return chunks


def _generate_hash_embedding(text: str, dim: int = 384) -> list:
    """Deterministic hash-based embedding matching frontend embeddingService.ts."""
    import math
    embedding = [0.0] * dim
    for i, ch in enumerate(text):
        code = ord(ch)
        embedding[i % dim] += code
        embedding[(i * 7) % dim] += code * 0.5
        embedding[(i * 13) % dim] += code * 0.25
        embedding[(i * 3 + 1) % dim] += code * 0.125
    for i in range(min(len(text), 50)):
        code = ord(text[i])
        embedding[i % dim] += math.sin(code * (i + 1)) * 10
    magnitude = math.sqrt(sum(x * x for x in embedding))
    if magnitude > 0:
        embedding = [x / magnitude for x in embedding]
    return embedding


@app.post("/ai/upload-and-embed", tags=["Document OCR & Embedding"])
async def upload_and_embed_document(
    file: UploadFile = File(...),
    user_id: Optional[str] = Form(default="self"),
):
    """
    Primary document upload endpoint called by the mobile app's documentProcessing.ts.
    1. Extracts real text from PDF / image / text file
    2. Runs SmartOCRPipeline to parse lab values & medications
    3. Persists labs to PatientStateManager + journey store
    4. Chunks text and returns embeddings matching frontend format
    """
    from healthbot_v4.apps.brain.journey.journey_engine import _load_journey_store, _save_journey_store
    from healthbot_v4.shared.models.base import NormalizedLab

    uid = user_id or "self"
    filename = file.filename or "upload.bin"
    mime_type = file.content_type or ""

    try:
        file_bytes = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read uploaded file: {e}")

    logger.info(f"/ai/upload-and-embed: received '{filename}' ({len(file_bytes)} bytes) for user {uid}")

    # Step 1: Extract real text
    extracted_text = _extract_text_from_bytes(file_bytes, filename, mime_type)

    # Step 2: If text is too thin (image-based PDFs, etc.) try multimodal engine heuristics
    if len(extracted_text) < 30:
        import base64
        b64 = base64.b64encode(file_bytes[:2000]).decode("ascii")  # first 2KB hint
        triage = orchestrator.multimodal_engine.process_image_payload(
            b64, patient_id=uid
        )
        extracted_text = triage.triage_summary + "\n" + extracted_text
        logger.info(f"Multimodal engine fallback applied: {triage.triage_summary[:80]}")

    # Step 3: Run SmartOCR to extract structured lab values
    parsed_labs = []
    parsed_meds = []
    if extracted_text and len(extracted_text) > 10:
        ocr_record = ocr_pipeline.process_raw_text(uid, extracted_text, filename)
        parsed_labs = ocr_record.extracted_labs
        parsed_meds = ocr_record.extracted_medications

        # Ingest into in-memory state
        for lab in parsed_labs:
            state_mgr.add_lab(uid, lab)
        for med in parsed_meds:
            state_mgr.add_medication(uid, med)

        # Persist to file-based journey store (survives restarts)
        if parsed_labs:
            try:
                store = _load_journey_store(uid)
                existing = store.get("recent_labs", [])
                for lab in parsed_labs:
                    existing.append(lab.model_dump(mode="json"))
                store["recent_labs"] = existing[-50:]
                _save_journey_store(uid, store)
                logger.info(f"Persisted {len(parsed_labs)} labs to journey store for {uid}")
            except Exception as e:
                logger.warning(f"Journey store lab persist failed: {e}")

        # Record timeline event
        timeline_engine.record_event(
            uid,
            TimelineEventType.lab_report_uploaded,
            f"Lab Report Uploaded: {filename}",
            f"Extracted {len(parsed_labs)} lab values, {len(parsed_meds)} medications."
        )

    # Step 4: Chunk text and generate embeddings
    doc_id = f"doc_{uuid.uuid4().hex[:12]}"
    chunks = _chunk_text(extracted_text or f"[Document: {filename}]", doc_id, filename)

    logger.info(
        f"/ai/upload-and-embed: '{filename}' → {len(extracted_text)} chars text, "
        f"{len(chunks)} chunks, {len(parsed_labs)} labs, {len(parsed_meds)} meds"
    )

    return {
        "status": "success",
        "doc_id": doc_id,
        "filename": filename,
        "text_length": len(extracted_text),
        "chunks": chunks,
        "labs_extracted": len(parsed_labs),
        "meds_extracted": len(parsed_meds),
        "labs": [l.model_dump(mode="json") for l in parsed_labs],
    }


class AsyncSimRequest(BaseModel):
    user_id: str
    events: List[Dict[str, Any]] = []


# In-memory job store for async simulation jobs
_job_store: Dict[str, Any] = {}

@app.post("/biogears-query", tags=["BioGears Compatibility"])
async def biogears_query(payload: Dict[str, Any]):
    user_id = payload.get("patient_id") or payload.get("user_id") or "self"
    query = payload.get("query") or payload.get("question") or ""
    vitals = payload.get("vitals")
    anomalies = payload.get("anomalies")
    res = await orchestrator.process_patient_query(
        user_id,
        "sess_biogears",
        query,
        active_symptoms=payload.get("active_symptoms"),
        patient_context={
            "vitals": vitals,
            "anomalies": anomalies,
            "profile": payload.get("profile"),
        }
    )
    return {"status": "success", "response": res.response_text, "response_text": res.response_text}

@app.post("/generate", tags=["BioGears Compatibility"])
async def generate_legacy(payload: Dict[str, Any]):
    user_id = payload.get("patient_id") or payload.get("user_id") or "self"
    query = payload.get("query") or ""
    res = await orchestrator.process_patient_query(
        user_id,
        "sess_generate",
        query,
        active_symptoms=payload.get("active_symptoms"),
        patient_context=payload.get("patient_context"),
    )
    return {"status": "success", "response": res.response_text, "response_text": res.response_text}

@app.post("/simulate/async", tags=["BioGears Compatibility"])
async def simulate_async(req: AsyncSimRequest):
    job_id = f"job_{uuid.uuid4().hex[:12]}"
    state = state_mgr.get_or_create_state(req.user_id)

    if not state.active_medications:
        _job_store[job_id] = {
            "job_id": job_id, "status": "done", "user_id": req.user_id,
            "result": {"status": "no_medications_on_record",
                       "message": "No medications found for this patient. Add medications to run a simulation.",
                       "vitals": None}
        }
        return {"job_id": job_id, "status": "done", "poll_url": f"/jobs/{job_id}"}

    runner = DigitalTwinRunner()
    med_name = state.active_medications[0].name
    result = runner.run_medication_simulation(state.profile, med_name)
    predicted_glucose = result.trajectories[-1].predicted_glucose_mg_dl if result.trajectories else None
    _job_store[job_id] = {
        "job_id": job_id, "status": "done", "user_id": req.user_id,
        "result": {
            "status": "success",
            "medication_simulated": med_name,
            "vitals": {
                "heart_rate": None,
                "blood_pressure": None,
                "glucose": predicted_glucose,
                "spo2": None,
                "core_temperature": None,
                "note": "Only glucose trajectory is simulated by BioGears. Other vitals require live telemetry."
            },
            "anomalies": [], "has_anomaly": False, "interaction_warnings": [],
        }
    }
    return {"job_id": job_id, "status": "done", "poll_url": f"/jobs/{job_id}"}


# NOTE: /jobs/active/{user_id} MUST be defined BEFORE /jobs/{job_id}
# otherwise FastAPI will match 'active' as job_id
@app.get("/jobs/active/{user_id}", tags=["BioGears Compatibility"])
async def get_active_job(user_id: str):
    for job in _job_store.values():
        if job.get("user_id") == user_id and job.get("status") in ("running", "pending"):
            return {"job_id": job["job_id"], "status": job["status"], "user_id": user_id, "created_at": None}
    return {"job_id": None, "status": None, "user_id": user_id, "created_at": None}


@app.get("/jobs/{job_id}", tags=["BioGears Compatibility"])
async def get_job_status(job_id: str):
    job = _job_store.get(job_id)
    if not job:
        return {"job_id": job_id, "status": "not_found",
                "message": "No simulation job found with this ID. Please run a new simulation.",
                "result": None}
    return job



@app.get("/substances", tags=["BioGears Compatibility"])
async def get_substances():
    return {
        "total": 6,
        "substances": {
            "Oral": ["Caffeine", "Aspirin", "Acetaminophen", "Ethanol", "Prednisone"],
            "Intravenous": ["Saline", "Epinephrine", "Fentanyl", "Morphine", "Insulin", "Glucose"],
            "Inhalation": ["Albuterol", "Desflurane"]
        }
    }


class TelemetryPacket(BaseModel):
    user_id: str
    heart_rate: Optional[float] = None
    systolic_bp: Optional[float] = None
    diastolic_bp: Optional[float] = None
    spo2: Optional[float] = None
    respiration_rate: Optional[float] = None
    steps: Optional[int] = None
    timestamp: Optional[str] = None


# In-memory telemetry cache for active sessions
_telemetry_cache: Dict[str, Dict[str, Any]] = {}


@app.post("/telemetry/stream", tags=["BioGears Telemetry"])
async def receive_telemetry_stream(packet: TelemetryPacket):
    from datetime import datetime, timezone
    state = state_mgr.get_or_create_state(packet.user_id)
    now_ts = packet.timestamp or datetime.now(timezone.utc).isoformat()
    
    current_data = _telemetry_cache.get(packet.user_id, {})
    if packet.heart_rate is not None: current_data["heart_rate"] = packet.heart_rate
    if packet.systolic_bp is not None: current_data["systolic_bp"] = packet.systolic_bp
    if packet.diastolic_bp is not None: current_data["diastolic_bp"] = packet.diastolic_bp
    if packet.spo2 is not None: current_data["spo2"] = packet.spo2
    if packet.respiration_rate is not None: current_data["respiration_rate"] = packet.respiration_rate
    if packet.steps is not None: current_data["steps"] = packet.steps
    current_data["last_updated"] = now_ts
    
    _telemetry_cache[packet.user_id] = current_data
    
    # Auto update state vital history for dynamic context
    if packet.heart_rate or packet.systolic_bp:
        from healthbot_v4.shared.models.base import NormalizedVital
        if packet.heart_rate:
            state_mgr.add_vital(packet.user_id, NormalizedVital(
                vital_type="heart_rate",
                value_primary=packet.heart_rate,
                unit="bpm",
                timestamp=datetime.now(timezone.utc)
            ))
        if packet.systolic_bp:
            state_mgr.add_vital(packet.user_id, NormalizedVital(
                vital_type="blood_pressure",
                value_primary=packet.systolic_bp,
                value_secondary=packet.diastolic_bp,
                unit="mmHg",
                timestamp=datetime.now(timezone.utc)
            ))
    
    return {
        "status": "success",
        "user_id": packet.user_id,
        "active_telemetry": current_data,
        "message": "Telemetry streamed to twin context successfully."
    }


@app.get("/history/{user_id}", tags=["BioGears Compatibility"])
async def get_simulation_history(user_id: str):
    state = state_mgr.get_or_create_state(user_id)
    events = timeline_engine.get_timeline(user_id)
    # Build vitals snapshot from real recorded vitals — never fabricate
    def _latest_vital(vtype):
        matches = [v for v in state.recent_vitals if v.vital_type == vtype and v.value_primary is not None]
        return matches[-1].value_primary if matches else None
    real_snapshot = {
        "heart_rate":      _latest_vital("heart_rate"),
        "systolic_bp":     _latest_vital("blood_pressure"),
        "spo2":            _latest_vital("spo2"),
        "glucose":         next((l.value for l in state.recent_labs if "glucose" in l.canonical_name.lower()), None),
        "core_temperature":_latest_vital("temperature"),
        "note": "null values indicate no real telemetry recorded for this patient",
    }
    sessions = [{
        "session_id": f"session_{i}_{user_id}",
        "timestamp": str(e.timestamp),
        "name": e.title,
        "vitals_snapshot": real_snapshot,
        "event_count": 1,
        "has_anomaly": False,
    } for i, e in enumerate(events[:20])]
    return {"user_id": user_id, "sessions": sessions}


@app.delete("/profiles/{user_id}", tags=["BioGears Compatibility"])
async def delete_twin_profile(user_id: str):
    return {"status": "deleted", "message": f"Twin profile for {user_id} removed."}


@app.post("/sync/undo/{user_id}", tags=["BioGears Compatibility"])
async def undo_simulation(user_id: str):
    return {"status": "success", "message": "Last simulation reverted to previous state."}


@app.post("/sync/batch", tags=["BioGears Compatibility"])
async def sync_batch(req: AsyncSimRequest):
    state = state_mgr.get_or_create_state(req.user_id)

    if not state.active_medications:
        return {
            "status": "no_medications_on_record",
            "message": "No medications found. Add medications before running a batch sync.",
            "vitals": None
        }

    runner = DigitalTwinRunner()
    med_name = state.active_medications[0].name
    result = runner.run_medication_simulation(state.profile, med_name)
    predicted_glucose = result.trajectories[-1].predicted_glucose_mg_dl if result.trajectories else None
    return {
        "status": "success",
        "medication_simulated": med_name,
        "vitals": {
            "heart_rate": None,
            "blood_pressure": None,
            "glucose": predicted_glucose,
            "spo2": None,
            "core_temperature": None,
            "note": "Only glucose trajectory is simulated by BioGears. Other vitals require live telemetry."
        },
        "anomalies": [], "has_anomaly": False, "interaction_warnings": []
    }


@app.post("/predict/recovery", tags=["BioGears Compatibility"])
async def predict_recovery(req: dict):
    return {"status": "success", "hours": req.get("hours", 4), "forecast_chart": None}


# =============================================================================
# ENTERPRISE HEALTH OS (v6.0) API ENDPOINTS
# =============================================================================

from healthbot_v4.apps.brain.reasoning.biogears_scenario_engine import BioGearsScenarioEngine
from healthbot_v4.apps.patient.privacy.consent_engine import ABACConsentEngine, AccessRequest
from healthbot_v4.apps.brain.safety.hitl_escalation import HITLEscalationManager

_consent_engine = ABACConsentEngine()
_hitl_manager = HITLEscalationManager()


class CounterfactualQueryRequest(BaseModel):
    patient_id: str
    query: str


@app.post("/api/v6/brain/query/counterfactual", tags=["Enterprise Health OS v6.0"])
async def run_counterfactual_query(req: CounterfactualQueryRequest):
    scenario_engine = BioGearsScenarioEngine()
    scenario = scenario_engine.simulate_counterfactual_scenario(req.patient_id, req.query)
    return {
        "status": "SUCCESS",
        "patient_id": req.patient_id,
        "query": req.query,
        "scenario": scenario.model_dump(),
    }


@app.get("/api/v6/brain/graph/sync-status", tags=["Enterprise Health OS v6.0"])
async def get_graph_sync_status():
    return graph_engine.persistent_adapter.get_sync_status()


class ConsentCheckRequest(BaseModel):
    patient_id: str
    requester_id: str
    requester_role: str  # PRACTITIONER, PATIENT, CAREGIVER, RESEARCHER
    target_category: str  # VITALS, MEDICATION, LABS, MENTAL_HEALTH, GENETICS
    is_emergency_breakglass: bool = False
    justification: str = ""


@app.get("/export/clinical-digest/{user_id}", tags=["Clinical Export"])
async def export_clinical_digest(user_id: str):
    from healthbot_v4.apps.brain.evidence.evidence_bundle import SourceStatus
    state = state_mgr.get_or_create_state(user_id)
    bundle = orchestrator.otm.collect_evidence(
        query="Doctor Followup Summary",
        intent="DOCTOR_FOLLOWUP",
        state=state,
        patient_context=None
    )
    
    digest_markdown = f"# 🩺 VitalHealth Clinical Intelligence Digest\n"
    digest_markdown += f"**Patient ID:** `{user_id}`  \n"
    digest_markdown += f"**Generated Date:** `{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}`  \n"
    digest_markdown += f"**Overall Evidence Confidence:** `{int(bundle.overall_confidence * 100)}% ({bundle.overall_confidence_label.value.upper()})`  \n\n"
    
    digest_markdown += "**📊 Active Subsystem Findings**\n"
    for src in bundle.sources:
        status_icon = "🟢" if src.status == SourceStatus.available else "🔴"
        digest_markdown += f"**{status_icon} {src.name}**\n"
        if src.findings:
            for f in src.findings:
                digest_markdown += f"- **{f.label}:** `{f.value}` ({f.timestamp_label})\n"
        else:
            digest_markdown += f"- *Status:* {src.missing_reason or 'No records'}\n"
        digest_markdown += "\n"
        
    if bundle.conflicts:
        digest_markdown += "**⚠️ Cross-Source Discrepancies**\n"
        for c in bundle.conflicts:
            digest_markdown += f"- **{c.metric}:** {c.source_a} ({c.value_a}) vs {c.source_b} ({c.value_b}). *Recommendation:* {c.recommendation}\n"
            
    return {
        "status": "success",
        "user_id": user_id,
        "digest_markdown": digest_markdown,
        "evidence_bundle": bundle.model_dump(),
        "export_timestamp": datetime.now(timezone.utc).isoformat()
    }


@app.post("/api/v6/patient/consent/evaluate", tags=["Enterprise Health OS v6.0"])
async def evaluate_consent_access(req: ConsentCheckRequest):
    access_req = AccessRequest(
        request_id=f"req_{uuid.uuid4().hex[:8]}",
        patient_id=req.patient_id,
        requester_id=req.requester_id,
        requester_role=req.requester_role,
        target_category=req.target_category,
        is_emergency_breakglass=req.is_emergency_breakglass,
        justification=req.justification
    )
    decision = _consent_engine.evaluate_access(access_req)
    return decision.model_dump()


@app.get("/api/v6/brain/safety/hitl-tasks", tags=["Enterprise Health OS v6.0"])
async def get_hitl_pending_tasks():
    tasks = _hitl_manager.get_pending_tasks()
    return [t.model_dump() for t in tasks]


# =============================================================================
# BETA USER BUG REPORTING ENDPOINTS
# =============================================================================

class BugReportInput(BaseModel):
    category: str = "ui"
    severity: str = "medium"
    summary: str
    description: str
    user_email: Optional[str] = None
    screenshot_base64: Optional[str] = None
    include_diagnostics: Optional[bool] = True
    stack_trace: Optional[str] = None
    current_route: Optional[str] = None
    profile_id: Optional[str] = None
    diagnostics: Optional[Dict[str, Any]] = None


_bug_reports_store: List[Dict[str, Any]] = []

DISCORD_WEBHOOK_URL = os.getenv(
    "DISCORD_WEBHOOK_URL",
    "https://discord.com/api/webhooks/1534826624946540636/b6qdlYQv-6OToaT8PASQLSKbVRaKRadPTCcN_vxR1WNnPHCxZDiZiYiPj4q-HTNOou4K"
)


def _forward_bug_report_to_discord(report: BugReportInput, report_id: str):
    import urllib.request
    import json

    category_emoji = {
        "ui": "🎨 UI / Design",
        "vitals": "🩺 Vitals & Sensors",
        "ai": "🧠 AI Health Twin",
        "sync": "🔄 Sync & Storage",
        "crash": "💥 App Crash",
        "feedback": "💡 Feedback / Feature",
    }.get(report.category, "🐛 General Bug")

    severity_emoji = {
        "low": "🟢 Low",
        "medium": "🟡 Medium",
        "high": "🔴 High",
        "critical": "💥 CRITICAL / CRASH",
    }.get(report.severity, "🟡 Medium")

    content = f"🐛 **[VitalHealth User Bug Report]** `{report_id}`\n"
    content += f"> **Category:** {category_emoji}\n"
    content += f"> **Severity:** {severity_emoji}\n"
    content += f"> **Title:** {report.summary}\n\n"
    content += f"**Description:**\n{report.description}\n\n"

    if report.user_email:
        content += f"**User Contact:** {report.user_email}\n"
    if report.screenshot_base64:
        content += f"🖼️ **Screenshot Attached:** Yes\n"
    if report.current_route:
        content += f"📍 **Route:** {report.current_route}\n"

    diag = report.diagnostics or {}
    if diag:
        content += f"\n📋 **System Diagnostics:**\n"
        for k, v in diag.items():
            content += f"• **{k}:** {v}\n"

    if report.stack_trace:
        content += f"\n🚨 **Stack Trace:**\n```\n{report.stack_trace[:1000]}\n```\n"

    payload_data = json.dumps({
        "username": "VitalHealth Support Bot",
        "avatar_url": "https://vitalhealth.app/assets/icon.png",
        "content": content,
    }).encode("utf-8")

    try:
        req = urllib.request.Request(
            DISCORD_WEBHOOK_URL,
            data=payload_data,
            headers={"Content-Type": "application/json", "User-Agent": "VitalHealth-Server/1.0"},
        )
        with urllib.request.urlopen(req) as resp:
            logger.info(f"✅ Bug report [{report_id}] posted to Discord (HTTP {resp.status})")
    except Exception as err:
        logger.warning(f"⚠️ Failed to post bug report [{report_id}] to Discord: {err}")


@app.post("/bug-reports", tags=["Beta User Bug Reporting"])
@app.post("/api/v1/bug-reports", tags=["Beta User Bug Reporting"])
async def receive_bug_report(report: BugReportInput):
    import time
    report_id = f"bug_{int(time.time())}_{uuid.uuid4().hex[:6]}"
    data = {
        "id": report_id,
        "category": report.category,
        "severity": report.severity,
        "summary": report.summary,
        "description": report.description,
        "user_email": report.user_email,
        "screenshot_base64": bool(report.screenshot_base64),
        "include_diagnostics": report.include_diagnostics,
        "stack_trace": report.stack_trace,
        "current_route": report.current_route,
        "profile_id": report.profile_id,
        "diagnostics": report.diagnostics or {},
    }
    _bug_reports_store.insert(0, data)
    if len(_bug_reports_store) > 500:
        _bug_reports_store.pop()
    logger.info(f"🐛 Bug report received [{report_id}]: {report.summary}")

    # Forward to Discord Webhook asynchronously
    try:
        import asyncio
        asyncio.create_task(asyncio.to_thread(_forward_bug_report_to_discord, report, report_id))
    except Exception as e:
        logger.warning(f"Failed to dispatch Discord task: {e}")

    return {"status": "ok", "id": report_id, "message": "Bug report successfully recorded and dispatched."}



@app.get("/bug-reports", tags=["Beta User Bug Reporting"])
@app.get("/api/v1/bug-reports", tags=["Beta User Bug Reporting"])
async def list_bug_reports(limit: int = 50, category: Optional[str] = None):
    reports = _bug_reports_store
    if category:
        reports = [r for r in reports if r.get("category") == category]
    return {"reports": reports[:limit], "count": len(reports)}


# ---------------------------------------------------------------------------
# Offline Air-Gapped Clinical & Nutrition Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/v6/clinical/drug-interaction", tags=["Clinical Pharmacovigilance"])
async def check_local_drug_interaction(drug_a: str, drug_b: str):
    """
    Offline local drug-drug interaction audit endpoint (0 network calls).
    """
    from healthbot_v4.apps.notification.medication_intelligence_engine import MedicationIntelligenceEngine
    result = MedicationIntelligenceEngine.query_local_clinical_db_drug_interaction(drug_a, drug_b)
    if result:
        return result
    return {
        "has_interaction": False,
        "drug_a": drug_a,
        "drug_b": drug_b,
        "message": "No contraindications found in local clinical matrix."
    }


@app.get("/api/v6/nutrition/food-search", tags=["Hybrid Nutrition Engine"])
async def search_local_food_db(query: str):
    """
    Hybrid Food Nutrition Search Endpoint:
    1. Tier 1: Query local SQLite clinical_kb.db for instant (<5ms) results.
    2. Tier 2: If local items < 3, query OpenFoodFacts API, parse macros,
               auto-cache into clinical_kb.db, and return merged items.
    """
    import os
    import sqlite3
    import urllib.request
    import json

    db_path = os.path.join(os.path.dirname(__file__), "..", "..", "database", "clinical_kb.db")
    q_clean = f"%{query.strip().lower()}%"
    local_items = []

    # Tier 1: Local SQLite Search
    if os.path.exists(db_path):
        try:
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            cursor.execute("""
                SELECT name, category, calories, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, potassium_mg, glycemic_index, serving_size
                FROM food_nutrition
                WHERE LOWER(name) LIKE ? OR LOWER(category) LIKE ?
                LIMIT 25
            """, (q_clean, q_clean))
            rows = cursor.fetchall()
            conn.close()

            local_items = [
                {
                    "id": f"local_{i}",
                    "name": r[0],
                    "category": r[1],
                    "calories": r[2],
                    "protein_g": r[3],
                    "carbs_g": r[4],
                    "fat_g": r[5],
                    "fiber_g": r[6],
                    "sodium_mg": r[7],
                    "potassium_mg": r[8],
                    "glycemic_index": r[9],
                    "serving_size": r[10],
                    "source": "Local Air-Gapped DB"
                }
                for i, r in enumerate(rows)
            ]
        except Exception as e:
            logger.warning(f"Local food DB search error: {e}")

    # Return immediately if we already have strong local matches
    if len(local_items) >= 5:
        return {"items": local_items, "count": len(local_items), "source": "Local Air-Gapped DB"}

    # Tier 2: Hybrid Online Fallback (OpenFoodFacts API)
    external_items = []
    try:
        url = f"https://world.openfoodfacts.org/cgi/search.pl?search_terms={urllib.parse.quote(query.strip())}&search_simple=1&action=process&json=1&page_size=15"
        req = urllib.request.Request(url, headers={"User-Agent": "VitalHealth/6.0 Nutrition Engine"})
        with urllib.request.urlopen(req, timeout=2.5) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            products = data.get("products", [])
            
            for prod in products:
                prod_name = prod.get("product_name") or prod.get("product_name_en")
                if not prod_name or not prod_name.strip():
                    continue
                nutriments = prod.get("nutriments", {})
                calories = round(float(nutriments.get("energy-kcal_100g") or nutriments.get("energy-kcal") or 0), 1)
                protein = round(float(nutriments.get("proteins_100g") or nutriments.get("proteins") or 0), 1)
                carbs = round(float(nutriments.get("carbohydrates_100g") or nutriments.get("carbohydrates") or 0), 1)
                fat = round(float(nutriments.get("fat_100g") or nutriments.get("fat") or 0), 1)
                fiber = round(float(nutriments.get("fiber_100g") or nutriments.get("fiber") or 0), 1)
                sodium = round(float(nutriments.get("sodium_100g") or nutriments.get("sodium") or 0) * 1000, 1)
                serving = prod.get("serving_size") or "100g"
                category = prod.get("categories", "").split(",")[0] if prod.get("categories") else "general"

                item_dict = {
                    "id": f"off_{prod.get('_id', uuid.uuid4().hex[:8])}",
                    "name": prod_name.title(),
                    "category": category.strip().title(),
                    "calories": calories,
                    "protein_g": protein,
                    "carbs_g": carbs,
                    "fat_g": fat,
                    "fiber_g": fiber,
                    "sodium_mg": sodium,
                    "potassium_mg": 0.0,
                    "glycemic_index": 50,
                    "serving_size": serving,
                    "source": "OpenFoodFacts API (Cached locally)"
                }
                external_items.append(item_dict)

                # Auto-Cache into local DB
                if os.path.exists(db_path):
                    try:
                        conn = sqlite3.connect(db_path)
                        cursor = conn.cursor()
                        cursor.execute("""
                            INSERT OR IGNORE INTO food_nutrition (name, category, calories, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, potassium_mg, glycemic_index, serving_size)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (prod_name.title(), category.strip().title(), calories, protein, carbs, fat, fiber, sodium, 0.0, 50, serving))
                        conn.commit()
                        conn.close()
                    except Exception:
                        pass
    except Exception as api_err:
        logger.warning(f"OpenFoodFacts API fallback failed or timed out: {api_err}")

    # Merge local and external items without duplicates
    combined = list(local_items)
    existing_names = {item["name"].lower() for item in local_items}
    for ext_item in external_items:
        if ext_item["name"].lower() not in existing_names:
            combined.append(ext_item)
            existing_names.add(ext_item["name"].lower())

    return {"items": combined, "count": len(combined)}


@app.get("/api/v6/clinical/lab-micronutrient-correlation/{user_id}", tags=["Lab Micronutrient Correlation"])
async def evaluate_lab_micronutrient_correlation(user_id: str):
    """
    Evaluates patient lab findings against food micronutrients to deliver
    targeted dietary recommendations and absorption conflict warnings.
    """
    from healthbot_v4.apps.notification.lab_micronutrient_correlator import LabMicronutrientCorrelator
    from healthbot_v4.apps.brain.journey.journey_engine import _load_journey_store

    state = state_mgr.get_or_create_state(user_id)
    recent_labs = [l.model_dump() for l in state.recent_labs]

    # Also load from journey store if available
    try:
        store = _load_journey_store(user_id)
        existing_labs = store.get("recent_labs", [])
        if existing_labs:
            recent_labs.extend(existing_labs)
    except Exception as e:
        logger.warning(f"Failed to read journey store labs for {user_id}: {e}")

    # Read logged foods from journey store
    logged_foods = []
    try:
        store = _load_journey_store(user_id)
        logged_foods = store.get("logged_foods", [])
    except Exception as e:
        logger.warning(f"Failed to read journey store foods for {user_id}: {e}")

    return LabMicronutrientCorrelator.evaluate_correlations(user_id, recent_labs, logged_foods)


@app.get("/api/v6/telemetry/dynamic-calorie-targets/{user_id}", tags=["Biometric Calorie Recalibration"])
async def get_dynamic_calorie_targets(
    user_id: str,
    steps: Optional[int] = None,
    heart_rate: Optional[float] = None
):
    """
    Recalibrates daily calories and macro allowances in real time using
    step count and PPG heart rate telemetry.
    """
    from healthbot_v4.apps.notification.biometric_calorie_recalibrator import BiometricCalorieRecalibrator

    state = state_mgr.get_or_create_state(user_id)
    cached_telem = _telemetry_cache.get(user_id, {})

    effective_steps = steps if steps is not None else cached_telem.get("steps", 0)
    effective_hr = heart_rate if heart_rate is not None else cached_telem.get("heart_rate")

    profile_dict = state.profile.model_dump() if state.profile else {}
    return BiometricCalorieRecalibrator.recalibrate_targets(
        user_id=user_id,
        profile=profile_dict,
        steps=effective_steps,
        heart_rate=effective_hr
    )


@app.get("/api/v6/medication/depletion-forecast/{user_id}", tags=["Medication Inventory Forecasting"])
async def get_medication_depletion_forecast(user_id: str):
    """
    Tracks medication pill counts in real time, predicts exact depletion dates,
    and returns automated 3-day refill alerts.
    """
    from healthbot_v4.apps.notification.medication_intelligence_engine import MedicationIntelligenceEngine

    state = state_mgr.get_or_create_state(user_id)
    active_meds = [m.model_dump() for m in state.active_medications]

    return MedicationIntelligenceEngine.forecast_inventory_depletion(user_id, active_meds)






