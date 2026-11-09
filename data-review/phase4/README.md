# Phase 4: occupation-to-qualification mapping review

This is a research-only review for TESDA-TRACK. No application, database, model, ranking, catalog or frontend changes were made. Every mapping remains subject to user approval.

## Results

Counts are mapping rows, not distinct occupations, vacancies or labor-demand statistics. Repeated source occurrences remain separate.

| Cohort | High-confidence proposal | Needs manual review | Rejected proposal | Total |
|---|---:|---:|---:|---:|
| Original national forecast candidates | 50 | 176 | 6 | 232 |
| Original observed Pasay posting candidates | 2 | 2 | 0 | 4 |
| **All original candidates** | **52** | **178** | **6** | **236** |
| Additional national forecast candidates | 30 | 9 | 0 | 39 |
| **Combined reviewed dataset** | **82** | **187** | **6** | **275** |

For a later national-demand integration, the relevant high-confidence queue contains **80 national forecast mapping rows**. The other two high-confidence mappings relate only to dated Pasay postings and must not become national demand indicators.

Across the 442 forecast occurrences, 78 have a high-confidence proposal, 45 have only manual-review proposals, 317 have no candidate identified, and two have only rejected candidates. There are 67 distinct title labels ignoring case with at least one high-confidence relationship. No mapping is formally approved.

## Files to review

- `datasets/mapping_decisions_compact.csv`: the easiest decision table to scan. Includes all 275 original/additional mappings, source references, status, reasoning and evidence tier.
- `datasets/reviewed_original_236_mappings.csv`: all 236 original candidates, with catalog occupations, competencies, scope evidence, source periods/pages, individual decisions and original input row numbers.
- `datasets/additional_forecast_mapping_proposals.csv`: the 39 additional candidates, kept separate from the original set.
- `datasets/reviewed_mapping_dataset.csv`: complete combined evidence-rich dataset.
- `datasets/high_confidence_national_forecast_proposals.csv`: 80 national proposals for user review; not an approved import file.
- `datasets/high_confidence_observed_posting_proposals.csv`: two observed-posting proposals, explicitly separated.
- `datasets/needs_manual_review.csv` and `datasets/rejected_proposals.csv`: decision-specific queues.
- `datasets/forecast_occupation_coverage.csv`: every one of the 442 forecast occurrences and its reviewed coverage.
- `datasets/unmatched_forecast_occupations.csv`: 319 unmatched sector-specific source occurrences, covering 297 printed labels ignoring case. This includes a label that has a plausible proposal in another sector.
- `datasets/unmatched_titles_all_sectors.csv`: **296 distinct title groups** with no non-rejected proposal anywhere in this audit. This is the strict title-wide unmatched count.
- `datasets/forecast_occupations_without_high_confidence_mapping.csv`: broader follow-up queue, including occupations with plausible but unresolved candidates.
- `datasets/training_regulation_sources.csv`: 16 directly retrieved official PDF URLs, hashes and exact Section 1 PDF-page references.
- `datasets/source_id_collision_audit.csv`: source-ID collisions, preserved rather than silently rewritten.

The distinction between source occurrences and unique titles matters. An occupation can appear in several sectors or in both in-demand and hard-to-fill lists. It may be supported in one context and unresolved in another. “Unmatched” means this review did not identify a supported retained proposal; it does not prove that no TESDA qualification could ever be relevant.

## Review criteria and limits

**High-confidence proposal** means a clear occupation/qualification relationship is supported by a named catalog/TR occupation or an unambiguous functional synonym, relevant qualification competencies and compatible industry context. It is evidence of a training pathway relationship, not a statement that every worker needs that NC level, that an employer requires it, or that completing the qualification establishes professional licensure, hiring eligibility or readiness.

**Needs manual review** means specialization, duties, technology, role level, material, machine type or credential combination is unresolved. Broad title matching, shared keywords or a high embedding score do not resolve these questions.

**Rejected proposal** means the submitted relationship transfers a title across an incompatible functional scope or sector without supporting occupation evidence. Rejection applies to the proposed relationship in its recorded source context; new duty evidence could justify a different proposal later.

