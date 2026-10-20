# Partner MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose nine read-only TESDA-TRACK tools over MCP to outside systems (TSP, BSRS), each with its own client credentials, scopes, rate limits and a usage log that never stores a learner's words.

**Architecture:** An `MCPServer` from the official Python SDK (mcp 2.3.0) is mounted at the root of the existing FastAPI app, after every FastAPI route, so it serves `/mcp` and `/.well-known/oauth-protected-resource/mcp` while `/api/v1` is untouched. TESDA-TRACK is its own OAuth authorization server for the client-credentials grant (`POST /api/v1/oauth/token`). Tools call the existing service functions directly. A ServerMiddleware filters `tools/list` by scope, refuses out-of-scope calls, rate-limits, and writes one `mcp_call_log` row per request.

**Tech Stack:** Python 3.13, FastAPI 0.142, SQLModel/SQLAlchemy 2, Alembic, PostgreSQL (PostGIS, pgvector), PyJWT, pwdlib Argon2, mcp 2.3.0 (`mcp.server.mcpserver.MCPServer`).

**Spec:** the tool contract, a Claude Doc at https://claude.ai/code/artifact/aae8bdf9-80b4-4507-8440-b1e8aa3ed443 (owner-only link). Everything an implementer needs from it is restated in this plan. The user approved it on 2026-10-19 with "proceed with the implementation of MCP". Spike findings (2026-10-19, `mcp==2.3.0`) are folded into the tasks below.

## Global Constraints

- Pin `mcp==2.3.0` in `backend/requirements.txt`. Import `MCPServer` from `mcp.server.mcpserver` (`mcp.server.fastmcp` raises in 2.x).
- Scopes are exactly `catalog:read`, `recommend:run`, `reports:read`.
- Tools, scopes and per-client per-minute limits:

  | tool | scope | limit |
  | --- | --- | --- |
  | match_qualifications | recommend:run | 30 |
  | get_qualification | catalog:read | 120 |
  | recommend_route | recommend:run | 60 |
  | check_readiness | recommend:run | 60 |
  | rank_training_programs | recommend:run | 30 |
  | rank_assessment_schedules | recommend:run | 30 |
  | search_training_programs | catalog:read | 60 |
  | get_regional_supply | catalog:read | 10 |
  | get_qualification_demand | reports:read | 10 |

- Every tool is annotated `ToolAnnotations(readOnlyHint=True, openWorldHint=False)`, returns a pydantic model (so the SDK emits `outputSchema` plus `structuredContent`), and signals caller-fixable problems with `ToolError` (`mcp.server.mcpserver.exceptions`), which yields `isError: true`.
- **Never store or log:** goal text, questionnaire or readiness answers, coordinates finer than 0.1° (round with `round(x, 1)` before any use), access tokens or client secrets. The SDK logs `ToolError` messages at INFO, so **no error message may contain caller-supplied free text**. Codes, ids and catalog titles are fine.
- The goal fingerprint is `tesda_track.services.ranking.goal_fingerprint(goal, settings.secret_key.get_secret_value())`, a keyed HMAC-SHA256. Never use a bare SHA-256.
- The access token is a JWT, HS256, signed with `mcp_signing_key(settings)`, never with `settings.secret_key` directly. Claims: `iss` = public base URL, `aud` = `{public_base_url}/mcp`, `sub` = client id (UUID string), `scope` (space-separated), `ver` (client token_version), `jti`, `iat`, `exp` (+`mcp_token_lifetime_seconds`, default 3600).
- Out-of-scope `tools/call` returns the JSON-RPC error `-32602` "Unknown tool: <name>". A rate-limited call returns the JSON-RPC error `-32000` "Rate limit exceeded; retry in N seconds." with `data: {"retry_after": N}`. Both happen inside the JSON-RPC layer, because the spike showed a ServerMiddleware cannot set HTTP status. A bad, expired or revoked token gets HTTP 401 with `WWW-Authenticate: Bearer ... resource_metadata="<base>/.well-known/oauth-protected-resource/mcp"`.
- A search or ranking with no results is `isError: false` with empty lists. These are tool errors (`isError: true`): invalid input, an unknown code, a goal naming no trade.
- Repository rules: write files with LF endings. Stage explicit paths only, never `git add -A`, because `frontend/` holds other people's uncommitted work. Never run two pytest processes at once, because they share `tesda_track_test`. End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Run tests from the repo root: `.venv/Scripts/python.exe -m pytest <path> -q`.
- Match the codebase style: short module docstrings, few comments, services raise `DomainError` subclasses, routers stay thin, migrations are hand-written like `backend/migrations/versions/0009_write_receipts.py`.

## Review Focus

