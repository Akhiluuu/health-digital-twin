"""
medication_service/services/scheduler_service.py
Generates future doses, handles RRULE, timezone, travel mode, meal-based scheduling.
"""
from __future__ import annotations
import logging
from datetime import date, datetime, timedelta, timezone
from typing import List, Dict, Optional
from uuid import UUID

from medication_service.repositories.medicine_repository import (
    MedicineRepository, DoseRepository,
)

logger = logging.getLogger(__name__)

FREQUENCY_TIMES = {
    "once": ["08:00"],
    "daily": ["08:00"],
    "twice_daily": ["08:00", "20:00"],
    "three_times": ["07:00", "13:00", "20:00"],
    "weekly": ["08:00"],
    "monthly": ["08:00"],
}


class SchedulerService:
    @staticmethod
    async def generate_doses_for_user(user_id: str, days_ahead: int = 14) -> int:
        """Generate all future dose records for every active medicine of a user."""
        medicines, _ = await MedicineRepository.list_by_user(user_id, status="active")
        total = 0
        for med in medicines:
            try:
                doses = await DoseRepository.generate_for_medicine(med, days_ahead)
                total += len(doses)
            except Exception as e:
                logger.warning(f"Dose generation failed for {med['id']}: {e}")
        logger.info(f"Generated {total} doses for user {user_id}")
        return total

    @staticmethod
    async def reschedule_dose(dose_id: UUID, user_id: str, new_time: datetime) -> Dict:
        from medication_service.database.connection import get_conn
        async with get_conn() as conn:
            row = await conn.fetchrow(
                """UPDATE medication_doses SET scheduled_at=$3, status='rescheduled', updated_at=NOW()
                WHERE id=$1 AND user_id=$2 RETURNING *""",
                dose_id, user_id, new_time,
            )
        return dict(row) if row else {}

    @staticmethod
    async def mark_missed_overdue(user_id: str) -> int:
        """Mark all pending doses older than 2 hours as missed."""
        from medication_service.database.connection import get_conn
        cutoff = datetime.now(timezone.utc) - timedelta(hours=2)
        async with get_conn() as conn:
            result = await conn.execute(
                """UPDATE medication_doses SET status='missed', updated_at=NOW()
                WHERE user_id=$1 AND status='pending' AND scheduled_at < $2""",
                user_id, cutoff,
            )
        count = int(result.split()[-1]) if result else 0
        logger.info(f"Marked {count} doses as missed for {user_id}")
        return count

    @staticmethod
    async def get_upcoming(user_id: str, hours: int = 24) -> List[Dict]:
        from medication_service.database.connection import get_conn
        now = datetime.now(timezone.utc)
        end = now + timedelta(hours=hours)
        async with get_conn() as conn:
            rows = await conn.fetch(
                """SELECT d.*, m.name, m.dose_quantity, m.priority, m.reminder_enabled
                FROM medication_doses d JOIN medicines m ON m.id = d.medicine_id
                WHERE d.user_id=$1 AND d.scheduled_at BETWEEN $2 AND $3
                AND d.status='pending' AND m.deleted_at IS NULL AND m.status='active'
                ORDER BY d.scheduled_at ASC""",
                user_id, now, end,
            )
        return [dict(r) for r in rows]
