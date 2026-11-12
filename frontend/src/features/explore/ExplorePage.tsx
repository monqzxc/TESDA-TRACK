import { lazy, Suspense, useId, useRef, useState, type FormEvent } from 'react'
import { Button, Input, Label, SearchField, ToggleButton } from 'react-aria-components'
import { useSearchParams } from 'react-router'
import { failureMessage } from '../../auth/fields.tsx'
import { Icon } from '../../components/Icon.tsx'
import { LoadBoundary } from '../../components/LoadBoundary.tsx'
import { PageHeading } from '../../components/PageHeading.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { button } from '../../styles/buttons.ts'
import { matchPathway } from '../training/recommendationApi.ts'
import { useTrainingStore } from '../training/state.ts'
import { nearestRegion } from './explore.ts'
import { CenterCard, LocationRow, NearbyPanel, ResultsPanel } from './Panels.tsx'
import { useExplore, useExploreStore } from './useExplore.ts'

// The map comes down with its renderer the first time it's shown, as on Training & Assessment.
const CenterMap = lazy(() => import('../training/CenterMap.tsx'))

/** What the panel and the map show: everything, one kind of center, or where the skills are in demand. */
export type View = 'all' | 'assessment' | 'training' | 'demand'
const VIEWS: readonly View[] = ['all', 'assessment', 'training', 'demand']

const mapStandIn =
  'm-0 grid h-full min-h-[320px] place-items-center rounded-18 border border-border bg-map-water text-15 text-muted'

/**
 * The map-first center finder, a demo at /explore (markdowns/TESDA-TRACK-Location-First-Implementation-Plan.md).
 * Find my pathway and Training & Assessment in one page: the learner types what they can do, sees the
 * qualifications that fit (the finder's own matching), and for each the nearest assessment and training centers on
 * a map, with an estimated travel time. A qualification opens the finder's readiness check and pathway. It uses the
 * API as it is today; the plan's new endpoints (skills word list, job demand by city) come later.
 */
