from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, SecretStr, field_validator, model_validator
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
    # Errors leave the values out: they are printed when the API starts, and the input holds every secret.
    model_config = SettingsConfigDict(env_file=ROOT_ENV_FILE, env_file_encoding="utf-8", extra="ignore",
                                      env_nested_delimiter="__", hide_input_in_errors=True)

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

    # Answers to "Are you satisfied with this recommendation?". Each works the match out again, so they're limited;
    # learners behind one address (a training center's network) share the limit.
    feedback_rate_limit_per_minute: int = Field(default=30, ge=1, description="Feedback answers per client address")

    # The Explore map's supply-and-demand analysis can be rewritten as a short paragraph by Claude
    # (GET /api/v1/labor-market/outlook/summary). Off by default: turning it on sends the qualification's name, region
    # names and the public counts to Anthropic's API, never a learner's words, account or coordinates. Each selection
    # is written once and kept for outlook_summary_cache_ttl_seconds; without a key, or when Claude can't be
    # reached, the analysis written by fixed rules is shown instead.
    # A demo deployment whose only centers are the seed's example sites can count them as supply, so the map has
    # something to compare; the analysis then says the counts include examples. Leave off wherever real records exist.
    outlook_include_example_sites: bool = False
    outlook_ai_summary_enabled: bool = False
    anthropic_api_key: SecretStr | None = None
    outlook_summary_model: str = Field(default="claude-opus-5-5", min_length=1, max_length=100)
    outlook_summary_timeout_seconds: float = Field(default=30, gt=0)
    outlook_summary_cache_ttl_seconds: int = Field(default=7 * 24 * 3600, ge=0)
    outlook_summary_rate_limit_per_minute: int = Field(default=6, ge=1, description="New summaries per client address")
    outlook_summary_upstream_per_minute: int = Field(default=30, ge=1,
                                                     description="New summaries asked of Claude, all clients")

    # CARTO basemaps key for the center map's default style; empty keeps the map on OpenStreetMap tiles. Not a
    # secret: browsers send it with every tile request, so restrict it to the deployment's domain in CARTO.
    carto_api: str = ""

    # The center map's renderer (docs/center-map.md). MapLibre draws vector tiles, with optional 3D buildings, from
    # MapTiler (maptiler_key) or from another OpenMapTiles-schema source (map_tiles_url, its TileJSON address); labels
    # are drawn in the app's own font, so no font server is needed. Without either, or with map_engine "leaflet", the
    # map stays on Leaflet and the raster tiles above. Like the CARTO key these reach browsers, which send them with
    # every tile request: use a public MapTiler key restricted to the deployment's domains, never a private credential.
    map_engine: Literal["maplibre", "leaflet"] = "maplibre"
    maptiler_key: str = ""
    map_tiles_url: str = ""
    # 3D buildings, where the tiles record building heights and the device can draw them.
    map_3d_enabled: bool = True

    # Partner MCP server (TESDA Skill Passport, BSRS). public_base_url is the address partners reach this API at
    # (the Caddy domain in production); it is the token issuer and the host the MCP endpoint accepts.
    public_base_url: str = "http://localhost:8000"
    mcp_enabled: bool = True
    mcp_token_secret: SecretStr | None = Field(default=None, min_length=32,
                                               description="Signs partner access tokens; derived from secret_key when empty")
    mcp_token_lifetime_seconds: int = Field(default=3600, ge=60, le=86400)
    mcp_call_log_retention_days: int = Field(default=180, ge=1)
    mcp_allowed_hosts: list[str] = []
    # The earliest quarter get_qualification_demand will freeze a snapshot for (the pilot's first quarter).
    mcp_demand_earliest_quarter: str = Field(default="2025-Q1", pattern=r"^[0-9]{4}-Q[1-4]$")

    # Signing in from TESDA Skill Passport (31-TRACKER_IFRAME_INTEGRATION.md). Hercules, TSP's identity backend,
    # trades the one-time code TSP hands the embedded app for a learner's profile. Hercules issues the client; the
    # three values go together, and the secret is only ever sent from this server to Hercules, never to a browser.
    hercules_base_url: HttpUrl | None = None
    tracker_client_id: str | None = Field(default=None, max_length=256)
    tracker_client_secret: SecretStr | None = Field(default=None, max_length=1024)
    hercules_timeout_seconds: float = Field(default=10, gt=0)
    # Lets TSP's WebView sign learners in to linked accounts (POST /api/v1/auth/tsp/session). Off until Hercules
    # confirms its sso_id is permanent, since accounts are linked by it.
    tsp_sign_in_enabled: bool = False
    # Shows the TSP webview's "Suggested for you" (POST /api/v1/analysis/suggestions). Off until its release gates pass
    # (docs/evaluation-and-release-checks.md#profile-only-suggestions): a wrong nudge costs a learner more than none.
    tsp_suggestions_enabled: bool = False
    # Swaps the real TSP for the synthetic accounts in seed/tsp_mock_accounts.json (docs/tsp-mock.md): Hercules is
    # never called, even when its client is set, and "Sign in with TSP" asks for a synthetic account's password.
    # Needs TSP_SIGN_IN_ENABLED as well. Anyone who knows a test password can sign in: demos and tests only.
    tsp_mock_enabled: bool = False
    # TSP Find Jobs (Card 5): the "Find Jobs on TSP" button opens this page with the learner's chosen skill and area
    # as query parameters, named below. Empty: the button shows but is turned off. TSP hasn't confirmed the address
    # or its parameter names yet; set them here once it does.
    tsp_find_jobs_url: str = ""
    tsp_find_jobs_skill_param: str = Field(default="skill", pattern=r"^[A-Za-z0-9_.-]{1,40}$")
    tsp_find_jobs_area_param: str = Field(default="area", pattern=r"^[A-Za-z0-9_.-]{1,40}$")

    @field_validator("mcp_token_secret", "hercules_base_url", "tracker_client_id", "tracker_client_secret",
                     "anthropic_api_key", mode="before")
    @classmethod
    def empty_secret_is_unset(cls, value):
        return value or None

    @field_validator("public_base_url")
    @classmethod
    def no_trailing_slash(cls, value: str) -> str:
        return value.rstrip("/")

    @field_validator("map_engine", "maptiler_key", "map_tiles_url", mode="before")
    @classmethod
    def map_setting_trimmed(cls, value, info):
        # MAP_ENGINE=MapLibre and a key pasted with a trailing space both mean what they say.
        if not isinstance(value, str):
            return value
        return value.strip().lower() if info.field_name == "map_engine" else value.strip()

    @model_validator(mode="after")
    def map_tiles_usable(self):
        # Browsers fetch the tiles from an https page, which can't load http:// tiles; local development may.
        url = self.map_tiles_url
        local = self.environment != "production" and url.startswith("http://")
        if url and not (url.startswith("https://") or local):
            raise ValueError("MAP_TILES_URL must be an https:// address.")
        return self

    @model_validator(mode="after")
    def find_jobs_url_usable(self):
        # Opened from learners' browsers: only an https page (http only for local development), never a script.
        url = self.tsp_find_jobs_url = self.tsp_find_jobs_url.strip()
        local = self.environment != "production" and url.startswith("http://")
        if url and not (url.startswith("https://") or local):
            raise ValueError("TSP_FIND_JOBS_URL must be an https:// address.")
        return self

    @model_validator(mode="after")
    def outlook_summary_has_a_key(self):
        if self.outlook_ai_summary_enabled and not self.anthropic_api_key:
            raise ValueError("Set ANTHROPIC_API_KEY before OUTLOOK_AI_SUMMARY_ENABLED.")
        return self

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
    def tracker_integration_complete(self):
        values = (self.hercules_base_url, self.tracker_client_id, self.tracker_client_secret)
        if any(values) and not all(values):
            raise ValueError("Set HERCULES_BASE_URL, TRACKER_CLIENT_ID and TRACKER_CLIENT_SECRET together, or none of them.")
        if self.environment == "production" and self.hercules_base_url and self.hercules_base_url.scheme != "https":
            raise ValueError("HERCULES_BASE_URL must use https in production.")
        if self.tsp_sign_in_enabled and not all(values) and not self.tsp_mock_enabled:
            raise ValueError("Set HERCULES_BASE_URL, TRACKER_CLIENT_ID and TRACKER_CLIENT_SECRET before "
                             "TSP_SIGN_IN_ENABLED, or turn on TSP_MOCK_ENABLED.")
        return self

    @property
    def tracker_integration_enabled(self) -> bool:
        return bool(self.hercules_base_url and self.tracker_client_id and self.tracker_client_secret)

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
