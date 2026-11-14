# Mock TSP: synthetic accounts for demos and tests

With the mock on, **Sign in with TSP** works without the real TESDA Skill Passport. Eight synthetic learners stand
in for TSP's accounts. Nothing is sent to TSP or Hercules, and no account holds a real person's information.

## Turn it on

In `.env` (or the deployment's environment), then restart the API:

```text
TSP_SIGN_IN_ENABLED=true
TSP_MOCK_ENABLED=true
```

`HERCULES_BASE_URL`, `TRACKER_CLIENT_ID` and `TRACKER_CLIENT_SECRET` may stay empty. If they are set, they are
ignored while the mock is on. To go back to the real TSP, set `TSP_MOCK_ENABLED=false`.

Anyone who knows a test password below can sign in while the mock is on, so use it for demos and tests only.

## Sign in

1. Open the app and choose **Sign in with TSP** in the sidebar.
2. Enter a test account's email and password.
3. The first time, agree to save the Skill Passport details. Later sign-ins skip this step.
4. Open **Profile** to see the account's skills, experience, education, qualifications and certificates under
   **From your Skill Passport**.

## Test accounts

| Email | Password | Learner | Region | Qualifications |
| --- | --- | --- | --- | --- |
| `ana.reyes@example.com` | `TspDemo-Ana-2026` | Career starter | NCR (Quezon City) | None yet |
| `ben.cruz@example.com` | `TspDemo-Ben-2026` | Experienced welder, upskilling | VII (Cebu City) | SMAW NC I |
| `carla.dizon@example.com` | `TspDemo-Carla-2026` | Career shifter | IV-A (Calamba) | Caregiving (Elderly) NC II |
| `dan.lim@example.com` | `TspDemo-Dan-2026` | Returning overseas worker | XI (Davao City) | Electrical Installation and Maintenance NC II, NC III |
| `ella.ramos@example.com` | `TspDemo-Ella-2026` | Office worker | III (San Fernando) | Bookkeeping NC III |
| `faisal.usman@example.com` | `TspDemo-Faisal-2026` | Out-of-school youth, nearly empty profile | BARMM (Cotabato City) | None |
| `gina.bautista@example.com` | `TspDemo-Gina-2026` | Trainer | CAR (Baguio City) | Cookery NC II, Bread and Pastry Production NC II, Trainers Methodology Level I |
| `hector.villanueva@example.com` | `TspDemo-Hector-2026` | Job seeker | VI (Iloilo City) | Computer Systems Servicing NC II |

The accounts live in `backend/seed/tsp_mock_accounts.json`. Each `profile` is written exactly as Hercules answers
`GET /v1/tracker/profile` (`31-TRACKER_IFRAME_INTEGRATION.md`), so it goes through the same parsing as a real one.
To add an account, add an entry with a new `username` and `sso_id` and restart the API; nothing needs seeding in
the database, because the TESDA-TRACK account is created at the learner's first sign-in, as with the real TSP.

## What is mocked and what is real

| Step | Real TSP | Mock |
| --- | --- | --- |
| Learner signs in to TSP | TSP's own sign-in | `POST /api/v1/tsp-mock/handoff` with a test email and password |
| One-time handoff code (60 seconds, works once) | Hercules `POST /v1/tracker/handoff` | Signed by this API |
| Code exchanged for a token, profile read | Hercules `/v1/tracker/token`, `/v1/tracker/profile` | Answered inside this API, in Hercules' format |
| `POST /api/v1/auth/tsp/session`, consent, account link, session cookie | Same code | Same code |

A code works once per API process. With several API processes, a code could be exchanged once in each within its
60 seconds; that only matters for the mock.

## What you will see when sign-in fails

- Wrong email or password: "Incorrect TSP username or password." Nobody is signed in.
- A code that expired or was already used: "That sign-in ran out of time. Please sign in again."
- A session that expired: the app asks the learner to sign in again, as for any account.
