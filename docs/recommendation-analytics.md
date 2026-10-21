# Recommendation analytics

The Recommendation section of the admin workspace and the Reports page use aggregate
recommendation analytics to plan training capacity and review the matcher. Access requires
`reports:read`, independently enforced by the API.

## Read the signals separately

| Signal | What it measures | How to use it |
| --- | --- | --- |
| Positive feedback | A Yes answer to “Are you satisfied with this recommendation?” | Compare satisfaction by qualification and investigate repeated No answers. |
| Selected learners | Distinct signed-in learners with a saved session selecting a qualification | Compare recorded learner interest and recent demand. |
| Lower-ranked or library choice | The selected qualification was below first place, or outside a nonempty match list | Review ranking and catalog coverage; another choice alone is not proof that a match was wrong. |
| No-match requests | Matching requests that returned no qualification | Check coverage and abstention alongside satisfaction. |

Positive feedback counts answers, not unique people. Feedback can come from guests and is
not linked to an account. It is not proof of enrollment, completion, employment demand,
or independently measured model accuracy. Recorded qualification choices are also not
enrollments. Repeated saved sessions from one learner must not inflate that qualification's
selected-learner count.

The analytics return counts, rates, qualification summaries and review actions. They do
not expose goals, learner names, emails, account IDs, feedback IDs, or goal hashes. Feedback
stores only a keyed hash of the goal; that hash cannot supply training text. Existing saved
sessions remain private.

## Demand windows and projections

The API endpoint is `GET /api/v1/admin/reports/recommendation-analytics`, with the same
inclusive `date_from` and `date_to` filters as the other reports. Dates use Philippine time.

Demand compares two adjacent 30-day windows ending on the earlier of yesterday and the
selected end date. It excludes the current partial day. Counts intersect the reporting
period, so a period too short to contain both windows suppresses the projection. Dates for
both observation windows and the following projected 30 days are returned explicitly.

Counts use distinct learners within each qualification and window; one learner can appear
in several qualification groups or in both windows. They describe the qualification
currently selected in sessions **created** in those windows. The database does not store a
separate selection timestamp. Editing a saved session later can change the old cohort's
qualification count.

A qualification receives a projection only when its recorded selection history reaches
the start of the previous window, the report includes both windows, and it has at least
10 recent selected learners and five previous selected learners. Otherwise the value is
null and the response identifies insufficient history or insufficient volume.

The estimate is `max(0, 2 × recent learners − previous learners)`: it extends the observed
change once into the next 30 days. This is a transparent trend heuristic, not a fitted or
validated demand model. It has no seasonal adjustment or uncertainty interval. It projects
recorded learner interest in this application, not national employment demand or confirmed
training places. An unavailable projection does not mean zero demand.

## Turn review priorities into model improvements

Use the number of responses alongside any rate. A small group needs more feedback before
it can support a firm conclusion. High-volume dissatisfaction deserves investigation, but
does not establish its cause.

Priorities group feedback by qualification, matching-model name and learner intent. Groups
with fewer than five responses ask for more feedback. Other groups with dissatisfaction or
lower-ranked choices receive a medium review priority. A group becomes high priority with
at least 10 responses, at least three negative answers, and a negative share of at least
30%. These are review heuristics rather than statistical confidence or model-accuracy
thresholds. Groups with at least five entirely positive responses and no ranking mismatch
are omitted from the corrective review queue.

| Feedback reason | First review | Possible improvement |
| --- | --- | --- |
| Wrong qualification | Qualification labels, close alternatives, goal interpretation and ranking | Author and review additional catalog-based goal examples for the affected qualification and competing trades; mine hard negatives after checking that alternatives are actually wrong. |
| Readiness result feels wrong | Self-reported competency answers and readiness scoring | Review scoring and qualification-specific competency guidance. |
| Pathway is not helpful | Curated pathway steps, prerequisites and next-step advice | Revise pathway content or routing rules. |
| No reason given | Obtain more categorized feedback | Collect evidence before choosing a training or rules change. |

Do not automatically convert dissatisfaction into a negative training label. A learner can
like an alternative, disagree with readiness, or need a different next step while the
qualification match itself is reasonable. Satisfaction comparisons between model versions
also involve different traffic and dates; they are observational rather than controlled
accuracy comparisons.

The existing [training guide](../backend/training/README.md) uses catalog text and authored
goals, not learner records. Use these analytics to choose where to write additional
examples. Keep multiple valid qualification owners where needed, and avoid treating sibling
NC levels as hard negatives unless the goal names a level.

Validate additions on development cases, calibrate on the development split, and use
independent held-out cases to assess a candidate. Keep evaluation examples and their
paraphrases out of training. The [v4 guide](../backend/training/V4.md) explains subject and
language review, coverage audits, exclusion checks, and final sealed evaluation.
