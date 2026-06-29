# VitalHealth Backup Guide

This document describes the data backup system.

## Creating backups

To manually capture and store system state data:

```bash
chmod +x deployment/backup.sh
./deployment/backup.sh
```

### Backed Up Files:
1. **Application State**:
   - Environment variables (`.env`)
   - Simulation jobs store (`biogears_service/jobs_store.json`)
   - Application execution logs (`logs/`)
2. **Clinical and Historical Records**:
   - Clinical user data profiles (`clinical_data/`)
   - HTML simulation output reports (`reports/`)
3. **Infrastructure Configurations**:
   - Systemd unit configuration files (`digitaltwin.service`, `healthbot.service`)
   - Nginx server block configuration (`sites-available/digitaltwin`)

All backups are compressed as `.tar.gz` archives and saved inside the `backups/` directory under your project root directory.
