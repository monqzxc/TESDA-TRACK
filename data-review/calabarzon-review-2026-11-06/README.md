# CALABARZON 2026–2027 mapping review

Reviewed 6 November 2026. These are occupation-to-training relationships, not job vacancies, headcounts, official TESDA/DOLE endorsements or guarantees of hiring eligibility.

## Results

All 25 original candidates were individually reviewed. Ten are high-confidence training relationships, ten remain context-dependent and five are rejected for this source occurrence.

- Eight supported **in-demand** links were approved in the isolated local preview using the existing authorized reviewer and audit service.
- Two high-confidence **hard-to-fill** classification links remain pending and excluded from recommendations, per the user's display requirement.
- Ten ambiguous links remain pending. Degree/experience requirements, industrial/advanced tasks or catalog currency prevent unconditional activation.
- Five inappropriate candidates were rejected: two Plumbing NC I links against an explicit NC II requirement, and three contact-center links to retail/hospitality customer-service occurrences without evidence of a contact-center channel.

Approved relationships cover Bagger, Warehouse Personnel (two sector occurrences), construction Electrician, Plumber, manpower-agency retail Cashier, Cook and retail Merchandiser. Qualification scope, source education/experience requirements and any required merchandise electives remain applicable.

The 25 rows are classification-specific mapping records, not 25 distinct jobs. Different Cashier/Merchandiser/Electrician occurrences have different requirements; decisions are occurrence-specific.

## Source verification

- Official DOLE IV-A compendium: https://sites.google.com/dole.gov.ph/employment-programs/home/jlmf
- Public compendium spreadsheet: https://docs.google.com/spreadsheets/d/105U-0GK7pC_8Toj1aGbYCPSouEXlPkuaD7aStnAARDI/htmlembed
- Original forecast PDF: https://drive.google.com/file/d/1X1zTC5KfxGpJ3W4FXgvrd6EX2c6h5SKu/view
- Forecast PDF SHA-256: `793365290995c681af4fd7665bb9197096a5aece5472ab1b129c9ef2ea3a4767`, 70 PDF pages.

Re-extracting the official report using Prince's existing extractor reproduced all 142 CSV rows exactly, including checkbox classifications, source pages, deployment and qualification cells. The eight PDF pages relevant to these 25 candidates were visually inspected: PDF pages 39, 40, 42–44, 46, 48–49 (printed pages are PDF page minus four).

TESDA Section 1 scope, occupation lists and competencies were checked using existing hash-verified official TR captures for Customer Services NC II, Contact Center Services NC II, Warehousing Services NC II and EIM NC II. Newly downloaded official TRs verify Plumbing NC II, Cookery NC II, Warehousing Services NC IV, Automotive Servicing (Electrical Repair) NC II and the legacy Web Development NC III.

TESDA Board Resolution 2024-14 records amendment of Web Development NC III into Web Design, Web Development (Front-End) and Web Development (Back-End) qualifications: https://www.tesda.gov.ph/boardreso?page=4 . Existing catalog/model behavior was preserved; catalog currency is flagged in the two regional web-development proposals, not silently corrected here.

Strong competency relevance alone does not replace source-required degrees or experience. Those cases remain manual rather than being falsely rejected as completely unrelated. Retail customer-service candidates should be reconsidered against Customer Services or hospitality qualifications, without automatically approving a replacement.

## Files and reproduction

- `reviewed-mappings.csv`: all 25 decisions, full reasoning, source requirements/deployment, competencies, exact PDF/table references, URLs and TR hashes.
- `decisions.json`: portable occurrence/qualification decisions; no database-specific mapping IDs.
- `summary.json`: review and application counts.
- `evidence/source-validation.json`: exact 142-row CSV comparison.
- `evidence/api-verification.json`: current regional API checks.
- `evidence/tr-downloads.json`: additional official TR URLs and fingerprints.
- `raw/` and page PNGs: local supporting captures; keep large raw files out of ordinary code commits.

From the repository root:

```powershell
.\.venv\Scripts\python.exe -X utf8 scripts/review_calabarzon_mappings.py
.\.venv\Scripts\python.exe -X utf8 scripts/review_calabarzon_mappings.py --apply
```

Default generates the reviewed artifacts without database writes. --apply is explicitly restricted to localhost and `tesda_track_phase5_preview`; it is not a production deployment command. It imports immutable reviewed source version 2, applies supported decisions through the existing audit service, activates v2 and retires v1 while retaining its original pending records for audit. Repeating identical reviewed input is idempotent. The two supported hard-to-fill rows intentionally stay pending.

The v2 bundle is `backend/seed/sources/labor_market/dole-iva-jlmf-2026-2027-v2/`. V1 and the original Phase 3/4 research files were not rewritten. No migrations, frontend edits, model training, catalog edits, commits, pushes or merges were performed for this review.

## Checks

The active v2 has 8 approved, 12 pending and 5 rejected mapping records. All eight approved records are in-demand, covering seven distinct occupation titles and five TESDA qualifications. API checks confirm the new construction-electrician evidence appears with IV-A selected, keeps regional coverage and 2026–2027 period, and is absent from NCR and unspecified-region forecast results. National evidence remains separate.
