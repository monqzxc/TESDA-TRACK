# TESDA-TRACK: feature inventory and user stories

Reviewed 20 October 2026 against the current working tree.

TESDA-TRACK helps people turn a career goal into a TESDA qualification, assess their self-reported readiness, find training or assessment services, and track their next steps. The project also supports administrators, data maintainers, and partner systems.

This document groups the project into **30 features and 100 user stories**.

This inventory describes capabilities found in the source code, including local changes. It is not a deployment or acceptance-test sign-off. The React interface, classic Streamlit interface, backend APIs, and maintenance commands have different coverage; those differences are identified below. External services, configured models, and reviewed registry data may be required.

The existing [learner experience backlog](user-stories.md) and [MVP review](mvp-features.md) are earlier snapshots. This document supplements them without changing their story IDs or completion statuses. `FS-XX.Y` identifies a story in this inventory; it does not imply that the story is newly requested development work.

## Actors

| Actor             | Meaning                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Guest             | A visitor exploring without an account.                                                                                         |
| Learner           | A person choosing qualifications and preparing for training or assessment; saving personal records requires sign-in.            |
| Administrator     | A privileged account managing delivery records, assessment outcomes, and reporting.                                             |
| Data maintainer   | A person using import and maintenance commands; this is an operational responsibility, not a separate application account role. |
| Model maintainer  | A person preparing and evaluating the local matching model; this is not a learner-facing role.                                  |
| Partner developer | A developer integrating an authorized external system through the read-only MCP service.                                        |

## Feature index

“React” means a screen or interaction was found in the current React source. “Classic” means the classic interface contains the workflow. “API” or “CLI” identifies capabilities that should not be assumed to have a dedicated React management screen. “Optional” means configuration or an external dependency is involved.

| ID  | Feature                                                 | Main actors                     | Surface / availability                                  |
| --- | ------------------------------------------------------- | ------------------------------- | ------------------------------------------------------- |
| F01 | First-visit guidance and guest exploration              | Guest, learner                  | React, classic                                          |
| F02 | Accounts, authentication, and access control            | Learner, administrator          | React, API; profile/password changes through API        |
| F03 | Qualifications library                                  | Guest, learner                  | React, classic, API                                     |
| F04 | Career-goal interpretation and qualification matching   | Guest, learner                  | React, classic, API; semantic matching optional         |
| F05 | Structured interests, skills, and practical preferences | Guest, learner                  | Classic, API; full questionnaire not found in React     |
| F06 | Competency readiness self-assessment                    | Guest, learner                  | React, classic, API                                     |
| F07 | Recommended pathway and next-step guidance              | Guest, learner                  | React, classic, API                                     |
| F08 | Saved journeys and continuation                         | Learner                         | React, API                                              |
| F09 | Pathway step tracking                                   | Learner                         | React, classic, API                                     |
| F10 | Personal career goals                                   | Learner                         | React, API; extended management through API             |
| F11 | Certification records                                   | Learner                         | React, API; extended management through API             |
| F12 | Training provider and program discovery                 | Guest, learner                  | React, classic, API                                     |
| F13 | Explained training-program rankings                     | Guest, learner                  | React, classic, API                                     |
| F14 | Assessment schedules and center comparison              | Guest, learner                  | React schedule discovery; classic/API comparison        |
| F15 | Nearby search, maps, and travel directions              | Guest, learner                  | React, classic, API; map/routing services optional      |
| F16 | Service evidence, availability, and prerequisite checks | Guest, learner                  | React, classic, API                                     |
| F17 | Assessment applications and withdrawal                  | Learner                         | React, classic, API                                     |
| F18 | Readiness history and comparison                        | Learner                         | React, API                                              |
| F19 | Skills Explorer                                         | Guest, learner                  | React, classic, API; optional Skills Bridge integration |
| F20 | Privacy information, data export, and account deletion  | Guest, learner                  | React, classic, API                                     |
| F21 | Responsive navigation and display preferences           | Guest, learner, administrator   | React                                                   |
| F22 | Error recovery and reliable saving                      | Guest, learner                  | React, API                                              |
| F23 | Training provider and program administration            | Administrator                   | Administrative API                                      |
| F24 | Assessment administration and recorded outcomes         | Administrator                   | Administrative API                                      |
| F25 | Curated pathway administration                          | Administrator                   | Administrative API                                      |
| F26 | Registry imports and service-evidence maintenance       | Administrator, data maintainer  | CLI, administrative API                                 |
| F27 | Reporting and analytics                                 | Administrator                   | React, classic, API; matching diagnostics through API   |
| F28 | Matching-model and integration maintenance              | Administrator, model maintainer | CLI, administrative API, training tools                 |
| F29 | Partner catalog and recommendation integration          | Partner developer               | Read-only MCP, OAuth                                    |
| F30 | Partner credentials and usage oversight                 | Administrator                   | CLI, administrative API                                 |

