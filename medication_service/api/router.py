"""
medication_service/api/router.py
Main FastAPI router — all Medication Vault REST endpoints.
Mounted at /api/v1/medication in the main server.
"""
from __future__ import annotations
import json
import logging
import uuid
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import (
    APIRouter, BackgroundTasks, Depends, File, Form, HTTPException,
    Query, Request, Response, UploadFile, status,
)
from fastapi.responses import JSONResponse, StreamingResponse

from medication_service.domain.models import (
    AIChatRequest, AIChatResponse, APIResponse, CaregiverAdd,
    DoseLogRequest, EmergencyProfileUpdate, InventoryUpdate,
    InteractionCheckRequest, MedicineCreate, MedicineUpdate,
    PaginatedResponse, ReportRequest, ReminderAckRequest,
    ReminderSettingsUpdate, ReminderSnoozeRequest, MedicationStatus,
    MedicationSimRequest,
)
from medication_service.middleware.auth_middleware import CurrentUser, get_current_user
from medication_service.services.medication_service import MedicationService
from medication_service.services.scheduler_service import SchedulerService
from medication_service.services.reminder_service import ReminderService
from medication_service.services.analytics_service import AnalyticsService
from medication_service.services.report_service import ReportService
from medication_service.services.ai_service import AIService
from medication_service.services.ocr_service import OCRService
from medication_service.services.biogears_sync_service import BiogearsSyncService
from medication_service.repositories.medicine_repository import InventoryRepository

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/medication", tags=["Medication Vault"])


def _request_id(request: Request) -> str:
    return request.headers.get("X-Request-Id", str(uuid.uuid4()))


def ok(data: Any = None, message: str = "OK") -> Dict:
    return {"success": True, "message": message, "data": data}


def err(msg: str, code: int = 400) -> HTTPException:
    return HTTPException(status_code=code, detail=msg)


# ─── HEALTH ───────────────────────────────────────────────────────────────────

@router.get("/health", summary="Service health check")
async def health():
    return {"status": "ok", "service": "medication-vault", "version": "1.0.0"}


# ─── MEDICINES ────────────────────────────────────────────────────────────────

@router.post("/medicine", status_code=201, summary="Create a new medication")
async def create_medicine(
    payload: MedicineCreate,
    request: Request,
    bg: BackgroundTasks,
    user: CurrentUser = Depends(get_current_user),
):
    medicine = await MedicationService.create_medicine(user.uid, payload, actor=user.uid)
    # Fire BioGears simulation hook in background if linked
    if payload.biogears_linked:
        bg.add_task(
            BiogearsSyncService.trigger_dose_simulation,
            user.uid, UUID(str(medicine["id"])), UUID(str(medicine["id"])),
            payload.name, payload.dose_quantity,
        )
    return ok(medicine, "Medication created")


