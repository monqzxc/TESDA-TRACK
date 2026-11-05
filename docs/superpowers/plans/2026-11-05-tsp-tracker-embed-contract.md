# TSP ↔ Tracker Embed Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce the embed contract the TSP team asked for. It is a Markdown document plus JSON Schemas and examples for the six postMessage/bridge messages, and a unit test that keeps the schemas, the examples and the document's JSON blocks consistent.

**Architecture:** Everything lives under `docs/contracts/tsp-tracker-embed/`. The schemas (JSON Schema draft 2020-12) are the authority. The examples and the document's ```` ```json ```` blocks are checked against them by `backend/tests/unit/test_embed_contract.py`, which runs with the database-free suite. No product code changes.

**Tech Stack:** JSON Schema 2020-12, `jsonschema` 4.26.0 (Python), pytest, Markdown.

**Spec:** `docs/superpowers/specs/2026-11-05-tsp-tracker-embed-contract-design.md`. Every value below comes from it. Section numbers (§) refer to it. The TSP team's spec it builds on is `31-TRACKER_IFRAME_INTEGRATION.md` at the repo root.

## Global Constraints

- Branch: `tsp-embed-contract`, cut from `main`. Don't commit the untracked `web/` or `31-TRACKER_IFRAME_INTEGRATION.md`.
- Contract directory: `docs/contracts/tsp-tracker-embed/`.
- The six message types, exactly: `tsp.tracker.ready`, `tsp.tracker.signed_in`, `tsp.tracker.error`, `tsp.tracker.handoff`, `tsp.tracker.handoff_failed`, `tsp.tracker.logout`.
- Common fields: `type` (string const) and `version` (integer const `1`). Every schema sets `"additionalProperties": true`, because receivers ignore unknown fields (§2).
- `nonce` and `state` pattern: `^[A-Za-z0-9_-]{43}$`. `code`: string, `minLength: 1`, `maxLength: 4096`.
- Enums (§3):
  - `ready.reason`: `initial`, `reload`, `session_expired`, `retry`
  - `error.code`: `handoff_expired`, `unavailable`, `client_rejected`, `timeout`
  - `handoff_failed.reason`: `not_signed_in`, `unavailable`
- Flutter names (§7): channel `TspTrackerHost`, Tracker function `window.TspTracker.receive(json)`.
- Embed URL (§6): `https://<tracker-origin>/tsp?host=web|mobile`. Timeout: 10 seconds. One automatic retry, on `handoff_expired` only.
- Known origins (§6). Write them as these exact strings wherever the contract uses them:
  - Tracker staging: `https://tesda-track.vercel.app`, so the embed URLs are `https://tesda-track.vercel.app/tsp?host=web` and `https://tesda-track.vercel.app/tsp?host=mobile`.
  - Hercules staging: `https://hercules-api-staging.tesdabest.com`
  - TSP production: `https://app.tesda.gov.ph`
  - Every other cell reads "to be agreed".
  - Client ID: `tesda-tracker`. Handoff `target`: the environment's Tracker origin.
- Pin `jsonschema==4.26.0` in `requirements-dev.txt`. The file uses CRLF line endings; keep them.
- Unit suite command: `.venv/Scripts/python -m pytest --confcutdir=backend/tests/unit backend/tests/unit -q`. **Baseline: 270 passed, 3 failed.** The 3 failures are the known `ModuleNotFoundError: No module named 'mcp'` ones in `test_client_config_api.py` and `test_openapi_schema.py`.
- Audience for `CONTRACT.md`: the TSP web and Flutter developers. Write for them; leave out how Tracker implements its side (§ Out of scope).

## Review Focus

