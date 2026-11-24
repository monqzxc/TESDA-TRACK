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
  type ReactNode,
  type RefObject,
} from 'react'
import { Button, Input, Label, SearchField, ToggleButton } from 'react-aria-components'
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useQualifications } from '../../api/queries.ts'
import { failureMessage } from '../../auth/fields.tsx'
import { Icon } from '../../components/Icon.tsx'
import { LoadBoundary } from '../../components/LoadBoundary.tsx'
import { useSidebarStore } from '../../components/sidebarState.ts'
import { MapAccount } from '../account/MapAccount.tsx'
import { PageHeading } from '../../components/PageHeading.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'
import { button } from '../../styles/buttons.ts'
import { GOAL_MAX_LENGTH } from '../finder/key.ts'
import { matchPathway } from '../training/recommendationApi.ts'
import { useSavedCenters } from '../training/savedCenters.ts'
import { useLocationWatch, useTrainingStore } from '../training/state.ts'
import type { DemandMapArea } from '../training/CenterMapTypes.ts'
import { AroundYouCard, useAroundYouOpen } from './AroundYouCard.tsx'
import { planAroundYou, shortRegion } from './aroundYou.ts'
import type { ElsewhereProvince } from './demandApi.ts'
import { NEAR_KM, nearestRegion, offers } from './explore.ts'
import { LocationPrompt } from './LocationPrompt.tsx'
import { OutlookBrief } from './OutlookBrief.tsx'
import {
  CenterCard,
  CenterFilters,
  LocationRow,
  NearbyPanel,
  ResultsPanel,
  TspProfilePanel,
} from './Panels.tsx'
import { useDemandStore, useExplore, useExploreStore } from './useExplore.ts'

// The map comes down with its renderer the first time it's shown, as on Training & Assessment.
const CenterMap = lazy(() => import('../training/CenterMap.tsx'))

/** What the panel and the map show: everything, one kind of center, or where the skills are in demand. */
export type View = 'all' | 'assessment' | 'training' | 'demand'
const VIEWS: readonly View[] = ['all', 'assessment', 'training', 'demand']

const mapStandIn = 'm-0 grid h-full place-items-center bg-map-water text-15 text-muted'

// The search bar's own buttons: the burger, clear and search.
const iconButton =
  'grid size-11 flex-none cursor-pointer place-items-center rounded-8 border-0 bg-transparent text-muted data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus data-hovered:bg-soft data-hovered:text-navy data-pressed:bg-chip'

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

