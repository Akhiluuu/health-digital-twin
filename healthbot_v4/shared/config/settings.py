"""
healthbot_v4/shared/config/settings.py
Configuration Settings for VitalHealth v5.0 Health Brain microservices.
"""

import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    PROJECT_NAME: str = "VitalHealth"
    VERSION: str = "5.0.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/vitalhealth_v5"
    REDIS_URL: str = "redis://localhost:6379/0"
    QDRANT_URL: str = "http://localhost:6333"

    # AI Models
    QWEN_MODEL_PATH: str = "/home/akhilreddy/health-digital-twin/models/qwen2.5-14b-instruct-q5_k_m-00001-of-00003.gguf"
    EMBEDDING_MODEL_NAME: str = "BAAI/bge-small-en-v1.5"

    # BioGears C++ Engine
    BIOGEARS_RUNTIME_PATH: str = "/home/akhilreddy/health-digital-twin/biogears_runtime"
    BIOGEARS_API_URL: str = "http://localhost:8000"


settings = Settings()