1. **The document's examples drift from the schemas.** Someone edits a payload in `CONTRACT.md` and TSP copies the wrong shape. Pinned in Task 2: `test_contract_json_blocks_match_their_schemas`.
2. **A nonce in standard base64**, with `+`, `/` or `=` padding, from a host that used the wrong encoder. It must fail. Pinned in Task 1 by the invalid example `tsp.tracker.ready--standard-base64-nonce.json`.
3. **`version` sent as the string `"1"`.** It must fail, since TSP's Dart side might stringify it. Pinned in Task 1: `tsp.tracker.ready--string-version.json`.
4. **An extra field from a newer sender** must still validate (forward compatibility, §2). Pinned in Task 1 by the valid example `tsp.tracker.handoff--extra-field.json`.
5. **The Dart and JS snippets skip an origin check.** This can't be tested by machine. The reviewer must confirm three things: the JS host checks `event.source` and `event.origin` and posts to the exact Tracker origin; the Dart handler awaits `currentUrl()` before handling a channel message and before every `runJavaScript`; and `NavigationDelegate` blocks other origins (§6, §7).

---

### Task 1: Message schemas, examples and the conformance test

**Files:**
- Create: `docs/contracts/tsp-tracker-embed/schemas/<type>.schema.json` (6 files)
- Create: `docs/contracts/tsp-tracker-embed/examples/valid/<type>.json` (6 files), plus `tsp.tracker.handoff--extra-field.json`
- Create: `docs/contracts/tsp-tracker-embed/examples/invalid/<type>--<what-is-wrong>.json` (the 7 listed in Step 1)
- Create: `backend/tests/unit/test_embed_contract.py`
- Modify: `requirements-dev.txt` (add the pin after `pytest==9.1.1`)

**Interfaces:**
- Produces, used by Task 2's tests in the same file:
  - `CONTRACT_DIR: Path`, the repo root plus `docs/contracts/tsp-tracker-embed`. Find the repo root from `Path(__file__).resolve().parents[3]`.
  - `MESSAGE_TYPES: tuple[str, ...]`, the six types.
  - `validator(message_type: str) -> jsonschema.Draft202012Validator`, which loads that type's schema.
- Example file naming: the schema an example is checked against is its file stem before any `--`. For example, `tsp.tracker.ready--short-nonce.json` is checked against `tsp.tracker.ready`.

- [ ] **Step 1: Write the failing test**

Module docstring: "Database-free checks that the TSP embed contract's schemas, examples and document agree. Run with --confcutdir=backend/tests/unit."

```python
REQUIRED_INVALID = {"tsp.tracker.handoff--missing-state", "tsp.tracker.ready--version-2",
                    "tsp.tracker.ready--short-nonce", "tsp.tracker.ready--standard-base64-nonce",
                    "tsp.tracker.ready--string-version", "tsp.tracker.error--unknown-code",
                    "tsp.tracker.handoff--empty-code"}

def test_every_message_type_has_a_schema_and_a_valid_example():
    for message_type in MESSAGE_TYPES:
        assert (CONTRACT_DIR / "schemas" / f"{message_type}.schema.json").is_file()
        assert (CONTRACT_DIR / "examples" / "valid" / f"{message_type}.json").is_file()

def test_no_schema_for_an_unknown_type():
    assert {p.name.removesuffix(".schema.json") for p in (CONTRACT_DIR / "schemas").glob("*.json")} == set(MESSAGE_TYPES)

@pytest.mark.parametrize("message_type", MESSAGE_TYPES)
def test_schema_is_valid_draft_2020_12_and_names_its_type(message_type):
    schema = json.loads((CONTRACT_DIR / "schemas" / f"{message_type}.schema.json").read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    assert schema["properties"]["type"] == {"const": message_type}
    assert schema["properties"]["version"] == {"const": 1, "type": "integer"}
    assert {"type", "version"} <= set(schema["required"]) and schema["additionalProperties"] is True

@pytest.mark.parametrize("path", sorted((CONTRACT_DIR / "examples" / "valid").glob("*.json")), ids=lambda p: p.stem)
def test_valid_examples_pass(path):
    validator(path.stem.split("--")[0]).validate(json.loads(path.read_text(encoding="utf-8")))

@pytest.mark.parametrize("path", sorted((CONTRACT_DIR / "examples" / "invalid").glob("*.json")), ids=lambda p: p.stem)
def test_invalid_examples_fail(path):
    assert not validator(path.stem.split("--")[0]).is_valid(json.loads(path.read_text(encoding="utf-8")))

def test_the_required_invalid_cases_exist():
    assert REQUIRED_INVALID <= {p.stem for p in (CONTRACT_DIR / "examples" / "invalid").glob("*.json")}
```

