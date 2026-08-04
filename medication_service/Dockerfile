# Multi-stage hardened production Dockerfile for VitalHealth Medication Vault Service
FROM python:3.11-slim AS builder

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc tesseract-ocr curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY medication_service/requirements.txt medication_service/requirements.txt
RUN pip install --prefix=/install --no-cache-dir -r medication_service/requirements.txt
RUN pip install --prefix=/install --no-cache-dir celery redis psycopg2-binary pyjwt cryptography prometheus-client firebase-admin

FROM python:3.11-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 tesseract-ocr curl \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd -g 10002 medgroup && \
    useradd -u 10002 -g medgroup -s /bin/false -m meduser

WORKDIR /app

COPY --from=builder /install /usr/local
COPY --chown=meduser:medgroup . /app

USER meduser

EXPOSE 8001

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:8001/health || exit 1

CMD ["uvicorn", "medication_service.api.app:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "2"]
