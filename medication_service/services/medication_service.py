"""
medication_service/services/medication_service.py
Business logic layer — wraps repositories, enforces rules, triggers side-effects.
"""
from __future__ import annotations
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from medication_service.repositories.medicine_repository import (
    MedicineRepository, DoseRepository, InventoryRepository,
    ComplianceRepository, InteractionRepository,
)
from medication_service.domain.models import (
    MedicineCreate, MedicineUpdate, DoseStatus, MedicationStatus,
    InteractionCheckResponse, InteractionSeverity,
)

logger = logging.getLogger(__name__)


class MedicationService:
    """Orchestrates medicine lifecycle: create → schedule → log → analyze."""

    @staticmethod
    async def create_medicine(user_id: str, payload: MedicineCreate, actor: str) -> Dict:
        data = payload.model_dump()
        if data.get("doctor_id"):
            data["doctor_id"] = str(data["doctor_id"])
        medicine = await MedicineRepository.create(user_id, data, actor)
        # Auto-generate doses for next 7 days
        try:
            await DoseRepository.generate_for_medicine(medicine, days_ahead=7)
        except Exception as e:
            logger.warning(f"Dose generation failed for medicine {medicine['id']}: {e}")
        return medicine

    @staticmethod
    async def list_medicines(user_id: str, status: str | None, page: int, page_size: int, search: str | None):
        items, total = await MedicineRepository.list_by_user(user_id, status, page, page_size, search)
        return items, total

    @staticmethod
    async def get_medicine(medicine_id: UUID, user_id: str) -> Optional[Dict]:
        return await MedicineRepository.get_by_id(medicine_id, user_id)

    @staticmethod
    async def update_medicine(medicine_id: UUID, user_id: str, payload: MedicineUpdate, actor: str) -> Optional[Dict]:
        data = {k: v for k, v in payload.model_dump().items() if v is not None}
        return await MedicineRepository.update(medicine_id, user_id, data, actor)

    @staticmethod
    async def delete_medicine(medicine_id: UUID, user_id: str, actor: str) -> bool:
        return await MedicineRepository.soft_delete(medicine_id, user_id, actor)

    @staticmethod
    async def set_status(medicine_id: UUID, user_id: str, status: MedicationStatus, actor: str):
        return await MedicineRepository.update_status(medicine_id, user_id, status.value, actor)

    @staticmethod
    async def log_dose(
        user_id: str,
        medicine_id: UUID,
        status: DoseStatus,
        taken_at: Optional[datetime],
        skip_reason: Optional[str],
        notes: Optional[str],
        actor: str,
    ) -> Dict:
        result = await DoseRepository.log_dose(
            user_id, medicine_id, status.value, taken_at, skip_reason, notes, actor=actor
        )
        # Recompute today's compliance
        try:
            await ComplianceRepository.compute_and_store(user_id, date.today())
        except Exception as e:
            logger.warning(f"Compliance recompute error: {e}")
        return result

    @staticmethod
    async def get_today_schedule(user_id: str) -> List[Dict]:
        return await DoseRepository.get_today(user_id)

    @staticmethod
    async def get_history(user_id: str, page: int, page_size: int, status_filter: str | None):
        items, total = await DoseRepository.get_history(user_id, page, page_size, status_filter)
        return items, total

    @staticmethod
    async def check_interactions(user_id: str, medicine_ids: List[UUID]) -> InteractionCheckResponse:
        from medication_service.database.connection import get_conn
        # Get medicine names
        async with get_conn() as conn:
            rows = await conn.fetch(
                "SELECT id, name, generic_name FROM medicines WHERE id = ANY($1::uuid[]) AND user_id=$2",
                [str(mid) for mid in medicine_ids], user_id,
            )
        medicines = {str(r["id"]): r["name"] for r in rows}
        names = list(medicines.values())

        raw = await InteractionRepository.check_interactions(names)
        interactions = []
        highest = InteractionSeverity.none
        has_contra = False

        severity_order = ["none", "minor", "moderate", "major", "contraindicated"]
        for r in raw:
            sev = InteractionSeverity(r.get("severity", "minor"))
            if severity_order.index(sev.value) > severity_order.index(highest.value):
                highest = sev
            if r.get("contraindicated"):
                has_contra = True
            from medication_service.domain.models import InteractionResult
            interactions.append(InteractionResult(
                drug_a=r["drug_a_name"],
                drug_b=r["drug_b_name"],
                severity=sev,
                mechanism=r.get("mechanism"),
                clinical_effect=r.get("clinical_effect"),
                management=r.get("management"),
                contraindicated=bool(r.get("contraindicated")),
                confidence_score=float(r.get("confidence_score", 0.8)),
                reference_sources=r.get("reference_sources") or [],
            ))

        summary = (
            f"⚠️ CONTRAINDICATION detected between {names}." if has_contra
            else f"{len(interactions)} interaction(s) found — highest: {highest.value.upper()}."
            if interactions else "No known interactions found between selected medications."
        )
        return InteractionCheckResponse(
            checked_medicines=names,
            interactions=interactions,
            highest_severity=highest,
            has_contraindication=has_contra,
            summary=summary,
        )

    @staticmethod
    async def get_compliance(user_id: str, days: int = 30) -> Dict:
        end = date.today()
        start = end - timedelta(days=days)
        logs = await ComplianceRepository.get_range(user_id, start, end)
        if not logs:
            return {"message": "No compliance data available", "adherence_pct": 100.0, "streak_days": 0}
        total_taken = sum(l.get("total_taken", 0) for l in logs)
        total_sched = sum(l.get("total_scheduled", 0) for l in logs)
        adherence = (total_taken / total_sched * 100) if total_sched > 0 else 100.0
        streak = max((l.get("streak_days", 0) for l in logs), default=0)
        latest_score = logs[0].get("score", 100.0) if logs else 100.0
        grade = logs[0].get("grade", "A") if logs else "A"
        return {
            "period_days": days,
            "adherence_pct": round(adherence, 2),
            "streak_days": streak,
            "score": latest_score,
            "grade": grade,
            "daily_logs": logs,
        }
