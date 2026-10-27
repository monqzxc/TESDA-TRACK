import { useQuery } from '@tanstack/react-query'
import { useId, useState, type ReactNode } from 'react'
import { Button } from 'react-aria-components'
import { failureMessage } from '../../auth/fields.tsx'
import { Icon } from '../../components/Icon.tsx'
import { QueryBoundary, throwWithoutData } from '../../components/QueryBoundary.tsx'
import { cssVars, cx } from '../../lib/style.ts'
import { button } from '../../styles/buttons.ts'
import { DemandChart, FeedbackCharts } from './RecommendationAnalyticsCharts.tsx'
import {
  recommendationAnalyticsQuery,
  type Period,
  type RecommendationAnalytics as Analytics,
} from './api.ts'

type Review = Analytics['improvement_priorities'][number]
type Priority = Review['priority']
const priorities: Record<Priority, string> = {
  high: 'High priority',
  medium: 'Review next',
  collect_feedback: 'Collect more feedback',
}
const help = 'mt-1 mb-0 text-14 leading-[1.55] text-muted'
const empty =
  'm-0 rounded-12 border border-dashed border-dash bg-empty px-4 py-3 text-14 text-muted'
const heading = 'mt-0 mb-1 text-17 font-bold text-navy'
const th = 'border-b border-border px-3 py-2 text-left font-semibold text-muted'
const td = 'border-b border-rule px-3 py-3 text-left align-top text-navy'
const number = 'text-right tabular-nums'
const count = (value: number) => value.toLocaleString('en-PH')
const rate = (value: number | null) =>
  value === null ? 'No answers yet' : `${Math.round(value * 100)}%`
const date = (value: string) =>
  new Date(`${value}T00:00:00Z`).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })

/** A failure in this additional report leaves the other reports available. */
export function RecommendationAnalytics({ period }: { period: Period }) {
  return (
    <QueryBoundary>
      <AnalyticsReport period={period} />
    </QueryBoundary>
  )
}

function AnalyticsReport({ period }: { period: Period }) {
  const id = useId()
  const query = useQuery({
    ...recommendationAnalyticsQuery(period),
    throwOnError: throwWithoutData,
  })
  const data = query.data
  return (
    <section
      aria-labelledby={id}
      aria-busy={query.isPending || query.isPlaceholderData}
      className="min-w-0 rounded-16 border border-border bg-surface px-5 py-5 max-sm:px-4"
    >
      <div className="mb-5 flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-12 bg-tint text-blue">
          <Icon name="growth" size="1.3rem" />
        </span>
        <div>
          <h2 id={id} className="mt-0 mb-1 text-[1.3rem] text-navy">
            Recommendation analytics
          </h2>
          <p className={help}>
            See which qualifications receive positive feedback, how learner interest changes, and
            where to review the recommendation system.
          </p>
        </div>
      </div>
      {!data ? (
        <p role="status" className={help}>
          Loading recommendation analytics…
        </p>
      ) : (
        <div className="flex min-w-0 flex-col gap-6">
          {query.isPlaceholderData && (
            <p role="status" className={help}>
              Updating recommendation analytics for the selected period…
            </p>
          )}
          {query.isError && (
            <p role="alert" className={help}>
              {failureMessage(query.error)} The last available analytics are shown.{' '}
              <Button
                onPress={() => void query.refetch()}
                className={button({ variant: 'tertiary' })}
              >
                Try again
              </Button>
            </p>
          )}
          <dl className="m-0 grid grid-cols-3 gap-3 max-sm:grid-cols-1">
            <Figure label="Positive feedback (Yes)" value={count(data.accepted)} />
            <Figure label="Negative feedback (No)" value={count(data.rejected)} />
            <Figure label="Positive feedback rate" value={rate(data.acceptance_rate)} />
          </dl>
          <FeedbackCharts data={data} />
          <QualificationGroups rows={data.qualification_groups} />
          <DemandOutlook demand={data.demand} />
          <ImprovementPriorities
            rows={data.improvement_priorities}
            period={period}
            feedbackAnswers={data.feedback_answers}
            updating={query.isFetching || query.isPlaceholderData}
          />
        </div>
      )}
    </section>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-12 border border-rule bg-soft px-4 py-3">
      <dt className="text-13 text-ink">{label}</dt>
      <dd className="mt-1 mb-0 ml-0 font-display text-[1.625rem] font-bold text-navy">{value}</dd>
    </div>
  )
}

