# Signing TSP Learners In Through the WebView: Design

**Date:** 2026-11-05
**Status:** design approved in conversation; this written spec is awaiting review
**Implements:** TESDA-TRACK's side of `docs/contracts/tsp-tracker-embed/CONTRACT.md` (version 1), for the Flutter WebView
**Uses:** the Hercules client (`backend/tesda_track/services/hercules.py`, merged)

## Purpose

TSP's mobile app already opens `/tsp/webview` in a WebView, and TESDA-TRACK treats the learner as a guest there. This
work lets TSP sign the learner in. TSP hands the page a one-time Hercules code over the `TspTrackerHost` channel.
TESDA-TRACK then exchanges the code, links the learner to a TESDA-TRACK account (after the learner consents), and
starts a session.

**Success:**
- A learner who opens TRACK in the TSP app is signed in within a few seconds of the page loading, or sees a consent
  screen on their first visit.
- Every failure leaves them using TESDA-TRACK as a guest, exactly as today.
- No step depends on anything TSP hasn't been given in the contract.

**Decisions taken (conversation, 2026-11-05):**
- **Hosts:** the Flutter WebView first. The web iframe is step 2, on the same endpoints.
- **Accounts:** linked, TSP-only learner accounts with no password. The rest of TESDA-TRACK stays guest-only for
  learners (commit `af0b60f`).
- **Account key:** `sso_id`, with the ULI stored and checked. Production switch-on waits for Hercules to confirm that
  `sso_id` is stable, behind a setting.
- **Consent:** TESDA-TRACK shows its own consent step before creating an account.

**Out of scope:**
- **The web iframe.** It needs an in-memory token, because `tesda-track.vercel.app` is cross-site to TSP. It also
  needs `host=web` kept across reloads and `frame-ancestors` for TSP's web origin.
- **Prefill from the profile.** It waits until `tracker-exchange` shows the real shape of the profile's items.
- **Mapping TSP certificates onto `Certification` records.** Same reason.

## Why the WebView can use the existing session

In the WebView, TESDA-TRACK is the top-level page. The React app and the API share an origin: Vercel passes `/api/*`
to the API (`frontend/vercel.json`). So the existing `tesda_session` cookie works as it does in a browser tab:
HttpOnly, `SameSite=Strict`, path `/api`, plus the `X-Requested-With` rule for writes. No new session mechanism is
needed for this step.

## Backend

### Settings

- `tsp_sign_in_enabled: bool = False`. While it is false, both endpoints answer 404, and `GET /api/v1/client-config`
  reports `tsp_sign_in: false`, so the page doesn't start a handoff.
- **Requirement:** setting it to true requires `tracker_integration_enabled`. This is a settings validator with the
  error text "Set HERCULES_BASE_URL, TRACKER_CLIENT_ID and TRACKER_CLIENT_SECRET before TSP_SIGN_IN_ENABLED."
- **`docker-compose.yml`:** the API service passes `HERCULES_BASE_URL`, `TRACKER_CLIENT_ID`, `TRACKER_CLIENT_SECRET`
  and `TSP_SIGN_IN_ENABLED` through, the way it passes the `SKILLS_BRIDGE_*` keys.

### `POST /api/v1/auth/tsp/session`

- **Body:** `{"code": string}`, 1–4096 characters. The frontend checks `state` against its own nonce, so the backend
  doesn't need it.
- **Requests:** `X-Requested-With` is required. The rate limit is 10 a minute per client address, using the existing
  `RateLimiter` held on `app.state`.
- **Steps:**
  1. `HerculesClient.exchange_code(code)`, then `fetch_profile(token)`. The Hercules token is not kept.
  2. Look up `learner_identity` by (`provider = "tsp"`, `subject = profile.sso_id`).
  3. **Known learner whose stored ULI is empty or equals `profile.uli`:**
     - update the identity's `profile`, `scopes`, `uli` (if it was empty) and `last_signed_in_at`
     - update `Learner.full_name` from the profile
     - write an audit row `signed_in`
     - set the session cookie
     - answer **200** with `SessionResponse`
  4. **Known learner whose stored ULI differs from `profile.uli`:**
     - write an audit row `uli_mismatch`
     - log a warning carrying the identity id only, never names or ULIs
     - answer **409**, code `unavailable`
  5. **Unknown learner:**
     - store a pending sign-in, which expires in 10 minutes
     - write an audit row `consent_requested`
     - answer **202** with `{"consent_required": true, "pending_id": ..., "summary": {"name": ..., "keeps": [...]}}`
     - `keeps` lists the sections the profile actually contains, out of `skills`, `experience`, `education`,
       `qualifications`, `certificates` and `location`
