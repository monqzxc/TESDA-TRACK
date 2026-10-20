# TESDA-TRACK MCP server: partner onboarding

For developers of outside systems (TESDA Skill Passport, BSRS) that read TESDA-TRACK data and ask it for
recommendations through the Model Context Protocol (MCP). Every tool is read-only.

In the examples, `https://tesda-track.example.ph` stands for the address TESDA-TRACK is published at. Use the one
the TESDA-TRACK admin gives you.

## 1. What the server offers

Nine tools in three groups. A token carries the scopes your client was granted, and you only see and can call the
tools those scopes allow.

| Group | What you can do | Scope |
| --- | --- | --- |
| Catalog | Look up a qualification in full, search training programs, read training and assessment supply per region | `catalog:read` |
| Recommendations | Match a learner's goal to qualifications, suggest the next step, check readiness, rank training programs and assessment schedules for one learner | `recommend:run` |
| Reports | Read how many distinct learners matched, chose, checked, applied and were certified in each qualification for a completed quarter | `reports:read` |

Qualification codes: every tool that takes a `qualification_code` (or `code`) accepts either a TESDA-TRACK code such
as `MMAW-NC-II` or TESDA's official code such as `MEEEAW206` (the same qualification). Results always show TESDA-TRACK codes, and
`get_qualification` also lists the qualification's `official_codes`. Some official codes cover more than one
qualification; the call then fails with an error naming them (`choose one: ...`) so you can pick. One
qualification can also have several official codes: `EIM-NC-II` (Electrical Installation and Maintenance NC II) is
`CONEIM208` and `ELCEIM215`, and either finds it.

## 2. Getting credentials

Ask the TESDA-TRACK administrator for a client. Tell them your organisation, a contact email, what you will use the
server for, and which tools you expect to call. They create it with `python -m tesda_track.cli mcp-client create ...`
and give you:

- a **client id** (a UUID),
- a **client secret**, shown **once**. Store it in your secret manager. If you lose it, ask for a new one (the old
  one stops working at once),
- the scopes granted and your client's per-minute call limit.

Never put the secret in a browser, a mobile app or a repository.

## 3. Getting a token

Tokens come from the OAuth 2.0 client credentials grant and last one hour (`expires_in`). Request a new one when a
call returns HTTP 401. The server's metadata is at
`https://tesda-track.example.ph/.well-known/oauth-authorization-server`.

Client id and secret as HTTP Basic (`client_secret_basic`):

```bash
curl -s https://tesda-track.example.ph/api/v1/oauth/token \
  -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d grant_type=client_credentials
```

Or as form fields (`client_secret_post`):

```bash
curl -s https://tesda-track.example.ph/api/v1/oauth/token \
  -d grant_type=client_credentials \
  -d client_id="$CLIENT_ID" \
  -d client_secret="$CLIENT_SECRET"
```

Both answer:

```json
{"access_token": "eyJhbGciOi...", "token_type": "Bearer", "expires_in": 3600,
 "scope": "catalog:read recommend:run"}
```

You may add `scope=catalog:read` to ask for fewer scopes than your client holds. A wrong id or secret is HTTP 401
with `error: invalid_client`. The token endpoint allows 30 requests a minute from one address; beyond that it answers
HTTP 429 with `{"error": "slow_down"}` and a `Retry-After` header (seconds). Reuse a token until it nears its expiry
rather than requesting one per call.

## 4. Connecting

- **URL:** `https://tesda-track.example.ph/mcp`
- **Transport:** Streamable HTTP, stateless, JSON responses (no sessions, no event stream needed).
- **Protocol versions:** `2026-07-28` (current) and `2025-11-25`. An older client that does the `initialize`
  handshake works too.
- **Headers on every request:**
  - `Authorization: Bearer <access_token>`
  - `Content-Type: application/json`
  - `Accept: application/json, text/event-stream`
  - `MCP-Protocol-Version: 2026-07-28`
  - for `2026-07-28`, also `Mcp-Method: <the JSON-RPC method>` and, on `tools/call`, `Mcp-Name: <tool name>`
- With `2026-07-28` there is no handshake. Each request's `params._meta` carries
  `io.modelcontextprotocol/protocolVersion`, `io.modelcontextprotocol/clientInfo` and
  `io.modelcontextprotocol/clientCapabilities`.
- The request's `Host` must be the public address above. A request to any other host is refused with HTTP 421.

Any MCP client library does all of this for you. The raw form of a request, to see what is on the wire:

```bash
curl -s https://tesda-track.example.ph/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2026-07-28" -H "Mcp-Method: tools/list" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"_meta":{
        "io.modelcontextprotocol/protocolVersion":"2026-07-28",
        "io.modelcontextprotocol/clientInfo":{"name":"my-system","version":"1"},
        "io.modelcontextprotocol/clientCapabilities":{}}}}'
```

`tools/list` returns each tool's description, input schema and output schema. Results come in `structuredContent`
(matching the output schema) and as text.

## 5. The nine tools

