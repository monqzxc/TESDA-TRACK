import { useQuery } from '@tanstack/react-query'
import { useId, useState, type CSSProperties, type ReactNode } from 'react'
import { Button } from 'react-aria-components'
import type { Qualification } from '../../api/queries.ts'
import { Icon } from '../../components/Icon.tsx'
import type { IconName } from '../../components/icons.ts'
import { InfoPopover } from '../../components/InfoPopover.tsx'
import { useCopy, useServerText } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { sessionStore } from '../../lib/sessionStore.ts'
import {
  latestDate,
  rankQualifications,
  topSkills,
  type AreaBlock,
  type AroundYouPlan,
} from './aroundYou.ts'
import {
  AROUND_MORE,
  AROUND_TOP,
  aroundJobsQuery,
  aroundQualificationsQuery,
  elsewhereQuery,
  type AreaQualification,
  type ElsewhereProvince,
} from './demandApi.ts'
import { ReasonList, useReasonLines } from './DemandPanel.tsx'
import { AroundYouDetail, type Detail, type DetailArea } from './AroundYouDetail.tsx'
import type { Center } from '../training/centers.ts'
import { readable } from './jobDisplay.ts'

/** Whether the card is folded to its pill, kept for the visit (this tab) once the learner chooses. */
const AROUND_YOU_KEY = 'tesda-track.around-you'

/**
 * Open or folded. Over the map it opens the first time and stays as the learner leaves it; in a phone's results
 * sheet it starts folded, since the sheet is short.
 */
export function useAroundYouOpen(openByDefault: boolean): [boolean, (open: boolean) => void] {
  const [chosen, setChosen] = useState(() => {
    const saved = sessionStore.getItem(AROUND_YOU_KEY)
    return saved === 'open' || saved === 'collapsed' ? saved : null
  })
  const open = chosen === null ? openByDefault : chosen === 'open'
  return [
    open,
    (next) => {
      const value = next ? 'open' : 'collapsed'
      void sessionStore.setItem(AROUND_YOU_KEY, value)
      setChosen(value)
    },
  ]
}

export interface AroundYouCardProps {
  plan: AroundYouPlan
  /** The qualification catalog the page has loaded: the top skills come from its competencies. */
  catalog: readonly Qualification[]
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Over the map from a tablet up; a section of the results sheet on a phone. */
  variant: 'float' | 'sheet'
  onProvince: (province: ElsewhereProvince) => void
  onQualification: (code: string, name: string) => void
  /** The page's centers, for a qualification's or a job's training centers in the details. */
  centers?: readonly Center[]
  /** A center chosen in the details: open it on the map, for the qualification. */
  onCenter?: (id: string, code: string) => void
  className?: string
  style?: CSSProperties
  /** How tall the open card may grow, over the map. */
  bodyStyle?: CSSProperties
}

const surface =
  'border border-border shadow-[0_8px_28px_-6px_rgb(var(--track-shadow-rgb)/0.22)] bg-glass'
const focusRing =
  'outline-none data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus'

/**
 * What is in demand around the learner (markdowns/explore-map-first-visit-updates.md, section 3): near their shared
 * location, in their home province and in other provinces that need their skills; for a guest, the top skills,
 * qualifications and jobs. A province is described by its job postings only: labor market forecasts are regional.
 */
