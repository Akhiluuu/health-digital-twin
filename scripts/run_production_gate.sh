#!/bin/bash
# ==============================================================================
# VitalHealth CI/CD Production Release Gate Execution Script
# Mandatory pre-merge & pre-deployment clinical evaluation check.
# ==============================================================================

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="${PROJECT_ROOT}/healthbot_venv/bin/python3"

if [ ! -f "$PYTHON_BIN" ]; then
    PYTHON_BIN="python3"
fi

echo "==============================================================================="
echo "🏥 VitalHealth Production Release Gate — CI/CD Execution"
echo "==============================================================================="
echo "Project Root: ${PROJECT_ROOT}"
echo "Python Binary: ${PYTHON_BIN}"
echo "Running full 18-capability AI Acceptance Evaluation..."
echo ""

cd "${PROJECT_ROOT}"
"${PYTHON_BIN}" -m healthbot_v4.ai_acceptance.runner --full

EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo ""
    echo "==============================================================================="
    echo "🟢 SUCCESS: Production Release Gate PASSED. All clinical SLAs verified!"
    echo "==============================================================================="
    exit 0
else
    echo ""
    echo "==============================================================================="
    echo "🔴 FAILURE: Production Release Gate BLOCKED. Clinical SLAs violated!"
    echo "==============================================================================="
    exit 1
fi
