# Phase 3 official-source research — 5 November 2026

Research outputs only. No frontend, model, database, recommendation ranking, commit, push, merge or deployment changes. Branch: `zyre-updates`. Existing 22 tracked/untracked files covered by the initial snapshot have identical hashes after research; HEAD unchanged. See `evidence/validation.json`.

## What is verified, and what is still missing

| Dataset | Records | Interpretation |
|---|---:|---|
| National 2025–2026 forecast | 442 | 354 in-demand + 88 hard-to-fill source occurrences; 397 exact title strings, 396 ignoring case. Repeated roles across sectors/classifications remain separate. |
| NCR-specific 2026 demand forecast | 0 | No sufficiently verified regional occupation list retrieved; header-only CSV is intentional. National evidence is never relabeled NCR. |
| Observed official Pasay postings | 20 | 19 distinct titles; October 14 or October 22, 2026. These are listing records, not 20 vacancies or proof of shortage. |
| Confirmed NCR workplace subset | 10 | Nine distinct city-government titles; assignment units establish Pasay location. The other 10 private-employer listings are published by NCR PESO but omit worksite confirmation. |
| Historical national DOLE classifications | 155 | Prior PDF-audited 2023–2025 classification rows; retained separately. |
| Historical NCR JobsFit groups | 7 | Older future-jobs groups; no inference of 2026 demand. |
| PSA shortage-table metadata | 19 | Inspected official API metadata, observations ending in 2022 or earlier despite 2026 update timestamps. |
| TESDA 2026 publications discovered | 6 | Official index verified; linked PDF contents not extracted, so these add zero verified demand occupations. |

The national CSV starts from the earlier `proposed_national_2025_2026_forecast.csv`. It retains exact printed titles, classifications, sectors, PDF/printed page references, and review flags. The attached PDF was previously visually audited; this run corroborated the publication's existence through BLE's official search index. Direct BLE access returned 403, so the live original download URL and file identity could not be independently reverified. The source URL in the output is explicitly a **publication index**, not a claimed PDF download. Publication label May 2025, forecast period 2025–2026, retrieval date November 2026 and PDF metadata dates are different concepts.

The source's adjacent PhilJobNet vacancy quantities refer to **2024**, not observed 2026 vacancies, and have not been imported as 2026 counts. Crosscutting joint ID/HTF entries remain separate and undisaggregated. No new national forecast occupation titles were verified beyond the starting audited dataset.

## Newly collected NCR evidence

