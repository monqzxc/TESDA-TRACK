from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

# Local development reads the repository-root .env; containers get real environment variables.
ROOT_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_ENV_FILE, env_file_encoding="utf-8", extra="ignore")

    environment: Literal["development", "test", "production"] = "development"
    database_url: str = Field(description="SQLAlchemy URL, e.g. postgresql+psycopg://user:pass@host:5432/tesda_track")
    secret_key: SecretStr = Field(min_length=32, description="Signs access tokens; generate with secrets.token_urlsafe(48)")
    access_token_expire_minutes: int = Field(default=480, ge=5, le=7 * 24 * 60)
    login_max_attempts: int = Field(default=5, ge=1)
    login_lockout_minutes: int = Field(default=15, ge=1)
    cors_origins: list[str] = []
    docs_enabled: bool = True
    log_level: str = "INFO"

    # AI analysis is optional: without a key, goals are analyzed by the rule-based service only.
    anthropic_api_key: SecretStr | None = None
    ai_model: str = "claude-haiku-4-5"
    ai_timeout_seconds: float = Field(default=20, gt=0)
    ai_cache_ttl_seconds: int = Field(default=7 * 24 * 3600, ge=0)
    ai_requests_per_hour_per_client: int = Field(default=30, ge=0)

    # Skills Bridge (https://skills-bridge.ph) has no public API yet; these enable the client once access is granted.
    skills_bridge_base_url: str | None = None
    skills_bridge_api_token: SecretStr | None = None
    skills_bridge_timeout_seconds: float = Field(default=10, gt=0)
    skills_bridge_cache_ttl_seconds: int = Field(default=3600, ge=0)

    @property
    def ai_enabled(self) -> bool:
        return self.anthropic_api_key is not None and bool(self.anthropic_api_key.get_secret_value())


@lru_cache
def get_settings() -> Settings:
    return Settings()
