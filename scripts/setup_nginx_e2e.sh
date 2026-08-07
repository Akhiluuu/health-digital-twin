#!/usr/bin/env bash
# ===========================================================================
# 🌐 VITALHEALTH PHOS ENGINE — FREE NGINX REVERSE PROXY SETUP
# ===========================================================================
# Installs and configures Nginx as a high-performance reverse proxy for
# port 8000, setting up 120s LLM timeouts, 50MB PDF upload limits, and
# WebSocket telemetry support at ZERO cost.
# ===========================================================================

set -e

echo "==========================================================================="
echo "🌐 FREE NGINX REVERSE PROXY SETUP — E2E PRODUCTION SERVER"
echo "==========================================================================="

# 1. Install Nginx if not present
if ! command -v nginx >/dev/null 2>&1; then
    echo "📦 [1/3] Installing free Nginx web server..."
    sudo apt-get update -qq && sudo apt-get install -y nginx -qq
else
    echo "✅ [1/3] Nginx is already installed ($(nginx -v 2>&1))."
fi

# 2. Generate Nginx configuration
TMP_NGINX="/tmp/vitalhealth_nginx.conf"
echo "⚙️ [2/3] Generating Nginx configuration file..."

cat << 'EOF' > "$TMP_NGINX"
# VitalHealth PHOS Production Reverse Proxy Configuration
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    server_name _;

    # Maximum file upload size (50MB for medical lab PDF scans)
    client_max_body_size 50M;

    # Dynamic LLM query timeout (120 seconds max)
    proxy_connect_timeout 120s;
    proxy_send_timeout 120s;
    proxy_read_timeout 120s;

    # Gzip Compression for Mobile API payloads
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
    gzip_min_length 1000;

    # Main FastAPI Proxy Gateway
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support for real-time telemetry streaming
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Health Check Endpoint
    location /health {
        proxy_pass http://127.0.0.1:8000/health;
        access_log off;
    }
}
EOF

echo "📋 Configuration generated at ${TMP_NGINX}"
echo ""
echo "To apply Nginx configuration on your E2E server, run:"
echo "---------------------------------------------------------------------------"
echo "sudo cp ${TMP_NGINX} /etc/nginx/sites-available/vitalhealth"
echo "sudo ln -sf /etc/nginx/sites-available/vitalhealth /etc/nginx/sites-enabled/default"
echo "sudo nginx -t"
echo "sudo systemctl restart nginx"
echo "---------------------------------------------------------------------------"
