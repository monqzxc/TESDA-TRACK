import { useQuery } from '@tanstack/react-query'
import { useId, useState, type ReactNode } from 'react'
import { Button, ToggleButton } from 'react-aria-components'
import { sourceLink } from '../../components/DataProvenance.tsx'
import { Icon, type IconName } from '../../components/Icon.tsx'
import { cx } from '../../lib/style.ts'
import { button } from '../../styles/buttons.ts'
import {
  qualificationEvidenceQuery,
  type EvidenceMeasure,
  type QualificationEvidenceResponse,
} from './evidenceApi.ts'

const note = 'm-0 text-13 leading-[1.5] text-muted'
const heading = 'm-0 text-15 leading-[1.4] font-bold text-navy'

const supplyLabels = {
  registered_training_sites: 'Recorded training sites',
  registered_training_programs: 'Recorded program listings',
  confirmed_training_offerings: 'Verified training offerings with confirmed intake',
  published_training_slots: 'Published training slots',
  remaining_training_seats: 'Remaining training seats',
  confirmed_assessment_schedules: 'Verified assessment schedules with confirmed availability',
  confirmed_assessment_sites: 'Assessment sites with confirmed schedules',
  remaining_assessment_seats: 'Reported remaining assessment seats',
} as const

function MeasureValue({ measure }: { measure: EvidenceMeasure }) {
  return (
    <>
      <span className="font-bold text-navy tabular-nums">
        {measure.value === null ? 'Unknown' : measure.value.toLocaleString()}
      </span>{' '}
      {measure.unit}
    </>
  )
}

function MeasureDetail({ label, measure }: { label: string; measure: EvidenceMeasure }) {
  return (
    <div className="grid gap-1 border-0 border-t border-solid border-border py-3 first:border-t-0">
      <dt className={heading}>{label}</dt>
      <dd className="m-0 text-14 leading-[1.5] text-ink">
        <MeasureValue measure={measure} />
        <p className="mt-1 mb-0">{measure.statement}</p>
        <p className={note}>
          Evidence known for {measure.known_record_count} of {measure.eligible_record_count}{' '}
          records; {measure.unknown_count} unknown.
        </p>
        {measure.reference_period && <p className={note}>{measure.reference_period}</p>}
        {(measure.limitations ?? []).map((limitation) => (
          <p key={limitation} className={note}>
            {limitation}
          </p>
        ))}
      </dd>
    </div>
  )
}