@router.get("/medicine", summary="List all medications for user")
async def list_medicines(
    status: Optional[str] = Query(None, pattern="^(active|paused|discontinued|archived|completed)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: Optional[str] = Query(None, max_length=100),
    user: CurrentUser = Depends(get_current_user),
):
    items, total = await MedicationService.list_medicines(user.uid, status, page, page_size, search)
    return PaginatedResponse(
        data=items, total=total, page=page, page_size=page_size,
        has_next=page * page_size < total, has_prev=page > 1,
    )


@router.get("/medicine/{medicine_id}", summary="Get medication by ID")
async def get_medicine(medicine_id: UUID, user: CurrentUser = Depends(get_current_user)):
    med = await MedicationService.get_medicine(medicine_id, user.uid)
    if not med:
        raise err("Medicine not found", 404)
    return ok(med)


@router.put("/medicine/{medicine_id}", summary="Update medication")
async def update_medicine(
    medicine_id: UUID,
    payload: MedicineUpdate,
    user: CurrentUser = Depends(get_current_user),
):
    result = await MedicationService.update_medicine(medicine_id, user.uid, payload, actor=user.uid)
    if not result:
        raise err("Medicine not found or no changes", 404)
    return ok(result, "Medication updated")


@router.delete("/medicine/{medicine_id}", summary="Delete (soft) medication")
async def delete_medicine(medicine_id: UUID, user: CurrentUser = Depends(get_current_user)):
    deleted = await MedicationService.delete_medicine(medicine_id, user.uid, actor=user.uid)
    if not deleted:
        raise err("Medicine not found", 404)
    return ok(None, "Medication deleted")


@router.patch("/medicine/{medicine_id}/status", summary="Change medication status (pause/resume/discontinue)")
async def change_status(
    medicine_id: UUID,
    status: MedicationStatus,
    user: CurrentUser = Depends(get_current_user),
):
    result = await MedicationService.set_status(medicine_id, user.uid, status, actor=user.uid)
    if not result:
        raise err("Medicine not found", 404)
    return ok(result, f"Status set to {status.value}")


# ─── DOSE LOGGING ─────────────────────────────────────────────────────────────

@router.post("/dose", summary="Log a dose event (taken/missed/skipped)")
async def log_dose(
    payload: DoseLogRequest,
    bg: BackgroundTasks,
    user: CurrentUser = Depends(get_current_user),
):
    result = await MedicationService.log_dose(
        user_id=user.uid,
        medicine_id=payload.medicine_id,
        status=payload.status,
        taken_at=payload.taken_at,
        skip_reason=payload.skip_reason,
        notes=payload.notes,
        actor=user.uid,
    )
    # Trigger BioGears simulation in background for taken doses
    if payload.status.value == "taken":
        med = await MedicationService.get_medicine(payload.medicine_id, user.uid)
        if med and med.get("biogears_linked"):
            bg.add_task(
                BiogearsSyncService.trigger_dose_simulation,
                user.uid, payload.medicine_id,
                UUID(str(result.get("id", uuid.uuid4()))),
                med.get("name", ""), med.get("dose_quantity", "1"),
            )
    return ok(result, f"Dose logged as {payload.status.value}")


@router.get("/schedule/today", summary="Get today's medication schedule")
async def today_schedule(user: CurrentUser = Depends(get_current_user)):
    doses = await MedicationService.get_today_schedule(user.uid)
    return ok(doses)


@router.get("/schedule/upcoming", summary="Get upcoming doses (next N hours)")
async def upcoming_schedule(
    hours: int = Query(24, ge=1, le=168),
    user: CurrentUser = Depends(get_current_user),
):
    doses = await SchedulerService.get_upcoming(user.uid, hours)
    return ok(doses)


@router.post("/schedule/generate", summary="Generate future dose schedule")
async def generate_schedule(
    days: int = Query(14, ge=1, le=60),
    user: CurrentUser = Depends(get_current_user),
):
    count = await SchedulerService.generate_doses_for_user(user.uid, days_ahead=days)
    return ok({"generated": count}, f"Generated {count} dose records")


@router.post("/schedule/dose/{dose_id}/reschedule", summary="Reschedule a specific dose")
async def reschedule_dose(
    dose_id: UUID,
    new_time: datetime,
    user: CurrentUser = Depends(get_current_user),
):
    result = await SchedulerService.reschedule_dose(dose_id, user.uid, new_time)
    return ok(result, "Dose rescheduled")


# ─── HISTORY ──────────────────────────────────────────────────────────────────

@router.get("/history", summary="Get medication history (dose events log)")
async def get_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status: Optional[str] = Query(None),
    user: CurrentUser = Depends(get_current_user),
):
    items, total = await MedicationService.get_history(user.uid, page, page_size, status)
    return PaginatedResponse(
        data=items, total=total, page=page, page_size=page_size,
        has_next=page * page_size < total, has_prev=page > 1,
    )


# ─── COMPLIANCE ───────────────────────────────────────────────────────────────

@router.get("/compliance", summary="Get compliance summary")
async def get_compliance(
    days: int = Query(30, ge=1, le=365),
    user: CurrentUser = Depends(get_current_user),
):
    data = await MedicationService.get_compliance(user.uid, days)
    return ok(data)


# ─── INTERACTIONS ─────────────────────────────────────────────────────────────

@router.post("/interaction/check", summary="Check drug-drug / drug-food interactions")
async def check_interactions(
    payload: InteractionCheckRequest,
    user: CurrentUser = Depends(get_current_user),
):
    result = await MedicationService.check_interactions(user.uid, payload.medicine_ids)
    return ok(result.model_dump())


# ─── INVENTORY ────────────────────────────────────────────────────────────────

