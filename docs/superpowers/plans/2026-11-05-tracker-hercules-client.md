# Tracker ↔ Hercules Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read the three Hercules settings and build a tested client that exchanges a TSP handoff code for a scoped token and a learner profile, plus a CLI to try a real code from staging.

**Architecture:** `Settings` gains the Hercules fields. `services/hercules.py` holds a synchronous httpx client (`exchange_code`, `fetch_profile`) with typed errors that each carry a safe message. `schemas/hercules.py` whitelists the profile fields we accept, and the whitelist drops sensitive ones. A `tracker-exchange` CLI command uses the real client against staging and prints the profile's *shape* (keys, counts, never values), so the account-linking design can follow real data. No database, router or migration is in this plan.

**Tech Stack:** Python, FastAPI codebase, pydantic 2 / pydantic-settings, httpx 0.28 (`MockTransport` in tests), pytest.

**Spec:** `31-TRACKER_IFRAME_INTEGRATION.md` (repository root). Read the sections "Flow", "`POST /v1/tracker/token`", "`GET /v1/tracker/profile`" and "Security requirements".

## Global Constraints

- Environment keys, exactly as already set in `.env`: `HERCULES_BASE_URL`, `TRACKER_CLIENT_ID`, `TRACKER_CLIENT_SECRET`. Settings fields: `hercules_base_url`, `tracker_client_id`, `tracker_client_secret`.
- Endpoints, relative to the base URL: `POST /v1/tracker/token` with JSON body `{"code", "client_id", "client_secret"}`, and `GET /v1/tracker/profile` with `Authorization: Bearer <access_token>`. Never send an `sso_id` query parameter.
- Successful responses are wrapped as `{"success": true, "data": {...}}`. **Errors seen on staging (2026-11-05) are not wrapped.** They use the NestJS shape `{"message": str | [str], "error": str, "statusCode": int}`:
  - `/token` with a bad body → 400; `message` is a list of validation strings.
  - `/token` with wrong client credentials → 401, `message == "Invalid tracker client credentials."`
  - `/profile` without a token → 401, `message == "Tracker access token is missing."`
- Hercules' input limits (from the staging 400): `code` ≤ 4096 characters, `client_id` ≤ 256, `client_secret` ≤ 1024. None may be empty.
- Handoff codes are single-use with a 60-second TTL. **Never retry `/token`.**
- Fields that must never be kept, even if Hercules sends them: `nat_id`, `digital_id`, `blood_type`, `face_url`.
- Never log, print or put in an exception message: the client secret, the handoff code, the access token, or any profile value. Codebase rule: request bodies are never logged.
- Database-free tests live in `backend/tests/unit/` and run with
  `.venv/Scripts/python -m pytest --confcutdir=backend/tests/unit backend/tests/unit -q`.
  **Baseline before this plan: 220 passed, 3 failed.** The failures are `test_client_config_api.py::test_the_app_serves_it_from_the_environment_without_sign_in_or_a_database` and the two in `test_openapi_schema.py`, all `ModuleNotFoundError: No module named 'mcp'` (the package is missing from this `.venv`). They are not regressions, and new tests must not import `tesda_track.main`.
- Build `Settings` in tests as the other unit tests do: `Settings(_env_file=None, database_url="postgresql://unused", secret_key="test-only-" * 8, ...)`.
- Work on the existing branch `tracker-tsp-integration` (cut from `main`; the embed-contract design spec is committed there). Don't commit the untracked `web/`.

## Review Focus

1. **A failed exchange is retried.** If `/token` answers 5xx or times out, the code may already be spent; a retry burns a second attempt, or worse, succeeds twice. Expect exactly one request. Pinned in Task 2: `test_exchange_is_never_retried`.
2. **Hercules starts sending sensitive fields.** If `nat_id` or `face_url` appear in the payload, they must not survive parsing, and the CLI must say they were sent. Pinned in Task 2 (`test_profile_drops_sensitive_fields`) and Task 3 (`test_describe_reports_sensitive_and_unexpected_fields`).
3. **The granted scope is narrower than requested.** Sections such as `skills` or `credentials` may be missing; they parse as empty, not as an error. Pinned in Task 2: `test_profile_sections_missing_for_narrower_scope_are_empty`.
4. **Secrets leak through logs, reprs or messages.** Hercules errors get logged on purpose, so check every failure path. Pinned in Task 2 (`test_failures_never_log_secret_code_or_token`, `test_token_repr_hides_access_token`).
5. **Real-world `.env` values.** An empty `HERCULES_BASE_URL=` copied from `.env.example`, a base URL with a trailing slash or a path prefix, or an `http://` URL in production. Pinned in Task 1 (`test_empty_values_count_as_unset`, `test_http_base_url_refused_in_production`) and Task 2 (`test_base_url_path_prefix_and_trailing_slash_kept`).

