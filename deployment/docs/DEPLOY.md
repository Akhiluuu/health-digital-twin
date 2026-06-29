# VitalHealth Digital Twin Deployment Guide

This guide details how to install and configure the VitalHealth Digital Twin server environment on a clean Linux VM (Ubuntu 22.04 / 24.04 LTS).

## Prerequisites

- Ubuntu 22.04 LTS or 24.04 LTS VM (minimum 2 CPU cores, 8 GB RAM, 15 GB free disk space recommended).
- Access to the VM via SSH with a regular user account having `sudo` privileges.

## One-Command Deployment

From the root directory of your cloned project:

```bash
chmod +x deployment/deploy.sh
./deployment/deploy.sh
```

### What `deploy.sh` Automates:
1. **Prechecks**: Validates system resources, operating system version, and internet connectivity.
2. **System Dependencies**: Installs core utilities (`git`, `sqlite3`, `tesseract-ocr`, `libgl1`, `nginx`, etc.) via APT.
3. **Python Verification**: Automatically detects the highest available Python version and installs the matching `venv` packages.
4. **Virtual Environments**: Builds two isolated environments (`venv` for BioGears simulation and `healthbot_venv` for LLM Chatbot) to prevent dependency conflicts.
5. **BioGears Core**: Downloads, extracts, and configures the C++ BioGears simulation engine v7.3.2 and its dataset.
6. **Chatbot Model**: Downloads the 3 shards of the Qwen2.5-14B GGUF instruct model (~9.8 GB total) using resumable downloads.
7. **Environment File (`.env`)**: Automatically generates a unique API key, resolves the VM's public IP address, and configures environment parameters.
8. **Systemd Integration**: Patches unit files with the current user, group, and paths, reloads systemd, and starts both application services.
9. **Nginx Reverse Proxy**: Configures Nginx to route `/` to the BioGears simulation backend (port 8000) and `/ai/` to the Health AI chatbot backend (port 8001).
10. **Firewall Rules**: Automatically updates `UFW` or `Firewalld` to expose the required services.
11. **Health Verification**: Performs direct API checks and reverse proxy checks on all critical endpoints.

## Managing the Deployment

- Check system health:
  ```bash
  ./deployment/verify.sh
  ```
- View service logs:
  ```bash
  journalctl -u digitaltwin -f    # BioGears simulation API logs
  journalctl -u healthbot -f      # Health chatbot AI logs
  ```
- Run diagnostic checks:
  ```bash
  ./deployment/doctor.sh
  ```
