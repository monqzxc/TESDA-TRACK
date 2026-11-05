# TSP ↔ Tracker Embed Contract: Design

**Date:** 2026-11-05
**Status:** design approved in conversation; this written spec is awaiting review
**Builds on:** `31-TRACKER_IFRAME_INTEGRATION.md` (the TSP/Hercules spec, repository root)

## Purpose

The TSP/Hercules team asked the Tracker backend developer for an API contract. It covers the **Tracker side of the handoff**: everything TSP must build to embed TESDA-TRACK ("Tracker") in its web app (iframe) and its Flutter mobile app (WebView), and to sign the learner in.

The contract has to be precise enough for TSP to build and test without asking us questions, and machine-checkable so neither side drifts.

**Success:** TSP can build both hosts from the contract alone. Every message payload has a JSON Schema and examples that a test validates. Every place we depart from spec 31 is listed as an explicit change request.

**Out of scope:** how Tracker implements the contract (the frontend bridge module and the backend session endpoint), and whether Tracker keeps its session in a cookie or an in-memory token. TSP builds nothing against those, so they stay internal and get their own plan once the contract is agreed. The Hercules client is already planned in `docs/superpowers/plans/2026-11-05-tracker-hercules-client.md`.

## Deliverables

All under `docs/contracts/tsp-tracker-embed/`:

| Path | What |
|---|---|
| `CONTRACT.md` | The contract, written for the TSP web and mobile developers. TSP may renumber it to fit their scheme (e.g. `32-…`). |
| `schemas/<type>.schema.json` | One JSON Schema (draft 2020-12) per message type, 6 files, named by the full `type`, e.g. `tsp.tracker.ready.schema.json`. |
| `examples/valid/<type>.json` | At least one valid example per message type. |
| `examples/invalid/<type>--<what-is-wrong>.json` | Payloads that must fail validation. The schema they are checked against is the part of the file name before `--`. |

Also:
- `backend/tests/unit/test_embed_contract.py`: validates every example against its schema. A valid example must pass and an invalid one must fail. Each schema must also be a valid draft 2020-12 schema.
- `requirements-dev.txt`: add `jsonschema==4.26.0`, the version already in `.venv`.

## Design decisions

### 1. Handoff model: Tracker asks for a code whenever it needs one

Spec 31 gives one handoff per page load. Instead, Tracker can send `tsp.tracker.ready` whenever it needs a code: on first load, after a reload, after its session expires, or to retry. TSP answers every `ready` the same way, by fetching a new code from Hercules.

This removes the "open it again from Skill Passport" dead end. It also works whether Tracker uses a cookie or an in-memory token, so the contract doesn't wait on the hosting decision.

### 2. Message rules

- Every message is a JSON object with `type` (always starting `tsp.tracker.`) and `version` (integer `1`).
- Receivers ignore fields they don't know (schemas set `additionalProperties: true`). They also ignore unknown types and unsupported versions without an error.
- No message carries PII or account identifiers: no `sso_id`, ULI, name or email.

### 3. Message catalogue

