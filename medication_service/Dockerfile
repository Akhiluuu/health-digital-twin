FROM python:3.11-slim

WORKDIR /app

# Install OS-level dependencies for psycopg2 and pytesseract
RUN apt-get update && apt-get install -y \
    libpq-dev gcc tesseract-ocr curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY medication_service/requirements.txt medication_service/requirements.txt
RUN pip install --no-cache-dir -r medication_service/requirements.txt

# Copy full project
COPY . .

EXPOSE 8001

CMD ["uvicorn", "medication_service.api.app:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "2"]