- **Errors** carry `{"detail": <learner-facing text>, "code": <contract error code>}`:

| Hercules client error | HTTP | `code` |
|---|---|---|
| `HerculesCodeRejected`, `HerculesTokenRejected` | 401 | `handoff_expired` |
| `HerculesUnavailable` | 503 | `unavailable` |
| `HerculesClientRejected`, `HerculesNotConfigured` | 503 | `client_rejected` |
| ULI mismatch | 409 | `unavailable` |
| Rate limited | 429 | `unavailable` |

### `POST /api/v1/auth/tsp/consent`

- **Body:** `{"pending_id": string, "accept": bool}`. `X-Requested-With` and the same rate limit apply.
- **`accept: true`:**
  - create the `Learner` (`email` from the profile if it has one and no account already uses it, otherwise null;
    `password_hash` null; `privacy_consent_at` now; role `learner`)
  - create the `learner_identity`
  - delete the pending row and write the audit row `linked`
  - set the cookie and answer **200** with `SessionResponse`
- **`accept: false`:** delete the pending row, write the audit row `consent_declined`, and answer **204**.
- **An unknown or expired `pending_id`** gets **404** with code `handoff_expired`. The page then asks TSP for a new
  code.
- **Two consents for the same `sso_id` racing:** the unique constraint decides. The loser re-reads and signs into the
  winner's account.

### Data model (one Alembic migration)

- **`learner_identity`:**
  - `id`
  - `provider` (string, `tsp`) and `subject` (string, the `sso_id`), unique together
  - `learner_id` (FK `learner.id`, `ON DELETE CASCADE`, unique)
  - `uli` (nullable)
  - `scopes` (JSONB list)
  - `profile` (JSONB)
  - `linked_at` and `last_signed_in_at`
- **What `profile` holds:**
  - the profile's `skills`, `experience`, `education`, `qualifications` and `credentials` sections as Hercules sent
    them, with sensitive fields already stripped at any depth by `TrackerProfile`
  - from `personal_information`, only `first_name`, `middle_name`, `last_name`, `municipality`, `province`, `region`
    and `country`
  - nothing else
- **`tsp_pending_sign_in`:** `id` (the `pending_id`, 32 random bytes in base64url), `subject`, `uli`, `scopes`,
  `profile` (as above), `email` (nullable) and `expires_at`. It is purged by the existing cache purge thread.
- **`tsp_sign_in_audit`:** `id`, `occurred_at`, `subject`, `learner_id` (nullable), `event` (one of `consent_requested`,
  `linked`, `signed_in`, `consent_declined`, `uli_mismatch`) and `scopes`. This is the consent and audit trail spec 31
  asks for (client id, `sso_id`, scopes, timestamps); the client id is constant, so it isn't stored.
- **`learner.password_hash`** becomes nullable. `accounts.authenticate` treats a null hash as a wrong password and burns
  the same verification time, so password sign-in can't reveal TSP accounts.
- **`learner.email`** becomes nullable, and stays unique when set. Accounts are never linked by email.
- **The rest of the code:** places that assume an email (account payload, admin user list, `create-admin`) handle
  null. `LearnerPublic.email` becomes optional.

### Logging and privacy

- Never log the code, tokens, the profile or the ULI. Audit rows hold the `sso_id`, which is a TSP identifier and not
  personal information.
- The pending profile lives only on the server, never in the browser. The consent screen gets the name and the list
  of section names, nothing else.

## Frontend (`frontend/src/features/tsp/`)

### `bridge.ts`

- **`connectBridge(): Bridge | null`:** returns null when `window.TspTrackerHost` is missing (older TSP app versions,
  or a normal browser). In that case the page runs as a guest, as today.
- **Order:** it installs `window.TspTracker = { receive(json) }` before anything is sent.
- **The `Bridge` interface:**
  - `requestCode(reason) -> Promise<{code} | {failed: reason} | {timeout: true}>`. It sends `ready` with a new nonce
    (32 bytes from `crypto.getRandomValues`, base64url, 43 characters) and waits up to 10 seconds.
  - `onLogout(handler)`
  - `signedIn()`
  - `error(code)`