## Guest and learner stories

### F01 — First-visit guidance and guest exploration

The home page explains the journey and provides an entry point for a career goal.

- **FS-01.1:** As a first-time visitor, I want to understand how TESDA-TRACK helps me choose a qualification so that I know where to start.
- **FS-01.2:** As a guest, I want to try an editable example goal so that I can explore without knowing an official qualification name.
- **FS-01.3:** As a guest, I want to explore matches, readiness, and available services before creating an account so that I can decide whether the service is useful to me.

Evidence: [HomePage](../frontend/src/features/home/HomePage.tsx), [GoalStep](../frontend/src/features/finder/GoalStep.tsx), [analysis API](../backend/tesda_track/routers/analysis.py).

### F02 — Accounts, authentication, and access control

The application has learner and administrator roles, registration, sign-in, sign-out, and ownership checks. Name updates and password changes exist in the API; a corresponding React settings form was not found.

- **FS-02.1:** As a learner, I want to register and sign in so that I can keep my recommendations, readiness checks, and progress in my account.
- **FS-02.2:** As a signed-in learner, I want to sign out so that my account is no longer available to the next person using the browser.
- **FS-02.3:** As a learner, I want access to my personal records to be restricted to my account so that another learner cannot read or change them.
- **FS-02.4:** As a learner using an account-management client, I want to update my name and change my password using my current password so that my account details remain accurate and secure. **API-supported.**

Evidence: [account forms](../frontend/src/auth/AccountForms.tsx), [authentication API](../backend/tesda_track/routers/auth.py), [account API](../backend/tesda_track/routers/me.py), [ownership checks](../backend/tesda_track/services/ownership.py).

### F03 — Qualifications library

The React library provides text search, sector filtering, pagination, and qualification cards. Its Explore action starts a goal based on the qualification name; it does not directly lock in that qualification.

- **FS-03.1:** As a learner, I want to search qualifications and filter them by sector so that I can find options related to my interests.
- **FS-03.2:** As a learner, I want to inspect a qualification's competencies and possible jobs so that I understand what it prepares me to do.
- **FS-03.3:** As a learner, I want to start exploring a pathway from a qualification card so that I can move from browsing into guided preparation.

Evidence: [LibraryPage](../frontend/src/features/library/LibraryPage.tsx), [QualificationCard](../frontend/src/features/library/QualificationCard.tsx), [catalog API](../backend/tesda_track/routers/qualifications.py).

### F04 — Career-goal interpretation and qualification matching

The finder interprets a goal, asks about missing experience or certification information, and returns explained qualification matches. English, Filipino, and Taglish goals are supported by the matching workflow. Semantic matching is optional; keyword matching is available without it.

- **FS-04.1:** As a learner, I want to describe my career goal in my own words so that I can find relevant qualifications without memorizing catalog terms.
- **FS-04.2:** As a learner, I want to see what the system understood and answer follow-up questions so that recommendations reflect my experience and certification status.
- **FS-04.3:** As a learner, I want to see ranked matches with reasons so that I can judge their relevance to my goal.
- **FS-04.4:** As a learner, I want to choose another qualification or revise my goal when the matches do not suit me so that I retain control over my direction.

Evidence: [MatchesStep](../frontend/src/features/finder/MatchesStep.tsx), [analysis service](../backend/tesda_track/services/analysis.py), [qualification recommendation service](../backend/tesda_track/services/recommendation_service.py).

