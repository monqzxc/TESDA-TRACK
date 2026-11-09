# Evidence-Backed Center Recommendation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A learner gets qualification choices with typed demand evidence, then separate training and assessment comparisons ranked by modeled travel time and practical preferences only, with every value, unknown and limitation traceable.

**Architecture:** Additive contracts on the existing FastAPI endpoints. New pure services compute posting statistics (deduplicated by stable source ID), supply statistics and route-based travel evidence (OSRM table service behind a configured, approved endpoint). A new opt-in service policy `service-logistics-v1` reuses the existing candidate gates of both rankers and scores only accessibility and practical preferences. The React Training page opts in and shows the evidence panel.

**Tech Stack:** Python 3 / FastAPI / SQLModel / PostgreSQL+PostGIS, httpx, pytest; React 19 + TanStack Query + openapi-fetch, vitest.

**Spec:** [docs/ai-driven-center-recommendation-spec.md](../../ai-driven-center-recommendation-spec.md)

## Global Constraints

- Branch `feat/center-recommendation-evidence` (from main e591510). Stage explicit paths only, never `git add -A`; other sessions share this checkout. Compare `git diff --numstat` with what you reviewed before each commit.
- Tests share the `tesda_track_test` database, so never run two pytest processes at once. Run from the repo root: `.venv/Scripts/python.exe -m pytest backend/tests/<file> -q`.
- Add no LLM, no model training, no vector database, no microservice, no 2SFCA or capacity optimisation, and no new Python or npm dependency.
- Existing callers keep today's behaviour. New behaviour is opt-in through `policy: "service-logistics-v1"`. MCP tools (`mcp/tools_recommend.py`) and `pathway_report.py` stay on the current policies.
- Privacy: round a travel origin to 2 decimals (`routing.ORIGIN_DECIMALS`) before any use. Audits store at most 1 decimal (`ranking.LOCATION_DECIMALS`). Never log coordinates, route URLs or raw location input. Cache keys are hashes.
- Wording: postings are "posting records", never vacancies or workers. Never compute or say "shortage". No employment probability, no "guarantee". Call the service weights "frozen engineering weights", never learned or validated.
- Missing data: a learner dimension that was not supplied is removed from the denominator for the whole request. A candidate-specific unknown gets no positive contribution but keeps its denominator share. Coverage is observed weight divided by applicable weight.
- A straight-line distance or estimated flight never passes a travel-time constraint. Public transport always returns `unsupported_mode`.
- Commit style follows the repo (`feat(scope): …`, `test(scope): …`, `docs: …`). End every message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **The origin is off the road network** (a rounded point in the bay or a field). The origin snap is beyond tolerance, so no route counts as checked access: every candidate is unknown for scoring and unresolved under a mandatory budget. Test: Task 5 `test_origin_far_from_network_marks_every_route_unchecked`.
2. **The router fails part of the way through** (one table chunk answers, the next times out). The failed chunk is `routing_unavailable`, the answered chunk keeps its minutes, and nothing from the failure is cached. Test: Task 5 `test_partial_chunk_failure_keeps_answered_routes_and_caches_nothing_failed`.
3. **A relevant qualification has no postings and no forecast.** Its posting value is null with a statement that absence of evidence is not absence of demand. Attaching evidence never changes match order or scores. Tests: Task 1 `test_no_postings_is_null_not_zero`, Task 4 `test_evidence_never_changes_match_order`.
4. **A page past the end** (`offset` ≥ total). Results are empty, totals stay intact, and the reason is `page_beyond_results`, not "no services". Test: Task 7 `test_offset_past_total_reports_page_beyond_results`.
5. **A center has no map point and the budget is mandatory.** It goes to `requires_verification` as `origin_or_destination_unknown` and is never confirmed. Test: Task 7 `test_unmapped_center_with_mandatory_budget_is_unresolved`.

---

### Task 1: Evidence measures and deduplicated posting statistics

**Files:**
- Create: `backend/tesda_track/schemas/evidence.py`
- Create: `backend/tesda_track/services/demand_evidence.py`
- Test: `backend/tests/test_demand_evidence.py`

**Interfaces:**
- Produces, in `schemas/evidence.py`:
  - `EvidenceKind = Literal["observed", "estimated", "forecast"]`
  - `Geography(scope: Literal["national","regional","local","multi_regional"], region_code: str | None, label: str)`
  - `Measure(name, value: float | None, unit: str, evidence_kind, geography, reference_period: str | None, observed_on: date | None, sources: list[str], method_version: str, known_record_count: int, eligible_record_count: int, unknown_count: int, coverage: float | None, statement: str, limitations: list[str])`
  - `PostingEvidence(postings: Measure, employers: Measure, by_qualification: dict[str, int], overlap_count: int, repeated_captures: int, suspected_duplicate_groups: int, unallocated_count: int, snapshot_dates: list[date], posted_between: list[date] | None, dataset_keys: list[str], fingerprint: str)`
  - `measure_sum(name, unit, values: list[float | None], *, label: str, record_noun: str, total_noun: str, **context) -> Measure`: value is the sum of known values, or None when none are known. Coverage is known/eligible, or None when eligible is 0.
- Produces, in `services/demand_evidence.py`:
  - `METHOD_VERSION = "postings-dedup-v1"`
  - `posting_evidence(session, qualification_codes: Sequence[str], region_code: str | None = None, *, today: date | None = None) -> PostingEvidence`

