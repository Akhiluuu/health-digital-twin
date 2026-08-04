# VitalHealth v5.0 — Backup & Disaster Recovery Manual

## Automated Backup Schedule
- **Frequency**: Automated daily execution via cron (02:00 UTC).
- **Retention**: 7-day rolling retention; 30-day monthly snapshot archives.
- **Location**: `backups/vitalhealth_backup_YYYYMMDD_HHMMSS.tar.gz`.

## Manual Backup Execution
To trigger an instant backup of PostgreSQL, Redis state, Qdrant vectors, and document uploads:
```bash
./deployment/backup.sh
```

## Disaster Recovery Procedure
To restore the platform state from a backup archive:
```bash
./deployment/restore.sh backups/vitalhealth_backup_20260804_103000.tar.gz
```
