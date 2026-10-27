# Personalized pathway report

At the end of **Find my pathway**, under the readiness verdict, learners get a report that explains the
recommendation: which pathway to consider, which units of competency to work on and why, what else to weigh, the
nearest listed options, the next steps, and a short summary. It appears in the React app (`/find/pathway`) and in
the Streamlit app's recommendation step.

The report is an explanation layer, not a second recommender. It calls the existing matching, readiness, route and
ranking services exactly as the finder does and writes templated sentences from what they return, the catalog, and
(signed in) the learner's own records. There is no LLM, no new table and no migration. Where data is missing (no
providers, no verification, no job data), the report says so instead of filling the gap.

## Sections

| Section | Fields in the response | Shown as |
| --- | --- | --- |
| A. Recommendations for you | `training_to_consider`, `skills_to_improve`, `competencies_to_learn_or_practice` | One card, with the region, delivery mode and scholarship controls |
| B. Why we recommend these | `reasoning` (strengths, skill gaps, career goal, assessment readiness, employment), `employment` | Card |
| C. Other things to consider | `considerations`, `providers` | Card, with up to three training and three assessment options |
| D. Your next steps | `next_steps` | Numbered list |
| E. Final recommendation | `final`, `disclaimer` | Card |

`readiness`, `match`, `strengths`, `route` and `rankings` (the audit ids) are there for the apps and for tracing a
report back to its evidence. Empty lists and sections aren't shown.

## API

`POST /api/v1/recommendations/report` works signed in or not. The body is the feedback endpoint's (the finder sends
both from the same state) plus where to look for options:

| Field | Meaning |
| --- | --- |
| `query`, `profile` | The goal and the profile the matches were asked with, follow-up answers included |
| `qualification_code` | The chosen qualification; unknown or inactive codes are rejected (422) |
| `answers` | Readiness answers by competency id. May be empty or incomplete: readiness is then unavailable and the report says so |
| `region_code` | Optional. Options are sorted by distance from the region's center; it is not a filter and isn't stored |
| `preferred_delivery_mode`, `needs_scholarship` | Optional training preferences, passed to the training ranking |

## Where each part comes from

| Part | Source of truth |
| --- | --- |
| Match strength and alternatives | `analysis.match_evidence`, as feedback uses it: same thresholds, model and keyword fallback |
| Readiness | `analysis.score_readiness` on the submitted answers (80% and 50% bands) |
| Route when readiness is missing | `analysis.pathway` (experience and certification) |
| Units of competency and their Basic, Common or Core category | The catalog, built from TESDA Training Regulations |
| Training options | `ranking.rank_programs`, unchanged weights, audited as usual |
| Assessment options | `assessment_ranking.rank`, given the region's center as a point (its `region_code` would filter) |
| Certificates, applications, goal target dates | The signed-in learner's own `certification`, `assessment_application` and `goal` rows |
| Jobs | The qualification's `possible_jobs` from its Training Regulation |

TESDA-TRACK has **no job-vacancy or labor-market data**. The qualification-demand reports count learner activity
on TESDA-TRACK, not employer demand, so the report doesn't use them for employment. Its employment section is marked
`observed_data: false`, cites the Training Regulation's jobs as general guidance, and points to PhilJobNet and the
local PESO.

## Rules

**Pathway.** The readiness level picks the recommended option, so the report agrees with the verdict above it:

| Situation | Recommended | Also shown |
| --- | --- | --- |
| A verified, current certificate for the qualification | You already hold it | Next level, when the catalog has one |
| A pending or approved application for an upcoming schedule | Prepare for your scheduled assessment | The options below |
| High readiness (80% and up) | Ask an assessment center about going straight to assessment | A refresher on any gaps (optional); the next level |
| Moderate readiness (50–79%) | Focused training on the gaps, then the assessment | Direct assessment, if the learner reported a year or more of experience or a certificate |
| Low readiness (below 50%) | A full training program, then the assessment | Direct assessment as above; the level below, when listed |
| No complete readiness check | The route's option (from experience), or none when experience is unknown | Training, not recommended |

Direct assessment is always worded as "ask an assessment center": the center decides, under its own requirements.

**Unit priority.** Core units carry the trade's technical work, so they come first. Within a priority, units are
ordered Core, Common, other, then Basic, and then in catalog order.

| Answer | Core | Common, Basic or other |
| --- | --- | --- |
| I am not familiar with this | High | Medium |
| I have some experience | Medium | Low |

This weighting is TESDA-TRACK's own guidance, not TESDA policy.

**Must learn.** A unit is "must learn" (`basis: required_unit`) only when it is listed for the qualification *and*
the learner answered "I am not familiar with this". "I have some experience" is a `reported_gap` to practice. A low
score alone never marks a unit required. For a learner heading straight to assessment, the core units they rated
confident are added as "be ready to show" (`general_recommendation`), since a self-rating isn't proof.

**Skills to improve** lists every reported gap. **Competencies to learn or practice** keeps the essential ones:
every "must learn", medium-priority practice, and the "be ready to show" units above.

**Options.** A training program or schedule the ranking scored is `confirmed`, meaning it has current verification
evidence. A listing in the ranking's `requires_verification` list is `needs_verification`, with the ranking's reasons. A
synthetic (development) record is `demonstration`. Fees, dates, hours, seats and scholarships appear only when the
listing has them, and assessment requirements only when they were reviewed on a verified schedule.

## Privacy

- The goal is used for matching and ranking only. The rankings' audits keep its keyed hash, as they always do. The
  report never repeats the goal and nothing logs it.
- The region's center is the only location used. The rankings round it to about 10 km. The response has distances in
  whole kilometres and no coordinates.
- Signed in, the report reads only the requesting learner's own records. A guest gets the same report without them.
- Each report adds two `ranking_audit` rows (training and assessment), so they count in the Overview report's
  `training_rankings`.

## Feedback

The existing "Are you satisfied with this recommendation?" prompt sits under the report and records the same numbers
as before. Its "The suggested pathway isn't helpful" reason now covers the report too. Feedback rows don't record
whether a report was shown, so compare satisfaction before and after the release by date.

## Tests

- `backend/tests/test_pathway_report.py` covers:
  - strong and weak learners, and three other qualifications
  - regions and preferences, assessment sorting, and no providers
  - no job data, missing or partial answers, and unmatched or other goals
  - a qualification without units, and unknown codes and regions
  - matching and rankings reused unchanged
  - unverified and demonstration listings
  - audits, feedback, and goal privacy
  - answers changing the advice
  - a signed-in learner's application, certificate and goal
- `backend/tests/unit/test_pathway_report_rules.py` covers the priority table (including Common units, which the
  test catalog lacks), ordering, the must-learn rule and the wording helpers. It needs no database.
- `frontend/src/features/finder/FinderPage.test.tsx` ("report") checks:
  - the sections and the request body
  - choosing a region
  - empty sections left out
  - an error with Try again
- `frontend/tests/e2e/finder.spec.ts` runs axe and the overflow check over the report on a phone and a desktop, in
  both themes.
- `classic/tests/test_ui.py` drives the Streamlit report against the API over HTTP.
- `classic/tests/test_frontend_states.py` checks, offline, that the Streamlit app asks for the report with the
  submitted answers for each readiness level.

## Limitations

- Learning activities are written per category and answer, not per unit.
- Training listings are whole programs. TESDA-TRACK has no module-level or refresher offerings, so the report asks
  learners to check with the provider.
- The report is in English only.
- `classic/portal_app.py` (the unfinished Streamlit redesign) doesn't show the report.
- Feedback can't tell reports apart by `policy_version`. Add a column when the wording changes enough to compare.
