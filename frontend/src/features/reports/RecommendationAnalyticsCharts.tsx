import { useId, type ReactNode } from 'react'
import { cssVars, cx } from '../../lib/style.ts'
import type { RecommendationAnalytics as Analytics } from './api.ts'

const count = (value: number) => value.toLocaleString('en-PH')
const chartLimit = 6
const positive = 'bg-blue'
const negative =
  'bg-violet bg-[repeating-linear-gradient(135deg,transparent,transparent_4px,var(--track-surface)_4px,var(--track-surface)_5px)]'
const estimate = 'border-2 border-dashed border-violet bg-tile-violet'

function ChartCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  const id = useId()
  return (
    <figure
      aria-labelledby={id}
      className="m-0 min-w-0 rounded-12 border border-border bg-panel p-4"
    >
      <figcaption>
        <h3 id={id} className="m-0 text-17 font-bold text-navy">
          {title}
        </h3>
        <p className="mt-1 mb-4 text-13 leading-[1.55] text-muted">{description}</p>
      </figcaption>
      {children}
    </figure>
  )
}

function EmptyChart({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 rounded-10 border border-dashed border-dash bg-empty p-4 text-14 text-muted">
      {children}
    </p>
  )
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="mt-0 mb-4 flex list-none flex-wrap gap-x-4 gap-y-2 p-0 text-13 text-ink">
      {items.map(({ label, color }) => (
        <li key={label} className="flex items-center gap-2">
          <span aria-hidden="true" className={cx('h-3 w-4 rounded-[2px]', color)} />
          {label}
        </li>
      ))}
    </ul>
  )
}

/** A shared count scale keeps every row and series comparable, including zero values. */
function maximum(values: number[]) {
  const largest = Math.max(1, ...values)
  const magnitude = 10 ** Math.floor(Math.log10(largest))
  return [1, 2, 5, 10].map((step) => step * magnitude).find((step) => step >= largest) ?? largest
}

function Scale({ max, unit }: { max: number; unit: string }) {
  return (
    <div aria-hidden="true" className="mb-3 flex justify-between gap-2 text-12 text-muted">
      <span>0</span>
      <span>{unit}</span>
      <span>{count(max)}</span>
    </div>
  )
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <span aria-hidden="true" className="block h-3 overflow-hidden rounded-[3px] bg-bar">
      {value > 0 && (
        <span
          className={cx('block h-full w-[calc(var(--share)*1%)] rounded-[3px]', color)}
          style={cssVars({ '--share': (value / max) * 100 })}
        />
      )}
    </span>
  )
}

export function FeedbackCharts({ data }: { data: Analytics }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,0.85fr)_minmax(0,1.4fr)] gap-4 max-lg:grid-cols-1">
      <FeedbackDistribution data={data} />
      <QualificationFeedback rows={data.qualification_groups} />
    </div>
  )
}

