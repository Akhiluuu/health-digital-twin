# 🏥 VitalHealth AI Acceptance Testing Platform

The **VitalHealth AI Acceptance Testing Platform** is a permanent, production-grade clinical evaluation harness located in `healthbot_v4/ai_acceptance/`. It evaluates the clinical safety, personalization, multi-turn reasoning, and behavioral quality of VitalHealth's AI Physician across thousands of realistic patient interaction scenarios before every release.

---

## 📁 Directory Structure

```
healthbot_v4/ai_acceptance/
├── runner.py                 # Master CLI execution entrypoint
├── scenario_runner.py        # Asynchronous scenario orchestrator & latency timer
├── evaluator.py              # Multi-dimensional evaluator (17 scoring dimensions)
├── acceptance_score.py       # Aggregate scoring & Release Gate validator
├── report_generator.py       # Multi-format report builder (JSON, MD, HTML)
├── personas/
│   └── persona_factory.py    # 20 rich realistic patient personas
├── scenarios/
│   └── scenario_generator.py  # Scenario generator across 18 clinical capabilities
├── failures/
│   ├── failure_store.py      # Failure logger & regression persistence
│   ├── failure_log.json      # Permanent failure log
│   └── regression_cases.json # Permanent regression suite
├── review/
│   └── human_review_workflow.py # Expert clinical reviewer workflow & ratings
├── reports/                  # Generated acceptance test reports
│   ├── AI_ACCEPTANCE_REPORT.json
│   ├── AI_ACCEPTANCE_REPORT.md
│   └── AI_ACCEPTANCE_REPORT.html
└── README.md
```

---

## 🚀 Quick Start Instructions

### Run Full AI Acceptance Test Suite
```bash
/home/akhilreddy/health-digital-twin/healthbot_venv/bin/python3 -m healthbot_v4.ai_acceptance.runner --full
```

### Run Safety & Emergency Suite Only
```bash
/home/akhilreddy/health-digital-twin/healthbot_venv/bin/python3 -m healthbot_v4.ai_acceptance.runner --suite emergency
```

### Run Sampled Fast Acceptance Audit
```bash
/home/akhilreddy/health-digital-twin/healthbot_venv/bin/python3 -m healthbot_v4.ai_acceptance.runner --sample 10
```

---

## 🛡️ Production Release Quality Gates

| Quality Gate Metric | Required SLA | Description |
| :--- | :--- | :--- |
| **Overall Acceptance Score** | `≥ 90.0%` | Weighted average across all 17 clinical scoring dimensions |
| **Emergency Detection** | `100.0%` | Zero missed emergencies (chest pain, stroke, obstetric, pediatric) |
| **Personalization Rate** | `≥ 95.0%` | Accurate profile integration without cross-user leakage |
| **Cross-User Leakage** | `0` | Absolute zero patient context bleed across sessions |
| **Unsafe Advice** | `0` | Zero dangerous drug recommendations or contraindicated guidance |
| **Critical Hallucinations** | `0` | Zero fabricated medical claims or phantom labs |
| **Regression Failures** | `0` | Zero recurrences of previously logged failure cases |

---

## 📊 Evaluation Reports & Visual Dashboards

After execution, interactive reports are compiled into `healthbot_v4/ai_acceptance/reports/`:
- `AI_ACCEPTANCE_REPORT.md`: Markdown executive summary for CI/CD logs.
- `AI_ACCEPTANCE_REPORT.json`: Machine-readable artifact for release pipeline verification.
- `AI_ACCEPTANCE_REPORT.html`: Interactive dark-mode visual dashboard.
