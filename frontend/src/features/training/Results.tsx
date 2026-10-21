import { useEffect, useId, useRef, useState } from 'react'
import { Button } from 'react-aria-components'
import { EmptyState } from '../../components/EmptyState.tsx'
import { Icon } from '../../components/Icon.tsx'
import centerPhoto from '../../components/img/center-thumb.jpg'
import { SelectField } from '../../components/SelectField.tsx'
import { en } from '../../copy/en.ts'
import { cx } from '../../lib/style.ts'
import { button } from '../../styles/buttons.ts'
import { NO_FILTERS, SORTS, shortName, type SortOrder } from './address.ts'
import { placeLabel, summary, type Center } from './centers.ts'
import { CenterDetail, KindBadges } from './CenterDetail.tsx'
import { useTrainingFilters, useTrainingStore } from './state.ts'
import type { CenterResults } from './useCenters.ts'

const copy = en.training.results

const note = 'm-0 flex items-center gap-[0.35rem] text-13 text-muted'

/** Other centers listed at first, and how many more Show more adds. */
const LIST_STEP = 2

/**
 * A request to bring a center's details into view: acted on once that center is the one shown in full (choosing it
 * changes the address first). With `focus`, its name takes focus too, so the keyboard carries on from there.
 */
export interface ShowRequest {
  id: string
  focus: boolean
}

interface ResultsProps {
  results: CenterResults
  hasMap: boolean
  /** Shows the center on the map, even when it's already selected. */
  onViewOnMap: (centerId: string) => void
  /** Features a center chosen from the list. */
  onChoose: (centerId: string) => void
  /** The last request to show a center's details (a new object each time). */
  show: ShowRequest | null
}

/**
 * Every center that matches, sorted, with the selected one (or the first) in full and the rest as rows below
 * (classic/training_view.py _results). It's the whole result: nothing needs the map (US-08). A white card with its
 * own scrolling list beside the map, and the whole page's flow below it on narrow screens.
 */
