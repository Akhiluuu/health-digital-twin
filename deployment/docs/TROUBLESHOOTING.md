# VitalHealth Server Troubleshooting Guide

This guide provides diagnostics and commands to solve common server-side issues.

## 1. Diagnostics Run

First, run the system doctor tool to analyze the system status:

```bash
chmod +x deployment/doctor.sh
./deployment/doctor.sh
```

This prints CPU load, memory, disk usage, active Python environments, service statuses, Nginx configurations, LLM file integrity, and recent logs.

## 2. Common Scenarios

### Problem: `healthbot.service` fails to start
- **Reason**: The model shards are missing or incomplete.
- **Check**: Run `ls -lh healthbot/model/` and verify three files exist (totaling ~9.8 GB).
- **Solution**: Run the model downloader script:
  ```bash
  ./deployment/install/05_healthbot.sh
  ```

### Problem: `digitaltwin.service` fails to start
- **Reason**: The `.env` file might be missing or has invalid paths.
- **Solution**: Verify `.env` properties:
  ```bash
  cat .env
  ```
  Ensure `BIOGEARS_BIN_DIR` points to the correct absolute path of your local `biogears_runtime` folder.

### Problem: Nginx gives a 502 Bad Gateway
- **Reason**: The backend service (FastAPI) is stopped or crashed.
- **Solution**: Check service statuses:
  ```bash
  sudo systemctl status digitaltwin healthbot
  ```
  Check the backend logs:
  ```bash
  journalctl -u digitaltwin -n 50 --no-pager
  ```

### Problem: Low Memory / Out of Memory (OOM) Errors
- **Reason**: The LLM (Qwen2.5-14B) requires significant RAM. On a VM with less than 16GB, it might trigger the Linux OOM killer.
- **Solution**: Enable a Swap space on your server:
  ```bash
  sudo fallocate -l 8G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  ```