function AnalyticsTable({ caption, children }: { caption: string; children: ReactNode }) {
  const id = useId()
  return (
    // A named, focusable scrolling region lets a keyboard user reach the remaining columns.
    <div
      role="region"
      aria-labelledby={id}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      className="mt-3 overflow-x-auto rounded-8 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <table className="w-full border-collapse text-14">
        <caption id={id} className="sr-only">
          {caption}
        </caption>
        {children}
      </table>
    </div>
  )
}

function QualificationGroups({ rows }: { rows: Analytics['qualification_groups'] }) {
  const most = Math.max(1, ...rows.map((row) => row.accepted))
  return (
    <div className="min-w-0">
      <h3 className={heading}>Qualification feedback groups</h3>
      <p className={help}>
        Yes means the respondent was satisfied with the recommendation. These are feedback
        responses, not confirmed agreements or enrollments. Choices count distinct signed-in
        learners separately.
      </p>
      {rows.length === 0 ? (
        <p className={cx(empty, 'mt-3')}>
          No qualification choices or feedback in the selected period.
        </p>
      ) : (
        <AnalyticsTable caption="Positive feedback and learner choices by qualification">
          <thead>
            <tr>
              <th scope="col" className={th}>
                Qualification
              </th>
              <th scope="col" className={th}>
                Positive responses
              </th>
              <th scope="col" className={cx(th, number)}>
                All responses
              </th>
              <th scope="col" className={cx(th, number)}>
                Positive rate
              </th>
              <th scope="col" className={cx(th, number)}>
                Learners who chose it
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.qualification.code}>
                <th scope="row" className={cx(td, 'min-w-44 font-semibold')}>
                  {row.qualification.name}
                  <span className="mt-1 block text-12 font-normal text-muted">
                    {row.qualification.sector}
                  </span>
                </th>
                <td className={td}>
                  <span className="flex min-w-32 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="h-2 flex-1 overflow-hidden rounded-full bg-bar"
                    >
                      <span
                        className="block h-full w-[calc(var(--share)*1%)] rounded-full bg-blue"
                        style={cssVars({ '--share': Math.round((row.accepted / most) * 100) })}
                      />
                    </span>
                    <span className="tabular-nums">{count(row.accepted)}</span>
                  </span>
                </td>
                <td className={cx(td, number)}>{count(row.feedback_answers)}</td>
                <td className={cx(td, number)}>{rate(row.acceptance_rate)}</td>
                <td className={cx(td, number)}>{count(row.chosen_learners)}</td>
              </tr>
            ))}
          </tbody>
        </AnalyticsTable>
      )}
    </div>
  )
}

