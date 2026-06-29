# VitalHealth — Deployment & Developer Guide

> **For all future batches / juniors**: Read this before touching anything. This document explains how the entire project is structured, how to run it locally, and how to deploy it to production on E2E Cloud.

---

## 📚 Core Developer Textbook
For an in-depth dive into physiological modeling (BioGears ODE circuits), clinical calibrations (diabetes, anemia, COPD), database schema definitions, and RAG keyword routing, refer to the **[VitalHealth Developer Reference Textbook](vital_health_developer_textbook.md)** located in the root folder.

---

## Project Structure

```
health-digital-twin/
├── VitalHealth/                  ← Expo React Native mobile app
│   ├── app/                      ← Expo Router screens
│   ├── components/               ← UI components
│   ├── context/                  ← React context providers (state)
│   ├── database/                 ← SQLite DB layer (vital_health.db)
│   │   ├── index.ts              ← Single DB connection (import from here)
│   │   ├── schema.ts             ← initAllTables() — call once at startup
│   │   ├── medicineDB.ts
│   │   ├── hydrationDB.ts
│   │   ├── symptomDB.ts
│   │   ├── userProfileDB.ts      ← Local offline profile mirror
│   │   ├── simulationHistoryDB.ts← Cached BioGears vitals (offline fallback)
│   │   └── backupService.ts      ← Google Drive backup/restore
│   └── services/
│       └── biogears.ts           ← All API calls to the BioGears backend
│
├── biogears_service/             ← Python FastAPI backend
│   ├── api/
│   │   └── server.py             ← Main FastAPI app (entry point)
│   └── simulation/
│       ├── config.py             ← Paths (auto-detects Windows vs Linux)
│       ├── scenario_builder.py   ← Builds BioGears XML scenarios
│       ├── engine_runner.py      ← Runs bg-cli binary
│       └── result_parser.py      ← Parses CSV output
│
├── healthbot/                    # RAG Chatbot Service (Dr. Aria)
│   ├── api/
│   │   └── server.py             # FastAPI server for LLM & search
│   └── model/                    # Stores Qwen2.5-14B GGUF model shards
│
├── biogears_runtime/             ← BioGears binary (NOT in git — downloaded automatically)
│   ├── bg-cli                    ← Main executable
│   ├── xsd/                      ← Required XML schemas
│   └── share/                    ← Default engine assets (patients, environments)
│
├── clinical_data/                ← Patient data (NOT in git on production)
│   ├── states/                   ← BioGears patient state XMLs
│   └── history/                  ← Simulation CSV history
│
├── requirements.txt              ← Python dependencies
└── DEPLOYMENT.md                 ← This file
```

---

## Local Development Setup

### 1. Backend (Python / BioGears)

```bash
# From project root:
python3.11 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate

pip install -r requirements.txt

# Set environment variables
export DIGITAL_TWIN_API_KEY=dev_test_key_123
export BIOGEARS_BIN_DIR=$(pwd)/biogears_runtime  # Linux/Mac
# Windows: set BIOGEARS_BIN_DIR=C:\path\to\health-digital-twin\biogears_runtime

# Start the server
uvicorn biogears_service.api.server:app --host 0.0.0.0 --port 8000 --reload

# Test it
curl http://localhost:8000/health
```

### 2. Mobile App (Expo)

```bash
cd VitalHealth
npm install

# Find your laptop's local IP:
# Linux/Mac: ip a | grep inet
# Windows:   ipconfig | findstr IPv4

# Edit services/biogears.ts line ~8:
# const DEFAULT_BASE_URL = 'http://YOUR_LAPTOP_IP:8000';

npx expo start
# Scan QR code with Expo Go on your phone (same Wi-Fi network)
```

---

## Production Deployment (E2E Cloud)

### Quick Reference

| Component | Value |
|---|---|
| **Cloud Provider** | E2E Networks (E2E Cloud) |
| **Plan** | 8 vCPU / 16 GB RAM / ~₹4,500/mo (Required for LLM and BioGears workloads) |
| **OS** | Ubuntu 22.04 LTS |
| **Nginx Routing** | `/` -> BioGears API (`localhost:8000`) <br> `/ai/` -> Healthbot Chatbot (`localhost:8001`) |
| **Service Manager** | systemd (`digitaltwin.service` & `healthbot.service`) |
| **LLM Model** | Qwen2.5-14B GGUF (~9.8 GB total, downloaded automatically in 3 shards) |

### One-time Setup (Using Automated Script)

To make deployment foolproof, we have created an automated script that handles installing dependencies, creating virtual environments (`venv` and `healthbot_venv`), downloading the BioGears engine, downloading/verifying the 3 shards of the Qwen2.5-14B model, configuring Nginx, and setting up systemd services.

```bash
# 1. SSH into your E2E Cloud VM
ssh ubuntu@YOUR_VM_IP

# 2. Clone the repo
git clone https://github.com/Akhiluuu/health-digital-twin.git
cd health-digital-twin

# 3. Run the automated deployment script
chmod +x deployment/deploy.sh
./deployment/deploy.sh
```

> [!NOTE]  
> If the repository is set to private or requires authentication, the setup script will dynamically prompt you to enter your **GitHub Personal Access Token** securely.

At the end of setup, the script will output your generated `DIGITAL_TWIN_API_KEY`. **Make sure to save it!**

---

### Update Deployed Code

To safely update the codebase, verify dependencies, and restart services with automated rollback fallback:

```bash
ssh ubuntu@YOUR_VM_IP
cd /home/ubuntu/health-digital-twin

# Run the automated secure update script
./deployment/update.sh
```

---

## Mobile App → Cloud Connection

After deploying to E2E Cloud, users need to configure the app:

*   **Settings → ☁️ Backup & Restore** — Google Drive backup  
*   **Settings → Server Configuration** — enter:
    1.  **Cloud URL**: `http://YOUR_VM_IP` (or `https://yourdomain.com`)
    2.  **API Key**: the `DIGITAL_TWIN_API_KEY` outputted by the setup script.

---

## Useful Commands

```bash
# View live simulation logs
journalctl -u digitaltwin -f

# View live AI chatbot logs
journalctl -u healthbot -f

# Check service status
sudo systemctl status digitaltwin healthbot nginx

# Check disk usage (CSVs accumulate)
du -sh /home/ubuntu/health-digital-twin/clinical_data/

# Clean old simulation CSVs (>30 days)
find clinical_data/history -name "*.csv" -mtime +30 -delete

# Restart everything
sudo systemctl restart digitaltwin healthbot nginx
```

---

## Important Notes for Future Developers

1.  **Multiple Virtual Environments**: BioGears and Healthbot use separate virtual environments (`venv` and `healthbot_venv`) to prevent dependency conflicts (different Pydantic/FastAPI requirements). Keep them isolated.
2.  **`biogears_runtime/` is NOT in git** — The `deploy.sh` script automatically downloads the correct Linux binary from official GitHub releases. Do not commit it.
3.  **LLM Model Shards**: The Qwen2.5-14B model is split into 3 GGUF shards. The `deploy.sh` script downloads them and verifies all 3 are fully downloaded before launching the service.
4.  **`.env` is NOT in git** — Contains the API key. The `deploy.sh` script generates this for you automatically.
5.  **`clinical_data/`** — Stores active twin states (`.xml`) and CSV timeseries history. Back these up regularly.
6.  **BioGears simulations take 10–20 seconds** — This is normal. The async endpoint (`/simulate/async`) + polling (`/jobs/{job_id}`) is the correct communication pattern. Do NOT set short request timeouts.
