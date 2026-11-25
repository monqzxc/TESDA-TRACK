import { useQueries, useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from 'react-aria-components'
import { Link } from 'react-router'
import type { Qualification } from '../../api/queries.ts'
import { Icon } from '../../components/Icon.tsx'
import type { IconName } from '../../components/icons.ts'
import { ModalDialog } from '../../components/ModalDialog.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { jobPostingPath } from '../../paths.ts'
import { button } from '../../styles/buttons.ts'
import { listingsQuery } from '../training/api.ts'
import { placeLabel, type Center, type Program } from '../training/centers.ts'
import {
  coreSkills,
  qualificationsForJob,
  plainTitle,
  qualificationsTeaching,
} from './aroundYou.ts'
import {
  jobPostingsQuery,
  pesos,
  type AreaJob,
  type AreaQualification,
  type AroundArea,
  type JobPosting,
} from './demandApi.ts'
import { roundKm } from './explore.ts'
import { placeParts, readable, shortDay } from './jobDisplay.ts'

/** What a press in the "Around you" card opened. A dialog can lead to another; the trail is the way back. */
export type Detail =
  | { kind: 'skill'; name: string }
  | { kind: 'qualification'; code: string; name: string }
  | { kind: 'job'; title: string; linked?: string | null }

/** The area the item was pressed in: its posting records give the counts the dialogs show. */
export interface DetailArea {
  /** Where the card's lists were read: the job's own posting records are read for the same area. */
  place: AroundArea
  qualifications: readonly AreaQualification[]
  jobs: readonly AreaJob[]
  /** A forecast line for a qualification (regions only), as the card writes it. */
  forecast: (item: AreaQualification) => string | null
}

interface AroundYouDetailProps {
  trail: readonly Detail[]
  area: DetailArea | null
  catalog: readonly Qualification[]
  /** The page's centers, with their distance from the learner where it is known. */
  centers: readonly Center[]
  onTrail: (trail: Detail[]) => void
  /** Search the qualification on the map, as the card's rows did. */
  onQualification: (code: string, name: string) => void
  /** Open one center on the map, for the qualification. */
  onCenter?: (id: string, code: string) => void
}

const focusRing =
  'outline-none data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus'
const muted = 'm-0 text-14 leading-[1.55] text-muted'

/**
 * The details of a skill, a qualification or a job from the card, in one dialog. Each names what it leads to (a
 * skill its qualifications, a qualification its centers and jobs, a job its qualifications, centers and skills), and
 * those lead on in the same dialog, with Back to return.
 */
export function AroundYouDetail({
  trail,
  area,
  catalog,
  centers,
  onTrail,
  onQualification,
  onCenter,
}: AroundYouDetailProps) {
  const copy = useCopy().explore.aroundYou.details
  const current = trail.at(-1) ?? null
  // Kept while the dialog closes, so its content doesn't empty out during the exit.
  const [shown, setShown] = useState(current)
  if (current && current !== shown) setShown(current)
  const detail = current ?? shown
  const previous = trail.at(-2) ?? null
  const bodyRef = useRef<HTMLDivElement>(null)

  // A new detail in the same dialog starts at its top, with focus on the dialog so the reader starts there too.
  useEffect(() => {
    if (!current) return
    const dialog = bodyRef.current?.closest<HTMLElement>('[role="dialog"]')
    dialog?.parentElement?.scrollTo?.({ top: 0 })
    if (trail.length > 1) dialog?.focus()
  }, [current, trail.length])

  const go = (next: Detail) => onTrail([...trail, next])
  const close = () => onTrail([])
  const index = new Map(catalog.map((qualification) => [qualification.code, qualification]))

  return (
    <ModalDialog
      isOpen={Boolean(current)}
      onOpenChange={(open) => !open && close()}
      title={detail ? titleOf(detail, index) : ''}
      closeLabel={copy.close}
      wide
      before={
        previous && (
          <Button
            onPress={() => onTrail(trail.slice(0, -1))}
            className={cx(
              '-mt-1 mb-2 -ml-2 inline-flex max-w-[calc(100%-3.5rem)] cursor-pointer items-center gap-1.5 rounded-8 border-0 bg-transparent px-2 text-13 font-semibold text-blue transition-colors duration-150 data-hovered:bg-soft data-pressed:bg-chip',
              'min-h-9',
              focusRing,
            )}
          >
            <Icon name="arrowLeft" size={15} className="shrink-0" />
            <span className="truncate">{copy.back(titleOf(previous, index))}</span>
          </Button>
        )
      }
    >
      <div ref={bodyRef} key={trail.length} className="grid gap-6 motion-safe:animate-row-in">
        {detail?.kind === 'skill' && (
          <SkillBody name={detail.name} area={area} catalog={catalog} centers={centers} go={go} />
        )}
        {detail?.kind === 'qualification' && (
          <QualificationBody
            code={detail.code}
            qualification={index.get(detail.code) ?? null}
            area={area}
            centers={centers}
            go={go}
            onShowAll={() => {
              close()
              onQualification(detail.code, index.get(detail.code)?.name ?? detail.name)
            }}
            onCenter={
              onCenter &&
              ((id) => {
                close()
                onCenter(id, detail.code)
              })
            }
          />
        )}
        {detail?.kind === 'job' && (
          <JobBody
            title={detail.title}
            linked={detail.linked ?? null}
            area={area}
            catalog={catalog}
            centers={centers}
            go={go}
            onCenter={
              onCenter &&
              ((id, code) => {
                close()
                onCenter(id, code)
              })
            }
          />
        )}
      </div>
    </ModalDialog>
  )
}

function titleOf(detail: Detail, index: ReadonlyMap<string, Qualification>): string {
  if (detail.kind === 'skill') return detail.name
  if (detail.kind === 'job') return readable(detail.title)
  return index.get(detail.code)?.name ?? detail.name
}

// ——— The three bodies ———

function SkillBody({
  name,
  area,
  catalog,
  centers,
  go,
}: {
  name: string
  area: DetailArea | null
  catalog: readonly Qualification[]
  centers: readonly Center[]
  go: (next: Detail) => void
}) {
  const copy = useCopy().explore.aroundYou.details
  const teaching = byPostings(qualificationsTeaching(name, catalog), area)
  const jobs = unique(teaching.flatMap((qualification) => qualification.possible_jobs)).slice(0, 10)
  return (
    <>
      <p className={cx(muted, '-mt-2')}>{teaching.length ? copy.skillLead : copy.skillNone}</p>
      {teaching.length > 0 && (
        <Section icon="award" title={copy.teachIt}>
          <Expandable
            items={teaching}
            limit={5}
            keyOf={(qualification) => qualification.code}
            render={(qualification) => (
              <QualificationRow
                qualification={qualification}
                area={area}
                centers={centers}
                onPress={() =>
                  go({ kind: 'qualification', code: qualification.code, name: qualification.name })
                }
              />
            )}
          />
        </Section>
      )}
      {jobs.length > 0 && (
        <Section icon="briefcase" title={copy.usedIn}>
          <JobChips jobs={jobs} area={area} go={go} />
        </Section>
      )}
    </>
  )
}

function QualificationBody({
  code,
  qualification,
  area,
  centers,
  go,
  onShowAll,
  onCenter,
}: {
  code: string
  qualification: Qualification | null
  area: DetailArea | null
  centers: readonly Center[]
  go: (next: Detail) => void
  onShowAll: () => void
  onCenter?: (id: string) => void
}) {
  const copy = useCopy()
  const details = copy.explore.aroundYou.details
  const here = area?.qualifications.find((item) => item.qualification_code === code) ?? null
  const forecast = here && area ? area.forecast(here) : null
  const offer = useTraining([code], centers)
  const training = offer.training
  const located = training.some((entry) => entry.center.distanceKm !== null)
  const nearest = training.find((entry) => entry.center.distanceKm !== null)?.center.distanceKm
  const scholarships = training.filter((entry) => entry.program.scholarship_open).length
  const jobs = unique(qualification?.possible_jobs ?? [])
  return (
    <>
      <div className="-mt-2 grid gap-1">
        {qualification?.sector && <p className={muted}>{qualification.sector}</p>}
        {forecast && <p className="m-0 text-13 font-semibold text-good-ink">{forecast}</p>}
      </div>
      <dl className="m-0 grid grid-cols-2 gap-px overflow-hidden rounded-12 border border-line bg-line sm:grid-cols-4">
        <Fact
          label={details.postingsHere}
          value={(here?.observed_posting_count ?? 0).toLocaleString()}
        />
        <Fact
          label={details.nearest}
          value={
            offer.pending ? '…' : nearest == null ? '—' : copy.explore.trip.km(roundKm(nearest))
          }
        />
        <Fact
          label={details.trainingCenters}
          value={offer.pending ? '…' : String(training.length)}
        />
        <Fact
          label={details.openScholarships}
          value={offer.pending ? '…' : String(scholarships)}
          tone={scholarships ? 'scholarship' : undefined}
        />
      </dl>
      <Section
        icon="learn"
        title={details.trainingCenters}
        lead={training.length ? (located ? details.centersLead : details.centersLeadNoPlace) : null}
      >
        {offer.pending ? (
          <RowsLoading label={details.loadingCenters} />
        ) : offer.failed && !training.length ? (
          <p className={cx(muted, 'flex flex-wrap items-center gap-x-2')}>
            <span role="status">{details.centersFailed}</span>
            <Button
              onPress={offer.retry}
              className={cx(
                'cursor-pointer rounded-6 border-0 bg-transparent p-0 font-semibold text-blue underline-offset-2 data-hovered:underline',
                focusRing,
              )}
            >
              {copy.explore.aroundYou.retry}
            </Button>
          </p>
        ) : training.length ? (
          <Expandable
            items={training}
            limit={5}
            keyOf={(entry) => entry.center.id}
            render={(entry) => (
              <CenterRow
                center={entry.center}
                program={entry.program}
                onPress={onCenter && (() => onCenter(entry.center.id))}
              />
            )}
          />
        ) : (
          <p className={muted}>{details.noCenters}</p>
        )}
      </Section>
      <Section icon="briefcase" title={details.possibleJobs}>
        {jobs.length ? (
          <JobChips jobs={jobs} area={area} go={go} />
        ) : (
          <p className={muted}>{details.noJobs}</p>
        )}
      </Section>
      <div className="flex flex-wrap justify-end gap-2 border-t border-rule pt-4">
        <Button onPress={onShowAll} className={button({ variant: 'primary' })}>
          <Icon name="map" size={17} />
          {training.length || offer.pending ? details.showAll : details.searchOnMap}
        </Button>
      </div>
    </>
  )
}

function JobBody({
  title,
  linked,
  area,
  catalog,
  centers,
  go,
  onCenter,
}: {
  title: string
  linked: string | null
  area: DetailArea | null
  catalog: readonly Qualification[]
  centers: readonly Center[]
  go: (next: Detail) => void
  onCenter?: (id: string, code: string) => void
}) {
  const copy = useCopy()
  const details = copy.explore.aroundYou.details
  const job = postedAs(title, area)
  const qualifications = byPostings(
    qualificationsForJob(title, catalog, linked ?? job?.linked_qualification),
    area,
  )
  // One row per center, nearest first, for whichever of the qualifications it offers.
  const training = useTraining(
    qualifications.map((qualification) => qualification.code),
    centers,
  ).training
  const skills = unique(qualifications.flatMap(coreSkills)).slice(0, 10)
  return (
    <>
      {job && (
        <p className={cx(muted, '-mt-2')}>
          {copy.explore.demand.postingCount(job.posting_count)} ·{' '}
          {copy.explore.demand.employerCount(job.employer_count)}
          {job.salary_median != null && (
            <> · {copy.explore.aroundYou.typicalPay(pesos(job.salary_median))}</>
          )}
        </p>
      )}
      {area && <Postings title={job?.title ?? title} place={area.place} />}
      <Section icon="award" title={details.forJob}>
        {qualifications.length ? (
          <Expandable
            items={qualifications}
            limit={4}
            keyOf={(qualification) => qualification.code}
            render={(qualification) => (
              <QualificationRow
                qualification={qualification}
                area={area}
                centers={centers}
                onPress={() =>
                  go({ kind: 'qualification', code: qualification.code, name: qualification.name })
                }
              />
            )}
          />
        ) : (
          <p className={muted}>{details.noQualification}</p>
        )}
      </Section>
      {training.length > 0 && (
        <Section icon="learn" title={details.whereToTrain} lead={details.whereLead}>
          <Expandable
            items={training}
            limit={3}
            keyOf={(entry) => entry.center.id}
            render={(entry) => (
              <CenterRow
                center={entry.center}
                program={entry.program}
                showQualification
                onPress={
                  onCenter && (() => onCenter(entry.center.id, entry.program.qualification.code))
                }
              />
            )}
          />
        </Section>
      )}
      {skills.length > 0 && (
        <Section icon="target" title={details.skillsNeeded}>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {skills.map((skill) => (
              <li key={skill} className="min-w-0">
                <Chip onPress={() => go({ kind: 'skill', name: skill })}>{skill}</Chip>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  )
}

/**
 * The posting records behind the job's count, one row each: who posted it, where, when, and the pay. Each opens the
 * posting's own page.
 */
function Postings({ title, place }: { title: string; place: AroundArea }) {
  const details = useCopy().explore.aroundYou.details
  const postings = useQuery(jobPostingsQuery(title, place))
  const heading = postings.data
    ? details.postingsBehind(postings.data.total)
    : details.postingsBehind(0)
  return (
    <Section icon="briefcase" title={heading} lead={details.postingsLead}>
      {postings.isPending ? (
        <RowsLoading label={details.postingsLoading} />
      ) : postings.isError ? (
        <p role="status" className={muted}>
          {details.postingsFailed}
        </p>
      ) : (
        <Expandable
          items={postings.data.items}
          limit={4}
          keyOf={(posting) => posting.job_id}
          render={(posting) => <PostingRow posting={posting} />}
        />
      )}
    </Section>
  )
}

function PostingRow({ posting }: { posting: JobPosting }) {
  const details = useCopy().explore.aroundYou.details
  const employer = posting.employer ? readable(posting.employer) : details.employerUnnamed
  const where = posting.location ? placeParts(posting.location).place : null
  const facts = [where, posting.employment_type, shortDay(posting.posted_on)].filter(Boolean)
  return (
    <Link
      to={jobPostingPath(posting.job_id)}
      aria-label={details.openPosting(readable(posting.title), employer)}
      className={linkRow}
    >
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="text-14 leading-snug font-semibold text-navy group-hover:text-blue">
          {employer}
        </span>
        <span className="text-12 leading-[1.45] text-muted">{facts.join(' · ')}</span>
      </span>
      {posting.salary_php != null && (
        <span className="shrink-0 text-14 font-bold text-navy tabular-nums">
          {pesos(posting.salary_php)}
        </span>
      )}
      <Icon name="arrowRight" size={16} className="shrink-0 text-muted group-hover:text-blue" />
    </Link>
  )
}

const linkRow =
  'group flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left no-underline transition-colors duration-150 hover:bg-soft active:bg-chip outline-none focus-visible:relative focus-visible:z-1 focus-visible:rounded-12 focus-visible:outline-3 focus-visible:outline-focus'

// ——— Parts ———

function Section({
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
    <section className="grid gap-2.5">
      <div className="grid gap-0.5">
        <h3 className="m-0 flex items-center gap-2 text-15 font-bold text-navy">
          <span
            aria-hidden="true"
            className="grid size-7 shrink-0 place-items-center rounded-8 bg-tint text-blue"
          >
            <Icon name={icon} size={15} />
          </span>
          {title}
        </h3>
        {lead && <p className="m-0 pl-9 text-13 leading-[1.5] text-muted">{lead}</p>}
      </div>
      {children}
    </section>
  )
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: 'scholarship' }) {
  return (
    <div className="grid content-start gap-0.5 bg-surface px-3 py-2.5">
      <dt className="text-12 leading-snug font-semibold text-muted">{label}</dt>
      <dd
        className={cx(
          'm-0 text-18 leading-tight font-bold tabular-nums',
          tone === 'scholarship' ? 'text-scholarship-fill' : 'text-navy',
        )}
      >
        {value}
      </dd>
    </div>
  )
}

/** Rows standing in while the centers load: the dialog keeps its shape instead of spinning. */
function RowsLoading({ label }: { label: string }) {
  return (
    <div role="status" className="grid divide-y divide-rule rounded-12 border border-line">
      <span className="sr-only">{label}</span>
      {[62, 48, 55].map((width) => (
        <span key={width} aria-hidden="true" className="grid gap-2 px-3 py-3.5">
          <span className="h-3 rounded-full bg-soft" style={{ width: `${width}%` }} />
          <span className="h-2.5 w-1/3 rounded-full bg-soft" />
        </span>
      ))}
    </div>
  )
}

/** The first `limit` rows, then the rest behind "more". */
function Expandable<T>({
  items,
  limit,
  keyOf,
  render,
}: {
  items: readonly T[]
  limit: number
  keyOf: (item: T) => string
  render: (item: T) => ReactNode
}) {
  const copy = useCopy().explore.aroundYou
  const [all, setAll] = useState(false)
  const shown = all ? items : items.slice(0, limit)
  return (
    <div className="grid">
      <ul className="m-0 grid list-none divide-y divide-rule rounded-12 border border-line p-0">
        {shown.map((item, index) => (
          <li
            key={keyOf(item)}
            className={cx('min-w-0', index >= limit && 'motion-safe:animate-row-in')}
          >
            {render(item)}
          </li>
        ))}
      </ul>
      {items.length > limit && (
        <Button
          aria-expanded={all}
          onPress={() => setAll(!all)}
          className={cx(
            'mt-1 inline-flex min-h-9 cursor-pointer items-center gap-1 justify-self-start rounded-8 border-0 bg-transparent px-2 text-13 font-semibold text-blue transition-colors duration-150 data-hovered:bg-soft data-pressed:bg-chip',
            focusRing,
          )}
        >
          {all ? copy.fewer : copy.more(items.length - limit)}
          <Icon
            name="chevron"
            size={14}
            className={cx(
              'transition-transform duration-200 motion-reduce:transition-none',
              all && 'rotate-180',
            )}
          />
        </Button>
      )}
    </div>
  )
}

const rowButton = cx(
  'group flex min-h-14 w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-3 py-2.5 text-left transition-colors duration-150',
  'data-hovered:bg-soft data-pressed:bg-chip',
  'outline-none data-focus-visible:relative data-focus-visible:z-1 data-focus-visible:rounded-12 data-focus-visible:outline-3 data-focus-visible:outline-focus',
)

/** A qualification that leads on: its name, sector and nearest center; its postings here on the right. */
function QualificationRow({
  qualification,
  area,
  centers,
  onPress,
}: {
  qualification: Qualification
  area: DetailArea | null
  centers: readonly Center[]
  onPress: () => void
}) {
  const copy = useCopy()
  const details = copy.explore.aroundYou.details
  const postings =
    area?.qualifications.find((item) => item.qualification_code === qualification.code)
      ?.observed_posting_count ?? null
  const { training } = useTraining([qualification.code], centers)
  const nearest = training.find((entry) => entry.center.distanceKm !== null)?.center.distanceKm
  const scholarship = training.some((entry) => entry.program.scholarship_open)
  return (
    <Button onPress={onPress} className={rowButton}>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="text-14 leading-snug font-semibold text-navy group-data-hovered:text-blue">
          {qualification.name}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-12 leading-[1.45] text-muted">
          <span>{qualification.sector}</span>
          <span aria-hidden="true">·</span>
          <span>
            {nearest != null
              ? details.nearestCenter(copy.explore.trip.km(roundKm(nearest)))
              : training.length
                ? details.centersListed(training.length)
                : details.noCenterYet}
          </span>
          {scholarship && <ScholarshipTag />}
        </span>
      </span>
      {postings ? (
        <span className="grid shrink-0 justify-items-end text-right">
          <span className="text-14 font-bold text-navy tabular-nums">
            {postings.toLocaleString()}
          </span>
          <span className="text-11 font-semibold text-muted">
            {copy.explore.aroundYou.postings}
          </span>
        </span>
      ) : null}
      <Icon
        name="arrowRight"
        size={16}
        className="shrink-0 text-muted group-data-hovered:text-blue"
      />
    </Button>
  )
}

/** A training center for the qualification: where it is, how far, and what its program offers. */
function CenterRow({
  center,
  program,
  showQualification = false,
  onPress,
}: {
  center: Center
  program: Program
  showQualification?: boolean
  onPress?: () => void
}) {
  const copy = useCopy()
  const details = copy.explore.aroundYou.details
  const mode =
    program.delivery_mode !== 'unknown' ? copy.training.delivery[program.delivery_mode] : null
  const facts = [
    program.duration_hours ? details.hours(program.duration_hours) : null,
    mode,
    peso(program.cost),
  ].filter((fact): fact is string => Boolean(fact))
  const content = (
    <>
      <span className="grid min-w-0 flex-1 gap-1">
        <span className="text-14 leading-snug font-semibold text-navy group-data-hovered:text-blue">
          {center.name}
        </span>
        {showQualification && (
          <span className="text-12 leading-snug font-semibold text-ink">
            {program.qualification.name}
          </span>
        )}
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-12 leading-[1.45] text-muted">
          <span className="inline-flex items-center gap-1">
            <Icon name="pin" size={13} />
            {center.city
              ? `${center.city}, ${center.province ?? center.region}`
              : placeLabel(center)}
          </span>
          {facts.length > 0 && <span>{facts.join(' · ')}</span>}
        </span>
        {program.scholarship_open && (
          <span>
            <ScholarshipTag />
          </span>
        )}
      </span>
      {center.distanceKm !== null && (
        <span className="shrink-0 text-14 font-bold text-navy tabular-nums">
          {copy.explore.trip.km(roundKm(center.distanceKm))}
        </span>
      )}
    </>
  )
  return onPress ? (
    <Button onPress={onPress} aria-label={details.showCenter(center.name)} className={rowButton}>
      {content}
      <Icon name="map" size={16} className="shrink-0 text-muted group-data-hovered:text-blue" />
    </Button>
  ) : (
    <div className="flex min-h-14 items-center gap-3 px-3 py-2.5">{content}</div>
  )
}

function ScholarshipTag() {
  const copy = useCopy().explore.results
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-scholarship-fill px-2 py-0.5 text-11 font-bold text-white">
      <Icon name="learn" size={12} />
      {copy.scholarship}
    </span>
  )
}

/** Possible jobs as chips; those with postings here carry their count. */
function JobChips({
  jobs,
  area,
  go,
}: {
  jobs: readonly string[]
  area: DetailArea | null
  go: (next: Detail) => void
}) {
  const copy = useCopy().explore.aroundYou
  return (
    <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
      {jobs.map((job) => {
        const posted = postedAs(job, area)
        return (
          <li key={job} className="min-w-0">
            <Chip onPress={() => go({ kind: 'job', title: posted?.title ?? job })}>
              {readable(job)}
              {posted && (
                <span className="rounded-full bg-surface px-1.5 text-11 font-bold text-navy tabular-nums">
                  <span aria-hidden="true">{posted.posting_count.toLocaleString()}</span>
                  <span className="sr-only">, {copy.postingCount(posted.posting_count)}</span>
                </span>
              )}
            </Chip>
          </li>
        )
      })}
    </ul>
  )
}

function Chip({ onPress, children }: { onPress: () => void; children: ReactNode }) {
  return (
    <Button
      onPress={onPress}
      className={cx(
        'inline-flex min-h-9 max-w-full cursor-pointer items-center gap-1.5 rounded-full border border-transparent bg-chip px-3 py-1 text-left text-13 font-medium text-ink transition-colors duration-150',
        'data-hovered:border-chip-hover-border data-hovered:bg-chip-hover data-pressed:bg-tint',
        focusRing,
      )}
    >
      {children}
    </Button>
  )
}

// ——— Data ———

interface Training {
  center: Center
  program: Program
}

interface Offer {
  training: Training[]
  pending: boolean
  failed: boolean
  retry: () => void
}

/**
 * The training centers with a program for the qualifications, nearest first, then by name: one row per center, with
 * its program for the first of the codes that it offers (one with an open scholarship where it has one). The page
 * reads only its search's programs, so each qualification's are read here (the same cached request as a search for
 * it), and placed with the page's centers, which carry the distance from the learner.
 */
function useTraining(codes: readonly string[], centers: readonly Center[]): Offer {
  const listings = useQueries({
    queries: codes.map((code) => ({ ...listingsQuery([code], null), staleTime: 5 * 60_000 })),
  })
  const byId = new Map(centers.map((center) => [center.id, center]))
  const found = new Map<string, Training>()
  listings.forEach((listing) => {
    for (const program of listing.data?.programs ?? []) {
      const center = byId.get(`training-${program.provider.id}`)
      if (!center) continue
      const kept = found.get(center.id)
      const better =
        kept &&
        kept.program.qualification.code === program.qualification.code &&
        !kept.program.scholarship_open &&
        program.scholarship_open
      if (!kept || better) found.set(center.id, { center, program })
    }
  })
  return {
    training: [...found.values()].sort(byDistance),
    pending: listings.some((listing) => listing.isPending),
    failed: listings.some((listing) => listing.isError),
    retry: () => listings.forEach((listing) => listing.isError && void listing.refetch()),
  }
}

function byDistance(a: Training, b: Training): number {
  const x = a.center.distanceKm ?? Number.POSITIVE_INFINITY
  const y = b.center.distanceKm ?? Number.POSITIVE_INFINITY
  return x - y || a.center.name.localeCompare(b.center.name)
}

/** Most posting records in the area first; the rest keep their order. */
function byPostings(qualifications: Qualification[], area: DetailArea | null): Qualification[] {
  if (!area) return qualifications
  const counts = new Map(
    area.qualifications.map((item) => [item.qualification_code, item.observed_posting_count ?? 0]),
  )
  return qualifications
    .map((qualification, order) => ({ qualification, order }))
    .sort(
      (a, b) =>
        (counts.get(b.qualification.code) ?? 0) - (counts.get(a.qualification.code) ?? 0) ||
        a.order - b.order,
    )
    .map((entry) => entry.qualification)
}

/**
 * The area's posting record for exactly this job title. Not the looser match that links jobs to qualifications:
 * "Pipe Welder" must not take the postings of "Welder".
 */
function postedAs(title: string, area: DetailArea | null): AreaJob | null {
  const key = plainTitle(title)
  return area?.jobs.find((item) => plainTitle(item.title) === key) ?? null
}

/** A cost as the listing gives it; a bare number ("7500.00") reads as pesos ("₱7,500"). */
function peso(cost: string | null): string | null {
  const text = cost?.trim()
  if (!text) return null
  if (!/^\d+(\.\d+)?$/.test(text)) return text
  return `₱${Number(text).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`
}

function unique(values: readonly string[]): string[] {
  const seen = new Set<string>()
  return values.filter((value) => {
    const key = value.trim().toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}
