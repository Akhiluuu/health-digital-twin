# VitalHealth v5.0 — Production Operations Guide

## Daily Operations & Monitoring Checklist

### 1. Service Health Monitoring
Monitor real-time system metrics via the Production Operations Dashboard:
- Dashboard URL: `http://localhost:8000/dev/dashboard` or `https://api.vitalhealth.app/dev/dashboard`
- Check container status:
  ```bash
  docker-compose -f deployment/docker-compose.prod.yml ps
  ```

### 2. Log Inspection & Centralized Scrapers
Centralized JSON logs are written to `logs/` and stdout:
- View live Health Brain Gateway logs:
  ```bash
  docker logs -f vitalhealth_brain_prod
  ```
- View Security Audit log events:
  ```bash
  cat logs/security_audit.log
  ```

### 3. Container Maintenance & Resource Usage
Inspect container CPU and Memory utilization:
```bash
docker stats
```

### 4. Database Connection Pool Health
Verify PostgreSQL connection status:
```bash
docker exec -it vitalhealth_postgres_prod psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"
```
