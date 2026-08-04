"""
VitalHealth AI Acceptance Testing Platform — Report Generator
Generates Markdown, HTML, and JSON reports covering all 15 acceptance testing metrics.
"""

import json
import os
import time
from typing import List, Dict, Any
from healthbot_v4.ai_acceptance.evaluator import EvaluationScore
from healthbot_v4.ai_acceptance.acceptance_score import ReleaseGateResult

REPORTS_DIR = "/home/akhilreddy/health-digital-twin/healthbot_v4/ai_acceptance/reports"

class ReportGenerator:
    """Generates comprehensive AI Acceptance Reports in Markdown, HTML, and JSON formats."""

    @staticmethod
    def generate_all_reports(
        scores: List[EvaluationScore],
        gate_result: ReleaseGateResult,
        failures: List[Dict[str, Any]],
        responses_log: List[Dict[str, Any]]
    ):
        os.makedirs(REPORTS_DIR, exist_ok=True)

        json_path = os.path.join(REPORTS_DIR, "AI_ACCEPTANCE_REPORT.json")
        md_path = os.path.join(REPORTS_DIR, "AI_ACCEPTANCE_REPORT.md")
        html_path = os.path.join(REPORTS_DIR, "AI_ACCEPTANCE_REPORT.html")

        # 1. Generate JSON Report
        json_data = {
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "release_gate": {
                "production_ready": gate_result.production_ready,
                "overall_score": gate_result.overall_score,
                "emergency_detection_rate": gate_result.emergency_detection_rate,
                "personalization_rate": gate_result.personalization_rate,
                "cross_user_leakage": gate_result.cross_user_leakage_count,
                "unsafe_advice": gate_result.unsafe_advice_count,
                "critical_hallucinations": gate_result.critical_hallucination_count,
                "regression_failures": gate_result.regression_failures_count,
                "gate_details": gate_result.gate_details
            },
            "scenarios_evaluated": len(scores),
            "failures_logged": len(failures)
        }
        with open(json_path, "w") as f:
            json.dump(json_data, f, indent=2)

        # 2. Generate Markdown Report
        md_content = f"""# 🏥 VitalHealth AI Acceptance Testing Official Report

**Execution Timestamp:** `{json_data['timestamp']}`  
**Overall AI Acceptance Status:** {"🟢 **PRODUCTION READY (PASSED)**" if gate_result.production_ready else "🔴 **RELEASE BLOCKED (FAILED GATES)**"}

---

## 🎯 Production Release Gate Summary

| Quality Gate Metric | Required SLA | Actual Score | Gate Status |
| :--- | :--- | :--- | :--- |
"""
        for gate in gate_result.gate_details:
            status_icon = "🟢 PASSED" if gate["passed"] else "🔴 FAILED"
            md_content += f"| **{gate['gate']}** | `{gate['required']}` | `{gate['value']}` | {status_icon} |\n"

        md_content += f"""
---

## 📊 Capability Performance Breakdown

- **Total Scenarios Evaluated:** `{len(scores)}`
- **Overall Acceptance Score:** `{gate_result.overall_score}%`
- **Emergency Triage Rate:** `{gate_result.emergency_detection_rate}%`
- **Personalization Compliance:** `{gate_result.personalization_rate}%`

---

## 🚨 Failure & Quality Exception Logs

Total Failures Detected: `{len(failures)}`

"""
        if failures:
            for idx, fail in enumerate(failures[:10], 1):
                md_content += f"### {idx}. Scenario `{fail.get('scenario_id')}` (Persona: `{fail.get('persona_id')}`)\n"
                md_content += f"**User Query:** *{fail.get('user_query')}*\n\n"
                md_content += f"**Failures Detected:** {', '.join(fail.get('failures_detected', []))}\n\n"
        else:
            md_content += "🟢 **Zero critical failures logged across all evaluated interaction suites.**\n"

        md_content += """
---

## 🏆 Clinical Recommendations & Next Steps

1. **Continuous Regression Testing:** Maintain the automatic regression test suite to ensure no past failure recurs in future releases.
2. **Dynamic Context Tuning:** Periodically calibrate Qwen2.5 system context budgets for extreme multi-turn dialogues (>20 turns).
"""

        with open(md_path, "w") as f:
            f.write(md_content)

        # 3. Generate HTML Visual Dashboard
        html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>VitalHealth AI Acceptance Visual Dashboard</title>
    <style>
        body {{ font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; padding: 30px; background: #0f172a; color: #f8fafc; }}
        .header {{ background: #1e293b; padding: 25px; border-radius: 12px; margin-bottom: 25px; border: 1px solid #334155; }}
        .status-badge {{ display: inline-block; padding: 8px 16px; border-radius: 20px; font-weight: bold; font-size: 1.1em; }}
        .status-pass {{ background: #059669; color: #ffffff; }}
        .status-fail {{ background: #dc2626; color: #ffffff; }}
        .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin-bottom: 25px; }}
        .card {{ background: #1e293b; padding: 20px; border-radius: 12px; border: 1px solid #334155; }}
        .card-value {{ font-size: 2em; font-weight: bold; color: #38bdf8; margin-top: 10px; }}
        table {{ width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 12px; overflow: hidden; }}
        th, td {{ padding: 14px 18px; text-align: left; border-bottom: 1px solid #334155; }}
        th {{ background: #0f172a; color: #94a3b8; text-transform: uppercase; font-size: 0.85em; }}
    </style>
</head>
<body>
    <div class="header">
        <h1>🏥 VitalHealth AI Acceptance Visual Dashboard</h1>
        <p>Execution Date: {json_data['timestamp']}</p>
        <div class="status-badge {'status-pass' if gate_result.production_ready else 'status-fail'}">
            {"🟢 PRODUCTION READY (PASSED)" if gate_result.production_ready else "🔴 RELEASE BLOCKED (FAILED GATES)"}
        </div>
    </div>

    <div class="grid">
        <div class="card">
            <div>Overall Acceptance Score</div>
            <div class="card-value">{gate_result.overall_score}%</div>
        </div>
        <div class="card">
            <div>Emergency Triage Rate</div>
            <div class="card-value">{gate_result.emergency_detection_rate}%</div>
        </div>
        <div class="card">
            <div>Personalization Rate</div>
            <div class="card-value">{gate_result.personalization_rate}%</div>
        </div>
        <div class="card">
            <div>Regressions & Failures</div>
            <div class="card-value">{gate_result.regression_failures_count}</div>
        </div>
    </div>

    <h2>🛡️ Production Release Quality Gates</h2>
    <table>
        <thead>
            <tr><th>Quality Gate</th><th>Required SLA</th><th>Actual Value</th><th>Status</th></tr>
        </thead>
        <tbody>
"""
        for gate in gate_result.gate_details:
            badge_cls = "color: #34d399;" if gate["passed"] else "color: #f87171;"
            html_content += f"<tr><td><strong>{gate['gate']}</strong></td><td>{gate['required']}</td><td>{gate['value']}</td><td style='{badge_cls}font-weight:bold;'>{'PASSED' if gate['passed'] else 'FAILED'}</td></tr>\n"

        html_content += """
        </tbody>
    </table>
</body>
</html>
"""
        with open(html_path, "w") as f:
            f.write(html_content)

        print(f"✅ Generated AI Acceptance Reports: {md_path}, {html_path}, {json_path}")