export default function ExplorePage() {
  const en = useCopy()
  const copy = en.explore
  const explore = useExplore()
  const [params, setParams] = useSearchParams()
  const typed = params.get('type') as View | null
  const view: View = typed && VIEWS.includes(typed) ? typed : 'all'
  const setView = (next: View) =>
    setParams(
      (current) => {
        const updated = new URLSearchParams(current)
        if (next === 'all') updated.delete('type')
        else updated.set('type', next)
        return updated
      },
      { replace: true, preventScrollReset: true },
    )

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focus, setFocus] = useState(0)
  // The burger folds the panel down to its search row, so the map has the room.
  const [collapsed, setCollapsed] = useState(false)
  const bodyId = useId()
  // The panel explains a refused location (Locate on the map, or the switch), so a folded one opens to show it.
  const locationError = useTrainingStore((state) => state.locationError)
  const [seenError, setSeenError] = useState(locationError)
  if (seenError !== locationError) {
    setSeenError(locationError)
    if (locationError) setCollapsed(false)
  }
  const travelMode = useTrainingStore((state) => state.travelMode)
  const routeTo = useTrainingStore((state) => state.routeTo)
  const locatingAny = useTrainingStore((state) => state.locating)
  const store = useTrainingStore.getState

  const { centers, search, matches, reference, location, config } = explore
  const codes = new Set(matches.map((match) => match.qualification.code))
  // With a search, the pins are the centers listing a matched qualification; without one, every center.
  const listed = search
    ? centers.filter((center) =>
        [...center.programs, ...center.schedules].some((listing) =>
          codes.has(listing.qualification.code),
        ),
      )
    : centers
  const pins =
    view === 'training' || view === 'assessment'
      ? listed.filter((center) => center.kind === view)
      : listed
  const selected = centers.find((center) => center.id === selectedId) ?? null

  const canRoute = Boolean(config?.routing_enabled && location)
  const route =
    canRoute &&
    location &&
    selected &&
    routeTo === selected.id &&
    selected.latitude !== null &&
    selected.longitude !== null
      ? {
          from: location,
          to: { latitude: selected.latitude, longitude: selected.longitude },
          kind: selected.kind,
        }
      : null

  const select = (id: string, { onMap = false }: { onMap?: boolean } = {}) => {
    setSelectedId(id)
    // A center picked on the map opens its card, so a folded panel opens with it.
    setCollapsed(false)
    if (onMap) setFocus((n) => n + 1)
  }

  return (
    // Its own stacking context: the panel's and chips' z-index lift them over the map, not over the page's dialogs.
    <div className="isolate flex flex-col gap-3 md:relative md:block md:h-[max(560px,calc(100dvh-4.25rem))]">
      <PageHeading className="sr-only">{en.pages.explore.heading}</PageHeading>

      {/* The map fills the page; the panel and the chips float over it. On a phone they stack. */}
      <div
        className={cx(
          'h-[45dvh] min-h-[300px] [--center-map-height:100%] md:absolute md:inset-0 md:h-auto',
          // Pins and the camera keep clear of the open panel: 12px + 400px + 16px.
          !collapsed && 'md:[--map-overlay-inset:428px]',
        )}
      >
        <LoadBoundary fallback={<p className={mapStandIn}>{en.training.map.failed}</p>}>
          <Suspense
            fallback={
              <div className={mapStandIn}>
                <p role="status">{en.training.map.loading}</p>
              </div>
            }
          >
            <CenterMap
              centers={pins}
              selectedId={selectedId}
              focus={focus}
              reference={reference}
              radiusKm={null}
              route={route}
              travelMode={travelMode}
              onTravelMode={(mode) => store().setTravelMode(mode)}
              canRoute={canRoute}
              saved={[]}
              cartoKey={config?.carto_key ?? ''}
              today={explore.today}
              locating={locatingAny}
              onPick={(id) => select(id)}
              onDetails={(id) => select(id)}
              onRoute={(id) => {
                select(id)
                store().showRoute(id)
              }}
              onToggleSaved={() => {}}
              onLocate={() => store().locate()}
            />
          </Suspense>
        </LoadBoundary>
      </div>

      <Chips view={view} onView={setView} />

      <section
        aria-label={copy.search.label}
        className={cx(
          'z-[1000] flex flex-col gap-3 rounded-16 border border-border bg-surface p-4 shadow-[0_6px_24px_rgb(var(--track-shadow-rgb)/0.14)] max-md:order-first md:absolute md:top-3 md:left-3 md:w-[400px] md:overflow-y-auto',
          // Open, it runs the map's height; folded, it's only as tall as the search row.
          !collapsed && 'md:bottom-3',
        )}
      >
        <SearchBox
          regionCode={nearestRegion(reference, explore.regions)?.code ?? null}
          collapsed={collapsed}
          bodyId={bodyId}
          onToggle={() => setCollapsed(!collapsed)}
          onSearched={() => {
            setSelectedId(null)
            setView('all')
            setCollapsed(false)
          }}
        />
        {/* A class, not the hidden attribute alone: `flex` would override it and keep the body showing. */}
        <div
          id={bodyId}
          hidden={collapsed}
          className={collapsed ? 'hidden' : 'flex flex-col gap-3 md:flex-1'}
        >
          <LocationRow explore={explore} />
          {explore.failed && (
            <div className="rounded-12 bg-warn-bg p-3 text-14 text-warn-ink">
              <p role="alert" className="mt-0">
                {en.training.loadFailed}
              </p>
              <Button
                className={button({ variant: 'secondary', height: 36 })}
                onPress={explore.retry}
              >
                <Icon name="refresh" />
                {en.training.retryLoad}
              </Button>
            </div>
          )}
          {selected ? (
            <CenterCard
              center={selected}
              codes={codes}
              canRoute={canRoute}
              config={config}
              onBack={() => setSelectedId(null)}
              onRoute={() => store().showRoute(selected.id)}
            />
          ) : search ? (
            <ResultsPanel
              explore={explore}
              view={view}
              onView={setView}
              onSelect={(id) => select(id, { onMap: true })}
            />
          ) : (
            <NearbyPanel
              explore={explore}
              view={view}
              onSelect={(id) => select(id, { onMap: true })}
            />
          )}
          <p className="mt-auto mb-0 border-0 border-t border-rule pt-3 text-12 leading-[1.5] text-muted">
            <span className="mr-1.5 rounded-full bg-chip px-2 py-0.5 font-semibold text-navy">
              {copy.demoTag}
            </span>
            {copy.notes.demo}
          </p>
        </div>
      </section>
    </div>
  )
}

