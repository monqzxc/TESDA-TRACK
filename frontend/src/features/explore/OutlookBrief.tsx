import { useId, type ReactNode, type Ref } from 'react'
import { Button } from 'react-aria-components'
import { useQualifications } from '../../api/queries.ts'
import { Icon, type IconName } from '../../components/Icon.tsx'
import { InfoPopover } from '../../components/InfoPopover.tsx'
import { useCopy, useServerText } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { button } from '../../styles/buttons.ts'
import type { View } from './ExplorePage.tsx'
import { findJobsUrl, NEAR_KM } from './explore.ts'
import type { Balance } from './outlookApi.ts'
import { useDemandStore, type Explore } from './useExplore.ts'

const note = 'm-0 text-13 leading-[1.5] text-muted'
// Section labels in sentence case, their icon in the accent.
const heading =
  'm-0 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-13 font-bold text-navy [&>svg]:text-blue'
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
// The analysis's cards: a soft tile that lifts and grows a little under the pointer and gives back when pressed.
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
// Cards that float over the panel, as the center card does.
const floating =
  'shadow-[0_1px_2px_rgb(var(--track-shadow-rgb)/0.06),0_4px_12px_-4px_rgb(var(--track-shadow-rgb)/0.16)]'

/** The qualification in focus, its name for an id, and its area's figures, for the strip and the analysis alike. */
function useFocus(explore: Explore) {
  const catalog = useQualifications()
  const { outlook, demandCode: code, matches } = explore
  const named = (item: string) =>
    matches.find((match) => match.qualification.code === item)?.qualification.name ??
    catalog.data?.find((qualification) => qualification.code === item)?.name ??
    item
  const data = outlook.data
  const area = data?.areas.find((item) => item.region_code === data.region_code)
  return { code, data, area, named, name: data?.qualification.name ?? (code ? named(code) : '') }
}

/**
 * The strip along the bottom of the map, for the qualification in focus: its name, the verdict for the learner's
 * area and the area's counts, in one line. Everything else is one press away, in the panel beside the map, where a
 * center opens too: the map stays the focus. Absent until a qualification is chosen.
 */
