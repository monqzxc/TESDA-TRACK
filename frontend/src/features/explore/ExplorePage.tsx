import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from 'react'
import { Button, Input, Label, SearchField, ToggleButton } from 'react-aria-components'
import { useSearchParams } from 'react-router'
import { useQualifications } from '../../api/queries.ts'
import { failureMessage } from '../../auth/fields.tsx'
import { useAuth } from '../../auth/useAuth.ts'
import { Icon } from '../../components/Icon.tsx'
import { LoadBoundary } from '../../components/LoadBoundary.tsx'
import MenuDrawer from '../../components/MenuDrawer.tsx'
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

// The search bar's own buttons: the burger, clear and search.
const iconButton =
  'grid size-9 flex-none cursor-pointer place-items-center rounded-8 border-0 bg-transparent text-muted data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus data-hovered:bg-soft data-hovered:text-navy data-pressed:bg-chip'

/** With reduced motion nothing slides, so there's no transition's end to wait for. */
function prefersReducedMotion() {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

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

  // Arriving from a qualification's page (?qualification=CODE&type=training): that qualification's centers, as a
  // search the learner didn't have to type. The code leaves the address once read; the view stays.
  const catalog = useQualifications()
  const linked = params.get('qualification')
  useEffect(() => {
    if (!linked || !catalog.data) return
    const qualification = catalog.data.find((item) => item.code === linked)
    if (qualification) {
      const { setDraft, setSearch } = useExploreStore.getState()
      const { code, name, sector, provenance } = qualification
      setDraft(name)
      setSearch({
        query: en.library.exploreGoal(name),
        chosen: true,
        result: {
          profile: {
            intent:
              params.get('type') === 'assessment'
                ? 'assessment_recommendation'
                : 'training_recommendation',
          },
          matches: [
            {
              qualification: { code, name, sector, provenance },
              score: 100,
              reason: copy.results.chosen,
            },
          ],
        },
      })
    }
    setParams(
      (current) => {
        const updated = new URLSearchParams(current)
        updated.delete('qualification')
        return updated
      },
      { replace: true, preventScrollReset: true },
    )
  }, [linked, catalog.data, params, setParams, en, copy])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focus, setFocus] = useState(0)
  // The panel opens folded down to its search row, so the map has the room; pressing in the box (or typing) opens
  // the rest, and Show less folds it again. With results to show (a search kept from earlier in the visit, or one
  // linked from a qualification's page), it starts open.
  const [collapsed, setCollapsed] = useState(() => !linked && !useExploreStore.getState().search)
  // The body scrolls only once it has finished opening: during the slide, a scrollbar would flash.
  const [opened, setOpened] = useState(!collapsed)
  const scrollable = !collapsed && (opened || prefersReducedMotion())
  const bodyId = useId()
  const input = useRef<HTMLInputElement>(null)
  const fold = () => {
    setCollapsed(true)
    setOpened(false)
    // Show less goes inert with the panel's body, so focus goes back to the box it opened from.
    input.current?.focus()
  }
  // The burger's drawer, in place of the app's sidebar.
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const { canViewReports, canOpenAdmin } = useAuth()
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
          // Pins and the camera keep clear of the open panel: 12px + 360px + 16px.
          !collapsed && 'md:[--map-overlay-inset:388px]',
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
      {/* The app's sidebar, over the map: this page has none beside it. */}
      <MenuDrawer
        isOpen={menuOpen}
        onOpenChange={setMenuOpen}
        isAdmin={canViewReports}
        canManage={canOpenAdmin}
        onNavigate={() => setMenuOpen(false)}
        returnFocus={() => menuButton.current}
      />

      <section
        aria-label={copy.search.label}
        className={cx(
          // Folded, a slim search bar; open, a card with the search row at its top. Only the body below it scrolls.
          'z-[1000] flex flex-col overflow-hidden rounded-12 border border-border bg-surface shadow-[0_4px_16px_rgb(var(--track-shadow-rgb)/0.14)] has-[[data-query]:focus]:border-blue max-md:order-first md:absolute md:top-3 md:left-3 md:max-h-[calc(100%-1.5rem)] md:w-[360px]',
          // Open, it runs the map's height. The height grows and shrinks with the body below (a min-height, since a
          // height can't move to or from auto).
          'motion-reduce:transition-none md:transition-[min-height] md:duration-300 md:ease-out',
          collapsed ? 'md:min-h-0' : 'md:min-h-[calc(100%-1.5rem)]',
        )}
      >
        <SearchBox
          regionCode={nearestRegion(reference, explore.regions)?.code ?? null}
          inputRef={input}
          menuOpen={menuOpen}
          menuRef={menuButton}
          onMenu={() => setMenuOpen(true)}
          onOpen={() => setCollapsed(false)}
          onSearched={() => {
            setSelectedId(null)
            setView('all')
            setCollapsed(false)
          }}
        />
        {/* The body slides open and shut: its one row grows from 0fr to 1fr, so it animates to its own height. */}
        <div
          id={bodyId}
          inert={collapsed}
          onTransitionEnd={(event) => {
            if (event.target === event.currentTarget && !collapsed) setOpened(true)
          }}
          className={cx(
            'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none md:min-h-0 md:flex-1',
            collapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100',
          )}
        >
          {/* No padding on the clipped row itself: it would stay showing when the row is 0 tall. */}
          <div className={cx('min-h-0 overflow-hidden', scrollable && 'md:overflow-y-auto')}>
            <div className="flex min-h-full flex-col gap-3 border-t border-rule p-4">
              {!search && (
                <p className="m-0 text-13 leading-[1.5] text-muted">{copy.search.hint}</p>
              )}
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
              <Button
                aria-controls={bodyId}
                aria-expanded={!collapsed}
                onPress={fold}
                className={cx(button({ variant: 'tertiary', height: 38, text: 14 }), 'mx-auto')}
              >
                <Icon name="chevron" className="rotate-180" />
                {copy.panel.collapse}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

