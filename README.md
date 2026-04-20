<h1 align="center">
  <br>
  🫀 VitalHealth — AI-Powered Physiological Digital Twin
  <br>
</h1>

<p align="center">
  <b>A full-stack open-source health platform that couples a React Native mobile app with a BioGears physiological simulation backend to create a real-time, personalized digital twin of the human body.</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Android%20%7C%20iOS-blue?style=flat-square" />
  <img src="https://img.shields.io/badge/Backend-FastAPI%20%2B%20BioGears-green?style=flat-square" />
  <img src="https://img.shields.io/badge/Frontend-Expo%20React%20Native-9cf?style=flat-square" />
  <img src="https://img.shields.io/badge/Python-3.10+-yellow?style=flat-square" />
  <img src="https://img.shields.io/badge/Node.js-18+-brightgreen?style=flat-square" />
  <img src="https://img.shields.io/badge/License-MIT-orange?style=flat-square" />
  <img src="https://img.shields.io/badge/Status-Active%20Development-blue?style=flat-square" />
</p>

---

## 📖 Table of Contents

- [Overview](#-overview)
- [What Makes This Different](#-what-makes-this-different)
- [Architecture](#-architecture)
- [Features](#-features)
- [Project Structure](#-project-structure)
- [Requirements](#-requirements)
- [Backend Setup](#-backend-setup)
- [Frontend Setup](#-frontend-setup)
- [Connecting App to Backend](#-connecting-app-to-backend)
- [How It Works — End to End](#-how-it-works--end-to-end)
- [API Reference](#-api-reference)
- [Environment Variables](#-environment-variables)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)
- [Disclaimer](#-disclaimer)
- [References](#-references)

---

## 🧬 Overview

**VitalHealth** is a research-grade, open-source health application that goes far beyond step counters and calorie trackers. At its core, it uses the **BioGears Engine** — a peer-reviewed, open-source C++ human physiology simulator — to build a living computational model (a **"digital twin"**) of each user's body.

When a user logs an activity — a meal, a workout, a medication, a period of sleep — the system doesn't just record it in a database. It **runs a real physiological simulation** that computes, second by second, how that event changes the user's heart rate, blood glucose, blood pressure, oxygen saturation, respiratory rate, core temperature, and many other vitals.

The result is a continuously updated, clinically-informed snapshot of your internal physiology — something no wearable alone can provide.

### Why does this matter?

Most health apps track *what you did*. VitalHealth tracks *what happened inside your body as a result*. This distinction is fundamental:

- A meal tracker records "800 calories". VitalHealth simulates how those 800 calories raise your blood glucose, how your pancreas responds with insulin, and what your glucose level looks like 2 hours later.
- A fitness app records "30-minute run". VitalHealth simulates the cardiovascular demand, oxygen consumption, cardiac output change, and recovery trajectory after that run.

This is not a heuristic or a statistical model — it is a **mechanistic, organ-system-level simulation** running validated physiology.

---

## ✨ What Makes This Different

| Feature | Typical Health App | VitalHealth |
|---|---|---|
| Data Storage | Logs what you did | Simulates physiological response |
| Physiology Model | Statistical estimates | Mechanistic organ-level simulation |
| Vitals Source | Sensor readings only | BioGears simulation engine |
| Drug Interactions | Rule-based database lookup | Validated pharmacokinetic model |
| AI Context | Generic health tips | RAG over your personal medical documents |
| Cognitive Health | Not present | 4-test Brain Lab (science-backed) |
| Privacy | Cloud-dependent | On-device OCR, embedding, and chunking |

---

## 🏛️ Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     VitalHealth Mobile App                        │
│                 (React Native + Expo Router)                       │
│                                                                    │
│  ┌──────────┐ ┌────────────┐ ┌──────────┐ ┌───────────────────┐  │
│  │  Twin    │ │  Insights  │ │ AI Health│ │   Brain Lab       │  │
│  │ Screen   │ │  Screen    │ │  (RAG)   │ │ (Cognitive Tests) │  │
│  └────┬─────┘ └─────┬──────┘ └────┬─────┘ └───────────────────┘  │
│       │             │             │                                │
│  ┌────▼─────────────▼─────────────▼──────────────────────────┐   │
│  │              BiogearsTwinContext (React)                    │   │
│  │   + NutritionContext + StepContext + HydrationContext      │   │
│  │   + MedicineContext  + SymptomContext + FamilyContext      │   │
│  └──────────────────────────┬─────────────────────────────────┘   │
│                              │                                     │
│  ┌───────────────────────────▼──────────────────────────────────┐ │
│  │                   Services Layer                              │ │
│  │  biogears.ts · firebaseSync.ts · notifeeService.ts          │ │
│  │  embeddingService.ts · documentProcessing.ts                │ │
│  └────────────────────────────────────────────────────────────── │
└───────────────────────────────┬──────────────────────────────────┘
                                │ HTTP / REST (axios)
                                │ port 8000
┌───────────────────────────────▼──────────────────────────────────┐
│                  BioGears Digital Twin API                        │
│                    (Python / FastAPI)                             │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  api/server.py   — All REST endpoints (~1,300 lines)        │ │
│  │  api/analytics.py — Health scores, CVD risk, HbA1c, TIR    │ │
│  │  api/streaming.py — SSE live vitals streaming               │ │
│  │  api/db.py — JSON flat-file patient profile store          │ │
│  └──────────────────────────┬──────────────────────────────────┘ │
│                              │                                    │
│  ┌───────────────────────────▼──────────────────────────────────┐ │
│  │  simulation/                                                  │ │
│  │  ├── config.py           All path constants                  │ │
│  │  ├── scenario_builder.py  BioGears XML generation            │ │
│  │  ├── engine_runner.py    Subprocess management + streaming   │ │
│  │  ├── patient_builder.py  Patient XML from demographics       │ │
│  │  ├── result_parser.py    CSV parsing + anomaly detection     │ │
│  │  ├── validator.py        Event + drug interaction validation │ │
│  │  ├── substance_registry.py  79-substance database           │ │
│  │  └── visualizer.py       matplotlib health report PNGs      │ │
│  └──────────────────────────┬──────────────────────────────────┘ │
│                              │                                    │
│  ┌───────────────────────────▼──────────────────────────────────┐ │
│  │            BioGears Engine (bg-cli.exe / bg-cli)            │ │
│  │         Precompiled C++ binary — Windows x86-64             │ │
│  │         (Linux build also available from BioGears team)     │ │
│  └─────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────┘
```

---

## ✨ Features

### 📱 Mobile App (VitalHealth)

#### Core Health Tracking

| Feature | Description |
|---|---|
| **Digital Twin Dashboard** | Live vitals panel showing HR, glucose, BP, SpO₂, respiration rate, core temperature, cardiac output, stroke volume, and tidal volume — all simulation-derived |
| **Routine Logger** | 7-tab daily logger: Nutrition, Hydration, Activity, Substances, Sleep, Stress, and Fasting. Events are timestamped and sent to BioGears for simulation |
| **Physiological Insights** | Organ health scores (Heart, Lungs, Gut, Brain), session history, trend charts, anomaly detection |
| **Step Intelligence** | Real-time pedometer with foreground Notifee service, automatic step-to-exercise sync with BioGears |
| **Calorie Intelligence** | Macro tracking with per-meal BioGears simulation for glucose/energy forecasting |
| **Hydration Tracker** | Water intake logging with scheduled notification reminders |
| **Nutrition Tracker** | Full meal logger with macronutrient breakdown and BioGears sync |

#### AI & Smart Features

| Feature | Description |
|---|---|
| **AI Health Chat (RAG)** | Upload your medical PDFs/images → documents are chunked and embedded **on-device** → your query retrieves the top-K relevant chunks → only those chunks are sent to a local LLM server for generation. Your medical data never leaves your device |
| **On-Device Document Processing** | PDFs and images are processed entirely on-phone: text extraction (OCR for images), chunking with overlap, and embedding using a local model |
| **Symptom Flow** | Structured symptom logging with AI-generated follow-up questions |
| **Symptom History** | Timeline of logged symptoms with AI expansion |

#### Cognitive Health

| Feature | Description |
|---|---|
| **Brain Lab** | 4 scientifically-validated cognitive tests run sequentially: **Pattern Test** (visuospatial working memory), **Reaction Test** (neural processing speed), **Memory Test** (sequence recall / working memory span), **Stroop Test** (executive function / cognitive control) |
| **Brain Report** | After all 4 tests, generates a composite cognitive score (0–100), letter grade (A–F), identifies your dominant skill and the skill most needing training |

#### Clinical & Medical

| Feature | Description |
|---|---|
| **Heart Rate Scanner** | Camera-based rPPG (remote photoplethysmography) heart rate measurement using React Native Vision Camera |
| **SpO₂ Estimator** | Camera-based blood oxygen saturation estimation |
| **Medication Vault** | Medicine schedule management, dose reminders via Notifee, drug interaction warnings from BioGears |
| **Medical Documents Vault** | Upload and organize medical records by category: Lab Reports, Prescriptions, Scans, ECG, Discharge Summaries |
| **SOS Emergency** | Quick-access emergency contacts and SOS feature |

#### Social & Family

| Feature | Description |
|---|---|
| **Family Health** | Add and track health data for family members |
| **Firebase Auth** | Email/password authentication with full profile sync to Firestore |
| **Dark / Light Mode** | Full theme system across all screens |
| **Health Reports** | View matplotlib-generated visual health reports from each simulation session |

---

### 🖥️ Backend (BioGears Digital Twin API)

| Feature | Description |
|---|---|
| **Twin Registration** | Creates a calibrated BioGears patient state from demographics (age, weight, height, sex, BP, body fat, medical history) |
| **Batch Simulation** | Replays a chronologically sorted batch of daily events through the BioGears engine |
| **Async Simulation** | Background job queue — returns `job_id` immediately, poll for results |
| **SSE Streaming** | Live vital sign streaming via Server-Sent Events during simulation |
| **Health Score** | 0–100 composite score graded A–F from the latest simulation session |
| **Organ Scores** | Anatomical grouping of vitals: Heart (HR + BP), Lungs (SpO₂ + RR), Gut (Glucose + Temp), Brain (context) |
| **CVD Risk Score** | Framingham 10-year cardiovascular risk with South Asian ethnicity multiplier (1.5×) |
| **HbA1c Prediction** | ADAG formula applied to simulated glucose averages: `HbA1c = (mean_glucose + 46.7) / 28.7` |
| **Time-in-Range (TIR)** | Diabetic glucose quality metric per session |
| **Recovery Readiness** | Post-exercise recovery score from vitals trajectory |
| **BMR & Caloric Balance** | Mifflin-St Jeor BMR with event-based burn estimation |
| **Sleep Debt Tracker** | Cumulative sleep debt across sessions |
| **What-If Scenarios** | Run alternative event outcomes without updating twin's saved state |
| **Anomaly Detection** | Real-time detection of physiologically abnormal vitals from simulation output |
| **Drug Interaction Check** | Pre-simulation substance interaction validation |
| **Rate Limiting** | Per-user simulation rate limiting (configurable max per hour) |
| **API Key Auth** | Optional bearer key authentication for all endpoints |
| **State Checkpointing** | Auto-backup of BioGears state after every successful simulation (last 7 kept) |
| **Data Gap Handling** | Detects time gaps between syncs, caps time advancement at 8 hours to prevent physiological divergence |
| **Health Report PNG** | Multi-panel matplotlib clinical report auto-generated per session |

---

## 📁 Project Structure

```
health-digital-twin/
│
├── biogears_service/                   # Python FastAPI backend
│   ├── api/
│   │   ├── server.py                   # Main FastAPI app — all REST endpoints (~1,300 lines)
│   │   ├── analytics.py                # Analytics engine — health scores, CVD, HbA1c, TIR, trends
│   │   ├── db.py                       # Patient profile store (JSON flat-file database)
│   │   └── streaming.py                # SSE streaming for live simulation output
│   │
│   ├── engine/
│   │   └── BioGears/                   # ← BioGears binary installed here (NOT in Git, ~2 GB)
│   │       └── bin/
│   │           ├── bg-cli.exe          # BioGears CLI executable (Windows x86-64)
│   │           ├── bg-cli              # BioGears CLI executable (Linux x86-64)
│   │           ├── Scenarios/
│   │           │   └── API/            # Generated scenario XMLs land here at runtime
│   │           ├── substances/         # BioGears 79-substance library (XML files)
│   │           ├── environments/       # BioGears environment definitions
│   │           ├── nutrition/          # Nutrition data files
│   │           └── patients/           # Reference patient files (BioGears defaults)
│   │
│   └── simulation/
│       ├── config.py                   # All path constants — single source of truth
│       ├── scenario_builder.py         # Builds BioGears XML scenario files (~1,000 lines)
│       ├── engine_runner.py            # Runs bg-cli.exe as subprocess with real-time streaming
│       ├── patient_builder.py          # Generates BioGears patient XML from user demographics
│       ├── result_parser.py            # Parses output CSVs, detects anomalies by vital range
│       ├── validator.py                # Input validation for events and drug interactions
│       ├── substance_registry.py       # 79-substance database with route grouping
│       └── visualizer.py              # matplotlib multi-panel health report generator
│
├── clinical_data/                      # Runtime patient data (NOT committed to Git)
│   ├── states/                         # BioGears XML state files per user (their "physiology")
│   │   └── backups/{user_id}/          # Auto-rotating state backups (last 7 kept)
│   └── history/                        # Per-session vitals CSVs per user
│
├── reports/                            # Generated health report PNGs (NOT committed)
├── logs/                               # Server and engine debug logs (NOT committed)
├── venv/                               # Python virtual environment (NOT committed)
│
├── requirements.txt                    # Python dependencies (all pinned to exact versions)
├── .gitignore
└── README.md
│
└── VitalHealth/                        # React Native Expo app
    ├── app/
    │   ├── _layout.tsx                 # Root layout — wraps all context providers
    │   ├── (tabs)/                     # Bottom tab navigation screens
    │   │   ├── _layout.tsx             # Tab navigator config
    │   │   ├── index.tsx               # Home dashboard
    │   │   ├── twin.tsx                # Digital Twin screen (Dashboard + Routine Logger)
    │   │   ├── history.tsx             # Physiological Insights + session history
    │   │   ├── ai-health.tsx           # AI Health Chat with on-device RAG
    │   │   ├── insights.tsx            # Additional analytics insights
    │   │   └── documents.tsx           # Medical documents vault
    │   │
    │   ├── onboarding/                 # 4-step clinical profile setup
    │   │   ├── index.tsx               # Entry point
    │   │   ├── personal.tsx            # Step 1: demographics (age, height, weight, sex)
    │   │   ├── medical.tsx             # Step 2: medical history (diabetes, anemia, smoking)
    │   │   ├── habits.tsx              # Step 3: lifestyle habits (fitness level, medications)
    │   │   └── review.tsx              # Step 4: confirm & trigger BioGears registration
    │   │
    │   ├── brain/                      # Cognitive health module
    │   │   ├── brain-lab.tsx           # Brain Lab orchestrator (intro → tests → report)
    │   │   ├── brainEngine.ts          # Score computation and grade logic
    │   │   ├── PatternTest.tsx         # Visuospatial memory game
    │   │   ├── ReactionTest.tsx        # Neural processing speed game
    │   │   ├── MemoryTest.tsx          # Sequence recall / working memory game
    │   │   └── StroopTest.tsx          # Executive function / cognitive control game
    │   │
    │   ├── family/                     # Family health tracking
    │   │   ├── index.tsx               # Family members list
    │   │   ├── add-member.tsx          # Add a family member
    │   │   └── member-details.tsx      # Individual member health view
    │   │
    │   ├── session/                    # Simulation session detail screens
    │   │   ├── [id].tsx                # Session detail by ID
    │   │   └── [sessionId].tsx         # Vitals timeseries viewer
    │   │
    │   ├── activity.tsx                # Step Intelligence screen
    │   ├── calorie-intelligence.tsx    # Calorie tracking
    │   ├── hydration.tsx               # Water intake tracker
    │   ├── nutrition.tsx               # Full meal logger
    │   ├── heart-scanner.tsx           # rPPG heart rate scanner
    │   ├── spo2.tsx                    # Camera-based SpO₂ estimator
    │   ├── AddMedicine.tsx             # Add medication form
    │   ├── MedicationVault.tsx         # Medication list and reminders
    │   ├── MedicineHistory.tsx         # Medication history log
    │   ├── symptom-flow.tsx            # Structured symptom entry
    │   ├── symptom-followup.tsx        # AI follow-up question flow
    │   ├── symptom-history.tsx         # Symptom timeline
    │   ├── symptom-chat.tsx            # AI chat for symptoms
    │   ├── symptom-log.tsx             # Symptom logger
    │   ├── sos.tsx                     # Emergency SOS screen
    │   ├── rest.tsx                    # Rest / fasting screen
    │   ├── profile.tsx                 # User profile + settings
    │   ├── signin.tsx / signup.tsx     # Authentication screens
    │   ├── welcome.tsx                 # App welcome screen
    │   └── settings*.tsx               # Settings sub-screens
    │
    ├── context/                        # React Context state providers
    │   ├── BiogearsTwinContext.tsx      # Digital twin state (central hub — simulation events, vitals)
    │   ├── NutritionContext.tsx        # Meal tracking state
    │   ├── HydrationContext.tsx        # Water intake state
    │   ├── MedicineContext.tsx         # Medication schedule state
    │   ├── ProfileContext.tsx          # User profile state
    │   ├── StepContext.tsx             # Step counter + pedometer state
    │   ├── SymptomContext.tsx          # Symptom logging state
    │   ├── FamilyContext.tsx           # Family members state
    │   └── ThemeContext.tsx            # Dark / light mode
    │
    ├── services/                       # Business logic and external integrations
    │   ├── biogears.ts                 # BioGears API client — all HTTP calls to backend
    │   ├── firebase.ts                 # Firebase initialization
    │   ├── firebaseSync.ts             # Cloud sync for all health data to Firestore
    │   ├── documentProcessing.ts       # On-device PDF/image → chunks pipeline
    │   ├── embeddingService.ts         # On-device text embedding for RAG
    │   ├── chunkingService.ts          # Text chunking with overlap
    │   ├── textExtraction.ts           # OCR and PDF text extraction
    │   ├── foregroundStepService.ts    # Background step counter (Notifee)
    │   ├── notifeeService.ts           # Push notification scheduling
    │   ├── notificationService.ts      # Notification management
    │   ├── profileService.ts           # Profile CRUD operations
    │   ├── familySync.ts               # Family data sync to Firebase
    │   ├── emailService.ts             # Email reports via EmailJS
    │   └── symptomService.ts           # Symptom data persistence
    │
    ├── theme/                          # Design tokens
    │   └── colors.ts                   # Light/dark color palettes
    ├── types/                          # Shared TypeScript types
    ├── hooks/                          # Custom React hooks
    ├── components/                     # Shared UI components
    ├── constants/                      # App-wide constants
    ├── assets/                         # Icons, splash screen, images
    ├── app.config.js                   # Expo configuration (plugins, permissions)
    ├── package.json                    # npm dependencies
    └── tsconfig.json                   # TypeScript compiler config
```

---

## 📋 Requirements

### Backend (Python Server)

| Requirement | Detail |
|---|---|
| **OS** | Windows 10/11 (x86-64) for full simulation. Ubuntu 22.04 LTS also supported |
| **CPU** | x86-64 ONLY — BioGears is not compiled for ARM (no Apple Silicon, no Raspberry Pi) |
| **RAM** | 8 GB minimum, 16 GB recommended |
| **Disk** | ~3 GB for BioGears engine + data files |
| **Python** | 3.10 or higher (tested on 3.12, 3.14) |
| **BioGears** | Pre-compiled binary v7.x — must be downloaded separately (see setup below) |

> ⚠️ **ARM devices (Apple Silicon M1/M2/M3, Raspberry Pi, etc.) cannot run the BioGears engine.** The FastAPI server can run on ARM but without a compatible `bg-cli` binary, all simulation endpoints will fail.

### Frontend (Mobile App)

| Requirement | Detail |
|---|---|
| **Node.js** | 18.x or higher |
| **npm** | 9.x or higher |
| **Android** | Physical device or emulator with API level 24+ (Android 7.0+) |
| **iOS** | Physical device or simulator (iOS 16+) — macOS required for iOS builds |
| **Expo Dev Build** | Required — standard Expo Go will **not** work (uses native modules: Notifee, Vision Camera) |
| **Firebase Project** | Required for authentication and cloud sync |
| **EAS Account** | Required for building the development client (free tier is sufficient) |

---

## 🖥️ Backend Setup

### Step 1 — Clone the repository

```bash
git clone https://github.com/<your-username>/health-digital-twin.git
cd health-digital-twin
```

### Step 2 — Create a Python virtual environment

> ⚠️ **If you are setting up on a new machine**, always create a fresh virtual environment. Copying a `venv` folder between machines will break it because it contains absolute paths.

```bash
# Windows — use the full Python path to be safe
C:\Python314\python.exe -m venv venv

# Linux / macOS
python3 -m venv venv
```

### Step 3 — Activate the virtual environment

```bash
# Windows PowerShell
.\venv\Scripts\Activate.ps1

# Windows CMD
venv\Scripts\activate.bat

# Linux / macOS
source venv/bin/activate
```

> **PowerShell policy error?** Run this once as administrator:
> ```powershell
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
> ```

### Step 4 — Install Python dependencies

```bash
# IMPORTANT: Use python -m pip (not just pip) to avoid launcher path errors
python -m pip install -r requirements.txt
```

This installs 33 packages: FastAPI, Uvicorn, Pandas, NumPy, Matplotlib, Pydantic, and all supporting libraries — all pinned to exact tested versions.

### Step 5 — Download and install the BioGears engine binary

The BioGears engine is a compiled C++ binary that is **not included in this repository** (it's ~2 GB).

1. Go to: **https://github.com/BioGearsEngine/core/releases**
2. Download the release matching your OS:
   - Windows: `biogears-gui-7.x.x-win64.exe` or `.zip`
   - Linux: `biogears-7.x.x-Linux.tar.gz`
3. Extract so the directory structure looks like this:

```
biogears_service/
└── engine/
    └── BioGears/
        └── bin/
            ├── bg-cli.exe          ← Windows executable (main entry point)
            ├── bg-cli              ← Linux executable
            ├── libbiogears.dll     ← Required DLLs (Windows)
            ├── xerces-c_3_2.dll    ← Required DLLs (Windows)
            ├── Scenarios/
            │   └── API/            ← Scenario XMLs are generated here at runtime
            ├── substances/         ← Required: 79 substance definitions
            ├── environments/       ← Required: environment files
            ├── nutrition/          ← Required: nutrition data files
            └── patients/           ← Reference patient baseline files
```

> The path is configured in `biogears_service/simulation/config.py`. If you install BioGears elsewhere, update `BIOGEARS_BIN_DIR` in that file.

### Step 6 — Verify path configuration

Open `biogears_service/simulation/config.py` and confirm the paths:

```python
# Base directory is automatically detected as the project root
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# BioGears binary location
BIOGEARS_BIN_DIR = BASE_DIR / "biogears_service" / "engine" / "BioGears" / "bin"
BIOGEARS_EXECUTABLE = BIOGEARS_BIN_DIR / "bg-cli.exe"   # Windows
# BIOGEARS_EXECUTABLE = BIOGEARS_BIN_DIR / "bg-cli"     # Linux (uncomment)

# Clinical data (auto-created on first run)
USER_STATES_DIR  = BASE_DIR / "clinical_data" / "states"
USER_HISTORY_DIR = BASE_DIR / "clinical_data" / "history"
```

### Step 7 — Run the server

```bash
# Development mode (auto-reload on file changes)
# IMPORTANT: Use python -m uvicorn, not just uvicorn
$env:PYTHONIOENCODING='utf-8'   # Windows: prevent emoji encoding errors in logs
python -m uvicorn biogears_service.api.server:app --host 0.0.0.0 --port 8000 --reload

# Linux / macOS
PYTHONIOENCODING=utf-8 python -m uvicorn biogears_service.api.server:app --host 0.0.0.0 --port 8000 --reload

# Production mode (multiple workers)
python -m uvicorn biogears_service.api.server:app --host 0.0.0.0 --port 8000 --workers 4
```

Expected startup output:

```
==================================================
[BIOGEARS] SYSTEM PATH CHECK
==================================================
Base Directory      : PASS (C:\health-digital-twin\health-digital-twin)
User States         : PASS (C:\...\clinical_data\states)
User History        : PASS (C:\...\clinical_data\history)
Scenario API        : PASS (C:\...\BioGears\bin\Scenarios\API)
Reports Folder      : PASS (C:\...\reports)

INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Application startup complete.
```

Verify the server is online:
- **Swagger UI (interactive API docs):** http://localhost:8000/docs
- **ReDoc (alternative docs):** http://localhost:8000/redoc
- **Health check:** http://localhost:8000/health

### Step 8 — (Optional) Enable API key protection

By default, all endpoints are open — suitable for local development. For production, set an API key:

```bash
# Windows PowerShell
$env:DIGITAL_TWIN_API_KEY = "your-secret-key-here"

# Linux / macOS
export DIGITAL_TWIN_API_KEY="your-secret-key-here"
```

When set, all endpoints except `/health` require the header:
```
X-API-Key: your-secret-key-here
```

---

## 📱 Frontend Setup

### Step 1 — Navigate to the VitalHealth directory

```bash
cd VitalHealth
```

### Step 2 — Install npm dependencies

```bash
npm install
```

This installs ~1,050 packages including Expo SDK 54, React Native 0.81, Firebase, Notifee, Vision Camera, and all native modules.

### Step 3 — Configure Firebase

The app uses Firebase for authentication and cloud data sync.

1. Create a project at **https://console.firebase.google.com**
2. Add an **Android app** (package name: `com.monish2005.vitaltwin`)
3. Download `google-services.json` and place it at `VitalHealth/google-services.json`
4. Enable **Authentication → Email/Password** in the Firebase console
5. Enable **Firestore Database** in test mode (or configure security rules)

> ⚠️ The existing `google-services.json` in the repo is a placeholder. Replace it with your own from the Firebase console.

### Step 4 — Configure the BioGears backend URL

Open `VitalHealth/services/biogears.ts` and update line 8:

```typescript
// For a physical device on the same Wi-Fi as your development machine:
// Replace with YOUR machine's local IP address (run ipconfig/hostname -I)
const DEFAULT_BASE_URL = 'http://192.168.X.X:8000';

// For an Android emulator (emulator maps 10.0.2.2 to host localhost):
const DEFAULT_BASE_URL = 'http://10.0.2.2:8000';
```

**Finding your machine's local IP:**
- Windows: Run `ipconfig` → look for `IPv4 Address` under your Wi-Fi adapter
- Linux: Run `hostname -I`
- macOS: Run `ipconfig getifaddr en0`

> Both your phone and development machine must be on the **same Wi-Fi network** for the device to reach the backend.

> 💡 **You can also change the server URL at runtime inside the app** — go to the AI Health tab → tap the settings (⚙️) icon → enter your server IP.

### Step 5 — Build the Expo Development Client

VitalHealth uses native modules (Notifee for background notifications, Vision Camera for rPPG, react-native-sensors for the pedometer) that **require a custom development build**. The standard Expo Go app will not work.

#### Option A — Build with EAS (recommended for most contributors)

EAS (Expo Application Services) builds your app in the cloud — no Android SDK needed on your machine.

```bash
# Install EAS CLI globally
npm install -g eas-cli

# Log in to your Expo account (create one free at expo.dev)
eas login

# Build the Android development client
# This takes 5–15 minutes and produces an APK you install on your device
eas build --profile development --platform android
```

After the build completes, install the downloaded APK on your Android device.

#### Option B — Build locally (requires Android Studio + SDK)

```bash
# Build and install directly to a connected Android device or emulator
npx expo run:android

# Build for iOS (macOS only, requires Xcode)
npx expo run:ios
```

### Step 6 — Start the Metro bundler

```bash
npx expo start
```

Or, if you have the development client installed:

```bash
npx expo start --dev-client
```

Scan the QR code shown in the terminal with your installed VitalHealth dev client app.

---

## 🔌 Connecting App to Backend

Once both the server and app are running:

1. **Complete onboarding** — the app collects your clinical profile (demographics + medical history)
2. **Twin Registration** — on the final onboarding step, the app calls `POST /register`. The backend runs BioGears calibration (30–120 seconds). Wait for the success message.
3. **Navigate to the Twin tab** — you'll see your Digital Twin dashboard with simulated vitals
4. **Log daily events** — use the 7-tab Routine Logger to record meals, exercise, sleep, substances, water, stress, or fasting
5. **Run Simulation** — tap **Simulate** to send your logged events to BioGears. Results (vitals + health report) appear in ~10–120 seconds depending on the number of events

**If the connection fails, check:**
- Server is running → `http://your-ip:8000/health` should return `"status": "healthy"`
- Your phone and PC are on the **same Wi-Fi network**
- The `DEFAULT_BASE_URL` in `services/biogears.ts` matches your PC's actual IP (not `localhost` on a physical device)
- Windows Firewall is not blocking port 8000 (add an inbound rule if needed)
- Run `ipconfig` again — your IP may have changed since you last set it

---

## 🔬 How It Works — End to End

### 1. Onboarding & Twin Registration

When a user completes the onboarding form, the app collects:
- **Demographics:** age, weight (kg), height (cm), sex, body fat %
- **Baseline vitals:** resting heart rate, systolic/diastolic blood pressure
- **Medical history:** Type 1 / Type 2 diabetes, anemia, smoking status
- **Extended clinical data:** HbA1c (%), ethnicity, fitness level, VO₂max, current medications

This data is sent to `POST /register`. The backend:
1. Validates all inputs with physiological range checks (e.g., age 1–120, weight 20–300 kg)
2. Calls `patient_builder.py` to generate a BioGears-format patient XML
3. Calls `scenario_builder.py` to build a stabilization scenario XML
4. Calls `engine_runner.py` → launches `bg-cli.exe` as a child process
5. BioGears runs the stabilization (30–120 seconds of wall-clock time)
6. The resulting `.xml` state file (the "physiology" of this twin) is saved to `clinical_data/states/`
7. Demographics and metadata are stored in the flat-file profile database

### 2. Daily Event Logging

Throughout the day, users log events in the app. Each event has:

| Field | Values |
|---|---|
| `event_type` | `meal` · `exercise` · `sleep` · `substance` · `water` · `stress` · `alcohol` · `fast` |
| `value` | Calories (meals), Intensity 0–1.0 (exercise), Hours (sleep), mL (water) |
| `timestamp` | Unix epoch — the **actual time** the event occurred |
| `meal_type` | `balanced` · `high_carb` · `high_protein` · `fast_food` · `ketogenic` · `custom` |
| `carb_g / protein_g / fat_g` | For custom meals (grams) |
| `substance_name` | One of 79 supported substances (caffeine, ethanol, morphine, etc.) |
| `duration_seconds` | Exercise or stress duration |

Events accumulate in `BiogearsTwinContext` until the user taps **Simulate**.

### 3. Simulation (`POST /sync/batch`)

The batch sync is the core of the system. It runs through 6 stages:

```
[1/6] Rate limit check          → max 10 sims/hr per user (configurable)
[2/6] Event validation          → range checks + drug interaction detection
[3/6] Scenario XML generation   → scenario_builder.py creates a BioGears XML file that:
                                   - Loads the user's saved state file
                                   - Inserts each event as a BioGears action at the correct simulation time
                                   - Handles time gaps between the last sync and now
[4/6] BioGears engine           → bg-cli.exe runs the scenario (10–120 seconds)
[5/6] Result capture            → output CSV (one row per simulation second) is captured
[6/6] Analytics + report        → vitals extracted, anomalies detected, matplotlib PNG generated
```

After completion:
- The last row of the CSV provides the final vitals snapshot (heart rate, BP, glucose, etc.)
- The BioGears state file is **updated** — the twin's physiology now reflects all the logged events
- A new backup of the previous state is stored (rolling 7-backup window)

### 4. Insights & Analytics

The Insights screen calls analytics endpoints that operate **entirely on stored CSVs** — no new simulations:

| Endpoint | Method | Description |
|---|---|---|
| Health Score | Scores each vital against its normal range, computes a 0–100 weighted composite |
| Organ Scores | Groups vitals anatomically (heart = HR + BP; lungs = SpO₂ + RR; gut = glucose + temp) |
| Trends | Fits linear regression to per-session averages → "increasing", "decreasing", or "stable" |
| CVD Risk | Framingham point score with South Asian ethnicity multiplier (1.5×) |
| HbA1c Prediction | ADAG formula: `HbA1c = (mean_glucose + 46.7) / 28.7` |
| Time-in-Range | Diabetic metric: % of simulation time with glucose in 70–180 mg/dL range |
| Sleep Debt | Sum of (target_sleep_hours − actual_sleep_hours) across all logged sessions |

### 5. On-Device RAG (AI Health Chat)

The AI Health Chat implements a privacy-first Retrieval-Augmented Generation pipeline:

```
1. User uploads a PDF / image (lab report, prescription, etc.)
2. On-device: Text extracted (PDF parser / OCR)
3. On-device: Text split into chunks (500 tokens, 100-token overlap)
4. On-device: Each chunk is embedded using a local embedding model → vector
5. All chunks + vectors stored in AsyncStorage (never leave the device)
─────────────────────── (Upload complete, everything above is on-device)

At query time:
6. On-device: User query is embedded using the same model
7. On-device: Cosine similarity search retrieves the top-5 most relevant chunks
8. Only these 5 text chunks + the query are sent to your local LLM server
9. LLM generates a response grounded in your actual medical documents
```

The LLM server is a separate component (e.g., Ollama, LM Studio) running on your laptop. **No medical data is sent to any external API.**

### 6. Brain Lab (Cognitive Assessment)

4 tests run sequentially, each measuring a distinct cognitive domain:

| Test | Measures | Scoring |
|---|---|---|
| **Pattern Test** | Visuospatial working memory — remember and reproduce a grid pattern | Based on correct cells and sequence length |
| **Reaction Test** | Neural processing speed — tap as fast as possible when target appears | Based on mean reaction time (ms) |
| **Memory Test** | Working memory span — remember and repeat a growing sequence of digits | Based on maximum span achieved |
| **Stroop Test** | Executive function — name the color of a word, not the word itself | Based on accuracy × speed |

The `brainEngine.ts` module normalizes each raw score to 0–100, computes a weighted composite, and generates a letter grade + personalized insight.

---

## 📡 API Reference

All endpoints require the `X-API-Key` header when `DIGITAL_TWIN_API_KEY` environment variable is set. Full interactive documentation available at **http://localhost:8000/docs**.

### Health & Root

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/` | None | API info and endpoint map |
| `GET` | `/health` | None | Server health + system component check |

### Twin Registration & Profiles

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/register` | ✓ | Register a new Digital Twin from demographics |
| `GET` | `/profiles` | ✓ | List all registered twins (filterable by sex, age, conditions) |
| `GET` | `/profiles/{user_id}` | ✓ | Get metadata for one twin |
| `DELETE` | `/profiles/{user_id}` | ✓ | Permanently delete a twin and all data |

### Simulation

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/sync/batch` | ✓ | Run BioGears simulation for a batch of events (blocking) |
| `POST` | `/sync/single` | ✓ | Convenience wrapper — log a single event |
| `POST` | `/simulate/async` | ✓ | Start async simulation — returns `job_id` immediately |
| `GET` | `/jobs/{job_id}` | ✓ | Poll async simulation status |

### History & Reports

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/history/{user_id}` | ✓ | List all simulation sessions |
| `GET` | `/history/{user_id}/{session_id}` | ✓ | Get timeseries vitals (up to 100 data points) |
| `GET` | `/reports/{user_id}` | ✓ | List generated health report PNGs |
| `GET` | `/view-reports/{filename}` | None | Serve a report PNG directly |

### Analytics

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/health-score/{user_id}` | ✓ | 0–100 composite health score, graded A–F |
| `GET` | `/analytics/organ-scores/{user_id}` | ✓ | Per-organ health scores |
| `GET` | `/analytics/trends/{user_id}` | ✓ | Vital trend trajectories across sessions |
| `GET` | `/analytics/cvd-risk/{user_id}` | ✓ | 10-year cardiovascular risk % |
| `GET` | `/analytics/predicted-hba1c/{user_id}` | ✓ | Estimated HbA1c from simulated glucose |
| `GET` | `/analytics/time-in-range/{user_id}/{session_id}` | ✓ | Diabetic glucose TIR metrics |
| `GET` | `/analytics/recovery-readiness/{user_id}` | ✓ | Post-exercise recovery readiness score |
| `GET` | `/analytics/sleep-debt/{user_id}` | ✓ | Cumulative sleep debt (hours) |
| `GET` | `/analytics/weekly-summary/{user_id}` | ✓ | 7-day health summary |
| `GET` | `/metrics/{user_id}` | ✓ | BMI, BSA, ideal body weight from stored profile |
| `GET` | `/vitals/{user_id}/trends` | ✓ | Vital trend trajectory data |
| `GET` | `/substances` | ✓ | List all 79 supported substances grouped by route |

### Streaming

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/stream/start` | ✓ | Start a live-streaming simulation |
| `GET` | `/stream/{stream_id}` | ✓ | SSE endpoint — receive vitals rows as they are computed |

---

### Example: Register a Twin

```bash
curl -X POST http://localhost:8000/register \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "alice_001",
    "age": 28,
    "weight": 62.5,
    "height": 165,
    "sex": "Female",
    "body_fat": 0.22,
    "resting_hr": 68,
    "systolic_bp": 115,
    "diastolic_bp": 75,
    "has_type2_diabetes": false,
    "is_smoker": false,
    "fitness_level": "active",
    "ethnicity": "South Asian"
  }'
```

Expected response (after ~60 seconds BioGears stabilization):
```json
{
  "status": "success",
  "message": "Twin 'alice_001' calibrated."
}
```

---

### Example: Log a Full Day and Run Simulation

```bash
curl -X POST http://localhost:8000/sync/batch \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "alice_001",
    "events": [
      {
        "event_type": "sleep",
        "value": 7.5,
        "timestamp": 1712300000
      },
      {
        "event_type": "meal",
        "value": 450,
        "timestamp": 1712320000,
        "meal_type": "balanced",
        "carb_g": 55,
        "protein_g": 30,
        "fat_g": 15
      },
      {
        "event_type": "exercise",
        "value": 0.6,
        "timestamp": 1712340000,
        "duration_seconds": 1800
      },
      {
        "event_type": "water",
        "value": 500,
        "timestamp": 1712345000
      }
    ]
  }'
```

Expected response:
```json
{
  "status": "success",
  "vitals": {
    "heart_rate": 72.3,
    "blood_pressure": "118/76",
    "glucose": 94.2,
    "respiration": 15.1,
    "spo2": 98.4,
    "core_temperature": 37.1,
    "cardiac_output": 5.2,
    "map": 90.0,
    "stroke_volume": 71.8
  },
  "report_url": "http://127.0.0.1:8000/view-reports/alice_001_20260420_143000_report.png",
  "has_anomaly": false,
  "anomalies": [],
  "has_drug_interaction": false,
  "interaction_warnings": [],
  "data_gap_warning": null
}
```

---

## ⚙️ Environment Variables

### Backend

| Variable | Default | Description |
|---|---|---|
| `DIGITAL_TWIN_API_KEY` | *(empty — auth disabled)* | API key for endpoint authentication. Set to enable. |
| `SIM_RATE_LIMIT` | `10` | Max simulations per user per rolling window |
| `SIM_RATE_WINDOW` | `3600` | Rate limit window in seconds (default: 1 hour) |
| `ENGINE_TIMEOUT_SECONDS` | `600` | Max seconds before BioGears engine process is killed |
| `PYTHONIOENCODING` | system default | Set to `utf-8` on Windows to prevent emoji encoding errors in logs |

### Frontend

The BioGears backend URL is configured in `services/biogears.ts`:

```typescript
// Line 8 — update this to your machine's local IP
const DEFAULT_BASE_URL = 'http://192.168.X.X:8000';
```

The URL can also be changed at runtime from within the app (AI Health tab → ⚙️ Server Settings).

---

## 🐛 Troubleshooting

### Backend Issues

| Error | Cause | Fix |
|---|---|---|
| `Fatal error in launcher: Unable to create process` | `venv` was copied from another machine — broken absolute paths | Delete `venv`, recreate with `python -m venv venv`, reinstall deps |
| `No Python at '...'` | The venv Python path doesn't exist | Same as above — recreate venv |
| `UnicodeEncodeError: 'charmap' codec can't encode` | Windows terminal using cp1252, can't print emoji | Set `$env:PYTHONIOENCODING='utf-8'` before running uvicorn |
| `ModuleNotFoundError: No module named 'biogears_service'` | Running uvicorn from wrong directory | Make sure you are in `health-digital-twin/health-digital-twin/` (the project root, not inside `biogears_service/`) |
| Engine returns `❌ FAIL` for paths | BioGears binary not in expected location | Check `config.py` paths, verify `bg-cli.exe` exists at `BIOGEARS_BIN_DIR` |
| Simulation times out | Large event batch or slow CPU | Increase `ENGINE_TIMEOUT_SECONDS` env var |

### Frontend Issues

| Error | Cause | Fix |
|---|---|---|
| `Cannot connect to server` | Wrong IP or phone/PC not on same Wi-Fi | Run `ipconfig`, update `DEFAULT_BASE_URL` in `biogears.ts` |
| App crashes immediately | Missing or wrong Firebase config | Replace `google-services.json` with your own from Firebase console |
| `npm install` fails | Node.js version too old | Upgrade to Node.js 18+ |
| Native module not found | Using Expo Go instead of dev build | Build via EAS (`eas build --profile development`) |
| Expo QR code not scanning | Dev client not installed | Install the APK from EAS build first, then scan |

### Simulation Issues

| Symptom | Cause | Fix |
|---|---|---|
| Registration succeeds but state file not created | `bg-cli.exe` crashed | Check `logs/engine_*.log` — look for BioGears error messages |
| Vitals are `null` after simulation | CSV output not captured in time | Check `BIOGEARS_BIN_DIR` for leftover `*Results.csv` files. May be a path issue. |
| Rate limit error (429) | More than 10 sims/hr | Wait or increase `SIM_RATE_LIMIT` env var |

---

## 🤝 Contributing

We welcome contributions of all kinds — bug fixes, new features, documentation improvements, and BioGears scenario additions.

### Getting Started

1. Fork the repository on GitHub
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Follow the setup instructions above for both backend and frontend
4. Make your changes with clear, commented code
5. Test both the backend (via `/docs`) and the frontend app
6. Submit a pull request with a clear description of what you changed and why

### Code Style

- **Python (backend):** Follow PEP 8. Use type hints where possible. Document new endpoints with docstrings.
- **TypeScript (frontend):** Follow the existing patterns in context and services files. Use explicit types; avoid `any`.
- **Comments:** Comment non-obvious logic, especially anything related to BioGears XML structure or physiological calculations.

### What We're Looking For

- **New BioGears events** — adding support for more exercise types, environmental conditions, or substances in `scenario_builder.py`
- **Linux deployment support** — testing and documenting the Linux `bg-cli` path
- **Additional analytics** — new health metrics derived from simulation CSVs in `analytics.py`
- **UI improvements** — new screens or improvements to existing ones in the React Native app
- **Documentation** — translations, guides, examples

---

## ⚕️ Disclaimer

> **This is a research simulation tool, not a medical device.**
>
> All outputs — vital signs, health scores, risk estimates, HbA1c predictions, cognitive scores — are derived from computational models and physiological simulations. They are **not validated for clinical use** and should **not** be used for diagnosis, treatment decisions, or any clinical or medical purpose.
>
> The BioGears engine is a peer-reviewed research tool. Results may differ significantly from individual real physiology due to model assumptions, parameter uncertainties, and inter-patient variability.
>
> The AI Health Chat feature uses retrieval-augmented generation over user-supplied documents. Responses are not reviewed by medical professionals and may be inaccurate.
>
> The Brain Lab cognitive tests are inspired by validated neuropsychological paradigms but are implemented as mobile games and are **not diagnostic tools**.
>
> **Always consult a qualified healthcare professional for medical advice.**

---

## 📖 References

### Core Technologies
- **BioGears Engine:** https://biogearsengine.com | [GitHub](https://github.com/BioGearsEngine/core)
- **FastAPI:** https://fastapi.tiangolo.com
- **Expo / React Native:** https://expo.dev
- **Firebase:** https://firebase.google.com
- **Notifee (Notifications):** https://notifee.app
- **React Native Vision Camera:** https://react-native-vision-camera.com

### Clinical & Physiological References
- **Framingham CVD Risk Score:** D'Agostino et al., *Circulation* 2008;117:743–753
- **ADAG HbA1c Formula:** Nathan et al., *Diabetes Care* 2008;31:1473–1478
- **Mifflin-St Jeor BMR:** Mifflin et al., *JADA* 1990;90(3):375–381
- **ADA Glucose Time-in-Range:** American Diabetes Association, *Diabetes Care* 2023;46(Suppl 1)
- **WHO South Asian BMI Thresholds:** WHO Expert Consultation, *Lancet* 2004;362:157–163
- **Stroop Effect:** Stroop JR, *Journal of Experimental Psychology* 1935;18(6):643–662
- **Working Memory Span:** Miller GA, *Psychological Review* 1956;63(2):81–97
- **rPPG Heart Rate:** Verkruysse W et al., *Optics Express* 2008;16(26):21434–21445