Note: `parametrize` over an empty glob produces no test cases, so before Step 3 those two tests are skipped rather than failing. The other tests carry the RED state.

- [ ] **Step 2: Run it to make sure it fails**

Run: `.venv/Scripts/python -m pytest --confcutdir=backend/tests/unit backend/tests/unit/test_embed_contract.py -q`
Expected: FAIL. `test_every_message_type_has_a_schema_and_a_valid_example` and `test_the_required_invalid_cases_exist` fail on missing files.

- [ ] **Step 3: Write the 6 schemas**

- Each schema has `"$schema": "https://json-schema.org/draft/2020-12/schema"`, `"$id": "urn:tesda-track:tsp-tracker-embed:<type>:v1"`, a `title` (the type), a one-sentence `description` taken from the spec §3 "Meaning", `"type": "object"`, `required`, `properties` and `"additionalProperties": true`.
- Put the field constraints from Global Constraints in each property, along with a `description`. `state`'s description says it is the nonce from the `ready` being answered.

- [ ] **Step 4: Write the examples**

- Generate nonce values with `.venv/Scripts/python -c "import secrets; print(secrets.token_urlsafe(32))"` (43 characters). Use the same value for a `ready` and the `handoff` and `handoff_failed` that answer it, so the examples read as one conversation.
- `code` in examples: `"example-one-time-code"`.
- Valid files:
  - one per type
  - `tsp.tracker.handoff--extra-field.json`, the handoff with `"sent_at": "2026-11-05T08:00:00Z"` added
- Invalid files, as named in `REQUIRED_INVALID`:
  - missing `state`
  - `version: 2`
  - a 42-character nonce
  - a nonce in standard base64 (contains `+`, `/` and ends `=`; 44 characters)
  - `version: "1"`
  - `error.code: "boom"`
  - `code: ""`

- [ ] **Step 5: Pin the dependency**

Add `jsonschema==4.26.0` to `requirements-dev.txt` after `pytest==9.1.1`, with a comment line above it in the file's style: `# Checks the TSP embed contract's examples against its JSON Schemas (backend/tests/unit/test_embed_contract.py).` Keep CRLF endings (`file requirements-dev.txt` still reports CRLF).

- [ ] **Step 6: Run the tests and the unit suite**

Run: `.venv/Scripts/python -m pytest --confcutdir=backend/tests/unit backend/tests/unit/test_embed_contract.py -q`
Expected: 23 passed. That is 3 single tests, 6 schema tests, 7 valid examples and 7 invalid examples.

Run: `.venv/Scripts/python -m pytest --confcutdir=backend/tests/unit backend/tests/unit -q`
Expected: 293 passed, plus the 3 baseline `mcp` failures.

- [ ] **Step 7: Commit**

```bash
git add docs/contracts/tsp-tracker-embed/schemas docs/contracts/tsp-tracker-embed/examples backend/tests/unit/test_embed_contract.py requirements-dev.txt
git commit -m "docs(tracker): JSON Schemas and examples for the TSP embed messages"
```

---

### Task 2: `CONTRACT.md`, the document TSP builds from

**Files:**
- Create: `docs/contracts/tsp-tracker-embed/CONTRACT.md`
- Modify: `backend/tests/unit/test_embed_contract.py` (add 2 tests)

**Interfaces:**
- Consumes: `CONTRACT_DIR`, `MESSAGE_TYPES` and `validator()` from Task 1.

- [ ] **Step 1: Write the failing tests**

```python
def contract_json_blocks() -> list[dict]:
    """Every ```json block in CONTRACT.md that is a message (has a "type" starting "tsp.tracker.")."""

def test_contract_json_blocks_match_their_schemas():
    blocks = contract_json_blocks()
    assert {block["type"] for block in blocks} == set(MESSAGE_TYPES)   # one example of each, at least
    for block in blocks:
        validator(block["type"]).validate(block)

def test_contract_links_every_schema():
    text = (CONTRACT_DIR / "CONTRACT.md").read_text(encoding="utf-8")
    assert all(f"schemas/{message_type}.schema.json" in text for message_type in MESSAGE_TYPES)
