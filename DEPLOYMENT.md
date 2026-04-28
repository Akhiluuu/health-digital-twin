# VitalHealth — Deployment & Developer Guide

> **For all future batches**: Read this before touching anything. This document explains how the entire project is structured, how to run it locally, and how to deploy it to production on E2E Cloud.

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
├── biogears_runtime/             ← BioGears binary (NOT in git — transfer manually)
│   ├── bg-cli                    ← Main executable
│   ├── xsd/                      ← Required XML schemas
│   ├── patients/
│   ├── substances/
│   └── environments/
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

| What | Value |
|---|---|
| Cloud Provider | E2E Networks (E2E Cloud) |
| Plan | 8 vCPU / 16 GB RAM / ~₹4,500/mo |
| OS | Ubuntu 22.04 LTS |
| API Port | 8000 (localhost only — Nginx proxies it) |
| Public Port | 443 (HTTPS) via Nginx |
| Service Manager | systemd (`digitaltwin.service`) |
| Process | Uvicorn + 4 workers |

### One-time Setup (Using Automated Script)

To make deployment foolproof, we have created an automated script that handles installing dependencies, creating the Python environment, downloading the BioGears engine, configuring Nginx, and setting up the systemd service.

```bash
# 1. SSH into your E2E Cloud VM
ssh ubuntu@YOUR_VM_IP

# 2. Clone the repo
git clone https://github.com/YOUR_ORG/health-digital-twin.git
cd health-digital-twin

# 3. Run the automated setup script
chmod +x deployment/setup.sh
./deployment/setup.sh

# The script will output your DIGITAL_TWIN_API_KEY at the end. SAVE IT!

# 4. (Optional) SSL — if you have a domain pointing to the VM
sudo certbot --nginx -d yourdomain.com
```

### Update Deployed Code

```bash
ssh ubuntu@YOUR_VM_IP
cd /home/ubuntu/health-digital-twin
git pull origin main
source venv/bin/activate
pip install -r requirements.txt   # only if requirements changed
sudo systemctl restart digitaltwin
sudo systemctl status digitaltwin  # verify it's running
```

---

## Mobile App → Cloud Connection

After deploying to E2E Cloud, users need to configure two things in the app:

**Settings → ☁️ Backup & Restore** — Google Drive backup  
**Settings → Server Configuration** — enter:
1. Cloud URL: `https://yourdomain.com` (or `http://103.x.x.x`)
2. API Key: the `DIGITAL_TWIN_API_KEY` value from `.env`

The app stores both values persistently (URL in AsyncStorage, key in SecureStore).

---

## Useful Commands

```bash
# View live server logs
journalctl -u digitaltwin -f

# Check service status
sudo systemctl status digitaltwin

# Check disk usage (CSVs accumulate)
du -sh /home/ubuntu/health-digital-twin/clinical_data/

# Clean old simulation CSVs (>30 days)
find clinical_data/history -name "*.csv" -mtime +30 -delete

# Manual backup
/home/ubuntu/backup_twins.sh

# Restart everything
sudo systemctl restart digitaltwin nginx
```

---

## Important Notes for Future Batches

1. **`biogears_runtime/` is NOT in git** — it's ~500 MB. The `setup.sh` script automatically downloads the correct Linux binary from the official GitHub releases. Do not try to run a Windows `.exe` on the Ubuntu cloud server!
2. **`.env` is NOT in git** — contains the API key. The `setup.sh` script generates this for you automatically.
3. **`clinical_data/` is patient data** — back it up regularly. The cron job does this at 3 AM daily.
4. **`vital_health.db`** — the mobile app's single SQLite database. All tables live here. Back up via the app's Google Drive backup screen.
5. **API key** — every mobile app request must include `X-API-Key` header. Set it once in app Settings.
6. **BioGears simulations take 10–25 minutes** — this is normal. The async endpoint (`/simulate/async`) + polling (`/jobs/{job_id}`) is the correct pattern. Do NOT set short timeouts.
7. **`config.py` auto-detects OS** — Windows dev → `biogears_service/engine/`, Linux prod → `biogears_runtime/`. No changes needed when switching environments.