1. A partner sends a goal containing a person's name or phone number. It must appear nowhere in `mcp_call_log`, `ranking_audit` or the logs. Task 4's `test_goal_text_never_stored` greps the whole row JSON.
2. Oversized or invalid input (a 1,001-character goal, a bad enum, half a coordinate pair) gives `isError: true` with a message that does not echo the input. Task 3's `test_invalid_input_error_does_not_echo_goal`.
3. An expired token gets 401, not a tool error. Task 2's `test_expired_token_is_401`.
4. A request whose `Host` is not the configured public host gets 421 (the SDK's DNS-rebinding guard). Production must set `PUBLIC_BASE_URL` to the Caddy domain. Task 2's `test_foreign_host_is_rejected`, plus the onboarding doc and `.env.example` in Task 7.
5. If writing the log row fails (database hiccup), the partner still gets its answer and a warning is logged. Task 4's `test_log_failure_does_not_break_call`.

---

### Task 1: Partner clients and client-credentials tokens

**Files:**
- Create: `backend/tesda_track/models/partners.py`, `backend/migrations/versions/0010_api_client.py`, `backend/tesda_track/services/partner_clients.py`, `backend/tesda_track/routers/oauth.py`, `backend/tests/test_partner_clients.py`
- Modify: `backend/tesda_track/models/__init__.py` (export `ApiClient`), `backend/tesda_track/config.py`, `backend/tesda_track/main.py`, `backend/tesda_track/cli.py`, `conftest.py` (repo root: add `"PUBLIC_BASE_URL": "http://testserver"` to the `os.environ.update` block), `backend/tests/conftest.py` (fixture `partner`)

**Interfaces:**
- Produces:
  - `ApiClient` table `api_client` with these fields:
    - `id: uuid.UUID` (pk, uuid4); this is the client id
    - `name: str` (String 100, unique), `organisation: str` (String 200), `contact_email: str | None`
    - `declared_purpose: str` (Text), `expected_tools: list[str]` (ARRAY Text), `scopes: list[str]` (ARRAY Text)
    - `rate_limit_per_minute: int = 120` (CHECK > 0), `secret_hash: str` (String 255)
    - `token_version: int = 1`, `is_active: bool = True`, `last_token_at: datetime | None`
    - plus `Timestamped`
  - `partner_clients.SCOPES: tuple[str, ...] = ("catalog:read", "recommend:run", "reports:read")`
  - `create_client(session, *, name, organisation, declared_purpose, scopes: list[str], expected_tools: list[str], contact_email: str | None = None, rate_limit_per_minute: int = 120) -> tuple[ApiClient, str]` returns the client and the plain secret (`secrets.token_urlsafe(32)`), stores only `hash_password(secret)`. It raises `InvalidRequestError` for an unknown scope.
  - `rotate_secret(session, client_id: uuid.UUID) -> tuple[ApiClient, str]` (new secret, `token_version += 1`); `revoke_client(session, client_id) -> ApiClient` (`is_active=False`, `token_version += 1`); `list_clients(session) -> list[ApiClient]`
  - `authenticate_client(session, client_id: str, secret: str) -> ApiClient | None`. For an unknown or malformed id it calls `burn_verification_time(secret)`, so timing doesn't reveal which ids exist.
  - `mcp_resource_url(settings) -> str` = `f"{settings.public_base_url}/mcp"`; `mcp_signing_key(settings) -> bytes` = `settings.mcp_token_secret` bytes, else `hmac.new(secret_key, b"tesda-track mcp access tokens", sha256).digest()`
  - `issue_access_token(session, client: ApiClient, requested_scope: str | None, resource: str | None, settings) -> IssuedToken(access_token: str, expires_in: int, scope: str)`. It raises `OAuthError(error: str, description: str, status_code: int)`. An unknown or ungranted scope gives `invalid_scope`; a `resource` that isn't `mcp_resource_url` gives `invalid_target`; no scope means all granted scopes. It sets `last_token_at`.
  - `verify_access_token(session, token: str, settings) -> PartnerPrincipal(client_id: uuid.UUID, name: str, scopes: frozenset[str], expected_tools: tuple[str, ...], rate_limit_per_minute: int)`. It raises `InvalidPartnerToken(reason: Literal["malformed", "expired", "audience", "revoked", "inactive"], client_id: uuid.UUID | None)`. Decode with `audience=mcp_resource_url`, `issuer=public_base_url`, `options={"require": ["sub", "exp", "aud", "ver", "scope"]}`.
  - Settings, added to `Settings` in `config.py`:
    - `public_base_url: str = "http://localhost:8000"`; a validator strips the trailing `/`
    - `mcp_enabled: bool = True`, `mcp_token_secret: SecretStr | None = None` (min 32 when set)
    - `mcp_token_lifetime_seconds: int = Field(3600, ge=60, le=86400)`
    - `mcp_call_log_retention_days: int = Field(180, ge=1)`, `mcp_allowed_hosts: list[str] = []`
  - Routes:
    - `POST /api/v1/oauth/token` takes form fields `grant_type`, `scope`, `resource`, and `client_id`/`client_secret` (client_secret_post), or HTTP Basic (client_secret_basic, which wins when both are sent).
    - Success: 200 `{"access_token","token_type":"Bearer","expires_in","scope"}` with `Cache-Control: no-store`.
    - Errors are RFC 6749 JSON `{"error","error_description"}`: `invalid_request` 400, `invalid_client` 401 with `WWW-Authenticate: Basic realm="tesda-track"`, `unsupported_grant_type` 400, `invalid_scope` 400, `invalid_target` 400.
    - Rate limit: 30 requests per minute per client id → 429 `{"error":"slow_down"}`, using a `RateLimiter` kept on `app.state.oauth_limits`.
    - `GET /.well-known/oauth-authorization-server`, registered on the app root, not `/api/v1`, returns:
      - `issuer`, `token_endpoint`
      - `grant_types_supported: ["client_credentials"]`
      - `token_endpoint_auth_methods_supported: ["client_secret_basic","client_secret_post"]`
      - `scopes_supported`, `response_types_supported: []`
  - CLI: `python -m tesda_track.cli mcp-client create --name --organisation --purpose --scopes S [S ...] --expected-tools T [T ...] [--contact-email] [--rate-limit]` prints `client_id` and `client_secret` once, with the line "Store the secret now; it can't be shown again." Also `mcp-client rotate --client-id`, `mcp-client revoke --client-id`, and `mcp-client list` (no secrets, no hashes).
  - Test fixture in `backend/tests/conftest.py`: `partner(session, client)` returns `make(name="TSP", scopes=("catalog:read","recommend:run"), expected_tools=(), rate_limit=120) -> Partner(id: uuid.UUID, secret: str, token: str, headers: dict)`. It creates the client with `create_client`, flushes, gets a token from `POST /api/v1/oauth/token`, and `headers` is `{"Authorization": f"Bearer {token}"}`.

- [ ] **Step 1: Write failing tests** in `backend/tests/test_partner_clients.py`:
  - `test_create_client_stores_only_a_hash`: the secret is not a substring of any column, and `verify_password(secret, row.secret_hash)[0]`.
  - `test_token_with_basic_auth`: 200, `token_type == "Bearer"`, `expires_in == 3600`, `scope == "catalog:read recommend:run"`. Decoding with `mcp_signing_key` gives `aud == "http://testserver/mcp"`, `sub == str(client.id)`, `ver == 1`.
  - `test_token_with_client_secret_post`
  - `test_requested_scope_narrows`: `scope="catalog:read"` gives `scope == "catalog:read"`.
  - `test_ungranted_scope_is_invalid_scope` (400)
  - `test_wrong_secret_and_unknown_client_are_identical_401`: same status, same body, and a `WWW-Authenticate` starting `Basic`.
  - `test_wrong_resource_is_invalid_target`: `resource=http://testserver/other` gives 400 `invalid_target`.
  - `test_unsupported_grant_type`: `password` gives 400.
  - `test_revoked_client`: no new token (401 `invalid_client`), and `verify_access_token` on the old token raises `InvalidPartnerToken` with reason `revoked` and the right `client_id`.
  - `test_rotate_invalidates_old_secret_and_tokens`
  - `test_mcp_token_rejected_by_learner_api`: `GET /api/v1/me` with the partner bearer gives 401.
  - `test_learner_token_not_a_partner_token`: `verify_access_token` on a learner token raises reason `malformed`.
  - `test_authorization_server_metadata`: `token_endpoint == "http://testserver/api/v1/oauth/token"`.
  - `test_cli_create_prints_secret_once`: call `cli.main()` with argv patched, capture stdout, and the printed secret authenticates.
- [ ] **Step 2: Run, expect failures** `.venv/Scripts/python.exe -m pytest backend/tests/test_partner_clients.py -q`, which FAILs on imports.
- [ ] **Step 3: Implement** the model, migration `0010` (`down_revision = "0009"`, create table with a CHECK `rate_limit_per_minute > 0`), service, router (registered in `create_app`: oauth router under `/api/v1`, and the metadata route on the root app), settings and CLI.
- [ ] **Step 4: Run** the new tests, then the full suite `.venv/Scripts/python.exe -m pytest -q`. All PASS.
- [ ] **Step 5: Commit** `git add <each file above>` then `git commit -m "Add partner API clients and the client-credentials token endpoint"`.

### Task 2: MCP server, partner authentication, scope filtering and catalog tools

**Files:**
- Create: `backend/tesda_track/mcp/__init__.py`, `mcp/server.py`, `mcp/auth.py`, `mcp/deps.py`, `mcp/scopes.py`, `mcp/schemas.py`, `mcp/tools_catalog.py`, `backend/tests/test_mcp_server.py`
- Modify: `backend/requirements.txt` (`mcp==2.3.0`), `backend/tesda_track/main.py` (install the server last, run its session manager in `lifespan`), `backend/tesda_track/schemas/delivery.py` (`ProgramSearch.provider_id: int | None = None`, `scholarship_only: bool = False`), `backend/tesda_track/services/training.py` (`search_programs` applies both filters), `backend/tests/conftest.py` (fixture `mcp`)

**Interfaces:**
- Consumes: Task 1's `verify_access_token`, `InvalidPartnerToken`, `PartnerPrincipal`, `mcp_resource_url`, `partner` fixture.
- Produces:
  - `mcp.server.install_mcp(app: FastAPI) -> MCPServer | None`. It does nothing when `mcp_enabled` is false. Otherwise it builds the server and calls `app.mount("/", server.streamable_http_app(...))` with `streamable_http_path="/mcp"`, `stateless_http=True`, `json_response=True` and `transport_security=TransportSecuritySettings(allowed_hosts=[urlsplit(public_base_url).netloc, *settings.mcp_allowed_hosts])`. It stores the server on `app.state.mcp_server`.
  - `create_app` calls `install_mcp` after `app.include_router(api)` and the root routes. `lifespan` wraps its `yield` in `async with app.state.mcp_server.session_manager.run():` when that attribute is set.
  - Server construction: `MCPServer(name="tesda-track", version="1.0.0", instructions=<two sentences on what the tools offer and that inputs about a person are never stored>, token_verifier=PartnerTokenVerifier(app), auth=AuthSettings(issuer_url=public_base_url, resource_server_url=mcp_resource_url, validate_token_resource=True), middleware=[ScopeMiddleware()])`.
  - `mcp.auth.PartnerTokenVerifier(app)` has `async verify_token(token) -> AccessToken | None`. It runs `verify_access_token` with a session from `deps.open_session(app)`. It returns `AccessToken(token=token, client_id=str(p.client_id), scopes=sorted(p.scopes), expires_at=<exp>, resource=mcp_resource_url, claims={"name": p.name, "expected_tools": list(p.expected_tools), "rate_limit_per_minute": p.rate_limit_per_minute})`, and `None` on `InvalidPartnerToken`.
  - `mcp.deps`:
    - `open_session(app) -> ContextManager[Session]`: yields `app.dependency_overrides[get_session]()` when overridden (no close), else `Session(get_engine())`.
    - `embedder(app) -> Embedder | None`: `app.dependency_overrides.get(get_embedder, get_embedder)()`.
    - `principal() -> CallerPrincipal(client_id: uuid.UUID, scopes: frozenset[str], expected_tools: tuple[str, ...], rate_limit_per_minute: int)`, read from `get_access_token()`.
  - `mcp.scopes.TOOL_SCOPES: dict[str, str]` and `TOOL_LIMITS: dict[str, int]`, exactly the Global Constraints table, all nine entries now.
  - `ScopeMiddleware.__call__(ctx, call_next)`:
    - `tools/list`: filters `result["tools"]` (a dict) to tools whose scope the token holds.
    - `tools/call`: a tool not in the caller's scopes raises `MCPError(code=-32602, message=f"Unknown tool: {name}")`.
  - `mcp.tools_catalog.register(server, app)` registers three tools; each uses `with open_session(app) as session`:
    - `get_qualification(code: str | None = None, title: str | None = None) -> QualificationDetail{qualification: QualificationSummary, possible_jobs: list[str], competencies: list[CompetencyPublic], other_levels: list[LevelRef{code, name, level: int}]}`. Exactly one of `code` or `title`; `title` matches `Qualification.name` case-insensitively. An unknown code or title raises `ToolError("No active qualification has that code or title. Closest titles: A; B; C.")`, with titles from `difflib.get_close_matches(<input>, active names, n=5, cutoff=0.4)`, or "No close titles." `other_levels` holds every active item in the same `goal_rules.level_of` family, the requested one included, sorted by level.
    - `search_training_programs(qualification_code=None, region_code=None, provider_id=None, delivery_mode=None, scholarship_only=False, near_lat=None, near_lon=None, radius_km=None, limit=20 (1..100), offset=0 (≥0)) -> ProgramPage{programs: list[TrainingProgramPublic], next_offset: int | None}`. It needs at least one of the first three, else `ToolError("Give a qualification_code, region_code or provider_id.")`. Coordinates are rounded to 1 decimal. `next_offset` is `offset + limit` when a full page came back.
    - `get_regional_supply(region_code: str | None = None) -> RegionalSupply{regions: list[RegionSupply]}`. An unknown region raises `ToolError` listing the valid region codes.
  - Every tool parameter carries `Annotated[..., Field(description=...)]`, and every docstring says what the tool answers in one or two sentences. These descriptions are what a partner's model reads.
  - Test fixture `mcp(client)` returns `call(headers, method, params=None, *, protocol="2026-07-28") -> httpx.Response`. For `2026-07-28` it sends `params._meta` with `io.modelcontextprotocol/protocolVersion`, `io.modelcontextprotocol/clientInfo` and `io.modelcontextprotocol/clientCapabilities`, plus the headers `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name` (tools/call only) and `Accept: application/json, text/event-stream`. Also `tool(headers, name, **arguments) -> dict` returns `response.json()["result"]` and asserts the HTTP status is 200.

- [ ] **Step 1: Write failing tests** in `backend/tests/test_mcp_server.py`:
  - `test_mcp_requires_bearer_token`: 401 with `resource_metadata="http://testserver/.well-known/oauth-protected-resource/mcp"` in `WWW-Authenticate`.
  - `test_protected_resource_metadata`: `resource == "http://testserver/mcp"`, `authorization_servers == ["http://testserver"]`.
  - `test_learner_token_rejected_at_mcp` (401)
  - `test_wrong_audience_rejected`: a token signed with `mcp_signing_key` but `aud="http://testserver/other"` gives 401.
  - `test_expired_token_is_401`
  - `test_revoked_client_refused_on_next_call`: 200, then `revoke_client`, then 401.
  - `test_foreign_host_is_rejected`: `Host: evil.example` gives 421.
  - `test_tools_list_filtered_by_scope`: a catalog-only partner sees exactly the three catalog tools.
  - `test_missing_scope_refuses_tool`: a `recommend:run`-only partner calling `get_qualification` gets `error.code == -32602`.
  - `test_tools_are_annotated_and_typed`: every listed tool has `readOnlyHint` true, `openWorldHint` false, an `outputSchema` and a description.
  - `test_older_protocol_client`: `initialize` with `protocolVersion` 2025-11-25, then `tools/list`, both 200.
  - `test_get_qualification_matches_rest`: `structuredContent.competencies == GET /api/v1/qualifications/SMAW-NC-II`'s `competencies`.
  - `test_get_qualification_by_title_any_case`
  - `test_unknown_qualification_suggests_titles`: `isError` true, and the text contains "Closest titles" and not the raw input.
  - `test_get_qualification_needs_exactly_one_argument`
  - `test_search_programs_filters`: `scholarship_only` and `provider_id` narrow results built with `make_program(scholarship_available=...)`, and no `contact_email` key appears anywhere in the result.
  - `test_search_programs_needs_a_filter`
  - `test_regional_supply_matches_admin_report`
- [ ] **Step 2: Run, expect failures.**
- [ ] **Step 3: Implement** to the interfaces. Install the dependency: `.venv/Scripts/python.exe -m pip install mcp==2.3.0`, which is already present locally.
- [ ] **Step 4: Run** the new tests and the full suite. All PASS. Also `.venv/Scripts/python.exe -m pytest backend/tests/unit/test_openapi_schema.py -q`: the MCP mount must not change the OpenAPI schema, apart from the token endpoint added in Task 1, whose schema change ships with Task 1.
- [ ] **Step 5: Commit** "Serve catalog tools over MCP to authenticated partner clients".

### Task 3: Recommendation tools and client-attributed ranking audits

**Files:**
- Create: `backend/tesda_track/mcp/tools_recommend.py`, `backend/migrations/versions/0011_ranking_audit_client.py`, `backend/tests/test_mcp_recommend.py`
- Modify: `backend/tesda_track/mcp/schemas.py`, `backend/tesda_track/mcp/server.py` (register), `backend/tesda_track/mcp/deps.py` (`note_ranking_audit(audit_id: int)` and `take_ranking_audit() -> int | None`, a contextvar), `backend/tesda_track/models/semantic.py` (`RankingAudit.api_client_id: uuid.UUID | None`, FK `api_client.id` ON DELETE RESTRICT, indexed), `backend/tesda_track/services/ranking.py` and `services/assessment_ranking.py` (keyword `api_client_id: uuid.UUID | None = None` stored on the audit), `backend/tesda_track/services/analysis.py` (`match` passes `limit` to `score_matches` and to the no-embedder slice, keeping the default 3)

**Interfaces:**
- Consumes: Task 2's `deps`, `ToolError` conventions and the `mcp` fixture.
- Produces five tools. All take `qualification_code` where relevant, and all turn a pydantic `ValidationError` raised while building a service request into `ToolError("; ".join(e["msg"] for e in errors))`. Those messages never contain the input value.
  - `match_qualifications(goal: str | None (1..1000), experience_years: float | None (0..80), has_certification: bool | None, answers: AssessmentAnswers | None, limit: int = 3 (1..10)) -> MatchOutput{interpreted: Profile, matches: list[Match]}`.
    - It needs `goal` or `answers`. `answers` passes through `learner_assessments.validate`.
    - It calls `analysis.match(session, goal or "", Profile(experience_years=..., has_certification=...), embedder, answers, limit)`.
    - Empty matches raise `ToolError("No qualification matched. Name a trade, job or skill, such as welder or magluto sa hotel.")`.
    - It never calls `match_stats.record`.
  - `recommend_route(qualification_code: str, experience_years: float | None = None, has_certification: bool | None = None) -> RouteOutput{route, reason, next_step, pathway: PathwayPublic | None}` via `analysis.pathway`.
  - `check_readiness(qualification_code: str, answers: dict[int, Literal["confident","some_experience","not_familiar"]]) -> ReadinessResult`.
    - Before calling `analysis.readiness`, it compares the answer keys with the qualification's active competency ids.
    - Missing ids raise `ToolError("Answer every competency. Missing competency ids: 3, 5.")`.
    - Unknown ids raise `ToolError("Unknown competency ids for this qualification: 99.")`.
  - `rank_training_programs(qualification_code, goal=None, near_lat=None, near_lon=None, region_code=None, preferred_delivery_mode=None, needs_scholarship=False, require_confirmed_availability=False, answers=None, limit=10) -> TrainingRankingOutput` (= `TrainingRanking` without `audit_id`).
    - A `region_code` without coordinates uses that `Region`'s latitude and longitude, rounded. An unknown region is a `ToolError`.
    - It calls `ranking.rank_programs(session, TrainingRankingRequest(...), embedder, None, api_client_id=principal().client_id)`, then `session.commit()` and `note_ranking_audit(result.audit_id)`.
  - `rank_assessment_schedules(qualification_code, goal=None, near_lat=None, near_lon=None, region_code=None, maximum_distance_km=None, maximum_fee=None, fee_is_mandatory=False, scheduled_after=None, scheduled_before=None, schedule_is_mandatory=False, answers=None, limit=10, offset=0) -> AssessmentRankingOutput` (= `AssessmentRanking` without `audit_id`, and results without `application_status`). It calls `assessment_ranking.rank(session, AssessmentRankingRequest(...), None, api_client_id=...)`, then commits and notes the audit.

- [ ] **Step 1: Write failing parity tests** in `backend/tests/test_mcp_recommend.py`. Each compares `structuredContent` with the REST response for the same input:
  - `test_match_text_path_matches_rest`: `POST /api/v1/analysis/matches {"query": "I want to be a welder", "profile": {"experience_years": 2}}`. Compare `[(m.qualification.code, m.score, m.reason)]`.
  - `test_match_semantic_matches_rest`: same, using the `semantic` fixture.
  - `test_match_structured_matches_rest`: against `POST /api/v1/recommendations/qualifications`.
  - `test_match_no_trade_is_tool_error`: `goal="hello there my friend"` gives `isError`, and the goal is not in the text.
  - `test_match_leaves_daily_counter_alone` (uses `clean_match_stats`; `MatchDailyStat` stays empty)
  - `test_invalid_input_error_does_not_echo_goal`: a 1,001-character goal of repeated "Juan Dela Cruz 09171234567 " gives `isError`, and neither "Juan" nor "0917" is in the text.
  - `test_route_matches_rest` (`POST /api/v1/analysis/pathway`)
  - `test_readiness_matches_rest` (`POST /api/v1/analysis/readiness`)
  - `test_readiness_lists_missing_ids`
  - `test_rank_training_matches_rest`: same program ids and scores, in order, and same `requires_verification` ids. The audit row has `api_client_id == partner.id`, `learner_id is None`, and `query_hash` equal to the HMAC of the goal.
  - `test_rank_training_region_uses_centroid`
  - `test_rank_assessments_matches_rest` (uses `make_schedule`): no `audit_id` and no `application_status` key in the output.
  - `test_full_partner_sees_eight_tools`: scopes `catalog:read recommend:run`.
- [ ] **Step 2: Run, expect failures.**
- [ ] **Step 3: Implement**, including migration `0011` (`down_revision = "0010"`: add column, FK, index) and the `api_client_id` keyword on both ranking services. Existing REST callers pass nothing.
- [ ] **Step 4: Run** the new tests, the full suite, and `.venv/Scripts/python.exe -m pytest backend/tests/test_ranking.py backend/tests/test_assessment_ranking.py backend/tests/test_analysis_api.py -q`. All PASS.
- [ ] **Step 5: Commit** "Serve matching, route, readiness and ranking tools over MCP".

### Task 4: Usage log, rate limits, retention and the admin usage report

**Files:**
- Create: `backend/migrations/versions/0012_mcp_call_log.py`, `backend/tesda_track/services/mcp_usage.py`, `backend/tesda_track/schemas/mcp_usage.py`, `backend/tesda_track/routers/mcp_admin.py`, `backend/tesda_track/mcp/usage.py`, `backend/tests/test_mcp_usage.py`
- Modify: `backend/tesda_track/models/partners.py`, `models/__init__.py`, `mcp/server.py` (middleware order: `[UsageMiddleware(app), ScopeMiddleware()]`, outermost first), `mcp/auth.py` (log token denials), `main.py` (admin router, hourly fold thread in `lifespan` alongside the cache purge), `cli.py` (`mcp-usage fold`)

**Interfaces:**
- Consumes: Tasks 1–3 (`TOOL_LIMITS`, `take_ranking_audit`, `principal`, `goal_fingerprint`).
- Produces:
  - Table `mcp_call_log` (`McpCallLog`):
    - `id` bigint pk; `client_id` uuid FK `api_client.id` RESTRICT, nullable, indexed; `called_at` timestamptz indexed; `latency_ms` int
    - `method` String(40); `tool` String(64) nullable
    - `outcome` String(20) CHECK in (`ok`,`tool_error`,`denied_token`,`denied_scope`,`rate_limited`,`invalid_request`,`server_error`); `error_code` String(64) nullable
    - `result_count` int nullable; `qualification_code` String(40) nullable; `region_code` String(20) nullable
    - `inputs_sent` ARRAY(Text); `goal_fingerprint` String(64) nullable; `page_offset` int nullable
    - `ranking_audit_id` bigint FK `ranking_audit.id` SET NULL nullable; `protocol_version` String(20) nullable
  - Table `mcp_call_daily` (`McpCallDaily`): pk (`date`, `client_id`, `tool`, `outcome`), `calls` int. The pk uses `''` for no tool and a nil UUID for no client.
  - `mcp_usage.record_call(**fields) -> None` writes on its own short session, like `services/match_stats.record`. It swallows exceptions and logs a warning that names only the exception type.
  - `mcp_usage.fold_old_rows(session, retention_days: int, now: datetime | None = None) -> int` returns the rows folded. It does `INSERT ... SELECT date, client, tool, outcome, count(*) GROUP BY ... ON CONFLICT DO UPDATE SET calls = mcp_call_daily.calls + excluded.calls`, then a DELETE.
  - `mcp_usage.usage_report(session, period: DateRange) -> UsageReport{clients: list[ClientUsage], unattributed_denials: int}`. `ClientUsage` holds:
    - `client_id, name, organisation, declared_purpose, expected_tools, scopes, is_active, calls, by_outcome: dict[str, int]`
    - `tools: list[ToolUsage{tool, calls, ok, tool_error, denied_scope, rate_limited, p50_ms: int | None, p95_ms: int | None, expected: bool}]`
    - `days: list[DayUsage{date, calls}]`, `unexpected_tool_calls: int`, `deep_paging_calls: int` (`search_training_programs` with `page_offset >= 200`)
    - Folded daily rows add to the counts; latency comes from detailed rows only.
  - `GET /api/v1/admin/mcp/usage` (query `DateRange`) and `GET /api/v1/admin/mcp/clients` (`list[ApiClientPublic]`, without the hash), both behind `require_admin`.
  - `mcp.usage.UsageMiddleware(app)`. For each request it times the call and, for `tools/call`:
    - It enforces `limiter.hit(f"{client}:*", principal.rate_limit_per_minute)`, then `limiter.hit(f"{client}:{tool}", TOOL_LIMITS[tool])`. The limiter is `app.state.mcp_limits`, a `RateLimiter`.
    - When limited it raises `MCPError(code=-32000, message=f"Rate limit exceeded; retry in {n} seconds.", data={"retry_after": n})` and logs `rate_limited`.
    - It classifies the outcome:
      - a result dict with `isError: true` → `tool_error`
      - `MCPError` -32602 raised by `ScopeMiddleware` → `denied_scope`
      - any other `MCPError` or `ValidationError` → `invalid_request`
      - anything else → `server_error`, and the exception is re-raised
    - It records:
      - `inputs_sent`: sorted argument names whose value is not null
      - `qualification_code` and `region_code`: only when they match `^[A-Za-z0-9-]{1,40}$` / `^[A-Za-z0-9-]{1,20}$`
      - `goal_fingerprint` when a `goal` argument was sent
      - `result_count`: the length of the first list under `matches`, `results`, `programs`, `regions`, `rows` or `competencies` in `structuredContent`
      - `page_offset` from an `offset` argument, `ranking_audit_id` from `take_ranking_audit()`, and `protocol_version` from `_meta`
    - `tools/list` and `initialize` are logged too; `result_count` for `tools/list` is the number of tools shown.
  - `PartnerTokenVerifier` records `outcome="denied_token"` with `error_code=reason`, `method="http"` and the token's client when it is known.

- [ ] **Step 1: Write failing tests** in `backend/tests/test_mcp_usage.py`:
  - `test_one_row_per_call_with_shape_only`: `inputs_sent == ["goal", "limit"]`, `qualification_code is None`, `outcome == "ok"`, `result_count >= 1`.
  - `test_goal_text_never_stored`: goal "Ako si Juan Dela Cruz 09171234567, gusto kong maging welder". Afterwards no row of `mcp_call_log` or `ranking_audit` (`row_to_json(t)::text`) contains "Juan" or "0917", and `goal_fingerprint` equals the HMAC.
  - `test_coordinates_not_stored`: `near_lat=14.59951`; no row text contains "14.5995", and `inputs_sent` contains `near_lat`.
  - `test_tool_error_logged`, `test_denied_scope_logged`, `test_revoked_token_logged_with_client`
  - `test_per_tool_rate_limit`: monkeypatch `TOOL_LIMITS["get_regional_supply"] = 2`; the third call gets `error.code == -32000` with `data.retry_after > 0` and is logged `rate_limited`.
  - `test_client_rate_limit`: a partner with `rate_limit=3` is limited on its fourth call across tools.
  - `test_log_failure_does_not_break_call`: monkeypatch the insert to raise; the tool result still comes back.
  - `test_fold_old_rows`: rows older than 180 days move to `mcp_call_daily`, and the report still counts them.
  - `test_usage_report_is_admin_only` (403 for a learner)
  - `test_usage_report_counts_and_flags`: expected vs unexpected tools, `deep_paging_calls`.
- [ ] **Step 2: Run, expect failures.**
- [ ] **Step 3: Implement**, including migration `0012` (`down_revision = "0011"`).
- [ ] **Step 4: Run** the new tests and the full suite. All PASS.
- [ ] **Step 5: Commit** "Log and rate-limit every MCP call per client, with an admin usage report".

### Task 5: Qualification demand by quarter, with small counts hidden

**Files:**
- Create: `backend/tesda_track/mcp/tools_reports.py`, `backend/tests/test_mcp_demand.py`
- Modify: `backend/tesda_track/services/reports.py`, `backend/tesda_track/mcp/schemas.py`, `backend/tesda_track/mcp/server.py`

**Interfaces:**
- Produces:
  - `reports.MIN_PUBLISHED_COUNT = 5`
  - `reports.hide_small_counts(values: dict[str, int], minimum: int = MIN_PUBLISHED_COUNT) -> tuple[dict[str, int | None], list[str]]`. Counts from 1 to minimum−1 become `None` and are named in the list; 0 stays 0.
  - `reports.quarter_range(label: str) -> DateRange`: `"2026-Q3"` gives 2026-07-01..2026-09-30; anything else raises `ValueError`.
  - Tool `get_qualification_demand(quarter: str (pattern ^\d{4}-Q[1-4]$), qualification_code: str | None = None) -> DemandOutput{quarter, date_from, date_to, rows: list[DemandRow{qualification, top_match, chosen, readiness_checks, average_readiness, assessment_applications, competent, certified, hidden: list[str]}]}`.
    - It uses `reports.qualification_demand(session, quarter_range(quarter))`.
    - `average_readiness` is `None` whenever `readiness_checks` is hidden or under 5.
    - Rows where every count is 0 or hidden are dropped.
    - A quarter that starts after today (Philippine time) is a `ToolError`.
    - Periods are whole calendar quarters on purpose: arbitrary date ranges would let a partner subtract two overlapping windows and recover a hidden count. The tool's description says so in one sentence.
  - The admin REST report is unchanged (TESDA's own admins see raw counts).

- [ ] **Step 1: Write failing tests:**
  - `test_hide_small_counts`: `{"a": 0, "b": 3, "c": 5}` gives `({"a": 0, "b": None, "c": 5}, ["b"])`.
  - `test_quarter_range_bounds_and_errors`
  - `test_demand_tool_hides_and_drops`: monkeypatch `reports.qualification_demand` to return two synthetic rows, one with all counts under 5, the other with `top_match=7, competent=2, readiness_checks=4`. The first row is dropped; the second has `competent is None`, `average_readiness is None`, and `hidden == ["competent", "readiness_checks"]` (sorted).
  - `test_future_quarter_is_tool_error`
  - `test_demand_needs_reports_scope`: a TSP-scoped partner gets `-32602`.
  - `test_demand_has_no_date_range_inputs`: the input schema has `quarter` and no `date_from` or `date_to`.
- [ ] **Step 2–4:** run (fail), implement, run the new tests and the full suite.
- [ ] **Step 5: Commit** "Serve quarterly qualification demand over MCP with small counts hidden".

### Task 6: Accept TESDA's official qualification codes (D1)

**Files:**
- Create: `backend/migrations/versions/0013_official_qualification_code.py`, `backend/tesda_track/services/official_codes.py`, `backend/tests/test_official_codes.py`
- Modify: `backend/tesda_track/models/catalog.py` (`OfficialQualificationCode`), `models/__init__.py`, `backend/tesda_track/seed.py` (`seed_all` imports `seed_dir / "sources" / "qualification_code_crosswalk.csv"` when it exists), `mcp/tools_catalog.py`, `mcp/tools_recommend.py`, `mcp/schemas.py`
- Data (already prepared, committed in this task): `backend/seed/sources/qualification_code_crosswalk.csv` has the columns `official_code, official_title, level, promulgated, enabled_in_t2mis, relation, qualification_code`. It holds 289 links (relation `same` 265, `covers` 15, `superseded_by` 9) for 278 of T2MIS's 323 codes.

**Interfaces:**
- Produces:
  - Table `official_qualification_code`:
    - pk (`official_code` String(20), `qualification_id` FK `qualification.id` RESTRICT)
    - `relation` String(20) CHECK in (`same`,`covers`,`superseded_by`)
    - `official_title` String(200), `level` String(5), `promulgated` date null, `enabled_in_t2mis` bool
  - `official_codes.import_crosswalk(session, path: Path) -> CrosswalkReport(linked: int, skipped: list[str])` is idempotent (upsert) and skips rows whose `qualification_code` isn't in the catalog.
  - `official_codes.resolve_code(session, code: str) -> list[tuple[Qualification, str]]` returns `(active qualification, relation)` pairs. Our own active code gives `[(q, "same")]`. An unknown code gives `[]`.
  - In every MCP tool that takes `qualification_code` or `code`, resolution goes through `resolve_code`:
    - One target: use it.
    - Several (`covers`): raise `ToolError("Official code X covers several TESDA-TRACK qualifications; choose one: A, B, C.")` with our codes.
    - None: the existing unknown-code error.
  - `QualificationDetail` gains `official_codes: list[OfficialCodeRef{code, relation, promulgated, enabled_in_t2mis}]`.

- [ ] **Step 1: Write failing tests** with a temporary CSV over the test catalog (`SMAW-NC-II`, `EIM-NC-II`, `CSS-NC-II`). Rows: `MEEEAW206 same SMAW-NC-II`; `CONEIM208` and `ELCEIM215` both `same EIM-NC-II`; `XXXCOV201 covers SMAW-NC-II` and `EIM-NC-II`; `ZZZ999 same NO-SUCH-CODE`.
  - `test_import_links_and_skips`: `linked == 5`, `skipped == ["ZZZ999"]`, and a second import changes nothing.
  - `test_resolve_own_and_official_codes`
  - `test_get_qualification_by_official_code`: `CONEIM208` gives EIM, and `official_codes` lists both EIM codes.
  - `test_covering_code_asks_to_choose`: `rank_training_programs(qualification_code="XXXCOV201")` gives `isError` naming both of our codes.
  - `test_seed_imports_real_crosswalk`: seeding the real `backend/seed` into the test database is too heavy, so assert instead that the real CSV parses and that every `qualification_code` in it exists in `backend/seed/qualifications.json`.
- [ ] **Step 2–4:** run (fail), implement, run the new tests and the full suite.
- [ ] **Step 5: Commit** "Accept TESDA's official qualification codes in MCP tools".

### Task 7: Onboarding doc, proxy routes and an end-to-end traffic check

**Files:**
- Create: `docs/mcp/partner-onboarding.md`, `backend/tesda_track/mcp/traffic_check.py`, `backend/tests/test_mcp_traffic.py`
- Modify: `deploy/Caddyfile` (before the catch-all `handle`, add `handle /mcp`, `handle /.well-known/oauth-protected-resource*` and `handle /.well-known/oauth-authorization-server`, each `reverse_proxy api:8000` with `header_up X-Forwarded-For {remote_host}`), `.env.example` (`PUBLIC_BASE_URL`, `MCP_TOKEN_SECRET`, `MCP_ENABLED`, `MCP_CALL_LOG_RETENTION_DAYS`, with one-line comments), `README.md` (a short "Partner MCP server" section linking the onboarding doc)

**Interfaces:**
- Produces:
  - `traffic_check.run_traffic(call: Callable[[str, str, dict], dict], tsp: Credentials, bsrs: Credentials) -> Tally`. `Tally` is `dict[(client_name, tool, outcome)] -> int`. It runs a fixed script:
    - TSP: 3× `match_qualifications` ok; 1× `match_qualifications` with a no-trade goal (`tool_error`); 2× `get_qualification` ok; 1× `get_qualification_demand` (`denied_scope`).
    - BSRS: 2× `search_training_programs` ok; 3× `get_regional_supply` with that tool's limit lowered to 2 (2 `ok`, 1 `rate_limited`).
    - One call with a revoked token (`denied_token`).
  - `python -m tesda_track.mcp.traffic_check --base-url URL --tsp-id --tsp-secret --bsrs-id --bsrs-secret --admin-token` runs the same script against a live server. It prints the tally beside `GET /api/v1/admin/mcp/usage` and exits non-zero on any difference.
  - Onboarding doc (for partner developers), with these sections:
    1. What the server offers
    2. Getting credentials (ask the TESDA-TRACK admin; the secret is shown once)
    3. Getting a token (curl, both client auth methods)
    4. Connecting (URL, protocol versions 2026-07-28 and 2025-11-25, required headers)
    5. The nine tools: purpose, scope, limit, and one example `tools/call` body with an abridged result each
    6. Errors and rate limits
    7. Data rules (send no names, ULI or contact details; the goal text is never stored; coordinates are rounded to about 11 km)
    8. Support

- [ ] **Step 1: Write failing test** `test_traffic_tally_matches_usage_report`: in-process via the `mcp` fixture. The tally equals the admin report's per-client per-tool per-outcome counts exactly, and no `mcp_call_log` or `ranking_audit` row text contains any goal string the script sent.
- [ ] **Step 2–4:** run (fail), implement, then run the test, the full suite and `.venv/Scripts/python.exe -m pytest backend/tests/unit/test_openapi_schema.py -q`.
- [ ] **Step 5: Commit** "Document partner onboarding and route MCP through Caddy".

## After all tasks (controller)

1. Full suite: `.venv/Scripts/python.exe -m pytest -q`.
2. Evaluation unchanged: from `backend/`, `../.venv/Scripts/python.exe -m evaluation.qualifications --output <scratch>/eval-after.json`, compared with the baseline taken before Task 1 (top-1, abstention and per-case codes identical).
3. MCP Inspector (CLI mode) against a locally started API with a freshly created client, using only the onboarding doc: `tools/list`, then one `tools/call` per tool.
4. Tool-selection check: a fresh subagent gets only the `tools/list` JSON and the 15 job-story questions, and reports its tool and arguments per question. Fix any description that causes a wrong pick.
5. Update the contract doc: diagram labels (scope and rate-limit refusals are JSON-RPC errors), demand by quarter, D1 status, D9 (older clients connect).