---

### Task 1: Hercules settings

**Files:**
- Modify: `backend/tesda_track/config.py`: new fields after the MCP block (around line 112); extend `empty_secret_is_unset` (line 115); new model validator.
- Modify: `.env.example`: new section after "Center map tiles".
- Test: `backend/tests/unit/test_tracker_config.py`

**Interfaces:**
- Produces:
  - `Settings.hercules_base_url: HttpUrl | None = None`
  - `Settings.tracker_client_id: str | None = Field(default=None, max_length=256)`
  - `Settings.tracker_client_secret: SecretStr | None = Field(default=None, max_length=1024)`
  - `Settings.hercules_timeout_seconds: float = Field(default=10, gt=0)`
  - `Settings.tracker_integration_enabled -> bool` (a property; True only when all three are set)

- [ ] **Step 1: Check the branch**

Run: `git branch --show-current`
Expected: `tracker-tsp-integration`. If not, run `git switch tracker-tsp-integration`.

- [ ] **Step 2: Write the failing tests** in `test_tracker_config.py`. The module docstring follows the other unit tests ("Database-free checks. Run with --confcutdir=backend/tests/unit."). Use a `settings(**kwargs)` helper as above. `HERCULES = dict(hercules_base_url="https://hercules.example.test", tracker_client_id="tesda-tracker", tracker_client_secret="s" * 64)`.

```python
def test_integration_off_by_default():
    assert settings().tracker_integration_enabled is False

def test_all_three_values_turn_it_on():
    assert settings(**HERCULES).tracker_integration_enabled is True

@pytest.mark.parametrize("missing", ["hercules_base_url", "tracker_client_id", "tracker_client_secret"])
def test_partial_configuration_is_refused(missing):
    with pytest.raises(ValidationError, match="HERCULES_BASE_URL, TRACKER_CLIENT_ID and TRACKER_CLIENT_SECRET"):
        settings(**{**HERCULES, missing: None})

def test_empty_values_count_as_unset():
    assert settings(hercules_base_url="", tracker_client_id="", tracker_client_secret="").tracker_integration_enabled is False

def test_http_base_url_refused_in_production():
    with pytest.raises(ValidationError, match="https"):
        settings(**{**HERCULES, "hercules_base_url": "http://hercules.example.test"}, environment="production")

def test_http_base_url_allowed_in_development():
    assert settings(**{**HERCULES, "hercules_base_url": "http://localhost:3000"}).tracker_integration_enabled

def test_secret_is_hidden_in_repr():
    assert "s" * 64 not in repr(settings(**HERCULES))
```

- [ ] **Step 3: Run the tests to make sure they fail**

Run: `.venv/Scripts/python -m pytest --confcutdir=backend/tests/unit backend/tests/unit/test_tracker_config.py -q`
Expected: FAIL. `tracker_integration_enabled` doesn't exist, and the extra keys are ignored.

- [ ] **Step 4: Implement it in `config.py`**

- Add the four fields with a comment block in the file's style: what Hercules is (TSP's identity backend), that the secret must never reach the browser, and that the three values go together.
- Add the three field names to the existing `empty_secret_is_unset` decorator rather than writing a second validator.
- Add a `@model_validator(mode="after") tracker_integration_complete`. If one or two of the three are set, raise `ValueError("Set HERCULES_BASE_URL, TRACKER_CLIENT_ID and TRACKER_CLIENT_SECRET together, or none of them.")`. If `environment == "production"` and the scheme isn't `https`, raise `ValueError("HERCULES_BASE_URL must use https in production.")`.
- Add the `tracker_integration_enabled` property.

- [ ] **Step 5: Add the `.env.example` section** with the keys left empty. Only `HERCULES_TIMEOUT_SECONDS` goes in as a comment.