### F05 — Structured interests, skills, and practical preferences

The optional questionnaire captures interests, skills, career goals, and practical constraints such as location, budget, delivery mode, and preferred dates. This workflow exists in classic and the API; it should not be described as a completed React feature.

- **FS-05.1:** As a learner, I want to provide my interests, skills, and career preferences so that recommendations can consider more than one sentence about my goal.
- **FS-05.2:** As a learner, I want to distinguish preferences from mandatory budget, location, or schedule constraints so that unsuitable options are excluded or identified as requiring confirmation.
- **FS-05.3:** As a learner, I want to use answers temporarily or save and revise them in my account so that I can control their persistence and revisit them as my circumstances change.

Evidence: [classic questionnaire](../classic/assessment_view.py), [assessment API](../backend/tesda_track/routers/learner_assessments.py), [structured assessment documentation](structured-assessments.md).

### F06 — Competency readiness self-assessment

Learners rate competencies for a qualification in manageable groups and receive a self-reported readiness result.

- **FS-06.1:** As a learner, I want to rate my familiarity with each competency so that I can reflect on my current preparation.
- **FS-06.2:** As a learner, I want to move through competency groups and see unanswered items so that I can complete the check without overlooking a skill.
- **FS-06.3:** As a learner, I want to see my readiness score, strengths, gaps, and suggested action so that I know what to work on next.

Evidence: [ReadinessStep](../frontend/src/features/finder/ReadinessStep.tsx), [readiness calculation](../backend/tesda_track/services/skill_gap_service.py), [saved readiness API](../backend/tesda_track/routers/readiness_checks.py).

Scope: this is self-assessment guidance, not an official competency result or a prediction of passing.

### F07 — Recommended pathway and next-step guidance

The project recommends routes such as training before assessment, focused preparation, or assessment readiness, and can show curated steps. The React pathway screen uses the submitted readiness result; the backend also offers profile-based route recommendations.

- **FS-07.1:** As a learner, I want a suggested next step with its reason so that I understand whether to prepare through training or investigate assessment.
- **FS-07.2:** As a learner, I want to see the curated steps available for my qualification and route so that I can understand the work ahead.
- **FS-07.3:** As a learner, I want to open training or assessment opportunities for the qualification I am exploring so that I can act on the recommendation.

Evidence: [PathwayStep](../frontend/src/features/finder/PathwayStep.tsx), [route recommendation logic](../backend/tesda_track/services/recommendation_service.py), [pathway API](../backend/tesda_track/routers/pathways.py).

### F08 — Saved journeys and continuation

The React application saves signed-in recommendation sessions, explicitly saves a guest journey after sign-in, and restores saved sessions from My Progress.

- **FS-08.1:** As a learner, I want my submitted goal, follow-up answers, and selected qualification saved so that I can return to the same journey later.
- **FS-08.2:** As a guest becoming a registered learner, I want to save the journey and submitted readiness result I already created so that I do not have to enter them again.
- **FS-08.3:** As a returning learner, I want My Progress to offer a useful next action and let me reopen a saved recommendation so that I can continue efficiently.

Evidence: [journey saving](../frontend/src/features/finder/useJourneySession.ts), [continuation rules](../frontend/src/features/progress/journey.ts), [saved-session restoration](../frontend/src/features/progress/resume.ts).

Scope: saved account records and browser-local draft continuity are different capabilities; this does not promise cross-device unfinished drafts.

### F09 — Pathway step tracking

Learners can follow a curated pathway and record their progress through its steps.

- **FS-09.1:** As a learner, I want to follow a pathway so that its steps appear in My Progress.
- **FS-09.2:** As a learner, I want to mark steps as completed so that I can record what I have finished.
- **FS-09.3:** As a learner, I want to see completed and remaining steps so that I know where to focus next.

Evidence: [progress records](../frontend/src/features/progress/Records.tsx), [pathway service](../backend/tesda_track/services/pathways.py).

Scope: following a pathway does not enroll the learner at a training institution.

### F10 — Personal career goals

The React interface supports adding a goal, associating a qualification, and marking it achieved. The API additionally supports target dates, editing, archiving, and deletion.