export function AroundYouCard({
  plan,
  catalog,
  open,
  onOpenChange,
  variant,
  onProvince,
  onQualification,
  centers = [],
  onCenter,
  className,
  style,
  bodyStyle,
}: AroundYouCardProps) {
  const copy = useCopy().explore.aroundYou
  const bodyId = useId()
  // The details open over the page: what was pressed, what it led to, and the area it was pressed in.
  const [trail, setTrail] = useState<Detail[]>([])
  const [detailArea, setDetailArea] = useState<DetailArea | null>(null)
  const openDetail = (detail: Detail, area: DetailArea) => {
    setDetailArea(area)
    setTrail([detail])
  }
  const phone = variant === 'sheet'
  const title = plan.pillPlace ? copy.pill(plan.pillPlace) : copy.nationwide
  return (
    <section
      aria-label={copy.label}
      className={cx(
        'min-w-0 text-ink',
        phone ? 'rounded-12 border border-border bg-surface' : surface,
        phone ? 'w-full' : open ? 'w-[300px] rounded-12' : 'w-auto max-w-[300px] rounded-full',
        !open && 'motion-safe:animate-pop',
        className,
      )}
      style={style}
    >
      <Button
        aria-expanded={open}
        aria-controls={open ? bodyId : undefined}
        onPress={() => onOpenChange(!open)}
        className={cx(
          'group flex w-full min-w-0 cursor-pointer items-center gap-2 border-0 bg-transparent text-left text-14 font-semibold text-navy',
          'data-hovered:text-blue',
          focusRing,
          phone
            ? 'min-h-11 rounded-12 px-3'
            : open
              ? 'min-h-11 rounded-12 px-3'
              : 'min-h-11 rounded-full px-3.5',
        )}
      >
        <Icon name={plan.pillPlace ? 'pin' : 'growth'} size={17} className="shrink-0 text-blue" />
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <Icon
          name="chevron"
          size={16}
          className={cx(
            'shrink-0 text-muted transition-transform duration-200 motion-reduce:transition-none',
            open && 'rotate-180',
          )}
        />
      </Button>
      {open && (
        <div
          id={bodyId}
          className={cx(
            'grid gap-3 px-3 pb-3 motion-safe:animate-pop',
            !phone && 'overflow-y-auto overscroll-contain',
          )}
          style={bodyStyle}
        >
          {plan.blocks.map((block) => (
            <AreaSection
              key={`${block.kind}:${block.area.region}:${block.area.province}`}
              block={block}
              catalog={catalog}
              phone={phone}
              onDetail={openDetail}
            />
          ))}
          {plan.elsewhere && (
            <Elsewhere
              {...plan.elsewhere}
              phone={phone}
              onProvince={onProvince}
              onQualification={onQualification}
            />
          )}
          {plan.hint && <p className="m-0 text-12 leading-[1.5] text-muted">{copy.hint}</p>}
        </div>
      )}
      <AroundYouDetail
        trail={trail}
        area={detailArea}
        catalog={catalog}
        centers={centers}
        onTrail={setTrail}
        onQualification={onQualification}
        onCenter={onCenter}
      />
    </section>
  )
}

const blockHeading = 'm-0 text-13 leading-snug font-bold text-navy'
const listHeading = 'm-0 text-12 font-semibold text-muted'
const footnote = 'm-0 text-12 leading-[1.5] text-muted'

