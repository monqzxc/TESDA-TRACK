# Learner experience development backlog

Reviewed 8 October 2026. This backlog targets the current application launched with
`streamlit run app.py`. It complements the UI polish work; the stories below are proposed
development work, not a claim that the changes are already shipped.

## Product baseline

The current `frontend/app.py` already offers guest goal matching, qualification exploration,
self-reported readiness checks, an account dialog, and signed-in recommendation history,
goals, certifications, pathway steps, and assessment applications. The shared
`frontend/training_view.py` adds a center list and map, filters, location search, program
details, assessment schedules, and applications. Skills Bridge and administrator reports
are also available. Retain these capabilities during polish.

`frontend/portal_app.py` and `frontend/app_pages/` contain a separate portal implementation.
The [earlier portal plan](superpowers/plans/2026-10-07-learner-portal-redesign.md) describes
a future entry-point replacement, but that replacement is not a dependency of this backlog.
Reusable helpers or interactions can be adapted after checking their state and navigation
contracts against the current app.

Important distinctions for development:

- Signing in currently saves new signed-in submissions. It does not automatically convert
  a previously anonymous recommendation into a saved recommendation session.
- The current library renders every matching qualification and its action fills the goal
  field; it does not directly commit that qualification as the learner's selection.
- Readiness is a self-assessment. Recommendation and training fit scores are ranking signals,
  not a probability of passing, an admission decision, or certification verification.
- The delivery seed file explicitly contains development fixtures. Current public site and
  program schemas do not expose per-record provenance or a verification timestamp.
- Browser-session continuity is different from durable account storage. Do not promise
  cross-device drafts, notifications, training enrollment, or official eligibility checks
  without implementing the required support.

## Priorities and release slices

P0 protects trust and completion of the pilot journey. P1 makes the core experience easier
to complete. P2 expands exploration once the core journey is reliable. Every story starts
as **proposed** and is complete only when its acceptance criteria are demonstrated.

| Slice | Outcome | Stories | Dependencies |
| --- | --- | --- | --- |
| A: Confident first visit | A learner understands the app, keeps their work when signing in, and can recover from errors | US-01, US-02, US-03, US-13, US-14 | Existing account and recommendation APIs; baseline keyboard/mobile audit |
| B: Choose and prepare | A learner finds a qualification, completes a manageable readiness check, and reaches relevant opportunities | US-04, US-06, US-07, US-08 | Slice A state handling; existing catalog and training APIs |
| C: Act and return | A learner reviews an assessment application and resumes the next useful step | US-09, US-10, US-12 | Slice B handoffs; provenance API work for US-12 |
| D: Broader support | Learners compare alternatives, understand their own progress, and choose interface language | US-05, US-11, US-15 | Core journey stable; reviewed translation and comparison rules |

Apply US-13 and US-14 to every slice. US-12 is P0 for any pilot that presents listings as
real opportunities: show an accurate dataset-level fixture notice earlier, and do not wait
for slice C to disclose that limitation. Slice C adds record-level provenance support.

## Stories

### US-01 — Understand the first step

**Priority:** P1 · **Actor:** First-time learner

As a learner who is unsure where to begin, I want one clear starting action and examples
of goals I can enter so that I can explore without already knowing a qualification name.

**Current foundation:** The finder has a goal form, examples, a journey guide, and guest use.

**Acceptance criteria:**

1. The first screen explains the outcome in one short sentence and presents one primary
   action for submitting a goal, with account creation optional.
2. Examples cover a new career, existing work experience, and a Filipino or Taglish goal;
   choosing an example fills an editable field without submitting it.
3. Empty submission preserves the page and shows an instruction beside the goal form.
4. After submission, the active goal remains visible and an explicit edit action lets the
   learner submit a changed goal. Submitting it clears answers and results from the old goal.

**Dependencies:** Existing goal-analysis API and current finder state. Frontend work only.

### US-02 — Save the journey started as a guest

**Priority:** P0 · **Actor:** Guest becoming a registered learner

As a guest who has already explored a qualification, I want signing in to save the journey
I chose to keep so that I do not have to type my goal and answers again.

**Current foundation:** Account dialogs and signed-in record APIs exist; guest-session
conversion is not implemented in the current sign-in handler.

**Acceptance criteria:**

1. A save prompt explains which current goal, qualification, and submitted readiness check
   will be saved. Completing sign-in returns to the same journey and preserves those values.
2. The app creates a recommendation session and applies the selected qualification and
   follow-up answers through existing APIs. It saves a readiness check only if the learner
   already submitted one; partial answers remain an unsaved draft.
3. The success message appears only after the relevant writes succeed. If a later write
   fails, explain what was saved and let the learner retry the unfinished part.
