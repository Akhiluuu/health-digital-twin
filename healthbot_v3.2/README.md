# Personal Health Assistant — Advanced Health AI Assistant (v3.2 Upgraded)

Welcome to the **Health AI v3.2** repository. This is an offline, stateless **Personal Health Assistant**. The backend is built on FastAPI and is designed to run locally or in production.

---

## 📁 Repository Structure

```tree
├── health_ai/                      # Core backend application
│   ├── api/
│   │   └── server.py               # FastAPI server & route orchestration
│   ├── config/
│   │   └── settings.py             # Server, speed, models, & folder settings
│   ├── core/
│   │   ├── character.py            # Personal Health Assistant system prompts, keywords, & routing logic
│   │   ├── exceptions.py           # Custom application exceptions
│   │   ├── logger.py               # Rotating logger engine (max 10MB, 5 backups)
│   │   └── safety.py               # Crisis symptom keyword matching & disclaimer formatting
│   ├── embeddings/
│   │   └── embedder.py             # Singleton interface for BGE embedding model
│   ├── external/
│   │   └── drug_api.py             # RxNorm & DailyMed drug lookup utilities
│   ├── model/
│   │   ├── llm_loader.py           # Singleton LLM loader (supports split & single GGUFs)
│   │   └── PLACE_MODEL_HERE.txt    # Helper file indicating model directory
│   ├── rag/
│   │   ├── chunker.py              # Word-window text chunker (sliding overlap window)
│   │   ├── context_builder.py      # Context assembler & prompt sanitizer
│   │   └── document_processor.py   # Lab values parser & patient history summaries generator
│   ├── tests/
│   │   └── test_ocr_stress.py      # Automated 24-case pipeline stress tests
│   └── utils/
│       └── document_reader.py      # Highly robust digital, scanned, or hybrid PDF/Image reader
├── chat.html                       # Local browser client UI
├── requirements.txt                # System requirements & dependencies
└── README.md                       # This developer documentation
```

---

## 🚀 Key Architectural Upgrades

* **BAAI/bge-small-en-v1.5 Embedding Model**: Upgraded from `all-MiniLM-L6-v2` for state-of-the-art medical query semantic searches.
* **Hybrid Document Classifier Pipeline**: Automatically detects digital (direct text extract), scanned (PaddleOCR or pytesseract fallback), or mixed PDF pages.
* **Robust Multi-Panel Lab Values & Prescription Parser**: Converts raw OCR texts into structured metadata (e.g. tracking lab metric bounds and dose frequencies) and bundles a dense summary at index chunk 0.
* **Stream Disconnect Listener**: Generates responses using `stream=True` and listens to FastAPI request cancellations (e.g. if the client stops the query early, token generation is immediately stopped on the CPU/GPU, saving server resources).
* **Rotate Logger Guard**: Prevents server disk overflows by swapping basic logging handlers with `RotatingFileHandler` (10MB limits, 5 rotation layers).

---

## ⚙️ Setup & Installation

### 1. Pre-requisites & Virtual Environment
Ensure you have Python 3.10+ installed. Set up a virtual environment in the project directory:
```bash
python -m venv venv
# On Windows (PowerShell):
.\venv\Scripts\Activate.ps1
# On macOS/Linux:
source venv/bin/activate
```

### 2. Install Requirements
Install all dependencies listed in `requirements.txt`:
```bash
pip install -r requirements.txt
```

### 3. Setup LLM Model
Download a Qwen2.5 Instruct GGUF model (e.g., `Qwen2.5-14B-Instruct-Q5_K_M` or `Qwen2.5-3B-Instruct-Q4_K_M`) and place the `.gguf` file inside:
`health_ai/model/`

* If using split shards, point the model path to shard 1 (ending in `-00001-of-00003.gguf`).
* Set your model filename in `health_ai/config/settings.py` via `LLM_MODEL_PATH`.

---

## 🔐 Authentication & Local Modes

To protect production installations, authentication is enforced on key endpoints (`/upload-and-embed`, `/embed-query`, and `/generate`). 

### 1. Production Mode (Default)
Incoming client requests must include:
* **API Key Header**: `X-API-Key: <your_api_key>` (configured via `DIGITAL_TWIN_API_KEY` environment variable).
* **Bearer ID Token**: A Firebase ID Token in the `Authorization` header (`Authorization: Bearer <firebase_jwt_token>`).

If neither auth token is present or matches, the server returns a `403 Forbidden` error.

### 2. Local Development Mode (Explicit Opt-In)
To test endpoints locally using the browser UI (`chat.html`) without setting up API Keys or Firebase:
1. Create a `.env` file in the root of the project.
2. Add the following line:
   ```env
   HEALTH_AI_ALLOW_UNAUTHENTICATED=true
   ```
This flag tells the FastAPI server to bypass the 403 authorization requirement during local development. **Do not use this flag in production.**

### 3. Speed & GPU Settings
To enable GPU acceleration for local generation, configure the following setting in your `.env` file:
* **GPU Execution (recommended if VRAM >= 8GB)**:
  ```env
  HEALTH_AI_GPU_LAYERS=-1
  ```
  *(Default is `0`, which executes model inference on CPU only).*

---

## 🛡️ Safety & Rate Limiting

* **Rate Limiting**: To prevent API abuse, requests to `/generate` are rate-limited to a maximum of **60 requests per minute** per client.
* **Emergency Bypass**: If a query contains high-risk keywords (e.g., `"stroke"`, `"chest pain"`, `"suicide"`), the server bypasses the LLM generator entirely. It immediately returns the emergency disclaimer (`URGENT_NOTICE` + `DISCLAIMER`) to ensure instant feedback.
