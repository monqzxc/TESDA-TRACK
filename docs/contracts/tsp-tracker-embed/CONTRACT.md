# TSP ↔ TESDA-TRACK embed contract (version 1)

**Status:** Draft for TSP review, 2026-11-05
**Builds on:** `31-TRACKER_IFRAME_INTEGRATION.md` (TSP/Hercules)

This contract covers what the TSP hosts do to show TESDA-TRACK and sign the learner in: the web app (an iframe)
and the Flutter mobile app (a WebView, which already opens TESDA-TRACK today). Hercules' own endpoints are
specified in spec 31 and are not repeated here. How TESDA-TRACK implements its side is internal; nothing here
depends on it. TSP may renumber this document to fit its own series.

**Current state:** TSP can build against this contract now. Until TESDA-TRACK ships its side, the page ignores
the bridge and keeps working as a guest, exactly as today.

## At a glance

1. TSP opens `/tsp/webview`. There is never a code or token in the URL.
2. The TESDA-TRACK page sends `tsp.tracker.ready` with a fresh `nonce`.
3. TSP calls Hercules `POST /v1/tracker/handoff` with `state` set to that nonce.
4. TSP passes the one-time code into the page as `tsp.tracker.handoff`.
5. TESDA-TRACK exchanges the code with Hercules on its own server and signs the learner in.
6. The page sends `tsp.tracker.signed_in`, or `tsp.tracker.error` and carries on as a guest.

```text
TSP host (web or Flutter)            TESDA-TRACK page                     Hercules
  │ open /tsp/webview ─────────────────▶│
  │◀────────── tsp.tracker.ready {nonce} │
  │ POST /v1/tracker/handoff {target, state = nonce} ─────────────────────▶│
  │◀──────────────────────────────────────────────────── {code, state} ────│
  │ tsp.tracker.handoff {code, state} ──▶│
  │                                      │ TESDA-TRACK server: /v1/tracker/token, /v1/tracker/profile
  │◀────────────── tsp.tracker.signed_in │   (or tsp.tracker.error, then guest mode)
```

## Environments

| Environment | TSP web origin | TESDA-TRACK origin | Hercules base URL |
|---|---|---|---|
| Staging | to be agreed | `https://tesda-track.vercel.app` | `https://hercules-api-staging.tesdabest.com` |
| Production | `https://app.tesda.gov.ph` | to be agreed | to be agreed |

- **Handoff `target`:** the environment's TESDA-TRACK origin, e.g. `https://tesda-track.vercel.app` in staging.
- **Hercules client ID:** `tesda-tracker`.
- **What we need from TSP:** your web origins for staging and production. TESDA-TRACK only accepts messages
  from, and only lets itself be framed by, the origins in this table.
- **Production hosting request:** we ask for production TESDA-TRACK to be hosted under `*.tesda.gov.ph` (e.g.
  `tracker.tesda.gov.ph`). Same-site with `app.tesda.gov.ph`, the embedded session works without third-party
  cookies, which browsers increasingly block.
- **Framing headers:** production sends `frame-ancestors <TSP web origins>` on `/tsp/webview` from the start.
  On staging the header is not yet in place, so the iframe works today but isn't restricted to TSP; we restrict
  it as soon as TSP sends us its staging web origin.

## Messages

Rules for every message:

- A message is a JSON object with `type`, always starting `tsp.tracker.`, and `version`, the **integer** `1`.
- Ignore fields you don't know, and ignore message types or versions you don't support. Both sides can add
  fields later without breaking the other.
- No message carries personal information or account identifiers: no `sso_id`, ULI, name or email.
- `nonce` and `state` are 43 characters of base64url without padding (`^[A-Za-z0-9_-]{43}$`).

### `tsp.tracker.ready` (TESDA-TRACK → TSP)

Sent when the page is ready and needs a code: on first load, after a reload, when its session expires, or to
retry. **Answer every one**, each with a new call to `/v1/tracker/handoff`. Schema:
[`schemas/tsp.tracker.ready.schema.json`](schemas/tsp.tracker.ready.schema.json)

