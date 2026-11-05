# TSP WebView Sign-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TSP's Flutter WebView can sign a learner in to TESDA-TRACK. It hands `/tsp/webview` a Hercules code over the `TspTrackerHost` channel. The page sends it to the backend, which links a TSP-only account after the learner consents and sets the existing session cookie.

**Architecture:**
- **Backend:** `services/tsp_sign_in.py` holds the flow (exchange, link or pending consent, audit) on three new tables. `routers/tsp_auth.py` exposes `POST /api/v1/auth/tsp/session` and `POST /api/v1/auth/tsp/consent` behind `tsp_sign_in_enabled`.
- **Frontend:** `features/tsp/bridge.ts` is the only code that knows the transport. `useTspSignIn` runs the sign-in state machine inside `WebviewLayout`, with a consent screen and a guest notice.

**Tech Stack:** FastAPI, SQLModel, Alembic and PostgreSQL; React, TanStack Query, openapi-fetch and Vitest.

**Spec:** `docs/superpowers/specs/2026-11-05-tsp-webview-sign-in-design.md`. The contract it implements is `docs/contracts/tsp-tracker-embed/CONTRACT.md`.

## Global Constraints

- **Branch:** `tsp-webview-sign-in`, cut from `tsp-embed-contract-v1`. Don't commit `web/` or `31-TRACKER_IFRAME_INTEGRATION.md`.
- **Backend tests:**
  - full suite: `.venv/Scripts/python -m pytest backend/tests -q`, against `TEST_DATABASE_URL`, the dev DB container on 127.0.0.1:5433
  - unit suite: `.venv/Scripts/python -m pytest --confcutdir=backend/tests/unit backend/tests/unit -q` (baseline 305 passed)
- **Frontend tests:** run `export PATH="/c/Program Files/nodejs:$PATH"` first, then in `frontend/` use `npx vitest run <paths>`.
- **Endpoint paths:** `POST /api/v1/auth/tsp/session` and `POST /api/v1/auth/tsp/consent`. Both require `X-Requested-With` (`RequestedWith`) and are rate-limited at 10 a minute per client address (`client_address_key`, `RateLimiter` on `app.state.tsp_sign_in_limits`).
- **Error body:** `{"detail": str, "code": "handoff_expired" | "unavailable" | "client_rejected"}`. The status mapping is the table in spec "Backend → `POST /api/v1/auth/tsp/session`".
- **Pending sign-ins** live 10 minutes. `pending_id` is `secrets.token_urlsafe(32)`.
- **Stored profile:** the sections `skills`, `experience`, `education`, `qualifications` and `credentials`, plus from `personal_information` only `first_name`, `middle_name`, `last_name`, `municipality`, `province`, `region` and `country`.
- **Audit events:** `consent_requested`, `linked`, `signed_in`, `consent_declined`, `uli_mismatch`.
- **Never log** the code, tokens, profile values, names or ULIs.
- **Frontend copy** lives in `frontend/src/copy/en.ts`, under `tspWebview.signIn`.
- **Nonces** are 43 characters of base64url from 32 random bytes. The handoff timeout is 10 000 ms.

## Review Focus

1. **A known `sso_id` arriving with a different ULI** must never sign in to the stored account. Pinned in Task 2: `test_uli_mismatch_refuses_and_audits`.
2. **Password sign-in on a TSP account,** which has no password hash, must fail like an unknown email and not crash. Pinned in Task 1: `test_password_sign_in_refused_for_tsp_account`.
3. **A late or replayed `handoff`,** after a timeout or with a used nonce, must be ignored. Pinned in Task 4: `ignores a late handoff` and `accepts each nonce once`.
4. **The previous learner's session on a fresh load:** the page must end it before asking for a code. Pinned in Task 5: `ends any session before sending ready`.
5. **A 401 from the TSP endpoints** must not open TESDA-TRACK's own "session expired" sign-in dialog. Pinned in Task 5: `a refused handoff does not open the sign-in dialog`.

---

### Task 1: Data model, migration, and password sign-in for TSP accounts

**Files:**
- Create: `backend/tesda_track/models/identity.py`, `backend/migrations/versions/0022_tsp_sign_in.py`
- Modify: `backend/tesda_track/models/learners.py` (make `password_hash` and `email` nullable), `backend/tesda_track/models/__init__.py` (export the new models), `backend/tesda_track/services/accounts.py` (`authenticate` and `change_password` handle a null hash), `backend/tesda_track/schemas/accounts.py` (`LearnerPublic.email: str | None`)
- Test: `backend/tests/test_tsp_accounts.py`

