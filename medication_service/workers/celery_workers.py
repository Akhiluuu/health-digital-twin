"""
medication_service/workers/celery_workers.py
Background Celery workers for dose generation, compliance calculation,
analytics caching, reminder escalation, inventory monitoring, and cleanup.
"""
from __future__ import annotations
import logging
import os
from datetime import date, timedelta
from celery import Celery
from celery.schedules import crontab

logger = logging.getLogger(__name__)

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/1")

# Use database 1 for medication service (DB 0 is used by BioGears)
celery_app = Celery(
    "medication_workers",
    broker=REDIS_URL,
    backend=REDIS_URL,
)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_routes={
        "medication_service.workers.*": {"queue": "medication"},
    },
)

# ── Periodic Schedules ────────────────────────────────────────────────────────
celery_app.conf.beat_schedule = {
    "generate-doses-daily": {
        "task": "medication_service.workers.celery_workers.generate_doses_all_users",
        "schedule": crontab(hour=0, minute=5),
    },
    "compute-compliance-daily": {
        "task": "medication_service.workers.celery_workers.compute_compliance_all_users",
        "schedule": crontab(hour=23, minute=55),
    },
    "mark-missed-doses-hourly": {
        "task": "medication_service.workers.celery_workers.mark_missed_doses_batch",
        "schedule": crontab(minute=0),
    },
    "escalate-reminders": {
        "task": "medication_service.workers.celery_workers.escalate_overdue_reminders",
        "schedule": crontab(minute="*/15"),
    },
    "check-low-inventory": {
        "task": "medication_service.workers.celery_workers.check_low_inventory_all",
        "schedule": crontab(hour=9, minute=0),
    },
    "cache-analytics-weekly": {
        "task": "medication_service.workers.celery_workers.cache_analytics",
        "schedule": crontab(hour=1, minute=0, day_of_week=1),
    },
    "cleanup-old-records": {
        "task": "medication_service.workers.celery_workers.cleanup_old_records",
        "schedule": crontab(hour=3, minute=0, day_of_week=0),
    },
}


def _run_async(coro):
    import asyncio
    from medication_service.database.connection import close_pool
    loop = asyncio.new_event_loop()
    try:
        asyncio.set_event_loop(loop)
        async def main():
            try:
                return await coro
            finally:
                await close_pool()
        return loop.run_until_complete(main())
    finally:
        loop.close()
        asyncio.set_event_loop(None)



def _get_all_user_ids():
    """Fetch distinct active user IDs from medicines table."""
    async def _fetch():
        from medication_service.database.connection import get_conn
        async with get_conn() as conn:
            rows = await conn.fetch(
                "SELECT DISTINCT user_id FROM medicines WHERE deleted_at IS NULL AND status='active'"
            )
        return [r["user_id"] for r in rows]
    return _run_async(_fetch())


@celery_app.task(name="medication_service.workers.celery_workers.generate_doses_all_users", bind=True, max_retries=3)
def generate_doses_all_users(self):
    """Generate next 14 days of doses for all active users."""
    from medication_service.services.scheduler_service import SchedulerService
    user_ids = _get_all_user_ids()
    total = 0
    for uid in user_ids:
        try:
            count = _run_async(SchedulerService.generate_doses_for_user(uid, days_ahead=14))
            total += count
        except Exception as e:
            logger.warning(f"Dose generation failed for {uid}: {e}")
    logger.info(f"[Worker] Generated {total} doses for {len(user_ids)} users")
    return {"generated": total, "users": len(user_ids)}


@celery_app.task(name="medication_service.workers.celery_workers.compute_compliance_all_users", bind=True)
def compute_compliance_all_users(self):
    """Compute & store compliance for today for all users."""
    from medication_service.repositories.medicine_repository import ComplianceRepository
    user_ids = _get_all_user_ids()
    today = date.today()
    for uid in user_ids:
        try:
            _run_async(ComplianceRepository.compute_and_store(uid, today))
        except Exception as e:
            logger.warning(f"Compliance compute failed for {uid}: {e}")
    return {"computed": len(user_ids)}