| Field | Type | Meaning |
|---|---|---|
| `nonce` | string, 43 chars | New for every `ready`. Pass it to `/v1/tracker/handoff` as `state`. |
| `reason` | `initial` / `reload` / `session_expired` / `retry` | Why the page is asking. Informational only: handle every reason the same way. |

```json
{
  "type": "tsp.tracker.ready",
  "version": 1,
  "nonce": "_tV2dFRGIJ-vKohOpo0KuuHwOcx0U3L49JDSvI2FoXQ",
  "reason": "initial"
}
```

### `tsp.tracker.handoff` (TSP → TESDA-TRACK)

The one-time code from Hercules, answering a `ready`. Schema:
[`schemas/tsp.tracker.handoff.schema.json`](schemas/tsp.tracker.handoff.schema.json)

| Field | Type | Meaning |
|---|---|---|
| `code` | string, 1–4096 chars | The code from `POST /v1/tracker/handoff`. It lasts 60 seconds and works once. |
| `state` | string, 43 chars | The `nonce` of the `ready` you are answering, unchanged. |

```json
{
  "type": "tsp.tracker.handoff",
  "version": 1,
  "code": "example-one-time-code",
  "state": "_tV2dFRGIJ-vKohOpo0KuuHwOcx0U3L49JDSvI2FoXQ"
}
```

### `tsp.tracker.handoff_failed` (TSP → TESDA-TRACK)

Send this when you can't get a code, so the page stops waiting and carries on as a guest. Schema:
[`schemas/tsp.tracker.handoff_failed.schema.json`](schemas/tsp.tracker.handoff_failed.schema.json)

| Field | Type | Meaning |
|---|---|---|
| `state` | string, 43 chars | The `nonce` of the `ready` you are answering. |
| `reason` | `not_signed_in` / `unavailable` | `not_signed_in`: the learner's TSP session has ended. `unavailable`: anything else went wrong. |

```json
{
  "type": "tsp.tracker.handoff_failed",
  "version": 1,
  "state": "_tV2dFRGIJ-vKohOpo0KuuHwOcx0U3L49JDSvI2FoXQ",
  "reason": "not_signed_in"
}
```

### `tsp.tracker.signed_in` (TESDA-TRACK → TSP)

The learner is signed in to TESDA-TRACK. Hide any loading indicator. Schema:
[`schemas/tsp.tracker.signed_in.schema.json`](schemas/tsp.tracker.signed_in.schema.json)

```json
{
  "type": "tsp.tracker.signed_in",
  "version": 1
}
```

### `tsp.tracker.error` (TESDA-TRACK → TSP)