function DemandOutlook({ demand }: { demand: Analytics['demand'] }) {
  return (
    <div className="min-w-0 border-t border-rule pt-5">
      <h3 className={heading}>Qualification demand outlook</h3>
      <p className={help}>
        Learner choices: {date(demand.recent_from)}–{date(demand.recent_to)} compared with{' '}
        {date(demand.previous_from)}–{date(demand.previous_to)}. Each learner counts once per
        qualification in each window.
      </p>
      <p className={help}>
        Projection: {date(demand.forecast_from)}–{date(demand.forecast_to)}. The 30-day trend
        projection extends the change between these windows. It estimates learner interest, not
        job-market demand. It needs 60 days of history, at least {demand.minimum_recent_learners}{' '}
        recent learners and {demand.minimum_previous_learners} prior learners for the qualification.
      </p>
      <p className={help}>
        Choices are grouped by when the recommendation was first saved, using its current selection.
        Later edits can change prior counts. Only completed days are compared, and the selected
        report dates also limit each window.
      </p>
      <div className="mt-4">
        <DemandChart demand={demand} />
      </div>
      {demand.qualifications.length === 0 ? (
        <p className={cx(empty, 'mt-3')}>No recent qualification choices to project yet.</p>
      ) : (
        <AnalyticsTable
          caption={`Learner interest and projection for ${date(demand.forecast_from)}–${date(demand.forecast_to)}`}
        >
          <thead>
            <tr>
              <th scope="col" className={th}>
                Qualification
              </th>
              <th scope="col" className={cx(th, number)}>
                Prior 30 days
              </th>
              <th scope="col" className={cx(th, number)}>
                Recent 30 days
              </th>
              <th scope="col" className={cx(th, number)}>
                Change
              </th>
              <th scope="col" className={cx(th, number)}>
                Next 30 days (estimate)
              </th>
            </tr>
          </thead>
          <tbody>
            {demand.qualifications.map((row) => (
              <tr key={row.qualification.code}>
                <th scope="row" className={cx(td, 'min-w-44 font-semibold')}>
                  {row.qualification.name}
                </th>
                <td className={cx(td, number)}>{count(row.previous_learners)}</td>
                <td className={cx(td, number)}>{count(row.recent_learners)}</td>
                <td className={cx(td, number)}>
                  {row.change_rate === null
                    ? 'No prior baseline'
                    : `${row.change_rate > 0 ? '+' : ''}${Math.round(row.change_rate * 100)}%`}
                </td>
                <td className={cx(td, number)}>
                  {row.status === 'available' && row.projected_learners !== null ? (
                    count(row.projected_learners)
                  ) : (
                    <span className="text-13 text-muted">
                      {row.status === 'insufficient_history'
                        ? 'Needs more history'
                        : 'Needs more learners'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </AnalyticsTable>
      )}
    </div>
  )
}

function ImprovementPriorities({
  rows,
  period,
  feedbackAnswers,
  updating,
}: {
  rows: Review[]
  period: Period
  feedbackAnswers: number
  updating: boolean
}) {
  const id = useId()
  const [priority, setPriority] = useState<Priority | 'all'>('all')
  const [exported, setExported] = useState(false)
  const visible = rows.filter((row) => priority === 'all' || row.priority === priority)
  return (
    <div className="min-w-0 border-t border-rule pt-5">
      <h3 className={heading}>Where to improve recommendations</h3>
      <p className={help}>
        Review groups by qualification, matching model and learner intent. Wrong matches can guide
        reviewed model-training examples; readiness and pathway issues need rules or content review.
        A lower-ranked or library choice can be a ranking review signal.
      </p>
      <p className={help}>
        These aggregates identify review priorities. They contain no learner goals and are not a
        training dataset. Feedback may include repeat or anonymous responses.
      </p>
      {rows.length === 0 ? (
        <p className={cx(empty, 'mt-3')}>
          {feedbackAnswers === 0
            ? 'No feedback groups to review yet. Collect feedback after recommendations.'
            : 'No groups currently need review. Continue collecting feedback to monitor recommendation quality.'}
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor={id} className="text-13 font-semibold text-navy">
                Review priority
              </label>
              <select
                id={id}
                value={priority}
                onChange={(event) => setPriority(event.target.value as Priority | 'all')}
                className="min-h-11 rounded-10 border border-border bg-surface px-3 text-14 text-navy"
              >
                <option value="all">All priorities</option>
                {Object.entries(priorities).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <Button
              className={button({ text: 14 })}
              isDisabled={visible.length === 0 || updating}
              onPress={() => {
                downloadReviewPlan(visible, period)
                setExported(true)
              }}
            >
              Export review plan (CSV)
            </Button>
          </div>
          <p role="status" className="mt-2 mb-0 text-13 text-muted">
            {exported ? 'Review plan downloaded.' : ''}
          </p>
          {visible.length === 0 ? (
            <p className={cx(empty, 'mt-3')}>No groups have this review priority.</p>
          ) : (
            <AnalyticsTable caption="Recommendation improvement priorities by qualification, model and intent">
              <thead>
                <tr>
                  <th scope="col" className={th}>
                    Review group
                  </th>
                  <th scope="col" className={th}>
                    Evidence
                  </th>
                  <th scope="col" className={th}>
                    Priority and next action
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={JSON.stringify([row.qualification.code, row.model, row.intent])}>
                    <th scope="row" className={cx(td, 'min-w-48 font-semibold')}>
                      {row.qualification.name}
                      <span className="mt-1 block text-12 font-normal [overflow-wrap:anywhere] text-muted">
                        {row.model ?? 'Keywords only'}
                      </span>
                      <span className="mt-1 block text-13 font-normal text-ink">
                        Intent: {row.intent.replaceAll('_', ' ')}
                      </span>
                    </th>
                    <td className={cx(td, 'min-w-52')}>
                      <p className="m-0 font-semibold">
                        {count(row.feedback_answers)} responses · {rate(row.acceptance_rate)}{' '}
                        positive
                      </p>
                      <p className="mt-1 mb-0 text-13 leading-[1.55] text-muted">
                        Wrong qualification: {count(row.wrong_qualification)}
                        <br />
                        Readiness: {count(row.readiness_off)} · Pathway:{' '}
                        {count(row.pathway_not_helpful)}
                        <br />
                        No reason: {count(row.no_reason)} · Ranking signals:{' '}
                        {count(row.ranking_mismatches)}
                      </p>
                    </td>
                    <td className={cx(td, 'min-w-56')}>
                      <span
                        className={cx(
                          'inline-block rounded-full px-3 py-1 text-12 font-semibold',
                          row.priority === 'high'
                            ? 'bg-warn-bg text-warn-ink'
                            : 'bg-tint text-blue',
                        )}
                      >
                        {priorities[row.priority]}
                      </span>
                      <p className="mt-2 mb-0 text-14 leading-[1.55]">{row.recommendation}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </AnalyticsTable>
          )}
        </>
      )}
    </div>
  )
}

/** Aggregate review planning only; spreadsheet formula prefixes are escaped even inside quoted cells. */
export function reviewPlanCsv(rows: Review[], period: Period): string {
  const values: (string | number | null)[][] = [
    [
      'Period from',
      'Period to',
      'Qualification code',
      'Qualification',
      'Model',
      'Intent',
      'Responses',
      'Positive responses',
      'Negative responses',
      'Positive rate',
      'Wrong qualification',
      'Readiness issues',
      'Pathway issues',
      'No reason',
      'Ranking signals',
      'Priority',
      'Recommended review action',
    ],
    ...rows.map((row) => [
      period.from,
      period.to,
      row.qualification.code,
      row.qualification.name,
      row.model ?? 'Keywords only',
      row.intent,
      row.feedback_answers,
      row.accepted,
      row.rejected,
      row.acceptance_rate,
      row.wrong_qualification,
      row.readiness_off,
      row.pathway_not_helpful,
      row.no_reason,
      row.ranking_mismatches,
      priorities[row.priority],
      row.recommendation,
    ]),
  ]
  return (
    values
      .map((row) =>
        row
          .map((value) => {
            let cell = String(value ?? '')
            if (/^[\s]*[=+\-@]|^[\t\r\n]/.test(cell)) cell = `'${cell}`
            return `"${cell.replaceAll('"', '""')}"`
          })
          .join(','),
      )
      .join('\r\n') + '\r\n'
  )
}

function downloadReviewPlan(rows: Review[], period: Period) {
  const blob = new Blob(['\uFEFF', reviewPlanCsv(rows, period)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'tesda-track-recommendation-review.csv'
  link.hidden = true
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 40_000)
}
