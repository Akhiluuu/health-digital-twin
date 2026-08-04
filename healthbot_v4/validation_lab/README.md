# VitalHealth Automated Validation Laboratory (`validation_lab`)

> **Location:** `healthbot_v4/validation_lab/`  
> **Target Release:** Health Brain v5.0 / Release Candidate RC1  
> **Purpose:** Permanent, continuous release validation framework for automated quality gate verification.

---

## 1. Overview

The **Validation Laboratory** is a production-grade release verification engine embedded into the VitalHealth repository. It automatically tests every system component, API microservice, clinical reasoning rule, BioGears physiological twin simulation, OCR extraction pipeline, and end-to-end user journey across 12 realistic clinical patient personas.

Unlike one-off unit tests, the Validation Laboratory serves as the **definitive source of release confidence** for current and future versions (v5.1, v6, v7) of VitalHealth.

---

## 2. Directory Architecture

```
healthbot_v4/validation_lab/
├── __init__.py                # Package initialization
├── validation_runner.py       # Main CLI entry point & Quality Gate evaluator
├── scenario_engine.py         # Automated scenario execution engine
├── scenario_loader.py         # 16-category test scenario registry
├── persona_factory.py         # 12 clinical patient personas generator
├── assertions.py              # Clinical safety, performance, OCR & security assertions
├── metrics.py                 # Latency, reliability & quality gate score accumulator
├── report_generator.py        # JSON, Markdown & responsive HTML report generator
├── dashboard_export.py        # Developer Dashboard telemetry exporter
├── README.md                  # System architecture documentation
├── test_data/                 # Clinical test datasets (lab PDFs, sample Rx)
├── fixtures/                  # Mock response payloads & network stubs
├── personas/                  # Exported persona JSON files
├── reports/                   # Output directory (HTML, JSON, MD validation reports)
├── logs/                      # Execution trace logs
└── results/                   # Dashboard integration metrics (dev_dashboard_validation.json)
```

---

## 3. How to Run the Validation Laboratory

### Command Line Interface (CLI)

Run the full Validation Laboratory suite across all 16 categories:

```bash
python3 healthbot_v4/validation_lab/validation_runner.py
```

Run for a specific clinical persona (e.g. `type2_diabetes`, `heart_failure`, `pediatric`, `pregnancy`):

```bash
python3 healthbot_v4/validation_lab/validation_runner.py --persona heart_failure
```

Filter execution by category (e.g. `authentication`, `ai`, `ocr`, `twin`, `e2e_journeys`, `security`):

```bash
python3 healthbot_v4/validation_lab/validation_runner.py --category ai
```

---

## 4. Quality Gate Evaluation Logic

The Validation Laboratory automatically evaluates execution metrics against configurable release thresholds:

| Quality Gate Decision | Condition Criteria | CI/CD Action |
| :--- | :--- | :--- |
| **`READY FOR RELEASE`** 🟢 | 0 Critical Failures, 0 High Failures, Reliability Score ≥ 95.0% | Build Passes (`Exit 0`) |
| **`READY WITH MINOR FIXES`** 🟡 | 0 Critical Failures, High Failures > 0 OR Reliability Score 80.0%–94.9% | Build Warning (`Exit 0`) |
| **`NOT READY`** 🔴 | Critical Failures > 0 OR Reliability Score < 80.0% | Build Fails (`Exit 1`) |

---

## 5. Developer Dashboard Integration

Validation Laboratory telemetry is automatically exported to `healthbot_v4/validation_lab/results/dev_dashboard_validation.json` upon completion, feeding live release metrics directly into `dev_dashboard.py`.
