# VitalHealth v6.0 Enterprise — E2E Networks Deployment Guide

This guide provides step-by-step instructions for deploying the **VitalHealth Personal Health Operating System (PHOS)** onto an **E2E Networks** cloud server (Node / Cloud GPU / CPU Instance).

---

## 🖥️ Recommended E2E Networks Server Specs

| Resource | Minimum Requirement | Recommended Specification |
| :--- | :--- | :--- |
| **OS** | Ubuntu 22.04 LTS / 24.04 LTS | Ubuntu 22.04 LTS |
| **vCPU** | 4 vCPU | 8 vCPU |
| **RAM** | 8 GB | 16 GB (for 14B GGUF model caching) |
| **Storage** | 40 GB NVMe SSD | 80 GB NVMe SSD |
| **Ports Open** | Port 22 (SSH), Port 8000 (API) | Port 22, 8000, 443 (Nginx SSL) |

---

## 🚀 Quick Deployment (Single Command)

Log into your E2E Networks server via SSH, clone/copy your repository, and execute:

```bash
cd /path/to/health-digital-twin
chmod +x scripts/deploy_e2e.sh
./scripts/deploy_e2e.sh
```

---

## 📋 Step-by-Step Manual Deployment Process

### Step 1: Install System Dependencies on E2E Server
```bash
sudo apt update && sudo apt install -y \
  python3 \
  python3-venv \
  python3-pip \
  curl \
  git \
  build-essential
```

### Step 2: Set Up Python Environment
```bash
cd /home/ubuntu/health-digital-twin
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### Step 3: Verify Pre-Deployment Tests
```bash
PYTHONPATH=. venv/bin/pytest healthbot_v4/tests/brain/test_phos_engine.py healthbot_v4/tests/api/test_v6_api_endpoints.py healthbot_v4/tests/brain/test_persistent_graph_sync.py
```

### Step 4: Run Server in Background
```bash
nohup venv/bin/uvicorn healthbot_v4.apps.api.server:app --host 0.0.0.0 --port 8000 --workers 4 > uvicorn.log 2>&1 &
```

---

## 🐳 Docker Deployment Option (Alternative)

If you prefer deploying via Docker on E2E Networks:

```bash
# Build & start all containers (FastAPI + Redis + Postgres)
docker compose up -d --build
```

---

## 🔍 Verification & Health Check Endpoints

Once deployed on E2E Networks, verify your endpoints:

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `http://YOUR_E2E_SERVER_IP:8000/health` | `GET` | System Health Check |
| `http://YOUR_E2E_SERVER_IP:8000/docs` | `GET` | Interactive Swagger OpenAPI Docs |
| `http://YOUR_E2E_SERVER_IP:8000/api/v6/brain/phos/query` | `POST` | 14-Step PHOS Master Reasoning Engine |
| `http://YOUR_E2E_SERVER_IP:8000/api/v6/brain/graph/sync-status` | `GET` | Knowledge Graph L1/L2 Sync Metrics |

---

## 🔒 Production Hardening Checklist for E2E Networks

1. **Firewall Settings**: In E2E Networks MyAccount panel, open TCP port `8000` (or `443` if using Nginx SSL) for incoming app traffic.
2. **Reverse Proxy (Nginx + Certbot SSL)**:
   ```bash
   sudo apt install -y nginx certbot python3-certbot-nginx
   ```
3. **Monitoring Logs**: View live server output via:
   ```bash
   tail -f uvicorn.log
   ```