Rules (the spec's Task 1). Use the same eligibility as `labor_market.observed_postings`: approved `high_confidence` mappings, an active `observed_posting` dataset, `observed_on` between 1 January of the current Manila year and today, and regional or local scope. On top of that:
- The stable ID is `f"{dataset.publisher}|{evidence.source_record_id}"`. Captures that share a stable ID count once, and each extra capture adds to `repeated_captures`.
- Distinct IDs that share casefolded employer + `normalized_title` + `locality` + `provenance.posted_on` form a suspected repost group. They are **not** merged; count them in `suspected_duplicate_groups`.
- A posting without `region_code` adds to `unallocated_count` and stays out of every total.
- Employers are normalised with `" ".join(name.split()).casefold()`. Postings without an employer go to the employer measure's `unknown_count`.
- `postings.value` is None when there are zero distinct postings. The statement is then `"No mapped posting records in this extent; absence of evidence is not absence of demand."`
- Geography is `regional` with the region's name when `region_code` is given. Otherwise it is `multi_regional` with the label `"Regions with mapped posting records (not a national total)"`.
- `fingerprint` is the sha256 of `METHOD_VERSION` and the sorted stable IDs, joined by `"\n"`.
- Fixed limitation copy: `"Posting records are dated observations, not vacancies or workers; headcount is unknown."`

- [ ] **Step 1: Write the failing tests.** Seed the bundles in-test with `labor_market.import_bundle` on a `tmp_path` folder, with mappings approved through `labor_market.decide`. Copy the fixture pattern from `backend/tests/test_labor_market.py`.

```python
def test_measure_sum_states_partial_coverage_exactly():
    m = measure_sum("remaining_seats", "seats", [10, None, 20, None, None], label="remaining seats",
                    record_noun="offerings", total_noun="capacity", **CTX)
    assert (m.value, m.known_record_count, m.eligible_record_count, m.unknown_count) == (30, 2, 5, 3)
    assert m.statement == "30 reported remaining seats across 2 of 5 offerings; total capacity unknown."

def test_measure_sum_all_zero_is_observed_zero():
    m = measure_sum("remaining_seats", "seats", [0] * 5, label="remaining seats", record_noun="offerings",
                    total_noun="capacity", **CTX)
    assert m.value == 0 and m.coverage == 1 and m.statement == "0 reported remaining seats across 5 of 5 offerings."

def test_repeated_capture_counts_once(...):        # same job id in two snapshot datasets -> postings.value == 1, repeated_captures == 1
def test_same_title_distinct_ids_are_not_merged(...): # 2 ids, same employer/title/locality/date -> value 2, suspected_duplicate_groups 1
def test_posting_linked_to_two_codes_counts_once_in_combined_total(...):  # by_qualification {A:1, B:1}, value 1, overlap_count 1
def test_no_postings_is_null_not_zero(...):        # value is None; statement as fixed above
def test_last_year_observation_is_not_current(...): # observed_on in the previous year -> excluded
def test_revoked_mapping_drops_out_and_changes_fingerprint(...)
def test_same_evidence_reproduces_fingerprint(...)
```

- [ ] **Step 2: Run the tests and check they fail.** `.venv/Scripts/python.exe -m pytest backend/tests/test_demand_evidence.py -q`. Expected: ImportError.
- [ ] **Step 3: Implement the schemas and `posting_evidence`.** Use one query joined like `observed_postings`, then group in Python. Parse `provenance.posted_on` (`M/D/YYYY`) leniently: an unparseable date leaves `posted_between` without it.
- [ ] **Step 4: Run the tests and check they pass.** Then run `backend/tests/test_labor_market.py` to check for regressions.
- [ ] **Step 5: Commit** (`backend/tesda_track/schemas/evidence.py`, `backend/tesda_track/services/demand_evidence.py`, `backend/tests/test_demand_evidence.py`): `feat(evidence): typed measures and posting counts deduplicated by source ID`.

### Task 2: Supply statistics with known and unknown denominators

**Files:**
- Create: `backend/tesda_track/services/supply_statistics.py`
- Modify: `backend/tesda_track/schemas/evidence.py` (add `SupplyEvidence`)
- Test: `backend/tests/test_supply_statistics.py`

**Interfaces:**
- Consumes: `Measure`, `Geography`, `measure_sum` (Task 1); `verification.effective_status`, `availability`, `authorization_covers`, `get`; `assessments.seats_taken_subquery`.
- Produces: `METHOD_VERSION = "supply-statistics-v1"`, and `supply_evidence(session, qualification_code: str, region_code: str | None = None, *, now: datetime | None = None, scheduled_after: date | None = None, scheduled_before: date | None = None) -> SupplyEvidence`. `SupplyEvidence` holds these Measures: `registered_training_sites` (unit "sites"), `registered_training_programs` ("program records"), `confirmed_training_offerings` ("offerings"), `published_training_slots` ("slots"), `remaining_training_seats` ("seats"), `confirmed_assessment_schedules` ("schedules"), `confirmed_assessment_sites` ("sites") and `remaining_assessment_seats` ("seats"). It also holds `completeness: dict[str, float | None]`.

Definitions:
- **Registered:** active program, provider and qualification. Count distinct providers and program records separately.
- **Confirmed training offering:** a registered program whose `effective_status` is `verified` and whose availability is `available` now, and which has not finished.
- **Published training slots:** `measure_sum` over the confirmed offerings' `slots`.
- **Remaining training seats:** always value None, with the limitation `"Remaining training seats are not recorded; published slots are a separate measure."`
- **Confirmed assessment schedule:** open, in the future, at an active center, `verified`, covered by the authorization on its date, availability `available`, and inside the optional window.
- **Remaining assessment seats:** `max(0, slots - taken)` per schedule, summed once per schedule.
- Every Measure has `evidence_kind="observed"` and `sources=["registry"]` (or `["registry", "verification"]` for the confirmed measures). Region scope uses the site's `region_code`. Without a region, the label is `"All registered sites in this dataset"` and the limitation is `"Registry-wide market coverage is unknown."`

- [ ] **Step 1: Write the failing tests** with the `make_program`, `make_schedule`, `make_center` and `verify_service` fixtures.

```python
def test_registered_is_not_confirmed(...)              # unverified program: registered 1, confirmed 0 (observed zero)
def test_partial_slots_report_known_of_eligible(...)   # 2 of 3 confirmed with slots 10+20 -> value 30, known 2, eligible 3
def test_full_schedule_contributes_observed_zero(...)  # all seats taken -> remaining_assessment_seats.value == 0, coverage 1
def test_unknown_training_seats_are_null(...)          # remaining_training_seats.value is None
def test_training_authority_does_not_confirm_assessment(...)
def test_region_filter_uses_site_region(...)
```

- [ ] **Step 2: Run the tests and check they fail.**
- [ ] **Step 3: Implement it** with one query per service kind and the verification preload (`verification.preload`), as `training.search_programs` does.
- [ ] **Step 4: Run the tests and check they pass.**
- [ ] **Step 5: Commit:** `feat(evidence): supply statistics with known and unknown denominators`.

### Task 3: Qualification evidence panel endpoint

**Files:**
- Create: `backend/tesda_track/services/evidence_panel.py`
- Modify: `backend/tesda_track/schemas/evidence.py` (add `ForecastSupport`, `EvidenceContext`, `QualificationEvidencePanel`)
- Modify: `backend/tesda_track/routers/labor_market.py` (add `GET /labor-market/evidence`)
- Test: `backend/tests/test_evidence_panel.py`

**Interfaces:**
- Consumes: `labor_market.indicators`, `posting_evidence` (Task 1), `supply_evidence` (Task 2), `catalog.get_active_qualification`.
- Produces:
  - `ForecastSupport(occupation_title, classification: Literal["in_demand","hard_to_fill"], evidence_kind: Literal["forecast"], value: None, geography: Geography, geography_match: Literal["selected_area","broader_scope","no_area_selected"], period_label, publisher, source_title, source_url, source_reference, dataset_key, mapping_id)`
  - `EvidenceContext(qualification_code, region_code: str | None, evaluated_at: datetime, method_versions: dict[str, str])`
  - `QualificationEvidencePanel(context, forecast_support: list[ForecastSupport], observed_postings: PostingEvidence, supply: SupplyEvidence, limitations: list[str])`
  - `evidence_panel.build(session, qualification_code: str, region_code: str | None = None, *, now: datetime | None = None) -> QualificationEvidencePanel`
  - `GET /api/v1/labor-market/evidence?qualification_code=&region_code=` with `response_model=QualificationEvidencePanel`. An unknown region is 400 (as `indicators`); an unknown or inactive qualification is 404.

`geography_match` is `selected_area` when the evidence region equals `region_code`, `broader_scope` for national evidence while a region is selected, and `no_area_selected` without a region. The national label stays `"Philippines — National"`. The panel's `limitations` always include these strings, verbatim: `"Forecast classifications are categorical; they are not projected vacancy totals."`, `"Registered programs establish an offering, not a current intake or remaining seats."` and `"Posting records and seats have different units and periods; no shortage is calculated."`

- [ ] **Step 1: Write the failing tests.** `test_national_forecast_keeps_national_label_in_a_region`; `test_out_of_period_forecast_is_absent`; `test_panel_is_public_and_typed` (anonymous 200; the keys match the schema); `test_unknown_region_400_unknown_qualification_404`; `test_retired_dataset_disappears_from_panel`.
- [ ] **Step 2: Run the tests and check they fail.**
- [ ] **Step 3: Implement `build` and the route.**
- [ ] **Step 4: Run the tests, plus `test_labor_market.py`, and check they pass.**
- [ ] **Step 5: Commit:** `feat(labor-market): one typed evidence panel per qualification and area`.

### Task 4: Demand evidence and route guidance on qualification recommendations

**Files:**
- Modify: `backend/tesda_track/schemas/personalization.py` (request fields), `backend/tesda_track/schemas/evidence.py` (add `RouteGuidance`, `QualificationEvidenceSummary`, `QualificationRecommendations`)
- Modify: `backend/tesda_track/routers/recommendations.py` (`rank_qualifications`)
- Modify: `backend/tesda_track/services/evidence_panel.py` (add `summary`, `route_guidance`)
- Test: `backend/tests/test_qualification_evidence.py`

**Interfaces:**
- `QualificationRecommendationRequest` adds `include_evidence: bool = False` and `evidence_region_code: RegionCode | None = None`. A region without `include_evidence` is a 422.
- `RouteGuidance(suggestion: Literal["training","assessment_inquiry","undetermined"], reason: str)`
- `QualificationEvidenceSummary(qualification_code, linked_occupations: list[str], forecast_support: list[ForecastSupport], observed_postings: Measure, geography_match: Literal["selected_area","broader_scope","none_found","no_area_selected"], data_age_days: int | None, route_guidance: RouteGuidance, limitations: list[str])`
- `QualificationRecommendations(MatchResult)` adds `evidence: list[QualificationEvidenceSummary] | None = None`. Its wrap serializer drops `evidence` when it is None, so the legacy shape stays the same. Set `response_model=QualificationRecommendations` on the route.
- `evidence_panel.route_guidance(answers: AssessmentAnswers, item) -> RouteGuidance`:
  - `assessment_inquiry` when every one of the qualification's competencies is answered `confident`.
  - `training` when some are answered.
  - `undetermined` when none are.
  - Every reason ends with `" Self-reported readiness is not assessment eligibility; formal prerequisites still need verification."`
- `evidence_panel.summary(session, match, answers, region_code, *, today) -> QualificationEvidenceSummary`. `data_age_days` counts from the newest posting snapshot date, or else the newest forecast `publication_date`. It is None when neither exists.

- [ ] **Step 1: Write the failing tests.** `test_national_only_evidence_is_described_as_broader_scope`; `test_evidence_never_changes_match_order` (the same request with and without `include_evidence` gives identical `matches`); `test_irrelevant_profile_gets_no_matches_and_empty_evidence`; `test_all_confident_suggests_assessment_inquiry_with_caveat`; `test_legacy_response_has_no_evidence_key`.
- [ ] **Step 2: Run the tests and check they fail.**
- [ ] **Step 3: Implement it.** Evidence is attached after `analysis.match` returns, and the matches are left alone.
- [ ] **Step 4: Run the tests, plus `test_analysis_api.py` and `test_learner_assessments.py`, and check they pass.**
- [ ] **Step 5: Commit:** `feat(recommendations): qualification matches can carry their demand evidence`.

### Task 5: Route-based travel evidence

**Files:**
- Create: `backend/tesda_track/schemas/travel.py`
- Create: `backend/tesda_track/services/travel_access.py`
- Modify: `backend/tesda_track/services/routing.py` (add `TableClient`, `TableResult`)
- Modify: `backend/tesda_track/config.py`, `.env.example`
- Test: `backend/tests/test_travel_access.py`

**Interfaces:**
- `schemas/travel.py`:
  - `TravelOriginKind = Literal["approximate_location","public_place","region_centroid"]`
  - `RankingTravelMode = Literal["car","bike","foot","public_transport"]`
  - `TravelState = Literal["modeled_route","no_route_in_network","unsupported_mode","routing_unavailable","origin_or_destination_unknown"]`
  - `TravelOrigin(latitude: Latitude, longitude: Longitude, kind: TravelOriginKind)`
  - `TravelPreference(origin, mode="car", budget_minutes: float | None (gt 0, le 1440), budget_is_mandatory=False)` with `extra="forbid"`. A mandatory budget needs `budget_minutes`. A `region_centroid` origin cannot carry a mandatory budget.
  - `TravelEvidence(state, mode, duration_min, network_distance_km, straight_line_km, origin_snap_m, destination_snap_m, endpoints_checked: bool, within_budget: bool | None, reason: str)`
  - `TravelSearch(origin_kind, origin_precision_decimals: int, mode, budget_minutes, budget_is_mandatory, method: Literal["osrm_table","none"], routing_dataset: str | None, candidates: int, routed: int, complete: bool, limitations: list[str])`
- `routing.py`:
  - `TableResult(durations_s: list[float | None], distances_m: list[float | None], origin_snap_m: float | None, destination_snaps_m: list[float | None])`
  - `TableClient(urls: dict[str, str], timeout: float = 5, transport: httpx.BaseTransport | None = None)` with `.modes -> list[str]` and `.table(mode, origin: dict, destinations: list[dict]) -> TableResult`.
  - It calls `GET {url}/table/v1/driving/{lon,lat;…}` with `sources=0`, `destinations=1;…;n` and `annotations=duration,distance`.
  - OSRM code `NoSegment` raises `RouteError(NO_ROUTE)`. Transport errors, non-200 responses and other codes raise `RouteError(UNAVAILABLE)`.
- `config.Settings` adds:
  - `ranking_routing_urls: dict[str, str] = {}` (env `RANKING_ROUTING_URLS`, JSON such as `{"car": "http://osrm-car:5000"}`; empty means route ranking is off)
  - `ranking_routing_dataset: str = ""`
  - `ranking_routing_max_destinations: int = 100` (1–500)
  - `ranking_routing_max_candidates: int = 300` (1–2000)
  - `ranking_routing_timeout_seconds: float = 5`
  - The public `routing_url` is **never** used for ranking.
- `travel_access.py`:
  - `ORIGIN_SNAP_TOLERANCE_M = 1000`, `DESTINATION_SNAP_TOLERANCE_M = 250`
  - `table_client(settings: SettingsDep) -> TableClient | None`, a FastAPI dependency cached per URL map
  - `assess(travel: TravelPreference, destinations: list[tuple[str, float | None, float | None]], *, client: TableClient | None, routes_cache: RouteCache, settings: Settings) -> tuple[dict[str, TravelEvidence], TravelSearch]`. Destinations come in nearest-first order.

`assess` rules:
- Round the origin with `routing.round_origin` first. Compute `straight_line_km` whenever the destination has a point.
- Chunk the destinations by `max_destinations`. Destinations past `max_candidates` get `routing_unavailable` with the reason `"Not routed: this comparison routes the nearest {n} centers only."`, and `complete` is False.
- The cache key is `"travel:" + sha256(json.dumps([dataset or "unversioned", mode, 2, origin, destination]))`. Cache only answered pairs, including null durations. Never cache failures.

State reasons (exact copy):

| Condition | State | Reason |
|---|---|---|
| mode `public_transport` | `unsupported_mode` | `No public-transport network or timetable is available; road times can't stand in for jeepney or bus trips.` |
| no client | `routing_unavailable` | `Route-based comparison isn't set up on this server.` |
| mode not in `client.modes` | `unsupported_mode` | `This server has no {mode} routing network.` |
| destination without a point | `origin_or_destination_unknown` | `This center has no confirmed map location.` |
| answered, duration null, or `NoSegment` | `no_route_in_network` | `The routing network has no route to this center; that doesn't prove it can't be reached.` |
| `RouteError(UNAVAILABLE)` | `routing_unavailable` | `Routes can't be checked right now.` |
| answered with a duration | `modeled_route` | `Modeled {mode} route without traffic.` |

- `endpoints_checked` means the origin snap is at most 1000 m and the destination snap at most 250 m. When the destination snap is beyond tolerance, the reason gains `" The road ends {d:.0f} m from the center; access from there is unconfirmed."`. For the origin: `" Your starting point is {d:.0f} m from the nearest road."`
- `within_budget` is False when a modeled duration is over the budget. It is True only when the duration is within the budget and `endpoints_checked` holds. Otherwise it is None.
- `TravelSearch.limitations` always includes `"Road durations are modeled without traffic."` when the method is `osrm_table`. It adds `"The routing dataset's version isn't recorded on this server."` when the dataset is empty, and for a `region_centroid` origin, `"A region's center stands in for your starting point; times are for regional browsing only."`

- [ ] **Step 1: Write the failing tests** with an `httpx.MockTransport` OSRM fake and the dict cache from `test_routes.py`.

```python
def test_modeled_route_and_budget(...)                          # 30-min route, 45 budget -> modeled_route, within_budget True
def test_null_duration_is_no_route_in_network(...)
def test_public_transport_is_unsupported_and_sends_nothing(...)
def test_no_client_is_routing_unavailable(...)
def test_unmapped_destination_is_unknown(...)
def test_origin_far_from_network_marks_every_route_unchecked(...)  # origin snap 3000 m -> endpoints_checked False, within_budget None
def test_partial_chunk_failure_keeps_answered_routes_and_caches_nothing_failed(...)
def test_candidates_past_bound_are_disclosed(...)              # complete False, reason as specified
def test_cache_key_has_no_coordinates_and_changes_with_dataset_and_mode(...)
def test_origin_rounded_before_request(...)                    # the fake sees 2-decimal coordinates
def test_mandatory_budget_rejects_region_centroid():           # ValidationError
```

- [ ] **Step 2: Run the tests and check they fail.**
- [ ] **Step 3: Implement `TableClient`, the settings and `assess`.** Add commented `RANKING_ROUTING_*` lines to `.env.example`.
- [ ] **Step 4: Run the tests, plus `test_routes.py` and `test_client_config.py`, and check they pass.**
- [ ] **Step 5: Commit:** `feat(routing): modeled travel times for ranking from an approved OSRM table service`.

### Task 6: The `service-logistics-v1` scoring policy

**Files:**
- Create: `backend/tesda_track/services/service_policy.py`
- Create: `backend/tesda_track/schemas/service_ranking.py` (`ServiceScore`, `RankingContext`, `NoResultReason`)
- Modify: `backend/tesda_track/services/personalization.py` (extract `weighted(factors, weights) -> tuple[effective, contributions, coverage, total]`, which `combine` then uses; `combine` itself doesn't change)
- Test: `backend/tests/test_service_policy.py`

**Interfaces:**
- `ServiceScore(policy_version: Literal["service-logistics-v1"], score: int | None (0–100), configured_weights, effective_weights, components: dict[str, ScoreFactor], contributions: dict[str, float], evidence_coverage: float, limitations: list[str])`
- `RankingContext(service_kind: Literal["training","assessment"], qualification_code, policy_version, evaluated_at: datetime, travel: TravelSearch | None, search_extent: str, service_window: dict[str, str | None], candidate_count: int, excluded_count: int)`
- `NoResultReason = Literal["no_registered_services","none_passed_mandatory_checks","only_unresolved","page_beyond_results"]`
- `service_policy.py`:
  - `VERSION = "service-logistics-v1"` and `WEIGHTS = {"access": 0.6, "practical": 0.4}`, the frozen engineering weights, documented as such in the module docstring
  - `access_factor(travel: TravelPreference | None, evidence: TravelEvidence | None, straight_line_km: float | None, maximum_distance_km: float | None) -> ScoreFactor`
  - `practical_factor(checks: list[tuple[str, bool | None, str]]) -> ScoreFactor`
  - `score(factors: dict[str, ScoreFactor], limitations: list[str]) -> ServiceScore`
  - `order_key(item_score: ServiceScore, evidence: TravelEvidence | None, service_date, stable_id: int) -> tuple`
  - `explanations(item_score: ServiceScore, evidence: TravelEvidence | None) -> list[str]`
  - `tradeoff(this: ServiceScore, next_: ServiceScore | None) -> str | None`

Rules (exact copy):
- `access_factor`:
  - With a travel budget B and a `modeled_route` whose endpoints are checked: observed `100 × max(0, 1 − t/B)`, reason `"Modeled {mode} time of about {t:.0f} min against your {B:g}-minute limit, without traffic."`
  - With a travel budget otherwise: unknown, with `evidence.reason`.
  - With travel but no budget: omitted, `"No travel-time limit was given; modeled times are shown but not scored."`
  - Without travel but with `maximum_distance_km`: observed `100 × max(0, 1 − d/max)`, `"Straight-line distance, for browsing only; not travel time."` If d is unknown: unknown, `"This center has no confirmed map location."`
  - Otherwise: omitted, `"No travel or distance preference was given."`
- `practical_factor`: no checks gives omitted, `"No practical preferences were given."` Otherwise the score is `100 × Σ(value or 0)/len`. The state is unknown when any value is None (reasons joined with "; "), else observed with `"Share of your stated practical preferences met."`
- `score`: when every factor is omitted, the score is None and the limitation is `"No travel or practical preferences were given; results are ordered by date and ID."` Contributions are rounded to 6 places, and `round(sum(contributions)) == score`.
- `order_key`: when the score is None, sort by (service date, id). Otherwise sort by (−score, usable duration or +inf, service date, id). A duration is usable only for a `modeled_route` with checked endpoints. A missing date sorts last.

- [ ] **Step 1: Write the failing tests.** `test_access_formula` (t=30, B=60 → 50.0); `test_unknown_route_keeps_denominator_share` (an unknown access with observed practical 100 gives the score `round(0.4*100)=40` and coverage 0.4); `test_no_budget_omits_access_and_renormalises`; `test_no_preferences_gives_null_score_and_date_order`; `test_contributions_reproduce_score`; `test_equal_scores_prefer_shorter_usable_duration`; `test_straight_line_is_labeled_browsing`; `test_existing_combine_unchanged` (re-run a known `personalization.combine` case).
- [ ] **Step 2: Run the tests and check they fail.**
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run the tests, plus `test_learner_assessments.py` and `test_ranking.py`, and check they pass.**
- [ ] **Step 5: Commit:** `feat(ranking): the service-logistics-v1 policy scores access and practical needs only`.

### Task 7: Training comparison under `service-logistics-v1`

**Files:**
- Create: `backend/tesda_track/services/service_ranking.py`
- Modify: `backend/tesda_track/services/ranking.py` (extract `training_candidates`; `rank_programs` keeps its behaviour, including `pending[:limit]`)
- Modify: `backend/tesda_track/schemas/ranking.py`, `backend/tesda_track/routers/recommendations.py`
- Test: `backend/tests/test_service_ranking_training.py`

**Interfaces:**
- `ranking.training_candidates(session, qualification, request, answers, evidence, now, near_lat, near_lon) -> tuple[list[tuple[TrainingProgram, float | None, EligibilityPublic]], list[UnconfirmedProgram]]`. This is the existing gate loop, unchanged, with nothing capped.
- `TrainingRankingRequest` adds:
  - `policy: Literal["current","service-logistics-v1"] = "current"`
  - `travel: TravelPreference | None = None`, which only works with the new policy (otherwise 422: `"Travel comparison uses the service-logistics-v1 policy."`)
  - `offset: int = Field(0, ge=0, le=10000)`
- `RankedProgram`:
  - `score: int | None`
  - adds `service: ServiceScore | None = None`, `travel: TravelEvidence | None = None` and `tradeoff: str | None = None`
- `UnconfirmedProgram` adds `travel: TravelEvidence | None = None`.
- `TrainingRanking`:
  - `weights` widens to `RankingWeights | PersonalizationWeights | dict[str, float]`
  - adds `total: int | None = None`, `unconfirmed_total: int | None = None`, `offset: int = 0`, `limit: int | None = None`, `context: RankingContext | None = None`, `no_result_reason: NoResultReason | None = None` and `accessible: Measure | None = None`
- `service_ranking.rank_training(session, request, learner, *, travel_client: TableClient | None, routes_cache: RouteCache, api_client_id=None) -> TrainingRanking`
- In the router, `rank_training` dispatches on `request.policy`. It injects `travel_access.table_client` and `routes.route_cache`.

Behaviour:
- The candidate point is the travel origin (2 decimals), else `near_lat`/`near_lon`, else the assessment preferences, as `rank_programs` resolves it.
- Call `assess` for every candidate in nearest-first order.
- With a mandatory budget: `within_budget` False excludes the candidate (it adds to `excluded_count`). None sends it to pending with the reason `"Travel time within your {B:g}-minute limit can't be confirmed: {reason}"`.
- Practical checks:
  - with answers: `personalization.practical_checks(answers, program)`
  - otherwise: delivery mode and scholarship from the request
- Learner alignment (interest, skill, career) and semantic similarity are never computed.
- Sort with `order_key`, then page results and pending by `offset`/`limit`. `total` and `unconfirmed_total` are counted before paging.
- `accessible`: value = the number within budget, known = usable routes, eligible = confirmed candidates. It is None without a budget.
- The audit's `preferences` holds `policy_version`, `travel: {mode, budget_minutes, budget_is_mandatory, origin_kind, routing_dataset}`, `offset`, `limit` and `total`. `near_lat`/`near_lon` are rounded to 1 decimal. Each result holds `program_id`, `score`, `contributions`, `travel_state` and `duration_min` rounded to whole minutes, and no coordinates.

- [ ] **Step 1: Write the failing tests.** Inject a fake `TableClient` through `app.dependency_overrides[travel_access.table_client]`.

```python
def test_faster_farther_center_outranks_nearer(...)        # acceptance 6
def test_router_outage_changes_state_not_minutes(...)      # acceptance 12: state routing_unavailable, duration None, baseline still ranks
def test_mandatory_budget_never_passes_on_straight_line(...)  # acceptance 7: no client -> all pending, none confirmed
def test_unmapped_center_with_mandatory_budget_is_unresolved(...)
def test_fit_is_not_counted_again(...)                      # changing interests/goal leaves scores unchanged
def test_failed_gates_cannot_be_rescued(...)                # expired authority / unavailable stay out (acceptance 4)
def test_candidates_beyond_first_page_compete(...)          # 120 programs, best is #115 nearest-first -> ranked first (acceptance 8)
def test_offset_past_total_reports_page_beyond_results(...)
def test_no_offerings_reason(...)                           # no_registered_services
def test_audit_has_no_fine_coordinates(...)                 # audit near_lat has 1 decimal; no origin in results
def test_current_policy_response_unchanged(...)             # policy omitted -> same keys and values as before this task
```

- [ ] **Step 2: Run the tests and check they fail.**
- [ ] **Step 3: Implement the extraction first** and run `test_ranking.py` and `test_training.py` to check it is green. **Then implement `rank_training`.**
- [ ] **Step 4: Run this task's tests, plus `test_ranking.py`, `test_pathway_report.py` and `test_mcp_recommend.py`, and check they pass.**
- [ ] **Step 5: Commit:** `feat(recommendations): compare training programs by modeled travel time`.

### Task 8: Assessment comparison under `service-logistics-v1`

**Files:**
- Modify: `backend/tesda_track/services/assessment_ranking.py` (extract `assessment_candidates`), `backend/tesda_track/services/service_ranking.py` (add `rank_assessments`)
- Modify: `backend/tesda_track/schemas/assessment_ranking.py`, `backend/tesda_track/routers/recommendations.py`
- Test: `backend/tests/test_service_ranking_assessment.py`

**Interfaces:**
- `assessment_ranking.assessment_candidates(session, request, qualification, answers, evidence, now, near_lat, near_lon, maximum_distance) -> tuple[list[tuple[AssessmentSchedule, int, float | None, EligibilityPublic, AssessmentSchedulePublic]], list[UnconfirmedAssessment]]`. This is the existing loop's gates, unchanged.
- `AssessmentRankingRequest` adds `policy` and `travel`, with the same rule as Task 7.
- `RankedAssessment`:
  - `score: int | None`
  - `personalization: PersonalizedScore | None`
  - adds `service`, `travel` and `tradeoff`
- `UnconfirmedAssessment` adds `travel`.
- `AssessmentRanking`:
  - `policy_version: Literal["assessment-center-v1","service-logistics-v1"]`
  - adds `context`, `no_result_reason` and `accessible`
- `service_ranking.rank_assessments(session, request, learner, *, travel_client, routes_cache, api_client_id=None) -> AssessmentRanking`. The router dispatches on `request.policy`.

Practical checks come from `assessment_ranking.logistics(request, schedule)` (fee and date) only. The training budget, delivery mode and start date are never read. `maximum_distance_km` stays a hard filter, as today. The service date is `scheduled_at`. The audit's `preferences` keeps `"service_kind": "assessment"`, so `GET /recommendations/{audit_id}` still reports `result_type: "assessment"`. Its other fields follow Task 7.

- [ ] **Step 1: Write the failing tests.** `test_faster_center_outranks_nearer_for_assessment`; `test_unknown_mandatory_fee_is_unresolved_not_scored` (acceptance 4); `test_training_budget_is_not_exam_fee` (acceptance 5); `test_full_schedule_excluded_under_new_policy`; `test_application_still_rechecks_after_ranking` (rank, fill the seats, then the application is refused; acceptance 11); `test_current_policy_response_unchanged`.
- [ ] **Step 2: Run the tests and check they fail.**
- [ ] **Step 3: Implement the extraction** and run `test_assessment_ranking.py` to check it is green. **Then implement `rank_assessments`.**
- [ ] **Step 4: Run this task's tests, plus `test_assessment_ranking.py`, `test_assessments.py` and `test_mcp_recommend.py`, and check they pass.**
- [ ] **Step 5: Commit:** `feat(recommendations): compare assessment schedules by modeled travel time`.

### Task 9: Training page uses travel comparison and shows the evidence panel

**Files:**
- Regenerate: `frontend/openapi.json`, `frontend/src/api/schema.d.ts` (`npm run api:types` in `frontend/`)
- Modify: `frontend/src/features/training/api.ts`, `address.ts`, `FilterPanel.tsx`, `Listings.tsx`, `Results.tsx`, `frontend/src/features/labor-market/api.ts`, `frontend/src/copy/en.ts`
- Create: `frontend/src/features/training/EvidencePanel.tsx`
- Test: `frontend/src/features/training/api.test.ts`, `EvidencePanel.test.tsx`, `TrainingPage.test.tsx`

**Interfaces:**
- `TrainingFilters` (address.ts) adds `travelLimit: 30 | 45 | 60 | 90 | null`, as the URL param `travel` (an invalid value reads as null).
- `FitRequest` adds `travelMode: TravelMode` and `travelLimit: number | null`.
- `ProgramFit` becomes `{ score?: number; explanation: string[]; travel?: TravelEvidence }`, where `TravelEvidence = components['schemas']['TravelEvidence']`.
- `fitQuery`:
  - When `place` is set and `travelMode` is not `plane`, it sends `policy: 'service-logistics-v1'` and `travel: { origin: { latitude, longitude, kind: 'public_place' }, mode: travelMode, budget_minutes: travelLimit, budget_is_mandatory: false }`, with the place rounded to 2 decimals.
  - Otherwise the body is exactly as today.
  - A `null` score maps to `undefined`.
  - Add `travelMode` and `travelLimit` to the query key.
- `evidencePanelQuery(code: string, region: string | null)` in `labor-market/api.ts` calls `GET /api/v1/labor-market/evidence`.
- `EvidencePanel({ code, region })` lists demand (posting records statement, forecast support with geography labels) and supply (each Measure's `statement`). It shows the panel's `limitations`. It renders `statement` rather than `value`, so a null never shows as 0.
- `Results.tsx` renders `EvidencePanel` when exactly one qualification is selected.
- `FilterPanel` adds a "Travel time limit" select (Any, 30, 45, 60, 90 minutes). It is enabled only when a place is typed, with the hint `"Type a place to compare modeled travel times."` With `plane` selected, the note reads `"Flight times are estimates and aren't used to compare centers."`
- `Listings` shows one travel line per program:
  - `modeled_route`: `"About {n} min by {mode} (modeled, no traffic)"`
  - any other state: the evidence's `reason`

Copy goes in `copy/en.ts`; other languages fall back to English through `i18n/translate.ts`, as existing keys do.

- [ ] **Step 1: Write the failing vitest tests.** api.test: the body carries the policy and travel when a place and limit are set, no travel for `plane`, and today's body without a place. EvidencePanel.test: a null posting value shows the "absence of evidence" statement and no "0". TrainingPage.test: the limit select is disabled without a place.
- [ ] **Step 2: Run the tests and check they fail.** `npm test -- --run src/features/training` in `frontend/`.
- [ ] **Step 3: Run `npm run api:types`, then implement.**
- [ ] **Step 4: Run `npm test`, `npm run lint` and `npx tsc -b` and check they pass.** Run Prettier only on the files you changed, and put back any rewrapped lines you didn't touch.
- [ ] **Step 5: Commit** the explicit paths: `feat(training): compare centers by modeled travel time and show qualification evidence`.

### Task 10: Baseline freeze, evaluation tooling and the evidence contract doc

**Files:**
- Create: `backend/evaluation/service_comparison.py`
- Create: `docs/center-recommendation-evidence.md`
- Modify: `docs/evaluation-and-release-checks.md` (link the new doc and tool)
- Add: `docs/ai-driven-center-recommendation-spec.md` (the spec, now tracked)
- Test: `backend/tests/test_service_comparison.py`

**Interfaces:**
- `ServiceCase(id: str, group: str, service_kind: Literal["training","assessment"], request: dict)` is a dataclass loaded from JSON.
- `freeze(session, cases, *, travel_client, routes_cache, now) -> dict` runs each case under the current policy and under `service-logistics-v1` on the same snapshot. It records `evaluated_at`, policy versions, `routing_dataset`, candidate IDs, both orders and the per-item travel states. It also records `timings_ms` per policy with the candidate count, and runs the new policy twice (cold routing, then a route-cache hit), so deterministic, cache-hit and cold-routing latency are reported separately. A `session.rollback()` after each case keeps no audit rows.
- `compare(frozen: dict, grades: dict[str, dict[str, int]], k: int = 3) -> dict` gives nDCG@k per policy (via `metrics.relevance`), unjudged counts, and `suggestions.paired_bootstrap` over the case means grouped by `group`.
- `journey_errors(frozen: dict, observed: list[dict]) -> dict` takes rows `{case_id, center_id, observed_min}` and returns `n`, `median_abs_error`, `p90_abs_error` (via `metrics.percentile`), `bias` and `route_coverage`.
- `main(argv) -> int` provides the subcommands `freeze --cases --out`, `compare --frozen --grades` and `journeys --frozen --observed`. It follows `evaluation/suggestions.py`'s entry point.

The doc covers:
- request and response examples for `/labor-market/evidence`, `/recommendations/qualifications` with `include_evidence`, and both rankings under `service-logistics-v1`
- the dedup and geography rules (Task 1)
- an inventory of the committed demand bundles, with dates and scopes
- a missingness table, field by field: training seats are never recorded, assessment schedules come only from providers, and headcount is absent
- the frozen policy weights and snap tolerances
- self-hosted OSRM setup for the car profile, through the `RANKING_ROUTING_*` env vars
- the evaluation protocol, mapped onto these subcommands, with the spec's criteria
- the external dependencies (reviewers, provider confirmations, observed journeys), stated as unmet

- [ ] **Step 1: Write the failing tests.** `test_freeze_records_both_policies_and_leaves_no_audit`; `test_compare_counts_unjudged_and_groups_bootstrap`; `test_journey_errors_median_p90_bias`.
- [ ] **Step 2: Run the tests and check they fail.**
- [ ] **Step 3: Implement the tool and write the doc.**
- [ ] **Step 4: Run the tests and check they pass.** Then run the full backend suite once: `.venv/Scripts/python.exe -m pytest -q`.
- [ ] **Step 5: Commit:** `docs: the evidence contract, routing setup and evaluation protocol for center recommendations` (with the spec and the tool).
