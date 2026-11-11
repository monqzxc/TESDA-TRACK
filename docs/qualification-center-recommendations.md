# Qualification evidence and center access

The Training & Assessment page adds qualification discovery and evidence to the existing map and listing interface. It uses the application's existing catalog matcher and optional semantic model; no new model training or LLM service is required.

## Learner workflow

1. Open **Qualification recommendations** in the Training & Assessment header. In **Find a qualification for your goal**, describe a job, career goal or skills and select **Find qualifications**. Requests run on submission. Each result shows the server's matching reason and whether semantic matching contributed. Closing the panel keeps the existing map workspace available.
2. Select **Compare centers** to filter the existing map/listings to that qualification. The submitted goal is used only for that choice. Area browsing and subsequent manual qualification changes do not inherit that goal.
3. Open **Demand and supply evidence** for dated posting observations, source-scoped forecast classifications and provision statistics. Expand supply details to distinguish listed provision, confirmed intake, published slots and remaining seats. Unknown capacity stays unknown.
4. Open **Explore other qualifications by area** to browse reviewed occupation-to-qualification links alphabetically. The evidence-area selection is independent of center filters, so it does not silently exclude neighboring regions. National fallback remains labeled national. Counts across qualifications can overlap.
5. With one qualification selected, open **Compare road access**, share an approximate location and choose a supported road mode and preferred one-way time. Comparison runs only on submission. It considers up to five currently matching sites, including the selected site, and discloses that subset. Choose **Show center** to use the existing details/map/directions workflow.

Training leads to provider contact. Assessment retains its existing application and server-side eligibility checks. A route, matching reason or saved comparison does not establish authority, prerequisites, current intake or a reserved seat.

## Evidence and access contracts

- `GET /api/v1/labor-market/qualifications?region_code=NCR&limit=20&offset=0` returns area evidence links, separate nullable posting counts and scoped forecasts. Only approved high-confidence mappings in active datasets and active qualifications are eligible. Observations cover the current calendar year through the evaluation date; their snapshot dates are returned. This is an evidence directory, not a ranking of workforce shortages.
- `GET /api/v1/labor-market/evidence?qualification_code=CSS-NC-II&region_code=NCR` returns typed posting, forecast and supply evidence, including known/unknown denominators, source identifiers, reference periods and limitations.
- `POST /api/v1/recommendations/service-access` accepts one qualification, an origin, a road mode, an optional time preference and up to eight unique catalog site references. The UI compares up to five. Sites and destinations are resolved on the server, not supplied as arbitrary URLs or destinations.

Road comparison reuses the existing configured OSRM adapter, shared upstream rate limit and route cache. Origins are rounded to two decimals before network/cache use. Only HTTP calls run in workers; session/cache operations stay on the request thread. Co-located training and assessment destinations share a routing request. No ranking audit containing the origin is written by this endpoint.

Results distinguish modeled routes, missing location, unsupported mode, network no-route, routing failure and busy routing. They include modeled duration/distance, a tri-state preference check, endpoint offsets and a checked time. They exclude traffic, transit schedules and confirmation of the final entrance connection. The adapter currently supplies no routing-network version; that limitation is explicit. Flight estimates are excluded. Travel comparisons expire in the browser after 60 seconds and are invalidated when their travel context changes. Qualification matches are invalidated when the draft goal or evidence area changes.

## Data activation and limits

No sample demand, provider verification or capacity is created by this feature. A successfully running endpoint can return no approved demand evidence. Use the existing [reviewed labor-market import/activation workflow](us20-setup.md) and [registry import workflow](registry-import.md) for the intended environment; source activation remains a separate audited maintenance operation.

Posting observations are dated records, not worker headcounts, live job guarantees or training-seat requirements. A national forecast does not establish municipal demand. Supply aggregates exclude known example sites/listings; incomplete source-backed records can count as recorded provision but do not independently establish registration or current availability. Existing `registered_training_*` API field names remain for compatibility and describe recorded non-example listings. Published training slots are not remaining training seats. The interface does not subtract postings from seats to claim a shortage.

The matcher falls back to existing catalog rules when the optional semantic model is unavailable. Missing routing leaves the existing center browser usable. Current authority, availability and learner prerequisites remain controlled by the existing [service-verification policy](service-verification.md).

## Verification

Use the configured disposable database whose name ends in `_test`; backend tests rebuild that schema. Run database-backed pytest processes sequentially.

```powershell
.\.venv\Scripts\python.exe -m pytest backend/tests/test_area_qualifications.py backend/tests/test_evidence_panel.py backend/tests/test_service_access_api.py backend/tests/unit/test_service_access.py backend/tests/test_labor_market.py backend/tests/test_demand_evidence.py backend/tests/test_supply_statistics.py -q
```

From `frontend`:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run api:types -- --check
npx.cmd playwright test tests/e2e/recommendations.spec.ts
```

Tests cover source scope, review revocation, deduplication, unknown values, separate evidence geography, goal isolation, stale request cancellation, permanent context invalidation, route failure states, association validation, API bounds and the integrated learner workflow. Synthetic evidence stays in isolated test fixtures. These checks establish software behavior; expert relevance, field travel-time accuracy and employment outcomes require the independent evaluation described in the [technical specification](ai-driven-center-recommendation-spec.md).