Sign-in didn't work. The page carries on as a guest, so the learner can keep using it; you may show your own
message (see [Error codes](#error-codes)). Schema:
[`schemas/tsp.tracker.error.schema.json`](schemas/tsp.tracker.error.schema.json)

| Field | Type | Meaning |
|---|---|---|
| `code` | `handoff_expired` / `unavailable` / `client_rejected` / `timeout` | What went wrong. |

```json
{
  "type": "tsp.tracker.error",
  "version": 1,
  "code": "handoff_expired"
}
```

### `tsp.tracker.logout` (TSP → TESDA-TRACK)

The learner signed out of TSP or switched accounts. TESDA-TRACK ends its session and returns to the guest entry
page with no learner data on it. Schema:
[`schemas/tsp.tracker.logout.schema.json`](schemas/tsp.tracker.logout.schema.json)

```json
{
  "type": "tsp.tracker.logout",
  "version": 1
}
```

## Sequence and timing

1. The page sends `ready(nonce = N)`.
2. TSP checks the message came from the TESDA-TRACK page (see the host sections), calls `/v1/tracker/handoff`
   with `state = N`, and sends `handoff(code, state = N)`, or `handoff_failed(state = N)`.
3. The page accepts a `handoff` only for a nonce it is still waiting on, and only once. Anything else is
   ignored without an error.
4. The page signs in and sends `signed_in`, or `error`.

**TSP never retries; TESDA-TRACK does.**

- After `handoff_expired`, the page sends one new `ready(reason = retry)` by itself. If that fails too, it
  sends `error(handoff_expired)`.
- After `client_rejected` the page doesn't retry: it's a configuration problem on the TESDA-TRACK side.
- If neither `handoff` nor `handoff_failed` arrives within **10 seconds** of a `ready`, the page sends
  `error(timeout)`.
- **Every failure ends in guest mode**, with a short "not signed in" notice and a "Sign in again" button that
  sends a new `ready(reason = retry)`. A failed sign-in never blocks the learner.
- After `logout`, the page doesn't ask for a new code until TSP opens it again.

## Error codes

| `code` | Cause | Suggested TSP response |
|---|---|---|
| `handoff_expired` | Hercules refused the code or token, and the automatic retry also failed. | "Please try again", with a button that reloads the page. |
| `unavailable` | Hercules or TESDA-TRACK is down. | "TESDA-TRACK is unavailable right now." |
| `client_rejected` | TESDA-TRACK's Hercules client credentials are wrong or missing. | Same as `unavailable`; also alert your ops so they can tell us. |
| `timeout` | No `handoff` or `handoff_failed` within 10 seconds. | Same as `unavailable`; check your `/handoff` call and `ready` handler. |

## Web host (iframe)

**URL:** `https://<tesda-track-origin>/tsp/webview?host=web`

**Your page's CSP:** `frame-src <tesda-track-origin>`

**The iframe:**

```html
<iframe src="https://tesda-track.vercel.app/tsp/webview?host=web"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        allow="geolocation" referrerpolicy="strict-origin"></iframe>
```

- `allow-scripts allow-same-origin` keep the page's real origin. Without `allow-same-origin` its origin is
  `null`, and it can't call its own API or check where your messages come from.
- `allow-forms` lets the learner submit goals and answers.
- `allow-popups allow-popups-to-escape-sandbox` let directions open Google Maps in a new tab.
- `allow="geolocation"` is for the "near me" training search; the browser still asks the learner.
- `referrerpolicy="strict-origin"` sends only your origin, never your page's path.

```js
const TRACKER_ORIGIN = "https://tesda-track.vercel.app";
const iframe = document.querySelector("#tesda-track");

function sendToTracker(message) {
  iframe.contentWindow.postMessage(message, TRACKER_ORIGIN); // the exact origin, never "*"
}

window.addEventListener("message", async (event) => {
  if (event.source !== iframe.contentWindow || event.origin !== TRACKER_ORIGIN) return;
  const message = event.data;
  if (message?.version !== 1) return;
  if (message.type !== "tsp.tracker.ready") return; // signed_in and error: update your own UI here
  const state = message.nonce;
  try {
    // Your server route from spec 31; it calls Hercules /v1/tracker/handoff server-to-server.
    const response = await fetch("/tracker/handoff", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json", "X-CSRF-TOKEN": csrfToken() },
      body: JSON.stringify({ target: TRACKER_ORIGIN, state, scopes: ["profile", "skills", "experience", "credentials"] }),
    });
    if (response.status === 401) {
      return sendToTracker({ type: "tsp.tracker.handoff_failed", version: 1, state, reason: "not_signed_in" });
    }
    if (!response.ok) throw new Error(`handoff ${response.status}`);
    const { data } = await response.json();
    sendToTracker({ type: "tsp.tracker.handoff", version: 1, code: data.code, state });
  } catch {
    sendToTracker({ type: "tsp.tracker.handoff_failed", version: 1, state, reason: "unavailable" });
  }
});

// When the learner signs out or switches accounts:
// sendToTracker({ type: "tsp.tracker.logout", version: 1 });
```

## Mobile host (Flutter `webview_flutter`)

**URL:** `https://<tesda-track-origin>/tsp/webview`. This is the route the TSP app already opens; no new
parameters.

The messages are the same JSON as on web. Only the transport differs:

- **TESDA-TRACK → TSP:** a JavaScript channel named **`TspTrackerHost`**. The page calls
  `window.TspTrackerHost.postMessage(JSON.stringify(message))`, so each channel message is a JSON string.
- **TSP → TESDA-TRACK:** the page defines **`window.TspTracker.receive(json)`**. Call it with
  `runJavaScript`, encoding the message twice with `jsonEncode`: once into JSON, and once more into a JavaScript
  string literal, so no value can break out of the call.
- The page defines `window.TspTracker` before it sends `ready`, so you can answer straight away. After the OS
  reloads the WebView, the page sends `ready(reason = reload)`; handle it like any other.
- **How the page detects you:** without `host=web`, the page looks for `window.TspTrackerHost`. If the channel
  is there, it starts the handoff; if not (app versions released before this contract), it runs as a guest.

```dart
import 'dart:convert';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

const trackerOrigin = 'https://tesda-track.vercel.app';
late final WebViewController controller;

// A channel message carries no origin: only talk to the page while the WebView is on TESDA-TRACK.
Future<bool> onTracker() async {
  final url = await controller.currentUrl();
  return url != null && Uri.parse(url).origin == trackerOrigin;
}

Future<void> sendToTracker(Map<String, dynamic> message) async {
  if (!await onTracker()) return;
  await controller.runJavaScript('window.TspTracker.receive(${jsonEncode(jsonEncode(message))})');
}

void openTesdaTrack() {
  controller = WebViewController()
    ..setJavaScriptMode(JavaScriptMode.unrestricted)
    ..setNavigationDelegate(NavigationDelegate(onNavigationRequest: (request) {
      if (Uri.parse(request.url).origin == trackerOrigin) return NavigationDecision.navigate;
      launchUrl(Uri.parse(request.url), mode: LaunchMode.externalApplication); // e.g. Google Maps
      return NavigationDecision.prevent;
    }))
    ..addJavaScriptChannel('TspTrackerHost', onMessageReceived: (message) async {
      if (!await onTracker()) return;
      final msg = jsonDecode(message.message);
      if (msg is! Map || msg['version'] != 1) return;
      if (msg['type'] != 'tsp.tracker.ready') return; // signed_in and error: update your own UI here
      final state = msg['nonce'] as String;
      try {
        // Your existing Hercules call from spec 31: POST /v1/tracker/handoff with the Atlas JWT,
        // body {"target": trackerOrigin, "state": state, "scopes": [...]}; returns data.code.
        final code = await requestHandoffCode(target: trackerOrigin, state: state);
        await sendToTracker({'type': 'tsp.tracker.handoff', 'version': 1, 'code': code, 'state': state});
      } on NotSignedIn {
        await sendToTracker({'type': 'tsp.tracker.handoff_failed', 'version': 1, 'state': state,
                             'reason': 'not_signed_in'});
      } catch (_) {
        await sendToTracker({'type': 'tsp.tracker.handoff_failed', 'version': 1, 'state': state,
                             'reason': 'unavailable'});
      }
    })
    ..loadRequest(Uri.parse('$trackerOrigin/tsp/webview'));
}

// When the learner signs out or switches accounts:
//   sendToTracker({'type': 'tsp.tracker.logout', 'version': 1});
```

`requestHandoffCode` and `NotSignedIn` stand for your own Hercules call and its "session expired" error.

**Location:** the training search asks for the device location. Grant it when the WebView asks: on Android,
through `webview_flutter_android`'s geolocation permission callback and the location permission in your
manifest; on iOS, with `NSLocationWhenInUseUsageDescription` in `Info.plist`.

## Migrating from today's launch URL

The TSP app currently opens `/tsp/webview` with learner hints in the query string (`docs/tsp-webview.md` in the
TESDA-TRACK repository). Version 1 phases them out:

| Parameter | In version 1 |
|---|---|
| `host` | New. `web` for the iframe; leave it out in the app. |
| `goal` | Kept, optional. The profile has no goal, so the hint still saves the learner typing. |
| `skills`, `experience_years`, `has_certification`, `region` | Deprecated. Still accepted for guests; once the learner is signed in, the profile replaces them. |
| `name`, `learner_id` | Deprecated. **Remove them in the same release that adds the handoff**: they are personal information in a URL, and URLs end up in logs. |

Older app versions keep working: without the `TspTrackerHost` channel, the page runs as a guest with the hints
it gets, as today.

For the TSP mobile release:

1. Register the `TspTrackerHost` channel and the `ready` handler above.
2. Add the `currentUrl()` check and the `NavigationDelegate`.
3. Stop sending `name` and `learner_id`. Keep `goal` if you have it.
4. Send `tsp.tracker.logout` when the learner signs out or switches accounts.

## Security checklist for TSP

- [ ] No code, token or personal information in any TESDA-TRACK URL.
- [ ] Every `/v1/tracker/handoff` call uses `state` = the `nonce` of the `ready` being answered, and
      `target` = the environment's TESDA-TRACK origin.
- [ ] Web: `frame-src <tesda-track-origin>` in your CSP.
- [ ] Web: the iframe's `sandbox`, `allow` and `referrerpolicy` exactly as above.
- [ ] Web: every incoming message is checked for `event.source === iframe.contentWindow` and
      `event.origin === <tesda-track-origin>`.
- [ ] Web: every `postMessage` names the exact TESDA-TRACK origin, never `"*"`.
- [ ] Mobile: `currentUrl()` is on the TESDA-TRACK origin before handling a channel message and before every
      `runJavaScript`.
- [ ] Mobile: the `NavigationDelegate` keeps the WebView on the TESDA-TRACK origin and opens other links outside.
- [ ] Mobile: messages are encoded with `jsonEncode(jsonEncode(message))`.
- [ ] Both: send `tsp.tracker.logout` on sign-out and account switch.
- [ ] Both: ignore unknown message types, unknown fields and unsupported versions.

## Versioning

- Adding a field or a message type doesn't change `version`.
- A breaking change means `version: 2`. Both sides then accept versions 1 and 2 for a transition we agree on
  together.
- A message with an unsupported version is ignored. At worst that shows up as `timeout` and guest mode, never
  as a wrong sign-in.

## Changes requested from spec 31

**For TSP:**

1. **`state` is TESDA-TRACK's nonce** from `ready`, not a value TSP makes up. It's how the page knows the code
   answers its own request; a value it didn't choose would prove nothing.
2. **New messages:** `tsp.tracker.handoff_failed` and `tsp.tracker.logout` from TSP, and `tsp.tracker.signed_in`
   and `tsp.tracker.error` from TESDA-TRACK. Without them the page waits on a code that never comes, or keeps a
   session after the learner has left TSP.
3. **No deep links that carry the code.** A code in a URL ends up in logs and history, which spec 31's own
   security rules forbid. The JavaScript channel replaces them.
4. **Host production TESDA-TRACK under `*.tesda.gov.ph`,** so the embedded session works without third-party
   cookies.
5. **Stop sending `name` and `learner_id` in the `/tsp/webview` URL**, in the same release that adds the
   handoff. They are personal information in a URL.

**For Hercules:**

6. **Document the error responses as they are.** Staging answers errors as `{"message", "error", "statusCode"}`
   (seen 2026-11-05), not in the `{"success", "data"}` envelope.
7. **Return different errors for an expired code and an already-used code,** so both sides can tell a slow
   learner from a replayed code.
8. **Register `https://tesda-track.vercel.app` as an allowed handoff `target`** for `tesda-tracker` in staging,
   and the production TESDA-TRACK origin once it's agreed.

## Questions for Hercules

1. **Blocking for sign-in:** is `sso_id` permanent and unique for each person? Spec 31 says profiles are keyed
   by `sub` or by `uli` depending on onboarding, and TESDA-TRACK links accounts to `sso_id`.
2. Is the profile's email verified? Could the profile include `email_verified`?

## Files

| Path | What |
|---|---|
| `schemas/` | One JSON Schema (draft 2020-12) per message type. These are the authority; this document follows them. |
| `examples/valid/` | A valid example of each message, plus one with an extra field to show unknown fields are allowed. |
| `examples/invalid/` | Payloads that must be refused: a missing `state`, `version` 2 or `"1"`, a short or standard-base64 nonce, an unknown error code, an empty code. |

`backend/tests/unit/test_embed_contract.py` in the TESDA-TRACK repository checks every example against its
schema, and every JSON message block in this document too, so the three can't drift apart.