4. Reopening the dialog or rerunning the page after a confirmed save does not duplicate
   records. Signing out clears personal results before another learner uses the session.

**Dependencies:** Account dialog, `start_session`, `update_session`, and `submit_readiness`.
Add backend idempotency or reconciliation support if recovery from an ambiguous network
timeout cannot safely establish whether a write succeeded.

### US-03 — Understand and correct a recommendation

**Priority:** P1 · **Actor:** Learner reviewing suggested qualifications

As a learner, I want a plain-language reason for each match and a way to correct the
details used so that I can judge whether the suggestion fits my experience.

**Current foundation:** Matches already return reasons; the finder shows percentages,
follow-up fields, and a profile summary.

**Acceptance criteria:**

1. Each recommendation names the qualification, possible work, and API-provided reason.
   Ranking labels do not imply a pass probability or guaranteed employment.
2. The learner can correct experience and certification information before following a
   route. An unknown certification answer is described accurately rather than as verified.
3. A no-match response keeps the goal and offers an edit action and direct library access;
   it does not silently label an unrelated qualification as a recommendation.
4. A manually selected qualification is labelled as the learner's choice. Changing it
   updates the visible pathway and does not display another qualification's readiness score.

**Dependencies:** Existing match/pathway responses; US-01 state handling. Do not invent
additional confidence bands without an agreed ranking rule.

### US-04 — Browse a manageable qualification library

**Priority:** P1 · **Actor:** Learner exploring available qualifications

As a learner, I want focused filters and a short page of results so that I can find a
relevant qualification without scrolling through the entire catalog.

**Current foundation:** Search and sector filters exist; the current library is unpaged.

**Acceptance criteria:**

1. Search matches qualification name, code, sector, and listed careers. Sector and NC-level
   filters can be combined, with an explicit option for qualifications without an NC level.
2. Show at most 12 cards per page, the result count, and clearly labelled previous/next
   controls. Changing a filter resets to page one; an empty result offers Clear filters.
3. Opening a qualification and returning to the library preserves filters and page position.
4. Selecting a pathway carries the exact qualification code into the finder and asks for
   missing learner details without requiring the learner to search for it again.

**Dependencies:** Current catalog; current finder selection contract. The separate portal's
filter/pagination helpers are candidates for reuse, not evidence this behavior is shipped.

### US-05 — Compare a small shortlist

**Priority:** P2 · **Actor:** Learner choosing between related qualifications

As a learner, I want to compare two or three qualifications so that I can see their
differences before choosing a pathway.

**Current foundation:** Catalog careers, sector, level in names, and competencies are available.

**Acceptance criteria:**

1. Add and remove up to three qualifications with a visible selection count and clear limit.
2. Compare name, sector, qualification level when known, listed careers, and competencies
   in a consistent order; missing information is labelled as unavailable.
3. On narrow screens, each qualification remains readable without a wide comparison grid.
4. Choosing one opens that exact qualification in the finder. The shortlist survives page
   navigation in the current browser session; persistent saving is not promised.

**Dependencies:** US-04. Persistent cross-device shortlists require a new backend record
and are outside this story.

### US-06 — Complete readiness in small groups

**Priority:** P1 · **Actor:** Learner checking existing skills

As a learner, I want to answer related competencies in manageable groups so that I can
finish a readiness check without losing track of unanswered items.

**Current foundation:** The current form lists all competencies at once and submits to the
existing guest or signed-in readiness endpoint.

**Acceptance criteria:**

1. Group competencies by Basic, Common, and Core where present, with plain descriptions
   and an answered/total indicator; preserve any additional catalog categories.
2. Previous and Next retain answers. Submission identifies unanswered competencies and
   avoids sending an incomplete check as a successful result.
3. After editing answers, clearly distinguish the last submitted result from the draft.
   A failed recalculation leaves the answers available for retry.
4. Results explain strengths and gaps and repeat that the score is self-reported. Actions
   lead to training or assessment for the same qualification.

**Dependencies:** Existing readiness API; US-07 handoff. Partial cross-device drafts need
new persistence and are excluded.

### US-07 — Carry the chosen qualification into opportunities

**Priority:** P1 · **Actor:** Learner ready for training or assessment

As a learner reviewing a pathway or readiness result, I want the next action to open
relevant opportunities so that I do not repeat my choices.

**Current foundation:** The training finder can initially default to the selected
qualification; defaults alone do not define an explicit later handoff.

**Acceptance criteria:**

1. “Find training” and “See assessments” open the center finder with the exact qualification
   and corresponding center type selected, including after an earlier training search.
2. The destination names the qualification and retains an existing location preference.
   It shows applied filters and lets the learner change or clear them.