**Interfaces:**
- **Produces, in `models/identity.py`:**
  - `LearnerIdentity`, table `learner_identity`, with `id: uuid`, `provider: str(20)`, `subject: str(255)`, `learner_id: uuid` (FK, cascade, unique), `uli: str(64) | None`, `scopes: list` (JSONB), `profile: dict` (JSONB), `linked_at` and `last_signed_in_at`. It has a unique constraint on (`provider`, `subject`).
  - `TspPendingSignIn`, table `tsp_pending_sign_in`, with `id: str(64)` (PK), `subject`, `uli`, `scopes`, `profile`, `email: str(254) | None` and `expires_at` (indexed).
  - `TspSignInAudit`, table `tsp_sign_in_audit`, with `id: uuid`, `occurred_at`, `subject`, `learner_id` (FK, set null, nullable), `event: str(30)` (check constraint over the five events) and `scopes: list`.
  - `TSP_PROVIDER = "tsp"` and `AUDIT_EVENTS`.
- **The migration** is `revision = "0022"`, `down_revision = "0021"`. Its downgrade deletes TSP-only learners (those with a null `password_hash`) before restoring NOT NULL.

- [ ] **Step 1:** Write `test_tsp_accounts.py`. It needs the `session` and `client` fixtures and a helper `tsp_learner(session)` that adds a `Learner(email=None, password_hash=None, full_name="Ana Santos", privacy_consent_at=utcnow())`. Tests:
  - `test_tsp_learner_without_email_or_password_can_be_stored`
  - `test_password_sign_in_refused_for_tsp_account`: give the learner an email, then `POST /api/v1/auth/token` with that email and any password must answer 401 with the same detail as an unknown email
  - `test_learner_public_allows_no_email`: `LearnerPublic.model_validate(tsp_learner).email is None`
  - `test_identity_subject_is_unique_per_provider`: a second `LearnerIdentity` with the same (`tsp`, subject) raises `IntegrityError`
- [ ] **Step 2:** Run `.venv/Scripts/python -m pytest backend/tests/test_tsp_accounts.py -q`. Expected: FAIL on the import of `tesda_track.models.identity`.
- [ ] **Step 3:** Implement the models, the migration and the changes to `accounts` and `schemas`. In `authenticate`, if `learner.password_hash is None`, call `burn_verification_time(password)` and raise `AuthenticationError()`. `change_password` raises `InvalidRequestError` for a null hash.
- [ ] **Step 4:** Run the test file, then the full backend suite. Expected: the new tests pass, and the suite is no worse than the baseline.
- [ ] **Step 5:** Commit: `feat(tracker): tables for TSP-linked learners, and accounts without a password`.

### Task 2: The sign-in service

**Files:**
- Create: `backend/tesda_track/services/tsp_sign_in.py`
- Modify: `backend/tesda_track/errors.py` (add `TspSignInError`), `backend/tesda_track/main.py` (the error handler adds `code` when present), `backend/tesda_track/services/cache.py` (the purge thread also purges expired pending sign-ins), `backend/tesda_track/config.py` (`tsp_sign_in_enabled` and its validator)
- Test: `backend/tests/test_tsp_sign_in.py`, plus `backend/tests/unit/test_tracker_config.py` for the validator

**Interfaces:**
- **Consumes:** `HerculesClient` and the `Hercules*` errors from `services/hercules.py`, `TrackerProfile`, and the Task 1 models.
- **Produces:**
  - `class TspSignInError(DomainError)` with attributes `status_code` and `code`, built as `TspSignInError(code: str, status_code: int, detail: str)`
  - `@dataclass ConsentRequired(pending_id: str, name: str, keeps: list[str])`
  - `sign_in(session: Session, client: HerculesClient, code: str) -> Learner | ConsentRequired`
  - `consent(session: Session, pending_id: str, accept: bool) -> Learner | None`, which raises `TspSignInError("handoff_expired", 404, ...)` for an unknown or expired id
  - `kept_profile(profile: TrackerProfile) -> dict`
  - `purge_expired_pending(session: Session) -> int`
  - `Settings.tsp_sign_in_enabled: bool = False`. The validator text is "Set HERCULES_BASE_URL, TRACKER_CLIENT_ID and TRACKER_CLIENT_SECRET before TSP_SIGN_IN_ENABLED."