[Pasay City official Job Openings](https://pasay.gov.ph/job-openings/) returned full HTML and permits public paths in robots.txt. The 10 private listings on the saved page are Utility Helper, Product Refiller, CCTV Operator, Field Customer Expert, Counter Bagger, Motorcycle Rider, Electrical Engineer, Finance Specialist, Truck Helper, and Warehouse Personnel (Project-Based). Employers are Wilcon Depot, Inc. and Rayomar Management, Inc. Date displayed: October 14, 2026.

The ten city-government listings dated October 22 cover Administrative Aide IV (Bookbinder II), Public Health Nurse I (two distinct plantilla items), Supervising Administrative Officer (Budget Officer IV), Administrative Aide III (Driver I), Community Affairs Assistant II, Medical Technologist I, Medical Specialist II (Part-Timer), Nurse I, and Administrative Aide V (Photographer I). Retain the two nurse items as separate records; do not accidentally count their title twice as distinct occupations.

Each CSV record includes its individual official URL, displayed date, source card number, publisher jurisdiction, workplace verification status, and saved HTML reference. Three linked detail pages were also retrieved. No application forms were submitted; no personal applicant data was collected. Vacancy quantities and closing dates are not provided in the captured listings, so vacancy_count stays blank and current_open_status is not_revalidated. A visible application form alone does not confirm the job remains open.

**Reuse limitation:** Pasay's footer says All Rights Reserved and no explicit open-data license was found. This is a limited factual research extraction under allowed public paths, not approval for bulk republication. Clarify data-sharing/reuse with PESO before production replication or systematic collection. Do not reproduce employer age criteria as recommendation filters.

## Additional official discoveries, quarantined from verified demand

`datasets/unverified_official_discovery_queue.csv` records ten leads with their source URLs and evidence limitations. DOLE-NCR indexed announcements include April/May Labor Day events, the September Handog ng Pangulo job fairs, and a June 16 Quezon City fair. Their totals describe events, sometimes with overseas recruitment, and are neither occupation-level nor necessarily NCR worksites. Do not sum overlapping announcement and outcome stories.

PhilJobNet's official search index includes November 4–5 postings and dated April NCR Cashier/Service Crew postings. These are **search-index leads only**, excluded from the verified posting dataset because direct portal/robots access returned 403. An older Welder listing describing UK recruitment was not accepted as NCR demand merely because the agency address was Manila.

Pasig's official September/October announcements link separate local and overseas vacancy lists. Direct automation stopped at a certificate verification failure when requesting robots.txt. No certificate checks were disabled and short links were not used to circumvent that failure. These remain follow-up leads.

TESDA's [2026 TSIR index](https://www.tesda.gov.ph/About/TESDA/27897) lists nuclear implementation, the AI economy, overseas migration, the retail workforce, swimming instruction, and cancer-care workforce reports. The six exact titles and linked Drive URLs are saved in `tesda_2026_publication_leads.csv`. Drive permits /file views but generally disallows arbitrary download/export paths in robots; no undocumented download shortcut was used. A 2026 publication label alone does not prove every underlying statistic is from 2026 or that a role is officially in demand. Request official accessible downloads or permission for full extraction.

PSA's [30 July 2026 survey-clearance release](https://psa.gov.ph/content/psa-clears-2026-occupational-wages-survey-and-2026-integrated-survey-labor-and-employment) says 2026 OWS/ISLE collection is scheduled September 14–December 31, with results expected July 2027. Do not invent released 2026 shortage statistics.

## APIs: actual tests

Full endpoint/authentication/rate/geography/fields findings are in `datasets/api_discovery_findings.csv`.

- **OpenSTAT: working public API.** GET catalog, GET table metadata, and POST queries returned HTTP 200 without credentials. Base: `https://openstat.psa.gov.ph/PXWeb/api/v1/en/DB/`. Inspected `1B/ISLE/OSS/` (19 shortage tables) and `1B/LFS/0121B3FEMP4.px` (occupation employment). The latter includes August 2026; it has no regional dimension and measures employment rather than vacancies. A one-cell August 2026 Total query returned a populated numeric value. The initial probe selected an unpublished/missing cell (`.`); the follow-up resolved August/2026/Total codes from metadata and succeeded. The numeric value is retained raw; no unit conversion or demand inference was made.
- [OpenSTAT documentation](https://openstat.psa.gov.ph/API-Documentation) states **10 requests per 10 seconds** per connection/user. Requests were spaced at least two seconds within scripted runs. JSON responses may carry a UTF-8 BOM; scripts handle it. Direct documentation HTML was blocked, although search-browser text was accessible and API endpoints worked. No workaround to the blocked HTML route was used.
- **PSA PSOC: token required.** [Official PSOC docs](https://psa.gov.ph/classifications-api/psoc) document `/psoc/2012/{major|sub-major|minor|unit|all}?token=...`. The base URL returned 404; the documented `/2012/major` data route without a token returned **400**, `Token is required.` No token was fabricated or requested on the user's behalf. No authenticated data call was made. Numerical rate quotas are not established. This is taxonomy, not occupational demand. The generic access guide contradicts itself about no-auth/token access and maximum page sizes; follow detailed token requirements and clarify quotas with PSA.
- [PSADA terms §5.4](https://psada.psa.gov.ph/terms-and-conditions-of-use2) require approval, a personal token, attribution and approved endpoints; they prohibit unauthorized scraping and bulk extraction outside them. Review applicable use/redistribution conditions before production integration. Do not generalize PSADA conditions into an unverified ban on OpenSTAT's separately published open-data service.
- **DOLE / PhilJobNet:** no current publicly documented developer API was verified. A BLE 2019 annual report mentions API maintenance, which does not establish a current public API or authorization. Robots probes returned 403; no guessed REST routes, authenticated endpoints or hidden application interfaces were tested.
- **ILOSTAT:** an official SDMX guide and current Swagger were discovered. The Swagger-host robots request returned **404**, and the conservative collector stopped before schema/data access. This is a local fail-closed policy, not a claim that robots 404 legally forbids access. Public data availability for Philippine occupations/NCR was not tested. No claim of a working ILO data integration is made.

## Mapping and validation

`forecast_mapping_proposals.csv` retains 232 prior candidate pairs spanning 68 distinct national title strings. `observed_mapping_proposals.csv` adds four **pending** posting-to-qualification pairs: Counter Bagger and Field Customer Expert → Customer Services NC II; Driver I → Driving NC II; Photographer I → Photography NC II. All codes exist in the current 319-entry catalog. None is approved. `observed_mapping_gaps.csv` identifies listings with no safe proposed match.

Do not map Electrical Engineer to Electrical Installation and Maintenance NC II, or nursing/medical roles to trade qualifications on title similarity. Do not map Motorcycle Rider to motorcycle repair. Prior forecast risks remain: Rigger may mean construction rigging or digital animation; Quality Control Officer may map to unrelated sectors; Maintenance Technician is too broad without duties. Require occupation, sector, work tasks, qualification scope and source review together.

Integrity checks cover 442 source rows, 354/88 classifications, 20 unique posting URLs, unchanged pre-existing files/HEAD, and branch zyre-updates (actual branch recorded as `zyre-updates`). Validation is research-only; application tests/model evaluations were not needed because the application was not changed. Raw response SHA256 manifests and request/response logs support auditability. Existing input file hashes and originals remain intact.

## Reproduce

From the repository root in PowerShell, use the existing project Python (httpx is already installed):

```powershell
.venv/Scripts/python.exe data-review/phase3/research-2026-11-05/scripts/build_datasets.py
.venv/Scripts/python.exe data-review/phase3/research-2026-11-05/scripts/document_research.py
.venv/Scripts/python.exe data-review/phase3/research-2026-11-05/scripts/validate_outputs.py
```

The first rebuilds output CSVs **offline** using saved HTML/metadata and the bundled prior audited input snapshots in `evidence/inputs/` (copied unchanged from `reports/labor-market-file-review-20261105/`). It does not recreate a missing prior PDF audit. The second refreshes discovery registers/manifests and checks preserved file hashes. Neither connects to or migrates a database.

For a new dated capture (supply a directory that does not yet exist):

```powershell
.venv/Scripts/python.exe data-review/phase3/research-2026-11-05/scripts/collect_official.py --mode api --out data-review/phase3/NEW-RUN-api
.venv/Scripts/python.exe data-review/phase3/research-2026-11-05/scripts/collect_official.py --mode pasay --out data-review/phase3/NEW-RUN-pasay
```

Collector uses default TLS verification, checks robots for each origin, waits at least two seconds per host, logs hashes/timestamps/request bodies/statuses, follows no automatic redirects, and stops on access/security/rate errors. It does not retry 429 automatically; inspect Retry-After and wait before a separate permitted run. A captured no-token PSOC 400 is an expected test outcome. Recheck current terms before rerunning; robots allowance does not itself grant reuse rights. Live pages may change, so refreshed captures require a new review before replacing this snapshot. Builds intentionally use the saved capture paths rather than silently ingesting new content.

## Integration recommendation after review

1. Store evidence as a separate, versioned research/market-information layer with source, geography, observation/forecast period, classification, verification level and reviewer status. Keep raw labels and separate normalized title aliases.
2. Join only approved occupation-to-catalog mappings. A catalog possible_jobs relationship is not itself evidence of labor demand. Keep uncertain, licensed-profession, grouped-title and sector-ambiguous mappings hidden until reviewed.
3. Initially display only an accurately sourced **National forecast, 2025–2026** indicator. Do not show NCR demand labels from this national report. If dated vacancies are later shown, label the posting date and worksite scope, keep counts separate, and expire/revalidate openings.
4. Keep scores/rankings/readiness and the E5 model unchanged. Fine-tuning is unnecessary for adding provenance-based market indicators; the present gap is evidence and mapping approval, not embedding training.
5. Obtain the DOLE-NCR 2026 regional consultation occupation matrix and local-worksite vacancy matrix via official accessible exports/data-sharing. Seek a documented PhilJobNet/PEIS access arrangement and approved PSA classification token/quotas. Extract TESDA's linked 2026 reports only through permitted downloadable files. No email, form submission, access request, or data integration was performed in this run.

This is a reproducible, bounded research snapshot, not an exhaustive census of Philippine vacancies. The principal unresolved gap is an independently verified NCR-specific 2026 demand/shortage occupation list with clear local-worksite coverage.
