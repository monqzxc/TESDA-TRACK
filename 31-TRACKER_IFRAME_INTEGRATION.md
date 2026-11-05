# 31 — TESDA Tracker iframe/WebView Integration

Tracker is a third-party application embedded inside TSP as an iframe (web) or
WebView (mobile). TSP remains the identity provider; Tracker never receives the
learner's TSP password or full TSP access token.

## Flow

```text
TSP host (web or mobile)
  │ 1. POST /v1/tracker/handoff   (Atlas JWT or internal secret)
  ▼
Hercules
  │  returns a signed one-time handoff code (60s)
  ▼
TSP host
  │ 2. postMessage / JS bridge → Tracker iframe/WebView
  ▼
Tracker frontend
  │ 3. sends code to Tracker backend
  ▼
Tracker backend
  │ 4. POST /v1/tracker/token     (code + client credentials)
  ▼
Hercules
  │  returns a scoped Tracker access token (15m)
  ▼
Tracker backend
  │ 5. GET /v1/tracker/profile
  ▼
Profile + skills + experience
```

## Endpoints

### `POST /v1/tracker/handoff`

Used by the TSP host only.

- **Mobile:** `Authorization: Bearer <Atlas JWT>`
- **Web:** `X-Tracker-Internal-Secret` + `X-Tracker-Sso-Id`, sent server-to-server
  by `POST /tracker/handoff` in the TSP Laravel app.

Request:

```json
{
  "target": "https://tracker.example.gov.ph",
  "state": "random-value",
  "scopes": ["profile", "skills", "experience", "credentials"]
}
```

Response:

```json
{
  "success": true,
  "data": {
    "code": "signed-one-time-code",
    "state": "random-value",
    "expires_in": 60
  }
}
```

### `POST /v1/tracker/token`

Called by the Tracker backend. The client secret must never be exposed to the
iframe or WebView.

Request:

```json
{
  "code": "signed-one-time-code",
  "client_id": "tesda-tracker",
  "client_secret": "..."
}
```

Response:

```json
{
  "success": true,
  "data": {
    "access_token": "...",
    "token_type": "Bearer",
    "expires_in": 900,
    "scope": "profile skills experience credentials"
  }
}
```

### `GET /v1/tracker/profile`

Called by the Tracker backend with the scoped access token.

```http
Authorization: Bearer <access_token>
```

The endpoint derives `sso_id` from the token `sub`. It never accepts an
`sso_id` query parameter.

Response highlights:

```json
{
  "success": true,
  "data": {
    "sso_id": "...",
    "uli": "...",
    "personal_information": {
      "first_name": "...",
      "middle_name": "...",
      "last_name": "...",
      "sex": "male",
      "date_of_birth": "1990-01-01",
      "mobile_number": "+639...",
      "email_address": "...",
      "address": "...",
      "baranggay": "...",
      "municipality": "...",
      "province": "...",
      "region": "...",
      "country": "Philippines",
      "zip_code": "...",
      "profile_photo": "..."
    },
    "skills": [],
    "experience": [],
    "education": [],
    "qualifications": [],
    "credentials": {
      "certificates": [],
      "trainings": [],
      "assessments": [],
      "external_certificates": []
    }
  }
}
```

Sensitive fields are intentionally excluded: `nat_id`, `digital_id`,
`blood_type`, and raw `face_url`.

## Handoff protocol

Tracker signals readiness:

```json
{ "type": "tsp.tracker.ready", "version": 1 }
```

TSP host sends the code to the exact Tracker origin:

```js
iframe.contentWindow.postMessage(
  {
    type: "tsp.tracker.handoff",
    version: 1,
    code: "...",
    state: "..."
  },
  "https://tracker.example.gov.ph"
);
```

Tracker must verify `event.origin`. TSP should verify `event.source` is the
Tracker iframe. For a mobile WebView, use the same payload through the native
JS bridge or a deep link.

## Security requirements

- Handoff code: 60-second TTL, audience-bound to `tesda-tracker`.
- Token exchange requires the Tracker client secret.
- Access token: 15-minute TTL, audience-bound, scoped.
- `postMessage` must use an exact `targetOrigin`; never `"*"`.
- Do not put the TSP access token or PII in the iframe/WebView URL.
- Do not rely on TSP cookies inside a cross-origin iframe.
- Tracker side: `Content-Security-Policy: frame-ancestors https://app.tesda.gov.ph`.
- TSP side: `frame-src https://tracker.example.gov.ph`.
- Use a minimal iframe `sandbox` policy.
- Record consent and audit `client_id`, `sso_id`, scopes, and timestamps.

## Data sources

| Field | Source |
|-------|--------|
| Personal information | `tesda-best-api` `PersonalInformation` |
| Skills | TSP skill tags + Hermes `worker_profiles.skills` |
| Experience | Hermes `worker_profiles.experience` |
| Education | Hermes `worker_profiles.education` |
| Qualifications | Hermes `worker_profiles.qualifications` |
| Certificates/trainings/assessments | T2MIS through TSP |
| External certificates | `external_certifications` |

Hermes currently keys worker profiles differently depending on onboarding flow.
The profile endpoint tries the JWT `sub` first, then the TSP `uli`, so both
records resolve.