```
# --- TESDA Skill Passport sign-in (optional) -------------------------------------
# Lets TSP open TESDA-TRACK in an iframe or WebView already signed in (31-TRACKER_IFRAME_INTEGRATION.md).
# Hercules issues the client; set all three or none. The secret stays on the server: never put it in web/.
HERCULES_BASE_URL=
TRACKER_CLIENT_ID=
TRACKER_CLIENT_SECRET=
# HERCULES_TIMEOUT_SECONDS=10
```

- [ ] **Step 6: Run the unit suite**

Run: `.venv/Scripts/python -m pytest --confcutdir=backend/tests/unit backend/tests/unit -q`
Expected: 229 passed (220 + 9 new), plus the 3 baseline `mcp` failures.

- [ ] **Step 7: Commit**

```bash
git add backend/tesda_track/config.py backend/tests/unit/test_tracker_config.py .env.example
git commit -m "feat(tracker): read the Hercules client settings"
```

---

### Task 2: Hercules client and profile schema

**Files:**
- Create: `backend/tesda_track/schemas/hercules.py`
- Create: `backend/tesda_track/services/hercules.py`
- Test: `backend/tests/unit/test_hercules_client.py`

**Interfaces:**
- Consumes: Task 1's `Settings` fields and `tracker_integration_enabled`.
- Produces, in `schemas/hercules.py` (all models `extra="ignore"`):
  - `PersonalInformation`: every field in the spec's `personal_information` (`first_name` … `profile_photo`), each `str | None = None`.
  - `TrackerCredentials`: `certificates`, `trainings`, `assessments` and `external_certificates`, each `list[JsonValue] = []`.
  - `TrackerProfile`: `sso_id: str` (`min_length=1`), `uli: str | None = None`, `personal_information: PersonalInformation = PersonalInformation()`, `skills`, `experience`, `education` and `qualifications`, each `list[JsonValue] = []`, and `credentials: TrackerCredentials = TrackerCredentials()`.
  - `SENSITIVE_FIELDS = frozenset({"nat_id", "digital_id", "blood_type", "face_url"})`
  - List items stay `JsonValue` until real data shows their shape (Task 3 reports it).
- Produces, in `services/hercules.py`:
  - `@dataclass(frozen=True) TrackerToken(access_token: str = field(repr=False), expires_in: int, scopes: frozenset[str])`
  - `class HerculesError(Exception)`: `str(error)` is a safe, learner-facing message. Subclasses, each with its message constant:
    - `HerculesNotConfigured`: `NOT_CONFIGURED = "Signing in from TESDA Skill Passport isn't set up on this server."`
    - `HerculesUnavailable`: `UNAVAILABLE = "TESDA Skill Passport is unavailable right now. Please try again shortly."`
    - `HerculesClientRejected`: `CLIENT_REJECTED = "TESDA Skill Passport did not accept this portal's sign-in. Please contact the portal administrator."`
    - `HerculesCodeRejected` and `HerculesTokenRejected`: both use `SIGN_IN_EXPIRED = "Your TESDA Skill Passport sign-in has expired. Please open TESDA-TRACK from the Skill Passport again."`
  - `class HerculesClient(settings: Settings, transport: httpx.BaseTransport | None = None)`. Raises `HerculesNotConfigured` when `not settings.tracker_integration_enabled`.
    - `exchange_code(code: str) -> TrackerToken`
    - `fetch_profile_data(token: TrackerToken) -> dict`: the envelope's `data`, unparsed. Only the Task 3 CLI uses this.
    - `fetch_profile(token: TrackerToken) -> TrackerProfile`: `parse_profile(self.fetch_profile_data(token))`.
  - `parse_profile(data: dict) -> TrackerProfile`, a module function: `TrackerProfile.model_validate(data)`. A `ValidationError` becomes `HerculesUnavailable` (log only the error count, never the input).
  - `MAX_RESPONSE_BYTES = 2_000_000`, `CODE_MAX_LENGTH = 4096`, `ASSUMED_TOKEN_LIFETIME_SECONDS = 900` (used when `expires_in` is missing).

