"""Configuración centralizada del backend (lee variables de entorno / .env)."""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Base de datos. SQLite por defecto (local/tests); Postgres (Neon) en prod.
    database_url: str = "sqlite:///data/finance_api.db"

    # Auth
    jwt_secret: str = "dev-insecure-change-me"
    jwt_algorithm: str = "HS256"
    access_token_ttl_min: int = 30
    refresh_token_ttl_days: int = 30

    # IA
    anthropic_api_key: str | None = None
    chat_model: str = "claude-haiku-4-5-20251001"

    # CORS: orígenes permitidos para la PWA (coma-separados)
    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
