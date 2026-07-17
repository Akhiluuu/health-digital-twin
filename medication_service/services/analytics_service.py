"""
medication_service/services/analytics_service.py
Generates daily/weekly/monthly analytics snapshots. Caches in DB.
"""
from __future__ import annotations
import json
import logging
from datetime import date, timedelta
from typing import Dict, List, Any
from uuid import uuid4

from medication_service.database.connection import get_conn, get_transaction
from medication_service.repositories.medicine_repository import ComplianceRepository

logger = logging.getLogger(__name__)


class AnalyticsService:
    @staticmethod
    async def get_weekly(user_id: str) -> Dict[str, Any]:
        end = date.today()
        start = end - timedelta(days=6)
        logs = await ComplianceRepository.get_range(user_id, start, end)

        daily = {str(l["log_date"]): {
            "adherence_pct": float(l["adherence_pct"] or 0),
            "taken": l["total_taken"],
            "missed": l["total_missed"],
            "score": float(l["score"] or 0),
        } for l in logs}

        total_taken = sum(l["total_taken"] for l in logs)
        total_sched = sum(l["total_scheduled"] for l in logs) or 1
        avg_adherence = total_taken / total_sched * 100

        return {
            "period": "weekly",
            "start": str(start),
            "end": str(end),
            "average_adherence_pct": round(avg_adherence, 2),
            "daily_breakdown": daily,
            "total_taken": total_taken,
            "total_missed": sum(l["total_missed"] for l in logs),
        }

    @staticmethod
    async def get_monthly(user_id: str) -> Dict[str, Any]:
        end = date.today()
        start = end - timedelta(days=29)
        logs = await ComplianceRepository.get_range(user_id, start, end)
        total_taken = sum(l["total_taken"] for l in logs)
        total_sched = sum(l["total_scheduled"] for l in logs) or 1
        avg_adherence = total_taken / total_sched * 100
        streak = max((l["streak_days"] for l in logs), default=0)

        return {
            "period": "monthly",
            "start": str(start),
            "end": str(end),
            "average_adherence_pct": round(avg_adherence, 2),
            "streak_days": streak,
            "total_taken": total_taken,
            "total_missed": sum(l["total_missed"] for l in logs),
            "total_skipped": sum(l["total_skipped"] for l in logs),
        }

    @staticmethod
    async def get_cost_analysis(user_id: str) -> Dict[str, Any]:
        async with get_conn() as conn:
            rows = await conn.fetch(
                """SELECT m.name, i.unit_cost_usd, i.brand_cost_usd, i.is_generic,
                i.consumption_rate, i.current_count
                FROM inventory i JOIN medicines m ON m.id = i.medicine_id
                WHERE i.user_id=$1""",
                user_id,
            )
        items = []
        total_monthly = 0.0
        total_savings = 0.0
        for r in rows:
            rate = float(r["consumption_rate"] or 1)
            cost = float(r["unit_cost_usd"] or 0)
            brand = float(r["brand_cost_usd"] or cost)
            monthly = cost * rate * 30
            savings = (brand - cost) * rate * 30 if r["is_generic"] else 0
            total_monthly += monthly
            total_savings += savings
            items.append({
                "name": r["name"],
                "monthly_cost_usd": round(monthly, 2),
                "is_generic": r["is_generic"],
                "potential_savings_usd": round(savings, 2),
            })
        return {
            "total_monthly_cost_usd": round(total_monthly, 2),
            "total_generic_savings_usd": round(total_savings, 2),
            "breakdown": items,
        }

    @staticmethod
    async def compute_and_cache(user_id: str, period: str) -> None:
        if period == "weekly":
            data = await AnalyticsService.get_weekly(user_id)
        elif period == "monthly":
            data = await AnalyticsService.get_monthly(user_id)
        else:
            return
        end = date.today()
        start = end - timedelta(days=6 if period == "weekly" else 29)
        async with get_transaction() as conn:
            await conn.execute(
                """INSERT INTO analytics_snapshots (id, user_id, period, period_start, period_end, data)
                VALUES ($1,$2,$3,$4,$5,$6)
                ON CONFLICT (user_id, period, period_start)
                DO UPDATE SET data=$6, computed_at=NOW()""",
                uuid4(), user_id, period, start, end, json.dumps(data),
            )