- [ ] **Step 1: Write the test fixture.** `FakeHercules` is a callable `MockTransport` handler. It records each `httpx.Request` in `.requests`. It returns `.token_response` for `POST …/v1/tracker/token` and `.profile_response` for `GET …/v1/tracker/profile` (each an `httpx.Response`, or a callable that raises). By default it answers `{"success": True, "data": TOKEN_OK_DATA}` and `{"success": True, "data": PROFILE_DATA}`:
- `TOKEN_OK_DATA = {"access_token": "tok-123", "token_type": "Bearer", "expires_in": 900, "scope": "profile skills experience credentials"}`
- `PROFILE_DATA`: `sso_id="sso-abc"`, `uli="ULI-1"`, `personal_information` with `first_name="Juana"` and `mobile_number="+639170000000"`, and `skills=[{"name": "Welding", "level": "NC II"}]`.

Also define `CODE = "code-xyz"`, `SECRET = "s" * 64`, `TOKEN = TrackerToken("tok-123", 900, frozenset({"profile", "skills", "experience", "credentials"}))`, and `client(fake, **settings_overrides) -> HerculesClient`, which builds the client over `httpx.MockTransport(fake)` with base URL `https://hercules.example.test`. Errors use the staging shapes from Global Constraints, e.g. `httpx.Response(401, json={"message": "Invalid tracker client credentials.", "error": "Unauthorized", "statusCode": 401})`.

- [ ] **Step 2: Write the failing tests**

```python
def test_exchange_posts_code_and_credentials_as_json():
    token = client(fake).exchange_code(CODE)
    request = fake.requests[0]
    assert (request.method, request.url) == ("POST", "https://hercules.example.test/v1/tracker/token")
    assert json.loads(request.content) == {"code": CODE, "client_id": "tesda-tracker", "client_secret": SECRET}
    assert token == TOKEN

def test_base_url_path_prefix_and_trailing_slash_kept():   # base "https://hercules.example.test/api/"
    assert fake.requests[0].url.path == "/api/v1/tracker/token"

def test_wrong_client_credentials_raise_client_rejected(): ...   # staging 401 credentials body -> HerculesClientRejected
@pytest.mark.parametrize("status", [400, 401, 403, 404, 410])
def test_other_refusals_mean_the_code_is_spent(status): ...     # -> HerculesCodeRejected
@pytest.mark.parametrize("code", ["", "x" * 4097])
def test_impossible_codes_are_refused_without_a_request(code):  # -> HerculesCodeRejected; fake.requests == []

@pytest.mark.parametrize("response", [
    httpx.Response(502, text="<html>Bad gateway</html>"),
    httpx.Response(200, text="not json"),
    httpx.Response(200, json={"success": False, "data": None}),
    httpx.Response(200, json={"success": True, "data": {"token_type": "Bearer", "expires_in": 900}}),
    httpx.Response(200, json={"success": True, "data": {**TOKEN_OK_DATA, "token_type": "mac"}}),
    httpx.Response(302, headers={"Location": "https://elsewhere.example.test/"}),
    httpx.Response(200, content=b"x" * 2_000_001),
])
def test_unusable_token_responses_mean_unavailable(response): ...   # -> HerculesUnavailable

def test_timeouts_mean_unavailable(): ...   # handler raises httpx.ConnectTimeout -> HerculesUnavailable
def test_exchange_is_never_retried():       # 502 and a timeout each -> exactly one request recorded
    assert len(fake.requests) == 1
def test_missing_expires_in_assumes_fifteen_minutes(): ...   # expires_in == 900

def test_profile_uses_the_bearer_token_and_no_sso_id():
    profile = client(fake).fetch_profile(TOKEN)
    request = fake.requests[0]
    assert request.headers["Authorization"] == "Bearer tok-123" and not request.url.query
    assert profile.sso_id == "sso-abc" and profile.skills == [{"name": "Welding", "level": "NC II"}]

def test_profile_drops_sensitive_fields():   # nat_id, digital_id, blood_type top-level; face_url in personal_information
    dumped = json.dumps(profile.model_dump())
    assert not any(name in dumped for name in SENSITIVE_FIELDS)

def test_profile_sections_missing_for_narrower_scope_are_empty():   # data = {"sso_id": "sso-abc"}
    assert profile.skills == [] and profile.credentials.certificates == [] and profile.personal_information.first_name is None

def test_expired_profile_token_raises_token_rejected(): ...   # staging 401 "Tracker access token is missing." -> HerculesTokenRejected
@pytest.mark.parametrize("data", [{}, {"sso_id": ""}, {"sso_id": 42}, {"sso_id": "a", "skills": "Welding"}])
def test_malformed_profiles_mean_unavailable(data): ...

def test_failures_never_log_secret_code_or_token(caplog):   # every error path above, at DEBUG
    assert not any(value in caplog.text for value in (SECRET, CODE, "tok-123", "Juana"))
def test_token_repr_hides_access_token():
    assert "tok-123" not in repr(TOKEN)
def test_unconfigured_settings_raise_not_configured(): ...
```