@router.get("/inventory", summary="Get inventory for all medications")
async def list_inventory(user: CurrentUser = Depends(get_current_user)):
    items = await InventoryRepository.get_all_by_user(user.uid)
    return ok(items)


@router.get("/inventory/{medicine_id}", summary="Get inventory for one medication")
async def get_inventory(medicine_id: UUID, user: CurrentUser = Depends(get_current_user)):
    item = await InventoryRepository.get_by_medicine(medicine_id, user.uid)
    if not item:
        raise err("Inventory record not found", 404)
    return ok(item)


@router.put("/inventory/{medicine_id}", summary="Update inventory (manual edit)")
async def update_inventory(
    medicine_id: UUID,
    payload: InventoryUpdate,
    user: CurrentUser = Depends(get_current_user),
):
    result = await InventoryRepository.update(medicine_id, user.uid, payload.model_dump(exclude_none=True))
    return ok(result, "Inventory updated")


@router.post("/inventory/{medicine_id}/refill", summary="Log a refill (add pills to inventory)")
async def refill_inventory(
    medicine_id: UUID,
    quantity: int = Query(..., ge=1, le=1000),
    user: CurrentUser = Depends(get_current_user),
):
    result = await InventoryRepository.increment(medicine_id, user.uid, quantity, actor=user.uid)
    return ok(result, f"Refilled {quantity} units")


# ─── REMINDERS ────────────────────────────────────────────────────────────────

@router.get("/reminders/pending", summary="Get all pending reminders due now")
async def get_pending_reminders(user: CurrentUser = Depends(get_current_user)):
    items = await ReminderService.get_pending(user.uid)
    return ok(items)


@router.post("/reminders/ack", summary="Acknowledge a reminder (dose taken)")
async def ack_reminder(payload: ReminderAckRequest, user: CurrentUser = Depends(get_current_user)):
    result = await ReminderService.acknowledge(payload.reminder_id, user.uid)
    return ok(result, "Reminder acknowledged")


@router.post("/reminders/snooze", summary="Snooze a reminder")
async def snooze_reminder(payload: ReminderSnoozeRequest, user: CurrentUser = Depends(get_current_user)):
    result = await ReminderService.snooze(payload.reminder_id, user.uid, payload.snooze_minutes)
    return ok(result, f"Reminder snoozed for {payload.snooze_minutes} minutes")


@router.post("/reminders/escalate", summary="Trigger caregiver escalation for overdue reminders")
async def escalate_reminders(
    delay_minutes: int = Query(30, ge=5, le=120),
    user: CurrentUser = Depends(get_current_user),
):
    escalated = await ReminderService.escalate_overdue(user.uid, delay_minutes)
    return ok({"escalated": len(escalated)}, f"Escalated {len(escalated)} reminder(s)")


# ─── ANALYTICS ────────────────────────────────────────────────────────────────

@router.get("/analytics/weekly", summary="Weekly compliance analytics")
async def weekly_analytics(user: CurrentUser = Depends(get_current_user)):
    data = await AnalyticsService.get_weekly(user.uid)
    return ok(data)


@router.get("/analytics/monthly", summary="Monthly compliance analytics")
async def monthly_analytics(user: CurrentUser = Depends(get_current_user)):
    data = await AnalyticsService.get_monthly(user.uid)
    return ok(data)


@router.get("/analytics/cost", summary="Medication cost analysis and generic savings")
async def cost_analysis(user: CurrentUser = Depends(get_current_user)):
    data = await AnalyticsService.get_cost_analysis(user.uid)
    return ok(data)


# ─── REPORTS ──────────────────────────────────────────────────────────────────

