"""
medication_service/api/app.py
FastAPI application factory — mounts medication router, lifecycle hooks, middleware.
"""
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from medication_service.api.router import router
from medication_service.database.connection import get_pool, close_pool
from medication_service.database.migrations import run_migrations

logger = logging.getLogger(__name__)


# ── Lifespan (replaces deprecated @app.on_event) ─────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ───────────────────────────────────────────────────────────────
    logging.basicConfig(level=logging.INFO)
    logger.info("🚀 Medication Vault API starting up...")
    try:
        import psycopg2
        database_url = os.environ.get("DATABASE_URL")
        if database_url:
            for attempt in range(5):
                try:
                    conn = psycopg2.connect(database_url)
                    run_migrations(conn)
                    conn.close()
                    break
                except Exception as ex:
                    logger.warning(f"Database connection attempt {attempt+1}/5 pending: {ex}")
                    time.sleep(2)
    except Exception as e:
        logger.warning(f"Migration on startup failed (may already be applied): {e}")
    try:
        await get_pool()
        logger.info("✅ Database pool ready")
    except Exception as e:
        logger.error(f"❌ Database pool failed: {e}")

    yield  # Application runs

    # ── Shutdown ──────────────────────────────────────────────────────────────
    await close_pool()
    logger.info("👋 Medication Vault API shutdown complete")


app = FastAPI(
    title="VitalHealth Medication Vault API",
    description="Enterprise-grade Medication Intelligence Center — REST API for the VitalHealth Digital Twin Platform.",
    version="1.0.0",
    docs_url="/api/v1/medication/docs",
    redoc_url="/api/v1/medication/redoc",
    openapi_url="/api/v1/medication/openapi.json",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("ALLOWED_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request ID + Timing Middleware ────────────────────────────────────────────
@app.middleware("http")
async def request_id_and_timing(request: Request, call_next):
    request_id = request.headers.get("X-Request-Id", str(uuid.uuid4()))
    start = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = round((time.perf_counter() - start) * 1000, 2)
    response.headers["X-Request-Id"] = request_id
    response.headers["X-Response-Time-Ms"] = str(elapsed_ms)
    if elapsed_ms > 2000:
        logger.warning(f"SLOW REQUEST [{elapsed_ms}ms]: {request.method} {request.url.path}")
    return response


# ── Global Exception Handler ──────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"success": False, "message": "Internal server error", "detail": str(exc)},
    )


# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(router)


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health")
async def root_health():
    return {"status": "ok", "service": "medication-vault", "version": "1.0.0"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "medication_service.api.app:app",
        host="0.0.0.0",
        port=int(os.environ.get("MEDICATION_SERVICE_PORT", 8001)),
        reload=os.environ.get("DEBUG", "false").lower() == "true",
        workers=int(os.environ.get("WORKERS", 1)),
    )