- **FS-10.1:** As a learner, I want to record a personal career goal and optional target qualification so that I can keep track of what I am working toward.
- **FS-10.2:** As a learner, I want to mark a goal achieved so that my progress reflects my accomplishments.
- **FS-10.3:** As a learner using a goal-management client, I want to revise a goal, set a target date, or archive or remove an outdated goal so that my plan remains relevant. **API-supported.**

Evidence: [goal interface](../frontend/src/features/progress/GoalsAndCertifications.tsx), [goals API](../backend/tesda_track/routers/goals.py), [record schemas](../backend/tesda_track/schemas/records.py).

### F11 — Certification records

Learners can record self-reported credentials and view assessment-linked verified records. The API supports editing self-reported credentials and deleting owned certification records; verified records cannot be edited.

- **FS-11.1:** As a learner, I want to record a certification with its qualification, certificate number, and issue date so that I can keep my credentials together.
- **FS-11.2:** As a learner, I want to distinguish self-reported credentials from assessment-linked verified records so that I understand which evidence the system can rely on.
- **FS-11.3:** As a learner using a certification-management client, I want to correct or remove my self-reported credentials so that my records stay accurate. **API-supported; verified records have protected editing rules.**

Evidence: [certification interface](../frontend/src/features/progress/GoalsAndCertifications.tsx), [certifications API](../backend/tesda_track/routers/certifications.py), [certification service](../backend/tesda_track/services/certifications.py).

Scope: the project does not establish live authentication against a national certificate registry.

### F12 — Training provider and program discovery

Training discovery includes provider details, program listings, and filters such as qualification, location, delivery mode, and scholarship availability.

- **FS-12.1:** As a learner, I want to find training programs for a qualification and filter relevant delivery options so that I can narrow my choices.
- **FS-12.2:** As a learner, I want to inspect a program's available dates, duration, cost, scholarship information, and delivery mode so that I can assess whether it suits my circumstances.
- **FS-12.3:** As a learner, I want to see the provider's address and contact details so that I can confirm practical details with the institution.

Evidence: [TrainingPage](../frontend/src/features/training/TrainingPage.tsx), [filters](../frontend/src/features/training/FilterPanel.tsx), [program listings](../frontend/src/features/training/Listings.tsx), [training API](../backend/tesda_track/routers/training.py).

### F13 — Explained training-program rankings

Eligible programs can receive fit scores and explanations based on available alignment, location, assessment access, timing, and preference evidence. Detailed structured preferences are exposed through classic/API.

- **FS-13.1:** As a learner, I want suitable programs ordered by their fit to my goal and available preferences so that I can investigate the most relevant options first.
- **FS-13.2:** As a learner, I want to inspect why a program received its score so that I can make an informed choice.
- **FS-13.3:** As a learner, I want missing evidence and unresolved requirements identified so that I do not mistake incomplete information for a strong recommendation.

Evidence: [React fit requests](../frontend/src/features/training/api.ts), [program explanations](../frontend/src/features/training/Listings.tsx), [ranking service](../backend/tesda_track/services/ranking.py), [personalization service](../backend/tesda_track/services/personalization.py).

### F14 — Assessment schedules and center comparison

React displays assessment schedules and their details. A separate ranked comparison with fee, date, and distance constraints exists in classic and the backend.

- **FS-14.1:** As a learner, I want to find upcoming assessment schedules for my qualification so that I can identify where and when assessment is offered.
- **FS-14.2:** As a learner, I want to inspect the center, fee, date, and remaining approved-seat capacity so that I can consider the practical requirements.
- **FS-14.3:** As a learner, I want to compare eligible schedules using my distance, fee, and date preferences so that I can choose an assessment option that fits my circumstances. **Classic/API workflow.**

Evidence: [schedule listings](../frontend/src/features/training/Listings.tsx), [classic comparison](../classic/assessment_centers_view.py), [assessment ranking service](../backend/tesda_track/services/assessment_ranking.py).

### F15 — Nearby search, maps, and travel directions

The project supports region or place-based discovery, optional browser location, center maps, and directions. Routing configuration determines which travel options are available.