- [ ] **Step 1:** Write `test_tsp_sign_in.py`. A `hercules(profile_data, token_response=None)` helper builds a `HerculesClient` over `httpx.MockTransport`, in the style of `test_hercules_client.py`'s `FakeHercules`. Tests:
  - `test_new_learner_needs_consent`: returns `ConsentRequired`, with `keeps` naming only the sections present; one pending row exists; audit `consent_requested`
  - `test_consent_accept_creates_linked_account`: `Learner` has no password and `privacy_consent_at` is set; the identity holds `kept_profile`; the pending row is gone; audit `linked`
  - `test_consent_decline_keeps_nothing`: no learner and no pending row; audit `consent_declined`
  - `test_expired_or_unknown_pending_is_handoff_expired`
  - `test_known_learner_signs_in_and_profile_refreshes`: audit `signed_in`, `last_signed_in_at` updated, `full_name` updated
  - `test_uli_mismatch_refuses_and_audits`: `TspSignInError` code `unavailable`, status 409; audit `uli_mismatch`; the identity is unchanged
  - `test_stored_uli_filled_when_first_missing`
  - `test_kept_profile_holds_only_allowed_fields`: no `mobile_number`, `date_of_birth`, `address` or `email_address` in it
  - `test_email_kept_only_when_unused`
  - `test_hercules_errors_map_to_contract_codes`, parametrized over code rejected (401, `handoff_expired`), unavailable (503, `unavailable`) and client rejected (503, `client_rejected`)
  - `test_purge_removes_expired_pending`
- [ ] **Step 2:** Run the test file. Expected: FAIL on the import.
- [ ] **Step 3:** Implement the service. Add the setting and its validator, with a unit test `test_tsp_sign_in_needs_the_hercules_client`. Teach the `main.py` handler to send `code`. Add `purge_expired_pending` to the cache purge loop.
- [ ] **Step 4:** Run the file, the unit suite and the full backend suite.
- [ ] **Step 5:** Commit: `feat(tracker): sign TSP learners in, with consent before linking`.

### Task 3: The endpoints, client-config, and deployment keys

**Files:**
- Create: `backend/tesda_track/routers/tsp_auth.py`, `backend/tesda_track/schemas/tsp_auth.py`
- Modify: `backend/tesda_track/main.py` (include the router, add `app.state.tsp_sign_in_limits`), `backend/tesda_track/routers/meta.py` and `schemas/meta.py` (`tsp_sign_in: bool`), `docker-compose.yml`, `.env.example`, and `frontend/openapi.json` plus `frontend/src/api/schema.d.ts` (regenerated)
- Test: `backend/tests/test_tsp_auth_api.py`, and `backend/tests/unit/test_client_config_api.py` for `tsp_sign_in`

**Interfaces:**
- **Schemas:**
  - `TspSessionRequest(code: str = Field(min_length=1, max_length=4096))`
  - `TspConsentRequest(pending_id: str = Field(min_length=1, max_length=64), accept: bool)`
  - `TspConsentRequired(consent_required: Literal[True], pending_id: str, summary: TspConsentSummary)`
  - `TspConsentSummary(name: str, keeps: list[str])`
- **Dependency** `hercules_client(settings) -> HerculesClient`, so tests can override it.
- **The routers read settings through `Depends(get_settings)`,** so tests can override that too. Both routes answer 404 when `tsp_sign_in_enabled` is false.

- [ ] **Step 1:** Write `test_tsp_auth_api.py`, overriding `get_settings` (integration on, with fake Hercules values) and `hercules_client`. Tests:
  - `test_disabled_answers_404`
  - `test_new_learner_gets_202_then_consent_sets_cookie`
  - `test_known_learner_gets_200_and_cookie`
  - `test_error_body_has_contract_code`: 401 `handoff_expired`
  - `test_requested_with_required`: 403 without the header
  - `test_rate_limited`: the 11th call answers 429 with code `unavailable`
  - `test_consent_decline_204`
  - in `test_client_config_api.py`: `test_client_config_reports_tsp_sign_in`
- [ ] **Step 2:** Run them. Expected: FAIL with a 404 on the route.
- [ ] **Step 3:** Implement the router, the schemas, the `main.py` wiring and the meta field. Add `TSP_SIGN_IN_ENABLED` to `.env.example` and `docker-compose.yml` (the API service, beside `SKILLS_BRIDGE_*`). Regenerate `openapi.json` and the frontend types.
- [ ] **Step 4:** Run the file, the unit suite and the full backend suite.
- [ ] **Step 5:** Commit: `feat(tracker): TSP sign-in and consent endpoints`.

### Task 4: The WebView bridge

**Files:**
- Create: `frontend/src/features/tsp/bridge.ts` and `frontend/src/features/tsp/bridge.test.ts`

