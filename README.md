# 🫀 VitalHealth — AI-Powered Physiological Digital Twin & Medication Vault

VitalHealth is an enterprise-grade, open-source health intelligence platform that couples a React Native mobile application with a BioGears physiological simulation engine, a local RAG doctor assistant, and a secure Medication Vault to create a real-time, personalized digital twin of the human body.

---

## 🏛️ System Architecture

The platform consists of a React Native mobile client communicating with three production services hosted on **E2E Cloud**, reverse-proxied by **Nginx**:

```
                       ┌────────────────────────────────────────────────────────┐
                       │                VitalHealth Mobile Client               │
                       │             (React Native + Expo Router)               │
                       └───────────────────────────┬────────────────────────────┘
                                                   │
                                                   │ HTTPS (Port 80/443)
                                                   ▼
                       ┌────────────────────────────────────────────────────────┐
                       │                   Nginx Reverse Proxy                  │
                       └───────────┬───────────────┼────────────────┬───────────┘
                                   │               │                │
            / (Default Route)      │       /ai/    │   /medication/ │
                                   ▼               ▼                ▼
 ┌───────────────────────────────────┐ ┌───────────┴──────────┐ ┌───┴───────────────────────────────┐
 │       BioGears Twin Service       │ │     Dr. Aria AI      │ │       Medication Vault API        │
 │         (FastAPI / Port 8000)     │ │ (FastAPI / Port 8001)│ │       (FastAPI / Port 8002)       │
 ├───────────────────────────────────┤ ├──────────────────────┤ ├───────────────────────────────────┤
 │ • Calibrates baseline physiology  │ │ • Local Qwen-14B LLM │ │ • Medication schedules & inventory│
 │ • Runs mechanistic simulations    │ │ • On-device RAG      │ │ • Firebase OAuth authentication   │
 │ • Outputs vital sign trajectories │ │ • Clinical document  │ │ • Drug-drug interaction checking  │
 │ • Generates clinical reports      │ │   processing & search│ │ • Audit logging & metrics         │
 └─────────────────┬─────────────────┘ └──────────────────────┘ └───────────────┬───────────────────┘
                   │                                                            │
                   ▼                                                            ▼
         [clinical_data/states/]                                ┌───────────────┴───────────────────┐
         Active XML Twin Baselines                              │         Medication Worker         │
                                                                │       (Celery / Redis / DB 1)     │
                                                                ├───────────────────────────────────┤
                                                                │ • Processes push notifications    │
                                                                │ • Schedules future doses & alerts │
                                                                └───────────────┬───────────────────┘
                                                                                │
                                                                                ▼
                                                                ┌───────────────────────────────────┐
                                                                │            PostgreSQL             │
                                                                │      (twins_db / Port 5432)       │
                                                                └───────────────────────────────────┘
```

---

## 🛠️ Service Infrastructure Details

| Service Name | Working Directory | Virtual Env | Service File | Port | Nginx Path |
|---|---|---|---|---|---|
| **BioGears Twin API** | `biogears_service` | `venv` | `digitaltwin.service` | `8000` | `/` |
| **Dr. Aria AI** | `healthbot` | `healthbot_venv` | `healthbot.service` | `8001` | `/ai/` |
| **Medication Vault** | `medication_service` | `med_venv` | `medication.service` | `8002` | `/medication/` |
| **Medication Worker** | `medication_service` | `med_venv` | `medication-worker.service` | — | — |

---

## 🚀 Server Deployment (E2E Cloud)

### 1. Full Automated Deployment
An automated suite configures the system dependencies, databases, virtual environments, systemd configurations, and Nginx proxy rules:

```bash
# Clone the repository
git clone https://github.com/Akhiluuu/health-digital-twin.git
cd health-digital-twin

# 1. Deploy the BioGears & Dr. Aria AI Core
chmod +x deployment/deploy.sh
./deployment/deploy.sh

# 2. Deploy the Medication Vault & Background Worker
chmod +x deployment/deploy_medication.sh
./deployment/deploy_medication.sh
```

### 2. Post-Deployment Database & Env Configuration
Ensure the `.env` file in the project root `/home/cave/health-digital-twin/.env` is correctly populated:

```env
DATABASE_URL=postgresql://postgres:Cave_123@localhost:5432/twins_db
MED_REDIS_URL=redis://localhost:6379/1
FIREBASE_ADMIN_CREDENTIALS=/home/cave/health-digital-twin/firebase_admin.json
ALLOW_DEV_AUTH=true
```

---

## 🩺 System Verification & Health Checks

Verify that each system is healthy and responds to ping requests.

### 1. Direct Health Check Ports
```bash
# Check BioGears Twin API
curl -s http://localhost:8000/health

# Check Dr. Aria AI Chatbot
curl -s http://localhost:8001/health

# Check Medication Vault API
curl -s http://localhost:8002/health
```

### 2. Public Nginx Routes Verification
```bash
# Check Nginx Gateway to BioGears
curl -s http://localhost/health

# Check Nginx Gateway to Medication Vault
curl -s http://localhost/medication/health
```

---

## 🧪 Running Integration & Unit Tests

The Medication Vault includes a comprehensive integration test suite. Ensure you activate the virtual environment and load the environment variables before running `pytest`.

```bash
# Navigate to project root
cd /home/cave/health-digital-twin

# Activate the medication virtual environment
source med_venv/bin/activate

# Load environmental variables and execute pytest
export $(grep -v '^#' .env | xargs) && ALLOW_DEV_AUTH=true pytest medication_service/tests/ -v
```

---

## 📈 Monitoring & Logging Commands

Use these systemd and journalctl commands to check status and read real-time service logs:

### 1. Checking Service Status
```bash
# Check all services at once
sudo systemctl status digitaltwin healthbot medication medication-worker nginx postgresql redis-server
```

### 2. Monitoring Live Logs
```bash
# Monitor BioGears Twin simulation runs
journalctl -u digitaltwin -f

# Monitor LLM AI Chatbot logs
journalctl -u healthbot -f

# Monitor Medication Vault API requests
journalctl -u medication -f

# Monitor Medication Worker scheduled tasks
journalctl -u medication-worker -f

# Monitor Nginx Access/Error logs
sudo tail -f /var/log/nginx/access.log -f /var/log/nginx/error.log
```

### 3. Quick System Operations
```bash
# Restart the entire platform backend
sudo systemctl restart digitaltwin healthbot medication medication-worker nginx

# Restart just the Medication Vault
sudo systemctl restart medication medication-worker
```

---

## 📱 Mobile App Setup & Connection

1. Open `VitalHealth/services/biogears.ts` or change via Settings inside the app:
   - **Server Configuration URL**: `http://YOUR_VM_IP`
   - **API Key**: Ensure it matches the value of `DIGITAL_TWIN_API_KEY` in `.env`.
2. Configure **Firebase**:
   - Replace `google-services.json` at `VitalHealth/google-services.json` with your project's active credentials file.
3. Build & Run the Mobile Client:
   ```bash
   cd VitalHealth
   npm install
   npx expo start --dev-client
   ```

---

## 🛡️ Disclaimer
VitalHealth is a research simulation tool, not a medical device. All simulated physiological responses (heart rate, blood glucose, cardiac output) are computed using mathematical models (BioGears) and should not be used for diagnosis, clinical decisions, or treatment planning. Always consult a qualified physician for actual healthcare guidance.