- **FS-15.1:** As a learner, I want to search using a region or place, or choose to use my approximate location, so that I can find nearby services.
- **FS-15.2:** As a learner, I want to switch between a usable center list and map so that I can explore locations even when a map or browser location is unavailable.
- **FS-15.3:** As a learner, I want available travel routes, distance, and time estimates for a center so that I can plan how to get there.

Evidence: [center search](../frontend/src/features/training/useCenters.ts), [map](../frontend/src/features/training/CenterMap.tsx), [directions interface](../frontend/src/features/training/CenterDetail.tsx), [routing service](../backend/tesda_track/services/routing.py).

Scope: flight options are estimates where available, not live flight schedules, fares, or bookings.

### F16 — Service evidence, availability, and prerequisite checks

The system distinguishes service authorization, practical availability, and learner prerequisites. A listing's presence does not by itself confirm that it is currently usable.

- **FS-16.1:** As a learner, I want to see the recorded verification and availability status of a program or assessment so that I know what still needs confirmation.
- **FS-16.2:** As a learner, I want unknown fees, example records, and missing service evidence clearly identified so that I do not mistake assumptions for confirmed facts.
- **FS-16.3:** As a learner, I want applicable prerequisites checked against valid supporting records so that I understand why an opportunity is available, excluded, or awaiting review.

Evidence: [evidence display](../frontend/src/features/training/evidence.ts), [verification service](../backend/tesda_track/services/verification.py), [verification policy](service-verification.md).

Scope: self-reported readiness and credentials cannot substitute for required verified evidence; requirements needing manual review can remain unresolved.

### F17 — Assessment applications and withdrawal

Signed-in learners can review an application, submit it, receive its reference and status, track its outcome, and withdraw an eligible application.

- **FS-17.1:** As a learner, I want to review the qualification, center, schedule, and fee before submitting an application so that I can confirm my choice.
- **FS-17.2:** As a learner, I want a reference and current status after submission so that I know the request was recorded and can follow it up.
- **FS-17.3:** As a learner, I want to view application decisions, reviewer notes, and recorded results so that I know the outcome and next action.
- **FS-17.4:** As a learner, I want to confirm withdrawal of a specific eligible application so that I can cancel it when my plans change.

Evidence: [application review and receipt](../frontend/src/features/training/Listings.tsx), [application progress](../frontend/src/features/progress/Records.tsx), [assessment API](../backend/tesda_track/routers/assessments.py).

Scope: a pending application does not reserve a seat. Approved and completed applications count toward capacity.

### F18 — Readiness history and comparison

The React progress page groups saved checks by qualification and allows two checks to be compared.

- **FS-18.1:** As a learner, I want to see dated readiness results for a qualification so that I can review my preparation over time.
- **FS-18.2:** As a learner, I want to compare two saved checks and see the score change so that I can reflect on my progress.
- **FS-18.3:** As a learner, I want a notice when the checks covered different competencies so that I can interpret the comparison carefully.

Evidence: [ReadinessHistory](../frontend/src/features/progress/ReadinessHistory.tsx), [comparison rules](../frontend/src/features/progress/journey.ts).

### F19 — Skills Explorer

The optional Skills Bridge integration links extracted skill or role terms to occupations, qualifications, and returned external mappings.

- **FS-19.1:** As a learner, I want to describe skills or roles I am interested in so that I can discover related occupations.
- **FS-19.2:** As a learner, I want to inspect an occupation's skills, related qualifications, and available mappings so that I can explore possible career directions.
- **FS-19.3:** As a learner, I want to find local training and assessment services for a qualification matched from an external result so that I can continue exploring within TESDA-TRACK.

Evidence: [SkillsPage](../frontend/src/features/skills/SkillsPage.tsx), [occupation details](../frontend/src/features/skills/OccupationDetails.tsx), [local qualification handoff](../frontend/src/features/skills/BridgeQualification.tsx), [Skills Bridge API](../backend/tesda_track/routers/skills_bridge.py).

Scope: requires the integration to be enabled and configured; returned mappings are not an equivalency certification.

### F20 — Privacy information, data export, and account deletion