```

`contract_json_blocks` uses a regex over fenced blocks (```` ```json\n(.*?)\n``` ````, with DOTALL). It parses each block with `json.loads` and keeps the dicts whose `type` starts with `tsp.tracker.`. A `json` block that fails to parse should fail the test, so the document can't show broken JSON.

- [ ] **Step 2: Run them to make sure they fail**

Run: `.venv/Scripts/python -m pytest --confcutdir=backend/tests/unit backend/tests/unit/test_embed_contract.py -q`
Expected: the 2 new tests FAIL with `FileNotFoundError` for `CONTRACT.md`. The other 23 still pass.

- [ ] **Step 3: Write `CONTRACT.md`**

Use these sections in this order. Each takes its content from the spec section named. Keep the spec's values exactly.

1. **Title, status and scope.** Title: "TSP ↔ TESDA-TRACK embed contract (version 1)". Give the status as "Draft for TSP review, 2026-11-05". Say what this covers (the host side of embedding and sign-in) and what it doesn't (Hercules' endpoints, which spec 31 owns, and Tracker's internals). Note that TSP may renumber the document.
2. **At a glance.** Six numbered steps (§4), plus a text sequence diagram in the style of spec 31's "Flow" block, for web.
3. **Environments.** The origins table (§6), using the known origins from Global Constraints; the rest read "to be agreed". Under the table:
   - the handoff `target` for each environment and the client ID
   - what TSP needs to give us: their staging and production web origins
   - the request to host production Tracker under `*.tesda.gov.ph`, with its reason
   - a note on the framing headers on each environment (§6). On staging they are not yet in place, so the iframe works today but isn't restricted to TSP; the contract says when Tracker will restrict it.
4. **Messages.** Common rules (§2), then one subsection per type. Each subsection gives the direction, when it is sent, a field table, one ```` ```json ```` example (copy the valid example file), and a link `schemas/<type>.schema.json`.
5. **Sequence and timing.** The steps, retry rules, timeout and logout from §4. Say explicitly that TSP never retries; Tracker does.
6. **Error codes.** The table from §5, with the suggested TSP responses.
7. **Web host (iframe).** The embed URL, the CSP and iframe attributes with a reason for each flag (§6), and a complete JavaScript example (≤ 40 lines). It creates the iframe, checks `event.source` and `event.origin`, handles `ready` by calling TSP's backend `POST /tracker/handoff` (spec 31) with `state = nonce`, posts `handoff` or `handoff_failed` to the exact Tracker origin, and sends `logout` on sign-out.
8. **Mobile host (Flutter `webview_flutter`).** The bridge from §7, with a complete Dart example (≤ 60 lines) covering the controller set-up, the `TspTrackerHost` channel, the `currentUrl()` origin check before handling and before every `runJavaScript`, `NavigationDelegate` with `url_launcher` for other origins, the `ready` handler, and `logout`. Also cover location permission and the `?host=mobile` URL. The JSON for each message is the same as on web.
9. **Security checklist for TSP.** One bulleted list of every "TSP must" from §6 and §7, so TSP can tick it off in review.
10. **Versioning.** From §8.
11. **Changes requested from spec 31.** Items 1–6a from §9, each with its reason.
12. **Questions for Hercules.** Items 7–8 from §9.
13. **Files.** What `schemas/` and `examples/` hold, and that `backend/tests/unit/test_embed_contract.py` checks them, including this document's JSON blocks.

Only use ```` ```json ```` for message payloads, so the test checks them. Use ```` ```js ```` for JavaScript, ```` ```dart ```` for Dart and ```` ```text ```` for diagrams.

- [ ] **Step 4: Run the tests and the unit suite**

Run: `.venv/Scripts/python -m pytest --confcutdir=backend/tests/unit backend/tests/unit/test_embed_contract.py -q`
Expected: 25 passed.

Run: `.venv/Scripts/python -m pytest --confcutdir=backend/tests/unit backend/tests/unit -q`
Expected: 295 passed, plus the 3 baseline `mcp` failures.

- [ ] **Step 5: Commit**

```bash
git add docs/contracts/tsp-tracker-embed/CONTRACT.md backend/tests/unit/test_embed_contract.py
git commit -m "docs(tracker): TSP embed contract for the web and Flutter hosts"
```