@router.post("/report", summary="Generate a downloadable report (PDF/CSV/FHIR/HL7)")
async def generate_report(
    payload: ReportRequest,
    user: CurrentUser = Depends(get_current_user),
):
    today = date.today()
    start = payload.period_start or (today - timedelta(days=30))
    end = payload.period_end or today

    if payload.format.value == "csv":
        data = await ReportService.generate_csv(user.uid, start, end)
        record = await ReportService.create_report_record(user.uid, payload.report_type, "csv", start, end)
        return StreamingResponse(
            iter([data]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="medication_report_{today}.csv"'},
        )
    elif payload.format.value == "fhir_json":
        data = await ReportService.generate_fhir(user.uid, start, end)
        record = await ReportService.create_report_record(user.uid, payload.report_type, "fhir_json", start, end)
        return JSONResponse(content=data, headers={"Content-Disposition": f'attachment; filename="fhir_bundle_{today}.json"'})
    elif payload.format.value == "hl7_v2":
        data = await ReportService.generate_hl7(user.uid, start, end)
        record = await ReportService.create_report_record(user.uid, payload.report_type, "hl7_v2", start, end)
        return Response(content=data, media_type="text/plain", headers={"Content-Disposition": f'attachment; filename="hl7_{today}.hl7"'})
    else:
        data = await ReportService.generate_pdf(user.uid, start, end)
        record = await ReportService.create_report_record(user.uid, payload.report_type, "pdf", start, end)
        return StreamingResponse(
            iter([data]),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="medication_report_{today}.pdf"'},
        )


# ─── OCR ──────────────────────────────────────────────────────────────────────

@router.post("/ocr", summary="OCR a prescription image or PDF")
async def ocr_prescription(
    file: UploadFile = File(...),
    user: CurrentUser = Depends(get_current_user),
):
    if file.size and file.size > 20 * 1024 * 1024:
        raise err("File too large (max 20MB)")
    file_bytes = await file.read()
    result = await OCRService.process_upload(file_bytes, file.content_type or "image/jpeg")
    return ok(result, "OCR extraction complete")


@router.get("/barcode", summary="Look up medication by barcode / NDC")
async def barcode_lookup(
    barcode: str = Query(..., min_length=4, max_length=50),
    user: CurrentUser = Depends(get_current_user),
):
    from medication_service.database.connection import get_conn
    async with get_conn() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM drug_database WHERE ndc_code=$1 OR rxcui=$1 LIMIT 1",
            barcode,
        )
    if not row:
        return ok(None, "No drug found for this barcode")
    return ok(dict(row), "Drug found")


# ─── AI ASSISTANT ─────────────────────────────────────────────────────────────

@router.post("/ai/chat", summary="Chat with Dr. Aria AI medication assistant")
async def ai_chat(
    payload: AIChatRequest,
    user: CurrentUser = Depends(get_current_user),
):
    # Get medicine context if requested
    medicine_context: List[Dict] = []
    if payload.context_medicine_ids:
        for mid in payload.context_medicine_ids[:5]:
            med = await MedicationService.get_medicine(mid, user.uid)
            if med:
                medicine_context.append(med)

    result = await AIService.chat(
        user_id=user.uid,
        message=payload.message,
        conversation_id=payload.conversation_id,
        medicine_context=medicine_context or None,
    )
    return ok(result)


# ─── BIOGEARS SYNC ────────────────────────────────────────────────────────────

@router.post("/simulation", summary="Manually trigger BioGears physiological simulation for a medication")
async def trigger_simulation(
    payload: MedicationSimRequest,
    user: CurrentUser = Depends(get_current_user),
):
    sim_id = await BiogearsSyncService.trigger_dose_simulation(
        user_id=user.uid,
        medicine_id=payload.medicine_id,
        dose_id=payload.dose_id or payload.medicine_id,
        medicine_name=payload.substance_name,
        dose_quantity=f"{payload.dose_value}{payload.dose_unit}",
        pre_vitals=payload.pre_vitals,
    )
    return ok({"simulation_id": sim_id}, "Simulation queued")


@router.get("/simulation/history", summary="Get BioGears simulation history for medications")
async def simulation_history(
    limit: int = Query(20, ge=1, le=100),
    user: CurrentUser = Depends(get_current_user),
):
    sims = await BiogearsSyncService.get_simulations_for_user(user.uid, limit)
    return ok(sims)


# ─── EMERGENCY ────────────────────────────────────────────────────────────────

