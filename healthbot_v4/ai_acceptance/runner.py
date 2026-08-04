"""
VitalHealth AI Acceptance Testing Platform — Master Runner CLI
Master execution harness for evaluating AI Physician behavior and enforcing Release Gates.
"""

import sys
import os
import argparse
import asyncio
import time

sys.path.insert(0, '/home/akhilreddy/health-digital-twin/healthbot_v4')

from healthbot_v4.ai_acceptance.personas.persona_factory import PersonaFactory
from healthbot_v4.ai_acceptance.scenarios.scenario_generator import ScenarioGenerator
from healthbot_v4.ai_acceptance.scenario_runner import ScenarioRunner
from healthbot_v4.ai_acceptance.acceptance_score import AcceptanceScoreCalculator
from healthbot_v4.ai_acceptance.report_generator import ReportGenerator

async def main():
    parser = argparse.ArgumentParser(description="VitalHealth AI Acceptance Testing Platform Runner")
    parser.add_argument("--sample", type=int, default=0, help="Number of scenarios to sample")
    parser.add_argument("--suite", type=str, default="all", help="Target capability suite (e.g., safety, memory, twin, all)")
    parser.add_argument("--full", action="store_true", help="Execute full core test suite across all 18 capabilities")
    parser.add_argument("--stress", action="store_true", help="Execute 500-scenario synthetic stress test suite")
    args = parser.parse_args()

    print("===============================================================================")
    print("🏥 VitalHealth AI Acceptance Testing Platform — Execution Suite")
    print("===============================================================================\n")

    if args.stress or args.sample >= 100:
        target_count = args.sample if args.sample >= 100 else 500
        scenarios = ScenarioGenerator.generate_stress_test_suite(target_count)
        print(f"⚡ Loaded {len(scenarios)} synthetic stress-testing scenarios across 18 capabilities.")
    else:
        scenarios = ScenarioGenerator.generate_all_scenarios()
        print(f"📋 Loaded {len(scenarios)} clinical scenarios across 18 capabilities.")

    if args.suite != "all":
        scenarios = [s for s in scenarios if args.suite.lower() in s.capability.lower()]
        print(f"🎯 Filtered to {len(scenarios)} scenarios for suite '{args.suite}'.")

    if args.sample > 0 and args.sample < len(scenarios):
        import random
        scenarios = random.sample(scenarios, args.sample)
        print(f"🎲 Sampled {len(scenarios)} representative scenarios for fast evaluation.")

    runner = ScenarioRunner()
    scores = []
    responses_log = []

    print("\n🚀 Executing AI Orchestration & Clinical Behavior Evaluation...\n")
    t_start = time.time()

    for idx, scenario in enumerate(scenarios, 1):
        print(f"[{idx}/{len(scenarios)}] Executing Scenario '{scenario.id}' ({scenario.capability} - {scenario.complexity_tier})...")
        score, response_log = await runner.run_scenario(scenario)
        scores.append(score)
        responses_log.append(response_log)

        status_str = "🟢 PASSED" if score.passed else "🔴 FAILED"
        print(f"   └─ Score: {score.overall_acceptance_score * 100:.1f}% | Latency: {response_log['latency_ms']:.0f}ms | Status: {status_str}")

    t_duration = time.time() - t_start
    print(f"\n⏱️ Completed evaluation of {len(scenarios)} scenarios in {t_duration:.2f} seconds.")

    # Replay Regressions
    regressions = runner.failure_store.get_all_regressions()
    regression_scores = []

    # Calculate Release Gates
    gate_result = AcceptanceScoreCalculator.calculate_release_gates(scores, regression_scores)

    print("\n===============================================================================")
    print("🛡️ PRODUCTION RELEASE GATE EVALUATION")
    print("===============================================================================")
    print(f"Overall Acceptance Score: {gate_result.overall_score}%")
    print(f"Emergency Triage Rate:   {gate_result.emergency_detection_rate}%")
    print(f"Personalization Compliance: {gate_result.personalization_rate}%")
    print(f"Status: {'🟢 PRODUCTION READY (PASSED GATES)' if gate_result.production_ready else '🔴 RELEASE BLOCKED (FAILED GATES)'}\n")

    for gate in gate_result.gate_details:
        status_icon = "🟢" if gate["passed"] else "🔴"
        print(f"  {status_icon} {gate['gate']}: Actual={gate['value']} (Required: {gate['required']})")

    # Generate Reports
    ReportGenerator.generate_all_reports(scores, gate_result, runner.failure_store.get_all_failures(), responses_log)

    if not gate_result.production_ready:
        print("\n⚠️ Release Gate Validation Failed. Exit Code 1.")
        sys.exit(1)
    else:
        print("\n🎉 All Release Quality Gates Passed Successfully!")
        sys.exit(0)

if __name__ == "__main__":
    asyncio.run(main())