@celery_app.task(name="medication_service.workers.celery_workers.mark_missed_doses_batch", bind=True)
def mark_missed_doses_batch(self):
    """Mark overdue pending doses as missed."""
    from medication_service.services.scheduler_service import SchedulerService
    user_ids = _get_all_user_ids()
    total_missed = 0
    for uid in user_ids:
        try:
            count = _run_async(SchedulerService.mark_missed_overdue(uid))
            total_missed += count
        except Exception as e:
            logger.warning(f"Mark missed failed for {uid}: {e}")
    return {"total_marked_missed": total_missed}


@celery_app.task(name="medication_service.workers.celery_workers.escalate_overdue_reminders", bind=True)
def escalate_overdue_reminders(self):
    """Escalate overdue reminders to caregivers."""
    from medication_service.services.reminder_service import ReminderService
    user_ids = _get_all_user_ids()
    total_escalated = 0
    for uid in user_ids:
        try:
            escalated = _run_async(ReminderService.escalate_overdue(uid))
            total_escalated += len(escalated)
        except Exception as e:
            logger.warning(f"Escalation failed for {uid}: {e}")
    return {"escalated": total_escalated}


@celery_app.task(name="medication_service.workers.celery_workers.check_low_inventory_all", bind=True)
def check_low_inventory_all(self):
    """Send alerts for medicines with low stock."""
    async def _check():
        from medication_service.database.connection import get_conn
        from uuid import uuid4
        async with get_conn() as conn:
            rows = await conn.fetch(
                """SELECT i.user_id, i.medicine_id, i.current_count, i.reorder_threshold, m.name
                FROM inventory i JOIN medicines m ON m.id=i.medicine_id
                WHERE i.current_count <= i.reorder_threshold AND m.deleted_at IS NULL"""
            )
            for r in rows:
                await conn.execute(
                    """INSERT INTO notification_log (id, user_id, channel, title, body, status)
                    VALUES ($1,$2,'push','Low Medication Stock',$3,'sent')""",
                    uuid4(), r["user_id"],
                    f"{r['name']} has only {r['current_count']} units remaining. Please refill soon.",
                )
        return len(rows)
    count = _run_async(_check())
    return {"low_stock_alerts_sent": count}


@celery_app.task(name="medication_service.workers.celery_workers.cache_analytics", bind=True)
def cache_analytics(self):
    from medication_service.services.analytics_service import AnalyticsService
    user_ids = _get_all_user_ids()
    for uid in user_ids:
        try:
            _run_async(AnalyticsService.compute_and_cache(uid, "weekly"))
            _run_async(AnalyticsService.compute_and_cache(uid, "monthly"))
        except Exception as e:
            logger.warning(f"Analytics cache failed for {uid}: {e}")
    return {"cached": len(user_ids)}


@celery_app.task(name="medication_service.workers.celery_workers.cleanup_old_records", bind=True)
def cleanup_old_records(self):
    """Hard-delete soft-deleted medicines older than 90 days."""
    async def _cleanup():
        from medication_service.database.connection import get_conn
        async with get_conn() as conn:
            result = await conn.execute(
                "DELETE FROM medicines WHERE deleted_at < NOW() - INTERVAL '90 days'"
            )
            return int(result.split()[-1]) if result else 0
    count = _run_async(_cleanup())
    logger.info(f"[Cleanup] Hard-deleted {count} expired medicine records")
    return {"deleted": count}


# ── On-demand tasks ────────────────────────────────────────────────────────────

@celery_app.task(name="medication_service.workers.celery_workers.trigger_biogears_sim_task", bind=True, max_retries=2)
def trigger_biogears_sim_task(self, user_id: str, medicine_id: str, dose_id: str,
                               medicine_name: str, dose_quantity: str):
    from medication_service.services.biogears_sync_service import BiogearsSyncService
    from uuid import UUID
    try:
        sim_id = _run_async(BiogearsSyncService.trigger_dose_simulation(
            user_id, UUID(medicine_id), UUID(dose_id), medicine_name, dose_quantity
        ))
        return {"sim_id": sim_id}
    except Exception as exc:
        raise self.retry(exc=exc, countdown=30)
