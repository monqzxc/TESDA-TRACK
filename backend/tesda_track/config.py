from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Local development reads the repository-root .env; containers get real environment variables.
ROOT_ENV_FILE = Path(__file__).resolve().parents[2] / ".env"
DEFAULT_EMBEDDING_MODEL = "intfloat/multilingual-e5-small"


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


class PersonalizationWeights(BaseModel):
    interest: float = Field(default=0.35, ge=0, le=1)
    skill: float = Field(default=0.25, ge=0, le=1)
    career: float = Field(default=0.15, ge=0, le=1)
    location: float = Field(default=0.15, ge=0, le=1)
    preference: float = Field(default=0.10, ge=0, le=1)

    @model_validator(mode="after")
    def sums_to_one(self):
        if abs(sum(self.model_dump().values()) - 1) > 1e-6:
            raise ValueError("Personalization weights must add up to 1.")
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
    embedding_model: str = DEFAULT_EMBEDDING_MODEL
    embedding_cache_dir: str | None = Field(default=None, description="Where the model files live (downloaded once)")
    embedding_model_path: str | None = Field(
        default=None, description="Folder of a fine-tuned model (onnx/model.onnx, tokenizer files, calibration.json)")
    # E5 similarities sit in a narrow band (about 0.75-0.85) for related and unrelated goals alike, so a
    # qualification counts by its z-score: how many standard deviations its similarity stands above the
    # catalog's. Below the floor it counts for nothing, above the ceiling fully. Calibrated on 32 sample goals
    # against the 319-qualification catalog: goals with no TVET match scored z <= 3.5, most related goals
    # >= 4. Favors precision; recalibrate with pilot data. Rechecked in docs/ml/2026-10-09-matching-model-evaluation.md:
    # no parameters calibrated on its dev goals beat these on the held-out goals by more than 0.02 objective while
    # rejecting at least 0.8 of the goals with no TVET match. A fine-tuned model brings its own in calibration.json.
    semantic_z_floor: float = 3.0
    semantic_z_ceiling: float = 5.0
    match_weight_keyword: float = Field(default=0.5, ge=0, le=1)
    match_min_score: int = Field(default=20, ge=0, le=100, description="Hide qualification matches scoring below this")
    ranking_weights: RankingWeights = RankingWeights()
    personalization_weights: PersonalizationWeights = Field(default_factory=PersonalizationWeights)
    proximity_radius_km: float = Field(default=100, gt=0, description="Distance at which proximity counts for nothing")

    # Legacy REST adapter; optional and independent of the public MCP integration below.
    skills_bridge_base_url: str | None = None
    skills_bridge_api_token: SecretStr | None = None
    skills_bridge_timeout_seconds: float = Field(default=10, gt=0)
    skills_bridge_cache_ttl_seconds: int = Field(default=3600, ge=0)
    # Public read-only MCP integration, separate from the legacy REST adapter. Its responses are cached for
    # skills_bridge_cache_ttl_seconds (0 turns caching off).
    skills_bridge_mcp_enabled: bool = True
    skills_bridge_mcp_url: HttpUrl = "https://mcp.skills-bridge.ph/mcp"
    skills_bridge_mcp_token: SecretStr | None = None
    # Skills Bridge signs clients in with the OAuth client credentials grant. When both are set they replace
    # skills_bridge_mcp_token: access tokens come from skills_bridge_token_url and are reused until shortly
    # before they expire. The client is issued by skills-bridge.ph (Laravel Passport), so its tokens come from
    # there; the /token endpoint the MCP server advertises serves only its own interactive sign-in.
    skills_bridge_client_id: str | None = None
    skills_bridge_client_secret: SecretStr | None = None
    skills_bridge_token_url: HttpUrl = "https://skills-bridge.ph/oauth/token"
    skills_bridge_rate_limit_per_minute: int = Field(default=20, ge=1, description="Lookups per client address")
    skills_bridge_upstream_per_minute: int = Field(default=120, ge=1,
                                                   description="Uncached lookups sent to Skills Bridge, all clients")

    # Directions from an OSRM server (GET /api/v1/routes). The public FOSSGIS router allows one request a second
    # and keeps requests in its logs; empty turns Directions off, and the app links to Google Maps instead.
    routing_url: str = "https://routing.openstreetmap.de/routed-car"
    routing_rate_limit_per_minute: int = Field(default=10, ge=1, description="Directions per client address")
    routing_cache_ttl_seconds: int = Field(default=3600, ge=0, description="How long found routes are kept; 0 for none")

    # CARTO basemaps key for the center map's default style; empty keeps the map on OpenStreetMap tiles. Not a
    # secret: browsers send it with every tile request, so restrict it to the deployment's domain in CARTO.
    carto_api: str = ""

    @model_validator(mode="after")
    def semantic_band_ordered(self):
        if self.semantic_z_ceiling <= self.semantic_z_floor:
            raise ValueError("semantic_z_ceiling must be greater than semantic_z_floor.")
        return self

    @model_validator(mode="after")
    def skills_bridge_client_complete(self):
        if bool(self.skills_bridge_client_id) != bool(self.skills_bridge_client_secret):
            raise ValueError("Set both SKILLS_BRIDGE_CLIENT_ID and SKILLS_BRIDGE_CLIENT_SECRET, or neither.")
        return self

    @model_validator(mode="after")
    def paths_from_repository_root(self):
        """A relative EMBEDDING_CACHE_DIR or EMBEDDING_MODEL_PATH means the same folder whichever directory the API starts from."""
        if self.embedding_cache_dir and not Path(self.embedding_cache_dir).is_absolute():
            self.embedding_cache_dir = str((ROOT_ENV_FILE.parent / self.embedding_cache_dir).resolve())
        if self.embedding_model_path and not Path(self.embedding_model_path).is_absolute():
            self.embedding_model_path = str((ROOT_ENV_FILE.parent / self.embedding_model_path).resolve())
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