@router.get("/emergency/{qr_token}", summary="Public emergency profile access (no auth — for first responders)")
async def emergency_by_qr(qr_token: str):
    from medication_service.database.connection import get_conn
    async with get_conn() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM emergency_profiles WHERE qr_token=$1", qr_token
        )
    if not row:
        raise err("Emergency profile not found or expired", 404)
    data = dict(row)
    # Log access (HIPAA)
    async with get_conn() as conn:
        await conn.execute(
            """INSERT INTO medication_audit_trail
            (user_id, actor_id, action, resource_type)
            VALUES ($1,'first_responder','EMERGENCY_VIEW','emergency_profile')""",
            data["user_id"],
        )
    return ok({
        "blood_group": data.get("blood_group"),
        "allergies": data.get("allergies", []),
        "critical_medicines": data.get("critical_medicines", []),
        "medical_conditions": data.get("medical_conditions", []),
        "emergency_contacts": data.get("emergency_contacts", []),
    }, "Emergency profile loaded")


@router.put("/emergency", summary="Update emergency profile")
async def update_emergency(
    payload: EmergencyProfileUpdate,
    user: CurrentUser = Depends(get_current_user),
):
    import secrets
    from medication_service.database.connection import get_conn
    # Build critical medicines list from IDs
    critical = []
    if payload.critical_medicine_ids:
        for mid in payload.critical_medicine_ids:
            med = await MedicationService.get_medicine(mid, user.uid)
            if med:
                critical.append({"name": med.get("name"), "dose": med.get("dose_quantity"), "id": str(mid)})

    async with get_conn() as conn:
        row = await conn.fetchrow(
            """INSERT INTO emergency_profiles
            (id, user_id, blood_group, allergies, critical_medicines, medical_conditions,
            emergency_contacts, qr_token, last_updated)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
            ON CONFLICT (user_id) DO UPDATE SET
            blood_group=$3, allergies=$4, critical_medicines=$5,
            medical_conditions=$6, emergency_contacts=$7, last_updated=NOW()
            RETURNING *""",
            uuid.uuid4(), user.uid,
            payload.blood_group,
            json.dumps(payload.allergies or []),
            json.dumps(critical),
            json.dumps(payload.medical_conditions or []),
            json.dumps(payload.emergency_contacts or []),
            secrets.token_hex(16),
        )
    return ok(dict(row), "Emergency profile updated")


@router.get("/emergency", summary="Get your own emergency profile")
async def get_own_emergency(user: CurrentUser = Depends(get_current_user)):
    from medication_service.database.connection import get_conn
    async with get_conn() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM emergency_profiles WHERE user_id=$1", user.uid
        )
    return ok(dict(row) if row else None)


# ─── SETTINGS ─────────────────────────────────────────────────────────────────

@router.get("/settings", summary="Get medication reminder settings")
async def get_settings(user: CurrentUser = Depends(get_current_user)):
    from medication_service.database.connection import get_conn
    async with get_conn() as conn:
        row = await conn.fetchrow("SELECT * FROM medication_settings WHERE user_id=$1", user.uid)
    if not row:
        return ok({"user_id": user.uid, "message": "Using defaults"})
    return ok(dict(row))


@router.put("/settings", summary="Update medication reminder settings")
async def update_settings(
    payload: ReminderSettingsUpdate,
    user: CurrentUser = Depends(get_current_user),
):
    from medication_service.database.connection import get_conn
    data = payload.model_dump(exclude_none=True)
    fields = [f"{k}=${i+2}" for i, k in enumerate(data.keys())]
    params = [user.uid] + list(data.values())
    async with get_conn() as conn:
        await conn.execute(
            f"""INSERT INTO medication_settings (user_id, {', '.join(data.keys())})
            VALUES ($1, {', '.join(f'${i+2}' for i in range(len(data)))})
            ON CONFLICT (user_id) DO UPDATE SET {', '.join(fields)}, updated_at=NOW()""",
            *params,
        )
    return ok(None, "Settings saved")


# ─── FAMILY / CAREGIVERS ──────────────────────────────────────────────────────

@router.post("/family/caregiver", summary="Add a caregiver to your profile")
async def add_caregiver(payload: CaregiverAdd, user: CurrentUser = Depends(get_current_user)):
    from medication_service.database.connection import get_conn
    async with get_conn() as conn:
        row = await conn.fetchrow(
            """INSERT INTO family_caregivers
            (id, owner_user_id, caregiver_user_id, caregiver_name, relationship, permission, consent_given, consent_given_at)
            VALUES ($1,$2,$3,$4,$5,$6,TRUE,NOW())
            ON CONFLICT (owner_user_id, caregiver_user_id) DO UPDATE
            SET permission=$6, active=TRUE, updated_at=NOW()
            RETURNING *""",
            uuid.uuid4(), user.uid, payload.caregiver_user_id,
            payload.caregiver_name, payload.relationship, payload.permission.value,
        )
    return ok(dict(row), "Caregiver added")