The React interface provides a privacy notice/page and account actions for downloading data and deleting the account.

- **FS-20.1:** As a visitor, I want to understand what information the application stores and shares so that I can make an informed decision about using it.
- **FS-20.2:** As a learner, I want to download my account data so that I have a copy of my saved records.
- **FS-20.3:** As a learner, I want to confirm account deletion so that I can remove my account and its owned records.

Evidence: [privacy page](../frontend/src/features/privacy/PrivacyPage.tsx), [account menu](../frontend/src/features/account/SignedInMenu.tsx), [account service](../backend/tesda_track/services/accounts.py).

Scope: deletion removes owned records and anonymizes applicable audit links; it does not imply erasure of every anonymous aggregate.

### F21 — Responsive navigation and display preferences

React provides responsive navigation, keyboard-oriented controls and dialogs, system/light/dark themes, and reduced-motion handling.

- **FS-21.1:** As a phone user, I want navigation and forms that adapt to my screen so that I can complete the learner journey on my device.
- **FS-21.2:** As a keyboard user, I want labeled controls, visible focus, and manageable dialogs so that I can navigate and complete forms without a mouse.
- **FS-21.3:** As a user, I want a system, light, or dark theme and respect for my reduced-motion preference so that the interface is comfortable to use.

Evidence: [navigation](../frontend/src/components/Nav.tsx), [mobile menu](../frontend/src/components/MobileMenu.tsx), [dialogs](../frontend/src/components/ModalDialog.tsx), [theme provider](../frontend/src/theme/ThemeProvider.tsx), [reduced motion](../frontend/src/features/home/hooks/useReducedMotion.ts).

Scope: implementation support exists; this review did not perform an accessibility conformance audit.

### F22 — Error recovery and reliable saving

The interface provides failure and retry states, preserves relevant journey state, and uses request identifiers for supported saved writes.

- **FS-22.1:** As a learner, I want a clear error and a retry action when a request fails so that I can continue after the service recovers.
- **FS-22.2:** As a learner, I want my current goal and relevant answers retained during recoverable failures so that I do not have to start again.
- **FS-22.3:** As a learner, I want retrying a supported save or application request to avoid creating duplicate records so that my account history stays accurate.
- **FS-22.4:** As a learner, I want edited readiness answers distinguished from the last submitted result so that I know when a result needs recalculation.

Evidence: [finder errors](../frontend/src/features/finder/RequestFailed.tsx), [finder state](../frontend/src/features/finder/store.ts), [write requests](../frontend/src/features/finder/writeRequests.ts), [write receipts](../backend/tesda_track/services/write_receipts.py), [readiness interface](../frontend/src/features/finder/ReadinessStep.tsx).

## Administration and operational stories

### F23 — Training provider and program administration

Administrative endpoints create and update training providers and programs. A dedicated React CRUD workspace was not found.

- **FS-23.1:** As an administrator, I want to create and update training-provider records so that learners can find accurate institutional details.
- **FS-23.2:** As an administrator, I want to maintain a program's qualification, delivery mode, dates, fees, scholarship information, and operational details so that discovery reflects the offering.
- **FS-23.3:** As an administrator, I want to deactivate providers or programs when appropriate so that inactive offerings do not continue to appear as active options.

Evidence: [training administration API](../backend/tesda_track/routers/training.py), [delivery schemas](../backend/tesda_track/schemas/delivery.py), [training service](../backend/tesda_track/services/training.py).

### F24 — Assessment administration and recorded outcomes

Administrative endpoints manage centers, schedules, applications, and results. Relevant capacity and eligibility checks run when applications are submitted or approved.

- **FS-24.1:** As an administrator, I want to maintain assessment centers and schedules, including fees and capacity, so that learners see appropriate assessment opportunities.
- **FS-24.2:** As an administrator, I want to review applications, record a decision, and add a note so that learners can understand their application status.
- **FS-24.3:** As an administrator, I want to record completed assessment outcomes and create an assessment-linked verified certification for a competent result so that the learner's account reflects the recorded achievement.
- **FS-24.4:** As an administrator, I want approval to recheck capacity and eligibility so that changed conditions do not result in an invalid approval.

