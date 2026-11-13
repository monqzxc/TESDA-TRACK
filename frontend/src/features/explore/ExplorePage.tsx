import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent,
  type RefObject,
} from 'react'
import { Button, Input, Label, SearchField, ToggleButton } from 'react-aria-components'
import { NavLink, useLocation, useSearchParams } from 'react-router'
import { useQualifications } from '../../api/queries.ts'
import { failureMessage } from '../../auth/fields.tsx'
import { Icon } from '../../components/Icon.tsx'
import { LoadBoundary } from '../../components/LoadBoundary.tsx'
import { useSidebarStore } from '../../components/sidebarState.ts'
import { PageHeading } from '../../components/PageHeading.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'
import { button } from '../../styles/buttons.ts'
import { matchPathway } from '../training/recommendationApi.ts'
import { useTrainingStore } from '../training/state.ts'
import type { DemandMapArea } from '../training/CenterMapTypes.ts'
import { nearestRegion } from './explore.ts'
import { OutlookBrief } from './OutlookBrief.tsx'
import { CenterCard, LocationRow, NearbyPanel, ResultsPanel } from './Panels.tsx'
import { useDemandStore, useExplore, useExploreStore } from './useExplore.ts'

// The map comes down with its renderer the first time it's shown, as on Training & Assessment.
const CenterMap = lazy(() => import('../training/CenterMap.tsx'))

/** What the panel and the map show: everything, one kind of center, or where the skills are in demand. */
export type View = 'all' | 'assessment' | 'training' | 'demand'
const VIEWS: readonly View[] = ['all', 'assessment', 'training', 'demand']

const mapStandIn = 'm-0 grid h-full place-items-center bg-map-water text-15 text-muted'

// The search bar's own buttons: the burger, clear and search.
const iconButton =
  'grid size-9 flex-none cursor-pointer place-items-center rounded-8 border-0 bg-transparent text-muted data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus data-hovered:bg-soft data-hovered:text-navy data-pressed:bg-chip'

/** An element's height as it changes, for the room it takes over the map: 0 until it's on the page. */
function useHeight(): [(node: HTMLElement | null) => void, number] {
  const [node, setNode] = useState<HTMLElement | null>(null)
  const [height, setHeight] = useState(0)
  useEffect(() => {
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setHeight(node.offsetHeight))
    observer.observe(node)
    return () => observer.disconnect()
  }, [node])
  return [setNode, node ? height : 0]
}

const TABLET_UP = '(min-width: 768px)'

/** Whether the window is a tablet's width or more, where the results are a panel beside the map, not a sheet. */
function useTabletUp() {
  return useSyncExternalStore(
    (onChange) => {
      const list = typeof window.matchMedia === 'function' ? window.matchMedia(TABLET_UP) : null
      list?.addEventListener('change', onChange)
      return () => list?.removeEventListener('change', onChange)
    },
    () => (typeof window.matchMedia === 'function' ? window.matchMedia(TABLET_UP).matches : true),
    () => true,
  )
}