/** "Type what you can do": the finder's own goal reading and matching, kept in memory only. */
function SearchBox({
  regionCode,
  collapsed,
  bodyId,
  onToggle,
  onSearched,
}: {
  regionCode: string | null
  /** The panel is folded down to this row. */
  collapsed: boolean
  /** The part of the panel the burger shows and hides. */
  bodyId: string
  onToggle: () => void
  onSearched: () => void
}) {
  const copy = useCopy().explore
  const draft = useExploreStore((state) => state.draft)
  const search = useExploreStore((state) => state.search)
  const { setDraft, setSearch } = useExploreStore.getState()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const request = useRef<AbortController | null>(null)

  const run = async (event?: FormEvent) => {
    event?.preventDefault()
    const query = draft.trim()
    if (!query) return
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setPending(true)
    setError(null)
    try {
      const result = await matchPathway(query, regionCode, controller.signal)
      if (controller.signal.aborted) return
      setSearch({ query, result })
      onSearched()
    } catch (failure) {
      if (!controller.signal.aborted) setError(failureMessage(failure))
    } finally {
      if (!controller.signal.aborted) setPending(false)
    }
  }

  const clear = () => {
    request.current?.abort()
    setPending(false)
    setError(null)
    setDraft('')
    setSearch(null)
  }

  return (
    <form onSubmit={(event) => void run(event)} className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button
          aria-label={collapsed ? copy.panel.expand : copy.panel.collapse}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          onPress={onToggle}
          className="grid size-11 flex-none cursor-pointer place-items-center rounded-full text-navy data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus data-hovered:bg-soft data-pressed:bg-chip"
        >
          <Icon name="menu" size="1.4rem" />
        </Button>
        <SearchField
          value={draft}
          onChange={setDraft}
          onClear={clear}
          maxLength={1000}
          className="relative flex min-w-0 flex-1 items-center"
        >
          <Label className="sr-only">{copy.search.label}</Label>
          <Icon name="search" className="pointer-events-none absolute left-3.5 text-muted" />
          <Input
            className="h-12 w-full rounded-full border border-hover-border bg-surface py-0 pr-10 pl-10 text-16 text-navy placeholder:text-muted placeholder:opacity-100 data-focused:border-blue data-hovered:border-blue [&::-webkit-search-cancel-button]:hidden"
            placeholder={copy.search.placeholder}
          />
          {draft && (
            <Button
              aria-label={copy.search.clear}
              className="absolute right-2 grid size-8 cursor-pointer place-items-center rounded-full text-muted data-hovered:bg-soft"
              onPress={clear}
            >
              <Icon name="close" />
            </Button>
          )}
        </SearchField>
        <Button
          type="submit"
          className={button({ variant: 'primary', height: 48, snug: true })}
          isPending={pending}
        >
          {copy.search.submit}
        </Button>
      </div>
      {pending ? (
        <p role="status" className="m-0 text-13 text-muted">
          {copy.search.searching}
        </p>
      ) : error ? (
        <p role="alert" className="m-0 text-13 text-warn-ink">
          {error}
        </p>
      ) : (
        !search &&
        !collapsed && <p className="m-0 text-13 leading-[1.5] text-muted">{copy.search.hint}</p>
      )}
    </form>
  )
}

/** Training centers, Assessment centers, In demand jobs: each shows that kind; pressed again, everything. */
function Chips({ view, onView }: { view: View; onView: (view: View) => void }) {
  const copy = useCopy().explore.chips
  const chips: { view: View; label: string; icon: 'learn' | 'award' | 'briefcase' }[] = [
    { view: 'training', label: copy.training, icon: 'learn' },
    { view: 'assessment', label: copy.assessment, icon: 'award' },
    { view: 'demand', label: copy.demand, icon: 'briefcase' },
  ]
  return (
    <div
      role="group"
      aria-label={copy.label}
      className="z-[1000] flex gap-2 overflow-x-auto max-md:pb-1 md:absolute md:top-4 md:left-[428px] md:flex-wrap"
    >
      {chips.map((chip) => (
        <ToggleButton
          key={chip.view}
          isSelected={view === chip.view}
          onChange={(on) => onView(on ? chip.view : 'all')}
          className={cx(
            'inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full border px-4 text-14 font-semibold whitespace-nowrap shadow-[0_2px_8px_rgb(var(--track-shadow-rgb)/0.12)]',
            'data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus',
            'border-border bg-surface text-navy data-hovered:border-hover-border',
            'data-selected:border-fill data-selected:bg-fill data-selected:text-white',
          )}
        >
          <Icon name={chip.icon} />
          {chip.label}
        </ToggleButton>
      ))}
    </div>
  )
}
