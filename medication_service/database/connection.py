"""
medication_service/database/connection.py
Async PostgreSQL connection pool using asyncpg.
Falls back to in-memory store when PostgreSQL is unreachable.
"""
import os
import logging
from uuid import uuid4
from datetime import datetime, timezone
from typing import AsyncGenerator, Dict, List, Any
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)

_pool = None
_IS_MEMORY_MODE = False

class InMemoryRecord(dict):
    def __getitem__(self, item):
        if item not in self:
            if item == "current_count": return 30
            if item == "reorder_threshold": return 5
            if item == "total_doses": return 0
            if item == "taken_doses": return 0
            if item == "missed_doses": return 0
            if item == "compliance_pct": return 100.0
            if item == "trend": return "stable"
            if item == "streak_days": return 0
            if item == "total_cost": return 0.0
            if item == "estimated_monthly_cost": return 0.0
            return None
        return super().get(item)

    def get(self, item, default=None):
        val = self.__getitem__(item)
        return val if val is not None else default

class InMemoryConn:
    _tables: Dict[str, List[Dict[str, Any]]] = {}

    def __init__(self):
        if not InMemoryConn._tables:
            InMemoryConn._tables = {
                "medicines": [],
                "dose_logs": [],
                "schedules": [],
                "inventory": [],
                "prescriptions": [],
                "reminders": [],
                "settings": [],
                "caregivers": [],
                "audit": [],
                "achievements": [],
                "biogears_medication_simulations": [],
            }

    async def fetch(self, query: str, *args):
        low = query.lower()
        table_name = "medicines"
        for t in InMemoryConn._tables.keys():
            if t in low:
                table_name = t
                break
        rows = InMemoryConn._tables.get(table_name, [])
        if args:
            uid = str(args[0])
            filtered = [r for r in rows if r.get("user_id") == uid or str(r.get("id")) == uid]
            return [InMemoryRecord(r) for r in filtered]
        return [InMemoryRecord(r) for r in rows]

    async def fetchrow(self, query: str, *args):
        low = query.lower()
        if "insert into medicines" in low and len(args) >= 3:
            rec = {
                "id": str(args[0]),
                "user_id": str(args[1]),
                "name": str(args[2]),
                "brand_name": args[3] if len(args) > 3 else None,
                "generic_name": args[4] if len(args) > 4 else None,
                "strength": args[5] if len(args) > 5 else None,
                "dosage_form": args[6] if len(args) > 6 else "tablet",
                "dose_quantity": args[7] if len(args) > 7 else 1.0,
                "dose_unit": args[8] if len(args) > 8 else "tablet",
                "frequency": args[9] if len(args) > 9 else "daily",
                "rrule": args[10] if len(args) > 10 else None,
                "scheduled_time": args[11] if len(args) > 11 else None,
                "meal_relation": args[12] if len(args) > 12 else None,
                "start_date": args[13] if len(args) > 13 else None,
                "end_date": args[14] if len(args) > 14 else None,
                "is_ongoing": args[15] if len(args) > 15 else True,
                "status": "active",
                "priority": args[16] if len(args) > 16 else "medium",
                "doctor_id": args[17] if len(args) > 17 else None,
                "doctor_name": args[18] if len(args) > 18 else None,
                "hospital": args[19] if len(args) > 19 else None,
                "purpose": args[20] if len(args) > 20 else None,
                "side_effects": args[21] if len(args) > 21 else None,
                "warnings": args[22] if len(args) > 22 else None,
                "storage_conditions": args[23] if len(args) > 23 else None,
                "color": args[24] if len(args) > 24 else None,
                "shape": args[25] if len(args) > 25 else None,
                "disease_linked": args[26] if len(args) > 26 else None,
                "biogears_linked": args[27] if len(args) > 27 else False,
                "reminder_enabled": args[28] if len(args) > 28 else True,
                "inventory_count": args[29] if len(args) > 29 else 30,
                "refill_count": args[30] if len(args) > 30 else 0,
                "barcode": args[31] if len(args) > 31 else None,
                "custom_metadata": args[32] if len(args) > 32 else None,
                "created_by": args[33] if len(args) > 33 else "system",
                "modified_by": args[33] if len(args) > 33 else "system",
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
            }
            InMemoryConn._tables["medicines"].append(rec)
            return InMemoryRecord(rec)

        rows = await self.fetch(query, *args)
        return rows[0] if rows else None

    async def fetchval(self, query: str, *args):
        row = await self.fetchrow(query, *args)
        if row:
            for v in row.values():
                if isinstance(v, (int, float)):
                    return v
            return 1
        return 0

    async def execute(self, query: str, *args):
        low = query.lower()
        table_name = "medicines"
        for t in InMemoryConn._tables.keys():
            if t in low:
                table_name = t
                break
        if "insert" in low:
            rec = {"id": str(args[0]) if args else str(uuid4()), "created_at": datetime.now(timezone.utc)}
            if len(args) > 1:
                rec["user_id"] = str(args[1])
            InMemoryConn._tables.setdefault(table_name, []).append(rec)
        return "OK"

    @asynccontextmanager
    async def transaction(self):
        yield self


async def get_pool():
    global _pool, _IS_MEMORY_MODE
    import asyncio
    if _pool is not None and not _IS_MEMORY_MODE:
        try:
            current_loop = asyncio.get_running_loop()
            if _pool._closed or _pool._loop is not current_loop or _pool._loop.is_closed():
                logger.info("Database pool event loop changed or closed, resetting pool...")
                _pool = None
        except Exception:
            _pool = None

    if _pool is None:
        import asyncpg
        database_url = os.environ.get("DATABASE_URL")
        if not database_url:
            _IS_MEMORY_MODE = True
            _pool = "MEMORY_MODE"
            logger.info("Operating in memory-fallback mode (no DATABASE_URL).")
            return _pool
        try:
            _pool = await asyncpg.create_pool(
                dsn=database_url,
                min_size=2,
                max_size=20,
                command_timeout=60,
                statement_cache_size=100,
            )
            _IS_MEMORY_MODE = False
            logger.info("✅ asyncpg connection pool created")
        except Exception as e:
            logger.warning(f"⚠️ Could not connect to PostgreSQL ({e}). Operating in memory-fallback mode.")
            _IS_MEMORY_MODE = True
            _pool = "MEMORY_MODE"
    return _pool


async def close_pool():
    global _pool, _IS_MEMORY_MODE
    if _pool and not _IS_MEMORY_MODE:
        try:
            await _pool.close()
        except Exception:
            pass
    _pool = None
    _IS_MEMORY_MODE = False
    logger.info("Connection pool closed")


@asynccontextmanager
async def get_conn() -> AsyncGenerator:
    pool = await get_pool()
    if pool == "MEMORY_MODE" or _IS_MEMORY_MODE:
        yield InMemoryConn()
    else:
        try:
            async with pool.acquire() as conn:
                yield conn
        except Exception as e:
            logger.warning(f"Failed to acquire DB conn ({e}), falling back to memory mode")
            yield InMemoryConn()


@asynccontextmanager
async def get_transaction() -> AsyncGenerator:
    pool = await get_pool()
    if pool == "MEMORY_MODE" or _IS_MEMORY_MODE:
        conn = InMemoryConn()
        async with conn.transaction():
            yield conn
    else:
        try:
            async with pool.acquire() as conn:
                async with conn.transaction():
                    yield conn
        except Exception as e:
            logger.warning(f"Failed to acquire DB transaction ({e}), falling back to memory mode")
            conn = InMemoryConn()
            async with conn.transaction():
                yield conn