function FeedbackDistribution({ data }: { data: Analytics }) {
  const share = data.feedback_answers > 0 ? data.accepted / data.feedback_answers : 0
  return (
    <ChartCard
      title="Feedback distribution"
      description="Satisfaction responses for the selected period."
    >
      {data.feedback_answers === 0 ? (
        <EmptyChart>
          No feedback to visualize yet. Collect Yes or No responses to see the distribution.
        </EmptyChart>
      ) : (
        <>
          <div className="relative mx-auto mb-4 size-44">
            <svg
              viewBox="0 0 160 160"
              role="img"
              aria-label={`${data.accepted} positive and ${data.rejected} negative responses out of ${data.feedback_answers} feedback answers.`}
              className="block size-full -rotate-90"
            >
              <circle
                cx="80"
                cy="80"
                r="62"
                fill="none"
                strokeWidth="20"
                className="stroke-violet"
              />
              <circle
                cx="80"
                cy="80"
                r="62"
                fill="none"
                strokeWidth="20"
                className="stroke-blue"
                pathLength="100"
                strokeDasharray={`${share * 100} 100`}
              />
            </svg>
            <div
              aria-hidden="true"
              className="absolute inset-0 flex flex-col items-center justify-center"
            >
              <span className="font-display text-[2rem] leading-tight font-bold text-navy">
                {Math.round(share * 100)}%
              </span>
              <span className="text-13 text-muted">positive</span>
            </div>
          </div>
          <ul className="m-0 list-none space-y-2 p-0 text-14 text-ink">
            {[
              { label: 'Positive (Yes)', value: data.accepted, color: positive },
              { label: 'Negative (No)', value: data.rejected, color: 'bg-violet' },
            ].map(({ label, value, color }) => (
              <li key={label} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <span aria-hidden="true" className={cx('size-3 rounded-full', color)} />
                  {label}
                </span>
                <span className="font-semibold text-navy tabular-nums">{count(value)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 mb-0 border-t border-border pt-3 text-13 text-muted">
            {count(data.feedback_answers)} total feedback responses
          </p>
        </>
      )}
    </ChartCard>
  )
}

function QualificationFeedback({ rows }: { rows: Analytics['qualification_groups'] }) {
  const ranked = rows
    .filter((row) => row.feedback_answers > 0)
    .sort(
      (a, b) =>
        b.feedback_answers - a.feedback_answers ||
        a.qualification.name.localeCompare(b.qualification.name),
    )
  const visible = ranked.slice(0, chartLimit)
  const max = maximum(visible.map((row) => row.feedback_answers))
  return (
    <ChartCard
      title="Feedback by qualification"
      description={`Compare Yes and No responses${ranked.length > chartLimit ? ` for the top ${chartLimit} qualifications by response count` : ' by qualification'}. Full details are in the table below.`}
    >
      {visible.length === 0 ? (
        <EmptyChart>No qualification feedback to chart in the selected period.</EmptyChart>
      ) : (
        <>
          <Legend
            items={[
              { label: 'Positive (Yes)', color: positive },
              { label: 'Negative (No)', color: negative },
            ]}
          />
          <Scale max={max} unit="Feedback responses" />
          <ol className="m-0 list-none space-y-4 p-0">
            {visible.map((row) => (
              <li key={row.qualification.code}>
                <p className="mt-0 mb-1 text-14 leading-snug font-semibold [overflow-wrap:anywhere] text-navy">
                  {row.qualification.name}
                </p>
                <p className="mt-0 mb-2 text-12 text-muted tabular-nums">
                  {count(row.accepted)} Yes · {count(row.rejected)} No
                </p>
                <div aria-hidden="true" className="flex h-4 overflow-hidden rounded-[3px] bg-bar">
                  <span
                    className={cx('h-full w-[calc(var(--share)*1%)]', positive)}
                    style={cssVars({ '--share': (row.accepted / max) * 100 })}
                  />
                  <span
                    className={cx('h-full w-[calc(var(--share)*1%)]', negative)}
                    style={cssVars({ '--share': (row.rejected / max) * 100 })}
                  />
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </ChartCard>
  )
}

export function DemandChart({ demand }: { demand: Analytics['demand'] }) {
  const ranked = [...demand.qualifications].sort(
    (a, b) =>
      b.recent_learners - a.recent_learners ||
      a.qualification.name.localeCompare(b.qualification.name),
  )
  const visible = ranked.slice(0, chartLimit)
  const max = maximum(
    visible.flatMap((row) => [
      row.previous_learners,
      row.recent_learners,
      row.status === 'available' && row.projected_learners !== null ? row.projected_learners : 0,
    ]),
  )
  return (
    <ChartCard
      title="Learner interest comparison"
      description={`Prior and recent 30-day learner choices alongside the next 30-day estimate.${ranked.length > chartLimit ? ` Showing the top ${chartLimit} qualifications by recent learners; all rows appear below.` : ''}`}
    >
      {visible.length === 0 ? (
        <EmptyChart>No learner choices to compare in the selected period.</EmptyChart>
      ) : (
        <>
          <Legend
            items={[
              { label: 'Prior 30 days', color: 'bg-muted' },
              { label: 'Recent 30 days', color: positive },
              { label: 'Next 30 days (estimate)', color: estimate },
            ]}
          />
          <div
            aria-hidden="true"
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-5 max-sm:grid-cols-1"
          >
            <span className="max-sm:hidden" />
            <div className="pr-[3.5rem] pl-[4.5rem]">
              <Scale max={max} unit="Learners" />
            </div>
          </div>
          <ol className="m-0 list-none space-y-5 p-0">
            {visible.map((row) => {
              const projected = row.status === 'available' ? row.projected_learners : null
              return (
                <li
                  key={row.qualification.code}
                  className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-5 gap-y-2 max-sm:grid-cols-1"
                >
                  <p className="m-0 text-14 leading-snug font-semibold [overflow-wrap:anywhere] text-navy">
                    {row.qualification.name}
                  </p>
                  <div className="min-w-0 space-y-2">
                    {[
                      { label: 'Prior', value: row.previous_learners, color: 'bg-muted' },
                      { label: 'Recent', value: row.recent_learners, color: positive },
                      { label: 'Estimate', value: projected, color: estimate },
                    ].map(({ label, value, color }) => (
                      <div
                        key={label}
                        className="grid grid-cols-[4rem_minmax(0,1fr)_3rem] items-center gap-2 text-12"
                      >
                        <span className="text-muted">{label}</span>
                        {value === null ? (
                          <span className="col-span-2 text-muted">
                            {row.status === 'insufficient_history'
                              ? 'Estimate unavailable: more history needed'
                              : 'Estimate unavailable: more learners needed'}
                          </span>
                        ) : (
                          <>
                            <Bar value={value} max={max} color={color} />
                            <span className="text-right font-semibold text-navy tabular-nums">
                              {count(value)}
                            </span>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </li>
              )
            })}
          </ol>
        </>
      )}
    </ChartCard>
  )
}
