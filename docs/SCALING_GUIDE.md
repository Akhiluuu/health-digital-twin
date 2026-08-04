# VitalHealth v5.0 — Horizontal & Vertical Scaling Guide

## 1. Application Layer Scaling (FastAPI Gateway)
To scale the Health Brain Gateway microservice horizontally across multiple container instances or Kubernetes pods:
- Increase Uvicorn worker count in Dockerfile / compose command: `--workers 8`.
- Scale docker-compose service replicas:
  ```bash
  docker-compose -f deployment/docker-compose.prod.yml up -d --scale web=3
  ```

## 2. Database Read-Replica Scaling (PostgreSQL)
- Configure primary PostgreSQL database for streaming replication (`wal_level = replica`).
- Deploy PostgreSQL read-replicas for read-heavy API queries (Patient Profile, Timeline, Knowledge Graph).
- Point read traffic to read-replica connection strings while keeping mutation traffic on primary node.

## 3. Redis Cluster & Queue Scaling
- Deploy Redis Sentinel or Redis Cluster mode when memory demands exceed single node bounds (> 4GB).
- Scale Celery worker instances independently:
  ```bash
  docker-compose -f deployment/docker-compose.prod.yml up -d --scale celery_worker=4
  ```