export function OutlookBrief({
  explore,
  analysisOpen,
  onAnalysis,
  className,
  ref,
}: {
  explore: Explore
  /** The full analysis is open in the panel: the strip's button closes it. */
  analysisOpen: boolean
  onAnalysis: () => void
  className?: string
  /** The page measures the strip, to keep the map's buttons and camera clear of it. */
  ref?: Ref<HTMLElement>
}) {
  const copy = useCopy().explore.outlook
  const { outlook, matches } = explore
  const { code, data, area, named, name } = useFocus(explore)
  if (!code) return null
  // The matches the learner can switch between, with the one in focus even when it came from the demand panel.
  const choices = [...new Set([...matches.map((match) => match.qualification.code), code])]

  return (
    <section
      ref={ref}
      aria-label={copy.label}
      className={cx(
        'z-[900] flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-16 border border-border bg-surface py-2 pr-2 pl-2.5',
        'shadow-[0_12px_32px_-10px_rgb(var(--track-shadow-rgb)/0.3)]',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5 max-md:flex-1 max-md:basis-52">
        <span
          className="grid size-8 flex-none place-items-center rounded-10 bg-fill text-white shadow-[0_4px_10px_-4px_rgb(23_92_211/0.6)]"
          title={copy.eyebrow}
        >
          <Icon name="growth" size="1.05rem" label={copy.eyebrow} />
        </span>
        {choices.length > 1 ? (
          <label className="min-w-0 max-md:flex-1">
            <span className="sr-only">{copy.qualification}</span>
            {/* A set width: a percentage would leave the strip, sized to its content, nothing to measure. */}
            <select
              className="h-8 w-full min-w-0 rounded-8 border border-border bg-surface px-2 text-13 font-semibold text-navy focus-visible:outline-2 focus-visible:outline-focus md:w-60"
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
          <p className="m-0 max-w-72 min-w-0 truncate text-14 font-bold text-navy">{name}</p>
        )}
      </div>

      {/* The verdict and the counts: the one thing to take away, whether or not the analysis is open. */}
      <div
        aria-live="polite"
        aria-busy={outlook.isPlaceholderData || undefined}
        className={cx(
          'flex min-w-0 flex-wrap items-center gap-1.5 transition-opacity duration-200',
          outlook.isPlaceholderData && 'opacity-60',
        )}
      >
        {data ? (
          // One verdict for the learner's area; without an area, the counts across all regions. How rough the
          // signal is, is in the full analysis.
          <>
            {area ? (
              <span className={cx(tag, 'py-1', balanceTone[area.balance])}>
                {copy.balance[area.balance]}
              </span>
            ) : (
              <span className={cx(tag, 'bg-chip py-1 text-navy')}>{copy.nationwide}</span>
            )}
            <Stats area={area ?? data.totals} sample={data.demand_is_sample} compact />
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

      {data && (
        <Button
          aria-expanded={analysisOpen}
          onPress={onAnalysis}
          className={cx(
            button({
              variant: analysisOpen ? 'secondary' : 'primary',
              height: 36,
              text: 14,
              snug: true,
            }),
            'group flex-none',
          )}
        >
          {analysisOpen ? copy.hide : copy.open}
          <Icon
            name="chevron"
            className={cx(
              'transition-transform duration-200 motion-reduce:transition-none',
              analysisOpen ? 'rotate-90' : '-rotate-90 group-data-hovered:translate-x-0.5',
            )}
          />
        </Button>
      )}
    </section>
  )
}

/**
 * The full analysis, in the panel beside the map, opened from the strip as a center is from the list. Its verdict
 * and counts, then the way from training to work: get trained at a recommended center (starred in the results and
 * on the map, not listed again here), grow into the skills also in demand nearby, and land a job where it is needed.
 * The analysis is the API's, written by fixed rules from the counts on the map, or by AI from the same counts where
 * the deployment turns that on.
 */
export function OutlookAnalysis({
  explore,
  view,
  onView,
  onBack,
}: {
  explore: Explore
  view: View
  onView: (view: View) => void
  onBack: () => void
}) {
  const en = useCopy()
  const serverText = useServerText()
  const copy = en.explore.outlook
  const journeyId = useId()
  const { data, area, name } = useFocus(explore)
  if (!data) return null
  const written = explore.summary.data?.source === 'ai' ? explore.summary.data : null
  const starred = explore.recommendedIds.length
  const steps: { key: string; label: string; icon: IconName; body: ReactNode }[] = [
    {
      key: 'train',
      label: copy.journey.train,
      icon: 'learn',
      body: starred ? (
        <div className="flex flex-col items-start gap-1.5">
          <p className="m-0 flex items-start gap-1.5 text-13 leading-[1.5] text-ink">
            <Icon name="star" className="mt-[3px] flex-none text-[#b45309]" />
            {copy.journey.starred(starred)}
          </p>
          <Button
            className={cx(button({ variant: 'secondary', height: 36, text: 13, snug: true }))}
            onPress={onBack}
          >
            <Icon name="pin" />
            {copy.journey.see}
          </Button>
        </div>
      ) : (
        <p className={note}>{explore.reference ? copy.none : copy.needPlace}</p>
      ),
    },
    ...(nearbyShown(explore)
      ? [
          {
            key: 'skills',
            label: copy.journey.skills,
            icon: 'lightbulb' as const,
            body: <NearbyQualifications explore={explore} />,
          },
        ]
      : []),
    {
      key: 'work',
      label: copy.journey.work,
      icon: 'briefcase',
      body: <LocalDemand explore={explore} onView={onView} skill={name} />,
    },
  ]

  return (
    <article aria-label={copy.label} className="flex flex-col gap-3">
      <Button
        className={cx(
          button({ variant: 'pill', height: 44, text: 14, snug: true }),
          'group shadow-sm self-start motion-reduce:transition-none',
        )}
        onPress={onBack}
      >
        <Icon
          name="arrowLeft"
          className="transition-transform duration-200 group-data-hovered:-translate-x-0.5 motion-reduce:transform-none motion-reduce:transition-none"
        />
        {en.explore.card.back}
      </Button>

      {/* The verdict first: what the numbers say for this qualification where the learner is. */}
      <div className={cx('overflow-hidden rounded-16 border border-border bg-surface', floating)}>
        <div className="flex flex-col gap-2 bg-fill px-4 pt-4 pb-3.5 text-white">
          <p className="m-0 flex items-center gap-2 text-12 font-bold tracking-[0.06em] uppercase">
            <span className="grid size-8 place-items-center rounded-full bg-white/20">
              <Icon name="growth" size="1.05rem" />
            </span>
            {copy.eyebrow}
          </p>
          <h2 className="m-0 text-18 leading-[1.3] font-bold wrap-anywhere">{name}</h2>
        </div>
        <div
          aria-live="polite"
          className={cx(
            'flex flex-col gap-2.5 px-4 pt-3 pb-4 transition-opacity duration-200',
            explore.outlook.isPlaceholderData && 'opacity-60',
          )}
        >
          <p className="m-0 text-14 leading-[1.45] font-semibold wrap-anywhere text-navy">
            {serverText(data.insight.headline)}
          </p>
          <p className="m-0 flex flex-wrap gap-1.5">
            {area ? (
              <span className={cx(tag, 'py-1', balanceTone[area.balance])}>
                {copy.balance[area.balance]}
              </span>
            ) : (
              <span className={cx(tag, 'bg-chip py-1 text-navy')}>{copy.nationwide}</span>
            )}
            {area?.limited && (
              <span className={cx(tag, 'bg-chip py-1 text-muted')}>{copy.limited}</span>
            )}
          </p>
          <Stats area={area ?? data.totals} sample={data.demand_is_sample} />
        </div>
      </div>

      {/* From training to work: the three steps the product is for, joined by a line down their numbers. */}
      <section aria-labelledby={journeyId} className="flex flex-col gap-2.5 pt-1">
        <h3 id={journeyId} className="m-0 text-15 font-bold text-navy">
          {copy.journey.heading}
        </h3>
        <ol className="m-0 flex list-none flex-col p-0">
          {steps.map((step, index) => (
            <li key={step.key} className="relative flex gap-3 pb-4 last:pb-0">
              {index < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute top-8 bottom-0 left-[15px] w-0.5 rounded-full bg-dash"
                />
              )}
              <span
                aria-hidden="true"
                className="relative grid size-8 flex-none place-items-center rounded-full bg-tint text-blue"
              >
                <Icon name={step.icon} size="1rem" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
                <p className="m-0 text-12 font-bold tracking-[0.06em] text-eyebrow uppercase">
                  <span className="sr-only">{copy.journey.step(index + 1)} </span>
                  {step.label}
                </p>
                {step.body}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* The analysis in words, folded: the verdict and counts above already carry it. */}
      <details className="group/why rounded-12 bg-soft px-3 py-2 text-13 text-navy">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-8 py-0.5 font-semibold text-blue [&::-webkit-details-marker]:hidden">
          <Icon name="info" />
          {copy.numbers}
          <Icon
            name="chevron"
            className="rotate-180 transition-transform group-open/why:rotate-0"
          />
        </summary>
        <div className="flex flex-col gap-1.5 pt-1.5">
          <p className="m-0 text-13 leading-[1.55] text-ink">
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
          <ul className="m-0 grid list-none gap-1 p-0">
            {data.insight.points.map((point) => (
              <li key={point.kind} className="text-13 leading-[1.5] text-ink">
                <strong className="font-bold text-navy">{copy.points[point.kind]}: </strong>
                {point.text}
              </li>
            ))}
          </ul>
        </div>
      </details>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {/* Where the analysis comes from, behind one button instead of a standing footnote. */}
        <InfoPopover
          showLabel
          label={en.explore.info.results}
          paragraphs={[copy.footnote, ...(starred ? [en.suggestionFeedback.note] : [])]}
        />
        <Button
          className={cx(button({ variant: 'tertiary', height: 36, snug: true }), 'flex-none')}
          onPress={() => onView(view === 'demand' ? 'all' : 'demand')}
        >
          <Icon name={view === 'demand' ? 'pin' : 'map'} />
          {view === 'demand' ? copy.showCenters : copy.showDemand}
        </Button>
      </div>
    </article>
  )
}

/** The area's three counts: demand, training and assessment, an icon each. */
function Stats({
  area,
  sample,
  compact = false,
}: {
  area: { posting_count: number; training_sites: number; assessment_sites: number }
  sample: boolean
  compact?: boolean
}) {
  const copy = useCopy().explore.outlook
  return (
    <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
      <Stat icon="briefcase" tone={statTone.demand} value={area.posting_count} compact={compact}>
        {sample ? copy.stats.records(area.posting_count) : copy.stats.postings(area.posting_count)}
      </Stat>
      <Stat icon="learn" tone={statTone.training} value={area.training_sites} compact={compact}>
        {copy.stats.training}
      </Stat>
      <Stat icon="award" tone={statTone.assessment} value={area.assessment_sites} compact={compact}>
        {copy.stats.assessment}
      </Stat>
    </ul>
  )
}

/** One of the area's counts: an icon, the number, and a word for what it counts. */
function Stat({
  icon,
  tone,
  value,
  compact,
  children,
}: {
  icon: IconName
  tone: string
  value: number
  compact: boolean
  children: ReactNode
}) {
  return (
    <li
      className={cx(
        'inline-flex items-center gap-1.5 rounded-10 text-12 font-semibold',
        compact ? 'px-2 py-0.5' : 'px-2.5 py-1',
        tone,
        value === 0 && 'opacity-70',
      )}
    >
      <Icon name={icon} size="0.95rem" />
      <strong className={cx('font-bold tabular-nums', compact ? 'text-13' : 'text-14')}>
        {value.toLocaleString()}
      </strong>
      {children}
    </li>
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
  const allHigher = data.higher_demand ?? []
  // Respect the current choice immediately, even while an earlier relocation response remains cached.
  const higher = allHigher.filter(
    (area) =>
      explore.relocate ||
      (explore.rangeKm > NEAR_KM &&
        area.distance_km !== null &&
        Number.isFinite(area.distance_km) &&
        area.distance_km <= explore.rangeKm),
  )
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
        {!data.demand_available && (
          <span className={cx(tag, 'self-start', levelTone.none)}>{copy.levels.none}</span>
        )}
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
        {/* US-0018 AC5: no data is not a count of zero, so an area without records shows no figure to read as low. */}
        {home.level === 'none' ? (
          <span>{home.name}</span>
        ) : (
          <span>
            {copy.here(home.name, home.posting_count)}
            {home.rank ? (
              <span className="text-muted"> · {copy.rank(home.rank, home.ranked_of)}</span>
            ) : null}
          </span>
        )}
      </p>
      {home.level === 'none' ? (
        <p className={note}>{copy.noData}</p>
      ) : (
        // The takeaway, set off like the reasons in "Also in demand": easy to spot without reading the numbers.
        <p className="m-0 rounded-8 border-l-2 border-blue/40 bg-tint/50 px-2 py-1.5 text-13 leading-[1.45] font-semibold text-navy">
          {copy.meaning[home.level]}
        </p>
      )}
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
      ) : home.level === 'none' || allHigher.length > 0 ? null : (
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
function nearbyShown(explore: Explore): boolean {
  const outlook = explore.outlook.data
  if (!explore.homeRegion || !outlook?.demand_available || !outlook.home_demand) return false
  return explore.nearby.isError || (explore.nearby.data?.suggestions ?? []).length > 0
}

function NearbyQualifications({ explore }: { explore: Explore }) {
  const copy = useCopy().explore.outlook.nearby
  const levels = useCopy().explore.outlook.local.levels
  if (!nearbyShown(explore)) return null
  const { nearby } = explore
  const suggestions = nearby.data?.suggestions ?? []
  return (
    <div role="group" aria-label={copy.heading} className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-0.5">
        <h3 className={heading}>
          <Icon name="lightbulb" />
          {copy.heading}
        </h3>
        <InfoPopover label={copy.why} paragraphs={[copy.whyText]} className="-my-1.5" />
      </div>
      {nearby.isError ? (
        <p className={note} role="alert">
          {copy.failed}
        </p>
      ) : (
        <ul className="-m-1 grid list-none auto-rows-fr grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-2 p-1">
          {suggestions.map((item) => (
            <li key={item.qualification.code} className="flex">
              <Button
                onPress={() => useDemandStore.getState().setCode(item.qualification.code)}
                aria-label={copy.focus(item.qualification.name)}
                className={cx(tileButton, 'h-full gap-1.5 px-2.5 py-2')}
              >
                <span className="flex w-full flex-wrap items-center gap-1.5">
                  <span className="min-w-0 flex-1 text-13 font-semibold wrap-anywhere text-navy">
                    {item.qualification.name}
                  </span>
                  <span className={cx(tag, levelTone[item.level])}>{levels[item.level]}</span>
                </span>
                {/* The why, set off in a soft panel: easier to spot than plain muted text, without competing with the name. */}
                <ul className="m-0 flex w-full flex-1 list-none flex-col gap-0.5 rounded-8 border-l-2 border-blue/40 bg-tint/50 px-2 py-1.5">
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
