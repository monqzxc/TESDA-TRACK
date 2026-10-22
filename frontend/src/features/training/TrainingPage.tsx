import { lazy, Suspense, useState } from 'react'
import { Button, Input, Label, SearchField, Switch } from 'react-aria-components'
import type { Qualification } from '../../api/queries.ts'
import { Icon } from '../../components/Icon.tsx'
import { LoadBoundary } from '../../components/LoadBoundary.tsx'
import { PageHeading } from '../../components/PageHeading.tsx'
import { eyebrowHeading } from '../../components/PageHero.tsx'
import { WithCatalog } from '../../components/WithCatalog.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { readItem, writeItem } from '../../lib/storage.ts'
import { cx } from '../../lib/style.ts'
import { button } from '../../styles/buttons.ts'
import { FilterPanel } from './FilterPanel.tsx'
import { Results, type ShowRequest } from './Results.tsx'
import { useTrainingFilters, useTrainingStore } from './state.ts'
import { useCenters } from './useCenters.ts'

// Leaflet comes down with the map, the first time it's shown, and not at all while it's hidden.
const CenterMap = lazy(() => import('./CenterMap.tsx'))

/** Whether the learner hid the map, kept for this browser. */
const MAP_KEY = 'tesda-track.training-map'

const softShadow = 'shadow-[0_4px_16px_rgb(var(--track-shadow-rgb)/0.05)]'

const mapStandIn =
  'm-0 grid h-[680px] place-items-center rounded-18 border border-border bg-map-water text-15 text-muted max-sm:h-[460px]'

/**
 * Training & Assessment, at /training (classic/training_view.py show_training; US-07, US-08, US-09): filters, a map
 * whose pins can be picked, the matching centers, and the chosen center's programs or assessments. The filters are
 * in the address; the learner's location and any place they type are not. Drawn after classic/training.css: a
 * header with its toolbar, then the map beside the results.
 */
export default function TrainingPage() {
  return (
    <div className="max-w-full">
      <Header />
      <WithCatalog emptyState>{(catalog) => <Workspace catalog={catalog} />}</WithCatalog>
    </div>
  )
}

function Header() {
  const en = useCopy()
  const copy = en.training

  const { filters, update } = useTrainingFilters()
  const useLocation = useTrainingStore((state) => state.useLocation)
  const setUseLocation = useTrainingStore((state) => state.setUseLocation)
  return (
    <div className="mb-2 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div className="min-w-0 flex-[1_1_26rem]">
        <PageHeading className={eyebrowHeading}>{en.pages.training.heading}</PageHeading>
        <p className="mt-[0.3rem] mb-[0.4rem] font-display text-24 leading-[1.25] font-bold tracking-[-0.03em] text-navy">
          {copy.hero.title}
        </p>
        <p className="m-0 max-w-[660px] text-15 leading-[1.6] text-muted">{copy.hero.lead}</p>
      </div>
      {/* A location switch pill and a wide rounded search. */}
      <div className="flex flex-[1_1_30rem] flex-wrap items-center justify-end gap-[0.9rem] max-sm:justify-start">
        <Switch
          data-tour="training-location"
          className={cx(
            'group inline-flex min-h-11.5 cursor-pointer items-center gap-[0.6rem] rounded-full bg-surface px-[1.1rem] py-[0.55rem] font-medium text-navy',
            softShadow,
            'data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus',
          )}
          isSelected={useLocation}
          onChange={setUseLocation}
        >
          <Icon name="pin" />
          {copy.useLocation}
          <span
            className="relative ml-[0.4rem] h-6 w-[42px] flex-none rounded-full bg-dash transition-[background] duration-200 ease-[ease] group-data-selected:bg-fill"
            aria-hidden="true"
          >
            <span className="absolute top-[3px] left-[3px] size-4.5 rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-transform duration-200 ease-[ease] group-data-selected:translate-x-[18px]" />
          </span>
        </Switch>
        <SearchField
          data-tour="training-search"
          className="relative flex max-w-[560px] flex-[1_1_340px] items-center"
          value={filters.search}
          // A new search shows its first result in full; typing doesn't add a step to Back for each letter.
          onChange={(search) => update({ search, center: null }, { replace: true })}
        >
          <Label className="sr-only">{copy.search}</Label>
          <Icon name="search" className="pointer-events-none absolute left-4 text-muted" />
          <Input
            className={cx(
              'h-12.5 w-full rounded-full border border-transparent bg-surface py-0 pr-4 pl-[2.6rem] text-16 text-navy placeholder:text-muted placeholder:opacity-100 data-focused:border-blue',
              softShadow,
            )}
            placeholder={copy.searchPlaceholder}
          />
        </SearchField>
      </div>
    </div>
  )
}