Evidence: [assessment administration API](../backend/tesda_track/routers/assessments.py), [assessment service](../backend/tesda_track/services/assessments.py).

Scope: these are administrative records within TESDA-TRACK, not proof that a live national certification system has been integrated.

### F25 — Curated pathway administration

Administrators can create and update qualification pathways with ordered steps.

- **FS-25.1:** As an administrator, I want to create a pathway for a qualification and route so that learners receive a structured preparation plan.
- **FS-25.2:** As an administrator, I want to maintain the pathway's ordered steps and instructions so that guidance remains useful.
- **FS-25.3:** As an administrator, I want to control whether a pathway is active so that learners are offered currently supported guidance.

Evidence: [pathway administration API](../backend/tesda_track/routers/pathways.py), [pathway schemas](../backend/tesda_track/schemas/pathways.py), [pathway service](../backend/tesda_track/services/pathways.py).

### F26 — Registry imports and service-evidence maintenance

Registry commands ingest TESDA training and assessment source workbooks with preview reports, mappings, and import history. Administrative APIs separately maintain qualification-specific service verification and prerequisites.

- **FS-26.1:** As a data maintainer, I want to preview registry imports and inspect unresolved labels or invalid source fields so that I can review issues before changing application records.
- **FS-26.2:** As a data maintainer, I want repeatable imports with source history and duplicate handling so that refreshed registry snapshots remain traceable and do not create duplicate operational records.
- **FS-26.3:** As an administrator, I want to record service authority, evidence sources, review dates, and validity dates for a site and qualification so that recommendations can distinguish current authorization from unconfirmed records.
- **FS-26.4:** As an administrator, I want to maintain availability evidence and mandatory prerequisites separately from registration so that the system does not infer an open intake or learner eligibility from registry presence alone.

Evidence: [registry importer](../backend/tesda_track/registry_import.py), [registry import workflow](registry-import.md), [verification API](../backend/tesda_track/routers/verification.py), [service verification policy](service-verification.md).

### F27 — Reporting and analytics

Administrators can view aggregate activity, the learner funnel, qualification demand, competency gaps, and regional supply. Additional matching diagnostics are exposed through the API.

- **FS-27.1:** As an administrator, I want an overview and learner-funnel report for a selected period so that I can understand activity across the learner journey.
- **FS-27.2:** As an administrator, I want qualification-demand and competency-gap reports so that I can identify areas needing training or learner support.
- **FS-27.3:** As an administrator, I want regional provider, program, assessment, and open-seat counts so that I can compare recorded service supply.
- **FS-27.4:** As an administrator, I want matching and no-match statistics so that I can identify problems in qualification discovery. **API-supported diagnostics.**

Evidence: [ReportsPage](../frontend/src/features/reports/ReportsPage.tsx), [reports API](../backend/tesda_track/routers/reports.py), [report service](../backend/tesda_track/services/reports.py).

### F28 — Matching-model and integration maintenance

The project includes optional local semantic matching, embedding synchronization, integration diagnostics, and model training/evaluation tooling. These are operational capabilities, not learner screens.

- **FS-28.1:** As an administrator, I want to inspect matching-model availability, embedding coverage, and Skills Bridge configuration so that I can diagnose missing optional functionality.
- **FS-28.2:** As an administrator, I want to synchronize embeddings after catalog or model changes so that semantic matching uses the appropriate qualification and program representations.
- **FS-28.3:** As a model maintainer, I want to prepare and fine-tune a model using the project's training workflow so that I can develop improved qualification matching.
- **FS-28.4:** As a model maintainer, I want to evaluate candidate models by language, scenario, ranking quality, and rejection behavior so that I can assess improvements and regressions before release.

Evidence: [integration administration API](../backend/tesda_track/routers/integrations.py), [embedding commands](../backend/tesda_track/embeddings.py), [training and evaluation guide](../backend/training/README.md), [model setup](../backend/models/README.md).

Scope: the presence of a training recipe or candidate model does not establish production deployment or validated accuracy.

## Partner integration stories

### F29 — Partner catalog and recommendation integration

