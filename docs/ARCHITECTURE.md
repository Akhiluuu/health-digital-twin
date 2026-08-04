# VitalHealth v5.0 — Production Cloud Architecture Specification

## Architecture Overview
VitalHealth v5.0 is an event-driven, production-grade cloud platform designed to serve thousands of concurrent global users across Android, iOS, and Web clients with high availability, security, and automated disaster recovery.

```
                                  [ Global Android / iOS Mobile Apps ]
                                                    │
                                          HTTPS / TLS 1.3 / WSS
                                                    │
                                     ┌──────────────▼──────────────┐
                                     │  Cloud Load Balancer (443)  │
                                     └──────────────┬──────────────┘
                                                    │
                                     ┌──────────────▼──────────────┐
                                     │    Production Nginx Proxy   │
                                     │  (SSL, Gzip, Rate Limits)   │
                                     └──────────────┬──────────────┘
                                                    │
                   ┌────────────────────────────────┼────────────────────────────────┐
                   │                                │                                │
         /api/v5/* │                       /medications/* │                         /dev/*   │
                   ▼                                ▼                                ▼
    ┌─────────────────────────────┐  ┌─────────────────────────────┐  ┌─────────────────────────────┐
    │  Health Brain Gateway Core  │  │   Medication Vault API      │  │  Production Ops Dashboard   │
    │  (FastAPI - 4 Workers)      │  │   (FastAPI - 2 Workers)     │  │  (Telemetry & Status UI)    │
    └──────────────┬──────────────┘  └──────────────┬──────────────┘  └──────────────┬──────────────┘
                   │                                │                                │
     ┌─────────────┴─────────────┐                  │                                │
     │  Celery Async Task Worker │                  │                                │
     │  (OCR, BioGears Twin)     │                  │                                │
     └─────────────┬─────────────┘                  │                                │
                   │                                │                                │
   ────────────────┴────────────────────────────────┴────────────────────────────────┴──────────────────
   STORAGE & DATA LAYER
     ┌────────────────────────┐       ┌────────────────────────┐       ┌────────────────────────┐
     │  PostgreSQL 15 (DB)    │       │ Redis 7 (Cache/Queue)  │       │  Qdrant (Vector DB)    │
     │  Connection Pooling    │       │ Persistent AOF/RDB     │       │  Vector Embeddings     │
     └────────────────────────┘       └────────────────────────┘       └────────────────────────┘
```

## System Components
1. **Nginx Reverse Proxy (`vitalhealth_nginx_prod`)**: Hardened SSL reverse proxy handling TLS 1.3, HTTP/2, Gzip/Brotli compression, rate limiting (`50r/s`), large PDF uploads (50MB), and SSE streaming.
2. **Health Brain Gateway Core (`vitalhealth_brain_prod`)**: FastAPI microservice running 4 workers. Orchestrates Clinical Intent, Context Budgeter, Dual RAG, Longitudinal Reasoning, and Qwen LLM.
3. **Medication Vault Service (`vitalhealth_medication_prod`)**: FastAPI microservice for prescription management, refill alerts, and compliance logging.
4. **Celery Worker Engine (`vitalhealth_worker_prod`)**: Background task processor offloading OCR text extraction and BioGears physiological simulations.
5. **PostgreSQL 15 (`vitalhealth_postgres_prod`)**: Production database storing profiles, timeline logs, and medication histories. Connection pool max 200.
6. **Redis 7 (`vitalhealth_redis_prod`)**: In-memory cache and Celery broker with append-only (AOF) persistence.
7. **Qdrant Vector DB (`vitalhealth_qdrant_prod`)**: High-performance vector database storing clinical embeddings (ADA Guidelines, PubMed references).
8. **Telemetry Stack (Prometheus + Grafana + Loki)**: Real-time metric scraping and log centralization.

## SLA Guarantees
- **Uptime SLA**: 99.9% Uptime availability.
- **Latency SLA**: P95 Latency < 1000ms for AI queries; P95 Latency < 150ms for REST endpoints.
- **Concurrency**: Tested for 5,000 concurrent virtual users with error rate < 0.1%.
