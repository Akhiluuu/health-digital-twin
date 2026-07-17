"""
medication_service/services/reminder_service.py
Reminder creation, escalation pipeline, snooze, caregiver notifications.
"""
from __future__ import annotations
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional
from uuid import UUID, uuid4

from medication_service.database.connection import get_conn, get_transaction

logger = logging.getLogger(__name__)


class ReminderService:
    @staticmethod
    async def create_reminder(
        user_id: str, medicine_id: UUID, dose_id: UUID,
        scheduled_at: datetime, payload: Dict
    ) -> Dict:
        async with get_conn() as conn:
            row = await conn.fetchrow(
                """INSERT INTO reminders
                (id, medicine_id, user_id, scheduled_at, dose_id, channel, status, payload)
                VALUES ($1,$2,$3,$4,$5,'push','pending',$6) RETURNING *""",
                uuid4(), medicine_id, user_id, scheduled_at, dose_id,
                __import__("json").dumps(payload),
            )
        return dict(row)

    @staticmethod
    async def acknowledge(reminder_id: UUID, user_id: str) -> Dict:
        async with get_conn() as conn:
            row = await conn.fetchrow(
                """UPDATE reminders SET status='acknowledged', acknowledged_at=NOW()
                WHERE id=$1 AND user_id=$2 RETURNING *""",
                reminder_id, user_id,
            )
        return dict(row) if row else {}

    @staticmethod
    async def snooze(reminder_id: UUID, user_id: str, snooze_minutes: int) -> Dict:
        until = datetime.now(timezone.utc) + timedelta(minutes=snooze_minutes)
        async with get_conn() as conn:
            row = await conn.fetchrow(
                """UPDATE reminders SET status='snoozed', snoozed_until=$3,
                snooze_count=snooze_count+1, updated_at=NOW()
                WHERE id=$1 AND user_id=$2 RETURNING *""",
                reminder_id, user_id, until,
            )
        return dict(row) if row else {}

    @staticmethod
    async def get_pending(user_id: str) -> List[Dict]:
        now = datetime.now(timezone.utc)
        async with get_conn() as conn:
            rows = await conn.fetch(
                """SELECT r.*, m.name as medicine_name, m.dose_quantity
                FROM reminders r JOIN medicines m ON m.id = r.medicine_id
                WHERE r.user_id=$1 AND r.status='pending'
                AND r.scheduled_at <= $2
                ORDER BY r.scheduled_at ASC LIMIT 50""",
                user_id, now,
            )
        return [dict(r) for r in rows]

    @staticmethod
    async def escalate_overdue(user_id: str, delay_minutes: int = 30) -> List[Dict]:
        """Find pending reminders past escalation threshold, notify caregivers."""
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=delay_minutes)
        async with get_transaction() as conn:
            rows = await conn.fetch(
                """SELECT r.* FROM reminders r WHERE r.user_id=$1
                AND r.status='pending' AND r.scheduled_at < $2
                AND r.escalated=FALSE""",
                user_id, cutoff,
            )
            escalated = []
            for r in rows:
                await conn.execute(
                    "UPDATE reminders SET escalated=TRUE, escalated_at=NOW() WHERE id=$1",
                    r["id"],
                )
                # Get caregivers
                caregivers = await conn.fetch(
                    "SELECT * FROM family_caregivers WHERE owner_user_id=$1 AND active=TRUE AND permission != 'read_only'",
                    user_id,
                )
                for cg in caregivers:
                    await conn.execute(
                        """INSERT INTO notification_log
                        (id, user_id, reminder_id, channel, title, body, status)
                        VALUES ($1,$2,$3,'push','Medication Overdue',$4,'sent')""",
                        uuid4(), cg["caregiver_user_id"], r["id"],
                        f"Patient has not taken their scheduled medication (missed reminder from {r['scheduled_at']}).",
                    )
                    await conn.execute(
                        "UPDATE reminders SET caregiver_notified=TRUE WHERE id=$1",
                        r["id"],
                    )
                escalated.append(dict(r))
        return escalated

    @staticmethod
    async def bulk_create_for_schedule(user_id: str, doses: List[Dict]) -> int:
        """Create reminders for a list of upcoming dose records."""
        count = 0
        for dose in doses:
            if not dose.get("reminder_enabled", True):
                continue
            try:
                med_id = dose["medicine_id"] if isinstance(dose["medicine_id"], UUID) else UUID(str(dose["medicine_id"]))
                dose_id = dose["id"] if isinstance(dose["id"], UUID) else UUID(str(dose["id"]))
                sched = dose["scheduled_at"]
                if isinstance(sched, str):
                    sched = datetime.fromisoformat(sched)
                await ReminderService.create_reminder(
                    user_id, med_id, dose_id, sched,
                    {"medicine_name": dose.get("name", ""), "dose": dose.get("dose_quantity", "")},
                )
                count += 1
            except Exception as e:
                logger.warning(f"Reminder creation failed for dose {dose.get('id')}: {e}")
        return count
