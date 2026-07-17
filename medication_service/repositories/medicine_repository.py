"""
medication_service/repositories/medicine_repository.py
Full CRUD repository for medicines, doses, and history using asyncpg.
All writes are audited. Soft-delete pattern throughout.
"""
from __future__ import annotations
import json
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID, uuid4

from medication_service.database.connection import get_conn, get_transaction

logger = logging.getLogger(__name__)


class MedicineRepository:
    # ── CREATE ────────────────────────────────────────────────────────────────

    @staticmethod
    async def create(user_id: str, data: Dict[str, Any], actor: str = "system") -> Dict[str, Any]:
        async with get_transaction() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO medicines (
                    id, user_id, name, brand_name, generic_name, strength,
                    dosage_form, dose_quantity, dose_unit, frequency, rrule,
                    scheduled_time, meal_relation, start_date, end_date, is_ongoing,
                    status, priority, doctor_id, doctor_name, hospital, purpose,
                    side_effects, warnings, storage_conditions, color, shape,
                    disease_linked, biogears_linked, reminder_enabled,
                    inventory_count, refill_count, barcode, custom_metadata,
                    created_by, modified_by
                ) VALUES (
                    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
                    'active',$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,
                    $29,$30,$31,$32,$33,$34,$34
                ) RETURNING *
                """,
                uuid4(), user_id,
                data["name"], data.get("brand_name"), data.get("generic_name"),
                data.get("strength"), data.get("dosage_form", "tablet"),
                data["dose_quantity"], data.get("dose_unit", "tablet"),
                data.get("frequency", "daily"), data.get("rrule"),
                data.get("scheduled_time"),
                data.get("meal_relation", "after"),
                data.get("start_date", date.today()), data.get("end_date"),
                data.get("is_ongoing", True),
                data.get("priority", "important"),
                data.get("doctor_id"), data.get("doctor_name"),
                data.get("hospital"), data.get("purpose"),
                data.get("side_effects"), data.get("warnings"),
                data.get("storage_conditions"), data.get("color"),
                data.get("shape"), data.get("disease_linked"),
                data.get("biogears_linked", False),
                data.get("reminder_enabled", True),
                data.get("inventory_count", 30),
                data.get("refill_count", 3),
                data.get("barcode"),
                json.dumps(data.get("custom_metadata", {})),
                actor,
            )
            medicine = dict(row)
            # Create initial inventory record
            await conn.execute(
                """
                INSERT INTO inventory (id, medicine_id, user_id, current_count, unit,
                    reorder_threshold, refill_count)
                VALUES ($1,$2,$3,$4,'tablet', $5, $6)
                ON CONFLICT (medicine_id) DO NOTHING
                """,
                uuid4(), medicine["id"], user_id,
                data.get("inventory_count", 30),
                data.get("low_stock_threshold", 5),
                data.get("refill_count", 3),
            )
            # Audit
            await conn.execute(
                """INSERT INTO medication_audit_trail
                (user_id, actor_id, action, resource_type, resource_id, new_value)
                VALUES ($1,$2,'CREATE','medicine',$3,$4)""",
                user_id, actor, medicine["id"], json.dumps(data),
            )
            return medicine

    # ── LIST ──────────────────────────────────────────────────────────────────

    @staticmethod
    async def list_by_user(
        user_id: str,
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
        search: Optional[str] = None,
    ) -> Tuple[List[Dict], int]:
        conditions = ["user_id = $1", "deleted_at IS NULL"]
        params: List[Any] = [user_id]
        i = 2
        if status:
            conditions.append(f"status = ${i}"); params.append(status); i += 1
        if search:
            conditions.append(f"(LOWER(name) LIKE ${i} OR LOWER(brand_name) LIKE ${i})")
            params.append(f"%{search.lower()}%"); i += 1

        where = " AND ".join(conditions)
        offset = (page - 1) * page_size

        async with get_conn() as conn:
            total = await conn.fetchval(f"SELECT COUNT(*) FROM medicines WHERE {where}", *params)
            rows = await conn.fetch(
                f"SELECT * FROM medicines WHERE {where} ORDER BY created_at DESC LIMIT {page_size} OFFSET {offset}",
                *params,
            )
        return [dict(r) for r in rows], total

    # ── GET BY ID ─────────────────────────────────────────────────────────────

    @staticmethod
    async def get_by_id(medicine_id: UUID, user_id: str) -> Optional[Dict]:
        async with get_conn() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM medicines WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL",
                medicine_id, user_id,
            )
        return dict(row) if row else None

    # ── UPDATE ────────────────────────────────────────────────────────────────

    @staticmethod
    async def update(medicine_id: UUID, user_id: str, data: Dict[str, Any], actor: str = "system") -> Optional[Dict]:
        fields = []
        params: List[Any] = []
        i = 1
        allowed = {
            "name", "brand_name", "strength", "dosage_form", "dose_quantity",
            "frequency", "scheduled_time", "meal_relation", "end_date", "is_ongoing",
            "status", "priority", "purpose", "biogears_linked", "reminder_enabled",
            "custom_metadata", "doctor_name", "hospital", "warnings", "side_effects",
            "storage_conditions", "color", "shape", "disease_linked",
        }
        for k, v in data.items():
            if k in allowed and v is not None:
                fields.append(f"{k} = ${i}")
                params.append(json.dumps(v) if isinstance(v, dict) else v)
                i += 1
        if not fields:
            return None

        params.extend([medicine_id, user_id])
        async with get_transaction() as conn:
            row = await conn.fetchrow(
                f"UPDATE medicines SET {', '.join(fields)}, modified_by=${i} WHERE id=${i+1} AND user_id=${i+2} AND deleted_at IS NULL RETURNING *",
                *params, actor,
            )
            if row:
                await conn.execute(
                    "INSERT INTO medication_audit_trail (user_id, actor_id, action, resource_type, resource_id, new_value) VALUES ($1,$2,'UPDATE','medicine',$3,$4)",
                    user_id, actor, medicine_id, json.dumps(data),
                )
        return dict(row) if row else None

    # ── SOFT DELETE ───────────────────────────────────────────────────────────

    @staticmethod
    async def soft_delete(medicine_id: UUID, user_id: str, actor: str = "system") -> bool:
        async with get_transaction() as conn:
            result = await conn.execute(
                "UPDATE medicines SET deleted_at=NOW(), status='discontinued', modified_by=$3 WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL",
                medicine_id, user_id, actor,
            )
            deleted = result == "UPDATE 1"
            if deleted:
                await conn.execute(
                    "INSERT INTO medication_audit_trail (user_id, actor_id, action, resource_type, resource_id) VALUES ($1,$2,'DELETE','medicine',$3)",
                    user_id, actor, medicine_id,
                )
        return deleted

    # ── STATUS CHANGE ─────────────────────────────────────────────────────────

    @staticmethod
    async def update_status(medicine_id: UUID, user_id: str, status: str, actor: str = "system") -> Optional[Dict]:
        async with get_transaction() as conn:
            row = await conn.fetchrow(
                "UPDATE medicines SET status=$3, modified_by=$4 WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL RETURNING *",
                medicine_id, user_id, status, actor,
            )
            if row:
                await conn.execute(
                    "INSERT INTO medication_audit_trail (user_id, actor_id, action, resource_type, resource_id, new_value) VALUES ($1,$2,$3,'medicine',$4,$5)",
                    user_id, actor, f"STATUS_{status.upper()}", medicine_id, json.dumps({"status": status}),
                )
        return dict(row) if row else None


class DoseRepository:
    # ── GENERATE DOSES ────────────────────────────────────────────────────────

    @staticmethod
    async def generate_for_medicine(medicine: Dict, days_ahead: int = 7) -> List[Dict]:
        """Generate future dose records for a medicine based on its frequency."""
        medicine_id = medicine["id"]
        user_id = medicine["user_id"]
        frequency = medicine.get("frequency", "daily")
        scheduled_time_str = medicine.get("scheduled_time") or "08:00"

        try:
            h, m = map(int, str(scheduled_time_str)[:5].split(":"))
        except Exception:
            h, m = 8, 0

        today = date.today()
        start = max(today, medicine.get("start_date", today))
        end_date = medicine.get("end_date")
        doses_created = []

        if frequency == "once":
            target_dates = [start]
        elif frequency == "daily":
            target_dates = [start + timedelta(days=i) for i in range(days_ahead)]
        elif frequency == "twice_daily":
            base = [start + timedelta(days=i) for i in range(days_ahead)]
            target_dates = base  # handled below with dual-time
        elif frequency == "weekly":
            target_dates = [start + timedelta(weeks=i) for i in range(days_ahead // 7 + 1)]
        else:
            target_dates = [start + timedelta(days=i) for i in range(days_ahead)]

        if end_date:
            target_dates = [d for d in target_dates if d <= end_date]

        async with get_conn() as conn:
            for d in target_dates:
                scheduled_at = datetime(d.year, d.month, d.day, h, m, tzinfo=timezone.utc)
                if frequency == "twice_daily":
                    times = [scheduled_at, scheduled_at.replace(hour=20)]
                else:
                    times = [scheduled_at]

                for ts in times:
                    # Avoid duplicates
                    exists = await conn.fetchval(
                        "SELECT id FROM medication_doses WHERE medicine_id=$1 AND scheduled_at=$2",
                        medicine_id, ts,
                    )
                    if not exists:
                        row = await conn.fetchrow(
                            """INSERT INTO medication_doses (id, medicine_id, user_id, scheduled_at, status)
                            VALUES ($1,$2,$3,$4,'pending') RETURNING *""",
                            uuid4(), medicine_id, user_id, ts,
                        )
                        doses_created.append(dict(row))
        return doses_created

    # ── LOG DOSE ──────────────────────────────────────────────────────────────

    @staticmethod
    async def log_dose(
        user_id: str,
        medicine_id: UUID,
        status: str,
        taken_at: Optional[datetime] = None,
        skip_reason: Optional[str] = None,
        notes: Optional[str] = None,
        delay_minutes: Optional[int] = None,
        actor: str = "user",
    ) -> Dict:
        now = datetime.now(timezone.utc)
        ta = taken_at or now

        async with get_transaction() as conn:
            # Find or create the pending dose
            dose = await conn.fetchrow(
                """SELECT * FROM medication_doses
                WHERE medicine_id=$1 AND user_id=$2 AND status='pending'
                ORDER BY ABS(EXTRACT(EPOCH FROM (scheduled_at - $3))) ASC
                LIMIT 1""",
                medicine_id, user_id, ta,
            )

            if dose:
                sched = dose["scheduled_at"]
                sched_tz = sched if sched.tzinfo else sched.replace(tzinfo=timezone.utc)
                delay = int((ta - sched_tz).total_seconds() / 60) if ta > sched_tz else 0
                row = await conn.fetchrow(
                    """UPDATE medication_doses SET status=$3, taken_at=$4, skip_reason=$5,
                    notes=$6, delay_minutes=$7, logged_by=$8, updated_at=NOW()
                    WHERE id=$1 AND user_id=$2 RETURNING *""",
                    dose["id"], user_id, status, ta, skip_reason, notes, delay, actor,
                )
            else:
                row = await conn.fetchrow(
                    """INSERT INTO medication_doses (id, medicine_id, user_id, scheduled_at, taken_at,
                    status, skip_reason, notes, delay_minutes, logged_by)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *""",
                    uuid4(), medicine_id, user_id, ta, ta,
                    status, skip_reason, notes, delay_minutes or 0, actor,
                )

            result = dict(row)
            # Append to history
            med = await conn.fetchrow("SELECT name, dose_quantity FROM medicines WHERE id=$1", medicine_id)
            if med:
                await conn.execute(
                    """INSERT INTO medication_history
                    (id, medicine_id, user_id, medicine_name, dose, status, event_at, reason, logged_by)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)""",
                    uuid4(), medicine_id, user_id, med["name"], med["dose_quantity"],
                    status, ta, skip_reason, actor,
                )
        return result

    # ── TODAY'S DOSES ─────────────────────────────────────────────────────────

    @staticmethod
    async def get_today(user_id: str) -> List[Dict]:
        today = date.today()
        start = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc)
        end = start + timedelta(days=1)
        async with get_conn() as conn:
            rows = await conn.fetch(
                """SELECT d.*, m.name, m.dose_quantity, m.dosage_form, m.priority, m.meal_relation
                FROM medication_doses d
                JOIN medicines m ON m.id = d.medicine_id
                WHERE d.user_id=$1 AND d.scheduled_at >= $2 AND d.scheduled_at < $3
                AND m.deleted_at IS NULL AND m.status='active'
                ORDER BY d.scheduled_at ASC""",
                user_id, start, end,
            )
        return [dict(r) for r in rows]

    # ── HISTORY ───────────────────────────────────────────────────────────────

    @staticmethod
    async def get_history(
        user_id: str,
        page: int = 1,
        page_size: int = 50,
        status_filter: Optional[str] = None,
    ) -> Tuple[List[Dict], int]:
        conditions = ["user_id = $1"]
        params: List[Any] = [user_id]
        i = 2
        if status_filter:
            conditions.append(f"status = ${i}"); params.append(status_filter); i += 1
        where = " AND ".join(conditions)
        offset = (page - 1) * page_size

        async with get_conn() as conn:
            total = await conn.fetchval(f"SELECT COUNT(*) FROM medication_history WHERE {where}", *params)
            rows = await conn.fetch(
                f"SELECT * FROM medication_history WHERE {where} ORDER BY event_at DESC LIMIT {page_size} OFFSET {offset}",
                *params,
            )
        return [dict(r) for r in rows], total


class InventoryRepository:
    @staticmethod
    async def get_by_medicine(medicine_id: UUID, user_id: str) -> Optional[Dict]:
        async with get_conn() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM inventory WHERE medicine_id=$1 AND user_id=$2",
                medicine_id, user_id,
            )
        if not row:
            return None
        rec = dict(row)
        rec["is_low"] = rec["current_count"] <= rec["reorder_threshold"]
        if rec.get("consumption_rate") and rec["consumption_rate"] > 0:
            rec["days_remaining"] = int(rec["current_count"] / rec["consumption_rate"])
        return rec

    @staticmethod
    async def get_all_by_user(user_id: str) -> List[Dict]:
        async with get_conn() as conn:
            rows = await conn.fetch(
                """SELECT i.*, m.name, m.strength FROM inventory i
                JOIN medicines m ON m.id = i.medicine_id
                WHERE i.user_id=$1 AND m.deleted_at IS NULL""",
                user_id,
            )
        results = []
        for r in rows:
            rec = dict(r)
            rec["is_low"] = rec["current_count"] <= rec["reorder_threshold"]
            results.append(rec)
        return results

    @staticmethod
    async def update(medicine_id: UUID, user_id: str, updates: Dict[str, Any]) -> Optional[Dict]:
        fields = []
        params: List[Any] = []
        i = 1
        allowed = {
            "current_count", "batch_number", "expiry_date", "storage_location",
            "reorder_threshold", "unit_cost_usd", "pharmacy_name", "pharmacy_phone",
            "refill_count", "is_generic", "brand_cost_usd",
        }
        for k, v in updates.items():
            if k in allowed and v is not None:
                fields.append(f"{k}=${i}"); params.append(v); i += 1
        if not fields:
            return None

        params.extend([medicine_id, user_id])
        async with get_conn() as conn:
            row = await conn.fetchrow(
                f"UPDATE inventory SET {', '.join(fields)}, updated_at=NOW() WHERE medicine_id=${i} AND user_id=${i+1} RETURNING *",
                *params,
            )
        return dict(row) if row else None

    @staticmethod
    async def increment(medicine_id: UUID, user_id: str, amount: int, actor: str = "user") -> Optional[Dict]:
        async with get_transaction() as conn:
            row = await conn.fetchrow(
                """UPDATE inventory SET current_count=current_count+$3,
                last_refill_at=NOW(), updated_at=NOW()
                WHERE medicine_id=$1 AND user_id=$2 RETURNING *""",
                medicine_id, user_id, amount,
            )
            if row:
                med = await conn.fetchrow("SELECT user_id FROM medicines WHERE id=$1", medicine_id)
                if med:
                    await conn.execute(
                        "INSERT INTO refill_requests (id, inventory_id, medicine_id, user_id, quantity, status, fulfilled_at) VALUES ($1,$2,$3,$4,$5,'fulfilled',NOW())",
                        uuid4(), row["id"], medicine_id, user_id, amount,
                    )
        return dict(row) if row else None


class ComplianceRepository:
    @staticmethod
    async def compute_and_store(user_id: str, target_date: date) -> Dict:
        async with get_transaction() as conn:
            start = datetime.combine(target_date, datetime.min.time()).replace(tzinfo=timezone.utc)
            end = start + timedelta(days=1)
            rows = await conn.fetch(
                """SELECT status FROM medication_doses
                WHERE user_id=$1 AND scheduled_at >= $2 AND scheduled_at < $3""",
                user_id, start, end,
            )
            total = len(rows)
            taken = sum(1 for r in rows if r["status"] == "taken")
            missed = sum(1 for r in rows if r["status"] == "missed")
            skipped = sum(1 for r in rows if r["status"] == "skipped")
            late = sum(1 for r in rows if r["status"] == "late")
            adherence = (taken / total * 100) if total > 0 else 100.0

            # Streak calculation
            streak = 0
            check_date = target_date - timedelta(days=1)
            for _ in range(365):
                prev_start = datetime.combine(check_date, datetime.min.time()).replace(tzinfo=timezone.utc)
                prev_end = prev_start + timedelta(days=1)
                prev_rows = await conn.fetch(
                    "SELECT status FROM medication_doses WHERE user_id=$1 AND scheduled_at >= $2 AND scheduled_at < $3",
                    user_id, prev_start, prev_end,
                )
                if not prev_rows:
                    break
                prev_adherence = sum(1 for r in prev_rows if r["status"] in ("taken", "late")) / len(prev_rows) * 100
                if prev_adherence >= 80:
                    streak += 1
                    check_date -= timedelta(days=1)
                else:
                    break

            score = min(100.0, adherence * 0.7 + (10 if streak >= 7 else 0) + (20 if adherence == 100 else 0))
            grade = "A+" if score >= 95 else "A" if score >= 90 else "B" if score >= 80 else "C" if score >= 70 else "D"

            await conn.execute(
                """INSERT INTO compliance_logs
                (id, user_id, log_date, total_scheduled, total_taken, total_missed,
                total_skipped, total_late, adherence_pct, streak_days, score, grade)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                ON CONFLICT (user_id, log_date) DO UPDATE SET
                total_scheduled=$4, total_taken=$5, total_missed=$6,
                total_skipped=$7, total_late=$8, adherence_pct=$9,
                streak_days=$10, score=$11, grade=$12, computed_at=NOW()""",
                uuid4(), user_id, target_date,
                total, taken, missed, skipped, late,
                adherence, streak, score, grade,
            )
        return {
            "log_date": target_date,
            "total_scheduled": total,
            "total_taken": taken,
            "total_missed": missed,
            "total_skipped": skipped,
            "total_late": late,
            "adherence_pct": adherence,
            "streak_days": streak,
            "score": score,
            "grade": grade,
        }

    @staticmethod
    async def get_range(user_id: str, start: date, end: date) -> List[Dict]:
        async with get_conn() as conn:
            rows = await conn.fetch(
                "SELECT * FROM compliance_logs WHERE user_id=$1 AND log_date >= $2 AND log_date <= $3 ORDER BY log_date DESC",
                user_id, start, end,
            )
        return [dict(r) for r in rows]


class InteractionRepository:
    @staticmethod
    async def check_interactions(medicine_names: List[str]) -> List[Dict]:
        """Check interactions between a list of drug names."""
        async with get_conn() as conn:
            results = []
            for i, drug_a in enumerate(medicine_names):
                for drug_b in medicine_names[i+1:]:
                    rows = await conn.fetch(
                        """SELECT * FROM drug_interactions
                        WHERE (LOWER(drug_a_name) LIKE $1 AND LOWER(drug_b_name) LIKE $2)
                           OR (LOWER(drug_a_name) LIKE $2 AND LOWER(drug_b_name) LIKE $1)""",
                        f"%{drug_a.lower()}%", f"%{drug_b.lower()}%",
                    )
                    results.extend([dict(r) for r in rows])
        return results

    @staticmethod
    async def get_food_interactions(drug_name: str) -> List[Dict]:
        async with get_conn() as conn:
            rows = await conn.fetch(
                "SELECT * FROM food_interactions WHERE LOWER(drug_name) LIKE $1",
                f"%{drug_name.lower()}%",
            )
        return [dict(r) for r in rows]
