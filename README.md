<h1 align="center">
  <br>
  🫀 VitalHealth — AI-Powered Physiological Digital Twin & Medication Vault
  <br>
</h1>

<p align="center">
  <b>A full-stack, enterprise-grade health platform coupling a React Native mobile application with a BioGears physiological simulation engine, a local RAG AI health assistant chatbot, and a secure Medication Vault.</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Android%20%7C%20iOS-blue?style=flat-square" />
  <img src="https://img.shields.io/badge/Backend-FastAPI%20%2B%20BioGears%20%2B%20Celery-green?style=flat-square" />
  <img src="https://img.shields.io/badge/Database-PostgreSQL%20%2B%20SQLite%20%2B%20Redis-orange?style=flat-square" />
  <img src="https://img.shields.io/badge/Frontend-Expo%20React%20Native-9cf?style=flat-square" />
  <img src="https://img.shields.io/badge/Python-3.10+-yellow?style=flat-square" />
  <img src="https://img.shields.io/badge/License-MIT-orange?style=flat-square" />
  <img src="https://img.shields.io/badge/Status-Active%20Development-blue?style=flat-square" />
</p>

---

## 📖 Table of Contents

- [Overview](#-overview)
- [System Architecture](#-system-architecture)
- [Key Features](#-key-features)
- [Project Structure](#-project-structure)
- [Local Development Setup](#-local-development-setup)
- [Production Deployment (E2E Cloud)](#-production-deployment-e2e-cloud)
- [Database Schema & Migrations](#-database-schema--migrations)
- [System Verification & Health Checks](#-system-verification--health-checks)
- [Running Integration & Unit Tests](#-running-integration--unit-tests)
- [API Reference](#-api-reference)
- [Monitoring & Troubleshooting](#-monitoring--troubleshooting)
- [Scientific References](#-scientific-references)
- [Disclaimer](#-disclaimer)

---

## 🧬 Overview

**VitalHealth** is a research-grade health platform that models the internal state of the human body. At its core, it leverages the **BioGears Engine** — a peer-reviewed, open-source C++ human physiology simulator — to build a living computational model (a **"digital twin"**) of each user.

Unlike typical tracker applications, VitalHealth runs mechanistic, organ-system-level simulations to compute how meals, physical activity, sleep, and medications change vital signs (heart rate, blood glucose, arterial pressure, SpO₂, respiratory rate, core temperature) second-by-second. 

---

## 🏛️ System Architecture

The platform runs as a distributed system, routed through an **Nginx Reverse Proxy** on an E2E Cloud VM:

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
 │       BioGears Twin Service       │ │Personal Health Assist│ │       Medication Vault API        │
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

## ✨ Key Features

### 📱 Mobile App (VitalHealth Client)
- **Digital Twin Dashboard**: Live vitals panel showing simulated HR, blood glucose, MAP, SpO₂, respiration rate, temperature, cardiac output, stroke volume, and tidal volume.
- **Routine Logger**: 8-tab daily logger for Nutrition, Hydration, Activity, Substances, Sleep, Stress, Fasting, and Medications.
- **On-Device RAG AI Assistant**: Upload medical PDFs and image scans. Text is extracted via OCR, chunked, and embedded locally on-device. Grounded queries are sent to a local LLM to preserve complete privacy.
- **Brain Lab**: 4 neuropsychological tests run sequentially to calculate a composite cognitive score: Stroop test, Reaction speed test, Sequence memory span, and Visuospatial pattern memory.
- **rPPG Heart Rate Scanner**: Camera-based non-contact heart rate and SpO₂ measurement using React Native Vision Camera.
- **Medication Reminders**: Automated scheduling with local notifications and refill counts synced to the back-end vault.

### 🖥️ Microservices Platform
* **BioGears Twin Service (`digitaltwin`)**: Calibrates and stabilizes baseline patient states from demographics and medical history. Replays event logs, runs async batch queue jobs, and generates clinical matplotlib health reports.
* **Personal Health Assistant Service (`healthbot`)**: Runs a local high-performance Qwen2.5-14B LLM GGUF engine to serve secure clinical insights.
* **Medication Vault Service (`medication` & `medication-worker`)**: High-performance REST API managing medication schedules, doctor directories, drug-drug interaction warning checks, inventory tracking, and push notification dispatches.

---

## 📁 Project Structure

```
health-digital-twin/
│
├── biogears_service/           # FastAPI service wrapping the C++ BioGears CLI engine
│   ├── api/                    # Server endpoints, streaming, and database layers
│   └── simulation/             # XML builders, runner subprocesses, and output parsers
│
├── healthbot/                  # RAG AI Chatbot backend service
│   ├── api/                    # FastAPI server for LLM query interface
│   └── model/                  # Target storage for Qwen2.5-14B GGUF model shards
│
├── medication_service/         # Medication Vault service
│   ├── api/                    # REST routers (Medication, Caregivers, Audits, Emergencies)
│   ├── database/               # PostgreSQL engine connections and migrations scripts
│   ├── repositories/           # PostgreSQL CRUD abstraction layers
│   ├── services/               # Medication schedulers and interaction logic
│   └── tests/                  # Pytest unit and integration suites
│
├── clinical_data/              # Runtime states (BioGears XML twin states and CSV histories)
│
├── deployment/                 # Deployment scripts and systemd configurations
│   ├── deploy.sh               # Core deploy script (BioGears & AI Core)
│   ├── deploy_medication.sh    # Database & Medication Service deploy script
│   └── templates/              # systemd configuration templates
│
└── VitalHealth/                # React Native Expo mobile application
    ├── app/                    # Expo router frontend screens and navigators
    ├── context/                # React State Context providers (State Hub)
    └── services/               # REST API clients for back-end microservices
```

---

## 💻 Local Development Setup

### 1. Backend Services Setup
```bash
# Clone the repository
git clone https://github.com/Akhiluuu/health-digital-twin.git
cd health-digital-twin

# Create and activate venv
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the BioGears twin service locally
export DIGITAL_TWIN_API_KEY=dev_test_key_123
uvicorn biogears_service.api.server:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Mobile App Setup
```bash
cd VitalHealth
npm install

# Locate your local machine IP (e.g. 192.168.1.50) and configure it in:
# VitalHealth/services/biogears.ts:
# const DEFAULT_BASE_URL = 'http://192.168.1.50:8000';

# Start Expo Developer Server
npx expo start
```

---

## 🚀 Production Deployment (E2E Cloud)

### 1. Core Automated Installation
Deploying the BioGears engine, Qwen2.5-14B model, Celery tasks, and configurations on Ubuntu 22.04 LTS:

```bash
# Deploy BioGears Twin Service + Personal Health Assistant
chmod +x deployment/deploy.sh
./deployment/deploy.sh

# Deploy Medication Vault Service, Postgres, and Redis Worker
chmod +x deployment/deploy_medication.sh
./deployment/deploy_medication.sh
```

### 2. Post-Deployment Credentials Check
Make sure that your Firebase credentials and local configurations are active:
* **Firebase Credentials**: Store the Firebase Service Account JSON credentials at `/home/cave/health-digital-twin/firebase_admin.json`.
* **System Environment**: Verify `/home/cave/health-digital-twin/.env` contains the required keys:
  ```env
  DATABASE_URL=postgresql://postgres:Cave_123@localhost:5432/twins_db
  MED_REDIS_URL=redis://localhost:6379/1
  FIREBASE_ADMIN_CREDENTIALS=/home/cave/health-digital-twin/firebase_admin.json
  ALLOW_DEV_AUTH=true
  ```

---

## 🗄️ Database Schema & Migrations

The Medication Vault uses PostgreSQL. Table schemas (medicines, inventory, audit logs, compliance logs, doctor contacts, dose schedules) are managed using manual Python SQL migrations.

To apply or rollback migrations manually:
```bash
source med_venv/bin/activate
export DATABASE_URL=postgresql://postgres:Cave_123@localhost:5432/twins_db
python -m medication_service.database.migrations
```

---

## 🩺 System Verification & Health Checks

Verify that each microservice is online and accessible via local port checks or through Nginx routes:

### 1. Direct Microservice Health Checks
```bash
# BioGears Engine service (8000)
curl -s http://localhost:8000/health

# Personal Health Assistant service (8001)
curl -s http://localhost:8001/health

# Medication Vault API (8002)
curl -s http://localhost:8002/health
```

### 2. Public Nginx Gateway Checks
```bash
# BioGears Gateway
curl -s http://localhost/health

# Medication Vault Gateway
curl -s http://localhost/medication/health
```

---

## 🧪 Running Integration & Unit Tests

The test suite runs integration scenarios, testing API endpoints, database operations, compliance calculations, and security configurations.

```bash
# Navigate to project root
cd /home/cave/health-digital-twin

# Activate virtual environment
source med_venv/bin/activate

# Inject active .env configurations and run pytest
export $(grep -v '^#' .env | xargs) && ALLOW_DEV_AUTH=true pytest medication_service/tests/ -v
```

---

## 📡 API Reference

Interactive OpenAPI schemas are available at:
* **BioGears API Docs**: `http://<VM_IP>/api/v1/medication/docs`
* **Medication Vault Docs**: `http://<VM_IP>/medication/api/v1/medication/docs`

### 1. BioGears Twin Endpoints
* `POST /register`: Registers and calibrates a patient twin from demographics.
* `POST /sync/batch`: Replays a batch of nutrition, hydration, sleep, stress, and medication events.
* `GET /history/{user_id}`: Retrieves previous simulation histories.
* `GET /health-score/{user_id}`: Generates a 0-100 score and organ health breakdown.

### 2. Medication Vault Endpoints
* `POST /medication/api/v1/medication/medicine`: Add a medication schedule.
* `GET /medication/api/v1/medication/schedule/today`: Retrieve the active schedule.
* `POST /medication/api/v1/medication/dose/log`: Log compliance, skip, or delayed dosage intake.
* `POST /medication/api/v1/medication/interaction/check`: Check potential drug-drug conflicts.

---

## 📈 Monitoring & Troubleshooting

Check logs, service statuses, or restart running backends.

### 1. Check Active Status
```bash
sudo systemctl status digitaltwin healthbot medication medication-worker nginx postgresql redis-server
```

### 2. Read Real-Time Service Logs
```bash
# BioGears Twin logs
journalctl -u digitaltwin -f

# Personal Health Assistant LLM logs
journalctl -u healthbot -f

# Medication Vault logs
journalctl -u medication -f

# Medication Worker background scheduler logs
journalctl -u medication-worker -f
```

### 3. Restart Commands
```bash
# Restart the backend APIs
sudo systemctl restart digitaltwin healthbot medication medication-worker nginx
```

---

## 📖 Scientific References

The algorithms and models within VitalHealth are based on peer-reviewed clinical research:
* **BioGears Engine**: mechanistic organ circuit solvers [BioGears Core](https://github.com/BioGearsEngine/core).
* **Framingham CVD Risk Score**: D'Agostino et al., *Circulation* 2008;117:743–753.
* **ADAG HbA1c Prediction Formula**: Nathan et al., *Diabetes Care* 2008;31:1473–1478.
* **Mifflin-St Jeor BMR**: Mifflin et al., *JADA* 1990;90(3):375–381.
* **Stroop Executive Control Paradigm**: Stroop JR, *Journal of Experimental Psychology* 1935;18(6):643–662.
* **rPPG Camera Signal Acquisition**: Verkruysse W et al., *Optics Express* 2008;16(26):21434–21445.

---

## ⚕️ Disclaimer

**VitalHealth is a research simulation tool, not a medical device.** All outputs — vital signs, cardiovascular risk estimates, predicted blood glucose levels, and cognitive reports — are computationally simulated. They are not validated for clinical use and must not be used for diagnosis, clinical choice, or treatment planning. Always consult a licensed healthcare professional for medical advice.
