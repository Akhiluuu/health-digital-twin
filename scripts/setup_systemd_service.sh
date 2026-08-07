#!/usr/bin/env bash
# ===========================================================================
# ⚙️ VITALHEALTH PHOS ENGINE — SYSTEMD SERVICE INSTALLER
# ===========================================================================
# Installs and enables the vitalhealth.service systemd unit on the E2E
# server so the FastAPI server auto-starts on system boot and auto-restarts
# on crash.
# ===========================================================================

set -e

echo "==========================================================================="
echo "⚙️ VITALHEALTH SYSTEMD AUTO-RESTART SERVICE SETUP"
echo "==========================================================================="

USER_NAME="${USER:-cave}"
PROJECT_DIR="${ROOT_DIR:-/home/${USER_NAME}/health-digital-twin}"
VENV_DIR="${PROJECT_DIR}/venv"
SERVICE_FILE="/etc/systemd/system/vitalhealth.service"

echo "   • User:               ${USER_NAME}"
echo "   • Project Directory:  ${PROJECT_DIR}"
echo "   • Venv Directory:     ${VENV_DIR}"
echo "   • Target Service:     ${SERVICE_FILE}"
echo "==========================================================================="

# Create temporary service file
TMP_SERVICE="/tmp/vitalhealth.service"

cat << EOF > "$TMP_SERVICE"
[Unit]
Description=VitalHealth PHOS Enterprise Engine Gateway
Documentation=https://github.com/Akhiluuu/health-digital-twin
After=network-online.target ollama.service
Wants=network-online.target

[Service]
Type=simple
User=${USER_NAME}
WorkingDirectory=${PROJECT_DIR}
EnvironmentFile=${PROJECT_DIR}/.env
Environment=PYTHONPATH=${PROJECT_DIR}

ExecStart=${VENV_DIR}/bin/uvicorn healthbot_v4.apps.api.server:app --host 0.0.0.0 --port 8000 --workers 1 --log-level info

Restart=always
RestartSec=5
StartLimitIntervalSec=60
StartLimitBurst=10

StandardOutput=journal
StandardError=journal
SyslogIdentifier=vitalhealth-phos

NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

echo "📋 Systemd Unit File generated at ${TMP_SERVICE}"
echo ""
echo "To activate auto-restart on your E2E server, run:"
echo "---------------------------------------------------------------------------"
echo "sudo cp ${TMP_SERVICE} /etc/systemd/system/vitalhealth.service"
echo "sudo systemctl daemon-reload"
echo "sudo systemctl enable vitalhealth.service"
echo "sudo systemctl restart vitalhealth.service"
echo "sudo systemctl status vitalhealth.service"
echo "---------------------------------------------------------------------------"
