"""
healthbot_v4/apps/api/server.py
Production FastAPI Gateway Server for VitalHealth v5.0 Health Brain.
Exposes REST endpoints for Patient Management, OCR Ingestion, BioGears Digital Twin, AI Orchestration, Copilot Briefings, and Developer Dashboard.
"""

import os
from urllib.parse import quote
from urllib.request import Request, urlopen
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
from healthbot_v4.apps.notification.routers.notification_router import router as notification_router
from healthbot_v4.apps.brain.copilot.dev_review_router import router as dev_review_router
from biogears_service.api.server import app as biogears_app

app.include_router(dev_router)
app.include_router(journey_router)
app.include_router(onboarding_router)
app.include_router(notification_router)
app.include_router(dev_review_router)
app.include_router(biogears_app.router)


app.add_middleware(
    CORSMiddleware,
    allow_origins=getattr(settings, "CORS_ALLOWED_ORIGINS", ["*"]),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
_telemetry_cache: Dict[str, Dict[str, Any]] = {}

# Request schemas
# Request schemas
class QueryRequest(BaseModel):
    patient_id: str
    session_id: str = "sess_default"
    query: str
    active_symptoms: Optional[List[Any]] = None
    patient_context: Optional[Dict[str, Any]] = None
    rag_context: Optional[str] = None  # On-device retrieved document chunks (RAG from uploaded reports)


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
        rag_context=req.rag_context,
    )


@app.post("/api/v5/brain/query/explainable", tags=["AI Reasoning Engine"])
async def process_explainable_query(req: QueryRequest):
    res = await orchestrator.process_patient_query(
        req.patient_id,
        req.session_id,
        req.query,
        active_symptoms=req.active_symptoms,
        patient_context=req.patient_context,
        rag_context=req.rag_context,
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

    # Auto-enrich patient_context with live BioGears vitals & organ health scores if missing
    patient_ctx = req.patient_context or {}
    if "sim_vitals" not in patient_ctx or "organ_scores" not in patient_ctx:
        try:
            from biogears_service.api.analytics import get_latest_vitals, compute_organ_scores
            if "sim_vitals" not in patient_ctx or not patient_ctx.get("sim_vitals"):
                v = get_latest_vitals(req.patient_id)
                if v:
                    patient_ctx["sim_vitals"] = v
            if "organ_scores" not in patient_ctx or not patient_ctx.get("organ_scores"):
                o = compute_organ_scores(req.patient_id)
                if o:
                    patient_ctx["organ_scores"] = o
        except Exception as e:
            logger.debug(f"BioGears process_phos_query auto-enrichment skipped: {e}")

    response_payload = phos_orchestrator.process_query(
        query=req.query,
        state=state,
        active_symptoms=req.active_symptoms,
        patient_context=patient_ctx,
        rag_context=req.rag_context,
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
# BIOGEARS DIGITAL TWIN ENDPOINTS
# Mounted directly from biogears_service.api.server via biogears_app.router
# =============================================================================



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
    # Merge legacy 'chunks' list into rag_context string for backward compatibility
    legacy_chunks = payload.get("chunks") or []
    rag_context = "\n\n".join(legacy_chunks) if legacy_chunks else payload.get("rag_context") or None
    res = await orchestrator.process_patient_query(
        user_id,
        "sess_generate",
        query,
        active_symptoms=payload.get("active_symptoms"),
        patient_context=payload.get("patient_context"),
        rag_context=rag_context,
    )
    return {"status": "success", "response": res.response_text, "response_text": res.response_text}




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
        url = f"https://world.openfoodfacts.org/cgi/search.pl?search_terms={quote(query.strip())}&search_simple=1&action=process&json=1&page_size=15"
        req = Request(url, headers={"User-Agent": "VitalHealth/6.0 Nutrition Engine"})
        with urlopen(req, timeout=2.5) as resp:
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