function Workspace({ catalog }: { catalog: Qualification[] }) {
  const en = useCopy()
  const copy = en.training

  const results = useCenters(catalog)
  const { update } = useTrainingFilters()
  const location = useTrainingStore((state) => (state.useLocation ? state.location : null))
  const locating = useTrainingStore((state) => state.locating)
  const routeTo = useTrainingStore((state) => state.routeTo)
  const travelMode = useTrainingStore((state) => state.travelMode)
  const saved = useTrainingStore((state) => state.saved)
  const store = useTrainingStore.getState
  const [mapShown, setMapShown] = useState(() => readItem(MAP_KEY) !== 'hidden')
  // Bumped by View on map, so asking again reopens a center that's already selected.
  const [focusOnMap, setFocusOnMap] = useState(0)
  const [show, setShow] = useState<ShowRequest | null>(null)

  if (results.loading) {
    return (
      <p role="status" className="text-17 text-muted">
        {copy.results.loading}
      </p>
    )
  }

  const select = (centerId: string) => update({ center: centerId }, { replace: true })
  const canRoute = Boolean(results.config?.routing_enabled && location)
  const { selected, featured } = results
  // A route belongs to the center shown in full: the selected one, or the first result until one is selected.
  const route =
    canRoute &&
    location &&
    featured &&
    routeTo === featured.id &&
    featured.latitude !== null &&
    featured.longitude !== null
      ? {
          from: location,
          to: { latitude: featured.latitude, longitude: featured.longitude },
          kind: featured.kind,
        }
      : null

  const toggleMap = () => {
    setMapShown(!mapShown)
    writeItem(MAP_KEY, mapShown ? 'hidden' : 'shown')
  }

  return (
    <>
      {results.failed && (
        <div className="my-4 rounded-12 border border-border bg-warn-bg p-4 text-warn-ink">
          <p role="alert" className="mt-0">
            {copy.loadFailed}
          </p>
          {results.hasData && <p>{copy.staleResults}</p>}
          <Button className={button()} onPress={results.retry} isPending={results.retrying}>
            <Icon name="refresh" />
            {copy.retryLoad}
          </Button>
        </div>
      )}
      <div className="mb-1 flex justify-end">
        <Button
          data-tour="training-map-toggle"
          className={button({ variant: 'tertiary' })}
          onPress={toggleMap}
        >
          <Icon name="map" />
          {mapShown ? copy.results.mapToggle.hide : copy.results.mapToggle.show}
        </Button>
      </div>
      {/* Map beside the results; when that is too tight for both, the results go below the map. Without the map,
          the filters sit beside the results. */}
      <div className="@container/workspace">
        <div
          className={cx(
            'grid items-start gap-3 @max-[960px]/workspace:grid-cols-1',
            mapShown
              ? 'grid-cols-[minmax(0,3fr)_minmax(380px,1fr)]'
              : 'grid-cols-[minmax(280px,360px)_minmax(0,1fr)]',
          )}
        >
          {/* The filters float over the map's left edge. Where the map is too narrow for that, they sit above
              it. */}
          <div className="@container/stage relative flex min-w-0 flex-col gap-3">
            <div
              className={cx(
                mapShown &&
                  results.hasData &&
                  '@min-[640px]/stage:absolute @min-[640px]/stage:top-3.5 @min-[640px]/stage:left-3.5 @min-[640px]/stage:z-900 @min-[640px]/stage:flex @min-[640px]/stage:max-h-[calc(100%_-_28px)] @min-[640px]/stage:w-[360px] @min-[640px]/stage:flex-col @min-[640px]/stage:[&>section]:shadow-[0_12px_32px_rgb(var(--track-shadow-rgb)/0.15)]',
              )}
            >
              <FilterPanel results={results} />
            </div>
            {mapShown && results.hasData && (
              // Read by the map, so its pins, routes and popups keep clear of the panel: 14px + 360px + 14px.
              <div className="@min-[640px]/stage:[--map-overlay-inset:388px]">
                <LoadBoundary fallback={<p className={mapStandIn}>{copy.map.failed}</p>}>
                  <Suspense
                    fallback={
                      <div className={mapStandIn}>
                        <p role="status">{copy.map.loading}</p>
                      </div>
                    }
                  >
                    <CenterMap
                      centers={results.centers}
                      selectedId={selected?.id ?? null}
                      focus={focusOnMap}
                      reference={results.reference}
                      route={route}
                      travelMode={travelMode}
                      onTravelMode={(mode) => store().setTravelMode(mode)}
                      canRoute={canRoute}
                      saved={saved}
                      cartoKey={results.config?.carto_key ?? ''}
                      today={results.today}
                      locating={locating}
                      onPick={(id) => {
                        select(id)
                        setShow({ id, focus: false })
                      }}
                      onDetails={(id) => {
                        select(id)
                        setShow({ id, focus: true })
                      }}
                      onRoute={(id) => {
                        select(id)
                        store().showRoute(id)
                      }}
                      onToggleSaved={(id) => store().toggleSaved(id)}
                      onLocate={() => store().locate()}
                    />
                  </Suspense>
                </LoadBoundary>
              </div>
            )}
          </div>
          {results.hasData && (
            <Results
              results={results}
              hasMap={mapShown}
              onViewOnMap={(id) => {
                select(id)
                setFocusOnMap((n) => n + 1)
              }}
              onChoose={(id) => {
                select(id)
                setShow({ id, focus: true })
              }}
              show={show}
            />
          )}
        </div>
      </div>
    </>
  )
}
