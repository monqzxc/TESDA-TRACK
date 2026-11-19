import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Button, ToggleButton } from 'react-aria-components'
import { useQualifications } from '../../api/queries.ts'
import { useCopy } from '../../i18n/copy.ts'
import { button } from '../../styles/buttons.ts'
import { TspBadge } from '../../components/TspBadge.tsx'
import { QualificationEvidence } from '../labor-market/QualificationEvidence.tsx'
import { areaQualificationsQuery, type PersonalFit } from './demandApi.ts'
import { useDemandStore, type Explore } from './useExplore.ts'

const note = 'm-0 text-13 leading-[1.5] text-muted'
const select =
  'min-h-11 w-full min-w-0 rounded-8 border border-border bg-surface px-2 text-13 text-navy focus-visible:outline-2 focus-visible:outline-focus'
type Mode = 'jobs' | 'qualifications' | 'supply'

export function DemandPanel({ explore }: { explore: Explore }) {
  const copy = useCopy().explore.demand
  const [mode, setMode] = useState<Mode>('jobs')
  const [qualificationPage, setQualificationPage] = useState({
    region: explore.demandRegion,
    offset: 0,
  })
  const offset = qualificationPage.region === explore.demandRegion ? qualificationPage.offset : 0
  const setOffset = (offset: number) =>
    setQualificationPage({ region: explore.demandRegion, offset })
  const [selectedCode, setSelectedCode] = useState('')
  const filters = useDemandStore()
  const catalog = useQualifications()
  const qualifications = useQuery({
    ...areaQualificationsQuery(explore.demandRegion, offset, explore.personalFor),
    enabled: mode === 'qualifications',
  })
  const codes = catalog.data ?? []
  const supplyCode = codes.some((q) => q.code === selectedCode)
    ? selectedCode
    : (explore.demandCode ?? explore.matches[0]?.qualification.code ?? codes[0]?.code ?? '')
  const query = mode === 'qualifications' ? qualifications : explore.jobs
  const page = query.data
  const currentOffset = mode === 'jobs' ? explore.demandOffset : offset
  const changePage = (next: number) =>
    mode === 'jobs' ? filters.setOffset(next, explore.demandRegion) : setOffset(next)
  const chooseSupply = (code: string) => {
    setSelectedCode(code)
    filters.setCode(code)
    setMode('supply')
  }

  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label={copy.heading}>
      <div>
        <h2 className="m-0 text-17 font-bold text-navy">{copy.heading}</h2>
        <p className={note}>{copy.body}</p>
      </div>
      <div role="group" aria-label={copy.views} className="flex border-b border-rule">
        {(['jobs', 'qualifications', 'supply'] as const).map((value) => (
          <ToggleButton
            key={value}
            isSelected={mode === value}
            onChange={() => {
              if (value === 'supply') filters.setCode(supplyCode || null)
              if (value === 'qualifications') filters.setCode(null)
              setMode(value)
            }}
            className="min-h-11 flex-1 cursor-pointer border-0 border-b-2 border-transparent bg-transparent px-1 text-12 font-semibold text-muted data-focus-visible:outline-2 data-focus-visible:outline-focus data-selected:border-blue data-selected:text-blue"
          >
            {copy.modes[value]}
          </ToggleButton>
        ))}
      </div>
      {explore.passportStatus === 'loaded' && mode !== 'supply' && (
        <PersonalBar
          on={filters.personal}
          nothingFits={
            Boolean(page?.personalized) && (page?.items ?? []).every((item) => !item.personal_fit)
          }
          onChange={(personal) => {
            filters.setPersonal(personal)
            setOffset(0)
          }}
        />
      )}
      <label className="grid gap-1 text-13 font-semibold text-navy">
        {copy.area}
        <select
          className={select}
          value={filters.region === undefined ? 'auto' : (filters.region ?? '')}
          onChange={(event) => {
            filters.setRegion(
              event.target.value === 'auto' ? undefined : event.target.value || null,
            )
            setOffset(0)
          }}
        >
          <option value="auto">{copy.autoArea}</option>
          <option value="">{copy.allAreas}</option>
          {explore.regions.map((region) => (
            <option key={region.code} value={region.code}>
              {region.name}
            </option>
          ))}
        </select>
      </label>
      <p className={note}>
        {explore.demandRegion
          ? copy.region(
              explore.regions.find((r) => r.code === explore.demandRegion)?.name ??
                explore.demandRegion,
            )
          : copy.national}
      </p>
      {mode === 'jobs' && (
        <>
          <details className="text-13 text-navy">
            <summary className="min-h-8 cursor-pointer font-semibold">
              {explore.demandCode
                ? copy.filteredFor(
                    codes.find((q) => q.code === explore.demandCode)?.name ?? explore.demandCode,
                  )
                : copy.qualification}
            </summary>
            <label className="grid gap-1 pt-1 text-13 font-semibold text-navy">
              <span className="sr-only">{copy.qualification}</span>
              <select
                className={select}
                value={explore.demandCode ?? ''}
                onChange={(event) => filters.setCode(event.target.value || null)}
              >
                <option value="">{copy.allJobs}</option>
                {codes.map((q) => (
                  <option key={q.code} value={q.code}>
                    {q.name}
                  </option>
                ))}
              </select>
            </label>
          </details>
          {(explore.jobs.data?.localities.length ?? 0) > 0 && (
            <label className="grid gap-1 text-13 font-semibold text-navy">
              {copy.locality}
              <select
                className={select}
                value={explore.demandLocality ?? ''}
                onChange={(event) =>
                  filters.setLocality(event.target.value || null, explore.demandRegion)
                }
              >
                <option value="">{copy.allLocalities}</option>
                {explore.jobs.data?.localities.map((locality) => (
                  <option key={locality}>{locality}</option>
                ))}
              </select>
            </label>
          )}
        </>
      )}
      {mode === 'supply' ? (
        <>
          <label className="grid gap-1 text-13 font-semibold text-navy">
            {copy.choose}
            <select
              className={select}
              value={supplyCode}
              onChange={(event) => {
                setSelectedCode(event.target.value)
                filters.setCode(event.target.value)
              }}
            >
              {codes.map((q) => (
                <option key={q.code} value={q.code}>
                  {q.name}
                </option>
              ))}
            </select>
          </label>
          <p className={note}>{copy.supplyNote}</p>
          {catalog.isPending ? (
            <p role="status" className={note}>
              {copy.loading}
            </p>
          ) : catalog.isError ? (
            <Retry onRetry={() => void catalog.refetch()} />
          ) : (
            supplyCode && (
              <QualificationEvidence
                compact
                key={`${supplyCode}:${explore.demandRegion}`}
                qualificationCode={supplyCode}
                regionCode={explore.demandRegion}
              />
            )
          )}
        </>
      ) : query.isPending ? (
        <p role="status" className={note}>
          {copy.loading}
        </p>
      ) : query.isError ? (
        <Retry onRetry={() => void query.refetch()} />
      ) : (
        <>
          {mode === 'jobs' && explore.jobs.data && (
            <>
              <p className="m-0 rounded-8 bg-panel p-3 text-13 leading-[1.5] text-ink">
                {copy.snapshot(explore.jobs.data.snapshot_dates.join(', ') || '—')}{' '}
                {copy.jobTotals(explore.jobs.data.posting_count, explore.jobs.data.employer_count)}
              </p>
              <ol className="m-0 grid list-none gap-0 p-0">
                {explore.jobs.data.items.map((job) => (
                  <li key={job.title} className="grid gap-1 border-b border-rule py-3">
                    <h3 className="m-0 flex flex-wrap items-center gap-2 text-14 font-bold text-navy">
                      {job.title}
                      {job.personal_fit && <ForYou />}
                    </h3>
                    <p className="m-0 text-13 font-semibold text-navy">
                      {copy.jobTotals(job.posting_count, job.employer_count)}
                    </p>
                    <p className={note}>
                      {job.localities.slice(0, 3).join(' · ')}
                      {job.localities.length > 3 ? copy.morePlaces(job.localities.length - 3) : ''}
                    </p>
                    {job.personal_fit && (
                      <FitReasons fit={job.personal_fit} via={job.linked_qualification ?? null} />
                    )}
                  </li>
                ))}
              </ol>
              <p className={note}>{copy.snapshotNote}</p>
              <a
                href={explore.jobs.data.source_url}
                target="_blank"
                rel="noreferrer"
                className="text-13 text-blue"
              >
                {copy.source}
              </a>
            </>
          )}
          {mode === 'qualifications' && qualifications.data && (
            <>
              <p className={note}>{copy.qualificationNote}</p>
              <p className={note}>{copy.qualificationTotal(qualifications.data.total)}</p>
              {qualifications.data.items.map((q) => (
                <article
                  key={q.qualification_code}
                  className="grid gap-1 border-b border-rule py-3"
                >
                  <h3 className="m-0 flex flex-wrap items-center gap-2 text-14 font-bold text-navy">
                    {q.qualification_name}
                    {q.personal_fit && q.personal_fit.status !== 'held' && <ForYou />}
                  </h3>
                  {q.personal_fit && <FitReasons fit={q.personal_fit} via={null} />}
                  <p className={note}>
                    {q.observed_posting_count == null
                      ? copy.noMappedPostings
                      : copy.postings(q.observed_posting_count)}
                  </p>
                  {(q.observation_dates ?? []).length > 0 && (
                    <p className={note}>{copy.snapshot((q.observation_dates ?? []).join(', '))}</p>
                  )}
                  {[
                    ...new Set(
                      (q.forecast_support ?? []).map(
                        (f) => `${f.geography.label} · ${f.period_label}`,
                      ),
                    ),
                  ].map((label) => (
                    <p key={label} className={note}>
                      {copy.forecast(label)}
                    </p>
                  ))}
                  <Button
                    className={button({ variant: 'tertiary', height: 36, snug: true })}
                    onPress={() => chooseSupply(q.qualification_code)}
                  >
                    {copy.seeSupply}
                  </Button>
                </article>
              ))}
            </>
          )}
          {page?.total === 0 && (
            <p role="status" className="m-0 rounded-8 bg-panel p-3 text-13 leading-[1.5] text-ink">
              {mode === 'jobs' ? copy.emptyJobs : copy.emptyQualifications}
            </p>
          )}
          {page && page.total > page.limit && (
            <div className="flex items-center justify-between gap-2">
              <Button
                isDisabled={currentOffset === 0}
                className={button({ variant: 'tertiary', height: 36 })}
                onPress={() => changePage(Math.max(0, currentOffset - page.limit))}
              >
                {copy.previous}
              </Button>
              <span className={note}>
                {copy.page(
                  currentOffset + 1,
                  Math.min(currentOffset + page.limit, page.total),
                  page.total,
                )}
              </span>
              <Button
                isDisabled={currentOffset + page.limit >= page.total}
                className={button({ variant: 'tertiary', height: 36 })}
                onPress={() => changePage(currentOffset + page.limit)}
              >
                {copy.next}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

/** Says the lists are ranked from the Skill Passport, and lets the learner turn that off. */
function PersonalBar({
  on,
  nothingFits,
  onChange,
}: {
  on: boolean
  nothingFits: boolean
  onChange: (on: boolean) => void
}) {
  const copy = useCopy().explore.demand.personal
  return (
    <div className="grid gap-1 rounded-10 bg-panel p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-13 font-semibold text-navy">
          <TspBadge small />
          {on ? copy.on : copy.off}
        </span>
        <Button
          className={button({ variant: 'tertiary', height: 36, snug: true })}
          onPress={() => onChange(!on)}
        >
          {on ? copy.turnOff : copy.turnOn}
        </Button>
      </div>
      {on && <p className={note}>{nothingFits ? copy.nothing : copy.note}</p>}
    </div>
  )
}

function ForYou() {
  const copy = useCopy().explore.demand.personal
  return (
    <span className="rounded-full bg-blue px-2 py-0.5 text-11 font-semibold text-white">
      {copy.forYou}
    </span>
  )
}

/** The "because" lines: the learner's own words and records the server matched, never a generic template. */
function FitReasons({ fit, via }: { fit: PersonalFit; via: string | null }) {
  const copy = useCopy().explore.demand.personal
  const lines = (fit.reasons ?? []).map((reason) => {
    const terms = (reason.terms ?? []).join(', ')
    const qualification = reason.qualification ?? ''
    switch (reason.kind) {
      case 'skill':
        return copy.reason.skill(terms)
      case 'experience':
        return copy.reason.experience(terms)
      case 'unit':
        return copy.reason.unit(terms, reason.qualification ?? null)
      case 'sector':
        return copy.reason.sector(qualification, reason.sector ?? '')
      case 'held':
        return copy.reason.held(qualification)
      case 'renew':
        return copy.reason.renew(qualification)
    }
  })
  if (via && fit.status !== 'held') lines.unshift(copy.via(via))
  if (!lines.length) return null
  return (
    <ul className="m-0 grid list-none gap-0.5 p-0">
      {lines.map((line) => (
        <li key={line} className="text-13 leading-[1.5] text-blue">
          {line}
        </li>
      ))}
    </ul>
  )
}

function Retry({ onRetry }: { onRetry: () => void }) {
  const copy = useCopy().explore.demand
  return (
    <div className="grid justify-items-start gap-2">
      <p role="alert" className={note}>
        {copy.failed}
      </p>
      <Button className={button({ variant: 'tertiary', height: 36 })} onPress={onRetry}>
        {copy.retry}
      </Button>
    </div>
  )
}
