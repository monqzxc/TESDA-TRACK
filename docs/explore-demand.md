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
Explore rules, qualification evidence, and map renderer selection. The UI includes
loading, retry, empty, filtered, pagination and no-location states.