/** One area: its top jobs and qualifications by posting records (a guest also gets the top skills). */
function AreaSection({
  block,
  catalog,
  phone,
  onDetail,
}: {
  block: AreaBlock
  catalog: readonly Qualification[]
  phone: boolean
  onDetail: (detail: Detail, area: DetailArea) => void
}) {
  const copy = useCopy().explore.aroundYou
  const headingId = useId()
  const jobs = useQuery(aroundJobsQuery(block.area, block.personalFor))
  const qualifications = useQuery(aroundQualificationsQuery(block.area, block.personalFor))
  const top = block.kind === 'top'
  const heading = top
    ? null
    : block.kind === 'near'
      ? copy.near(block.place ?? '')
      : copy.province(block.place ?? '')
  const ranked = qualifications.data
    ? rankQualifications(qualifications.data.items, qualifications.data.ordering)
    : []
  // Past the top 3, only qualifications with postings here: "more" shouldn't fill up with rows that have none.
  const shownQualifications = ranked
    .filter((item, index) => index < AROUND_TOP || (item.observed_posting_count ?? 0) > 0)
    .slice(0, AROUND_MORE)
  const skills = top ? topSkills(ranked, catalog, AROUND_MORE) : []
  const date = latestDate(jobs.data?.snapshot_dates ?? [])
  const area: DetailArea = {
    qualifications: ranked,
    jobs: jobs.data?.items ?? [],
    forecast: (item) => (block.postingsOnly ? null : forecastLabel(item, copy)),
  }
  const nothing = Boolean(
    jobs.data && qualifications.data && !jobs.data.items.length && !ranked.length,
  )

  let body: ReactNode
  if (jobs.isPending || qualifications.isPending) {
    body = <Skeleton lists={top ? 3 : 2} />
  } else if (jobs.isError || qualifications.isError) {
    body = (
      <Failed
        onRetry={() => {
          if (jobs.isError) void jobs.refetch()
          if (qualifications.isError) void qualifications.refetch()
        }}
      />
    )
  } else if (nothing) {
    body = (
      <p role="status" className={footnote}>
        {block.postingsOnly && block.place ? copy.emptyProvince(block.place) : copy.empty}
      </p>
    )
  } else {
    const jobList = (
      <RankList
        title={top ? copy.topJobs : copy.jobs}
        icon="briefcase"
        phone={phone}
        unit={copy.postings}
        rows={(jobs.data?.items ?? []).map((job) => ({
          key: job.title,
          name: readable(job.title),
          count: job.posting_count,
          onPress: () =>
            onDetail({ kind: 'job', title: job.title, linked: job.linked_qualification }, area),
          pressLabel: copy.details.open(readable(job.title)),
        }))}
      />
    )
    const qualificationList = (
      <RankList
        title={top ? copy.topQualifications : copy.qualifications}
        icon="award"
        unit={copy.postings}
        rows={shownQualifications.map((item) => ({
          key: item.qualification_code,
          name: item.qualification_name,
          count: item.observed_posting_count ?? null,
          note: block.postingsOnly ? null : forecastLabel(item, copy),
          onPress: () =>
            onDetail(
              {
                kind: 'qualification',
                code: item.qualification_code,
                name: item.qualification_name,
              },
              area,
            ),
          pressLabel: copy.details.open(item.qualification_name),
        }))}
        phone={phone}
      />
    )
    body = (
      <div className="grid gap-2">
        {top && skills.length > 0 && (
          <RankList
            title={copy.topSkills}
            icon="target"
            phone={phone}
            rows={skills.map((skill) => ({
              key: skill,
              name: skill,
              count: null,
              onPress: () => onDetail({ kind: 'skill', name: skill }, area),
              pressLabel: copy.details.open(skill),
            }))}
          />
        )}
        {top ? (
          <>
            {qualificationList}
            {jobList}
          </>
        ) : (
          <>
            {jobList}
            {qualificationList}
          </>
        )}
        <PostingsNote
          date={date}
          snapshotDates={jobs.data?.snapshot_dates ?? []}
          postedBetween={jobs.data?.posted_between ?? []}
          totals={
            jobs.data
              ? { postings: jobs.data.posting_count, employers: jobs.data.employer_count }
              : null
          }
          limitations={jobs.data?.limitations ?? []}
          sourceUrl={jobs.data?.source_url ?? null}
        />
      </div>
    )
  }

  return (
    <section
      aria-labelledby={heading ? headingId : undefined}
      className="grid gap-2.5 border-t border-rule pt-3 first:border-t-0 first:pt-0"
    >
      {heading && (
        <h3 id={headingId} className={blockHeading}>
          {heading}
        </h3>
      )}
      {body}
    </section>
  )
}

/** A region's forecast for a qualification, where one covers the area. Never for a province. */
function forecastLabel(
  item: AreaQualification,
  copy: ReturnType<typeof useCopy>['explore']['aroundYou'],
): string | null {
  const covering = (item.forecast_support ?? []).filter(
    (forecast) =>
      forecast.geography_match === 'selected_area' ||
      forecast.geography_match === 'no_area_selected',
  )
  if (covering.some((forecast) => forecast.classification === 'hard_to_fill'))
    return copy.hardToFill
  if (covering.length) return copy.inDemand
  return null
}

interface Row {
  key: string
  name: string
  count: number | null
  note?: string | null
  onPress?: () => void
  pressLabel?: string
}

/**
 * One list in its own panel, so skills, qualifications and jobs read as separate things: names on the left, posting
 * records on the right in tabular figures. The top 3 show; "more" opens the rest.
 */
