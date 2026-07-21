"""
medication_service/tests/conftest.py
Pytest configuration for the Medication Vault test suite.

Sets environment variables so tests can run without needing to manually
export DATABASE_URL / ALLOW_DEV_AUTH before every run.

Usage:
    pytest medication_service/tests/                          # uses local docker DB
    DATABASE_URL=postgresql://...  pytest medication_service/tests/  # override
"""
import os

# ── Database: use local docker container by default ───────────────────────────
# The local postgres-local docker container uses the Cave_123 password.
# The docker-compose production container uses 'password'.
# Set DATABASE_URL in your shell to override for production/CI.
if "DATABASE_URL" not in os.environ:
    os.environ["DATABASE_URL"] = "postgresql://postgres:Cave_123@localhost:5432/twins_db"

# ── Dev auth: allow X-Dev-User-Id header bypass in tests ─────────────────────
if "ALLOW_DEV_AUTH" not in os.environ:
    os.environ["ALLOW_DEV_AUTH"] = "true"
