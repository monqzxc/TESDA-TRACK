from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Local development reads the repository-root .env; containers get real environment variables.
ROOT_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class RankingWeights(BaseModel):
    """How much each component counts when ranking training options. Must add up to 1."""
    semantic: float = Field(default=0.50, ge=0)
    proximity: float = Field(default=0.20, ge=0)
    assessment: float = Field(default=0.15, ge=0)
    schedule: float = Field(default=0.10, ge=0)
    preference: float = Field(default=0.05, ge=0)

    @model_validator(mode="after")
    def sums_to_one(self):
        if abs(sum(self.model_dump().values()) - 1) > 1e-6:
            raise ValueError("Ranking weights must add up to 1.")
        return self


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_ENV_FILE, env_file_encoding="utf-8", extra="ignore",
                                      env_nested_delimiter="__")

    environment: Literal["development", "test", "production"] = "development"
    database_url: str = Field(description="SQLAlchemy URL, e.g. postgresql+psycopg://user:pass@host:5432/tesda_track")
    secret_key: SecretStr = Field(min_length=32, description="Signs access tokens; generate with secrets.token_urlsafe(48)")
    access_token_expire_minutes: int = Field(default=480, ge=5, le=7 * 24 * 60)
    login_max_attempts: int = Field(default=5, ge=1)
    login_lockout_minutes: int = Field(default=15, ge=1)
    cors_origins: list[str] = []
    docs_enabled: bool = True
    log_level: str = "INFO"

    # Semantic search: one local embedding model; learner text never leaves the server.
    semantic_search_enabled: bool = True
    embedding_model: str = "intfloat/multilingual-e5-small"
    embedding_cache_dir: str | None = Field(default=None, description="Where the model files live (downloaded once)")
    # E5 similarities sit in a narrow band (about 0.75-0.85) for related and unrelated goals alike, so a
    # qualification counts by its z-score: how many standard deviations its similarity stands above the
    # catalog's. Below the floor it counts for nothing, above the ceiling fully. Calibrated on 32 sample goals
    # against the 319-qualification catalog: goals with no TVET match scored z <= 3.5, most related goals
    # >= 4. Favors precision; recalibrate with pilot data.
    semantic_z_floor: float = 3.0
    semantic_z_ceiling: float = 5.0
    match_weight_keyword: float = Field(default=0.5, ge=0, le=1)
    match_min_score: int = Field(default=20, ge=0, le=100, description="Hide qualification matches scoring below this")
    ranking_weights: RankingWeights = RankingWeights()
    proximity_radius_km: float = Field(default=100, gt=0, description="Distance at which proximity counts for nothing")

    # Legacy REST adapter; optional and independent of the public MCP integration below.
    skills_bridge_base_url: str | None = None
    skills_bridge_api_token: SecretStr | None = None
    skills_bridge_timeout_seconds: float = Field(default=10, gt=0)
    skills_bridge_cache_ttl_seconds: int = Field(default=3600, ge=0)
    # Public read-only MCP integration, separate from the legacy REST adapter.
    skills_bridge_mcp_enabled: bool = True
    skills_bridge_mcp_url: HttpUrl = "https://mcp.skills-bridge.ph/mcp"
    skills_bridge_mcp_token: SecretStr | None = None

    @model_validator(mode="after")
    def semantic_band_ordered(self):
        if self.semantic_z_ceiling <= self.semantic_z_floor:
            raise ValueError("semantic_z_ceiling must be greater than semantic_z_floor.")
        return self

    @model_validator(mode="after")
    def cache_dir_from_repository_root(self):
        """A relative EMBEDDING_CACHE_DIR means the same folder whichever directory the API starts from."""
        if self.embedding_cache_dir and not Path(self.embedding_cache_dir).is_absolute():
            self.embedding_cache_dir = str((ROOT_ENV_FILE.parent / self.embedding_cache_dir).resolve())
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
