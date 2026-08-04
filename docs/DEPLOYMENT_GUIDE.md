# VitalHealth v5.0 — Production Deployment Guide

## Prerequisites
- **Operating System**: Linux (Ubuntu 22.04 LTS / RHEL 9 recommended)
- **Docker**: v24.0+ & Docker Compose v2.20+
- **Python**: 3.11+
- **Open Ports**: 80 (HTTP), 443 (HTTPS), 9090 (Prometheus Optional)

## Step-by-Step Production Deployment

### 1. Clone Repository & Setup Environment
```bash
git clone https://github.com/VitalHealth/health-digital-twin.git
cd health-digital-twin
cp .env.example .env
```

### 2. Configure Environment Variables
Edit `.env` to configure production parameters:
```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=prod_secure_password_99
POSTGRES_DB=twins_db
REDIS_URL=redis://redis:6379/0
QDRANT_URL=http://qdrant:6333
ENVIRONMENT=production
```

### 3. Generate TLS / SSL Certificates
Place SSL certificates in `deployment/nginx/ssl/live/api.vitalhealth.app/`:
- `fullchain.pem`
- `privkey.pem`

### 4. Execute Automated Zero-Downtime Deployment
```bash
chmod +x deployment/deploy_prod.sh
./deployment/deploy_prod.sh
```

### 5. Verify Gateway Health & Operations Dashboard
- API Gateway Health: `curl -f https://localhost/health`
- Production Telemetry Dashboard: `https://localhost/dev/dashboard`
- Prometheus Metrics: `https://localhost/metrics`