The MCP server offers nine read-only tools grouped into catalog, recommendations, and reports, using scoped OAuth client credentials.

- **FS-29.1:** As a partner developer, I want to authenticate my system and discover its permitted tools so that I can integrate within the access granted to my organization.
- **FS-29.2:** As a partner developer, I want qualification details, training-program search, and regional supply information so that my application can reuse TESDA-TRACK's catalog and delivery data.
- **FS-29.3:** As a partner developer, I want goal matching, route guidance, readiness calculation, and training or assessment rankings so that my application can provide the same decision support.
- **FS-29.4:** As a partner developer, I want supported official TESDA codes resolved to local qualification records so that my integration can work with existing identifiers and handle ambiguous mappings explicitly.
- **FS-29.5:** As an authorized partner developer, I want stable completed-quarter qualification-demand reports with small-count suppression so that I can analyze aggregate demand while limiting disclosure of small learner groups.

Evidence: [partner onboarding](mcp/partner-onboarding.md), [tool scopes](../backend/tesda_track/mcp/scopes.py), [catalog tools](../backend/tesda_track/mcp/tools_catalog.py), [recommendation tools](../backend/tesda_track/mcp/tools_recommend.py), [report tools](../backend/tesda_track/mcp/tools_reports.py).

Scope: partners can request information and calculations; these tools do not submit learner applications or modify learner accounts.

### F30 — Partner credentials and usage oversight

Client registration, secret rotation, and revocation are command-line operations. Administrative APIs list clients and report usage.

- **FS-30.1:** As an administrator, I want to register a partner with its purpose, declared tools, scopes, and call limit so that access reflects its approved use.
- **FS-30.2:** As an administrator, I want to rotate a partner's secret or revoke its access so that I can respond to credential changes or end an integration.
- **FS-30.3:** As an administrator, I want to review calls, outcomes, limits, and whether usage matches declared tools so that I can oversee partner integrations.

Evidence: [administration CLI](../backend/tesda_track/cli.py), [partner-client service](../backend/tesda_track/services/partner_clients.py), [MCP administration API](../backend/tesda_track/routers/mcp_admin.py), [usage service](../backend/tesda_track/services/mcp_usage.py).

## Scope gaps and follow-on candidates

These should be treated as separate future work or interface-completion work, rather than included as already available features:

| Candidate                                                             | Current boundary                                                                                                                                                       |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Side-by-side qualification shortlisting and comparison                | Earlier backlog proposal; a React shortlist workflow was not found. This is distinct from assessment-center ranking.                                                   |
| Filipino interface language selection                                 | Filipino/Taglish goal matching exists; a translated interface and language selector were not found.                                                                    |
| Complete React personalization questionnaire                          | The structured questionnaire exists in classic/API; the equivalent React workflow was not found.                                                                       |
| Complete React assessment-center comparison                           | React provides schedule discovery; the dedicated constraint-based ranking form exists in classic/API.                                                                  |
| React profile/password and extended record management                 | Backend operations exist; not all have React controls.                                                                                                                 |
| Dedicated administrator management workspace                          | Administrative APIs exist for delivery, pathways, evidence, and application decisions; React currently provides reporting rather than a complete management interface. |
| NC-level library filter and exact qualification handoff               | React provides text/sector filtering; Explore currently starts a name-based goal.                                                                                      |
| Cross-device unfinished drafts and saved shortlists                   | Saved account records exist; these additional persistence workflows were not established.                                                                              |
| Training-institution enrollment, payments, and bookings               | Pathway following and assessment applications do not implement tuition collection, training admission, or travel booking.                                              |
| Email/SMS notifications and password-recovery emails                  | These workflows were not found in the reviewed application routes and account screens.                                                                                 |
| Live official certificate authentication or automatic document review | Current verified credentials are assessment-linked records; some prerequisites explicitly require unresolved manual review.                                            |

## Review basis

The inventory was checked against frontend routes and feature modules, backend routers and services, classic workflows for features absent from React, and the current project documentation. Existing test sources corroborate several interactions, including guest saving, application review, continuation, readiness comparison, map fallback, and retry behavior. Tests and the live application were not run for this documentation task.
