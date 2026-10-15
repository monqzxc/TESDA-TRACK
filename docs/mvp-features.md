# TESDA-TRACK MVP feature list and status

Prepared 14 October 2026 from the [project roadmap](../README.md#roadmap) and [learner user stories](user-stories.md), as requested. The companion [ERD](mvp-erd.md) maps these features to the current database design.

The MVP helps a learner describe a career goal, find a TESDA qualification, check self-reported readiness, locate relevant training or assessment services, and track their next steps. Guests can explore; accounts enable durable records. Administrators manage delivery information, assessment outcomes, and aggregate reporting.

## How to read the statuses

| Status | Meaning |
| --- | --- |
| Implemented | Supporting code and/or current implementation documentation exists in this working tree. This is not a claim of deployment or acceptance-test completion. |
| Partial | A usable foundation exists, but the full feature or user-story acceptance criteria remain incomplete or unverified. |
| Proposed | The requested workflow is described in the backlog but was not found in the active application during this review. |
| Deferred | P2 expansion or an explicitly excluded capability; not part of the recommended initial MVP completion scope. |

Statuses are a source-code review snapshot, including local uncommitted changes. No live deployment, database migration state, external credentials, or end-to-end acceptance tests were checked for this document. The active application is `frontend/app.py`; functionality in the alternate `frontend/portal_app.py` alone does not establish completion in the active application.

## Roadmap features

These are the baseline capabilities described by the five-part roadmap. The roadmap marks all five backend parts Done; this table breaks them into reviewable features. Story-level gaps are recorded separately below, so an implemented backend capability does not imply that every related learner interaction is complete.

| ID | Feature | Actor | Status | Scope and evidence | Main entities |
| --- | --- | --- | --- | --- | --- |
| F01 | Qualification catalog | Guest, learner, admin | Implemented | Browse qualifications, sectors, possible careers, and competencies. Catalog models, qualification API, seed/import support, and active library UI exist. | `sector`, `qualification`, `competency` |
| F02 | Learner registration and authentication | Learner, admin | Implemented | Register, sign in/out, use learner/admin roles, and access owned records. See authentication router, security helpers, and account UI. | `learner` |
| F03 | Career-goal matching | Guest, learner | Implemented | Enter English, Filipino, or Taglish goals; receive qualification matches, explanations, and follow-up questions. Keyword matching supports fallback when local semantics are unavailable. | `qualification`, `qualification_embedding`, `recommendation_session` |
| F04 | Suggested qualification pathway | Guest, learner | Implemented | Guide learners toward training and assessment, assessment readiness, or a skill-gap check using profile information. See pathway models and recommendation services. | `pathway`, `pathway_step`, `recommendation_session` |
| F05 | Readiness self-assessment | Guest, learner | Implemented | Rate competencies and view strengths, gaps, advice, and a self-reported score. Signed-in submissions can be saved. Full draft/result handling remains in US-06. | `readiness_check`, `readiness_answer`, `competency` |
| F06 | Saved recommendation history | Learner | Implemented | Store signed-in goals/profile, matches, selected qualification, and pathway snapshots. Guest conversion and one-click resume are separate gaps. | `recommendation_session` |
| F07 | Personal career goals | Learner | Implemented | Maintain goals with optional target qualification/date and active, achieved, or archived status. | `goal` |
| F08 | Certification records | Learner, admin | Implemented | Maintain self-reported credentials and distinguish assessment-linked verified records. Verified records have protected editing rules. | `certification`, `assessment_application` |
| F09 | Personal data export and account deletion | Learner | Implemented | Export learner-owned records and delete the account. Ranking audit links are anonymized; this is not a promise that every anonymous aggregate is erased. | Learner-owned entities, `ranking_audit` |
| F10 | Training provider and program discovery | Guest, learner | Implemented | Search/filter providers and programs; inspect delivery mode, schedules, costs, scholarships, and contact details. | `region`, `training_provider`, `training_program` |
| F11 | Assessment center and schedule discovery | Guest, learner | Implemented | Inspect assessment centers, dates, fees, and schedule status. Listing visibility alone does not establish confirmed eligibility or availability. | `region`, `assessment_center`, `assessment_schedule` |
| F12 | Assessment applications and outcomes | Learner, admin | Implemented | Submit/withdraw applications; administrators review, record results, and support linked certificates. Capacity and eligibility checks exist. Review/receipt UX remains partial under US-09. | `assessment_application`, `assessment_schedule`, `certification` |
| F13 | Pathway progress tracking | Learner | Implemented | Follow a curated pathway and track individual steps and completion. This is pathway tracking, not enrollment at a training institution. | `pathway_enrollment`, `step_progress` |
| F14 | Location-based search | Guest, learner | Implemented | Region/manual-location and nearby discovery with PostGIS distance calculations, lists, and maps. End-to-end map-failure/accessibility validation remains under US-08 and US-13. | `region`, `training_provider`, `assessment_center` |
| F15 | Explained training rankings | Guest, learner | Implemented | Rank programs using configured evidence, show component explanations, handle missing evidence, and retain ranking snapshots. See [structured scoring](structured-assessments.md). | `training_program`, `ranking_audit`, `training_program_embedding` |
| F16 | Skills Explorer / Skills Bridge integration | Guest, learner | Implemented | Read-only skill and occupation lookups, related qualifications, and returned international mappings. Requires configured upstream credentials; live availability was not checked. | `cache_entry`; external API results |
| F17 | Delivery and pathway administration | Admin | Implemented | Administrative APIs manage providers, programs, centers, schedules, pathways, and steps. A complete dedicated administrative UI is not implied. | Delivery and pathway entities |
| F18 | Reporting and analytics | Admin | Implemented | Overview, learner funnel, qualification demand, competency gaps, regional supply, and daily matching/no-match counts. | Existing learner/delivery records, `match_daily_stat` |

Evidence: [catalog and models](../backend/tesda_track/models/), [API routers](../backend/tesda_track/routers/), [services](../backend/tesda_track/services/), [active application](../frontend/app.py), and [training UI](../frontend/training_view.py).

## Current additions supporting the MVP

These capabilities appear in newer working-tree documentation and code. They extend the original roadmap and help satisfy the user stories; they are shown explicitly rather than being mistaken for unimplemented proposals.

| ID | Feature | Actor | Status | Scope and remaining qualification | Main entities |
| --- | --- | --- | --- | --- | --- |
| F19 | Optional structured learner assessment | Guest, learner | Implemented | Capture interests, skills, goals, and practical preferences; support transient guest answers and saved immutable revisions. Migration `0007` exists; deployment state was not checked. See [workflow and API](structured-assessments.md). | `learner_assessment`, `recommendation_session`, `ranking_audit` |
| F20 | Service verification and prerequisite checks | Admin, learner | Implemented | Store qualification-specific site evidence, review/validity dates, availability, and requirements; distinguish confirmed and unconfirmed services. Evidence import exists, but an approved production dataset is not established by code. See [verification](service-verification.md). | `service_verification`, `training_program`, `assessment_schedule` |
| F21 | Assessment-center comparison and ranking | Guest, learner | Implemented | Compare eligible schedules using fee/date/location preferences, show explanations, and link to application tracking. See [assessment-center ranking](assessment-center-ranking.md). This differs from the deferred qualification shortlist in US-05. | `assessment_schedule`, `service_verification`, `ranking_audit` |

## User-story completion status

Priorities retain the backlog's meaning: **P0** protects trust and completion; **P1** improves the core journey; **P2** expands the experience. These are implementation assessments, not acceptance sign-offs. The 8 October backlog predates some current code: for example, pagination and grouped readiness are now present, although their whole stories are not complete.

| Story | Feature | Priority | Status | Evidence and remaining work |
| --- | --- | --- | --- | --- |
| US-01 | Clear first visit and starting action | P1 | Partial | Landing page, editable examples, guest finder, and guided steps exist. Demonstrate all empty-input, goal-edit, and stale-answer-reset criteria before closure. |
| US-02 | Save a journey started as a guest | P0 | Proposed | The active `sign_in()` handler establishes authentication but does not convert the previous guest journey into saved session/readiness records. Add explicit save intent, persistence, and safe recovery from uncertain writes. |
| US-03 | Understand and correct recommendations | P1 | Partial | Reasons, profile/follow-up input, selection, and no-match behavior exist. Verify manual-choice labels, unknown-certificate wording, and clearing unrelated readiness results. |
| US-04 | Manageable qualification library | P1 | Partial | Active library has search, sector filters, pagination, and clear filters. Add the NC-level filter and exact qualification-ID/code handoff; the current library action passes a name into exploration. |
| US-05 | Compare two or three qualifications | P2 | Deferred | No active qualification shortlist/comparison workflow was found. Implement session-only selection after the core journey; persistent cross-device saving is outside this story. |
| US-06 | Grouped readiness with reliable drafts | P1 | Partial | Active form groups competencies and shows progress plus Previous/Next. Complete or verify unanswered-item feedback, stale-result labelling, and retention of the last submitted result during failed recalculation. |
| US-07 | Carry the qualification into opportunities | P1 | Partial | Pathway-to-center actions and defaults exist. Demonstrate exact qualification/type handoff after a previous search and preservation of location and readiness when returning. |
| US-08 | Find centers without depending on the map | P1 | Partial | List/manual filters and center details exist. Validate denied-location and failed-map behavior, keyboard access, missing-coordinate discovery, and unknown versus zero fee labels. |
| US-09 | Review an application and see its outcome | P1 | Partial | Submission, status, notes, withdrawal, and capacity checks exist. Active schedule actions submit directly, and progress withdrawal is direct. Add pre-submission review, reference/receipt navigation, and specific withdrawal confirmation. |
| US-10 | Resume the next useful step | P1 | Partial | Progress/history records exist. Add a continuation card, saved-session restoration by ID, and documented ordering for the next applicable action. |
| US-11 | Compare readiness over time | P2 | Deferred | History is available, but comparable same-qualification check selection, deltas, and questionnaire-change handling remain expansion work. |
| US-12 | Show verified, incomplete, and example data | P0 | Partial | Service evidence, expiry, availability, and UI helpers now exist (F20). Confirm complete qualification/center source coverage and visible fixture notices; approved real service data and full acceptance evidence remain unresolved. |
| US-13 | Complete core tasks by keyboard and phone | P0 | Partial | Responsive styling and native labelled controls exist. The full 390 px, 200% zoom, keyboard, contrast, and screen-reader audit was not established in this review. |
| US-14 | Recover without losing or duplicating work | P0 | Partial | API error handling, retry states, and session retention exist. Validate failure recovery across matching, readiness, saving, and applying; reconcile uncertain writes before retrying. |
| US-15 | English/Filipino interface guidance | P2 | Deferred | Filipino/Taglish goal matching exists; a translated interface with language selection and reviewed bilingual copy was not found. |

Source acceptance criteria: [US-01 through US-15](user-stories.md#stories). Partial stories must be checked against every original criterion before changing their status to Implemented.

## Recommended MVP completion order

1. **Protect trust and saved work (P0):** finish guest-to-account saving, verification/source coverage, accessibility checks, and reliable error/write recovery (US-02, US-12, US-13, US-14).
2. **Finish selection and preparation (P1):** close first-visit, recommendation, library, grouped-readiness, qualification handoff, and map-independent discovery gaps (US-01, US-03, US-04, US-06, US-07, US-08).
3. **Finish acting and returning (P1):** add application review/receipt/withdrawal confirmation and saved-journey continuation (US-09, US-10).
4. **Expand after the pilot journey is reliable (P2):** qualification comparison, readiness comparisons, and translated interface guidance (US-05, US-11, US-15).

Apply P0 checks to every release slice. Before presenting real opportunities, establish reviewed service evidence and make unknown/example data explicit. Readiness and fit scores do not constitute official competency results, guaranteed employment, or guaranteed admission.

## Explicitly outside this MVP scope

| Capability | Status | Scope boundary |
| --- | --- | --- |
| Training-institution enrollment and tuition/payment collection | Deferred | Pathway enrollment and assessment applications do not implement these transactions. |
| Email/SMS notifications | Deferred | Not included in the user-story scope. |
| Cross-device partial drafts and saved qualification shortlists | Deferred | Require additional persistence and product decisions. |
| Automated official eligibility decisions or live TESDA certificate authentication | Deferred | The app checks stored evidence; source review remains an administrative responsibility. |
| Formal personality testing, guaranteed employment, or qualification equivalency certification | Deferred | Outside the recommendation and readiness purpose. |

The [ERD](mvp-erd.md) therefore does not invent payment, notification, provider-account, or shortlist tables.