function RankList({
  title,
  icon,
  unit,
  rows,
  phone = false,
}: {
  title: string
  icon: IconName
  unit?: string
  rows: Row[]
  phone?: boolean
}) {
  const copy = useCopy().explore.aroundYou
  if (!rows.length) return null
  return (
    <Panel
      title={title}
      icon={icon}
      aside={
        unit &&
        rows.some((row) => row.count !== null) && (
          <span aria-hidden="true" className="text-11 font-semibold text-muted">
            {unit}
          </span>
        )
      }
    >
      <MoreList
        items={rows}
        keyOf={(row) => row.key}
        phone={phone}
        render={(row) => {
          const name = (
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="line-clamp-2 min-w-0">{row.name}</span>
              {row.note && <span className="text-12 font-semibold text-good-ink">{row.note}</span>}
            </span>
          )
          const count =
            row.count === null ? null : (
              <span className="shrink-0 font-semibold text-navy tabular-nums">
                <span aria-hidden="true">{row.count.toLocaleString()}</span>
                <span className="sr-only">{copy.postingCount(row.count)}</span>
              </span>
            )
          return row.onPress ? (
            <Button
              onPress={row.onPress}
              aria-label={row.pressLabel}
              className={cx(
                'group -mx-1.5 flex w-[calc(100%+0.75rem)] cursor-pointer items-baseline justify-between gap-2 rounded-8 border-0 bg-transparent px-1.5 py-1 text-left text-13 text-ink transition-colors duration-150',
                'data-hovered:bg-soft data-hovered:text-blue data-pressed:bg-chip',
                focusRing,
                phone ? 'min-h-11' : 'min-h-8',
              )}
            >
              {name}
              {count}
              <Icon
                name="arrowRight"
                size={13}
                className="shrink-0 self-center text-blue opacity-0 transition-opacity duration-150 group-data-focus-visible:opacity-100 group-data-hovered:opacity-100 motion-reduce:transition-none"
              />
            </Button>
          ) : (
            <div className="flex min-h-7 items-baseline justify-between gap-3 py-1 text-13">
              {name}
              {count}
            </div>
          )
        }}
      />
    </Panel>
  )
}

/** A panel of the card: a tinted icon and a title over its list, set apart from the lists beside it. */
function Panel({
  title,
  icon,
  aside,
  headingId,
  children,
}: {
  title: string
  icon: IconName
  aside?: ReactNode
  headingId?: string
  children: ReactNode
}) {
  return (
    <div className="grid gap-1.5 rounded-12 border border-line bg-surface px-2.5 pt-2 pb-1.5 motion-safe:animate-row-in">
      <div className="flex min-h-6 items-center gap-2">
        <span
          aria-hidden="true"
          className="grid size-6 shrink-0 place-items-center rounded-8 bg-tint text-blue"
        >
          <Icon name={icon} size={14} />
        </span>
        <h4 id={headingId} className={cx(listHeading, 'min-w-0 flex-1 text-navy')}>
          {title}
        </h4>
        {aside}
      </div>
      {children}
    </div>
  )
}

/**
 * The first AROUND_TOP items, then the rest behind "more". The rest slide open (their height grows from nothing)
 * and rise in one after another; closed, they are out of reach for keyboards and screen readers.
 */