@router.get("/family/caregivers", summary="List your caregivers")
async def list_caregivers(user: CurrentUser = Depends(get_current_user)):
    from medication_service.database.connection import get_conn
    async with get_conn() as conn:
        rows = await conn.fetch(
            "SELECT * FROM family_caregivers WHERE owner_user_id=$1 AND active=TRUE", user.uid
        )
    return ok([dict(r) for r in rows])


@router.delete("/family/caregiver/{caregiver_user_id}", summary="Remove a caregiver")
async def remove_caregiver(caregiver_user_id: str, user: CurrentUser = Depends(get_current_user)):
    from medication_service.database.connection import get_conn
    async with get_conn() as conn:
        await conn.execute(
            "UPDATE family_caregivers SET active=FALSE, updated_at=NOW() WHERE owner_user_id=$1 AND caregiver_user_id=$2",
            user.uid, caregiver_user_id,
        )
    return ok(None, "Caregiver removed")


# ─── PRESCRIPTIONS ────────────────────────────────────────────────────────────

@router.get("/prescription", summary="List prescriptions in vault")
async def list_prescriptions(user: CurrentUser = Depends(get_current_user)):
    from medication_service.database.connection import get_conn
    async with get_conn() as conn:
        rows = await conn.fetch(
            "SELECT * FROM prescriptions WHERE user_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC",
            user.uid,
        )
    return ok([dict(r) for r in rows])


@router.post("/prescription/ocr", summary="Upload + OCR a prescription file")
async def upload_prescription(
    file: UploadFile = File(...),
    doctor_name: Optional[str] = Form(None),
    user: CurrentUser = Depends(get_current_user),
):
    file_bytes = await file.read()
    ocr_result = await OCRService.process_upload(file_bytes, file.content_type or "image/jpeg")
    from medication_service.database.connection import get_conn
    async with get_conn() as conn:
        row = await conn.fetchrow(
            """INSERT INTO prescriptions
            (id, user_id, doctor_name, hospital, raw_ocr_text, ocr_confidence, medicines, file_name, file_mime, created_by)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$2) RETURNING *""",
            uuid.uuid4(), user.uid,
            doctor_name or ocr_result.get("doctor"),
            ocr_result.get("hospital"),
            ocr_result.get("raw_text", ""),
            ocr_result.get("confidence", 0.0),
            json.dumps(ocr_result.get("medicines", [])),
            file.filename,
            file.content_type,
        )
    return ok({"prescription": dict(row), "ocr": ocr_result}, "Prescription uploaded and OCR'd")


# ─── AUDIT ────────────────────────────────────────────────────────────────────

@router.get("/audit", summary="Get medication audit trail for your profile")
async def get_audit_trail(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: CurrentUser = Depends(get_current_user),
):
    from medication_service.database.connection import get_conn
    offset = (page - 1) * page_size
    async with get_conn() as conn:
        total = await conn.fetchval(
            "SELECT COUNT(*) FROM medication_audit_trail WHERE user_id=$1", user.uid
        )
        rows = await conn.fetch(
            "SELECT * FROM medication_audit_trail WHERE user_id=$1 ORDER BY event_at DESC LIMIT $2 OFFSET $3",
            user.uid, page_size, offset,
        )
    return PaginatedResponse(
        data=[dict(r) for r in rows], total=total, page=page, page_size=page_size,
        has_next=page * page_size < total, has_prev=page > 1,
    )


# ─── ACHIEVEMENTS ─────────────────────────────────────────────────────────────

@router.get("/achievements", summary="Get earned badges and achievements")
async def get_achievements(user: CurrentUser = Depends(get_current_user)):
    from medication_service.database.connection import get_conn
    async with get_conn() as conn:
        rows = await conn.fetch(
            "SELECT * FROM achievements WHERE user_id=$1 ORDER BY earned_at DESC", user.uid
        )
    return ok([dict(r) for r in rows])
