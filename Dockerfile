FROM python:3.11-slim

# Install system dependencies for BioGears C++ runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libssl-dev \
    libffi-dev \
    libsqlite3-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set up working directory
WORKDIR /app
ENV PYTHONPATH=/app

# Copy requirements and install python packages
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir celery redis psycopg2-binary pyjwt cryptography

# Copy application files
COPY . .

# Expose ports
EXPOSE 8000 8080

# Run default command (FastAPI server)
CMD ["uvicorn", "healthbot_v4.apps.api.server:app", "--host", "0.0.0.0", "--port", "8000"]