| Direction | `type` | Fields beyond `type` and `version` |
|---|---|---|
| Tracker → TSP | `tsp.tracker.ready` | `nonce` (required), `reason` (required): `initial` / `reload` / `session_expired` / `retry` |
| Tracker → TSP | `tsp.tracker.signed_in` | none |
| Tracker → TSP | `tsp.tracker.error` | `code` (required): `handoff_expired` / `unavailable` / `client_rejected` / `timeout` |
| TSP → Tracker | `tsp.tracker.handoff` | `code` (required, 1–4096 characters, Hercules' limit), `state` (required, same pattern as `nonce`) |
| TSP → Tracker | `tsp.tracker.handoff_failed` | `state` (required), `reason` (required): `not_signed_in` / `unavailable` |
| TSP → Tracker | `tsp.tracker.logout` | none |

- `nonce`: 32 random bytes encoded as base64url without padding, so the pattern is `^[A-Za-z0-9_-]{43}$`. Tracker creates a new one for every `ready` and accepts it **once**.
- `state` in `handoff` and `handoff_failed` is the nonce from the `ready` being answered. TSP passes it to `POST /v1/tracker/handoff` as `state` and echoes back what Hercules returns.

### 4. Sequence and timing

1. Tracker installs its message listener (web) or `window.TspTracker` (mobile), then sends `ready(nonce=N, reason=initial)`.
2. **TSP checks the message.** On web, `event.source === iframe.contentWindow` and `event.origin === <tracker-origin>`. On mobile, the WebView's current URL is on the Tracker origin.
3. **TSP gets a code.** It calls `POST /v1/tracker/handoff` with `state=N`, then sends `handoff(code, state=N)`, or `handoff_failed(state=N, reason)` if it couldn't get one.
4. **Tracker checks the reply.** On web, `event.origin` must be the TSP origin. On both, `state` must equal a nonce that is still pending, and Tracker then discards it. A `handoff` with an unknown or already-used `state` is ignored without an error.
5. **Tracker signs in.** Its backend exchanges the code (spec 31 steps 3–5), then Tracker sends `signed_in`, or `error(code)`.

**Tracker's retry rules.** TSP has no retry logic of its own:
- On `handoff_expired`, Tracker sends one automatic `ready(reason=retry)` with a new nonce. If that fails too, it sends `error(handoff_expired)` and shows the error.
- On `client_rejected`, Tracker never retries.
- If neither `handoff` nor `handoff_failed` arrives **10 seconds** after a `ready`, Tracker sends `error(timeout)` and shows a "Try again" button. The button sends a new `ready(reason=retry)`.

**Logout.** When the learner signs out of TSP or switches accounts, TSP sends `logout`. Tracker ends its session and shows a neutral screen with no learner data on it. It doesn't request a new code until TSP loads the embed again.

### 5. Error codes and suggested TSP responses

| `code` | Cause | Suggested TSP response |
|---|---|---|
| `handoff_expired` | Hercules refused the code or token, and the automatic retry failed | "Please try again." The button reloads the iframe. |
| `unavailable` | Hercules or Tracker is down | "TESDA-TRACK is unavailable right now." |
| `client_rejected` | Tracker's Hercules client credentials are wrong or missing | The same message as `unavailable`. TSP should also alert its ops. |
| `timeout` | No reply to `ready` within 10 s | The same message as `unavailable`. TSP should check its own `/handoff` call. |

How these map onto the Hercules client (for the internal plan): `HerculesCodeRejected` and `HerculesTokenRejected` become `handoff_expired`, `HerculesUnavailable` becomes `unavailable`, and `HerculesClientRejected` and `HerculesNotConfigured` become `client_rejected`.

### 6. Origins, URL and headers

**Origins table.** The contract has one row per environment (staging, production), with columns for TSP web origin, Tracker origin and Hercules base URL. Values known today:
- Tracker staging: `https://tesda-track.vercel.app`. This is the current deployment: Vercel serves the app and passes `/api/*` to the API.
- Hercules staging: `https://hercules-api-staging.tesdabest.com`
- TSP production: `https://app.tesda.gov.ph`

Every other cell reads "to be agreed", and that includes both TSP staging origins we need from TSP. The contract asks for production Tracker to be hosted under `*.tesda.gov.ph`, because Tracker's session then works inside the iframe without third-party cookies. `tesda-track.vercel.app` is a different site from TSP, so in staging Tracker keeps its embedded session without cookies. That is Tracker's concern, and TSP builds nothing for it.

**Handoff `target`.** TSP sends the Tracker origin of the environment as `target` in `POST /v1/tracker/handoff`; for staging that is `https://tesda-track.vercel.app`. The contract also gives TSP the Hercules client ID, `tesda-tracker`.

**Embed URL.** `https://<tracker-origin>/tsp?host=web` in the iframe, `?host=mobile` in the WebView. `host` is the only query parameter allowed, and it carries no tokens or PII.

**Tracker serves on `/tsp`:**
- `Content-Security-Policy: … frame-ancestors <TSP web origins>`. Every other path sends `frame-ancestors 'none'`.
- Where the headers come from depends on the deployment. On Vercel (staging) they come from `frontend/vercel.json`, which sets no headers today, so the staging app can currently be framed by any site. Behind Caddy they come from `frontend/Caddyfile`, which already sends `frame-ancestors 'none'`. The contract states what TSP can expect to see on each environment, and Tracker's implementation plan updates both files.
- `Permissions-Policy: geolocation=(self)`, unchanged.
- Tracker sends web messages to its configured TSP origin for that environment, never to `"*"`.

**TSP web must:**
- Send `Content-Security-Policy: frame-src <tracker-origin>`.
- Use `<iframe sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox" allow="geolocation" referrerpolicy="strict-origin">`. The contract explains each flag:
  - `allow-same-origin` keeps Tracker's real origin, which its API calls and origin checks need.
  - The popup flags let directions open Google Maps.
  - `geolocation` is for the "near me" training search.
- Post only to `<tracker-origin>`, and check `event.source` and `event.origin` on every message.

### 7. Flutter bridge (`webview_flutter`)

- **Tracker → TSP:** TSP registers `addJavaScriptChannel('TspTrackerHost', …)`. Tracker calls `window.TspTrackerHost.postMessage(JSON.stringify(message))`.
- **TSP → Tracker:** Tracker defines `window.TspTracker.receive(json: string)`. TSP calls `controller.runJavaScript('window.TspTracker.receive(${jsonEncode(jsonEncode(message))})')`, where the double encoding makes the code a safe JS string literal.
- **Order:** Tracker defines `window.TspTracker` before it sends `ready`. After an OS reload, Tracker sends `ready(reason=reload)` again.
- **TSP must** check that `await controller.currentUrl()` is on the Tracker origin before handling any channel message and before every `runJavaScript`. It must also use a `NavigationDelegate` that keeps top-level navigation on the Tracker origin and opens other links in the system browser (e.g. `url_launcher`).
- TSP grants geolocation when the WebView asks.
- The contract includes a short, complete Dart snippet (controller set-up, origin check, the `ready` handler) and the equivalent JavaScript for the web host.

### 8. Versioning

- Adding a field or message type doesn't change the version.
- A breaking change means `version: 2`. Both sides then accept versions 1 and 2 during a transition both teams agree on.
- A message with an unsupported version is ignored. At worst that shows up as `timeout`, never as a wrong sign-in.

### 9. Changes from spec 31

The contract lists these in a "Changes requested" section, each with its reason.

**For TSP:**
1. `state` must be Tracker's nonce from `ready`, not a value TSP makes up. Otherwise checking it proves nothing.
2. New messages `tsp.tracker.handoff_failed` and `tsp.tracker.logout`, and the `signed_in` and `error` statuses.
3. Remove deep-link code transport. It puts the code in a URL, which spec 31's own security rules forbid.
4. Host Tracker under `*.tesda.gov.ph`.

**For Hercules:**

5. Document the real error shape, `{message, error, statusCode}` (seen on staging 2026-11-05), not the `{success, data}` envelope.
6. Return different errors for an expired code and an already-used code.
6a. Register `https://tesda-track.vercel.app` as an allowed handoff `target` for client `tesda-tracker` in staging, and the production Tracker origin once it's agreed.

**Questions for Hercules:**

7. Is `sso_id` permanent and unique for each person, given that profiles are keyed by `sub` or `uli` depending on onboarding?
8. Is the profile email verified? Can `email_verified` be added?

## Testing

`test_embed_contract.py` runs with the database-free unit suite (`--confcutdir=backend/tests/unit`) and checks three things:
- Every schema file passes `Draft202012Validator.check_schema`.
- Every file in `examples/valid/` validates against its schema.
- Every file in `examples/invalid/` fails against the schema named before its `--`.

There is also a guard that each of the 6 message types has a schema and at least one valid example. The invalid set covers at least these cases:
- `handoff` missing `state`
- `ready` with `version: 2`
- `ready` with a 42-character nonce
- `error` with an unknown `code`
- `handoff` with an empty `code`
