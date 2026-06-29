# VitalHealth VM Migration Guide

This guide describes how to migrate an existing VitalHealth deployment from an old VM to a new VM (e.g. 16GB RAM VM to 32GB RAM VM) without losing database records, clinical profiles, model files, or logs.

## Migration Automation

Run the migration script on your **new** server. It will SSH to the old server, copy all files, rebuild virtual environments, and boot up the system cleanly.

```bash
chmod +x deployment/migrate.sh
./deployment/migrate.sh
```

### Steps Performed by the Migrator:
1. **Interactive Inputs**: Prompts for old server IP address, SSH username, SSH port, SSH private key, and remote project path.
2. **Connectivity Check**: Verifies SSH communication to the remote VM.
3. **Data Sync**: Uses `rsync` to pull:
   - Secret configuration (`.env` file)
   - Simulation reports directory (`reports/`)
   - Clinical user data (`clinical_data/`)
   - Simulation jobs database state (`jobs_store.json`)
   - Downloaded LLM model shards (saving ~10GB of download bandwidth)
   - BioGears runtime binaries and share files
4. **Environment Compile**: Rebuilds Python virtual environments locally to ensure compatibility with the new CPU architecture/OS.
5. **Service Setup**: Registers systemd units and Nginx configuration for the new host path.
6. **Health Diagnostics**: Reloads all daemons and runs verification tests.

### Troubleshooting SSH Key Errors:
If your new server requires an SSH key to connect to the old server:
1. Copy the SSH key to the new server (e.g., `~/.ssh/old_server_id_rsa`).
2. Run `./deployment/migrate.sh`.
3. Provide the full path to the private key when prompted.