- **Incoming messages:**
  - They're parsed with `JSON.parse` inside `try`, then checked for `version === 1` and a known `type`.
  - A `handoff` is accepted only for a nonce still pending, and only once. Late or unknown ones are ignored.
  - `?host=web` → the bridge returns null in this step.

### `useTspSignIn()` (used by `WebviewLayout`)

- **State:** `guest` | `signing_in` | `consent` (holding `pending_id` and `summary`) | `signed_in` |
  `failed` (holding `code` and `canRetry`).
- **On load, when `client-config.tsp_sign_in` is true and a bridge exists:**
  1. end any existing session (`DELETE /api/v1/auth/session`)
  2. clear the finder's session-storage answers
  3. `requestCode('initial')`

  This is the contract's fresh-load guarantee.
- **What each result does:**
  - **code:** `POST /api/v1/auth/tsp/session`.
    - **200:** refresh `AuthProvider`, call `signedIn()`, state `signed_in`.
    - **202:** state `consent`.
    - **error `handoff_expired`, the first time:** `requestCode('retry')`.
    - **Any other error, or `handoff_expired` the second time:** call `error(code)`, state `failed`.
  - **`failed: reason`:** state `failed` with no `error` sent. `canRetry` is false for `not_signed_in`.
  - **`timeout`:** call `error('timeout')`, state `failed`, `canRetry` true.
  - **`canRetry`** is false for `client_rejected` and `not_signed_in`, and true otherwise. "Sign in again" calls
    `requestCode('retry')`.
- **On `logout`:** call `DELETE /api/v1/auth/session`, clear the finder's answers, navigate to `/tsp/webview`, state
  `guest`, and ignore further codes until the next load.

### `TspConsent.tsx`

- **Shown in the compact shell** when the state is `consent`.
- **Content:** the learner's name, what TESDA-TRACK keeps (the `keeps` list in plain words) and why (to recommend
  qualifications and training near them, and to remember their progress).
- **"Agree and continue"** sends `POST /api/v1/auth/tsp/consent` with `accept: true`. **"Not now"** sends
  `accept: false` and leaves the learner a guest.
- **A 404** (the pending sign-in expired) leads to `requestCode('retry')`.
- **Copy:** all text goes in `copy/en.ts`.

### `TspSignInNotice`

- A one-line notice in the shell for the `failed` state: "You're using TESDA-TRACK without signing in."
- It includes the "Sign in again" button when `canRetry` is true.

### Client config

`ClientConfig` gains `tsp_sign_in: bool`. The OpenAPI file and the frontend's generated types are regenerated
(`python -m tesda_track.cli openapi frontend/openapi.json`, then `npm run api:types`).

## Contract and deployment

- **`CONTRACT.md`** gets one clarification under "Mobile host", which changes no message: "Don't cover the WebView
  with a loading indicator: TESDA-TRACK may show a consent screen before it sends `signed_in`."
- **`frontend/vercel.json`** sends `Content-Security-Policy: frame-ancestors 'none'` on every path. That closes the
  "any site can frame staging" gap until step 2 allows TSP's web origin on `/tsp/webview`. `frontend/Caddyfile`
  already sends it.

## Testing

**Backend (pytest).** The endpoint and service tests use the dev database (Docker, now working locally), with
Hercules faked through `httpx.MockTransport`. They cover:
- a known learner signed in, and their profile updated
- a new learner getting 202, then consent accepted (account created, identity linked, cookie set)
- consent declined (nothing kept), and an expired `pending_id` getting 404
- a ULI mismatch getting 409, with the audit row written
- each Hercules error mapping to its HTTP status and `code`
- the setting turned off, so both endpoints answer 404 and client-config reports false
- `X-Requested-With` missing, so the request is refused
- the rate limit
- password sign-in refused for a TSP account, taking the same time as an unknown email
- the stored `profile` holding only the allowed fields
- the migration upgrading and downgrading on the dev database

**Frontend (Vitest).** The tests cover:
- **The bridge:** no channel gives null; the nonce format; `receive` installed before `ready`; single-use nonces; a
  late `handoff` ignored; the 10-second timeout; malformed JSON ignored.
- **The hook:** the 200, 202 and error paths; one retry only; the `canRetry` rules; logout clearing the session and
  stored answers; the fresh-load order (DELETE session, then `ready`); the flag off giving guest mode.
- **`TspConsent`:** accept and decline.
- **`TspSignInNotice`:** the retry button.

Run them with `export PATH="/c/Program Files/nodejs:$PATH"` first.
