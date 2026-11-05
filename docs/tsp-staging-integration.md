# TSP mobile sign-in on staging

The mobile host opens the Tracker WebView and uses the version 1 JavaScript bridge. It does not post to the
Tracker session endpoint from native HTTP: the WebView must own the resulting session cookie.

## Addresses and responsibilities

| Caller | Address | Purpose |
| --- | --- | --- |
| TSP mobile | `POST https://hercules-api-staging.tesdabest.com/v1/tracker/handoff` | Obtain a fresh, one-time code using the learner's Atlas bearer token. |
| TSP mobile | `https://tesda-track.vercel.app/tsp/webview` | Open the published staging frontend. Its updated bridge build must be deployed before testing the complete flow. |
| Tracker page | `POST /api/v1/auth/tsp/session` | Send `{ "code": "<one-time-code>" }` through the frontend's same-origin API proxy. |
| Tracker page | `POST /api/v1/auth/tsp/consent` | Answer a first-visit consent request with `{ "pending_id": "<opaque-id>", "accept": true }` or `false`. |
| Tracker backend | `POST /v1/tracker/token`, then `GET /v1/tracker/profile` on Hercules | Exchange the code and fetch the scoped profile using server-only credentials. |

The direct staging API is `https://54-251-42-9.sslip.io`. Its session endpoint is
`https://54-251-42-9.sslip.io/api/v1/auth/tsp/session`. Browser writes require
`X-Requested-With: XMLHttpRequest`. Successful sign-in sets an HttpOnly cookie; it never returns the access token.

## Mobile handoff

1. Register the `TspTrackerHost` JavaScript channel before loading the page.
2. Wait for `tsp.tracker.ready`. Copy its 43-character `nonce` into the Hercules handoff request's `state`.
3. Call Hercules with `Authorization: Bearer <Atlas JWT>`, `target: "https://tesda-track.vercel.app"`, and scopes
   `["profile", "skills", "experience", "credentials"]`.
4. Pass the returned `code` and unchanged `state` as a JSON string to `window.TspTracker.receive`:

   ```json
   {
     "type": "tsp.tracker.handoff",
     "version": 1,
     "code": "<code returned by Hercules>",
     "state": "<nonce from ready>"
   }
   ```

5. Wait for `tsp.tracker.signed_in` or `tsp.tracker.error`. On a first visit, keep the WebView interactive while
   the learner answers its consent screen; sign-in is not complete until that choice succeeds.
6. Obtain a new code for every subsequent `ready`, including retries. Codes expire after 60 seconds and work once.

Use the safe Dart encoding and navigation/origin checks in
[the full contract](contracts/tsp-tracker-embed/CONTRACT.md#mobile-host-flutter-webview_flutter).
Never place a code, Atlas token, client secret, or personal information in the WebView URL.

## Tracker responses

- `200`: linked learner signed in, cookie set.
- `202`: first visit requires consent; no linked account or session is created yet.
- Consent `200`: accepted and signed in. Consent `204`: declined, continue as a guest.
- `401` with `code: "handoff_expired"`: request a fresh handoff through a new `ready`.
- `503` with `code: "client_rejected"` or `"unavailable"`: operator/configuration or upstream service problem.
- `404` while the feature is disabled. Invalid/expired consent identifiers also return `404` with a contract error code.

## Deployment and verification

Set `HERCULES_BASE_URL`, `TRACKER_CLIENT_ID`, `TRACKER_CLIENT_SECRET`, and `TSP_SIGN_IN_ENABLED=true` on the API.
Apply migrations through `0023` and restart the API. Credentials stay on the server; do not give them to the mobile app.
The test suite overrides these settings to keep real credentials and upstream requests out of tests.

Migration `0023` removes the temporary email column created by the early deployed version of `0022`. It also
works on fresh installations, where the reviewed `0022` already omits the column. Pending identity/profile data
is preserved. It also clears any email copied to a passwordless TSP-linked account by an early build, while
preserving password-based accounts. Downgrading to the reviewed `0022` does not recreate the removed contact field.

Verify that readiness reports migration `0023`, client configuration advertises `tsp_sign_in: true`, and a
deliberately invalid handoff returns `401 handoff_expired`. Keep a database/configuration backup and a rollback
image before updating the staging server.

This verifies deployment and refusal behavior. A complete live sign-in still needs a fresh code from a real TSP
session and publication of the updated WebView frontend. The web iframe transport remains outside the current
mobile implementation; staging refuses framing until the TSP web origin is agreed.