- [ ] **Step 3: Run the tests to make sure they fail**

Run: `.venv/Scripts/python -m pytest --confcutdir=backend/tests/unit backend/tests/unit/test_hercules_client.py -q`
Expected: FAIL with `ModuleNotFoundError: tesda_track.services.hercules`.

- [ ] **Step 4: Write `schemas/hercules.py`** to match the Interfaces block.

- [ ] **Step 5: Write `services/hercules.py`**

- Model it on `services/skills_bridge_mcp.py`: a module docstring saying what Hercules is and what is never sent or kept, `logger = logging.getLogger("tesda_track")`, and one `httpx.Client(timeout=settings.hercules_timeout_seconds, transport=transport, follow_redirects=False)` per call.
- Build each URL as `str(settings.hercules_base_url).rstrip("/") + "/v1/tracker/..."`.
- Read the body, refuse it as `HerculesUnavailable` if it exceeds `MAX_RESPONSE_BYTES`, then parse the JSON. Unwrap only on a 2xx with `success is True` and a dict `data`.
- How `/token` statuses map to errors:
  - 401 with `message == "Invalid tracker client credentials."` → `HerculesClientRejected`
  - any other 4xx → `HerculesCodeRejected`
  - 5xx, redirects and everything malformed → `HerculesUnavailable`
- For `/profile`, 401 → `HerculesTokenRejected`.
- What to log:
  - `ClientRejected`: `logger.error` with the status and Hercules' `error` field. An operator has to fix this.
  - Code and token refusals: `logger.warning` with the same two values.
  - `Unavailable`: `logger.warning` with the status or the exception type name.
  - Never log `message`, request bodies or headers.
- Turn `scope` into scopes with `str.split()`. A missing `scope` gives an empty set.

- [ ] **Step 6: Run the tests and the unit suite**

Run: `.venv/Scripts/python -m pytest --confcutdir=backend/tests/unit backend/tests/unit -q`
Expected: all new tests pass. The only failures are the 3 baseline `mcp` ones.

- [ ] **Step 7: Commit**

```bash
git add backend/tesda_track/schemas/hercules.py backend/tesda_track/services/hercules.py backend/tests/unit/test_hercules_client.py
git commit -m "feat(tracker): Hercules client for the TSP handoff code and profile"
```

---

### Task 3: `tracker-exchange` CLI for a real staging code

**Files:**
- Modify: `backend/tesda_track/services/hercules.py`: add `describe_profile`.
- Modify: `backend/tesda_track/cli.py`: update the docstring, add the parser and a `main()` branch placed **before** `from tesda_track.db import get_engine`, like `openapi`.
- Test: `backend/tests/unit/test_tracker_cli.py`

**Interfaces:**
- Consumes: `HerculesClient`, `HerculesError`, `parse_profile`, `TrackerProfile`, `SENSITIVE_FIELDS` from Task 2.
- Produces:
  - `describe_profile(data: dict) -> dict` in `services/hercules.py`. It returns structure and never values:
    - `sso_id`: the first 4 characters + `"…"` + `f" ({len} chars)"`
    - `uli`: a bool
    - `personal_information`: a sorted list of the non-empty field names
    - `sections`: maps each of `skills`, `experience`, `education`, `qualifications`, `credentials.certificates`, `credentials.trainings`, `credentials.assessments` and `credentials.external_certificates` to `{"count": int, "item_keys": sorted union of dict keys, or sorted type names for non-dict items}`
    - `unexpected_fields`: sorted keys the models don't know, top-level or `personal_information.<key>`
    - `sensitive_fields_sent`: sorted members of `SENSITIVE_FIELDS` found at either level
  - `run_tracker_exchange(client: HerculesClient, code: str, out: TextIO) -> None` in `cli.py`. It calls `client.exchange_code(code)`, then `data = client.fetch_profile_data(token)`, then `parse_profile(data)`, so a shape the model refuses fails here too. It writes `json.dumps({"token": {"expires_in": …, "scopes": sorted}, "profile": describe_profile(data)}, indent=2)`.

- [ ] **Step 1: Write the failing tests**

