import { lazy, Suspense, useState } from 'react'
import { Button, Input, Label, SearchField, Switch } from 'react-aria-components'
import type { Qualification } from '../../api/queries.ts'
import { Icon } from '../../components/Icon.tsx'
import { LoadBoundary } from '../../components/LoadBoundary.tsx'
import { PageHeading } from '../../components/PageHeading.tsx'
import { WithCatalog } from '../../components/WithCatalog.tsx'
import { en } from '../../copy/en.ts'
import { readItem, writeItem } from '../../lib/storage.ts'
import { cx } from '../../lib/style.ts'
import buttons from '../../styles/buttons.module.css'
import utilities from '../../styles/utilities.module.css'
import { FilterPanel } from './FilterPanel.tsx'
import { Results, type ShowRequest } from './Results.tsx'
import { useTrainingFilters, useTrainingStore } from './state.ts'
import { useCenters } from './useCenters.ts'
import styles from './TrainingPage.module.css'

// Leaflet comes down with the map, the first time it's shown, and not at all while it's hidden.
const CenterMap = lazy(() => import('./CenterMap.tsx'))

const copy = en.training

/** Whether the learner hid the map, kept for this browser. */
const MAP_KEY = 'tesda-track.training-map'

/**
 * Training & Assessment, at /training (frontend/training_view.py show_training; US-07, US-08, US-09): filters, a map
 * whose pins can be picked, the matching centers, and the chosen center's programs or assessments. The filters are
 * in the address; the learner's location and any place they type are not.
 */
export default function TrainingPage() {
  return (
    <div className={styles.page}>
      <Header />
      <WithCatalog emptyState>{(catalog) => <Workspace catalog={catalog} />}</WithCatalog>
    </div>
  )
}

function Header() {
  const { filters, update } = useTrainingFilters()
  const useLocation = useTrainingStore((state) => state.useLocation)
  const setUseLocation = useTrainingStore((state) => state.setUseLocation)
  return (
    <div className={styles.header}>
      <div className={styles.titles}>
        <PageHeading className={styles.eyebrow}>{en.pages.training.heading}</PageHeading>
        <p className={styles.title}>{copy.hero.title}</p>
        <p className={styles.lead}>{copy.hero.lead}</p>
      </div>
      <div className={styles.toolbar}>
        <Switch className={styles.switch} isSelected={useLocation} onChange={setUseLocation}>
          <Icon name="pin" />
          {copy.useLocation}
          <span className={styles.track} aria-hidden="true">
            <span className={styles.thumb} />
          </span>
        </Switch>
        <SearchField
          className={styles.search}
          value={filters.search}
          // A new search shows its first result in full; typing doesn't add a step to Back for each letter.
          onChange={(search) => update({ search, center: null }, { replace: true })}
        >
          <Label className={utilities.visuallyHidden}>{copy.search}</Label>
          <Icon name="search" className={styles.searchIcon} />
          <Input className={styles.searchInput} placeholder={copy.searchPlaceholder} />
        </SearchField>
      </div>
    </div>
  )
}

function Workspace({ catalog }: { catalog: Qualification[] }) {
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
      <p role="status" className={styles.loading}>
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
      <div className={styles.mapToggle}>
        <Button className={cx(buttons.button, buttons.tertiary)} onPress={toggleMap}>
          <Icon name="map" />
          {mapShown ? copy.results.mapToggle.hide : copy.results.mapToggle.show}
        </Button>
      </div>
      <div className={styles.workspaceBox}>
        <div className={cx(styles.workspace, !mapShown && styles.listOnly)}>
          <div className={cx(styles.stage, mapShown && styles.withMap)}>
            <div className={styles.panelSlot}>
              <FilterPanel results={results} />
            </div>
            {mapShown && (
              <div className={styles.mapSlot}>
                <LoadBoundary fallback={<p className={styles.mapFailed}>{copy.map.failed}</p>}>
                  <Suspense
                    fallback={
                      <div className={styles.mapPlaceholder}>
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
        </div>
      </div>
    </>
  )
}
