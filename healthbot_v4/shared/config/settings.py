"""
healthbot_v4/shared/config/settings.py
Configuration Settings for VitalHealth v5.0 Health Brain microservices.
"""

import os
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_PROJECT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    PROJECT_NAME: str = "VitalHealth"
    VERSION: str = "5.0.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # Database & Cache
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/vitalhealth_v5"
    REDIS_URL: str = "redis://localhost:6379/0"
    ENABLE_REDIS_CACHE: bool = True
    QDRANT_URL: str = "http://localhost:6333"

    # Security
    CORS_ALLOWED_ORIGINS: list[str] = ["*"]

    # AI Models
    QWEN_MODEL_PATH: str = os.path.join(BASE_PROJECT_DIR, "models", "qwen2.5-14b-instruct-q5_k_m-00001-of-00003.gguf")
    EMBEDDING_MODEL_NAME: str = "BAAI/bge-small-en-v1.5"

    # BioGears C++ Engine
    BIOGEARS_RUNTIME_PATH: str = os.path.join(BASE_PROJECT_DIR, "biogears_runtime")
    BIOGEARS_API_URL: str = "http://localhost:8000"


settings = Settings()

