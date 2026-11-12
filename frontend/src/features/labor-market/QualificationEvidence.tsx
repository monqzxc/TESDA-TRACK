import { useQuery } from '@tanstack/react-query'
import { useId } from 'react'
import { Button } from 'react-aria-components'
import { sourceLink } from '../../components/DataProvenance.tsx'
import { Icon } from '../../components/Icon.tsx'
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

function EvidenceContent({
  data,
  compact,
}: {
  data: QualificationEvidenceResponse
  compact?: boolean
}) {
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
      {compact && (
        <dl className="m-0 grid gap-2 border-b border-rule pb-3">
          {(
            [
              'registered_training_sites',
              'registered_training_programs',
              'confirmed_assessment_sites',
            ] as const
          ).map((key) => (
            <div key={key} className="flex items-start justify-between gap-3 text-13">
              <dt className="text-muted">{supplyLabels[key]}</dt>
              <dd className="m-0 shrink-0 font-bold text-navy tabular-nums">
                {data.supply[key].value ?? 'Unknown'}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <div className={compact ? 'grid gap-4' : 'grid gap-4 sm:grid-cols-2'}>
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

/** Demand, forecasts and provision remain separate, including when the selected region changes. */
export function QualificationEvidence({
  qualificationCode,
  regionCode,
  compact = false,
}: {
  qualificationCode: string
  regionCode: string | null
  compact?: boolean
}) {
  const headingId = useId()
  const query = useQuery(qualificationEvidenceQuery(qualificationCode, regionCode))
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
        <EvidenceContent data={query.data} compact={compact} />
      )}
    </section>
  )
}
