"""Application configuration loaded from environment variables via pydantic-settings."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central settings sourced from .env / environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    PIX_API_KEY: str = ""
    PIX_API_BASE: str = "https://pix.positka.net/api/v1/messages"
    DEFAULT_PIX_MODEL: str = "sonnet-4"
    WORKSPACE_ROOTS: str = ""
    BACKEND_HOST: str = "127.0.0.1"
    BACKEND_PORT: int = 8000
    MAX_FILE_SIZE: int = 300 * 1024  # 300 KB
    COMMAND_TIMEOUT: int = 60

    # ── Security sandbox ────────────────────────────────────────────────────
    SANDBOX_ENABLED: bool = False
    SANDBOX_IMAGE: str = "python:3.11-alpine"
    SANDBOX_MEMORY_LIMIT: str = "256m"
    SANDBOX_CPU_LIMIT: str = "1"
    AGENT_SECRET_KEY: str = "pix-agent-change-me-in-production"


@lru_cache()
def get_settings() -> Settings:
    """Return a cached :class:`Settings` instance."""
    return Settings()