The national forecast supplies occupation titles, sectors and classifications, not detailed employer job descriptions. Actual occupation duties therefore cannot be independently verified for every forecast entry. The dataset explicitly records that limitation. Duties used to evaluate training relevance come from qualification scope/competencies; they are not invented vacancy descriptions.

All existing codes were checked against the current **319-entry catalog**, and the 236 original rows span 110 distinct qualifications including the observed-posting proposals. A catalog snapshot was retained for reproducibility. Sector comparison is functional: an in-house bookkeeper or web developer can work across employer industries, while a construction rigger and a digital-animation rigger perform different work.

Evidence tiers remain explicit:

- 16 official public PDFs were retrieved without form submission or access-control bypass; their Section 1 scope and occupation/competency pages were extracted. Critical rigging, retail-service and electrical-scope pages were also rendered and visually checked.
- Among the 236 original rows, 29 have independent official TR PDF evidence, one uses a draft-marked official-hosted PDF, and 206 rely on the existing catalog's TR-derived roles/competencies.
- Among all 82 high-confidence proposals, **24 have independent retrieved TR evidence and 58 are catalog-supported proposals**. High confidence does not imply independent live-PDF verification for all 82.
- The public Housekeeping NC IV copy is marked **DRAFT** despite a promulgation label. It is corroborative only; the related generic housekeeping-staff proposal remains manual review.
- Public documents may be older copies. This audit does not certify that every downloaded revision is the latest operative standard, or that every center currently offers it. Where an exact full TR could not be located publicly, the dataset identifies the catalog download ID and marks the independent document as not retrieved. No purpose/email download form was submitted.

No confidence percentages were fabricated and no AI/embedding threshold was used to approve candidates. Each original row is covered by an explicit review decision and a reason.

## Important decisions

### Rejected relationships

Six source-occurrence rows are rejected:

- Customer Service Representative in IT-BPM → Customer Services NC II: two original source occurrences. The proposed qualification is retail product selling/display and register work, rather than the contact-center role supported by Contact Center Services NC II.
- Customer Service Representative in public administration → Customer Services NC II: no retail/purchase-handling duties establish the proposed retail scope. The alternative contact-center proposal remains manual because public assistance is not necessarily a contact-center function.
- Quality Control Officer in IT-BPM → Handloom Weaving (Backstrap) NC II: the identical catalog title refers to textile production, not IT-BPM quality work.
- Maintenance Technician in Renewable Energy → Automotive Servicing NC I: the retrieved TR concerns periodic maintenance of motor vehicles, not renewable-energy plant equipment.
- Rigger in Construction → 3D Game Art Development NC III: the latter rigs digital game assets. The construction Rigging NC I proposal has direct TR support.

These are six rows rather than six unique title/qualification pairs because original repeated occurrences are retained.

### Relationships that need scope confirmation

- Generic Welder does not identify process, plate/pipe, material or NC level. All process-specific original proposals remain manual.
- Generic Heavy Equipment Operator does not identify the machine. All original machine-specific proposals remain manual. Bulldozer Operator is more specific and supports its corresponding bulldozer qualification.
- Manufacturing Maintenance Technician may refer to plant machinery or vehicle maintenance. The automotive proposal stays manual rather than being inferred from the generic title.
- Broad Automotive Technician/Mechanic does not select chassis, engine or electrical repair automatically.
- Refrigeration and air-conditioning titles need mobile/stationary, commercial/ice-plant and system details.
- The grouped `2D/3D/5D Animator` and activity-like `PV Systems Installations` source labels are unchanged and not silently split into new occupations.
- Customer Services NC II explicitly includes fast-food outlets and Service Crew. It is not automatically rejected for food services. Its scope is customer sales/register handling and food merchandising; counter versus kitchen duties must be confirmed.
- Cook/Chef, Housekeeping Staff, Nail Technician and other broad roles do not establish supervisory/managerial or advanced-specialist levels.
- Hatchery Technician requires aquatic versus poultry/livestock context before linking to Aquaculture (Hatchery Operation).
- Trainers Methodology proposals concern the teaching/assessment component. Domain qualifications, experience and other trainer credentials remain separate. Trade NCs alone do not establish trainer competence.

