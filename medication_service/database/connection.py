"""
medication_service/database/connection.py
Async PostgreSQL connection pool using asyncpg.
Falls back to psycopg2 sync pool for compatibility.
"""
import os
import logging
from typing import AsyncGenerator
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)

_pool = None

async def get_pool():
    global _pool
    import asyncio
    if _pool is not None:
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
            raise RuntimeError("DATABASE_URL is not set")
        _pool = await asyncpg.create_pool(
            dsn=database_url,
            min_size=2,
            max_size=20,
            command_timeout=60,
            statement_cache_size=100,
        )
        logger.info("✅ asyncpg connection pool created")
    return _pool


async def close_pool():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        logger.info("Connection pool closed")


@asynccontextmanager
async def get_conn() -> AsyncGenerator:
    pool = await get_pool()
    async with pool.acquire() as conn:
        yield conn


@asynccontextmanager
async def get_transaction() -> AsyncGenerator:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            yield conn