// The same width as the md: classes (--breakpoint-md in app.css), so what this decides (where the account button
// goes, how far the bars reach over the map) matches the layout the CSS draws, at exactly 768px too.
const TABLET_UP = '(min-width: 769px)'
/** The account button over the map (42px, as the map's own buttons) and the 14px gap under it. */
const ACCOUNT_ROOM = 56
/** How far the floating "Around you" card stays above the window's bottom: clear of Help and Layers. */
const AROUND_BOTTOM_CLEAR = 52 + 28 + 44 + 12
const SHEET_DISMISS_DISTANCE = 48
const SHEET_TAP_TOLERANCE = 10

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
  // While sharing is on, the "you are here" pin follows the learner; leaving the page stops the browser reporting it.
  useLocationWatch()
  const en = useCopy()
  const copy = en.explore
  const [params, setParams] = useSearchParams()
  const typed = params.get('type') as View | null
  const view: View = typed && VIEWS.includes(typed) ? typed : 'all'
  // Region and province filters (QA: US-0014 AC3), in the address like the type.
  const regionFilter = params.get('region')
  const provinceFilter = params.get('province')
  // Scholarships only (?scholarship=1), as on Training & Assessment.
  const scholarshipFilter = params.get('scholarship') === '1'
  const explore = useExplore(view === 'demand', {
    region: regionFilter,
    province: provinceFilter,
    scholarship: scholarshipFilter,
  })
  const setFilter = (name: 'region' | 'province' | 'scholarship', value: string | null) =>
    setParams(
      (current) => {
        const updated = new URLSearchParams(current)
        if (value) updated.set(name, value)
        else updated.delete(name)
        // Another region's provinces don't apply.
        if (name === 'region') updated.delete('province')
        return updated
      },
      { replace: true, preventScrollReset: true },
    )
  /** Every filter at once: type, region, province, scholarships, typed place and range. Shared location and the search stay. */
  const clearFilters = () => {
    setParams(
      (current) => {
        const updated = new URLSearchParams(current)
        for (const name of ['type', 'region', 'province', 'scholarship']) updated.delete(name)
        return updated
      },
      { replace: true, preventScrollReset: true },
    )
    useTrainingStore.getState().setPlaceText('')
    useExploreStore.setState({ rangeKm: NEAR_KM, rangeChosen: false })
  }
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
      // From Find my pathway (?range=ask): the chosen qualification continues to "How far can you go?".
      if (params.get('range') === 'ask') useExploreStore.getState().changeRange()
    }
    setParams(
      (current) => {
        const updated = new URLSearchParams(current)
        updated.delete('qualification')
        updated.delete('range')
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
  const sheetDrag = useRef<{ id: number; x: number; y: number } | null>(null)
  const scrollable = !collapsed && (opened || prefersReducedMotion())
  const bodyId = useId()
  const input = useRef<HTMLInputElement>(null)
  // Arriving from the home page's Find my path, the search box takes focus, ready to type in.
  const arrival = useLocation().state as { focusSearch?: boolean; runSearch?: boolean } | null
  const focusSearch = Boolean(arrival?.focusSearch)
  // Arriving from the home page's goal box, the goal already in the box is searched straight away.
  const runSearch = Boolean(arrival?.runSearch)
  useEffect(() => {
    if (focusSearch) input.current?.focus()
  }, [focusSearch])
  const fold = (restoreFocus = true) => {
    setCollapsed(true)
    setOpened(false)
    // Show less goes inert with the panel's body, so focus goes back to the box it opened from.
    if (restoreFocus) input.current?.focus()
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
  // The range the learner picked is drawn on the map and framed; until then the map frames the nearest centers.
  const pickedRange = useExploreStore((state) => (state.rangeChosen ? state.rangeKm : null))
  const routeTo = useTrainingStore((state) => state.routeTo)
  const locatingAny = useTrainingStore((state) => state.locating)
  const store = useTrainingStore.getState
  // How far the brief and, on a phone, the results sheet reach up over the map: its buttons, legend and credits
  // ride above them, and its camera keeps the country clear of them.
  const [briefRef, briefHeight] = useHeight()
  const [sheetRef, sheetHeight] = useHeight()
  const [headerRef, headerHeight] = useHeight()
  const tabletUp = useTabletUp()
  const topReach = tabletUp ? 0 : headerHeight || 118
  // The brief sits 12px off the bottom edge. A phone's open results sheet covers it and reaches up in its place.
  const bottomReach = tabletUp || collapsed ? (briefHeight ? briefHeight + 12 : 0) : sheetHeight
  // The app's floating Help button rides above whichever it is (GuidedHelp reads --help-lift).
  useEffect(() => {
    document.documentElement.style.setProperty('--help-lift', `${bottomReach}px`)
    return () => {
      document.documentElement.style.removeProperty('--help-lift')
    }
  }, [bottomReach])

  const { centers, search, matches, reference, config } = explore
  const focusCode = explore.demandCode
  // A center saved from the map remembers the qualification it was opened for, else the one in focus.
  const { saved, toggleSaved } = useSavedCenters(selectedCode ?? focusCode)
  const codes = new Set(matches.map((match) => match.qualification.code))
  // With a search, the pins are the centers listing a matched qualification; without one, every center. "Listing"
  // is the results panel's own test (offers), so a center accredited to assess a qualification without a dated
  // schedule is pinned as well as listed.
  const listed = search
    ? centers.filter((center) => [...codes].some((code) => offers(center, code)))
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

  // Directions start where distances do: the learner's location, or the place they typed (or its pin).
  const origin = reference ? { latitude: reference.latitude, longitude: reference.longitude } : null
  const canRoute = Boolean(config?.routing_enabled && origin)
  const route =
    canRoute &&
    origin &&
    selected &&
    routeTo === selected.id &&
    selected.latitude !== null &&
    selected.longitude !== null
      ? {
          from: origin,
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
  // A province picked in the "Around you" card: the demand view goes to its point, with its region selected.
  const [demandFocus, setDemandFocus] = useState<{
    latitude: number
    longitude: number
    regionCode: string
  } | null>(null)
  const changeView = (next: View) => {
    if (next !== 'demand') setDemandFocus(null)
    setView(next)
    setSelectedId(null)
    setCollapsed(false)
  }
  // A center's card starts at its top; the list comes back where the learner left it.
  useLayoutEffect(() => {
    const body = scroller.current
    if (!body) return
    if (selectedId) body.scrollTop = 0
    else if (motion === 'back') body.scrollTop = listScroll.current
  }, [selectedId, motion])

  // The "Around you" card (section 3 of markdowns/explore-map-first-visit-updates.md): over the map's top right from
  // a tablet up, and at the top of the results sheet on a phone. Not in the demand view, whose panel says the same.
  const { liveRegion, liveProvince, learnerId } = explore
  const homeProvince = explore.passport?.province ?? null
  const searchCodes = useMemo(() => matches.map((match) => match.qualification.code), [matches])
  const aroundPlan = useMemo(
    () =>
      view === 'demand'
        ? null
        : planAroundYou({
            learnerId,
            live: liveRegion
              ? {
                  regionCode: liveRegion.code,
                  regionName: shortRegion(liveRegion),
                  province: liveProvince,
                }
              : null,
            homeProvince,
            searchCodes,
          }),
    [view, learnerId, liveRegion, liveProvince, homeProvince, searchCodes],
  )
  const [aroundOpen, setAroundOpen] = useAroundYouOpen(tabletUp)
  const aroundFloats = Boolean(aroundPlan && tabletUp)
  // Below the chips, and below the map's status line while it shows.
  const [chipsRef, chipsHeight] = useHeight()
  const [statusReach, setStatusReach] = useState(0)
  const aroundTop = Math.max(12 + (chipsHeight || 46), statusReach) + 12
  const showProvince = (province: ElsewhereProvince) => {
    setDemandFocus({
      latitude: province.latitude,
      longitude: province.longitude,
      regionCode: province.region_code,
    })
    useDemandStore.getState().setRegion(province.region_code)
    changeView('demand')
  }
  // A qualification picked in the card is searched as one chosen from the library is.
  const chooseQualification = (code: string, name: string) => {
    const found = catalog.data?.find((item) => item.code === code)
    const { setDraft, setSearch } = useExploreStore.getState()
    setDraft(found?.name ?? name)
    setSearch({
      query: en.library.exploreGoal(found?.name ?? name),
      chosen: true,
      result: {
        profile: { intent: 'training_recommendation' },
        matches: [
          {
            qualification: {
              code,
              name: found?.name ?? name,
              sector: found?.sector ?? '',
              provenance: found?.provenance,
            },
            score: 100,
            reason: copy.results.chosen,
          },
        ],
      },
    })
    setSelectedId(null)
    setMotion(null)
    setView('all')
    setCollapsed(false)
  }
  // A center chosen in the card's details: its qualification searched, so the list beside the map matches, and the
  // center open on the map.
  const openCenter = (id: string, code: string) => {
    chooseQualification(code, catalog.data?.find((item) => item.code === code)?.name ?? code)
    select(id, { onMap: true, code })
  }
  const aroundCard = (variant: 'float' | 'sheet') =>
    aroundPlan && (
      <AroundYouCard
        plan={aroundPlan}
        catalog={catalog.data ?? []}
        open={aroundOpen}
        onOpenChange={setAroundOpen}
        variant={variant}
        onProvince={showProvince}
        onQualification={chooseQualification}
        centers={explore.allCenters}
        onCenter={openCenter}
        className={variant === 'float' ? 'absolute right-[70px] z-[950]' : undefined}
        style={variant === 'float' ? { top: aroundTop } : undefined}
        // Opened lists make it tall: it scrolls inside, ending above the map's Layers button (the bottom-right
        // column: the Help button's 52px, 28px, then Layers' 44px) with a 12px gap.
        bodyStyle={
          variant === 'float'
            ? {
                maxHeight: `calc(100dvh - ${aroundTop + 44 + bottomReach + AROUND_BOTTOM_CLEAR}px)`,
              }
            : undefined
        }
      />
    )

  return (
    // The window, edge to edge. Its own stacking context: what floats here is lifted over the map, not over the
    // page's dialogs.
    <div className="relative isolate h-dvh w-full overflow-hidden bg-map-water">
      <PageHeading className="sr-only">{en.pages.explore.heading}</PageHeading>
      {/* A learner whose TSP profile gives a home area isn't asked: it is the search location (US-0004). */}
      <LocationPrompt
        waiting={explore.passportStatus === 'loading'}
        skip={explore.homeArea !== null}
      />

      <div
        className={cx(
          'absolute inset-0 [--center-map-height:100%]',
          // The map is the page here, not a card on it: no rounded corners, no border, no cap on a phone's height.
          '[&_.center-map]:h-full! [&_.center-map]:rounded-none [&_.center-map]:border-0',
          // The Help button floats in the window's bottom right corner: a button of the map's there sits above it.
          '[--map-corner-clear:52px]',
        )}
        // Along the bottom: the brief, or on a phone the open results sheet.
        // And from the left, the open panel: 12px + 360px + 16px. Pins and the camera keep clear of all three.
        style={
          {
            '--map-overlay-bottom': `${bottomReach}px`,
            '--map-overlay-top': `${topReach}px`,
            '--map-status-top': `${tabletUp ? 70 : topReach + 12}px`,
            '--map-overlay-inset': tabletUp && !collapsed ? '388px' : '0px',
            // The open "Around you" card beside the map's buttons: 70px + its 300px.
            '--map-overlay-right': aroundFloats && aroundOpen ? '370px' : '0px',
            // From a tablet up the account button takes the top of the map's button column: the rest move down
            // under it. On a phone it sits in the search bar instead.
            '--map-controls-top': tabletUp ? `${ACCOUNT_ROOM}px` : '0px',
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
              centersUnavailable={explore.failed}
              demandAreas={demandAreas}
              demandRegion={explore.demandRegion}
              demandOverview={explore.relocate}
              demandSnapshotDates={demandDates}
              onDemandArea={(code) => useDemandStore.getState().setRegion(code)}
              recommended={explore.recommendedIds}
              selectedId={selectedId}
              hideCenterPopups={!tabletUp}
              focus={focus}
              reference={reference}
              onMoveReference={
                reference && !reference.mine
                  ? (point) => store().movePlace({ ...point, label: reference.label })
                  : undefined
              }
              radiusKm={view === 'demand' ? null : pickedRange}
              route={route}
              travelMode={travelMode}
              onTravelMode={(mode) => store().setTravelMode(mode)}
              canRoute={canRoute}
              saved={saved}
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
              onToggleSaved={toggleSaved}
              onLocate={() => store().locate()}
              demandFocus={
                view === 'demand' && demandFocus?.regionCode === explore.demandRegion
                  ? demandFocus
                  : null
              }
              onStatusReach={setStatusReach}
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
        ref={chipsRef}
        view={view}
        onView={changeView}
        className="absolute top-3 right-[70px] left-[384px] z-[1000] hidden flex-wrap gap-3 md:flex"
      />

      {/* The learner's icon and account menu, or Sign in, at the top of the map's button column (the chips and
          the status banner stop 70px from the right, clear of it). On a phone it is in the search bar. */}
      {tabletUp && <MapAccount placement="map" className="absolute top-3.5 right-3.5 z-[1000]" />}

      {aroundFloats && aroundCard('float')}

      <section
        aria-label={copy.search.label}
        className={cx(
          // On a phone, a frame over the whole map that takes no presses itself: the search bar at its top, and the
          // results in a sheet at its bottom.
          'pointer-events-none absolute top-0 right-0 bottom-0 left-0 z-[1000] flex flex-col',
          // From a tablet up, one card at the top left. Folded, a slim search bar; open, the search row with the
          // results under it. Only the body below the row scrolls.
          'md:pointer-events-auto md:top-3 md:right-auto md:bottom-auto md:left-3 md:max-h-[calc(100%-1.5rem)] md:w-[360px] md:overflow-hidden md:rounded-12 md:border md:border-border md:bg-surface md:shadow-[0_8px_28px_-6px_rgb(var(--track-shadow-rgb)/0.22)]',
          // Open, it runs the map's height. The height grows and shrinks with the body below (a min-height, since a
          // height can't move to or from auto).
          'motion-reduce:transition-none md:transition-[min-height] md:duration-300 md:ease-out',
          collapsed ? 'md:min-h-0' : 'md:min-h-[calc(100%-1.5rem)]',
        )}
      >
        <div ref={headerRef} className="min-w-0 shrink-0">
          <SearchBox
            regionCode={nearestRegion(reference, explore.regions)?.code ?? null}
            inputRef={input}
            autoRun={runSearch}
            menuOpen={menuOpen}
            menuRef={menuButton}
            onMenu={() => useSidebarStore.getState().openMenu(menuButton.current)}
            account={!tabletUp && <MapAccount placement="bar" />}
            onOpen={() => setCollapsed(false)}
            onSearched={() => {
              setSelectedId(null)
              setMotion(null)
              setView('all')
              setCollapsed(false)
            }}
          />
          <Chips
            view={view}
            onView={changeView}
            className="mx-3 mt-2 grid grid-cols-3 gap-1.5 md:hidden"
          />
        </div>
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
            <div className="flex min-h-full flex-col gap-3 border-rule bg-page p-3 max-md:pt-2 md:border-t">
              <button
                type="button"
                aria-label={copy.panel.closeSheet}
                aria-controls={bodyId}
                aria-expanded={!collapsed}
                className="sticky top-0 z-10 -mx-3 -mt-2 -mb-2 grid h-11 flex-none cursor-grab touch-none place-items-center rounded-t-16 border-0 bg-page focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue active:cursor-grabbing md:hidden"
                onPointerDown={(event) => {
                  if (!event.isPrimary || event.button !== 0) return
                  sheetDrag.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
                  event.currentTarget.setPointerCapture(event.pointerId)
                }}
                onPointerUp={(event) => {
                  const start = sheetDrag.current
                  if (!start || start.id !== event.pointerId) return
                  sheetDrag.current = null
                  const dx = Math.abs(event.clientX - start.x)
                  const dy = event.clientY - start.y
                  const tap = dx <= SHEET_TAP_TOLERANCE && Math.abs(dy) <= SHEET_TAP_TOLERANCE
                  if (tap || (dy >= SHEET_DISMISS_DISTANCE && dy > dx)) {
                    fold(event.pointerType !== 'touch')
                  }
                }}
                onLostPointerCapture={() => {
                  sheetDrag.current = null
                }}
                onClick={(event) => {
                  if (event.detail === 0) fold()
                }}
              >
                <span aria-hidden="true" className="h-1 w-9 rounded-full bg-dash" />
              </button>
              {/* On a phone the card is the sheet's first section, out of the way while a center is open. */}
              {!tabletUp && !selected && aroundCard('sheet')}
              {!search && view !== 'demand' && !selected && (
                <p className="m-0 text-13 leading-[1.5] text-muted">{copy.search.hint}</p>
              )}
              {config?.center_data === 'sample' && (
                <p
                  role="note"
                  className="m-0 flex items-start gap-2 rounded-10 bg-warn-bg px-3 py-2 text-13 leading-[1.5] font-semibold text-warn-ink"
                >
                  <Icon name="info" className="mt-0.5 flex-none" />
                  {copy.sampleCenters}
                </p>
              )}
              {!selected && <TspProfilePanel explore={explore} />}
              {view !== 'demand' && (
                <div className={selected && !locationError ? 'max-md:hidden' : undefined}>
                  <LocationRow explore={explore} />
                </div>
              )}
              {view !== 'demand' && !selected && (
                <CenterFilters
                  regions={explore.regionOptions}
                  provinces={explore.provinceOptions}
                  region={regionFilter}
                  province={provinceFilter}
                  scholarship={scholarshipFilter}
                  count={pins.length}
                  canClear={Boolean(
                    view !== 'all' ||
                    regionFilter ||
                    provinceFilter ||
                    scholarshipFilter ||
                    explore.placeText.trim() ||
                    explore.rangeKm !== NEAR_KM,
                  )}
                  onRegion={(code) => setFilter('region', code)}
                  onProvince={(name) => setFilter('province', name)}
                  onScholarship={(on) => setFilter('scholarship', on ? '1' : null)}
                  onClear={clearFilters}
                />
              )}
              {explore.failed && (
                <div className="rounded-12 bg-warn-bg p-3 text-14 text-warn-ink">
                  <p role="alert" className="mt-0">
                    {en.training.loadFailed}
                  </p>
                  <Button
                    className={button({ variant: 'secondary', height: 36 })}
                    onPress={explore.retry}
                    isPending={explore.retrying}
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
                    routeFrom={canRoute ? origin : null}
                    config={config}
                    onBack={back}
                    onRoute={() => store().showRoute(selected.id)}
                  />
                ) : explore.centerResultsUnavailable && view !== 'demand' ? null : search ? (
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
                onPress={() => fold()}
                className={cx(
                  button({ variant: 'tertiary', height: 38, text: 14 }),
                  'mx-auto mt-auto',
                )}
              >
                <Icon name="chevron" className="rotate-180" />
                {copy.panel.collapse}
              </Button>
              {/* The page has no footer under the map, so its two lines are here; the sidebar links to the policy
                  too, in reach while this panel is folded. */}
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
  autoRun,
  menuOpen,
  menuRef,
  onMenu,
  account,
  onOpen,
  onSearched,
}: {
  regionCode: string | null
  inputRef: RefObject<HTMLInputElement | null>
  /** Search the draft once on arrival (the home page's goal box sent it). */
  autoRun: boolean
  /** The burger's drawer is open: the burger spins a half turn as it opens, and back as it closes. */
  menuOpen: boolean
  menuRef: RefObject<HTMLButtonElement | null>
  onMenu: () => void
  /** On a phone, the account button at the row's right end (MapAccount); from a tablet up it is over the map. */
  account?: ReactNode
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
  // An empty submit asks for a goal, as /find does; it is not a failure, so it offers no retry.
  const [missing, setMissing] = useState(false)
  const request = useRef<AbortController | null>(null)
  const missingId = useId()

  useEffect(() => () => request.current?.abort(), [])

  const search = async (text: string) => {
    if (request.current) return
    const query = text.trim()
    if (!query) return
    const controller = new AbortController()
    request.current = controller
    setPending(true)
    setError(null)
    try {
      const result = await matchPathway(query, regionCode, controller.signal)
      if (controller.signal.aborted) return
      setSearch({ query, result, feedbackScope: crypto.randomUUID() })
      onSearched()
    } catch (failure) {
      if (!controller.signal.aborted) setError(failureMessage(failure))
    } finally {
      if (request.current === controller) {
        request.current = null
        setPending(false)
      }
    }
  }

  const run = (event: FormEvent) => {
    event.preventDefault()
    if (!draft.trim()) {
      cancelSearch()
      setMissing(true)
      inputRef.current?.focus()
      return
    }
    setMissing(false)
    void search(draft)
  }

  // The arrival's request leaves the history entry once read, so a reload or Back doesn't search again.
  const navigate = useNavigate()
  const location = useLocation()
  useEffect(() => {
    if (!autoRun) return
    void navigate(
      { pathname: location.pathname, search: location.search, hash: location.hash },
      { replace: true, state: { focusSearch: true }, preventScrollReset: true },
    )
    // Scheduled rather than run inline, so a remount (StrictMode) cancels it instead of searching twice.
    const timer = setTimeout(() => void search(useExploreStore.getState().draft), 0)
    return () => clearTimeout(timer)
    // Runs once per arrival: the request is cleared from the location above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun])

  const cancelSearch = () => {
    request.current?.abort()
    request.current = null
    setPending(false)
    setError(null)
  }

  const clear = () => {
    cancelSearch()
    setMissing(false)
    setDraft('')
    setSearch(null)
  }

  return (
    <form
      onSubmit={run}
      className={cx(
        'pointer-events-auto flex flex-none flex-col',
        // On a phone the bar is a card of its own across the top; from a tablet up it is the panel's first row.
        'max-md:mx-3 max-md:mt-3 max-md:rounded-12 max-md:border max-md:border-border max-md:bg-surface max-md:shadow-[0_4px_16px_rgb(var(--track-shadow-rgb)/0.14)]',
      )}
    >
      {/* The burger, then one bordered field: its leading magnifier submits, the clear button sits at its end. */}
      <div className="flex min-h-11 items-center gap-1.5 px-1.5 py-1.5 md:px-3 md:py-3">
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
        {/* One bordered field. The submit button sits outside the SearchField, whose own buttons all clear it. */}
        <div className="flex h-11 min-w-0 flex-1 items-center gap-0.5 rounded-12 border border-border bg-page pr-1 pl-1 transition-[border-color,background-color,box-shadow] duration-150 has-[[data-invalid]]:border-warn-ink has-[[data-query]:focus]:border-blue has-[[data-query]:focus]:bg-surface has-[[data-query]:focus]:shadow-[0_0_0_3px_rgb(23_92_211/0.14)]">
          <Button
            type="submit"
            aria-label={copy.search.submit}
            isPending={pending}
            className="grid size-9 flex-none cursor-pointer place-items-center rounded-10 border-0 bg-transparent text-muted data-focus-visible:outline-3 data-focus-visible:outline-focus data-hovered:text-blue data-pending:cursor-progress"
          >
            {pending ? (
              <span
                aria-hidden="true"
                className="size-4 rounded-full border-2 border-blue border-t-transparent motion-safe:animate-spin"
              />
            ) : (
              <Icon name="search" size="1.1rem" />
            )}
          </Button>
          <SearchField
            value={draft}
            onChange={(text) => {
              cancelSearch()
              setMissing(false)
              setDraft(text)
              onOpen()
            }}
            onClear={clear}
            maxLength={GOAL_MAX_LENGTH}
            isInvalid={missing}
            className="flex h-full min-w-0 flex-1 items-center"
          >
            <Label className="sr-only">{copy.search.label}</Label>
            {/* The field's border shows focus, so the box draws no ring of its own. */}
            <Input
              ref={inputRef}
              data-query
              aria-describedby={missing ? missingId : undefined}
              onClick={onOpen}
              className="h-full w-full min-w-0 border-0 bg-transparent px-0.5 text-15 text-navy placeholder:text-muted placeholder:opacity-100 focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
              placeholder={copy.search.placeholder}
            />
            {draft && (
              <Button
                aria-label={copy.search.clear}
                className="grid size-8 flex-none cursor-pointer place-items-center rounded-full border-0 bg-transparent text-muted data-focus-visible:outline-3 data-focus-visible:outline-focus data-hovered:bg-chip data-hovered:text-navy"
                onPress={clear}
              >
                <Icon name="close" />
              </Button>
            )}
          </SearchField>
        </div>
        {account}
      </div>
      {pending ? (
        <p role="status" className="m-0 px-4 pb-2.5 text-13 text-muted">
          {copy.search.searching}
        </p>
      ) : missing ? (
        <p id={missingId} role="alert" className="m-0 px-4 pb-2.5 text-14 text-warn-ink">
          {en.finder.unified.empty}
        </p>
      ) : (
        error && (
          <div className="flex flex-wrap items-center gap-x-3 px-4 pb-2.5">
            <p role="alert" className="m-0 min-w-0 flex-1 text-14 text-warn-ink">
              {error}
            </p>
            <Button type="submit" className={button({ variant: 'tertiary', height: 44 })}>
              {en.unavailable.retry}
            </Button>
          </div>
        )
      )}
    </form>
  )
}

/** Training centers, Assessment centers, In demand jobs: each shows that kind; pressed again, everything. */
function Chips({
  ref,
  view,
  onView,
  className,
}: {
  ref?: (node: HTMLElement | null) => void
  view: View
  onView: (view: View) => void
  className: string
}) {
  const copy = useCopy().explore.chips
  const chips: { view: View; label: string; icon: 'learn' | 'award' | 'briefcase' }[] = [
    { view: 'training', label: copy.training, icon: 'learn' },
    { view: 'assessment', label: copy.assessment, icon: 'award' },
    { view: 'demand', label: copy.demand, icon: 'briefcase' },
  ]
  return (
    <div
      ref={ref}
      role="group"
      aria-label={copy.label}
      className={cx('pointer-events-none', className)}
    >
      {chips.map((chip) => (
        <ToggleButton
          key={chip.view}
          isSelected={view === chip.view}
          onChange={(on) => onView(on ? chip.view : 'all')}
          className={cx(
            'pointer-events-auto inline-flex min-h-11 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-12 border px-2 text-center text-13 leading-tight font-semibold wrap-anywhere md:h-[46px] md:shrink-0 md:px-4 md:text-14 md:whitespace-nowrap',
            '[&_svg]:shrink-0 max-md:[&_svg]:hidden',
            'shadow-[0_1px_2px_rgb(var(--track-shadow-rgb)/0.08),0_6px_16px_-4px_rgb(var(--track-shadow-rgb)/0.24)]',
            'transition-[transform,box-shadow,background-color,border-color] duration-200 ease-out',
            'data-hovered:shadow-[0_2px_4px_rgb(var(--track-shadow-rgb)/0.10),0_12px_24px_-6px_rgb(var(--track-shadow-rgb)/0.32)] motion-safe:data-pressed:scale-100 md:motion-safe:data-hovered:-translate-y-0.5 md:motion-safe:data-hovered:scale-105',
            'data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus',
            'border-border bg-surface text-navy data-hovered:border-hover-border',
            'data-selected:border-navy data-selected:bg-navy data-selected:text-surface',
          )}
        >
          <Icon name={chip.icon} />
          {chip.label}
        </ToggleButton>
      ))}
    </div>
  )
}