3. Returning to the pathway preserves the goal, selected qualification, and readiness work.
4. If no listings match, show which filters are active and offer clear ways to broaden them;
   unrelated listings do not appear under a claim that they match the chosen qualification.

**Dependencies:** Finder and training state contract. Existing APIs are sufficient.

### US-08 — Find a center without relying on the map

**Priority:** P1 · **Actor:** Learner using a phone or declining location access

As a learner, I want the center list and manual location filters to work independently
of the map so that I can still find options when location access or map tiles fail.

**Current foundation:** The app already has list results, manual filters, browser location,
and center details. This story improves and verifies the fallback experience.

**Acceptance criteria:**

1. Denying or failing browser location leaves manual place/region filters and all eligible
   list results usable; it does not repeatedly request permission on reruns.
2. Every listed center can be opened using keyboard controls without selecting a map pin.
   A tile-loading failure does not block contact details, programs, or schedules.
3. Distances state their origin and are labelled approximate. Centers without coordinates
   remain discoverable and do not show a fabricated distance or directions link.
4. Unknown cost or fee displays “Not provided”; a recorded zero displays “Free” or “No fee”.
   Scholarship availability does not imply a guaranteed award.

**Dependencies:** Existing training component and delivery fields. US-12 supplies provenance.

### US-09 — Review an assessment request and see its outcome

**Priority:** P1 · **Actor:** Learner applying for assessment

As a learner, I want to review a schedule before applying and find the request afterward
so that I understand what I submitted and what happens next.

**Current foundation:** Application submission, status, reviewer notes, withdrawal, and
backend capacity checks exist. Applying currently happens directly from a schedule card.

**Acceptance criteria:**

1. Before submitting, show qualification, center, Philippine date/time, stated fee or
   “Not provided”, and a clear explanation that the application awaits review.
2. A guest can sign in and return to the selected schedule without automatically submitting.
3. On success, show a receipt using the returned application reference/status and a direct
   action to My progress. Repeated clicks and duplicate/full schedule responses are handled
   without displaying a false success or claiming a reserved seat.
4. My progress explains the current status and available next action. A withdrawal asks
   the learner to confirm the specific request, then refreshes its actual status.

**Dependencies:** US-02 and US-07; existing assessment endpoints. No payment collection,
official eligibility determination, or email/SMS delivery is included.

### US-10 — Resume the next useful step

**Priority:** P1 · **Actor:** Returning signed-in learner

As a returning learner, I want a clear continuation action above my record history so
that I know where to go next.

**Current foundation:** My progress lists histories, pathway checkboxes, applications,
goals, and certifications, but has no direct continuation from a history item.

**Acceptance criteria:**

1. A “Continue your journey” card identifies the saved goal and qualification and offers
   one applicable action, such as continue a pathway, check readiness, or view an application.
2. Opening a saved recommendation restores its profile and selected qualification by ID;
   do not silently attach a readiness check from a different recommendation or qualification.
3. When a record has no usable qualification or its catalog entry is unavailable, explain
   this and offer exploration without deleting the historical record.
4. A learner with no records sees a direct route to the finder. Completed pathways remain
   visible as achievements and are not presented as unfinished tasks.

**Dependencies:** Existing saved-session/pathway/application responses; US-07 navigation.
Define and document the continuation ordering before implementation.

### US-11 — See readiness changes for one qualification

**Priority:** P2 · **Actor:** Learner returning after practice or training

As a learner, I want to compare my own readiness checks for the same qualification so
that I can reflect on improvement without confusing different qualifications.

**Current foundation:** Saved checks include dates, answers, qualification, and scores;
the current progress page shows a history table.

**Acceptance criteria:**

1. Filter by qualification and show checks in chronological order with dates and the
   difference between two selected comparable checks.
2. Show an accessible table alongside any chart. With fewer than two checks, explain how
   to establish a comparison instead of showing a trend.
3. Label the information as self-reported and do not rank learners against one another.
4. If competency IDs differ between checks, explain that the questionnaires differ and
   avoid presenting an unqualified like-for-like improvement claim.

**Dependencies:** Existing readiness history. Reliable historical questionnaire comparisons
may require a stored catalog version or competency snapshot; investigate before charting.

### US-12 — Know which information is verified or incomplete

**Priority:** P0 · **Actor:** Learner evaluating a qualification or provider

As a learner, I want visible source and freshness information so that I know what to
confirm before planning travel, payment, or assessment.

**Current foundation:** Skills Bridge already shows source/retrieval information and
mapping limitations; certificates distinguish verified from self-reported. Local delivery
fixtures and current public catalog/delivery schemas lack equivalent provenance fields.

**Acceptance criteria:**

1. Add explicit source type, source reference when available, and verification/retrieval
   timestamps to applicable backend records/responses. Unknown values stay unknown.
