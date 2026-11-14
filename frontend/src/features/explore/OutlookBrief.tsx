import { useId, useState, type Ref } from 'react'
import { Button, Switch } from 'react-aria-components'
import { useQualifications } from '../../api/queries.ts'
import { Icon } from '../../components/Icon.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { button } from '../../styles/buttons.ts'
import type { View } from './ExplorePage.tsx'
import { estimateMinutes, roundKm } from './explore.ts'
import type { Balance } from './outlookApi.ts'
import type { Recommendation } from './recommend.ts'
import { useDemandStore, useExploreStore, type Explore } from './useExplore.ts'

const note = 'm-0 text-13 leading-[1.5] text-muted'
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
const kindIcon = { training: 'learn', assessment: 'award' } as const
// The map's marker colors, so a recommended center's row and its starred pin read as the same kind.
const kindColor = { training: 'text-blue', assessment: 'text-teal' } as const

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
  const copy = en.explore.outlook
  // Folded, the brief is its headline alone. It starts that way on a phone, where the map has little room to give.
  const [open, setOpen] = useState(
    () =>
      typeof window.matchMedia !== 'function' || window.matchMedia('(min-width: 768px)').matches,
  )
  const bodyId = useId()
  const catalog = useQualifications()
  const { outlook, summary, demandCode: code, matches, recommendations, relocate } = explore
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
        'z-[900] flex min-w-0 flex-col rounded-14 border border-border bg-surface shadow-[0_4px_16px_rgb(var(--track-shadow-rgb)/0.14)]',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 pt-2">
        <p className="m-0 flex flex-none items-center gap-1.5 text-12 font-bold tracking-[0.06em] text-eyebrow uppercase">
          <span className="grid size-7 place-items-center rounded-full bg-tint text-blue">
            <Icon name="growth" size="1rem" />
          </span>
          {copy.eyebrow}
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
          className="group flex flex-none cursor-pointer items-center gap-2 text-13 font-semibold text-navy data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus"
          isSelected={relocate}
          onChange={(on) => useExploreStore.getState().setRelocate(on)}
        >
          {copy.relocate}
          <span
            className="relative h-5 w-9 flex-none rounded-full bg-dash transition-[background] duration-200 group-data-selected:bg-fill"
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

      {/* The verdict in one line, on show whether the brief is open or folded. */}
      <div
        aria-live="polite"
        aria-busy={outlook.isPlaceholderData || undefined}
        className={cx(
          'flex flex-wrap items-start gap-x-2 gap-y-1 px-3 pt-1.5 pb-2.5 transition-opacity duration-200',
          outlook.isPlaceholderData && 'opacity-60',
        )}
      >
        {data ? (
          <>
            <h2 className="m-0 min-w-0 flex-1 basis-56 text-15 leading-[1.35] font-bold wrap-anywhere text-navy">
              {data.insight.headline}
            </h2>
            {area && (
              <span className={cx(tag, balanceTone[area.balance])}>
                {copy.balance[area.balance]}
              </span>
            )}
            {area?.limited && <span className={cx(tag, 'bg-chip text-muted')}>{copy.limited}</span>}
          </>
        ) : outlook.isError ? (
          <>
            <p role="alert" className={note}>
              {copy.failed}
            </p>
            <Button
              className={button({ variant: 'tertiary', height: 36 })}
              onPress={() => void outlook.refetch()}
            >
              {copy.retry}
            </Button>
          </>
        ) : (
          <p role="status" className={note}>
            {copy.loading}
          </p>
        )}
      </div>

      {/* The open brief stops well short of the window's height, and scrolls: the map keeps most of it. */}
      <div
        id={bodyId}
        hidden={!open || !data}
        className="max-h-[max(30dvh,11rem)] overflow-y-auto border-t border-rule px-3 pt-2.5 pb-2.5"
      >
        {data && (
          <div
            className={cx(
              'flex flex-col gap-2.5 transition-opacity duration-200',
              outlook.isPlaceholderData && 'opacity-60',
            )}
          >
            <LocalDemand explore={explore} onView={onView} />
            <NearbyQualifications explore={explore} />

            {/* The analysis in a few sentences: AI-written where the deployment has it, else the rules' own. */}
            <div className="flex min-w-0 flex-col gap-1" aria-live="polite">
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
              <details className="text-13 text-navy">
                <summary className="w-fit cursor-pointer rounded-8 py-0.5 font-semibold text-blue">
                  {copy.numbers}
                </summary>
                <div className="pt-1">{points}</div>
              </details>
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              <h3 className="m-0 flex items-center gap-1.5 text-12 font-bold tracking-[0.04em] text-muted uppercase">
                <Icon name="star" />
                {copy.recommended}
              </h3>
              {picks.length ? (
                // Side by side where they fit: the wider the window, the shorter the brief.
                <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(14.5rem,1fr))] gap-1.5 p-0">
                  {picks.map(({ key, item }) => (
                    <li key={key}>
                      <RecommendedRow item={item} onSelect={() => onSelect(item.center.id, code)} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={note}>{explore.reference ? copy.none : copy.needPlace}</p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p className="m-0 min-w-0 flex-1 basis-64 text-12 leading-[1.45] text-muted">
                {copy.footnote}
              </p>
              <Button
                className={cx(button({ variant: 'tertiary', height: 36, snug: true }), 'flex-none')}
                onPress={() => onView(view === 'demand' ? 'all' : 'demand')}
              >
                <Icon name={view === 'demand' ? 'pin' : 'map'} />
                {view === 'demand' ? copy.showCenters : copy.showDemand}
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
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
      className="group flex w-full cursor-pointer items-start gap-2.5 rounded-10 border border-transparent bg-soft px-2.5 py-2 text-left transition-[border-color,background-color,box-shadow] duration-200 data-focus-visible:outline-3 data-focus-visible:outline-focus data-hovered:border-hover-border data-hovered:bg-surface data-hovered:shadow-[0_6px_14px_-6px_rgb(var(--track-shadow-rgb)/0.3)]"
    >
      <Icon
        name={kindIcon[center.kind]}
        size="1.1rem"
        className={cx('mt-0.5 flex-none', kindColor[center.kind])}
        label={copy.kinds[center.kind]}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-13 leading-[1.35] font-semibold wrap-anywhere text-navy">
          {center.name}
        </span>
        <span className="mt-0.5 flex flex-wrap gap-x-2 text-12 leading-[1.4] text-muted">
          <span className="font-semibold text-ink">{why}</span>
          {center.distanceKm !== null && (
            <span>{en.explore.trip.km(roundKm(center.distanceKm))}</span>
          )}
          {minutes !== null && <span>{en.explore.trip.minutes(minutes)}</span>}
        </span>
      </span>
      <Icon
        name="chevron"
        className="mt-1 flex-none -rotate-90 text-muted transition-transform duration-200 group-data-hovered:translate-x-0.5 group-data-hovered:text-blue"
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
 * first (Card 3). Choosing one shows it on the demand map. Says so plainly when there's no data, or no area.
 */
function LocalDemand({ explore, onView }: { explore: Explore; onView: (view: View) => void }) {
  const copy = useCopy().explore.outlook.local
  const data = explore.outlook.data
  if (!data) return null
  const higher = data.higher_demand ?? []
  const home = data.home_demand
  const heading = (
    <h3 className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-12 font-bold tracking-[0.04em] text-muted uppercase">
      <Icon name="target" />
      {copy.heading}
      {home && explore.homeSource && (
        <span className="font-semibold tracking-normal normal-case">
          · {copy.from[explore.homeSource]}
        </span>
      )}
    </h3>
  )
  if (!data.demand_available || !home) {
    return (
      <div role="group" aria-label={copy.heading} className="flex min-w-0 flex-col gap-1">
        {heading}
        <p className={note} role="status">
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
      {heading}
      <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-13 leading-[1.5] text-ink">
        <span className={cx(tag, levelTone[home.level])}>{copy.levels[home.level]}</span>
        <span>
          {copy.here(home.name, home.posting_count)}
          {home.rank ? ` ${copy.rank(home.rank, home.ranked_of)}` : ''}
        </span>
      </p>
      {groups.length ? (
        <div className="flex flex-col gap-1">
          <p className="m-0 text-13 font-bold text-navy">{copy.higher}</p>
          {groups.map((group) => (
            <div key={group.key} className="flex flex-col gap-1">
              <p className="m-0 text-12 font-semibold text-muted">{group.label}</p>
              <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(13rem,1fr))] gap-1.5 p-0">
                {group.areas.map((area) => (
                  <li key={area.region_code}>
                    <Button
                      aria-label={copy.show(area.name)}
                      onPress={() => show(area.region_code)}
                      className="flex w-full cursor-pointer flex-col items-start rounded-10 border border-transparent bg-soft px-2.5 py-1.5 text-left data-focus-visible:outline-3 data-focus-visible:outline-focus data-hovered:border-hover-border data-hovered:bg-surface"
                    >
                      <span className="text-13 font-semibold wrap-anywhere text-navy">
                        {area.name}
                      </span>
                      <span className="flex flex-wrap gap-x-2 text-12 text-muted">
                        <span className="font-semibold text-ink">
                          {copy.records(area.posting_count)}
                        </span>
                        <span>{copy.levels[area.level]}</span>
                        <span>{copy.away(area.distance_km)}</span>
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className={note}>{copy.top}</p>
      )}
    </div>
  )
}

/**
 * A few other qualifications in demand where the learner is, ranked by demand and how well they fit the learner's
 * skills, each with why (Card 4). Choosing one puts it in focus, so the brief and the map follow it.
 */
function NearbyQualifications({ explore }: { explore: Explore }) {
  const copy = useCopy().explore.outlook.nearby
  const levels = useCopy().explore.outlook.local.levels
  const { nearby, homeRegion } = explore
  if (!homeRegion || !explore.outlook.data?.home_demand) return null
  const data = nearby.data
  return (
    <div role="group" aria-label={copy.heading} className="flex min-w-0 flex-col gap-1.5">
      <h3 className="m-0 flex items-center gap-1.5 text-12 font-bold tracking-[0.04em] text-muted uppercase">
        <Icon name="lightbulb" />
        {copy.heading}
      </h3>
      {nearby.isError ? (
        <p className={note} role="alert">
          {copy.failed}
        </p>
      ) : !data ? (
        <p className={note} role="status">
          {copy.loading}
        </p>
      ) : data.suggestions.length ? (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-1.5 p-0">
          {data.suggestions.map((item) => (
            <li key={item.qualification.code}>
              <Button
                onPress={() => useDemandStore.getState().setCode(item.qualification.code)}
                aria-label={copy.focus(item.qualification.name)}
                className="flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-10 border border-transparent bg-soft px-2.5 py-2 text-left data-focus-visible:outline-3 data-focus-visible:outline-focus data-hovered:border-hover-border data-hovered:bg-surface"
              >
                <span className="flex w-full flex-wrap items-center gap-1.5">
                  <span className="min-w-0 flex-1 text-13 font-semibold wrap-anywhere text-navy">
                    {item.qualification.name}
                  </span>
                  <span className={cx(tag, levelTone[item.level])}>{levels[item.level]}</span>
                </span>
                <ul className="m-0 list-none p-0">
                  {item.reasons.map((reason) => (
                    <li key={reason} className="text-12 leading-[1.45] text-ink">
                      {reason}
                    </li>
                  ))}
                </ul>
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={note} role="status">
          {copy.none(data.region_name)}
        </p>
      )}
    </div>
  )
}
