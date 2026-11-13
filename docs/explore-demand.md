# Explore map labor demand

The **In demand jobs** chip opens the demand panel even without a search or shared
location. A selected region filters evidence independently of the center map.

- **Jobs by area** reads active imported PhilJobNet posting snapshots through
  `GET /api/v1/labor-market/jobs`. Region, exact recorded locality and reviewed
  qualification filters are optional. Titles are ordered by distinct posting count;
  pagination does not change totals. Selecting a shaded region filters the list.
- **Qualifications** uses `/api/v1/labor-market/qualifications` to discover reviewed
  links, including clearly labeled national forecast support. A qualification can
  open its supply comparison directly.
- **Supply & demand** uses `/api/v1/labor-market/evidence` for posting observations,
  forecasts and recorded training/assessment provision, preserving unknown seats
  and evidence dates. Sample/example centers do not become real supply.

Without a search, jobs include all titles, including those without qualification
links. After a search, the initial job filter uses its first matched qualification;
the learner can choose another qualification or all recorded jobs. Qualification
filters always require approved high-confidence mappings. New searches reset that
filter. Coordinates and search text are not sent to these read-only endpoints.

The 4 November 2026 CSV contains **3,884 domestic posting records** across 17
regions; overseas and unspecified-region rows stay outside regional results.
Counts describe postings, not workers, live openings, demand levels or shortages.
Other portal snapshots are not included under the PhilJobNet source label.
The map shades actual region polygons in both renderers. A four-step yellow-to-rose
scale compares posting totals; missing records stay gray. Selecting a region filters
the job list. The legend retains the count range, scope, snapshot date and boundary
attribution. Region selection and city-list filters do not rescale the comparison.

Boundaries are the pinned PSGC 3Q 2026 low-resolution release from
[Faeldon's Philippines JSON Maps](https://github.com/faeldon/philippines-json-maps),
derived from PSA/NAMRIA via OCHA COD-AB. All 18 app region codes are mapped,
including NIR. `scripts/prepare_demand_boundaries.py` reproduces the bundled
GeoJSON; its source URL, hashes, rounding changes and upstream release are stored
beside the asset in `frontend/src/features/training/data/boundaries-source.json`.

## Supply and demand for one qualification

With a qualification in focus (the first match of a search, or one chosen in the demand panel), the page shows
where it is in demand, where it is offered, and what that means for the learner's own area.

- `GET /api/v1/labor-market/outlook?qualification_code=&region_code=&home_region_code=&relocate=` returns, for every
  region, the reviewed posting records, the recorded training and assessment centers, each share of the national
  total, and a **balance**: demand ahead (the region's share of postings is at least 1.5 times its share of centers),
  saturated (the reverse), balanced, or one side missing. Fewer than three records on either side is marked a rough
  signal. Supply is active programs, open assessment schedules and the registry's latest accreditations. It also
  returns the analysis in words, written by fixed rules from those counts: a short summary and the points behind it.
- **The brief** along the bottom of the map shows the headline, the balance, that summary, and the centers
  **recommended** from where the learner is: the nearest training center and the nearest assessment center listing
  the qualification. The recommendation is worked out in the browser; only region codes and the relocation choice
  are sent, never coordinates or search text.
- **Open to relocating** changes the wording, adds a center in up to two regions where demand is strongest against
  supply, and frames the whole country in the demand view. Off, the analysis stays on the learner's own region.
- **On the map** recommended centers carry a gold star and are never folded into a cluster. The demand view shades
  regions by that qualification's postings, pins its centers over them, and gives each region a badge with its
  balance mark (▲ demand ahead, ● balanced, ▼ saturated; outlined when one side has no records).

Example sites are reported beside supply and never counted, so a database with only seed sites shows no supply. A
demo can set `OUTLOOK_INCLUDE_EXAMPLE_SITES=true`; the analysis then says the counts include examples.

The summary can be rewritten by Claude (`GET /labor-market/outlook/summary`): set `OUTLOOK_AI_SUMMARY_ENABLED=true`
and `ANTHROPIC_API_KEY`. Off by default. Only the qualification's name, region names and the public counts are sent.
The paragraph is rejected if it holds a figure the counts don't, cached for a week, rate limited, and replaced by
the rules' summary on any failure. The balance is a rough signal for choosing where to train, not a shortage or
surplus estimate, and both versions say so.

## The map covers the window and stays on the Philippines

`/explore` has no top bar, padding or footer: the map fills the window at every size. The search bar and chips float
at the top, the results in a panel beside it (a sheet rising from the bottom on a phone), and the brief along the
bottom; the map's buttons, legend, credits and the Help button move clear of them. Both renderers limit the camera to
the view that fits the whole country in the clear part of the map (`mapLimits.ts`): it cannot be zoomed out past
that view or moved outside it, and the limit is worked out again when the window or the panels change.

## Data setup

CSV files alone do not populate the database. Import the prepared versioned bundles
and apply the portable reviewed release using the existing authorized reviewer,
as documented in [US-20 setup](us20-setup.md). These are separate, explicit maintenance
operations; page requests never import data or approve mappings. No new migration
or dependency is required for this feature.

On 12 November 2026 the local `tesda_track` development database was empty of
labor-market evidence. All 25 prepared bundles were loaded and the recorded release
was applied through its existing reviewer: 427 approvals, with other proposals
left pending/rejected and superseded dataset versions retired. This local setup
does not populate another deployment's database.

## Checks

Backend regressions: `test_area_jobs.py`, `test_area_qualifications.py`, and
`test_demand_evidence.py`. Frontend regressions: Explore demand integration,
Explore rules, qualification evidence, and map renderer selection. For the outlook: `test_qualification_outlook.py`,
`OutlookBrief.test.tsx`, `recommend.test.ts` and `mapLimits.test.ts`. The UI includes
loading, retry, empty, filtered, pagination and no-location states.