The limit is calls per minute for your client on that tool. Your client also has an overall per-minute limit across
all tools. The example values are illustrative (qualification codes and titles are real; ids, scores, counts, providers
and programs are made up for the example): a live server returns its own data. Each example is the `params` of a `tools/call` request (the rest of the request is as in section 4),
followed by an abridged `structuredContent`.

### match_qualifications

Qualifications that best fit a learner's goal, strongest first, each with a 0-100 score and the reason. Give a goal,
answers, or both. A goal naming no trade, job or skill is an error. Scope `recommend:run`, limit 30 a minute.

```json
{"name": "match_qualifications", "arguments": {"goal": "gusto kong maging welder", "limit": 2}}
```
```json
{"interpreted": {"intent": "unknown", "experience_years": null},
 "matches": [{"qualification": {"code": "MMAW-NC-II", "name": "Manual Metal Arc Welding (MMAW) NC II",
                                "sector": "Metals and Engineering"},
              "score": 65, "reason": "Matched your words: welder"}]}
```

### get_qualification

One qualification in full: sector, the jobs it leads to, its competencies, the other NC levels of the trade and its
official TESDA codes. Give `code` or `title`, not both. Scope `catalog:read`, limit 120 a minute.

```json
{"name": "get_qualification", "arguments": {"code": "MMAW-NC-II"}}
```
```json
{"qualification": {"code": "MMAW-NC-II", "name": "Manual Metal Arc Welding (MMAW) NC II", "sector": "Metals and Engineering"},
 "possible_jobs": ["Welder", "Fabricator", "Structural Welder"],
 "competencies": [{"id": 1, "position": 1, "name": "Participate in workplace communication", "category": "Basic"}],
 "other_levels": [{"code": "MMAW-NC-I", "name": "Manual Metal Arc Welding (MMAW) NC I", "level": 1},
                  {"code": "MMAW-NC-II", "name": "Manual Metal Arc Welding (MMAW) NC II", "level": 2},
                  {"code": "MMAW-NC-III", "name": "Manual Metal Arc Welding (MMAW) NC III", "level": 3}],
 "official_codes": [{"code": "MEEEAW206", "relation": "same", "promulgated": "2006-12-14", "enabled_in_t2mis": true}]}
```

`official_codes` is empty for a qualification with no official TESDA code on file, and lists every code for one that has
several (`EIM-NC-II` lists `CONEIM208` and `ELCEIM215`).

### recommend_route

The next step for a learner toward one qualification (training, assessment, a readiness check or more questions),
with the reason and, where defined, curated steps. Scope `recommend:run`, limit 60 a minute.

```json
{"name": "recommend_route", "arguments": {"qualification_code": "MMAW-NC-II", "experience_years": 2}}
```
```json
{"route": "ADDITIONAL_QUESTIONS", "reason": "Your experience or certification status is still unknown.",
 "next_step": "Answer the follow-up questions to refine your pathway.", "pathway": null}
```

### check_readiness

A learner's readiness for one qualification's assessment, 0 to 100, with strengths, skill gaps and what to do next.
`answers` maps every competency id (from `get_qualification`) to `confident`, `some_experience` or `not_familiar`; every competency of the qualification needs an answer, and the
example is shortened to six.
Scope `recommend:run`, limit 60 a minute.

```json
{"name": "check_readiness", "arguments": {"qualification_code": "MMAW-NC-II",
  "answers": {"1": "confident", "2": "confident", "3": "some_experience", "4": "confident", "5": "not_familiar", "6": "confident"}}}
```
```json
{"score": 83.3, "level": "High Readiness", "strengths": ["Participate in workplace communication"],
 "skill_gaps": ["Prepare / Fit up Welding Joints"],
 "recommendation": "Consider formal assessment, subject to official eligibility and assessment requirements."}
```

### rank_training_programs

Active training programs for a qualification, ranked 0-100 for one learner by meaning, distance, nearby assessment,
start date and stated preferences, each with its components and explanation. Programs whose provider is not yet
verified come separately in `requires_verification`. Scope `recommend:run`, limit 30 a minute.

```json
{"name": "rank_training_programs", "arguments": {"qualification_code": "MMAW-NC-II", "region_code": "NCR", "limit": 2}}
```
```json
{"policy_version": "verified-services-v2", "semantic_used": false, "requires_verification": [],
 "results": [{"program": {"id": 1, "title": "MMAW NC II Batch 1",
                          "provider": {"id": 1, "name": "Manila Welding Institute", "region_code": "NCR"}},
              "eligibility": {"status": "satisfied", "checks": []}}]}
```

### rank_assessment_schedules

Upcoming assessment schedules with seats left for a qualification, ranked 0-100 for one learner. Schedules at
centers not yet verified come separately in `requires_verification`. Scope `recommend:run`, limit 30 a minute.

```json
{"name": "rank_assessment_schedules", "arguments": {"qualification_code": "MMAW-NC-II", "region_code": "NCR", "limit": 2}}
```
```json
{"policy_version": "assessment-center-v1", "results": [], "requires_verification": [], "total": 0, "limit": 2, "offset": 0}
```

### search_training_programs

Active training programs for a qualification, region or provider, nearest first when a point is given. Give at
least one of `qualification_code`, `region_code` or `provider_id`. Page with `next_offset`. Scope `catalog:read`,
limit 60 a minute.