2. Cards identify development/example listings. Production or verified labels appear only
   when backed by data; a website link alone does not establish verification.
3. Show available source links and dates in qualification/center details and retain
   “Self-reported” versus “Verified” certification labels.
4. Preserve Skills Bridge attribution, extraction/privacy explanation, and the distinction
   between international mappings and certification equivalency. Opening the page does
   not itself send a lookup.

**Dependencies:** Backend schema, migrations, seed/import provenance, API client, and content
policy. An accurate dataset-level development notice is the interim frontend deliverable;
it cannot establish per-record verification.

### US-13 — Complete core tasks with keyboard and on a phone

**Priority:** P0 · **Actor:** Learner using assistive technology or a small screen

As a learner, I want readable layouts, named controls, and predictable focus so that I can
complete the same journey with a keyboard, screen reader, or phone.

**Current foundation:** Native Streamlit widgets, responsive styles, and labelled controls
are present. A cohesive end-to-end accessibility audit remains necessary.

**Acceptance criteria:**

1. At 390 px width and at 200% browser zoom, core forms and actions are readable without
   clipped labels or page-level horizontal scrolling; dense data has a usable alternative.
2. Keyboard users can reach navigation, dialogs, filters, readiness answers, and submission
   actions in a logical order with visible focus and no keyboard trap.
3. Errors, selected states, and application statuses use words or icons as well as color.
   All interactive controls have meaningful accessible names.
4. Verify body text contrast of at least 4.5:1 and large text at least 3:1, and manually
   test goal-to-readiness and application review with keyboard and one screen reader.

**Dependencies:** Current theme, shared presentation, training component, and account dialog.
Attach audit results to each release slice; native widgets alone do not prove completion.

### US-14 — Recover without losing work

**Priority:** P0 · **Actor:** Learner with an intermittent connection

As a learner, I want a failed request to preserve my draft and show the next safe action
so that a temporary problem does not make me restart or duplicate a submission.

**Current foundation:** The app handles several API errors and has catalog/training retry
states, but recovery behavior needs consistent coverage across the full journey.

**Acceptance criteria:**

1. Simulated failures in matching, readiness, saving, and training load show a task-specific
   message and retain the relevant goal, filters, or unsent answers.
2. A failed refresh distinguishes last-loaded information from current information and
   never substitutes “No results” for an unavailable service.
3. Expired authentication explains that sign-in is required again; protected records are
   cleared according to account isolation rules, and no failed write is shown as saved.
4. Retry a read safely. For an ambiguous write outcome, check server state or use
   idempotency before resubmitting; do not automatically repeat applications or saves.

**Dependencies:** Existing error types and shared API client; US-02 write recovery. Add
idempotency support where existing read endpoints cannot reconcile an uncertain write.

### US-15 — Read key guidance in English or Filipino

**Priority:** P2 · **Actor:** Learner who prefers Filipino interface guidance

As a learner, I want to choose English or Filipino interface copy so that I can understand
the steps and limitations in the language I am most comfortable reading.

**Current foundation:** Goal matching supports Filipino/Taglish inputs; the interface is
primarily English. Input-language support is not a translated interface.

**Acceptance criteria:**

1. A language control updates navigation, key form labels, helper text, errors, and
   readiness answer labels without erasing the active journey.
2. Keep official qualification names/codes intact and label untranslated source content
   consistently; do not silently machine-translate official competency definitions.
3. Bilingual reviewers approve the goal, readiness, privacy, and application wording.
4. Long translations wrap correctly on phones, and stored API values remain unchanged
   when only the display language changes.

**Dependencies:** Shared copy catalog and bilingual content review. Account-level language
preferences require backend persistence; session-only selection is sufficient initially.

## Validation and pilot learning

Validate the smallest relevant behavior with mocked API/state tests, then exercise the
actual pages in a browser at desktop and phone sizes. Include guest and signed-in paths,
no matches, empty catalog, missing listing values, expired sign-in, and failed requests.
Do not treat passing UI tests as proof of accessibility or real listing verification.

For the pilot, observe whether learners can explain the suggested next step, complete a
readiness check, find a suitable center, and locate a submitted assessment application.
Record completion and failure counts only if consent and a measurement design are in
place. Existing aggregate reports can inform outcomes; new click-level analytics or
personal-goal logging are separate work, not prerequisites for these stories.

Sources reviewed: `README.md`, `frontend/app.py`, `frontend/training_view.py`,
`frontend/centers.py`, `frontend/api_client.py`, `frontend/skills_bridge_view.py`,
`frontend/portal_app.py`, `frontend/portal/journey.py`, `frontend/portal/session.py`,
`backend/tesda_track/schemas/{catalog,delivery,records}.py`,
`backend/seed/delivery_sites.json`, and the earlier portal implementation plan.