function EvidenceContent({ data }: { data: QualificationEvidenceResponse }) {
  const postings = data.observed_postings
  const measures = [
    postings.postings,
    postings.employers,
    ...Object.keys(supplyLabels).map((key) => data.supply[key as keyof typeof supplyLabels]),
  ]
  const sources = [...new Set(measures.flatMap((measure) => measure.sources ?? []))]
  const limitations = [...new Set([...data.limitations, ...(postings.postings.limitations ?? [])])]
  return (
    <>
      <p className={note}>
        {postings.postings.geography.label} · Checked{' '}
        <time dateTime={data.context.evaluated_at}>{data.context.evaluated_at.slice(0, 10)}</time>
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <h4 className={heading}>Observed job postings</h4>
          <p className="m-0 text-17 text-ink">
            <MeasureValue measure={postings.postings} />
          </p>
          <p className={note}>{postings.postings.statement}</p>
          <p className={note}>
            Distinct employers: <MeasureValue measure={postings.employers} />
          </p>
          {postings.snapshot_dates.length > 0 && (
            <p className={note}>Snapshot dates: {postings.snapshot_dates.join(', ')}</p>
          )}
          {postings.postings.reference_period && (
            <p className={note}>{postings.postings.reference_period}</p>
          )}
          {postings.posted_between && (
            <p className={note}>Posting dates: {postings.posted_between.join(' to ')}</p>
          )}
          {postings.suspected_duplicate_groups > 0 && (
            <p className={note}>
              {postings.suspected_duplicate_groups} suspected duplicate groups require review.
            </p>
          )}
          {postings.unallocated_count > 0 && (
            <p className={note}>
              {postings.unallocated_count} records have unresolved workplace locations.
            </p>
          )}
          <p className={note}>
            Postings count records, not worker headcounts or a workforce shortage.
          </p>
        </div>
        <div className="grid content-start gap-2">
          <h4 className={heading}>Forecast support</h4>
          {data.forecast_support.length === 0 ? (
            <p className={note}>
              No approved current forecast evidence is available for this selection.
            </p>
          ) : (
            <ul className="m-0 grid list-none gap-3 p-0">
              {data.forecast_support.map((forecast) => {
                const href = sourceLink(forecast.source_url)
                return (
                  <li key={`${forecast.dataset_key}:${forecast.mapping_id}`} className="grid gap-1">
                    <p className="m-0 text-14 font-semibold text-navy">
                      {forecast.occupation_title}
                    </p>
                    <p className={note}>
                      {forecast.classification === 'in_demand' ? 'In demand' : 'Hard to fill'} ·{' '}
                      {forecast.geography.label} · {forecast.period_label}
                    </p>
                    {forecast.geography_match === 'broader_scope' && (
                      <p className={note}>Broader-area evidence; not a local observation.</p>
                    )}
                    <p className={note}>
                      {forecast.publisher} ·{' '}
                      {href ? (
                        <a href={href} target="_blank" rel="noreferrer" className="text-blue">
                          {forecast.source_title}
                        </a>
                      ) : (
                        forecast.source_title
                      )}
                    </p>
                    <p className={note}>{forecast.source_reference}</p>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
      <details className="border-0 border-t border-solid border-border pt-3">
        <summary className="cursor-pointer text-14 font-semibold text-navy">
          Training and assessment supply
        </summary>
        <p className="mt-2 mb-1 text-13 leading-[1.5] text-muted">
          Recorded listings describe the app dataset; current registration, intake and remaining
          seats require separate evidence. Service counts do not establish your eligibility or
          reserve a seat.
        </p>
        <dl className="m-0">
          {Object.entries(supplyLabels).map(([key, label]) => (
            <MeasureDetail
              key={key}
              label={label}
              measure={data.supply[key as keyof typeof supplyLabels]}
            />
          ))}
        </dl>
      </details>
      <details className="border-0 border-t border-solid border-border pt-3">
        <summary className="cursor-pointer text-14 font-semibold text-navy">
          Evidence sources and limitations
        </summary>
        {sources.length > 0 && (
          <ul className="my-2 grid gap-1 pl-5 text-13 leading-[1.5] wrap-anywhere text-muted">
            {sources.map((source) => {
              const href = sourceLink(source)
              return (
                <li key={source}>
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer" className="text-blue">
                      {source}
                    </a>
                  ) : (
                    source
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {limitations.length > 0 && (
          <ul className="my-2 grid gap-1 pl-5 text-13 leading-[1.5] text-muted">
            {limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        )}
      </details>
    </>
  )
}

// A count the records do not establish reads as a quiet dash; screen readers hear what it means.
function Figure({ value }: { value: number | null }) {
  return value === null ? (
    <>
      <span aria-hidden="true" className="font-medium text-muted/60">
        —
      </span>
      <span className="sr-only">Not recorded</span>
    </>
  ) : (
    <>{value.toLocaleString()}</>
  )
}

const groupHeading = 'm-0 flex items-center gap-1.5 text-13 font-bold text-navy [&>svg]:text-blue'

type Kpi = { key: string; label: string; icon: IconName; tone: string; measure: EvidenceMeasure }

/** One group of headline counts. A tile, pressed, opens what its number means beneath the group. */
function KpiGroup({
  title,
  icon,
  items,
  open,
  onOpen,
}: {
  title: string
  icon: IconName
  items: Kpi[]
  open: string | null
  onOpen: (key: string | null) => void
}) {
  const detailId = useId()
  const active = items.find((item) => item.key === open)
  return (
    <div role="group" aria-label={title} className="grid gap-2">
      <h4 className={groupHeading}>
        <Icon name={icon} size={16} />
        {title}
      </h4>
      <div className={cx('grid gap-2', items.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
        {items.map((item) => (
          <ToggleButton
            key={item.key}
            aria-controls={detailId}
            isSelected={open === item.key}
            onChange={(on) => onOpen(on ? item.key : null)}
            className="group grid min-w-0 cursor-pointer content-start justify-items-start gap-1.5 rounded-12 border border-border bg-surface p-2.5 text-left shadow-card transition-[border-color,background-color,box-shadow,transform] duration-200 ease-out data-focus-visible:outline-2 data-focus-visible:outline-focus data-hovered:border-hover-border data-hovered:shadow-[0_6px_18px_-10px_rgb(var(--track-shadow-rgb)/0.35)] data-pressed:scale-[0.98] data-selected:border-pill-border data-selected:bg-pill"
          >
            <span className={cx('grid size-7 place-items-center rounded-8', item.tone)}>
              <Icon name={item.icon} size={15} />
            </span>
            <span className="text-24 leading-none font-bold text-navy tabular-nums">
              <Figure value={item.measure.value} />
            </span>
            <span className="text-12 leading-[1.3] font-semibold text-muted group-data-selected:text-pill-hover-ink">
              {item.label}
            </span>
          </ToggleButton>
        ))}
      </div>
      <div id={detailId} aria-live="polite">
        {active && (
          <div
            key={active.key}
            className="grid animate-[rise_0.28s_cubic-bezier(0.2,0.75,0.2,1)_backwards] gap-1 rounded-10 bg-soft px-3 py-2.5"
          >
            <p className="m-0 text-13 leading-[1.5] text-ink">{active.measure.statement}</p>
            <p className="m-0 text-12 leading-[1.45] text-muted">
              Known for {active.measure.known_record_count.toLocaleString()} of{' '}
              {active.measure.eligible_record_count.toLocaleString()} records
              {active.measure.reference_period ? ` · ${active.measure.reference_period}` : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

const disclosure =
  'group/more border-0 border-t border-solid border-rule [&>summary::-webkit-details-marker]:hidden'
const summary =
  'flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-8 text-13 font-semibold text-navy focus-visible:outline-2 focus-visible:outline-focus hover:text-blue'

function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className={disclosure}>
      <summary className={summary}>
        {title}
        <Icon
          name="chevron"
          size={16}
          className="text-muted transition-transform duration-200 group-open/more:rotate-180"
        />
      </summary>
      <div className="grid gap-2 pb-3">{children}</div>
    </details>
  )
}

/** The explore panel's reading: headline demand and supply counts first, every caveat one tap away. */
function CompactEvidence({
  data,
  note,
}: {
  data: QualificationEvidenceResponse
  note?: ReactNode
}) {
  const [open, setOpen] = useState<string | null>(null)
  const postings = data.observed_postings
  const supply = (
    key: keyof typeof supplyLabels,
    label: string,
    icon: IconName,
    tone: string,
  ): Kpi => ({ key, label, icon, tone, measure: data.supply[key] })
  const demand: Kpi[] = [
    {
      key: 'postings',
      label: 'Job postings',
      icon: 'briefcase',
      tone: 'bg-good-bg text-good-ink',
      measure: postings.postings,
    },
    {
      key: 'employers',
      label: 'Employers',
      icon: 'person',
      tone: 'bg-good-bg text-good-ink',
      measure: postings.employers,
    },
  ]
  const services: Kpi[] = [
    supply('registered_training_sites', 'Training sites', 'learn', 'bg-tint text-blue'),
    supply('registered_training_programs', 'Programs', 'book', 'bg-tint text-blue'),
    supply('confirmed_assessment_sites', 'Assessment sites', 'award', 'bg-teal/10 text-teal'),
  ]
  const measures = [
    postings.postings,
    postings.employers,
    ...Object.keys(supplyLabels).map((key) => data.supply[key as keyof typeof supplyLabels]),
  ]
  const sources = [...new Set(measures.flatMap((measure) => measure.sources ?? []))]
  const limitations = [...new Set([...data.limitations, ...(postings.postings.limitations ?? [])])]
  return (
    <>
      <p className="m-0 flex items-start gap-1.5 text-12 leading-[1.45] text-muted">
        <Icon name="pin" size={14} className="mt-px shrink-0" />
        <span>
          {postings.postings.geography.label} · Checked{' '}
          <time dateTime={data.context.evaluated_at}>{data.context.evaluated_at.slice(0, 10)}</time>
        </span>
      </p>
      <KpiGroup title="Demand" icon="growth" items={demand} open={open} onOpen={setOpen} />
      <KpiGroup title="Supply" icon="learn" items={services} open={open} onOpen={setOpen} />
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h4 className={groupHeading}>
            <Icon name="target" size={16} />
            Forecast
          </h4>
          {data.forecast_support.length === 0 && (
            <span className="text-12 text-muted">None on record</span>
          )}
        </div>
        {data.forecast_support.length > 0 && (
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {data.forecast_support.map((forecast) => {
              const href = sourceLink(forecast.source_url)
              const label = [
                forecast.classification === 'in_demand' ? 'In demand' : 'Hard to fill',
                forecast.geography.label,
                forecast.period_label,
              ].join(' · ')
              const chip = cx(
                'inline-flex min-h-8 max-w-full items-center gap-1 rounded-full px-2.5 text-12 leading-tight font-semibold',
                forecast.classification === 'in_demand'
                  ? 'bg-good-bg text-good-ink'
                  : 'bg-warn-bg text-warn-ink',
              )
              return (
                <li key={`${forecast.dataset_key}:${forecast.mapping_id}`} className="min-w-0">
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      title={`${forecast.occupation_title} · ${forecast.publisher}`}
                      className={cx(chip, 'no-underline hover:underline')}
                    >
                      <span className="truncate">{label}</span>
                      <Icon name="external" size={12} className="shrink-0" />
                    </a>
                  ) : (
                    <span className={chip} title={forecast.occupation_title}>
                      <span className="truncate">{label}</span>
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <div className="grid">
        <Disclosure title="All supply measures">
          <dl className="m-0 grid gap-1.5">
            {Object.entries(supplyLabels).map(([key, label]) => (
              <div key={key} className="flex items-start justify-between gap-3 text-13">
                <dt className="text-muted">{label}</dt>
                <dd className="m-0 shrink-0 font-bold text-navy tabular-nums">
                  <Figure value={data.supply[key as keyof typeof supplyLabels].value} />
                </dd>
              </div>
            ))}
          </dl>
        </Disclosure>
        <Disclosure title="Sources and notes">
          <ul className="m-0 grid gap-1 pl-5 text-12 leading-[1.5] text-muted">
            {note && <li>{note}</li>}
            <li>Postings count records, not worker headcounts or a workforce shortage.</li>
            {postings.suspected_duplicate_groups > 0 && (
              <li>
                {postings.suspected_duplicate_groups} suspected duplicate groups require review.
              </li>
            )}
            {postings.unallocated_count > 0 && (
              <li>{postings.unallocated_count} records have unresolved workplace locations.</li>
            )}
            {limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
            {sources.map((source) => {
              const href = sourceLink(source)
              return (
                <li key={source} className="wrap-anywhere">
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer" className="text-blue">
                      {source}
                    </a>
                  ) : (
                    source
                  )}
                </li>
              )
            })}
          </ul>
        </Disclosure>
      </div>
    </>
  )
}

/** Demand, forecasts and provision remain separate, including when the selected region changes. */
export function QualificationEvidence({
  qualificationCode,
  regionCode,
  compact = false,
  note: callerNote,
}: {
  qualificationCode: string
  regionCode: string | null
  compact?: boolean
  /** A caller's own caveat, filed with the compact view's sources and notes. */
  note?: ReactNode
}) {
  const headingId = useId()
  const query = useQuery(qualificationEvidenceQuery(qualificationCode, regionCode))
  if (compact) {
    return (
      <section aria-labelledby={headingId} className="grid min-w-0 gap-4">
        <h3 id={headingId} className="sr-only">
          Demand and service evidence
        </h3>
        {query.isPending ? (
          <div role="status" className="grid gap-2">
            <span className="sr-only">Loading demand and service evidence…</span>
            <div className="grid grid-cols-2 gap-2">
              <span className="animate-pulse h-24 rounded-12 bg-soft" />
              <span className="animate-pulse h-24 rounded-12 bg-soft" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <span className="animate-pulse h-24 rounded-12 bg-soft" />
              <span className="animate-pulse h-24 rounded-12 bg-soft" />
              <span className="animate-pulse h-24 rounded-12 bg-soft" />
            </div>
          </div>
        ) : query.isError ? (
          <div className="grid justify-items-start gap-2">
            <p role="alert" className="m-0 text-13 leading-[1.5] text-muted">
              {query.error.message}
            </p>
            <Button
              className={button({ variant: 'tertiary' })}
              onPress={() => void query.refetch()}
              isPending={query.isFetching}
            >
              <Icon name="refresh" />
              Try again
            </Button>
          </div>
        ) : (
          <CompactEvidence data={query.data} note={callerNote} />
        )}
      </section>
    )
  }
  return (
    <section
      aria-labelledby={headingId}
      className="grid min-w-0 gap-3 rounded-18 border border-border bg-surface p-4"
    >
      <h3 id={headingId} className="m-0 text-17 leading-[1.4] font-bold text-navy">
        Demand and service evidence
      </h3>
      {query.isPending ? (
        <p role="status" className={note}>
          Loading demand and service evidence…
        </p>
      ) : query.isError ? (
        <div className="grid justify-items-start gap-2">
          <p role="alert" className={note}>
            {query.error.message}
          </p>
          <Button
            className={button({ variant: 'tertiary' })}
            onPress={() => {
              void query.refetch()
            }}
            isPending={query.isFetching}
          >
            <Icon name="refresh" />
            Try again
          </Button>
        </div>
      ) : (
        <EvidenceContent data={query.data} />
      )}
    </section>
  )
}