```json
{"name": "search_training_programs", "arguments": {"qualification_code": "MMAW-NC-II", "limit": 1}}
```
```json
{"programs": [{"id": 1, "title": "MMAW NC II Batch 1",
               "qualification": {"code": "MMAW-NC-II"},
               "provider": {"id": 1, "name": "Manila Welding Institute", "region_code": "NCR"},
               "delivery_mode": "institution_based", "scholarship_available": false,
               "verification": {"status": "verified"}, "availability": {"status": "unknown"}}],
 "next_offset": 1}
```

### get_regional_supply

Training and assessment capacity per region right now: active providers and programs, upcoming assessment
schedules and open seats. Leave `region_code` out for every region. Scope `catalog:read`, limit 10 a minute.

```json
{"name": "get_regional_supply", "arguments": {"region_code": "NCR"}}
```
```json
{"regions": [{"region_code": "NCR", "region": "National Capital Region", "training_providers": 1,
              "training_programs": 1, "upcoming_assessments": 0, "open_seats": 0}]}
```

### get_qualification_demand

For one **completed** calendar quarter (`YYYY-Qn`), how many **distinct learners** per qualification matched
(`learners_top_matched`), chose (`learners_chose`), checked readiness (`learners_checked_readiness`), applied to
assess (`learners_applied`), were found competent (`learners_competent`) and certified (`learners_certified`),
with `average_readiness`. Scope `reports:read`, limit 10 a minute.

- Only finished quarters can be asked for. The current or a future quarter is an error, and so is a quarter before 2025-Q1 (the pilot's start).
- A quarter's figures are fixed the first time it is requested after it ends and never change afterwards, so
  asking again returns the same numbers.
- A count of 1 to 4 is hidden: it is `null` and the field is named in `hidden`. `learners_competent` is also hidden
  when `learners_applied` minus `learners_competent` is 1 to 4, because the two would give that small group away.
  A qualification with no published count at all is left out.
- `qualification_code` limits the answer to one qualification. An official code that covers several gives all of
  them.

```json
{"name": "get_qualification_demand", "arguments": {"quarter": "2026-Q3", "qualification_code": "MMAW-NC-II"}}
```
```json
{"quarter": "2026-Q3", "date_from": "2026-07-01", "date_to": "2026-09-30",
 "rows": [{"qualification": {"code": "MMAW-NC-II", "name": "Manual Metal Arc Welding (MMAW) NC II"},
           "learners_top_matched": 42, "learners_chose": 17, "learners_checked_readiness": null,
           "learners_applied": 9, "learners_competent": null, "learners_certified": 0,
           "average_readiness": null, "hidden": ["learners_checked_readiness", "learners_competent"]}]}
```

## 6. Errors and rate limits

| What happened | What you get |
| --- | --- |
| Token missing, malformed, expired, revoked, or for another server | HTTP **401** with `WWW-Authenticate: Bearer ... resource_metadata="https://tesda-track.example.ph/.well-known/oauth-protected-resource/mcp"`. Get a new token. If that still fails, your client may have been revoked. |
| Tool outside your scopes, or no such tool | JSON-RPC error **-32602**, `Unknown tool: <name>`. Out-of-scope tools are also missing from `tools/list`. |
| Over a per-minute limit (the tool's or your client's) | JSON-RPC error **-32000**, `Rate limit exceeded; retry in N seconds.`, with `data: {"retry_after": N}`. Wait that long. |
| A problem you can fix: invalid input, an unknown code, a goal naming no trade, an official code covering several qualifications | A result with `isError: true` and a short message in `content`. The message never repeats what you sent, only codes, ids and catalog titles. |
| A search or ranking that finds nothing | Not an error: `isError: false` with empty lists. |
| A request to another host | HTTP 421. |

The JSON-RPC errors arrive in the response body; do not rely on the HTTP status for them. The per-tool limits are in
section 5. Calls refused for a limit are still recorded in TESDA-TRACK's usage log.

## 7. Data rules

- **Send no names, ULI numbers or contact details** (phone, email, address) of any person, in a goal or anywhere.
  The goal is free text meant to say what the learner wants to do, such as "gusto kong maging welder".
- **The goal text is never stored.** It is used to answer the call. TESDA-TRACK keeps only a keyed fingerprint of
  it, so repeated goals can be counted; it cannot be turned back into text.
- **Coordinates are rounded to 0.1 degree (about 11 km)** before any use, and nothing finer is stored. Prefer a
  `region_code`.
- Questionnaire and readiness answers are likewise used only to answer the call.
- TESDA-TRACK logs the shape of every call (your client, the tool, which arguments were present, the outcome, the
  time taken) and keeps it for the retention period (180 days by default). The administrator reviews it against
  the tools you declared when you registered. Tell them if your use changes.
- Do not try to recover the hidden values in `get_qualification_demand`.

## 8. Support

Contact the TESDA-TRACK administrator who issued your client. Include your client id (never the secret), the time
of the problem and the tool name. The administrator can check your calls in the usage report and can rotate or
revoke a client.