function MoreList<T>({
  items,
  keyOf,
  render,
  phone,
  gap = '',
}: {
  items: readonly T[]
  keyOf: (item: T) => string
  render: (item: T) => ReactNode
  phone: boolean
  gap?: string
}) {
  const copy = useCopy().explore.aroundYou
  const restId = useId()
  const [more, setMore] = useState(false)
  // The rest join the page the first time they are asked for, and stay so that closing can slide them shut.
  const [opened, setOpened] = useState(false)
  const first = items.slice(0, AROUND_TOP)
  const rest = items.slice(AROUND_TOP)
  return (
    <div className="grid">
      <ol className={cx('m-0 grid list-none p-0', gap)}>
        {first.map((item) => (
          <li key={keyOf(item)} className="min-w-0">
            {render(item)}
          </li>
        ))}
      </ol>
      {rest.length > 0 && (
        <>
          <div
            id={restId}
            aria-hidden={!more}
            inert={!more}
            className={cx(
              'grid transition-[grid-template-rows,opacity] ease-[cubic-bezier(0.2,0.75,0.2,1)] motion-reduce:transition-none',
              more ? 'duration-300' : 'opacity-0 duration-200',
            )}
            style={{ gridTemplateRows: more ? '1fr' : '0fr' }}
          >
            <div className="min-h-0 overflow-hidden">
              {opened && (
                <ol
                  start={AROUND_TOP + 1}
                  className={cx('m-0 grid list-none p-0', gap, gap && 'pt-2')}
                >
                  {rest.map((item, index) => (
                    <li
                      key={keyOf(item)}
                      className={cx('min-w-0', more && 'motion-safe:animate-row-in')}
                      style={more ? { animationDelay: `${index * 35}ms` } : undefined}
                    >
                      {render(item)}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
          <Button
            aria-expanded={more}
            aria-controls={restId}
            onPress={() => {
              setOpened(true)
              setMore(!more)
            }}
            className={cx(
              'group -mx-1.5 mt-0.5 inline-flex cursor-pointer items-center gap-1 justify-self-start rounded-8 border-0 bg-transparent px-1.5 text-12 font-semibold text-blue transition-colors duration-150',
              'data-hovered:bg-soft data-pressed:bg-chip',
              focusRing,
              phone ? 'min-h-11' : 'min-h-7',
            )}
          >
            {more ? copy.fewer : copy.more(rest.length)}
            <Icon
              name="chevron"
              size={14}
              className={cx(
                'transition-transform duration-200 motion-reduce:transition-none',
                more && 'rotate-180',
              )}
            />
          </Button>
        </>
      )}
    </div>
  )
}

/** "Your skills are in demand in…": up to three other provinces, each a way onto the map's demand view. */
function Elsewhere({
  exclude,
  codes,
  personalFor,
  phone,
  onProvince,
  onQualification,
}: {
  exclude: string | null
  codes: string[]
  personalFor: string | null
  phone: boolean
  onProvince: (province: ElsewhereProvince) => void
  onQualification: (code: string, name: string) => void
}) {
  const copy = useCopy().explore.aroundYou
  const headingId = useId()
  const elsewhere = useQuery(elsewhereQuery(exclude, codes, personalFor))
  const date = latestDate(elsewhere.data?.snapshot_dates ?? [])
  return (
    <section
      aria-labelledby={headingId}
      className="grid gap-2.5 border-t border-rule pt-3 first:border-t-0 first:pt-0"
    >
      <h3 id={headingId} className={blockHeading}>
        {copy.elsewhere}
      </h3>
      {elsewhere.isPending ? (
        <Skeleton lists={1} />
      ) : elsewhere.isError ? (
        <Failed onRetry={() => void elsewhere.refetch()} />
      ) : !elsewhere.data.items.length ? (
        <p role="status" className={footnote}>
          {copy.emptyElsewhere}
        </p>
      ) : (
        <div className="grid gap-2">
          <Panel
            title={copy.provinces}
            icon="map"
            aside={
              <span aria-hidden="true" className="text-11 font-semibold text-muted">
                {copy.postings}
              </span>
            }
          >
            <MoreList
              items={elsewhere.data.items}
              keyOf={(item) => item.province}
              phone={phone}
              gap="gap-2"
              render={(item) => (
                <ElsewhereRow
                  item={item}
                  phone={phone}
                  onProvince={onProvince}
                  onQualification={onQualification}
                />
              )}
            />
          </Panel>
          <PostingsNote
            date={date}
            snapshotDates={elsewhere.data.snapshot_dates ?? []}
            postedBetween={[]}
            totals={null}
            limitations={elsewhere.data.limitations ?? []}
            sourceUrl={elsewhere.data.source_url}
          />
        </div>
      )}
    </section>
  )
}

function ElsewhereRow({
  item,
  phone,
  onProvince,
  onQualification,
}: {
  item: ElsewhereProvince
  phone: boolean
  onProvince: (province: ElsewhereProvince) => void
  onQualification: (code: string, name: string) => void
}) {
  const copy = useCopy().explore.aroundYou
  const reasons = useReasonLines(item.reasons ?? []).slice(0, 2)
  return (
    <div className="grid min-w-0 gap-1">
      <Button
        onPress={() => onProvince(item)}
        aria-label={copy.showProvince(item.province)}
        className={cx(
          'group -mx-1.5 flex w-[calc(100%+0.75rem)] cursor-pointer items-center gap-2 rounded-8 border-0 bg-transparent px-1.5 py-1 text-left text-13 transition-colors duration-150',
          'data-hovered:bg-soft data-pressed:bg-chip',
          focusRing,
          phone ? 'min-h-11' : 'min-h-8',
        )}
      >
        <Icon name="map" size={15} className="shrink-0 text-blue" />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-semibold text-navy group-data-hovered:text-blue">
            {item.province}
          </span>
          <span className="text-muted"> · {item.region_name}</span>
        </span>
        <span className="shrink-0 font-semibold text-navy tabular-nums">
          <span aria-hidden="true">{item.posting_count.toLocaleString()}</span>
          <span className="sr-only">{copy.postingCount(item.posting_count)}</span>
        </span>
      </Button>
      {item.titles.length > 0 && (
        <p className="m-0 pl-[1.4rem] text-12 leading-[1.45] text-muted">
          {item.titles.map(readable).join(', ')}
        </p>
      )}
      {item.qualifications.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-x-2 gap-y-0.5 p-0 pl-[1.4rem]">
          {item.qualifications.map((qualification) => (
            <li key={qualification.code} className="min-w-0">
              <Button
                onPress={() => onQualification(qualification.code, qualification.name)}
                aria-label={copy.searchFor(qualification.name)}
                className={cx(
                  'inline-flex max-w-full cursor-pointer items-center rounded-6 border-0 bg-transparent p-0 text-left text-12 leading-[1.45] font-semibold text-blue underline-offset-2 data-hovered:underline',
                  focusRing,
                  phone && 'min-h-11',
                )}
              >
                <span className="truncate">{qualification.name}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      {reasons.length > 0 && (
        <div className="pl-[1.4rem]">
          <ReasonList lines={reasons} className="text-12" />
        </div>
      )}
    </div>
  )
}

/** A snapshot date as "Nov 4, 2026". */
const shortDate = (value: string) => latestDate([value]) ?? value

/**
 * "Based on job postings, <date>" with the postings' source a press away: a PhilJobNet link on the line, and an "i"
 * button holding what the counts are (totals, posting and snapshot dates, the server's limitations).
 */
function PostingsNote({
  date,
  snapshotDates,
  postedBetween,
  totals,
  limitations,
  sourceUrl,
}: {
  date: string | null
  snapshotDates: readonly string[]
  postedBetween: readonly string[]
  totals: { postings: number; employers: number } | null
  limitations: readonly string[]
  sourceUrl: string | null
}) {
  const copy = useCopy().explore.aroundYou
  const serverText = useServerText()
  const posted = [...postedBetween].sort()
  const from = posted[0]
  const to = posted.at(-1)
  const paragraphs = [
    ...(totals ? [copy.postingsTotal(totals.postings, totals.employers)] : []),
    ...(from ? [copy.postedBetween(shortDate(from), shortDate(to ?? from))] : []),
    ...(snapshotDates.length
      ? [copy.snapshotOn([...snapshotDates].sort().map(shortDate).join(', '))]
      : []),
    ...limitations.map(serverText),
  ]
  const link = 'font-semibold text-blue underline-offset-2 hover:underline'
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 px-0.5">
      <p className={cx(footnote, 'min-w-0')}>
        <span>{date ? copy.basedOn(date) : copy.basedOnUndated}</span>
        {sourceUrl && (
          <>
            {' · '}
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              aria-label={copy.sourceLink}
              className={cx(link, 'inline-flex items-center gap-0.5')}
            >
              {copy.source}
              <Icon name="external" size={11} />
            </a>
          </>
        )}
      </p>
      {(paragraphs.length > 0 || sourceUrl) && (
        <InfoPopover label={copy.postingsInfo} paragraphs={paragraphs} className="-my-1.5">
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              className={cx(link, 'inline-flex items-center gap-1 text-13')}
            >
              {copy.sourceLink}
              <Icon name="external" size={12} />
            </a>
          )}
        </InfoPopover>
      )}
    </div>
  )
}

/** Rows standing in while the lists load: the card keeps its shape instead of spinning. */
function Skeleton({ lists }: { lists: number }) {
  const copy = useCopy().explore.aroundYou
  return (
    <div role="status" className="grid gap-3">
      <span className="sr-only">{copy.loading}</span>
      {Array.from({ length: lists }, (_, list) => (
        <div key={list} aria-hidden="true" className="grid gap-2">
          <span className="h-2.5 w-20 rounded-full bg-chip" />
          {[72, 58, 64].map((width) => (
            <span key={width} className="flex items-center justify-between gap-3">
              <span className="h-3 rounded-full bg-soft" style={{ width: `${width}%` }} />
              <span className="h-3 w-6 rounded-full bg-soft" />
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

function Failed({ onRetry }: { onRetry: () => void }) {
  const copy = useCopy().explore.aroundYou
  return (
    <p className="m-0 flex flex-wrap items-center gap-x-2 text-12 leading-[1.5] text-muted">
      <span role="status">{copy.failed}</span>
      <Button
        onPress={onRetry}
        className={cx(
          'cursor-pointer rounded-6 border-0 bg-transparent p-0 text-12 font-semibold text-blue underline-offset-2 data-hovered:underline',
          focusRing,
        )}
      >
        {copy.retry}
      </Button>
    </p>
  )
}