```python
def test_describe_shows_structure_not_values():
    shape = describe_profile(PROFILE_DATA)   # same data as Task 2's PROFILE_DATA
    assert shape["sso_id"] == "sso-… (7 chars)"
    assert shape["sections"]["skills"] == {"count": 1, "item_keys": ["level", "name"]}
    assert "Juana" not in json.dumps(shape) and "+639170000000" not in json.dumps(shape)

def test_describe_reports_sensitive_and_unexpected_fields():   # data adds nat_id, personal_information.face_url, foo
    assert shape["sensitive_fields_sent"] == ["face_url", "nat_id"]
    assert shape["unexpected_fields"] == ["foo", "nat_id", "personal_information.face_url"]

def test_describe_lists_scalar_item_types():   # skills = ["Welding", "Cooking"]
    assert shape["sections"]["skills"] == {"count": 2, "item_keys": ["str"]}

def test_run_prints_token_summary_and_shape():   # HerculesClient over Task 2's FakeHercules (copy the helper)
    output = json.loads(out.getvalue())
    assert output["token"] == {"expires_in": 900, "scopes": ["credentials", "experience", "profile", "skills"]}
    assert "tok-123" not in out.getvalue() and CODE not in out.getvalue()
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `.venv/Scripts/python -m pytest --confcutdir=backend/tests/unit backend/tests/unit/test_tracker_cli.py -q`
Expected: FAIL with `ImportError: describe_profile`.

- [ ] **Step 3: Implement `describe_profile` and `run_tracker_exchange`**

- [ ] **Step 4: Wire up the CLI**

- Parser: `commands.add_parser("tracker-exchange", help="trade a real TSP handoff code for its profile's shape (no database needed)")`. It takes no arguments.
- `main()` reads the code from `TRACKER_HANDOFF_CODE`, or else `getpass.getpass("Handoff code: ")`, so the code stays out of shell history. Then it runs `run_tracker_exchange(HerculesClient(get_settings()), code, sys.stdout)` and turns a `HerculesError` into `sys.exit(str(error))`.
- Add to the module docstring:

```
    python -m tesda_track.cli tracker-exchange

`tracker-exchange` trades a TSP handoff code (read from TRACKER_HANDOFF_CODE or prompted for; it lasts 60 seconds
and works once) for a Hercules token and profile, and prints the profile's shape — field names and counts, never
values — to check what Hercules really sends. Needs HERCULES_BASE_URL, TRACKER_CLIENT_ID, TRACKER_CLIENT_SECRET.
```

- [ ] **Step 5: Run the unit suite, then check the command parses**

Run: `.venv/Scripts/python -m pytest --confcutdir=backend/tests/unit backend/tests/unit -q`
Expected: all new tests pass. The only failures are the 3 baseline `mcp` ones.

Run: `cd backend && ../.venv/Scripts/python -m tesda_track.cli tracker-exchange --help`
Expected: usage text, no traceback.

- [ ] **Step 6: Commit**

```bash
git add backend/tesda_track/services/hercules.py backend/tesda_track/cli.py backend/tests/unit/test_tracker_cli.py
git commit -m "feat(tracker): CLI to inspect a real Hercules profile by shape"
```

---

## When a real handoff code is available (manual, not a task)

1. Get a code from TSP staging (`POST /v1/tracker/handoff` with a test learner). It expires in **60 seconds**, so have the command ready to run first.
2. Run `cd backend && ../.venv/Scripts/python -m tesda_track.cli tracker-exchange` and paste the code at the prompt.
3. Keep the printed shape: `item_keys` for each section, `unexpected_fields` and `sensitive_fields_sent`. It decides the typed item models and the mapping onto `Certification` and `official_codes`. If `sensitive_fields_sent` isn't empty, report it to the Hercules team, because it contradicts the spec.
4. Run it a second time with the same code to learn what a spent code returns, then pin that body in a test.

## Out of scope: next plan, after the open decisions

These wait on two answers: where Tracker is hosted (same-site `*.tesda.gov.ph` vs cross-site, which decides cookie vs in-memory bearer), and whether `sso_id` is stable.

- `learner_identity` table, nullable `password_hash` and a new certification source (migrations).
- `POST /api/v1/auth/tsp/session` with `RequestedWith`, rate limit, consent and audit log.
- The `frame-ancestors` header in the Caddyfiles.
