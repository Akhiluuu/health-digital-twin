"""
VitalHealth Validation Laboratory - Report Generator
Generates JSON, Markdown, and interactive standalone HTML validation reports.
"""

import json
import os
from typing import Dict, Any, List
from datetime import datetime

class ReportGenerator:
    """Generates multi-format validation reports for the laboratory."""

    @staticmethod
    def generate_json_report(summary: Dict[str, Any], results: List[Dict[str, Any]], output_path: str) -> None:
        payload = {
            "timestamp": datetime.now().isoformat(),
            "summary": summary,
            "results": results
        }
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)

    @staticmethod
    def generate_markdown_report(summary: Dict[str, Any], results: List[Dict[str, Any]], output_path: str) -> None:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        gate = summary.get("quality_gate", "NOT READY")
        gate_badge = "🟢 READY FOR RELEASE" if gate == "READY FOR RELEASE" else ("🟡 READY WITH MINOR FIXES" if gate == "READY WITH MINOR FIXES" else "🔴 NOT READY")

        md_content = f"""# VitalHealth Validation Laboratory - Official Release Report

> **Execution Date:** {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}  
> **Release Candidate:** VitalHealth v5.0 RC1  
> **Quality Gate Release Decision:** **{gate_badge}**

---

## Executive Summary

- **Total Validation Scenarios Executed:** {summary.get('total_tests', 0)}
- **Passed Scenarios:** {summary.get('passed', 0)} ✅
- **Failed Scenarios:** {summary.get('failed', 0)} ❌
- **System Reliability Score:** **{summary.get('reliability_pct', 0.0)}%**
- **Validation Run Duration:** {summary.get('duration_seconds', 0.0)} seconds
- **Gate Status Explanation:** {summary.get('quality_gate_explanation', '')}

---

## Category Execution Breakdown

| Category | Total Tests | Passed | Failed | Success Rate | Average Latency |
| :--- | :--- | :--- | :--- | :--- | :--- |
"""
        cat_scores = summary.get("category_scores", {})
        latencies = summary.get("average_latencies_ms", {})
        for cat, stats in cat_scores.items():
            tot = stats["total"]
            pas = stats["passed"]
            pct = round((pas / tot) * 100.0, 1) if tot > 0 else 100.0
            lat = latencies.get(cat, 0.0)
            md_content += f"| **{cat.upper()}** | {tot} | {pas} | {stats['failed']} | {pct}% | {lat:.2f}ms |\n"

        md_content += """
---

## Detailed Scenario Execution Matrix

| Scenario ID | Name | Category | Persona | Latency | Result |
| :--- | :--- | :--- | :--- | :--- | :--- |
"""
        for r in results:
            status_icon = "✅ PASS" if r["passed"] else "❌ FAIL"
            md_content += f"| `{r['id']}` | {r['name']} | {r['category']} | {r['persona_used']} | {r['latency_ms']}ms | {status_icon} |\n"

        with open(output_path, "w", encoding="utf-8") as f:
            f.write(md_content)

    @staticmethod
    def generate_html_report(summary: Dict[str, Any], results: List[Dict[str, Any]], output_path: str) -> None:
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        gate = summary.get("quality_gate", "NOT READY")
        color = "#10b981" if gate == "READY FOR RELEASE" else ("#f59e0b" if gate == "READY WITH MINOR FIXES" else "#ef4444")

        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>VitalHealth Validation Laboratory Report</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 30px; }}
        .header {{ background: #1e293b; padding: 24px; borderRadius: 16px; border: 1px solid #334155; margin-bottom: 24px; }}
        .badge {{ background: {color}20; color: {color}; border: 1px solid {color}; padding: 6px 14px; border-radius: 20px; font-weight: 800; font-size: 14px; display: inline-block; }}
        .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }}
        .card {{ background: #1e293b; padding: 20px; border-radius: 12px; border: 1px solid #334155; text-align: center; }}
        .card-num {{ font-size: 32px; font-weight: 800; color: #38bdf8; }}
        table {{ width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 12px; overflow: hidden; border: 1px solid #334155; margin-bottom: 24px; }}
        th, td {{ padding: 14px 18px; text-align: left; border-bottom: 1px solid #334155; }}
        th {{ background: #0f172a; color: #94a3b8; font-size: 12px; text-transform: uppercase; }}
        .pass {{ color: #10b981; font-weight: 700; }}
        .fail {{ color: #ef4444; font-weight: 700; }}
    </style>
</head>
<body>
    <div class="header">
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
                <h1 style="margin:0; font-size: 24px;">VitalHealth Validation Laboratory</h1>
                <p style="margin: 4px 0 0 0; color: #94a3b8;">Automated Release Candidate RC1 Verification Matrix</p>
            </div>
            <div class="badge">{gate}</div>
        </div>
    </div>

    <div class="grid">
        <div class="card"><div class="card-num">{summary.get('total_tests', 0)}</div><div style="color: #94a3b8; font-size: 12px;">Total Scenarios</div></div>
        <div class="card"><div class="card-num" style="color: #10b981">{summary.get('passed', 0)}</div><div style="color: #94a3b8; font-size: 12px;">Passed</div></div>
        <div class="card"><div class="card-num" style="color: #ef4444">{summary.get('failed', 0)}</div><div style="color: #94a3b8; font-size: 12px;">Failed</div></div>
        <div class="card"><div class="card-num" style="color: #38bdf8">{summary.get('reliability_pct', 0.0)}%</div><div style="color: #94a3b8; font-size: 12px;">Reliability Score</div></div>
    </div>

    <h2>Scenario Execution Matrix</h2>
    <table>
        <thead>
            <tr><th>ID</th><th>Scenario Name</th><th>Category</th><th>Persona</th><th>Latency</th><th>Result</th></tr>
        </thead>
        <tbody>
"""
        for r in results:
            cls = "pass" if r["passed"] else "fail"
            txt = "PASS" if r["passed"] else "FAIL"
            html += f"<tr><td><code>{r['id']}</code></td><td>{r['name']}</td><td>{r['category']}</td><td>{r['persona_used']}</td><td>{r['latency_ms']}ms</td><td class='{cls}'>{txt}</td></tr>\n"

        html += """
        </tbody>
    </table>
</body>
</html>
"""
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(html)
