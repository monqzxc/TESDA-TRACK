# Labor-demand data (snapshot 2026-11-04)

Employer-side demand for jobs, collected from public DOLE sources. TESDA-TRACK has no demand data of its own
(see `docs/pathway-report.md`). Nothing here is linked to TESDA qualification codes yet.

| File | Source | Rows | What it is |
|---|---|---|---|
| `philjobnet_vacancies_2026-11-04.csv` | [PhilJobNet](https://philjobnet.gov.ph/job-vacancies/) (DOLE-BLE) | 4,237 | Every public job posting on the list pages: title, employer, location, region, education, job type, salary, posting date |
| `philjobnet_postings_by_region_title_2026-11-04.csv` | derived from the file above | 1,836 | Postings and distinct employers per region × job title, with median stated salary |
| `careerinfo_ph_careers.csv` | [Career Info PH](https://cip.philjobnet.gov.ph/) (DOLE-BLE LMI division) | 124 | National in-demand (84), emerging (24) and green (16) job profiles: salary range, industries, qualifications, TESDA NC mentions |
| `jlmf_calabarzon_2026_2027_priority_occupations.csv` | DOLE Region IV-A, Jobs and Labor Market Forecast 2026–2027 | 142 | In-demand / hard-to-fill occupations by key sector, with qualifications and reasons |
| `skills_bridge_demand_2026-11-04.json` | Skills Bridge MCP (read-only demand tools) | – | Job-post demand as Skills Bridge holds it |
| `pdfs/` (git-ignored) | [DOLE IV-A JLMF compendium](https://sites.google.com/dole.gov.ph/employment-programs/home/jlmf) | – | The 2026–2027 and 2025–2026 JLMF reports |

## Read before using

- **PhilJobNet counts postings, not headcount.** The list pages don't show how many workers a post needs. The
  site only lists posts from the last 30 days (here 2026-10-05 to 11-04), so this is a one-month snapshot.
  NCR has 1,954 postings from 414 employers; 338 postings are overseas. Only 35% state a salary.
  Titles are as employers typed them; they are lower-cased for grouping but not mapped to PSOC.
  Region comes from the province after the last comma; NCR posts are listed by district.
- **The JLMF tables cover CALABARZON, not NCR.** They come from a DOLE multi-sectoral consultation held on
  2025-11-14, not from vacancy counts. Every row was checked against the page images. The 2025–2026 PDF is kept
  but was not extracted.
- **Career Info PH is a national list** curated by DOLE-BLE. Profiles carry no dates, and salaries are the ranges
  the site publishes.
- **Skills Bridge has effectively no demand data:** 3 job posts ever, all from July 2026.

## Not obtained

- The NCR and national JLMF. `ncr.dole.gov.ph` and `ble.dole.gov.ph` sit behind a Cloudflare browser check, so
  scripts can't fetch them. Ask DOLE-NCR, or download them in a browser.
- Bossjob's hiring data from the TESDA Skills Passport partnership. It isn't published; request it from TESDA-NCR.

## Refreshing

The collectors are in `scripts/labor_demand/`. Run them with `.venv/Scripts/python.exe -I -X utf8`. Keep downloads
in a separate folder from the scripts, then rebuild with `build_outputs.py <raw_dir> <this_dir> <date>`.
`philjobnet_vacancies.py` takes about an hour (around 430 pages, 1.5 s apart, one at a time) and resumes if
interrupted. It reads list pages only, never job detail pages, so no contact details are collected.
