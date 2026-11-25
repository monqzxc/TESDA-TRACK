import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Button } from 'react-aria-components'
import { Link, useParams } from 'react-router'
import type { Qualification } from '../../api/queries.ts'
import { ApiError } from '../../api/errors.ts'
import { EmptyState } from '../../components/EmptyState.tsx'
import { Icon } from '../../components/Icon.tsx'
import type { IconName } from '../../components/icons.ts'
import { PageHeading } from '../../components/PageHeading.tsx'
import { WithCatalog } from '../../components/WithCatalog.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { jobPostingPath, paths } from '../../paths.ts'
import { button } from '../../styles/buttons.ts'
import { coreSkills, qualificationsForJob } from '../explore/aroundYou.ts'
import {
  jobPostingQuery,
  pesos,
  type JobPosting,
  type JobPostingDetail,
} from '../explore/demandApi.ts'
import { jobIcon, placeParts, readable, shortDay } from '../explore/jobDisplay.ts'

const longDay = new Intl.DateTimeFormat('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })

/** "October 20, 2026" from "2026-10-20", as a calendar day. */
function fullDay(value: string | null | undefined): string | null {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  return longDay.format(new Date(year!, month! - 1, day))
}

/**
 * One job posting, at /jobs/:id: the PhilJobNet record behind a count on the Career Map. Who is hiring, where, for
 * what pay and on what terms; the TESDA qualifications that prepare for it; the pay range across every posting for
 * the role; and the other openings with the same title, nearest first.
 */
export default function JobPostingPage() {
  const { id = '' } = useParams()
  const copy = useCopy().jobPosting
  const posting = useQuery(jobPostingQuery(id))

  if (posting.isPending) {
    return (
      <div role="status" className="grid gap-6">
        <span className="sr-only">{copy.loading}</span>
        <div aria-hidden="true" className="h-4 w-48 rounded-full bg-soft" />
        <div
          aria-hidden="true"
          className="grid gap-4 rounded-16 border border-border bg-surface p-6 max-xs:p-4"
        >
          <span className="h-3 w-32 rounded-full bg-soft" />
          <span className="h-8 w-2/3 rounded-full bg-soft" />
          <span className="h-3 w-1/2 rounded-full bg-soft" />
          <span className="mt-2 h-16 rounded-12 bg-soft" />
        </div>
      </div>
    )
  }
  if (posting.isError) {
    const missing = posting.error instanceof ApiError && posting.error.status === 404
    return (
      <>
        <PageHeading>{missing ? copy.notFound.heading : copy.failed}</PageHeading>
        <EmptyState
          heading={missing ? copy.notFound.heading : copy.failed}
          body={missing ? copy.notFound.body : ''}
        >
          {missing ? (
            <Link className={button()} to={paths.explore}>
              {copy.notFound.back}
            </Link>
          ) : (
            <Button className={button()} onPress={() => void posting.refetch()}>
              {copy.retry}
            </Button>
          )}
        </EmptyState>
      </>
    )
  }
  return (
    <WithCatalog>{(catalog) => <Posting detail={posting.data} catalog={catalog} />}</WithCatalog>
  )
}

function Posting({ detail, catalog }: { detail: JobPostingDetail; catalog: Qualification[] }) {
  const copy = useCopy().jobPosting
  const { posting } = detail
  const title = readable(posting.title)
  const employer = posting.employer ? readable(posting.employer) : null
  const place = posting.location ? placeParts(posting.location) : null

  // The record's reviewed links first, then the catalog's qualifications that list this job title.
  const byCode = new Map(catalog.map((qualification) => [qualification.code, qualification]))
  const reviewed = detail.qualifications
    .map((link) => byCode.get(link.code))
    .filter((qualification): qualification is Qualification => Boolean(qualification))
  const qualifications = [
    ...reviewed,
    ...qualificationsForJob(posting.title, catalog).filter((q) => !reviewed.includes(q)),
  ].slice(0, 5)
  const skills = [...new Set(qualifications.flatMap(coreSkills))].slice(0, 12)
  const training = qualifications[0]
    ? `${paths.explore}?${new URLSearchParams({ qualification: qualifications[0].code, type: 'training' })}`
    : paths.explore

  return (
    <div className="grid gap-6">
      <nav aria-label={copy.breadcrumb} className="text-14">
        <ol className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0 text-muted">
          <li>
            <Link className="font-semibold text-blue" to={paths.explore}>
              {copy.careerMap}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="wrap-anywhere">
            {title}
          </li>
        </ol>
      </nav>

      <header className="grid gap-6 rounded-16 border border-border bg-surface p-6 shadow-[0_10px_30px_-18px_rgb(var(--track-shadow-rgb)/0.35)] max-xs:p-4">
        <div className="flex items-start gap-4">
          <span
            aria-hidden="true"
            className="grid size-14 shrink-0 place-items-center rounded-16 bg-tint text-blue max-xs:size-11 max-xs:rounded-12"
          >
            <Icon name={jobIcon(posting.title)} size={26} />
          </span>
          <div className="grid min-w-0 gap-1.5">
            <PageHeading className="m-0 font-display text-[length:clamp(1.6rem,1.3rem_+_1.2vw,2.25rem)] leading-[1.15] font-bold tracking-[-0.025em] text-balance wrap-anywhere text-navy">
              {title}
            </PageHeading>
            <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-15 text-ink">
              {employer && <span className="font-semibold">{employer}</span>}
              {place && (
                <span className="inline-flex items-center gap-1 text-muted">
                  <Icon name="pin" size={15} />
                  {place.province ? `${place.place}, ${place.province}` : place.place}
                </span>
              )}
            </p>
          </div>
        </div>

        <dl className="m-0 grid grid-cols-4 overflow-hidden rounded-12 border border-line max-md:grid-cols-2">
          <Fact
            icon="growth"
            label={copy.salary}
            value={posting.salary_php != null ? pesos(posting.salary_php) : copy.salaryUnstated}
            strong
          />
          <Fact icon="briefcase" label={copy.type} value={posting.employment_type ?? '—'} />
          <Fact
            icon="learn"
            label={copy.education}
            value={posting.education ? readable(posting.education) : copy.educationAny}
          />
          <Fact
            icon="calendar"
            label={copy.posted}
            value={fullDay(posting.posted_on) ?? fullDay(posting.observed_on) ?? '—'}
          />
        </dl>

        <div className="flex flex-wrap items-center gap-3">
          <a
            className={button({ variant: 'primary' })}
            href={posting.source_url}
            target="_blank"
            rel="noreferrer"
          >
            {copy.apply}
            <Icon name="external" />
          </a>
          <Link className={button({ variant: 'secondary' })} to={training}>
            <Icon name="map" />
            {copy.findTraining}
          </Link>
        </div>

        <p className="m-0 flex flex-wrap gap-x-2 gap-y-0.5 border-t border-rule pt-4 text-12 leading-[1.5] text-muted">
          <span className="tabular-nums">{copy.jobId(posting.job_id)}</span>
          {posting.observed_on && (
            <>
              <span aria-hidden="true">·</span>
              <span>{copy.recorded(fullDay(posting.observed_on)!)}</span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span>{copy.note}</span>
        </p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="grid gap-6">
          <Block icon="award" title={copy.prepare} lead={copy.prepareLead}>
            {qualifications.length ? (
              <ul className="m-0 grid list-none divide-y divide-rule overflow-hidden rounded-12 border border-line p-0">
                {qualifications.map((qualification) => (
                  <li key={qualification.code}>
                    <QualificationLink qualification={qualification} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-14 text-muted">{copy.noQualification}</p>
            )}
            {skills.length > 0 && (
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0 pt-1">
                {skills.map((skill) => (
                  <li
                    key={skill}
                    className="rounded-full border border-border bg-panel px-3 py-1 text-13 font-medium text-navy"
                  >
                    {skill}
                  </li>
                ))}
              </ul>
            )}
          </Block>
          <Block
            icon="briefcase"
            title={copy.more}
            lead={detail.same_title.length ? copy.moreLead(detail.same_title_total) : null}
          >
            {detail.same_title.length ? (
              <ul className="m-0 grid list-none overflow-hidden rounded-12 border border-line bg-surface p-0 sm:grid-cols-2 [&>li]:border-b [&>li]:border-rule sm:[&>li:nth-child(odd)]:border-r">
                {detail.same_title.map((other) => (
                  <li key={other.job_id}>
                    <OtherPosting posting={other} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-14 text-muted">{copy.noMore}</p>
            )}
          </Block>
        </div>

        <aside className="grid gap-6">
          {detail.salary_min != null && detail.salary_max != null && (
            <PayRange
              min={detail.salary_min}
              max={detail.salary_max}
              value={posting.salary_php ?? null}
              median={detail.salary_median ?? null}
              count={detail.same_title_total + 1}
            />
          )}
        </aside>
      </div>
    </div>
  )
}

function Fact({
  icon,
  label,
  value,
  strong = false,
}: {
  icon: IconName
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div className="grid content-start gap-1 border-line px-4 py-3.5 not-last:border-r max-md:nth-2:border-r-0 max-md:nth-[-n+2]:border-b">
      <dt className="inline-flex items-center gap-1.5 text-12 font-semibold text-muted">
        <Icon name={icon} size={13} />
        {label}
      </dt>
      <dd
        className={cx(
          'm-0 leading-snug wrap-anywhere text-navy',
          strong ? 'text-20 font-bold tabular-nums' : 'text-15 font-semibold',
        )}
      >
        {value}
      </dd>
    </div>
  )
}

function Block({
  icon,
  title,
  lead,
  children,
}: {
  icon: IconName
  title: string
  lead?: string | null
  children: ReactNode
}) {
  return (
    <section className="grid gap-3">
      <div className="grid gap-0.5">
        <h2 className="m-0 flex items-center gap-2 text-17 font-bold text-navy">
          <span
            aria-hidden="true"
            className="grid size-7 shrink-0 place-items-center rounded-8 bg-tint text-blue"
          >
            <Icon name={icon} size={15} />
          </span>
          {title}
        </h2>
        {lead && <p className="m-0 pl-9 text-13 leading-[1.5] text-muted">{lead}</p>}
      </div>
      {children}
    </section>
  )
}

const linkRow =
  'group flex min-h-14 items-center gap-3 bg-surface px-4 py-3 text-left no-underline transition-colors duration-150 hover:bg-soft active:bg-chip outline-none focus-visible:relative focus-visible:z-1 focus-visible:rounded-12 focus-visible:outline-3 focus-visible:outline-focus'

function QualificationLink({ qualification }: { qualification: Qualification }) {
  return (
    <Link
      to={paths.qualification.replace(':code', encodeURIComponent(qualification.code))}
      className={linkRow}
    >
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="text-15 leading-snug font-semibold text-navy group-hover:text-blue">
          {qualification.name}
        </span>
        <span className="text-12 text-muted">{qualification.sector}</span>
      </span>
      <Icon name="arrowRight" size={16} className="shrink-0 text-muted group-hover:text-blue" />
    </Link>
  )
}

function OtherPosting({ posting }: { posting: JobPosting }) {
  const where = posting.location ? placeParts(posting.location).place : null
  const facts = [where, shortDay(posting.posted_on)].filter(Boolean)
  return (
    <Link to={jobPostingPath(posting.job_id)} className={linkRow}>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="line-clamp-2 text-14 leading-snug font-semibold text-navy group-hover:text-blue">
          {posting.employer ? readable(posting.employer) : readable(posting.title)}
        </span>
        <span className="text-12 text-muted">{facts.join(' · ')}</span>
      </span>
      {posting.salary_php != null && (
        <span className="shrink-0 text-14 font-bold text-navy tabular-nums">
          {pesos(posting.salary_php, true)}
        </span>
      )}
    </Link>
  )
}

/**
 * The pay stated across every posting for the role, lowest to highest, with this posting marked on it. One figure
 * when they all agree.
 */
function PayRange({
  min,
  max,
  value,
  median,
  count,
}: {
  min: number
  max: number
  value: number | null
  median: number | null
  count: number
}) {
  const copy = useCopy().jobPosting
  const spread = max > min
  const at = value != null && spread ? Math.min(1, Math.max(0, (value - min) / (max - min))) : null
  return (
    <section className="grid gap-3 rounded-16 border border-border bg-surface p-5">
      <h2 className="m-0 text-13 font-semibold text-muted">{copy.rangeLabel}</h2>
      <p className="m-0 font-display text-24 leading-tight font-bold tracking-[-0.02em] text-navy tabular-nums">
        {copy.range(pesos(min), pesos(max))}
      </p>
      {spread && (
        <div className="grid gap-1.5 pt-1">
          <div className="relative h-2 rounded-full bg-tint">
            {at !== null && (
              <span
                className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-3 border-surface bg-blue shadow-[0_2px_6px_rgb(var(--track-shadow-rgb)/0.3)] motion-safe:animate-pop"
                style={{ left: `${at * 100}%` }}
              />
            )}
          </div>
          <div className="flex justify-between text-12 text-muted tabular-nums">
            <span>{pesos(min, true)}</span>
            {value != null && (
              <span className="font-semibold text-blue">
                {copy.thisOne} · {pesos(value, true)}
              </span>
            )}
            <span>{pesos(max, true)}</span>
          </div>
        </div>
      )}
      <p className="m-0 text-12 text-muted">
        {copy.rangeNote(count, median != null ? pesos(median) : null)}
      </p>
    </section>
  )
}