/** "Type what you can do": the finder's own goal reading and matching, kept in memory only. */
function SearchBox({
  regionCode,
  inputRef,
  menuOpen,
  menuRef,
  onMenu,
  onOpen,
  onSearched,
}: {
  regionCode: string | null
  inputRef: RefObject<HTMLInputElement | null>
  /** The burger's drawer is open: the burger spins a half turn as it opens, and back as it closes. */
  menuOpen: boolean
  menuRef: RefObject<HTMLButtonElement | null>
  onMenu: () => void
  /** Pressing in the box, or typing, opens the rest of the panel. Focus alone doesn't: Show less hands it back. */
  onOpen: () => void
  onSearched: () => void
}) {
  const en = useCopy()
  const copy = en.explore
  const draft = useExploreStore((state) => state.draft)
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
    <form onSubmit={(event) => void run(event)} className="flex flex-col">
      {/* One slim bar: the burger, the box, and a search button at its end. */}
      <div className="flex h-11 items-center gap-0.5 px-1">
        <Button
          ref={menuRef}
          aria-label={en.nav.menu}
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          onPress={onMenu}
          className={iconButton}
        >
          <span
            className="grid place-items-center transition-[rotate] duration-500 ease-in-out motion-reduce:transition-none"
            style={{ rotate: menuOpen ? '180deg' : '0deg' }}
          >
            <Icon name="menu" size="1.15rem" />
          </span>
        </Button>
        <SearchField
          value={draft}
          onChange={(text) => {
            setDraft(text)
            onOpen()
          }}
          onClear={clear}
          maxLength={1000}
          className="flex min-w-0 flex-1 items-center"
        >
          <Label className="sr-only">{copy.search.label}</Label>
          {/* The panel's border shows focus (has-[[data-query]:focus]), so the box draws no ring of its own. */}
          <Input
            ref={inputRef}
            data-query
            onClick={onOpen}
            className="h-9 w-full min-w-0 border-0 bg-transparent px-1.5 text-15 text-navy placeholder:text-muted placeholder:opacity-100 focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
            placeholder={copy.search.placeholder}
          />
          {draft && (
            <Button aria-label={copy.search.clear} className={iconButton} onPress={clear}>
              <Icon name="close" />
            </Button>
          )}
        </SearchField>
        <Button
          type="submit"
          aria-label={copy.search.submit}
          isPending={pending}
          className={cx(iconButton, 'data-pending:cursor-progress data-pending:opacity-60')}
        >
          <Icon name="search" size="1.1rem" />
        </Button>
      </div>
      {pending ? (
        <p role="status" className="m-0 px-4 pb-2.5 text-13 text-muted">
          {copy.search.searching}
        </p>
      ) : (
        error && (
          <p role="alert" className="m-0 px-4 pb-2.5 text-13 text-warn-ink">
            {error}
          </p>
        )
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
      className="z-[1000] flex gap-2 overflow-x-auto max-md:pb-1 md:absolute md:top-4 md:left-[388px] md:flex-wrap"
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
