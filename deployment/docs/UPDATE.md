# VitalHealth Server Update Guide

This document explains the safe mechanism for updating application code on the server.

## Updating the Codebase

To pull the latest code updates, verify dependencies, and safely restart services:

```bash
chmod +x deployment/update.sh
./deployment/update.sh
```

### Safety Features of `update.sh`:
- **Pre-Update Backup**: Automatically runs `backup.sh` to capture the current state of `.env`, database, and configs before altering any code.
- **Git Pull Integration**: Stashes local uncommitted changes if found, runs `git pull origin main`, and pops changes back.
- **Dependency Refresh**: Scans `requirements.txt` and `healthbot/requirements.txt` and automatically upgrades/compiles packages within their virtual environments.
- **Services Restart**: Gracefully restarts `digitaltwin` and `healthbot` systemd services.
- **Automated Rollback**: Validates APIs via `healthcheck.sh`. If any endpoint fails to respond after the update, the script automatically triggers a rollback to the backup tarball to keep services online.
