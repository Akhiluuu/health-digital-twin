# Multi-stage hardened production Dockerfile for VitalHealth v5.0 Health Brain Core
# Stage 1: Build dependencies
FROM python:3.11-slim AS builder

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libssl-dev \
    libffi-dev \
    libsqlite3-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --prefix=/install --no-cache-dir -r requirements.txt
RUN pip install --prefix=/install --no-cache-dir celery redis psycopg2-binary pyjwt cryptography prometheus-client python-multipart pydantic-settings

# Stage 2: Final minimal security-hardened runtime image
FROM python:3.11-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libsqlite3-0 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root system user and group for container security
RUN groupadd -g 10001 appgroup && \
    useradd -u 10001 -g appgroup -s /bin/false -m appuser

WORKDIR /app

# Copy dependencies from builder
COPY --from=builder /install /usr/local

# Copy application source code
COPY --chown=appuser:appgroup . /app

# Switch to non-root execution context
USER appuser

EXPOSE 8000 8080

HEALTHCHECK --interval=20s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "healthbot_v4.apps.api.server:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
