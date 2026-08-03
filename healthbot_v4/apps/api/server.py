"""
healthbot_v4/apps/api/server.py
Production FastAPI Gateway Server for VitalHealth v5.0 Health Brain.
Exposes REST endpoints for Patient Management, OCR Ingestion, BioGears Digital Twin, AI Orchestration, Copilot Briefings, and Developer Dashboard.
"""

from contextlib import asynccontextmanager
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException, status, Depends
from fastapi.middleware.cors import CORSMiddleware

from healthbot_v4.shared.config.settings import settings
from healthbot_v4.shared.logger.logger import logger
from healthbot_v4.shared.models.base import PatientProfile, NormalizedLab, NormalizedMedication, RiskFlag
from healthbot_v4.apps.brain.core import get_health_brain
from healthbot_v4.apps.brain.orchestrator.orchestrator import AIOrchestrator, OrchestratorResponse
from healthbot_v4.apps.brain.state.patient_state_manager import PatientStateManager
from healthbot_v4.apps.brain.timeline.event_stream import MedicalTimelineEngine
from healthbot_v4.apps.brain.graph.patient_graph import PatientGraphEngine
from healthbot_v4.apps.brain.copilot.health_copilot import HealthCopilot, DailyHealthBriefing
from healthbot_v4.apps.ocr.engine.record_builder import SmartOCRPipeline
from healthbot_v4.apps.twin.simulation_runner import DigitalTwinRunner, SimulationResult


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"🚀 Starting {settings.PROJECT_NAME} v{settings.VERSION}")
    brain = get_health_brain()
    brain.register_subsystem(AIOrchestrator())
    brain.register_subsystem(DigitalTwinRunner())
    await brain.initialize_all()
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
app.include_router(dev_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request schemas
class QueryRequest(BaseModel):
    patient_id: str
    session_id: str = "sess_default"
    query: str


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
graph_engine = PatientGraphEngine()
copilot = HealthCopilot()
ocr_pipeline = SmartOCRPipeline()
orchestrator = AIOrchestrator()


@app.get("/health", tags=["System Health"])
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
    return await orchestrator.process_patient_query(req.patient_id, req.session_id, req.query)


@app.post("/api/v5/brain/query/explainable", tags=["AI Reasoning Engine"])
async def process_explainable_query(req: QueryRequest):
    res = await orchestrator.process_patient_query(req.patient_id, req.session_id, req.query)
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


@app.post("/api/v5/twin/simulate", response_model=SimulationResult, tags=["BioGears Digital Twin"])
async def run_digital_twin_simulation(req: TwinSimulationRequest):
    state = state_mgr.get_or_create_state(req.patient_id)
    runner = DigitalTwinRunner()
    return runner.run_medication_simulation(state.profile, req.medication_name, req.dose_mg, req.duration_days)