### Additional candidates

The 39 added rows include evidence-supported relationships for Bartender, Graphic Designer/Artist, Medical Coder, Orthotics/Prosthetics Technician, Waiter/Waitress, Front Desk Staff, Tour Guide, Rebar Worker, Scaffolding Installer, Warehouse Personnel, Bus Driver, Automotive Electrician, Automotive Maintenance Technician, Heavy Equipment Mechanic, Illustrator, Motion Graphic Artist, Microfinance Officer and retail sales/bagging/merchandising roles. Additional generic CNC, vehicle-class, reservation and broader logistics roles remain manual. Each new row retains the original forecast classification, sector and document reference.

The unmatched population includes many licensed/professional roles and broad operational titles. Do not map nurses, doctors, pharmacists or engineers to assistant/trade qualifications merely to increase coverage. Current-catalog coverage and labor-market relevance are separate issues.

## Source and catalog quality findings

1. **Original IDs are not unique.** There are 442 forecast occurrences but only 344 distinct record_id strings. Fifty-seven ID values collide across sectors. A join on record_id alone can attach the wrong occupation/classification. All original IDs remain unchanged. `source_occurrence_key` hashes source_id, original record_id, exact title, sector and classification; the 442 occurrence keys are unique. Future backend integration should use a reviewed compound/source-occurrence identity.
2. Customer Services NC II's public TR lists six Core units and two Electives. The current catalog includes those electives among Core units. This is flagged in relevant reviewed rows; no readiness/catalog correction was made in this task.
3. Rigging NC I's catalog possible_jobs contains a stray `TR HEAVY EQUIPMENT OPERATION` header. It must not become an occupation mapping. The genuine Rigger role is explicitly verified in the TR.
4. Visual Graphic Design NC III's catalog job list omits the detailed artist/designer roles that appear in the retrieved TR. The added graphic-artist/designer proposals use the TR evidence rather than inventing catalog titles.
5. EIM NC II's public TR describes building wiring/systems not exceeding 600 V. Generic catalog electrician labels must not be treated as evidence for all vehicle, utility or high-voltage work.

These are findings for review, not authorization to change the catalog, assessment logic or UI.

## Approval and later integration

Every row has `formal_approval_status=pending_user_review` and `approved_for_integration=false`, including high-confidence proposals. Blank user-review decision/notes/date fields are available in the full datasets. Review the **national** high-confidence queue first; accepting a relationship should also retain its scope limitations and evidence tier.

A later import should use explicitly approved mapping IDs only, preserve national geography and 2025–2026 forecast periods, retain original in-demand/hard-to-fill classifications, and use the new occurrence keys to avoid ID collisions. The four observed Pasay records are not national demand evidence. Do not automatically transfer demand from an associated occupation to every qualification, or change E5 scores/rankings/readiness based on this review.

No data was integrated, no badge was displayed, no migration was run, and no commit/push/merge/deployment occurred.

## Reproduce and verify

From the repository root, using the existing project Python:

```powershell
.venv/Scripts/python.exe data-review/phase4/scripts/review_mappings.py
.venv/Scripts/python.exe data-review/phase4/scripts/validate_review.py
```

The review builder is offline and reads the original canonical Phase 3 CSVs plus the saved catalog and downloaded evidence. It writes Phase 4 outputs only. It contains the explicit review decisions and additional-candidate definitions; it is not an automated matcher.

`fetch_evidence.py` can fetch missing files from the recorded official URLs. It checks robots for each origin, validates TLS, spaces requests at least two seconds apart and follows redirects only after checking the target origin. It does not submit TESDA forms, invent contact details or bypass blocks. It preserves existing saved PDFs and records retrieval URL/time/status/hash. Recheck site terms before any new collection.

Validation confirms all 236 originals are reviewed exactly once, all 275 proposed pairs use existing catalog codes, all 442 forecast occurrences retain their classifications/titles/sectors, no observed posting enters the national high-confidence queue, PDF hashes match and every formal approval flag remains false. All **400** protected application/research files and HEAD were unchanged on `zyre-updates`.
