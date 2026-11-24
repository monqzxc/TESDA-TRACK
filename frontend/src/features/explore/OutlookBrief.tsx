import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from 'react'
import { Button, Switch } from 'react-aria-components'
import { useQualifications } from '../../api/queries.ts'
import { Icon, type IconName } from '../../components/Icon.tsx'
import { InfoPopover } from '../../components/InfoPopover.tsx'
import { useCopy, useServerText } from '../../i18n/copy.ts'
import { readItem, writeItem } from '../../lib/storage.ts'
import { cx } from '../../lib/style.ts'
import { button } from '../../styles/buttons.ts'
import { CenterSuggestionFeedback } from '../suggestion-feedback/CenterSuggestionFeedback.tsx'
import type { View } from './ExplorePage.tsx'
import { travelTime } from '../training/format.ts'
import { estimateMinutes, findJobsUrl, roundKm } from './explore.ts'
import type { Balance } from './outlookApi.ts'
import type { Recommendation } from './recommend.ts'
import { useDemandStore, useExploreStore, type Explore } from './useExplore.ts'

const note = 'm-0 text-13 leading-[1.5] text-muted'
// Section labels in sentence case, their icon in the accent.
const heading =
  'm-0 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-13 font-bold text-navy [&>svg]:text-blue'
// The brief's body height as the learner dragged it, the smallest it opens at, and a keyboard step.
const SIZE_KEY = 'tesda-track.brief-height'
const MIN_BODY = 96
const STEP = 48
const tag =
  'inline-flex flex-none items-center gap-1 rounded-full px-2.5 py-0.5 text-12 font-bold whitespace-nowrap'
// Demand ahead reads as good news, a saturated area as a caution; a side with no records is the paler of each.
const balanceTone: Record<Balance, string> = {
  more_demand: 'bg-good-fill text-white',
  demand_only: 'bg-good-bg text-good-ink',
  balanced: 'bg-chip text-navy',
  more_supply: 'bg-warn-bg text-warn-ink',
  supply_only: 'bg-warn-bg text-warn-ink',
  no_records: 'bg-chip text-muted',
}
// The brief's cards: a soft tile that lifts and grows a little under the pointer and gives back when pressed.
const tile =
  'rounded-12 border border-transparent bg-soft transition-[transform,background-color,border-color,box-shadow] ' +
  'duration-200 ease-out hover:z-10 hover:scale-[1.02] hover:border-hover-border hover:bg-surface ' +
  'hover:shadow-[0_10px_24px_-12px_rgb(var(--track-shadow-rgb)/0.4)] active:scale-[0.99] ' +
  'motion-reduce:hover:scale-100 motion-reduce:active:scale-100'
// A whole card that is one button: the tile, plus the button's cursor, focus ring and alignment.
const tileButton = cx(
  tile,
  'relative flex w-full cursor-pointer flex-col items-start text-left data-focus-visible:outline-3 data-focus-visible:outline-focus',
)
// The area's counts, tinted like their map layer: demand green, training blue, assessment teal.
const statTone = {
  demand: 'bg-good-bg text-good-ink',
  training: 'bg-tint text-blue',
  assessment: 'bg-teal/10 text-teal',
} as const
const kindIcon = { training: 'learn', assessment: 'award' } as const
// The map's marker colors, so a recommended center's row and its starred pin read as the same kind.
const kindBadge = { training: 'bg-tint text-blue', assessment: 'bg-teal/10 text-teal' } as const

/**
 * The brief along the bottom of the map, for the qualification in focus: where the learner is and whether they
 * would relocate, the recorded demand and supply in that area, whether it looks saturated, and the centers
 * recommended from where they are. The analysis is the API's, written by fixed rules from the counts on the map, or
 * by AI from the same counts where the deployment turns that on; the recommended centers are worked out here, so the
 * learner's location stays in the browser.
 */
