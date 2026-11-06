# US-20 occupation discovery correction

The current local application is http://127.0.0.1:5187/find and
http://127.0.0.1:5187/tsp/webview. Port 5188 also runs the updated frontend.
Both now proxy to the isolated Phase 5 API on 8018. The development database and
the older API on 8017 have not been migrated or reset. Start a fresh search to
evaluate new rankings; existing journeys retain their selected qualification and
readiness results.

## What was wrong

For `web developer`, the existing v3 model returned raw cosine similarity
0.660597 for Web Development NC III and 0.539752 for Programming (.NET Technology)
NC III. Both saturated the calibrated semantic component at 1.0 and received a
70/100 final score. Alphabetical/catalog ordering then put .NET first. This was
not evidence that the model failed to retrieve the web qualification.

The scraped catalog also fell back to the skill label `Programming` when its
parser found no occupation list in a TR. That became a misleading occupation
heading, grouping .NET, Java and Oracle together.

## Corrections

- Final score ties now retain raw semantic ordering in goal and skills matching.
  Score formulas, calibration, rejection thresholds and structured assessment
  scoring remain unchanged.
- A small source-backed catalog overlay replaces the generic heading with
  `Programmer` for the three programming qualifications and prepends `Web Developer`
  for Web Development NC III. It preserves existing specialized web occupations.
- The authority is TESDA's **Skills Map with Training Regulations (2020)**,
  printed page 7 / PDF page 11. It lists Web Developer → Web Development NC III
  and Programmer → the programming qualifications. This verifies identity only;
  it is not 2026 demand evidence. The document page was visually inspected and
  its URL/hash recorded under the report folder.
- Effective catalog jobs also contribute direct keyword evidence. There is no
  query-specific `if web developer` rule. The approved national occupation
  mappings from the labor-market review layer can now contribute occupation
  titles to input retrieval. Pending, manual and rejected mappings remain excluded;
  active versions, classifications and reporting years are checked per request.
- The final occupation cards link to the identity source only for the exact
  occupation verified by that source. Existing web-specialty titles retain their
  original catalog/TR basis.
- The account goal API accepts these corrected catalog titles without changing
  matching or readiness when a learner switches goals.

The original scraped JSON, research folders, qualification/competency database
records, model weights and vector records were not overwritten. There are no new
database migrations for this correction.

## Data preparation and fine-tuning decision

Run `python scripts/prepare_occupation_learning.py` to reproduce
`backend/training/data/occupation_discovery/`:

- 275 source-backed query/qualification review packets, with competencies,
  unique occurrence IDs, source pages, geographic scope, evidence class and
  original research confidence. There are 271 national forecast mapping proposals
  and four dated Pasay-posting proposals; the latter are not national demand data.
- Fourteen development diagnostic cases, explicitly marked engineering drafts.

All packets remain training-ineligible pending formal review; none is silently
approved or used as a negative label. The original Phase 4 status counts remain
82 high-confidence pending, 187 manual-review pending and six rejected. No
real demand association was approved during this correction.

Fine-tuning is deferred on evidence: raw v3 retrieval already distinguishes the
reported example correctly. Training against the same 14 debugging cases would
not establish general accuracy. Review the candidate labels, identify all valid
positives per query, author realistic examples, and split training/development/
independent test data before a controlled fine-tuning experiment. The repository's
existing `training.pairs`, negative-mining and `training.finetune` tools remain
available; this change does not bypass their evaluation exclusions or change the
existing sealed evaluation set.

## Learner-input handling

The current finder posts query text to the application's own `/api/v1/analysis/goal`
and `/matches` routes. `analysis.py` uses the rule interpreter and the local
`E5Embedder`; fastembed runs the model from the configured local ONNX directory.
This flow does not call a third-party skills or hosted LLM API with learner text.
Source-document retrieval is an operator/developer activity, not a learner-query
request. Therefore no new outside skills recipient was added. Any future hosted
skills service still requires the approval specified in US-20.

Existing account/session and opt-in feedback storage behavior is unchanged. This
code-path review is not an organization-wide privacy or vendor approval.

## Checks and actual output

- 69 backend tests pass: occupation source corrections and calibrated tie handling,
  skills/goal API, negation, readiness, approved-only retrieval and revocation,
  labor-market permissions, goal ownership and existing training-data exclusions.
- 15 focused frontend tests pass; TypeScript/production build and focused lint pass.
- Fourteen real-model development diagnostics have an expected top-one result or
  correct rejection. The comparable baseline had 12/14; the two web-developer
  queries are corrected. This is a small development regression result, not a
  measured general accuracy claim. Existing electrician, welding, customer-service
  and irrelevant-input diagnostics retain their prior results.
- Real Playwright journeys cover regular guests, TSP and signed-in accounts;
  desktop/mobile layouts, readiness, source-backed job titles, goal switching,
  account saving, reload/back persistence and qualification-filtered training links.
  Scoped axe checks report no violations in Related Occupations. No unapproved
  demand badge is shown for Web Development.

Reports and screenshots: `reports/us20-20261106/`. Reproduce the browser checks with
`node scripts/us20_browser_smoke.cjs` while the local preview is running. They use
the existing private local reviewer credentials for the account journey and do not
make any review/approval decisions. The original Phase 5 demonstration dataset is
unchanged and remains explicitly labeled as a fixture.

US-20 is ready for lead-developer review of these corrections. Formal acceptance,
expert review of training labels and approval of real demand associations are
still outstanding; no commit, push, merge or deployment was performed.
