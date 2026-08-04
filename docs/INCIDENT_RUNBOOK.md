# VitalHealth v5.0 — System Incident Response Runbook

## Incident Playbooks

### Playbook A: High CPU Utilization (> 90% sustained for > 5 minutes)
1. **Identify Bottleneck Container**:
   ```bash
   docker stats --no-stream
   ```
2. **If `vitalhealth_brain_prod` is overloading CPU**:
   - Inspect active AI reasoning worker processes.
   - Scale FastAPI workers or verify GGUF model binary path:
     ```bash
     docker-compose -f deployment/docker-compose.prod.yml restart web
     ```
3. **If Celery worker is overloading**:
   - Flush stagnant Celery queue items:
     ```bash
     docker exec vitalhealth_redis_prod redis-cli FLUSHDB
     ```

### Playbook B: PostgreSQL Connection Exhaustion ("too many clients")
1. Check active connections:
   ```bash
   docker exec -it vitalhealth_postgres_prod psql -U postgres -c "SELECT pid, usename, query, state FROM pg_stat_activity WHERE state != 'idle';"
   ```
2. Terminate idle connections if connection pool limit is breached:
   ```bash
   docker exec -it vitalhealth_postgres_prod psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND state_change < current_timestamp - INTERVAL '5 minutes';"
   ```

### Playbook C: Container Crash Loop Recovery
1. Inspect last 100 lines of container crash logs:
   ```bash
   docker logs --tail 100 vitalhealth_brain_prod
   ```
2. Trigger automated rollback to previous known healthy container tag:
   ```bash
   ./deployment/rollback.sh
   ```