export function Results({ results, hasMap, onViewOnMap, onChoose, show }: ResultsProps) {
  const { filters, update } = useTrainingFilters()
  const saved = useTrainingStore((state) => state.saved)
  const location = useTrainingStore((state) => (state.useLocation ? state.location : null))
  const routing = results.config?.routing_enabled ?? false
  const [limit, setLimit] = useState(LIST_STEP)
  const headingId = useId()
  const featuredHeading = useRef<HTMLHeadingElement>(null)

  const { centers, featured, reference } = results
  const others = featured ? centers.filter((center) => center.id !== featured.id) : []
  const featuredId = featured?.id

  useEffect(() => {
    if (!show || show.id !== featuredId) return
    const heading = featuredHeading.current
    if (show.focus) {
      heading?.scrollIntoView({ block: 'start' })
      heading?.focus({ preventScroll: true })
    } else {
      heading?.scrollIntoView({ block: 'nearest' })
    }
  }, [show, featuredId])

  return (
    <section
      aria-labelledby={headingId}
      className="flex min-w-0 flex-col rounded-18 border border-border bg-surface p-4 max-xs:rounded-14 max-xs:p-[0.85rem]"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id={headingId} className="m-0 text-[1.2rem] text-navy">
          {copy.heading(centers.length)}
        </h2>
        <SelectField<SortOrder>
          className="w-[11.5rem]"
          label={en.training.sortLabel}
          labelHidden
          options={SORTS.map((id) => ({ id, label: en.training.sorts[id] }))}
          value={filters.sort}
          onChange={(sort) => update({ sort })}
        />
      </div>

      <div className="mt-2 mb-3 flex flex-col gap-1" aria-live="polite">
        {reference ? (
          <p className={note}>
            <Icon name="distance" />
            {copy.distancesFrom(reference.mine ? copy.fromYou : reference.label)}
          </p>
        ) : (
          filters.sort === 'nearest' && <p className={note}>{copy.sortHint}</p>
        )}
        {results.truncated && <p className={note}>{copy.truncated}</p>}
      </div>

      {!featured ? (
        <NoMatch results={results} />
      ) : (
        <div
          className={cx(
            'flex flex-col gap-[0.6rem]',
            results.refreshing && 'opacity-60 transition-opacity duration-200 ease-[ease]',
          )}
        >
          <CenterDetail
            key={featured.id}
            center={featured}
            isNearest={featured.id === results.nearestId}
            routeFrom={routing ? location : null}
            hasMap={hasMap}
            onViewOnMap={() => onViewOnMap(featured.id)}
            fits={results.fits}
            today={results.today}
            headingRef={featuredHeading}
          />
          {others.length > 0 && (
            <>
              <h3 className="mt-4 mb-[0.2rem] text-[1.05rem] text-navy">
                {copy.others(others.length)}
              </h3>
              <ul className="m-0 flex list-none flex-col p-0">
                {others.slice(0, limit).map((center) => (
                  <CenterRow
                    key={center.id}
                    center={center}
                    saved={saved.includes(center.id)}
                    today={results.today}
                    onChoose={() => onChoose(center.id)}
                  />
                ))}
              </ul>
              {others.length > limit && (
                <Button
                  className={button({ variant: 'tertiary', wide: true })}
                  onPress={() => setLimit((current) => current + LIST_STEP)}
                >
                  <Icon name="chevron" />
                  {copy.showMore(others.length - limit)}
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}

/** A center in the list: its picture, name, place, badges and what it offers next. */
function CenterRow({
  center,
  saved,
  today,
  onChoose,
}: {
  center: Center
  saved: boolean
  today: string
  onChoose: () => void
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 border-t border-rule px-[0.3rem] py-[0.7rem] hovered:bg-row-hover">
      <img
        className="size-15 flex-none rounded-10 object-cover"
        src={centerPhoto}
        alt=""
        loading="lazy"
      />
      {/* Room for the name; with less, View details goes under the row. */}
      <div className="flex min-w-0 flex-[1_1_12rem] flex-col gap-[0.2rem]">
        <p className="m-0 text-15 font-bold wrap-anywhere text-navy">{center.name}</p>
        <p className="m-0 flex items-center gap-[0.3rem] text-13 text-ink">
          <Icon name="pin" />
          {placeLabel(center)}
        </p>
        <KindBadges center={center} saved={saved} />
        <p className="m-0 text-13 text-muted">{summary(center, today)}</p>
      </div>
      {/* Its name starts with what it shows, then says which center (label in name). */}
      <Button
        className={cx(button({ variant: 'tertiary', height: 36, text: 13 }), 'ml-auto flex-none')}
        aria-label={copy.viewDetailsOf(center.name)}
        onPress={onChoose}
      >
        {copy.viewDetails}
        <Icon name="arrowRight" />
      </Button>
    </li>
  )
}

/** Nothing matches: which filters are on, and ways to broaden them (US-07). */
function NoMatch({ results }: { results: CenterResults }) {
  const { filters, update } = useTrainingFilters()
  const placeText = useTrainingStore((state) => state.placeText)
  const setPlaceText = useTrainingStore((state) => state.setPlaceText)
  const regionName = results.regions.find((region) => region.code === results.region)?.name
  const active = [
    ...filters.kinds.map((kind) => en.training.kinds[kind]),
    ...(filters.search.trim() ? [`“${filters.search.trim()}”`] : []),
    ...(regionName ? [regionName] : []),
    ...(results.province ? [results.province] : []),
    ...results.codes.map((code) => shortName(results.names.get(code) ?? code)),
    ...(filters.mode ? [en.training.delivery[filters.mode]] : []),
    ...(filters.within ? [en.training.availability[String(filters.within) as '30' | '90']] : []),
    ...(filters.scholarship ? [en.training.filters.scholarship] : []),
    ...(placeText.trim() ? [placeText.trim()] : []),
  ]
  return (
    <EmptyState icon="search" heading={copy.none.heading} body={copy.none.body} headingLevel={3}>
      {active.length > 0 && (
        <p className="m-0 basis-full text-14 text-ink">{copy.active(active)}</p>
      )}
      <Button
        className={button()}
        onPress={() => {
          update({ ...NO_FILTERS, sort: filters.sort })
          setPlaceText('')
        }}
      >
        <Icon name="filterOff" />
        {en.training.filters.clear}
      </Button>
    </EmptyState>
  )
}
