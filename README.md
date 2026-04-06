<h1 align="center">
  <br>
  🫀 VitalHealth — AI-Powered Physiological Digital Twin
  <br>
</h1>

<p align="center">
  <b>A full-stack mobile health platform coupling a React Native app with a BioGears physiological simulation backend to create a real-time, personalized digital twin of the human body.</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Android%20%7C%20iOS-blue?style=flat-square" />
  <img src="https://img.shields.io/badge/Backend-FastAPI%20%2B%20BioGears-green?style=flat-square" />
  <img src="https://img.shields.io/badge/Frontend-Expo%20React%20Native-9cf?style=flat-square" />
  <img src="https://img.shields.io/badge/Python-3.11+-yellow?style=flat-square" />
  <img src="https://img.shields.io/badge/License-Research%20Only-red?style=flat-square" />
</p>

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Architecture](#-architecture)
- [Features](#-features)
- [Project Structure](#-project-structure)
- [Requirements](#-requirements)
- [Backend Installation Guide](#-backend-installation-guide)
- [Frontend Installation Guide](#-frontend-installation-guide)
- [Connecting App to Backend](#-connecting-app-to-backend)
- [API Reference](#-api-reference)
- [Environment Variables](#-environment-variables)
- [How It Works — End to End](#-how-it-works--end-to-end)
- [Disclaimer](#-disclaimer)
- [References](#-references)

---

## 🧬 Overview

**VitalHealth** is a research-grade health application that goes beyond step counters and calorie trackers. It uses the **BioGears Engine** — a peer-reviewed, open-source C++ human physiology simulator — to build a computational model (a "digital twin") of each user's body.

When a user logs an activity (a meal, a workout, a substance, sleep), the system doesn't just record it — it **runs a real physiological simulation** to compute how that event changes your heart rate, blood glucose, blood pressure, oxygen saturation, and dozens of other vitals over time.

The result is a continuously updated, clinically-informed snapshot of your internal physiology — something no wearable alone can provide.

---

## 🏛️ Architecture

```
┌──────────────────────────────────────────────────┐
│              VitalHealth Mobile App               │
│           (React Native + Expo Router)            │
│                                                  │
│  ┌─────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ Twin    │ │ Insights │ │  AI Health Chat  │  │
│  │ Screen  │ │ Screen   │ │  (Symptom Flow)  │  │
│  └────┬────┘ └────┬─────┘ └──────────────────┘  │
│       │           │                               │
│  ┌────▼───────────▼──────────────────────────┐   │
│  │        BiogearsTwinContext (React)         │   │
│  │        Firebase Auth + Firestore          │   │
│  └────────────────────┬──────────────────────┘   │
└───────────────────────┼──────────────────────────┘
                        │ HTTP (axios)
                        │ port 8000
┌───────────────────────▼──────────────────────────┐
│            BioGears Digital Twin API              │
│              (Python / FastAPI)                   │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  server.py  — REST endpoints               │  │
│  │  analytics.py — health score, CVD risk     │  │
│  │  streaming.py — SSE live vitals            │  │
│  │  db.py — JSON profile store                │  │
│  └────────────────┬───────────────────────────┘  │
│                   │                               │
│  ┌────────────────▼───────────────────────────┐  │
│  │  simulation/                               │  │
│  │  ├── scenario_builder.py  XML generation   │  │
│  │  ├── engine_runner.py     subprocess mgmt  │  │
│  │  ├── patient_builder.py   patient XML      │  │
│  │  ├── result_parser.py     CSV → JSON       │  │
│  │  ├── validator.py         input validation │  │
│  │  ├── substance_registry.py  79 substances  │  │
│  │  └── visualizer.py        matplotlib PNGs  │  │
│  └────────────────┬───────────────────────────┘  │
│                   │                               │
│  ┌────────────────▼───────────────────────────┐  │
│  │         BioGears Engine (bg-cli.exe)       │  │
│  │      Precompiled C++ binary (x86-64)       │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

---

## ✨ Features

### 📱 Mobile App (VitalHealth)

| Feature | Description |
|---|---|
| **Digital Twin Dashboard** | Live vitals panel: HR, glucose, BP, SpO₂, respiration, core temperature |
| **Routine Logger** | 7-tab daily logger: Nutrition, Hydration, Activity, Substances, Sleep, Stress, Fasting |
| **Physiological Insights** | Organ health scores (Heart, Lungs, Gut, Brain), trend charts, simulation history |
| **AI Health Chat** | Symptom flow, follow-up questioning, and health recommendations |
| **Calorie Intelligence** | Macro tracking with per-meal BioGears simulation |
| **Step Intelligence** | Real-time pedometer with foreground service and BioGears exercise sync |
| **Heart Rate Scanner** | Camera-based rPPG heart rate measurement using Vision Camera |
| **Hydration Tracker** | Water intake logging with notification reminders |
| **Nutrition Tracker** | Full meal logging with macros and BioGears synchronization |
| **Medication Vault** | Medicine schedule, dose reminders, and drug interaction warnings |
| **Symptom History** | Tracked symptom timeline with AI-generated follow-up questions |
| **Onboarding Flow** | Multi-step clinical profile setup (personal → medical → habits → review) |
| **Dark / Light Mode** | Full theme system across all screens |
| **Firebase Auth** | Email/password authentication and profile sync |

### 🖥️ Backend (BioGears API)

| Feature | Description |
|---|---|
| **Twin Registration** | Creates a calibrated BioGears patient state from demographics |
| **Batch Simulation** | Replays a full day of events chronologically through the engine |
| **Async Simulation** | Background job queue with polling endpoint |
| **SSE Streaming** | Live vital sign streaming via Server-Sent Events |
| **Health Score** | 0–100 composite score graded A–F from latest session |
| **Organ Scores** | Anatomical grouping of vitals for Heart/Lungs/Gut/Brain |
| **CVD Risk Score** | Simplified 10-year cardiovascular risk (Framingham + South Asian multiplier) |
| **HbA1c Prediction** | Estimated glycated haemoglobin from simulated glucose averages |
| **Time-in-Range (TIR)** | Diabetic glucose quality metric per session |
| **Recovery Readiness** | Exercise recovery score based on post-exercise vitals |
| **BMR & Caloric Balance** | Mifflin-St Jeor BMR with event-based burn estimation |
| **Sleep Debt Tracker** | Cumulative sleep debt across logged sessions |
| **What-If Scenarios** | Run alternative event outcomes without updating twin state |
| **Rate Limiting** | Per-user simulation rate limiting (configurable) |
| **API Key Auth** | Optional bearer key authentication for all endpoints |
| **Health Report PNG** | Multi-panel matplotlib clinical report auto-generated per session |

---

## 📁 Project Structure

```
health-digital-twin/
│
├── biogears_service/               # Python FastAPI backend
│   ├── api/
│   │   ├── server.py               # Main FastAPI app — all REST endpoints (~1300 lines)
│   │   ├── analytics.py            # Analytics engine — health scores, CVD, HbA1c, TIR
│   │   ├── db.py                   # Patient profile store (JSON flat-file database)
│   │   └── streaming.py            # SSE streaming for live simulation output
│   ├── engine/
│   │   └── BioGears/               # ← BioGears binary installed here (NOT in Git)
│   │       └── bin/
│   │           ├── bg-cli.exe      # BioGears CLI executable (Windows)
│   │           ├── Scenarios/API/  # Generated scenario XMLs land here
│   │           ├── substances/     # BioGears substance library
│   │           ├── environments/   # BioGears environment definitions
│   │           └── nutrition/      # Nutrition data files
│   └── simulation/
│       ├── config.py               # All path constants (single source of truth)
│       ├── scenario_builder.py     # Builds BioGears XML scenario files (~1000 lines)
│       ├── engine_runner.py        # Runs bg-cli.exe as a subprocess with timeout
│       ├── patient_builder.py      # Generates BioGears patient XML from demographics
│       ├── result_parser.py        # Parses output CSVs, detects anomalies
│       ├── validator.py            # Validates events and drug interactions
│       ├── substance_registry.py   # 79-substance database with route grouping
│       └── visualizer.py          # matplotlib report generator
│
├── clinical_data/                  # Runtime patient data (NOT committed)
│   ├── states/                     # BioGears XML state files per user
│   └── history/                    # Per-session vitals CSVs per user
│
├── reports/                        # Generated health report PNGs (NOT committed)
├── logs/                           # Server debug logs (NOT committed)
├── venv/                           # Python virtual environment (NOT committed)
│
├── requirements.txt                # Python dependencies (pinned)
├── .gitignore
└── README.md
│
└── VitalHealth/                    # React Native Expo app
    ├── app/
    │   ├── (tabs)/                 # Bottom tab screens
    │   │   ├── _layout.tsx         # Tab navigator config
    │   │   ├── index.tsx           # Home dashboard
    │   │   ├── twin.tsx            # Digital Twin screen (dual-mode)
    │   │   ├── history.tsx         # Physiological Insights screen
    │   │   ├── ai-health.tsx       # AI Health Chat
    │   │   └── insights.tsx        # Extra insights tab
    │   ├── onboarding/             # Multi-step onboarding flow
    │   │   ├── index.tsx           # Entry point
    │   │   ├── personal.tsx        # Step 1: demographics
    │   │   ├── medical.tsx         # Step 2: medical history
    │   │   ├── habits.tsx          # Step 3: lifestyle habits
    │   │   └── review.tsx          # Step 4: confirm & register
    │   ├── activity.tsx            # Step Intelligence screen
    │   ├── calorie-intelligence.tsx# Calorie tracking
    │   ├── hydration.tsx           # Water intake tracker
    │   ├── nutrition.tsx           # Full meal logger
    │   ├── heart-scanner.tsx       # rPPG heart rate measurement
    │   ├── AddMedicine.tsx         # Add medication form
    │   ├── MedicationVault.tsx     # Medication list and reminders
    │   ├── symptom-flow.tsx        # Symptom entry flow
    │   ├── symptom-followup.tsx    # AI follow-up questions
    │   ├── symptom-history.tsx     # Symptom timeline
    │   ├── profile.tsx             # User profile & settings
    │   ├── signin.tsx / signup.tsx # Authentication screens
    │   └── ...                     # Other utility screens
    ├── context/                    # React Context providers
    │   ├── BiogearsTwinContext.tsx  # Digital twin state (central hub)
    │   ├── NutritionContext.tsx    # Meal tracking state
    │   ├── HydrationContext.tsx    # Water intake state
    │   ├── MedicineContext.tsx     # Medication schedule state
    │   ├── ProfileContext.tsx      # User profile state
    │   ├── StepContext.tsx         # Step counter state
    │   ├── SymptomContext.tsx      # Symptom logging state
    │   └── ThemeContext.tsx        # Dark/light mode
    ├── services/
    │   ├── biogears.ts             # BioGears API client (axios)
    │   ├── firebase.ts             # Firebase initialization
    │   ├── firebaseSync.ts         # Cloud sync for all health data
    │   ├── foregroundStepService.ts# Background step counter (Notifee)
    │   ├── notifeeService.ts       # Push notification scheduling
    │   ├── profileService.ts       # Profile CRUD operations
    │   └── ...                     # Other service modules
    ├── theme/                      # Design tokens (colors, spacing)
    ├── types/                      # Shared TypeScript types
    ├── hooks/                      # Custom React hooks
    ├── assets/                     # App icons, splash screens, images
    ├── app.json                    # Expo configuration
    ├── package.json                # npm dependencies
    └── tsconfig.json               # TypeScript configuration
```

---

## 📋 Requirements

### Backend (Python Server)

| Requirement | Detail |
|---|---|
| **OS** | Windows 10/11 (x86-64) or Ubuntu 22.04 LTS |
| **CPU** | x86-64 ONLY — BioGears is NOT compiled for ARM |
| **RAM** | 8 GB minimum, 16 GB recommended |
| **Disk** | ~3 GB for BioGears engine + data files |
| **Python** | 3.11 or higher |
| **BioGears** | Pre-compiled binary (v7.x) — download separately (see below) |

> ⚠️ **ARM devices (Apple Silicon, Raspberry Pi, etc.) cannot run the BioGears engine.** The API server itself can run on ARM but without a compatible `bg-cli` binary, simulations will fail.

### Frontend (Mobile App)

| Requirement | Detail |
|---|---|
| **Node.js** | 20.x or higher |
| **npm** | 10.x or higher |
| **Expo CLI** | Installed via `npm install -g expo-cli` |
| **Android** | Physical device or emulator with API level 31+ |
| **iOS** | Physical device or simulator (iOS 16+) |
| **Expo Dev Build** | Required — standard Expo Go will NOT work (uses native modules) |
| **Firebase Project** | Required for auth and cloud sync |
| **EAS Account** | Required for building the dev client |

---

## 🖥️ Backend Installation Guide

### Step 1 — Clone the repository

```bash
git clone https://github.com/<your-username>/health-digital-twin.git
cd health-digital-twin
```

### Step 2 — Create a Python virtual environment

```bash
python -m venv venv
```

Activate it:

```bash
# Windows (PowerShell)
.\venv\Scripts\Activate.ps1

# Windows (CMD)
venv\Scripts\activate.bat

# Linux / macOS
source venv/bin/activate
```

### Step 3 — Install Python dependencies

```bash
pip install -r requirements.txt
```

This installs: FastAPI, Uvicorn, Pandas, NumPy, Matplotlib, Pydantic, and all other required packages (pinned to exact versions for reproducibility).

### Step 4 — Download and install BioGears engine binary

The BioGears engine is a compiled C++ binary that is **not included in this repository** (it's ~2 GB).

1. Go to: **https://github.com/BioGearsEngine/core/releases**
2. Download the release matching your OS (Windows x86-64 or Linux x86-64)
3. Extract the archive so that the directory structure looks like this:

```
biogears_service/
└── engine/
    └── BioGears/
        └── bin/
            ├── bg-cli.exe          ← Windows executable
            ├── bg-cli              ← Linux executable
            ├── Scenarios/
            │   └── API/            ← Scenario XMLs are written here at runtime
            ├── substances/         ← Required substance library
            ├── environments/       ← Required environment files
            ├── nutrition/          ← Required nutrition files
            └── patients/           ← Reference patient files
```

> The path is defined in `biogears_service/simulation/config.py`. If your BioGears installation is elsewhere, update `BIOGEARS_BIN_DIR` in that file.

### Step 5 — Verify path configuration

Open `biogears_service/simulation/config.py` and confirm:

```python
BIOGEARS_BIN_DIR = BASE_DIR / "biogears_service" / "engine" / "BioGears" / "bin"
BIOGEARS_EXECUTABLE = BIOGEARS_BIN_DIR / "bg-cli.exe"   # Windows
# BIOGEARS_EXECUTABLE = BIOGEARS_BIN_DIR / "bg-cli"     # Linux
```

### Step 6 — Run the server

```bash
# Development mode (auto-reload on file changes)
uvicorn biogears_service.api.server:app --host 0.0.0.0 --port 8000 --reload

# Production mode
uvicorn biogears_service.api.server:app --host 0.0.0.0 --port 8000 --workers 4
```

Expected startup output:

```
========================================
🔍 BIOGEARS SYSTEM PATH CHECK
========================================
Base Directory      : ✅ PASS (C:\health-digital-twin)
User States         : ✅ PASS (C:\health-digital-twin\clinical_data\states)
User History        : ✅ PASS (C:\health-digital-twin\clinical_data\history)
Scenario API        : ✅ PASS (C:\...\BioGears\bin\Scenarios\API)
Reports Folder      : ✅ PASS (C:\health-digital-twin\reports)

INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

- **API Explorer (Swagger UI):** http://localhost:8000/docs
- **Alternative docs (ReDoc):** http://localhost:8000/redoc
- **Health check:** http://localhost:8000/health

### Step 7 — (Optional) Set API key protection

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

## 📱 Frontend Installation Guide

### Step 1 — Navigate to the VitalHealth directory

```bash
cd VitalHealth
```

### Step 2 — Install npm dependencies

```bash
npm install
```

> This will install all 70+ dependencies including Expo SDK 55, React Native 0.83, Firebase, Notifee, and all native modules.

### Step 3 — Configure Firebase

1. Create a project at **https://console.firebase.google.com**
2. Add an **Android app** (package name: `com.monish2005.vitaltwin`)
3. Download `google-services.json` and place it at `VitalHealth/google-services.json`
4. Enable **Authentication → Email/Password** in the Firebase console
5. Enable **Firestore Database** in the Firebase console

### Step 4 — Configure the BioGears server URL

Open `services/biogears.ts` and set your server address:

```typescript
// For development (same PC):
const BASE_URL = 'http://localhost:8000';

// For device on same network (replace with your PC's local IP):
const BASE_URL = 'http://192.168.1.X:8000';
```

To find your PC's local IP:
- **Windows:** Run `ipconfig` → find `IPv4 Address` under your active adapter
- **Linux:** Run `hostname -I`

Both your phone and PC must be on the **same WiFi network**.

### Step 5 — Build the Expo Development Client

VitalHealth uses native modules (Notifee, Vision Camera, BLE sensors) that **require a custom dev build** — standard `Expo Go` will not work.

#### Option A: Build using EAS (recommended)

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to your Expo account
eas login

# Build Android dev client (OTA — downloads to your device)
eas build --profile development --platform android
```

Once built, install the APK on your Android device and open it.

#### Option B: Build locally (requires Android SDK)

```bash
# Build for Android
npx expo run:android

# Build for iOS (macOS only)
npx expo run:ios
```

### Step 6 — Start the Metro bundler

```bash
npx expo start --dev-client
```

Scan the QR code from the terminal using your installed dev client app.

---

## 🔌 Connecting App to Backend

Once both the server and app are running:

1. Open the app and complete the onboarding flow
2. The app will automatically attempt to register your Digital Twin with the backend
3. Once registered, navigate to the **Twin** tab to see your live digital twin
4. Log daily activities using the Routine Logger (7 tabs)
5. Tap **Run Simulation** to send your events to BioGears and receive updated vitals

If the connection fails, check:
- Server is running (`http://localhost:8000/health` returns `"status": "healthy"`)
- Your phone and PC are on the same WiFi network
- The `BASE_URL` in `services/biogears.ts` matches your PC's actual local IP
- Firewall is not blocking port 8000

---

## 📡 API Reference

All endpoints require `X-API-Key` header if `DIGITAL_TWIN_API_KEY` is set. Full interactive docs at `http://localhost:8000/docs`.

### Core Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Server health + system check (no auth required) |
| `POST` | `/register` | Register a new Digital Twin from demographics |
| `POST` | `/sync/batch` | Run BioGears simulation for a batch of events |
| `POST` | `/sync/single` | Log a single health event |
| `POST` | `/simulate/async` | Start async simulation (returns `job_id`) |
| `GET` | `/jobs/{job_id}` | Poll async simulation status |

### Profile Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/profiles` | List all registered twins (with optional filters) |
| `GET` | `/profiles/{user_id}` | Get single twin metadata |
| `DELETE` | `/profiles/{user_id}` | Permanently delete a twin and all data |

### History & Reports

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/history/{user_id}` | List all simulation sessions |
| `GET` | `/history/{user_id}/{session_id}` | Get timeseries vitals for one session |
| `GET` | `/reports/{user_id}` | List generated health report PNGs |

### Analytics Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health-score/{user_id}` | Composite 0–100 score graded A–F |
| `GET` | `/analytics/organ-scores/{user_id}` | Per-organ health scores for Twin UI |
| `GET` | `/analytics/trends/{user_id}` | Vital trend data across sessions |
| `GET` | `/analytics/cvd-risk/{user_id}` | 10-year cardiovascular risk % |
| `GET` | `/analytics/predicted-hba1c/{user_id}` | Estimated HbA1c from simulated glucose |
| `GET` | `/analytics/time-in-range/{user_id}/{session_id}` | Glucose TIR metrics |
| `GET` | `/analytics/recovery-readiness/{user_id}` | Post-exercise recovery readiness |
| `GET` | `/analytics/sleep-debt/{user_id}` | Cumulative sleep debt hours |
| `GET` | `/analytics/weekly-summary/{user_id}` | 7-day health summary |
| `GET` | `/metrics/{user_id}` | BMI, BSA, ideal body weight |
| `GET` | `/vitals/{user_id}/trends` | Vitals trend trajectory data |

### Streaming Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/stream/start` | Start a live-streaming simulation |
| `GET` | `/stream/{stream_id}` | SSE endpoint for live vitals rows |

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
    "diastolic_bp": 75
  }'
```

### Example: Log a Meal + Run Simulation

```bash
curl -X POST http://localhost:8000/sync/batch \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "alice_001",
    "events": [
      {
        "event_type": "meal",
        "value": 650,
        "timestamp": 1712345678,
        "meal_type": "balanced",
        "carb_g": 80,
        "protein_g": 40,
        "fat_g": 20
      },
      {
        "event_type": "exercise",
        "value": 0.6,
        "timestamp": 1712349278,
        "duration_seconds": 2700
      }
    ]
  }'
```

---

## ⚙️ Environment Variables

### Backend

| Variable | Default | Description |
|---|---|---|
| `DIGITAL_TWIN_API_KEY` | *(empty — auth disabled)* | API key for endpoint authentication |
| `SIM_RATE_LIMIT` | `10` | Max simulations per user per rolling window |
| `SIM_RATE_WINDOW` | `3600` | Rate limit window in seconds (default: 1 hour) |

### Frontend

The frontend reads the BioGears URL from `services/biogears.ts`. There is no `.env` file — just update the `BASE_URL` constant in that file.

---

## 🔬 How It Works — End to End

### 1. Onboarding & Twin Registration

When a user completes the onboarding form, the app collects:
- **Demographics:** age, weight, height, sex, body fat %
- **Vitals:** resting HR, systolic/diastolic BP
- **Medical history:** diabetes type, anemia, smoking status
- **Fitness level:** sedentary / active / athlete

This data is sent to `POST /register`. The backend:
1. Validates all inputs (range checks, physiological plausibility)
2. Calls `patient_builder.py` to generate a BioGears-format patient XML
3. Calls `scenario_builder.py` to build a stabilization scenario XML
4. Runs `engine_runner.py` → launches `bg-cli.exe` as a subprocess
5. BioGears runs the stabilization (30–120 seconds of wall clock time)
6. The resulting `.xml` state file (the twin's "physiology") is saved to `clinical_data/states/`
7. Demographics are stored in the JSON database (`twins_database.json`)

### 2. Daily Event Logging

Throughout the day, users log events in the app. Each event has:
- `event_type`: `meal` | `exercise` | `sleep` | `substance` | `water` | `stress` | `alcohol` | `fast`
- `value`: calories for meals, intensity 0–1 for exercise, hours for sleep, etc.
- `timestamp`: Unix epoch (actual time the event occurred)
- Optional fields: `meal_type`, `substance_name`, `duration_seconds`, custom macros

Events are accumulated in the app (in `BiogearsTwinContext`) until the user taps **Run Simulation**.

### 3. Simulation (`POST /sync/batch`)

The batch sync is the engine of the system:

1. **Rate limit check** — max 10 simulations/hr per user
2. **Validation** — each event is range-checked and drug-interaction-checked
3. **Chronological sort** — events are sorted by timestamp
4. **Scenario XML generation** — `scenario_builder.py` builds a BioGears XML file that:
   - Loads the user's saved state file
   - Inserts each event as a BioGears action (e.g., `<ForcedExhale>`, `<ConsumeNutrients>`, `<Substance>`)
   - Handles time gaps (advances the simulation clock to match real timestamps)
5. **Engine execution** — `bg-cli.exe` runs the scenario (typically 10–120 seconds)
6. **Result capture** — the output CSV (one row per simulation second) is moved to `clinical_data/history/`
7. **Analytics** — vitals are extracted from the last row of the CSV, anomalies are detected
8. **Report generation** — `visualizer.py` renders a multi-panel matplotlib PNG
9. **State update** — the new BioGears state XML (twin's updated physiology) is saved, replacing the old one

### 4. Insights & Analytics

The Insights screen calls analytics endpoints that operate **purely on stored CSVs** (no engine calls needed):

- **Health Score:** Scores each vital against its normal range, computes a 0–100 weighted composite
- **Organ Scores:** Groups vitals anatomically (heart = HR + BP, lungs = SpO₂ + RR, gut = glucose + temp)
- **Trends:** Fits linear regression to per-session averages to determine "increasing", "decreasing", or "stable"
- **CVD Risk:** Framingham point score with South Asian ethnicity multiplier (1.5×)
- **HbA1c Prediction:** ADAG formula: `HbA1c = (mean_glucose + 46.7) / 28.7`

---

## ⚕️ Disclaimer

> **This is a research simulation tool, not a medical device.**
>
> All outputs — vital signs, health scores, risk estimates, HbA1c predictions — are derived from computational models and physiological simulations. They are **not validated for clinical use** and should **not** be used for diagnosis, treatment decisions, or any clinical purpose.
>
> The BioGears engine is a peer-reviewed research tool. Results may differ from individual real physiology due to model assumptions and inter-patient variability.
>
> Always consult a qualified healthcare professional for medical advice.

---

## 📖 References

- **BioGears Engine:** https://biogearsengine.com/ — [GitHub](https://github.com/BioGearsEngine/core)
- **FastAPI:** https://fastapi.tiangolo.com/
- **Expo / React Native:** https://expo.dev/
- **Firebase:** https://firebase.google.com/
- **WHO South Asian BMI Thresholds (2004):** WHO Expert Consultation, Lancet, 362:157–163
- **Framingham Risk Score:** D'Agostino et al., Circulation 2008;117:743–753
- **ADAG HbA1c Formula:** Nathan et al., Diabetes Care 2008;31:1473–1478
- **Mifflin-St Jeor BMR:** Mifflin et al., JADA 1990;90(3):375–381
- **ADA Glucose TIR Standards:** American Diabetes Association, Diabetes Care 2023