/** With reduced motion nothing slides, so there's no transition's end to wait for. */
function prefersReducedMotion() {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * The map-first center finder at /explore (markdowns/TESDA-TRACK-Location-First-Implementation-Plan.md). The map
 * covers the window at every size, as a maps app does, and stays on the Philippines; everything else floats over it:
 * the search bar and the chips at the top, the results beside it (a sheet rising from the bottom edge on a phone),
 * and the brief along the bottom.
 *
 * Find my pathway and Training & Assessment in one page: the learner types what they can do, sees the
 * qualifications that fit (the finder's own matching), and for each the nearest assessment and training centers on
 * a map, with an estimated travel time. A qualification opens the finder's readiness check and pathway. It uses the
 * existing matching and registry APIs, plus imported labor-market evidence for jobs and qualifications by area.
 *
 * With a qualification in focus (the first match, or one chosen in the demand panel) the page shows its supply and
 * demand: a brief under the map with the analysis of the learner's area and the centers recommended from where they
 * are, starred on the map; and, in the demand view, the regions shaded by its posting records with their balance
 * marks and its training and assessment centers pinned over them.
 */
export default function ExplorePage() {
  const en = useCopy()
  const copy = en.explore
  const [params, setParams] = useSearchParams()
  const typed = params.get('type') as View | null
  const view: View = typed && VIEWS.includes(typed) ? typed : 'all'
  const explore = useExplore(view === 'demand')
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
  // The qualification whose card a center was opened from: its readiness check is the one the center card offers.
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  // Which way the panel last moved: a center slides in from the right, and the list comes back from the left.
  const [motion, setMotion] = useState<'forward' | 'back' | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const listScroll = useRef(0)
  const [focus, setFocus] = useState(0)
  // The panel opens folded down to its search row, so the map has the room; pressing in the box (or typing) opens
  // the rest, and Show less folds it again. With results to show (a search kept from earlier in the visit, or one
  // linked from a qualification's page), it starts open.
  const [collapsed, setCollapsed] = useState(
    () => view !== 'demand' && !linked && !useExploreStore.getState().search,
  )
  // The body scrolls only once it has finished opening: during the slide, a scrollbar would flash.
  const [opened, setOpened] = useState(!collapsed)
  const scrollable = !collapsed && (opened || prefersReducedMotion())
  const bodyId = useId()
  const input = useRef<HTMLInputElement>(null)
  // Arriving from the home page's Find my path, the search box takes focus, ready to type in.
  const focusSearch = Boolean(
    (useLocation().state as { focusSearch?: boolean } | null)?.focusSearch,
  )
  useEffect(() => {
    if (focusSearch) input.current?.focus()
  }, [focusSearch])
  const fold = () => {
    setCollapsed(true)
    setOpened(false)
    // Show less goes inert with the panel's body, so focus goes back to the box it opened from.
    input.current?.focus()
  }
  // The search bar's burger opens the app's sidebar over the map: this page has no top bar for it.
  const menuOpen = useSidebarStore((state) => state.open)
  const menuButton = useRef<HTMLButtonElement>(null)
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
  // How far the brief and, on a phone, the results sheet reach up over the map: its buttons, legend and credits
  // ride above them, and its camera keeps the country clear of them.
  const [briefRef, briefHeight] = useHeight()
  const [sheetRef, sheetHeight] = useHeight()
  const tabletUp = useTabletUp()
  // The brief sits 12px off the bottom edge. A phone's open results sheet covers it and reaches up in its place.
  const bottomReach = tabletUp || collapsed ? (briefHeight ? briefHeight + 12 : 0) : sheetHeight
  // The app's floating Help button rides above whichever it is (GuidedHelp reads --help-lift).
  useEffect(() => {
    document.documentElement.style.setProperty('--help-lift', `${bottomReach}px`)
    return () => {
      document.documentElement.style.removeProperty('--help-lift')
    }
  }, [bottomReach])

  const { centers, search, matches, reference, location, config } = explore
  const focusCode = explore.demandCode
  const codes = new Set(matches.map((match) => match.qualification.code))
  // With a search, the pins are the centers listing a matched qualification; without one, every center.
  const listed = search
    ? centers.filter((center) =>
        [...center.programs, ...center.schedules].some((listing) =>
          codes.has(listing.qualification.code),
        ),
      )
    : centers
  // The demand view pins where the qualification in focus is offered, over the regions where it is in demand;
  // without one it shades all recorded jobs, and has no centers to show.
  const pins =
    view === 'demand'
      ? explore.supply
      : view === 'training' || view === 'assessment'
        ? listed.filter((center) => center.kind === view)
        : listed
  const outlookAreas = explore.outlook.data?.areas
  const jobAreas = explore.demandMap.data?.areas
  const demandAreas = useMemo((): DemandMapArea[] | undefined => {
    if (view !== 'demand') return undefined
    if (!focusCode) return jobAreas ?? []
    return (outlookAreas ?? []).flatMap((area) => {
      const sites = area.training_sites + area.assessment_sites
      if (!area.posting_count && !sites) return []
      const { region_code, name, latitude, longitude, posting_count, titles, balance } = area
      return [
        { region_code, name, latitude, longitude, posting_count, titles, balance, centers: sites },
      ]
    })
  }, [view, focusCode, outlookAreas, jobAreas])
  const demandDates = focusCode
    ? explore.outlook.data?.snapshot_dates
    : explore.demandMap.data?.snapshot_dates
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

  const select = (
    id: string,
    { onMap = false, code = null }: { onMap?: boolean; code?: string | null } = {},
  ) => {
    // Leaving the list, keep its place to come back to.
    if (!selectedId) listScroll.current = scroller.current?.scrollTop ?? 0
    setSelectedId(id)
    setSelectedCode(code)
    setMotion('forward')
    // A center picked on the map opens its card, so a folded panel opens with it.
    setCollapsed(false)
    if (onMap) setFocus((n) => n + 1)
  }
  const back = () => {
    setSelectedId(null)
    setMotion('back')
  }
  // A center's card starts at its top; the list comes back where the learner left it.
  useLayoutEffect(() => {
    const body = scroller.current
    if (!body) return
    if (selectedId) body.scrollTop = 0
    else if (motion === 'back') body.scrollTop = listScroll.current
  }, [selectedId, motion])

  return (
    // The window, edge to edge. Its own stacking context: what floats here is lifted over the map, not over the
    // page's dialogs.
    <div className="relative isolate h-dvh w-full overflow-hidden bg-map-water">
      <PageHeading className="sr-only">{en.pages.explore.heading}</PageHeading>

      <div
        className={cx(
          'absolute inset-0 [--center-map-height:100%]',
          // The map is the page here, not a card on it: no rounded corners, no border, no cap on a phone's height.
          '[&_.center-map]:h-full! [&_.center-map]:rounded-none [&_.center-map]:border-0',
          // On a phone the search bar and the chips run across the top (12 + 46 + 8 + 40px): the map's buttons and
          // status line start under them. From a tablet up they sit left of the buttons, so only the status moves.
          '[--map-overlay-top:106px] [--map-status-top:120px] md:[--map-overlay-top:0px] md:[--map-status-top:70px]',
          // The Help button floats in the window's bottom right corner: a button of the map's there sits above it.
          '[--map-corner-clear:52px]',
        )}
        // Along the bottom: the brief, or on a phone the open results sheet.
        // And from the left, the open panel: 12px + 360px + 16px. Pins and the camera keep clear of all three.
        style={
          {
            '--map-overlay-bottom': `${bottomReach}px`,
            '--map-overlay-inset': tabletUp && !collapsed ? '388px' : '0px',
          } as CSSProperties
        }
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
              demandAreas={demandAreas}
              demandRegion={explore.demandRegion}
              demandOverview={explore.relocate}
              demandSnapshotDates={demandDates}
              onDemandArea={(code) => useDemandStore.getState().setRegion(code)}
              recommended={explore.recommendedIds}
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
              // The location row in the panel says it, under its switch.
              locatingNotice={false}
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

      {/* Along the bottom, beside the open panel: the qualification in focus, analysed for the learner's area. On a
          phone the results sheet takes its place while it's open. */}
      <OutlookBrief
        ref={briefRef}
        explore={explore}
        view={view}
        onView={(next) => {
          setView(next)
          setSelectedId(null)
        }}
        onSelect={(id, code) => select(id, { onMap: true, code })}
        className={cx(
          'absolute right-3 bottom-3 left-3',
          !collapsed && 'max-md:hidden md:left-[388px]',
        )}
      />

      <Chips
        view={view}
        onView={(next) => {
          setView(next)
          setSelectedId(null)
          setCollapsed(false)
        }}
      />

      <section
        aria-label={copy.search.label}
        className={cx(
          // On a phone, a frame over the whole map that takes no presses itself: the search bar at its top, and the
          // results in a sheet at its bottom.
          'pointer-events-none absolute top-0 right-0 bottom-0 left-0 z-[1000] flex flex-col',
          // From a tablet up, one card at the top left. Folded, a slim search bar; open, the search row with the
          // results under it. Only the body below the row scrolls.
          'md:pointer-events-auto md:top-3 md:right-auto md:bottom-auto md:left-3 md:max-h-[calc(100%-1.5rem)] md:w-[360px] md:overflow-hidden md:rounded-12 md:border md:border-border md:bg-surface md:shadow-[0_4px_16px_rgb(var(--track-shadow-rgb)/0.14)] md:has-[[data-query]:focus]:border-blue',
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
          onMenu={() => useSidebarStore.getState().openMenu(menuButton.current)}
          onOpen={() => setCollapsed(false)}
          onSearched={() => {
            setSelectedId(null)
            setMotion(null)
            setView('all')
            setCollapsed(false)
          }}
        />
        {/* The body slides open and shut: its one row grows from 0fr to 1fr, so it animates to its own height. On a
            phone it is the sheet at the bottom of the screen. */}
        <div
          id={bodyId}
          ref={sheetRef}
          inert={collapsed}
          onTransitionEnd={(event) => {
            if (event.target === event.currentTarget && !collapsed) setOpened(true)
          }}
          className={cx(
            'pointer-events-auto mt-auto grid min-h-0 transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none md:mt-0 md:flex-1',
            'max-md:rounded-t-16 max-md:bg-surface max-md:shadow-[0_-6px_20px_rgb(var(--track-shadow-rgb)/0.18)]',
            collapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100',
          )}
        >
          {/* No padding on the clipped row itself: it would stay showing when the row is 0 tall. A phone's sheet
              stops at about half the screen, so the map stays in sight above it. */}
          <div
            ref={scroller}
            className={cx(
              'min-h-0 overflow-hidden max-md:max-h-[52dvh]',
              scrollable && 'overflow-y-auto',
            )}
          >
            <div className="flex min-h-full flex-col gap-3 border-rule p-4 max-md:pt-2 md:border-t">
              <span
                aria-hidden="true"
                className="mx-auto h-1 w-9 flex-none rounded-full bg-dash md:hidden"
              />
              {!search && view !== 'demand' && (
                <p className="m-0 text-13 leading-[1.5] text-muted">{copy.search.hint}</p>
              )}
              {view !== 'demand' && <LocationRow explore={explore} />}
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
              {/* Keyed, so each move between the list and a center plays its slide again. */}
              <div
                key={selected ? `center-${selected.id}` : 'list'}
                className={cx(
                  selected && motion === 'forward' && 'motion-safe:animate-enter-forward',
                  !selected && motion === 'back' && 'motion-safe:animate-enter-back',
                )}
              >
                {selected ? (
                  <CenterCard
                    center={selected}
                    code={selectedCode}
                    codes={codes}
                    canRoute={canRoute}
                    routeFrom={canRoute ? location : null}
                    config={config}
                    onBack={back}
                    onRoute={() => store().showRoute(selected.id)}
                  />
                ) : search ? (
                  <ResultsPanel
                    explore={explore}
                    view={view}
                    onView={setView}
                    onSelect={(id, code) => select(id, { onMap: true, code })}
                  />
                ) : (
                  <NearbyPanel
                    explore={explore}
                    view={view}
                    onSelect={(id) => select(id, { onMap: true })}
                  />
                )}
              </div>
              <Button
                aria-controls={bodyId}
                aria-expanded={!collapsed}
                onPress={fold}
                className={cx(
                  button({ variant: 'tertiary', height: 38, text: 14 }),
                  'mx-auto mt-auto',
                )}
              >
                <Icon name="chevron" className="rotate-180" />
                {copy.panel.collapse}
              </Button>
              {/* The page has no footer under the map, so its two lines are here. */}
              <p className="m-0 text-center text-12 leading-[1.5] text-muted">
                {en.footer.copyright}{' '}
                <NavLink to={paths.privacy} className="font-semibold text-blue underline-offset-4">
                  {en.privacy.link}
                </NavLink>
              </p>
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
    <form
      onSubmit={(event) => void run(event)}
      className={cx(
        'pointer-events-auto flex flex-none flex-col',
        // On a phone the bar is a card of its own across the top; from a tablet up it is the panel's first row.
        'max-md:mx-3 max-md:mt-3 max-md:rounded-12 max-md:border max-md:border-border max-md:bg-surface max-md:shadow-[0_4px_16px_rgb(var(--track-shadow-rgb)/0.14)] max-md:has-[[data-query]:focus]:border-blue',
      )}
    >
      {/* One slim bar: the burger, the box, and a search button at its end. */}
      <div className="flex h-11 items-center gap-0.5 px-1">
        <Button
          ref={menuRef}
          data-tour="mobile-menu"
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
      // Under the search bar on a phone, where the row scrolls sideways; beside the panel from a tablet up, clear of
      // the map's buttons on the right. The padding is room for the shadows and the hover lift: overflow clips them
      // at the row's edges otherwise. The row itself takes no presses, so the map between the chips still moves.
      className="pointer-events-none absolute top-[66px] right-0 left-3 z-[1000] -m-2 flex gap-2 overflow-x-auto p-2 md:top-3 md:right-[70px] md:left-[384px] md:flex-wrap md:gap-3 md:overflow-visible"
    >
      {chips.map((chip) => (
        <ToggleButton
          key={chip.view}
          isSelected={view === chip.view}
          onChange={(on) => onView(on ? chip.view : 'all')}
          className={cx(
            'pointer-events-auto inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full border px-4 text-14 font-semibold whitespace-nowrap md:h-[46px]',
            'shadow-[0_1px_2px_rgb(var(--track-shadow-rgb)/0.08),0_6px_16px_-4px_rgb(var(--track-shadow-rgb)/0.24)]',
            'transition-[transform,box-shadow,background-color,border-color] duration-200 ease-out',
            'data-hovered:shadow-[0_2px_4px_rgb(var(--track-shadow-rgb)/0.10),0_12px_24px_-6px_rgb(var(--track-shadow-rgb)/0.32)] motion-safe:data-hovered:-translate-y-0.5 motion-safe:data-hovered:scale-105 motion-safe:data-pressed:scale-100',
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
