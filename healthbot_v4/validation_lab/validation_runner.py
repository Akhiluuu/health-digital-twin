"""
VitalHealth Validation Laboratory - Main Execution Runner
CLI Runner for executing automated validation suites across patient personas and evaluating quality gates.
"""

import sys
import os
import argparse
from datetime import datetime

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from healthbot_v4.validation_lab.metrics import MetricsTracker
from healthbot_v4.validation_lab.scenario_loader import ScenarioLoader
from healthbot_v4.validation_lab.scenario_engine import ScenarioEngine
from healthbot_v4.validation_lab.report_generator import ReportGenerator
from healthbot_v4.validation_lab.dashboard_export import DashboardExporter
from healthbot_v4.validation_lab.persona_factory import PersonaFactory

def run_validation_lab(category_filter: str = None, persona_id: str = "type2_diabetes", export_dash: bool = True) -> int:
    """Executes validation laboratory suite and returns exit code 0 on pass or 1 on fail."""
    print("\n" + "="*75)
    print("🔬 VITALHEALTH v5.0 — AUTOMATED VALIDATION LABORATORY RUNNER")
    print("="*75)
    print(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Target Persona: {persona_id.upper()} ({PersonaFactory.get_persona(persona_id)['name']})")
    print(f"Category Filter: {category_filter if category_filter else 'ALL MODULES & JOURNEYS'}")
    print("="*75 + "\n")

    metrics = MetricsTracker()
    engine = ScenarioEngine(metrics)
    all_scenarios = ScenarioLoader.get_all_scenarios()

    if category_filter:
        scenarios = [s for s in all_scenarios if s["category"].lower() == category_filter.lower()]
    else:
        scenarios = all_scenarios

    results = []
    for scenario in scenarios:
        res = engine.execute_scenario(scenario, persona_id=persona_id)
        results.append(res)
        status_icon = "✅ PASS" if res["passed"] else "❌ FAIL"
        print(f"[{res['category'].upper():<16}] {res['id']:<10} | {res['name']:<45} | {res['latency_ms']:>6.1f}ms | {status_icon}")

    metrics.finalize()
    summary = metrics.summary_dict()
    summary["timestamp"] = datetime.now().isoformat()
    summary["persona_used"] = persona_id

    # Generate Reports
    reports_dir = os.path.join(os.path.dirname(__file__), "reports")
    json_path = os.path.join(reports_dir, "validation_report.json")
    md_path = os.path.join(reports_dir, "validation_report.md")
    html_path = os.path.join(reports_dir, "validation_report.html")

    ReportGenerator.generate_json_report(summary, results, json_path)
    ReportGenerator.generate_markdown_report(summary, results, md_path)
    ReportGenerator.generate_html_report(summary, results, html_path)

    if export_dash:
        DashboardExporter.export_metrics(summary)

    gate = summary["quality_gate"]
    gate_icon = "🟢" if gate == "READY FOR RELEASE" else ("🟡" if gate == "READY WITH MINOR FIXES" else "🔴")

    print("\n" + "="*75)
    print("📊 VALIDATION LABORATORY SUMMARY & QUALITY GATE EVALUATION")
    print("="*75)
    print(f"Total Validation Scenarios : {summary['total_tests']}")
    print(f"Passed Scenarios           : {summary['passed']} ✅")
    print(f"Failed Scenarios           : {summary['failed']} ❌")
    print(f"Reliability Score          : {summary['reliability_pct']}%")
    print(f"Total Execution Time       : {summary['duration_seconds']}s")
    print(f"Release Quality Gate       : {gate_icon} {gate}")
    print(f"Gate Explanation           : {summary['quality_gate_explanation']}")
    print("-" * 75)
    print(f"📁 Reports Generated:")
    print(f"   • JSON Report : {json_path}")
    print(f"   • Markdown    : {md_path}")
    print(f"   • HTML Report : {html_path}")
    print("="*75 + "\n")

    return 0 if gate != "NOT READY" else 1

def main():
    parser = argparse.ArgumentParser(description="VitalHealth Automated Validation Laboratory Runner")
    parser.add_argument("--category", type=str, help="Filter by validation category (e.g. authentication, ai, ocr, twin, e2e_journeys)")
    parser.add_argument("--persona", type=str, default="type2_diabetes", help="Target clinical patient persona ID")
    parser.add_argument("--no-dashboard", action="store_true", help="Disable Developer Dashboard telemetry export")
    args = parser.parse_args()

    exit_code = run_validation_lab(
        category_filter=args.category,
        persona_id=args.persona,
        export_dash=not args.no_dashboard
    )
    sys.exit(exit_code)

if __name__ == "__main__":
    main()
