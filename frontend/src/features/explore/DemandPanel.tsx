import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Button, ToggleButton } from 'react-aria-components'
import { useQualifications } from '../../api/queries.ts'
import { useCopy } from '../../i18n/copy.ts'
import { button } from '../../styles/buttons.ts'
import { Icon, type IconName } from '../../components/Icon.tsx'
import { TspBadge } from '../../components/TspBadge.tsx'
import { QualificationEvidence } from '../labor-market/QualificationEvidence.tsx'
import type { components } from '../../api/schema.d.ts'
import { areaQualificationsQuery, type PersonalFit } from './demandApi.ts'
import { jobIcon, placeParts, readable, tier, type Tier } from './jobDisplay.ts'
import { useDemandStore, type Explore } from './useExplore.ts'

const note = 'm-0 text-13 leading-[1.5] text-muted'
const select =
  'min-h-11 w-full min-w-0 rounded-8 border border-border bg-surface px-2 text-13 text-navy focus-visible:outline-2 focus-visible:outline-focus'
const PLACES_SHOWN = 3
const MODES = ['jobs', 'qualifications', 'supply'] as const
type Mode = (typeof MODES)[number]
const MODE_ICON: Record<Mode, IconName> = {
  jobs: 'briefcase',
  qualifications: 'award',
  supply: 'bars',
}

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

  const regionName = (code: string | null) =>
    code ? (explore.regions.find((r) => r.code === code)?.name ?? code) : null
  const autoName = filters.region === undefined ? regionName(explore.demandRegion) : null
  const narrowed = mode === 'jobs' && Boolean(explore.demandLocality || explore.demandCode)

  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label={copy.heading}>
      <h2 className="m-0 text-17 font-bold text-navy">{copy.heading}</h2>
      {/* A segmented control: the raised surface slides under the view in focus. */}
      <div
        role="group"
        aria-label={copy.views}
        className="relative grid grid-cols-3 rounded-12 bg-chip p-1"
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-10 bg-navy shadow-[0_2px_6px_-2px_rgb(var(--track-shadow-rgb)/0.45)] transition-transform duration-300 ease-[cubic-bezier(0.2,0.75,0.2,1)] motion-reduce:transition-none"
          style={{ transform: `translateX(${MODES.indexOf(mode) * 100}%)` }}
        />
        {MODES.map((value) => (
          <ToggleButton
            key={value}
            isSelected={mode === value}
            onChange={() => {
              if (value === 'supply') filters.setCode(supplyCode || null)
              if (value === 'qualifications') filters.setCode(null)
              setMode(value)
            }}
            className="group relative z-10 grid min-h-14 cursor-pointer place-items-center content-center gap-1 rounded-10 border-0 bg-transparent px-1 py-1.5 text-12 leading-tight font-semibold text-muted transition-colors duration-200 data-focus-visible:outline-3 data-focus-visible:outline-offset-1 data-focus-visible:outline-focus data-hovered:not-data-selected:text-navy data-selected:text-surface"
          >
            <Icon
              name={MODE_ICON[value]}
              size={18}
              className="transition-colors duration-200 group-data-selected:text-surface"
            />
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
      <div className="grid gap-3 rounded-12 border border-border bg-surface p-3 shadow-card sm:grid-cols-2">
        <FilterSelect
          className="sm:col-span-2"
          label={copy.area}
          icon="map"
          active={filters.region !== undefined && filters.region !== null}
          value={filters.region === undefined ? 'auto' : (filters.region ?? '')}
          onChange={(value) => {
            filters.setRegion(value === 'auto' ? undefined : value || null)
            setOffset(0)
          }}
        >
          <option value="auto">
            {autoName ? `${autoName} · ${copy.autoArea}` : copy.autoArea}
          </option>
          <option value="">{copy.allAreas}</option>
          {explore.regions.map((region) => (
            <option key={region.code} value={region.code}>
              {region.name}
            </option>
          ))}
        </FilterSelect>
        {mode === 'jobs' && (
          <>
            {(explore.jobs.data?.localities.length ?? 0) > 0 && (
              <FilterSelect
                label={copy.locality}
                icon="pin"
                active={Boolean(explore.demandLocality)}
                value={explore.demandLocality ?? ''}
                onChange={(value) => filters.setLocality(value || null, explore.demandRegion)}
              >
                <option value="">{copy.allLocalities}</option>
                {explore.jobs.data?.localities.map((locality) => (
                  <option key={locality} value={locality}>
                    {readable(locality)}
                  </option>
                ))}
              </FilterSelect>
            )}
            <FilterSelect
              label={copy.qualification}
              icon="award"
              active={Boolean(explore.demandCode)}
              value={explore.demandCode ?? ''}
              onChange={(value) => filters.setCode(value || null)}
            >
              <option value="">{copy.allJobs}</option>
              {codes.map((q) => (
                <option key={q.code} value={q.code}>
                  {q.name}
                </option>
              ))}
            </FilterSelect>
            {narrowed && (
              <Button
                className={`${button({ variant: 'tertiary', height: 36, snug: true })} justify-self-start sm:col-span-2`}
                onPress={() => {
                  filters.setLocality(null, explore.demandRegion)
                  filters.setCode(null)
                }}
              >
                <Icon name="filterOff" size={16} />
                {copy.clearFilters}
              </Button>
            )}
          </>
        )}
      </div>
      {mode === 'supply' ? (
        <>
          <FilterSelect
            label={copy.choose}
            icon="award"
            active
            value={supplyCode}
            onChange={(code) => {
              setSelectedCode(code)
              filters.setCode(code)
            }}
          >
            {codes.map((q) => (
              <option key={q.code} value={q.code}>
                {q.name}
              </option>
            ))}
          </FilterSelect>
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
                note={copy.supplyNote}
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
          {mode === 'jobs' && explore.jobs.data && explore.jobs.data.items.length > 0 && (
            <JobList
              key={`${explore.demandRegion}:${explore.demandLocality}:${explore.demandCode}:${explore.demandOffset}`}
              data={explore.jobs.data}
              offset={explore.demandOffset}
              place={explore.demandLocality ?? null}
              onPlace={(locality) => filters.setLocality(locality, explore.demandRegion)}
            />
          )}
          {mode === 'qualifications' &&
            qualifications.data &&
            qualifications.data.items.length > 0 && (
              <QualificationList
                key={`${explore.demandRegion}:${offset}`}
                data={qualifications.data}
                offset={offset}
                onCompare={chooseSupply}
              />
            )}
          {page?.total === 0 && (
            <p
              role="status"
              className="m-0 flex gap-2 rounded-12 border border-dashed border-dash bg-empty p-4 text-13 leading-[1.5] text-ink"
            >
              <Icon name="search" size={18} className="mt-px shrink-0 text-muted" />
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
                <Icon name="arrowLeft" size={16} />
                {copy.previous}
              </Button>
              <span className={`${note} tabular-nums`}>
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
                <Icon name="arrowRight" size={16} />
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

/** A native select with a leading icon and its own chevron; a set filter turns blue so it is seen at a glance. */
function FilterSelect({
  label,
  icon,
  value,
  active,
  onChange,
  className = '',
  children,
}: {
  label: string
  icon: IconName
  value: string
  active: boolean
  onChange: (value: string) => void
  className?: string
  children: ReactNode
}) {
  return (
    <label className={`grid min-w-0 gap-1 text-12 font-semibold text-muted ${className}`}>
      {label}
      <span className="relative flex min-w-0 items-center">
        <Icon
          name={icon}
          size={17}
          className={`pointer-events-none absolute left-3 ${active ? 'text-blue' : 'text-muted'}`}
        />
        <select
          className={`${select} cursor-pointer appearance-none truncate pr-9 pl-9 text-14 font-medium transition-colors hover:border-hover-border ${
            active ? 'border-pill-border bg-pill text-pill-hover-ink' : ''
          }`}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {children}
        </select>
        <Icon
          name="chevron"
          size={16}
          className="pointer-events-none absolute right-3 text-muted"
        />
      </span>
    </label>
  )
}

type JobsData = NonNullable<Explore['jobs']['data']>
type AreaQualifications = components['schemas']['AreaQualifications']

const TIER_STYLE: Record<Tier, { tile: string; ink: string; bar: string }> = {
  high: { tile: 'bg-good-bg text-good-ink', ink: 'text-good-ink', bar: 'bg-good-fill' },
  mid: { tile: 'bg-tint text-blue', ink: 'text-blue', bar: 'bg-blue' },
  low: { tile: 'bg-tile-icon-violet text-violet', ink: 'text-violet', bar: 'bg-violet-bar' },
}

/** The snapshot's totals, then one card per job title; each card rises in a beat after the one above it. */
function JobList({
  data,
  offset,
  place,
  onPlace,
}: {
  data: JobsData
  offset: number
  place: string | null
  onPlace: (locality: string | null) => void
}) {
  const copy = useCopy().explore.demand
  const top = Math.max(...data.items.map((job) => job.posting_count), 1)
  const choosable = new Set(data.localities)
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-10 bg-soft px-3 py-2.5 text-13 text-ink">
        <span className="inline-flex items-center gap-1.5 font-semibold text-navy tabular-nums">
          <Icon name="briefcase" size={16} className="text-blue" />
          {copy.postingCount(data.posting_count)}
        </span>
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          <Icon name="person" size={16} className="text-blue" />
          {copy.employerCount(data.employer_count)}
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted tabular-nums">
          <Icon name="calendar" size={16} />
          {copy.snapshot(data.snapshot_dates.join(', ') || '—')}
        </span>
      </div>
      <ol className="m-0 grid list-none gap-2.5 p-0">
        {data.items.map((job, i) => {
          const level = TIER_STYLE[tier(job.posting_count, top)]
          return (
            <li
              key={job.title}
              className="animate-[rise_0.38s_cubic-bezier(0.2,0.75,0.2,1)_backwards]"
              style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}
            >
              <article className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2.5 rounded-12 border border-border bg-surface p-3 shadow-card transition-[border-color,box-shadow] duration-200 hover:border-hover-border hover:shadow-[0_6px_18px_-10px_rgb(var(--track-shadow-rgb)/0.35)]">
                <span
                  className={`relative grid size-11 place-items-center rounded-10 ${level.tile}`}
                >
                  <Icon name={jobIcon(job.title)} size={22} />
                  <span className="absolute -top-1.5 -left-1.5 grid min-w-5 place-items-center rounded-full border-2 border-surface bg-navy px-1 text-[10px] leading-4 font-bold text-surface tabular-nums">
                    {offset + i + 1}
                  </span>
                </span>
                <div className="grid min-w-0 gap-1">
                  <h3 className="m-0 flex flex-wrap items-center gap-2 text-15 leading-snug font-bold text-navy">
                    {readable(job.title)}
                    {job.personal_fit && <ForYou />}
                  </h3>
                  <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-13">
                    <span className={`font-semibold tabular-nums ${level.ink}`}>
                      {copy.postingCount(job.posting_count)}
                    </span>
                    <span className="text-muted tabular-nums">
                      {copy.employerCount(job.employer_count)}
                    </span>
                  </p>
                  <span
                    aria-hidden
                    className="mt-0.5 block h-1.5 overflow-hidden rounded-full bg-bar"
                  >
                    <span
                      className={`block h-full origin-left rounded-full ${level.bar}`}
                      style={{ width: `${Math.max(6, (100 * job.posting_count) / top)}%` }}
                    />
                  </span>
                </div>
                {job.localities.length > 0 && (
                  <Places
                    localities={job.localities}
                    choosable={choosable}
                    place={place}
                    onPlace={onPlace}
                  />
                )}
                {job.personal_fit && (
                  <div className="col-span-2">
                    <FitReasons fit={job.personal_fit} via={job.linked_qualification ?? null} />
                  </div>
                )}
              </article>
            </li>
          )
        })}
      </ol>
      <p className="m-0 flex gap-2 text-12 leading-[1.5] text-muted">
        <Icon name="info" size={15} className="mt-px shrink-0" />
        <span>
          {copy.snapshotNote}{' '}
          <a
            href={data.source_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 font-semibold text-blue underline-offset-2 hover:underline"
          >
            {copy.source}
            <Icon name="external" size={12} />
          </a>
        </span>
      </p>
    </>
  )
}

/**
 * Qualifications with reviewed evidence as ranked cards, read like the jobs list: a tier tile, the posting count and
 * its bar against the busiest on the page, any forecast as a chip, and the comparison one press away. The snapshot is
 * said once for the page; the coverage caveat waits in a fold.
 */
function QualificationList({
  data,
  offset,
  onCompare,
}: {
  data: AreaQualifications
  offset: number
  onCompare: (code: string) => void
}) {
  const copy = useCopy().explore.demand
  const top = Math.max(...data.items.map((q) => q.observed_posting_count ?? 0), 1)
  const dates = [...new Set(data.items.flatMap((q) => q.observation_dates ?? []))]
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-10 bg-soft px-3 py-2.5 text-13 text-ink">
        <span className="inline-flex items-center gap-1.5 font-semibold text-navy tabular-nums">
          <Icon name="award" size={16} className="text-blue" />
          {copy.qualificationTotal(data.total)}
        </span>
        {dates.length > 0 && (
          <span className="inline-flex items-center gap-1.5 text-muted tabular-nums">
            <Icon name="calendar" size={16} />
            {copy.snapshot(dates.join(', '))}
          </span>
        )}
      </div>
      <ol className="m-0 grid list-none gap-2.5 p-0">
        {data.items.map((q, i) => {
          const count = q.observed_posting_count ?? null
          const level = count ? TIER_STYLE[tier(count, top)] : null
          const forecasts = [
            ...new Set(
              (q.forecast_support ?? []).map((f) => `${f.geography.label} · ${f.period_label}`),
            ),
          ]
          return (
            <li
              key={q.qualification_code}
              className="animate-[rise_0.38s_cubic-bezier(0.2,0.75,0.2,1)_backwards]"
              style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}
            >
              <article className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2.5 rounded-12 border border-border bg-surface p-3 shadow-card transition-[border-color,box-shadow] duration-200 hover:border-hover-border hover:shadow-[0_6px_18px_-10px_rgb(var(--track-shadow-rgb)/0.35)]">
                <span
                  className={`relative grid size-11 place-items-center rounded-10 ${level?.tile ?? 'bg-chip text-muted'}`}
                >
                  <Icon name="award" size={22} />
                  <span className="absolute -top-1.5 -left-1.5 grid min-w-5 place-items-center rounded-full border-2 border-surface bg-navy px-1 text-[10px] leading-4 font-bold text-surface tabular-nums">
                    {offset + i + 1}
                  </span>
                </span>
                <div className="grid min-w-0 gap-1">
                  <h3 className="m-0 flex flex-wrap items-center gap-2 text-15 leading-snug font-bold text-navy">
                    {q.qualification_name}
                    {q.personal_fit && q.personal_fit.status !== 'held' && <ForYou />}
                  </h3>
                  {count === null || !level ? (
                    <p className="m-0 text-12 text-muted">{copy.noMappedPostings}</p>
                  ) : (
                    <>
                      <p className={`m-0 text-13 font-semibold tabular-nums ${level.ink}`}>
                        {copy.postings(count)}
                      </p>
                      <span
                        aria-hidden
                        className="mt-0.5 block h-1.5 overflow-hidden rounded-full bg-bar"
                      >
                        <span
                          className={`block h-full rounded-full ${level.bar}`}
                          style={{ width: `${Math.max(6, (100 * count) / top)}%` }}
                        />
                      </span>
                    </>
                  )}
                </div>
                {forecasts.length > 0 && (
                  <ul className="col-span-2 m-0 flex list-none flex-wrap gap-1.5 p-0">
                    {forecasts.map((label) => (
                      <li
                        key={label}
                        title={copy.forecast(label)}
                        className="inline-flex min-h-7 max-w-full items-center gap-1 rounded-full bg-good-bg px-2.5 text-12 leading-tight font-semibold text-good-ink"
                      >
                        <Icon name="growth" size={13} className="shrink-0" />
                        <span className="truncate">{copy.forecast(label)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {q.personal_fit && (
                  <div className="col-span-2">
                    <FitReasons fit={q.personal_fit} via={null} />
                  </div>
                )}
                <Button
                  onPress={() => onCompare(q.qualification_code)}
                  className="group col-span-2 flex min-h-10 cursor-pointer items-center justify-between gap-2 rounded-8 border-0 bg-soft px-3 text-13 font-semibold text-blue transition-colors duration-150 data-focus-visible:outline-2 data-focus-visible:outline-focus data-hovered:bg-tint data-pressed:bg-tint"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="bars" size={16} />
                    {copy.seeSupply}
                  </span>
                  <Icon
                    name="arrowRight"
                    size={16}
                    className="transition-transform duration-200 group-data-hovered:translate-x-0.5"
                  />
                </Button>
              </article>
            </li>
          )
        })}
      </ol>
      <details className="group/about text-12 text-muted [&>summary::-webkit-details-marker]:hidden">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-8 py-1 font-semibold text-muted hover:text-navy focus-visible:outline-2 focus-visible:outline-focus">
          <Icon name="info" size={15} />
          {copy.about}
          <Icon
            name="chevron"
            size={14}
            className="transition-transform group-open/about:rotate-180"
          />
        </summary>
        <p className="m-0 pt-1 leading-[1.5]">{copy.qualificationNote}</p>
      </details>
    </>
  )
}

/** A job's places as chips. A place in the snapshot's list filters the jobs to it; pressing it again lets go. */
function Places({
  localities,
  choosable,
  place,
  onPlace,
}: {
  localities: string[]
  choosable: Set<string>
  place: string | null
  onPlace: (locality: string | null) => void
}) {
  const copy = useCopy().explore.demand
  const [open, setOpen] = useState(false)
  const shown = open ? localities : localities.slice(0, PLACES_SHOWN)
  const chip =
    'inline-flex min-h-8 max-w-full items-center gap-1 rounded-full border px-2.5 text-12 leading-tight'
  const tone = 'border-transparent bg-chip text-ink'
  return (
    <ul className="col-span-2 m-0 flex list-none flex-wrap gap-1.5 p-0">
      {shown.map((locality) => {
        const { place: name, province } = placeParts(locality)
        const body = (
          <>
            <Icon name={place === locality ? 'pinFilled' : 'pin'} size={13} className="shrink-0" />
            <span className="truncate font-semibold">{name}</span>
            {province && <span className="truncate opacity-75">{province}</span>}
          </>
        )
        return (
          <li key={locality} className="min-w-0">
            {choosable.has(locality) ? (
              <ToggleButton
                aria-label={copy.jobsIn(province ? `${name}, ${province}` : name)}
                isSelected={place === locality}
                onChange={(on) => onPlace(on ? locality : null)}
                className={`${chip} ${tone} cursor-pointer transition-[background-color,border-color,transform] duration-150 data-focus-visible:outline-2 data-focus-visible:outline-focus data-hovered:border-chip-hover-border data-hovered:bg-chip-hover data-pressed:scale-[0.97] data-selected:border-pill-border data-selected:bg-pill data-selected:text-pill-hover-ink`}
              >
                {body}
              </ToggleButton>
            ) : (
              <span className={`${chip} ${tone}`}>{body}</span>
            )}
          </li>
        )
      })}
      {localities.length > PLACES_SHOWN && (
        <li>
          <Button
            aria-expanded={open}
            onPress={() => setOpen(!open)}
            className={`${chip} cursor-pointer border-dashed border-dash bg-transparent font-semibold text-blue transition-colors data-focus-visible:outline-2 data-focus-visible:outline-focus data-hovered:bg-chip`}
          >
            {open ? copy.fewerPlaces : copy.morePlaces(localities.length - PLACES_SHOWN)}
          </Button>
        </li>
      )}
    </ul>
  )
}