**Interfaces:**
- **Produces:**
  - `type CodeResult = { code: string } | { failed: 'not_signed_in' | 'unavailable' } | { timeout: true }`
  - `interface Bridge { requestCode(reason: 'initial' | 'reload' | 'session_expired' | 'retry'): Promise<CodeResult>; onLogout(handler: () => void): () => void; signedIn(): void; error(code: 'handoff_expired' | 'unavailable' | 'client_rejected' | 'timeout'): void }`
  - `connectBridge(win?: Window, timeoutMs?: number): Bridge | null`
  - `newNonce(): string`

- [ ] **Step 1:** Write `bridge.test.ts`, using a fake `window.TspTrackerHost = { postMessage }` and fake timers. Tests:
  - `returns null without the TspTrackerHost channel`
  - `returns null for host=web`
  - `installs TspTracker.receive before sending ready`
  - `nonce is 43 base64url characters`
  - `resolves with the code for the matching nonce`
  - `accepts each nonce once`
  - `ignores a handoff for an unknown nonce`
  - `ignores a late handoff`: after the 10 s timeout resolves `{timeout: true}`, a handoff with that nonce does nothing
  - `ignores malformed JSON and other versions`
  - `handoff_failed resolves failed`
  - `logout calls the handler`
  - `signedIn and error post the right messages`
- [ ] **Step 2:** Run `npx vitest run src/features/tsp/bridge.test.ts`. Expected: FAIL on the import.
- [ ] **Step 3:** Implement `bridge.ts`.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(tracker): bridge for TSP's WebView channel`.

### Task 5: The sign-in hook, consent screen, notice and wiring

**Files:**
- Create: `frontend/src/features/tsp/useTspSignIn.ts`, `TspConsent.tsx`, `TspSignInNotice.tsx` and `useTspSignIn.test.tsx`
- Modify: `frontend/src/auth/useAuth.ts` and `AuthProvider.tsx` (`adoptSession(learner)`, which wraps `startSession`), `frontend/src/api/client.ts` (the two TSP paths in `SIGN_IN_PATHS`), `frontend/src/components/Layout.tsx` (`WebviewLayout` renders the consent screen and the notice), `frontend/src/copy/en.ts`, and the `client-config` query consumer

**Interfaces:**
- **Consumes:** `connectBridge` (Task 4), the Task 3 endpoints, `Auth.signOut` and `adoptSession`.
- **Produces:** `useTspSignIn(): { state: 'guest' | 'signing_in' | 'consent' | 'signed_in' | 'failed'; summary?: TspConsentSummary; canRetry: boolean; retry(): void; answerConsent(accept: boolean): Promise<void> }`.

- [ ] **Step 1:** Write `useTspSignIn.test.tsx` with MSW handlers for the endpoints and a fake bridge. Tests:
  - `stays guest when tsp_sign_in is off or there is no bridge`
  - `ends any session before sending ready`: `DELETE /api/v1/auth/session` comes before `requestCode`
  - `200 signs in and calls signedIn`
  - `202 shows consent; accepting signs in`
  - `declining stays guest`
  - `handoff_expired retries once, then reports error`
  - `client_rejected reports error with no retry button`
  - `not_signed_in failure has no retry`
  - `timeout reports error and allows retry`
  - `logout ends the session and returns to /tsp/webview`
  - `a refused handoff does not open the sign-in dialog`
  - Also `TspConsent` accept and decline, and `TspSignInNotice` shows the retry button only when `canRetry`.
- [ ] **Step 2:** Run them. Expected: FAIL on the import.
- [ ] **Step 3:** Implement and wire it up, and add the copy.
- [ ] **Step 4:** Run the `features/tsp`, `auth` and `api` tests, then `npx tsc -b` and `npx eslint src/features/tsp src/auth src/api src/components`.
- [ ] **Step 5:** Commit: `feat(tracker): sign TSP learners in from /tsp/webview`.

### Task 6: Framing header and contract clarification

**Files:** `frontend/vercel.json` and `docs/contracts/tsp-tracker-embed/CONTRACT.md`

- [ ] **Step 1:** Add `"headers": [{"source": "/(.*)", "headers": [{"key": "Content-Security-Policy", "value": "frame-ancestors 'none'"}]}]` to `vercel.json`. Add the sentence from spec "Contract and deployment" under the contract's "Mobile host".
- [ ] **Step 2:** Run `.venv/Scripts/python -m pytest --confcutdir=backend/tests/unit backend/tests/unit/test_embed_contract.py -q` and check that `vercel.json` parses as JSON.
- [ ] **Step 3:** Commit: `chore(tracker): staging refuses framing; contract notes the consent screen`.
