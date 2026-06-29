# VitalHealth Rollback Guide

This guide explains how to restore the system state to a previous deployment.

## Manual Rollback

If a deployment or update was unsuccessful or introduced unstable behavior, you can restore to any historical backup:

```bash
chmod +x deployment/rollback.sh
./deployment/rollback.sh [backup_file_path.tar.gz]
```

### Automatic File Selection
If you do not specify a backup file, `rollback.sh` will scan the `backups/` directory and automatically select the latest backup file (format: `backup_YYYYMMDD_HHMMSS.tar.gz`).

### Restored Components:
- Server configuration (`.env`)
- Simulation jobs data store (`jobs_store.json`)
- Clinical user data profiles (`clinical_data/`)
- Compiled HTML reports (`reports/`)
- Previous systemd service units and Nginx sites configurations
- Automated daemon and service reloads