export function OutlookBrief({
  explore,
  view,
  onView,
  onSelect,
  className,
  ref,
}: {
  explore: Explore
  view: View
  onView: (view: View) => void
  onSelect: (id: string, code: string) => void
  className?: string
  /** The page measures the brief, to keep the map's buttons and camera clear of it. */
  ref?: Ref<HTMLElement>
}) {
  const en = useCopy()
  const serverText = useServerText()
  const copy = en.explore.outlook
  // Folded, the brief is its headline alone. It starts that way on a phone, where the map has little room to give.
  const [open, setOpen] = useState(
    () =>
      typeof window.matchMedia !== 'function' || window.matchMedia('(min-width: 768px)').matches,
  )
  // The body's height as the learner last dragged it, kept between visits; null leaves it to the default.
  const [size, setSize] = useState<number | null>(() => {
    const saved = Number(readItem(SIZE_KEY))
    return saved >= MIN_BODY ? saved : null
  })
  const bodyRef = useRef<HTMLDivElement>(null)
  const bodyId = useId()
  const catalog = useQualifications()
  const { outlook, summary, demandCode: code, matches, recommendations, relocate, search } = explore
  // Whether the open body has more below its fold: a short brief would otherwise hide its recommended centers.
  const [more, setMore] = useState(false)
  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const check = () =>
      setMore(!body.hidden && body.scrollHeight - body.scrollTop - body.clientHeight > 12)
    check()
    body.addEventListener('scroll', check, { passive: true })
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(check) : null
    observer?.observe(body)
    if (body.firstElementChild) observer?.observe(body.firstElementChild)
    return () => {
      body.removeEventListener('scroll', check)
      observer?.disconnect()
    }
  }, [open, code, outlook.data])
  const scrollMore = () => {
    const body = bodyRef.current
    if (!body) return
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    body.scrollBy({
      top: Math.max(body.clientHeight * 0.8, 80),
      behavior: still ? 'auto' : 'smooth',
    })
  }
  if (!code) return null

  const data = outlook.data
  const named = (item: string) =>
    matches.find((match) => match.qualification.code === item)?.qualification.name ??
    catalog.data?.find((qualification) => qualification.code === item)?.name ??
    item
  const name = data?.qualification.name ?? named(code)
  // The matches the learner can switch between, with the one in focus even when it came from the demand panel.
  const choices = [...new Set([...matches.map((match) => match.qualification.code), code])]
  const area = data?.areas.find((item) => item.region_code === data.region_code)
  const written = summary.data?.source === 'ai' ? summary.data : null
  const picks: { key: string; item: Recommendation }[] = [
    ...(recommendations.training ? [{ key: 'training', item: recommendations.training }] : []),
    ...(recommendations.assessment
      ? [{ key: 'assessment', item: recommendations.assessment }]
      : []),
    ...recommendations.relocation.map((item) => ({ key: item.center.id, item })),
  ]

  // The tallest the body may grow: the brief keeps to the lower three quarters of the window, below the map's top bar.
  const limit = () => Math.max(MIN_BODY * 2, Math.round(window.innerHeight * 0.75) - 140)
  // Content shorter than the drag stops the body there, so the bar never runs ahead of the pointer.
  const fit = (height: number) => {
    const body = bodyRef.current
    const content = body && !body.hidden ? body.scrollHeight : 0
    return Math.round(Math.min(Math.max(height, MIN_BODY), limit(), content || Infinity))
  }
  // Below the smallest height the body folds away, as an editor's panel does; dragged back up, it opens again.
  const resize = (height: number) => {
    if (height < MIN_BODY / 2) {
      setOpen(false)
      return
    }
    setOpen(true)
    setSize(fit(height))
  }
  const remember = (height: number | null) => {
    if (height) writeItem(SIZE_KEY, String(height))
  }
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !data) return
    event.preventDefault()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    const startY = event.clientY
    const startHeight = open ? (bodyRef.current?.clientHeight ?? 0) : 0
    let last = size
    const move = (next: globalThis.PointerEvent) => {
      const height = startHeight + (startY - next.clientY)
      resize(height)
      last = height >= MIN_BODY / 2 ? fit(height) : last
    }
    const up = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', up)
      remember(last)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
    handle.addEventListener('pointercancel', up)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = open ? (size ?? bodyRef.current?.clientHeight ?? 0) : 0
    const step = event.shiftKey ? STEP * 3 : STEP
    const next =
      event.key === 'ArrowUp'
        ? Math.max(current, MIN_BODY - step) + step
        : event.key === 'ArrowDown'
          ? current - step
          : event.key === 'End'
            ? limit()
            : event.key === 'Home'
              ? 0
              : null
    if (next === null) {
      if (event.key === 'Enter') setOpen(!open)
      return
    }
    event.preventDefault()
    resize(next)
    if (next >= MIN_BODY / 2) remember(fit(next))
  }

  const points = data && (
    <ul className="m-0 grid list-none gap-1 p-0">
      {data.insight.points.map((point) => (
        <li key={point.kind} className="text-13 leading-[1.5] text-ink">
          <strong className="font-bold text-navy">{copy.points[point.kind]}: </strong>
          {point.text}
        </li>
      ))}
    </ul>
  )

  return (
    <section
      ref={ref}
      aria-label={copy.label}
      className={cx(
        'z-[900] flex min-w-0 flex-col rounded-16 border border-border bg-surface shadow-[0_12px_32px_-10px_rgb(var(--track-shadow-rgb)/0.3)]',
        className,
      )}
    >
      {/* The sash along the top edge: drag it up to grow the brief, down to shrink or fold it, as in an editor. */}
      {data && (
        // A focusable separator is a widget in WAI-ARIA (the window splitter pattern); the lint rules predate it.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-controls={bodyId}
          aria-label={copy.resize}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={
            open
              ? Math.min(
                  100,
                  Math.round(((size ?? Math.max(window.innerHeight * 0.3, 176)) / limit()) * 100),
                )
              : 0
          }
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
          onPointerDown={onPointerDown}
          onKeyDown={onKeyDown}
          onDoubleClick={() => setOpen(!open)}
          className="group/sash relative -mb-1 flex h-4 flex-none cursor-row-resize touch-none items-start justify-center rounded-t-14 outline-none select-none focus-visible:outline-3 focus-visible:outline-focus"
        >
          <span
            aria-hidden="true"
            className="mt-1.5 h-1 w-10 rounded-full bg-dash transition-[width,background-color] duration-150 group-hover/sash:w-14 group-hover/sash:bg-blue group-focus-visible/sash:w-14 group-focus-visible/sash:bg-blue group-active/sash:w-16 group-active/sash:bg-blue"
          />
        </div>
      )}

      <div className={cx('flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3', !data && 'pt-2')}>
        <p
          className="m-0 flex flex-none items-center gap-1.5 text-12 font-bold tracking-[0.06em] text-eyebrow uppercase"
          title={copy.eyebrow}
        >
          <span className="grid size-8 place-items-center rounded-10 bg-fill text-white shadow-[0_4px_10px_-4px_rgb(23_92_211/0.6)]">
            <Icon name="growth" size="1.05rem" />
          </span>
          <span className="sr-only">{copy.eyebrow}</span>
        </p>
        {choices.length > 1 ? (
          <label className="min-w-0 flex-1 basis-40">
            <span className="sr-only">{copy.qualification}</span>
            <select
              className="h-8 w-full max-w-80 min-w-0 rounded-8 border border-border bg-surface px-2 text-13 font-semibold text-navy focus-visible:outline-2 focus-visible:outline-focus"
              value={code}
              onChange={(event) => useDemandStore.getState().setCode(event.target.value)}
            >
              {choices.map((item) => (
                <option key={item} value={item}>
                  {named(item)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="m-0 min-w-0 flex-1 basis-40 truncate text-14 font-bold text-navy">{name}</p>
        )}
        <Switch
          className="group flex flex-none cursor-pointer items-center gap-1.5 rounded-8 px-1 text-13 font-semibold text-navy data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus"
          isSelected={relocate}
          onChange={(on) => useExploreStore.getState().setRelocate(on)}
        >
          <Icon name="plane" className="text-muted group-data-selected:text-blue" />
          {copy.relocate}
          <span
            className="relative ml-0.5 h-5 w-9 flex-none rounded-full bg-dash transition-[background] duration-200 group-data-selected:bg-fill"
            aria-hidden="true"
          >
            <span className="absolute top-[3px] left-[3px] size-3.5 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-transform duration-200 group-data-selected:translate-x-4" />
          </span>
        </Switch>
        <Button
          aria-controls={bodyId}
          aria-expanded={open}
          aria-label={open ? copy.hide : copy.show}
          onPress={() => setOpen(!open)}
          className="grid size-8 flex-none cursor-pointer place-items-center rounded-8 border-0 bg-transparent text-muted data-focus-visible:outline-3 data-focus-visible:outline-focus data-hovered:bg-soft data-hovered:text-navy"
        >
          <Icon name="chevron" className={cx('transition-transform', !open && 'rotate-180')} />
        </Button>
      </div>

      {/* The verdict in one line and the area's counts, on show whether the brief is open or folded. */}
      <div
        aria-live="polite"
        aria-busy={outlook.isPlaceholderData || undefined}
        className={cx(
          'flex flex-col gap-1.5 px-3 pt-1.5 pb-2.5 transition-opacity duration-200',
          outlook.isPlaceholderData && 'opacity-60',
        )}
      >
        {data ? (
          <>
            <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
              <h2 className="m-0 min-w-0 flex-1 basis-56 text-15 leading-[1.35] font-bold wrap-anywhere text-navy">
                {serverText(data.insight.headline)}
              </h2>
              {area && (
                <span className={cx(tag, balanceTone[area.balance])}>
                  {copy.balance[area.balance]}
                </span>
              )}
              {area?.limited && (
                <span className={cx(tag, 'bg-chip text-muted')}>{copy.limited}</span>
              )}
            </div>
            {area && (
              <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                <Stat icon="briefcase" tone={statTone.demand} value={area.posting_count}>
                  {data.demand_is_sample
                    ? copy.stats.records(area.posting_count)
                    : copy.stats.postings(area.posting_count)}
                </Stat>
                <Stat icon="learn" tone={statTone.training} value={area.training_sites}>
                  {copy.stats.training}
                </Stat>
                <Stat icon="award" tone={statTone.assessment} value={area.assessment_sites}>
                  {copy.stats.assessment}
                </Stat>
              </ul>
            )}
          </>
        ) : outlook.isError ? (
          <div className="flex flex-wrap items-center gap-2">
            <p role="alert" className={note}>
              {copy.failed}
            </p>
            <Button
              className={button({ variant: 'tertiary', height: 36 })}
              onPress={() => void outlook.refetch()}
            >
              {copy.retry}
            </Button>
          </div>
        ) : (
          <p role="status" className={note}>
            {copy.loading}
          </p>
        )}
      </div>

      {/* The open brief stops well short of the window's height, and scrolls: the map keeps most of it. Dragged, it
          takes the height the learner gave it. While more of it sits below the fold, a fade and a "More below" button
          say so. */}
      <div className="relative flex min-h-0 flex-col">
        <div
          ref={bodyRef}
          id={bodyId}
          hidden={!open || !data}
          style={size ? { maxHeight: size } : undefined}
          className={cx(
            'overflow-y-auto overscroll-contain border-t border-rule px-3 pt-2.5 pb-2.5',
            !size && 'max-h-[max(30dvh,11rem)]',
          )}
        >
          {data && (
            <div
              className={cx(
                'flex flex-col gap-4 transition-opacity duration-200',
                outlook.isPlaceholderData && 'opacity-60',
              )}
            >
              <LocalDemand explore={explore} onView={onView} skill={name} />
              <NearbyQualifications explore={explore} />

              <div className="flex min-w-0 flex-col gap-1.5">
                <h3 className={heading}>
                  <Icon name="star" />
                  {copy.recommended}
                </h3>
                {picks.length ? (
                  // Side by side where they fit: the wider the window, the shorter the brief.
                  <ul className="-m-1 grid list-none grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-2 p-1">
                    {picks.map(({ key, item }) => (
                      <li
                        key={key}
                        className={cx(tile, 'relative flex min-w-0 flex-col overflow-hidden')}
                      >
                        <RecommendedRow
                          item={item}
                          onSelect={() => onSelect(item.center.id, code)}
                        />
                        <CenterSuggestionFeedback
                          compact
                          center={item.center}
                          qualificationCode={code}
                          goal={search?.chosen ? undefined : search?.query}
                          scope={search?.feedbackScope}
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={note}>{explore.reference ? copy.none : copy.needPlace}</p>
                )}
              </div>

              {/* The analysis in words, folded: the headline and counts above already carry it. */}
              <details className="group/why text-13 text-navy" aria-live="polite">
                <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-8 py-0.5 font-semibold text-blue [&::-webkit-details-marker]:hidden">
                  <Icon name="info" />
                  {copy.numbers}
                  <Icon
                    name="chevron"
                    className="rotate-180 transition-transform group-open/why:rotate-0"
                  />
                </summary>
                <div className="flex flex-col gap-1.5 pt-1.5">
                  <p className="m-0 max-w-[110ch] text-13 leading-[1.55] text-ink">
                    {written ? written.text : data.insight.summary}
                  </p>
                  {written && (
                    <p className="m-0 flex flex-wrap items-center gap-1.5 text-12 text-muted">
                      <span className={cx(tag, 'bg-tint px-2 text-blue')}>
                        <Icon name="sparkle" />
                        {copy.ai}
                      </span>
                      {copy.aiNote}
                    </p>
                  )}
                  {points}
                </div>
              </details>

              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-rule pt-2">
                {/* Where the brief comes from, behind one button instead of a standing footnote. */}
                <InfoPopover
                  showLabel
                  label={en.explore.info.results}
                  paragraphs={[
                    copy.footnote,
                    ...(picks.length ? [en.suggestionFeedback.note] : []),
                  ]}
                />
                <Button
                  className={cx(
                    button({ variant: 'tertiary', height: 36, snug: true }),
                    'flex-none',
                  )}
                  onPress={() => onView(view === 'demand' ? 'all' : 'demand')}
                >
                  <Icon name={view === 'demand' ? 'pin' : 'map'} />
                  {view === 'demand' ? copy.showCenters : copy.showDemand}
                </Button>
              </div>
            </div>
          )}
        </div>
        {more && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-16 items-end justify-center rounded-b-[15px] bg-linear-to-t from-surface from-35% to-transparent pb-2">
            <Button
              aria-controls={bodyId}
              onPress={scrollMore}
              className="pointer-events-auto inline-flex cursor-pointer items-center gap-1 rounded-full border border-border bg-surface py-1 pr-2 pl-3 text-12 font-semibold text-blue shadow-[0_6px_16px_-8px_rgb(var(--track-shadow-rgb)/0.45)] transition-colors data-focus-visible:outline-3 data-focus-visible:outline-focus data-hovered:bg-tint"
            >
              {copy.more}
              <Icon name="chevron" size="0.9rem" />
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}

/** One of the area's counts: an icon, the number, and a word for what it counts. */
function Stat({
  icon,
  tone,
  value,
  children,
}: {
  icon: IconName
  tone: string
  value: number
  children: ReactNode
}) {
  return (
    <li
      className={cx(
        'inline-flex items-center gap-1.5 rounded-10 px-2.5 py-1 text-12 font-semibold',
        tone,
        value === 0 && 'opacity-70',
      )}
    >
      <Icon name={icon} size="0.95rem" />
      <strong className="text-14 font-bold tabular-nums">{value.toLocaleString()}</strong>
      {children}
    </li>
  )
}

/** A recommended center: its kind, its name, why it was picked and how far it is. Pressed, it opens on the map. */
function RecommendedRow({ item, onSelect }: { item: Recommendation; onSelect: () => void }) {
  const en = useCopy()
  const copy = en.explore.outlook
  const { center, reason } = item
  const why =
    reason === 'near' || reason === 'region'
      ? copy.reasons[reason]
      : copy.reasons[reason](center.region || center.regionCode || '')
  const minutes = estimateMinutes(center.distanceKm)
  return (
    <Button
      onPress={onSelect}
      className="group flex w-full cursor-pointer items-start gap-2.5 border-0 bg-transparent px-3 pt-2.5 pb-2 text-left outline-none data-focus-visible:outline-3 data-focus-visible:-outline-offset-3 data-focus-visible:outline-focus"
    >
      <span
        className={cx(
          'mt-0.5 grid size-8 flex-none place-items-center rounded-10',
          kindBadge[center.kind],
        )}
      >
        <Icon name={kindIcon[center.kind]} size="1.05rem" label={copy.kinds[center.kind]} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-14 leading-[1.35] font-semibold wrap-anywhere text-navy">
          {center.name}
        </span>
        <span className="mt-0.5 block text-12 leading-[1.45] font-semibold text-ink">{why}</span>
        {(center.distanceKm !== null || minutes !== null) && (
          <span className="flex flex-wrap items-center gap-x-2.5 text-12 leading-[1.45] text-muted tabular-nums">
            {center.distanceKm !== null && (
              <span>{en.explore.trip.km(roundKm(center.distanceKm))}</span>
            )}
            {minutes !== null && <span>{en.explore.trip.minutes(travelTime(minutes))}</span>}
          </span>
        )}
      </span>
      <Icon
        name="chevron"
        className="mt-2 flex-none -rotate-90 text-muted transition-transform duration-200 group-data-hovered:translate-x-0.5 group-data-hovered:text-blue"
      />
    </Button>
  )
}

const levelTone = {
  high: 'bg-good-fill text-white',
  moderate: 'bg-good-bg text-good-ink',
  low: 'bg-chip text-navy',
  none: 'bg-chip text-muted',
} as const

/**
 * How much the qualification is needed in the learner's area, and the regions where it's needed more, nearby ones
 * first (Card 3), with the way out to TSP Find Jobs beside it. Choosing a region shows it on the demand map. Says so
 * plainly when there's no data, or no area.
 */
function LocalDemand({
  explore,
  onView,
  skill,
}: {
  explore: Explore
  onView: (view: View) => void
  skill: string
}) {
  const copy = useCopy().explore.outlook.local
  const data = explore.outlook.data
  if (!data) return null
  const higher = data.higher_demand ?? []
  const home = data.home_demand
  const header = (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
      <h3 className={heading}>
        <Icon name="target" />
        {copy.heading}
        {home && explore.homeSource && (
          <span className="inline-flex items-center gap-1 rounded-full bg-soft px-2 py-0.5 text-12 font-semibold tracking-normal normal-case">
            <Icon name={explore.homeSource === 'location' ? 'locate' : 'document'} />
            {copy.from[explore.homeSource]}
          </span>
        )}
      </h3>
      <FindJobsButton explore={explore} skill={skill} />
    </div>
  )
  if (!data.demand_available || !home) {
    return (
      <div role="group" aria-label={copy.heading} className="flex min-w-0 flex-col gap-1.5">
        {header}
        <p className={cx(note, 'flex items-start gap-1.5')} role="status">
          <Icon name="info" className="mt-[3px] flex-none" />
          {data.demand_available ? copy.noArea : copy.noData}
        </p>
      </div>
    )
  }
  const show = (code: string) => {
    useDemandStore.getState().setRegion(code)
    onView('demand')
  }
  const groups = [
    { key: 'nearby', label: copy.nearby, areas: higher.filter((area) => area.nearby) },
    {
      key: 'elsewhere',
      label: copy.elsewhere,
      areas: higher.filter((area) => !area.nearby),
    },
  ].filter((group) => group.areas.length)
  return (
    <div role="group" aria-label={copy.heading} className="flex min-w-0 flex-col gap-1.5">
      {header}
      <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-13 leading-[1.5] text-ink">
        <span className={cx(tag, levelTone[home.level])}>{copy.levels[home.level]}</span>
        <span>
          {copy.here(home.name, home.posting_count)}
          {home.rank ? (
            <span className="text-muted"> · {copy.rank(home.rank, home.ranked_of)}</span>
          ) : null}
        </span>
      </p>
      {groups.length ? (
        <div className="flex flex-col gap-1">
          <p className="m-0 flex items-center gap-1.5 text-12 font-bold text-navy">
            <Icon name="arrowRight" className="text-muted" />
            {copy.higher}
          </p>
          {groups.map((group) => (
            <div key={group.key} className="flex flex-col gap-1">
              <p className="m-0 text-12 font-semibold text-muted">{group.label}</p>
              <ul className="-m-1 grid list-none grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-2 p-1">
                {group.areas.map((area) => (
                  <li key={area.region_code}>
                    <Button
                      aria-label={copy.show(area.name)}
                      onPress={() => show(area.region_code)}
                      className={cx(tileButton, 'gap-0.5 px-2.5 py-1.5')}
                    >
                      <span className="flex w-full items-center gap-1.5 text-13 font-semibold wrap-anywhere text-navy">
                        <span className="min-w-0 flex-1">{area.name}</span>
                        <span className={cx(tag, 'px-2', levelTone[area.level])}>
                          {copy.levels[area.level]}
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-x-3 text-12 text-muted">
                        <span className="inline-flex items-center gap-1 font-semibold text-ink">
                          <Icon name="briefcase" />
                          {copy.records(area.posting_count)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Icon name="distance" />
                          {copy.away(area.distance_km)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Icon name="learn" />
                          {copy.centers(area.training_sites + area.assessment_sites)}
                        </span>
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className={cx(note, 'flex items-center gap-1.5')}>
          <Icon name="check" className="flex-none text-good-ink" />
          {copy.top}
        </p>
      )}
    </div>
  )
}

/**
 * A few other qualifications in demand where the learner is, ranked by demand and how well they fit the learner's
 * skills, each with why (Card 4). Choosing one puts it in focus, so the brief and the map follow it.
 * Shown only when there is something to list: with no demand data for the area the card is left out, with no
 * fallback message (US-0021 AC4), and it stays out while loading so it does not appear only to vanish.
 */
function NearbyQualifications({ explore }: { explore: Explore }) {
  const copy = useCopy().explore.outlook.nearby
  const levels = useCopy().explore.outlook.local.levels
  const { nearby, homeRegion } = explore
  const outlook = explore.outlook.data
  if (!homeRegion || !outlook?.demand_available || !outlook.home_demand) return null
  const suggestions = nearby.data?.suggestions ?? []
  if (!nearby.isError && !suggestions.length) return null
  return (
    <div role="group" aria-label={copy.heading} className="flex min-w-0 flex-col gap-1.5">
      <h3 className={heading}>
        <Icon name="lightbulb" />
        {copy.heading}
      </h3>
      {nearby.isError ? (
        <p className={note} role="alert">
          {copy.failed}
        </p>
      ) : (
        <ul className="-m-1 grid list-none grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-2 p-1">
          {suggestions.map((item) => (
            <li key={item.qualification.code}>
              <Button
                onPress={() => useDemandStore.getState().setCode(item.qualification.code)}
                aria-label={copy.focus(item.qualification.name)}
                className={cx(tileButton, 'gap-0.5 px-2.5 py-2')}
              >
                <span className="flex w-full flex-wrap items-center gap-1.5">
                  <span className="min-w-0 flex-1 text-13 font-semibold wrap-anywhere text-navy">
                    {item.qualification.name}
                  </span>
                  <span className={cx(tag, levelTone[item.level])}>{levels[item.level]}</span>
                </span>
                <ul className="m-0 list-none p-0">
                  {item.reasons.map((reason) => (
                    <li key={reason} className="text-12 leading-[1.45] text-muted">
                      {reason}
                    </li>
                  ))}
                </ul>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Opens TSP Find Jobs for the qualification in focus and the area being looked at (Card 5), in a new tab, so the
 * learner keeps their place here. Only the button: TESDA-TRACK has no job search of its own.
 */
function FindJobsButton({ explore, skill }: { explore: Explore; skill: string }) {
  const copy = useCopy().explore.outlook.findJobs
  const code = explore.demandRegion ?? explore.homeRegion
  const area = code ? (explore.regions.find((region) => region.code === code)?.name ?? null) : null
  const href = findJobsUrl(explore.config, skill || null, area)
  const look = cx(button({ variant: 'secondary', height: 36, snug: true }), 'flex-none')
  // Until the deployment sets the TSP link there is nowhere to go, so the button is left out rather than shown dead.
  if (!href) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer external"
      aria-label={copy.for(skill || null, area)}
      className={cx(look, 'no-underline')}
    >
      <Icon name="briefcase" />
      {copy.label}
      <Icon name="external" />
    </a>
  )
}
