import 'maplibre-gl/dist/maplibre-gl.css'
// After maplibre-gl.css, which it styles over.
import './center-map-maplibre.css'
import { useQuery } from '@tanstack/react-query'
import {
  AttributionControl,
  Map as MapLibreMap,
  Popup,
  setWorkerUrl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type MapMouseEvent,
} from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import {
  Button,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
  ToggleButton,
  type Selection,
} from 'react-aria-components'
import { Icon } from '../../components/Icon.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { readItem, writeItem } from '../../lib/storage.ts'
import { cx } from '../../lib/style.ts'
import { directionsQuery, type TravelMode } from './api.ts'
import type { Center, Point } from './centers.ts'
import { KIND_DOTS, MODE_ICONS } from './CenterDetail.tsx'
import { BASEMAP_KEY, LOCATE_ZOOM, type CenterMapProps } from './CenterMapTypes.ts'
import { CenterPopup } from './CenterPopup.tsx'
import { routeLabel } from './format.ts'
import type { GeoJSON } from 'geojson'
import type { MapSettings, VectorTiles } from './mapSettings.ts'
import {
  PHILIPPINES,
  REGION,
  frameResults,
  boundsOf,
  insidePadding,
  motion,
  overlayPadding,
  paddedOffset,
  type Frame,
} from './maplibre/camera.ts'
import type { MapSupport } from './maplibre/capabilities.ts'
import {
  EMPTY_OVERLAYS,
  LAYERS,
  MAX_ZOOM,
  ROUTE_LAYERS,
  SOURCES,
  centerPoints,
  radiusArea,
  referencePoint,
  withOverlays,
  type CenterProperties,
  type OverlayData,
} from './maplibre/layers.ts'
import { ROUTE_END, addMarkerImage, renderedTargets, type HitTarget } from './maplibre/markers.ts'
import { chosenMode, routeCorners, routeFeatures, routeLabels } from './maplibre/routing.ts'
import { partialPath, useRouteDraw } from './routeDraw.ts'
import {
  BASEMAP_SOURCE,
  BUILDING_3D,
  BUILDING_FLAT,
  OSM_CREDIT,
  basemapStyle,
  basemapsFor,
  hasVectorBuildings,
  providerUrls,
  type BasemapId,
  type Theme,
} from './maplibre/styles.ts'

// The center map drawn by MapLibre from vector tiles (docs/center-map.md): the same pins, clusters, popups, location,
// radius, routes and controls as the Leaflet map, with sharper labels, light and dark styles drawn from the app's
// colors, and 3D buildings where the tiles record their heights. CenterMap.tsx loads it only where it can run, in a
// chunk of its own, and falls back to Leaflet if it fails. The list beside it has everything (US-08).

// The worker is one of the app's own files, so the site's Content Security Policy needn't allow blob: workers.
setWorkerUrl(workerUrl)

export interface CenterMapLibreProps extends CenterMapProps {
  settings: MapSettings & { tiles: VectorTiles }
  support: MapSupport
  /** MapLibre can't go on: it couldn't start, or lost its drawing context for good. Leaflet takes over. */
  onFail: (reason: string) => void
}

/** 3D buildings were turned on in this browser (the plan's small preferences). */
const THREE_D_KEY = 'tesda-track.map-3d'
const PITCH_3D = 55
const BEARING_3D = -17
/** How long a lost drawing context may take to come back before the map gives way to Leaflet. */
const CONTEXT_RESTORE_MS = 8000
/** The vector base map failed during this visit: later maps open on OpenStreetMap's tiles rather than fail again. */
let vectorFailed = false

const NOWHERE: Point = { latitude: 0, longitude: 0 }
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'
const TOUCH = '(pointer: coarse)'

// The map's own controls float over it, as on the Leaflet map.
const floating = 'shadow-[0_4px_14px_rgb(var(--track-shadow-rgb)/0.12)]'
const controlButton = cx(
  'grid size-10.5 cursor-pointer place-items-center border-0 bg-surface text-navy data-hovered:bg-soft',
  floating,
)

type Status =
  'loading' | 'tilesFailed' | 'vectorFailed' | 'contextLost' | { message: string } | null
type CoverageNote = 'zoomIn' | 'noHeights' | 'noBuildings' | null
type PopupState =
  { type: 'center'; id: string } | { type: 'together'; lngLat: [number, number]; ids: string[] }

function subscribeToTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => observer.disconnect()
}

/** The theme on screen: ThemeProvider keeps it on <html>, which tokens.css reads too. */
function useDocumentTheme(): Theme {
  return useSyncExternalStore(
    subscribeToTheme,
    () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'),
    () => 'light',
  )
}

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = typeof window.matchMedia === 'function' ? window.matchMedia(query) : null
      list?.addEventListener('change', onChange)
      return () => list?.removeEventListener('change', onChange)
    },
    () => (typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false),
    () => false,
  )
}

const lngLatOf = (center: Center): [number, number] => [
  center.longitude as number,
  center.latitude as number,
]

function sameTargets(a: readonly HitTarget[], b: readonly HitTarget[]) {
  return (
    a.length === b.length &&
    a.every(
      (target, i) =>
        target.key === b[i].key &&
        target.selected === b[i].selected &&
        target.lngLat[0] === b[i].lngLat[0] &&
        target.lngLat[1] === b[i].lngLat[1],
    )
  )
}

export default function CenterMapLibre(props: CenterMapLibreProps) {
  const en = useCopy()
  const copy = en.training.map
  const {
    centers,
    selectedId,
    focus,
    reference,
    radiusKm,
    route,
    travelMode,
    onTravelMode,
    locating,
    settings,
    support,
  } = props

  const theme = useDocumentTheme()
  const reducedMotion = useMediaQuery(REDUCED_MOTION)
  const touch = useMediaQuery(TOUCH)
  const shell = useRef<HTMLDivElement>(null)
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  // Buttons over the pins and the routes' labels live inside the map's canvas container, so a drag that starts on one
  // still moves the map; the popup's content is rendered into a node of its own.
  const [overlayNode, setOverlayNode] = useState<HTMLElement | null>(null)
  const [popupNode] = useState(() => document.createElement('div'))
  const [ready, setReady] = useState(false)
  // Bumped by each press of Locate, so the map goes to the learner's location even when it hasn't changed.
  const [locateAsk, setLocateAsk] = useState(0)
  const answeredLocate = useRef(0)
  const [status, setStatus] = useState<Status>('loading')
  const [coverage, setCoverage] = useState<CoverageNote>(null)
  const [targets, setTargets] = useState<HitTarget[]>([])
  // How far the filter panel reaches over the map's left edge (0 when it doesn't): framing and popups keep clear.
  const [inset, setInset] = useState(0)

  const basemaps = useMemo(() => basemapsFor(settings.tiles), [settings.tiles])
  const [basemapId, setBasemapId] = useState<BasemapId>(() => {
    if (vectorFailed) return 'standard'
    const saved = readItem(BASEMAP_KEY)
    return basemaps.includes(saved as BasemapId) ? (saved as BasemapId) : 'map'
  })
  const [threeDWanted, setThreeDWanted] = useState(() => readItem(THREE_D_KEY) === 'on')
  // Whether the tiles have a building layer at all; unknown until their TileJSON has loaded.
  const [buildingsInTiles, setBuildingsInTiles] = useState<boolean | null>(null)
  const canThreeD =
    settings.buildings3d &&
    !support.lowEnd &&
    hasVectorBuildings(basemapId) &&
    buildingsInTiles !== false
  const threeD = threeDWanted && canThreeD
  const hillshade = !support.lowEnd && !support.saveData
  const logo = basemapId === 'standard' ? null : providerUrls(settings.tiles).logo

  // The overlays' data, each part worked out only when what it shows changes.
  const points = useMemo(
    () => centers.filter((center) => center.latitude !== null && center.longitude !== null),
    [centers],
  )
  const byId = useMemo(() => new Map(points.map((center) => [center.id, center])), [points])
  const radius = reference && radiusKm && radiusKm > 0 ? radiusKm : null
  const hasRoute = route !== null
  const [toLat, toLng, routeKind] = route
    ? [route.to.latitude, route.to.longitude, route.kind]
    : [null, null, null]
  const centersData = useMemo(
    () => centerPoints(points, new Set(selectedId ? [selectedId] : [])),
    [points, selectedId],
  )
  const selectedData = useMemo((): OverlayData['selected'] => {
    const features: OverlayData['selected']['features'] = []
    const add = (properties: CenterProperties, lng: number, lat: number) =>
      features.push({
        type: 'Feature',
        properties,
        geometry: { type: 'Point', coordinates: [lng, lat] },
      })
    const selected = selectedId ? byId.get(selectedId) : undefined
    if (selected) add({ id: selected.id, kind: selected.kind }, ...lngLatOf(selected))
    // The center's own pin can be folded into a cluster; this one always marks the route's end.
    if (toLat !== null && toLng !== null && routeKind) {
      const there = selected && selected.latitude === toLat && selected.longitude === toLng
      if (!there) add({ id: ROUTE_END, kind: routeKind }, toLng, toLat)
    }
    return { type: 'FeatureCollection', features }
  }, [selectedId, byId, toLat, toLng, routeKind])
  const referenceData = useMemo(
    () => referencePoint(reference),
    // The point and whether it's the learner's own; its label doesn't change what's drawn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reference?.latitude, reference?.longitude, reference?.mine],
  )
  const radiusData = useMemo(
    () => radiusArea(reference, radius),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reference?.latitude, reference?.longitude, radius],
  )
  const directions = useQuery({
    ...directionsQuery(route?.from ?? NOWHERE, route?.to ?? NOWHERE),
    enabled: hasRoute,
  })
  const options = useMemo(
    () => (hasRoute ? (directions.data?.routes ?? []) : []),
    [hasRoute, directions.data],
  )
  const chosen = chosenMode(options, travelMode)
  // The chosen route draws itself out to the center, once per route and mode; the others and the labels follow.
  const drawn = useRouteDraw(
    route && chosen
      ? `${route.from.latitude},${route.from.longitude}>${route.to.latitude},${route.to.longitude}:${chosen}`
      : null,
  )
  const routesData = useMemo(() => {
    if (!route || !options.length) return EMPTY_OVERLAYS.routes
    if (drawn >= 1) return routeFeatures(route, options, chosen)
    // While it draws: the chosen line only, up to where it has reached, with its dotted start from the learner.
    const drawing = options.filter((option) => option.mode === chosen)
    const partial = drawing.map((option) => ({ ...option, path: partialPath(option.path, drawn) }))
    const data = routeFeatures(route, partial, chosen)
    return { ...data, features: data.features.slice(0, 2) }
    // The route's ends are in its directions; the route object itself is new on every render of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, chosen, drawn])
  const labels = useMemo(() => (drawn >= 1 ? routeLabels(options) : []), [options, drawn])

  // The popup. The selected center shows in it, as on the Leaflet map, until it's closed; a pin or cluster opened on
  // the map shows instead, until the selection, View on map (`focus`) or the route changes.
  const stamp = `${selectedId ?? ''}|${focus}|${toLat ?? ''},${toLng ?? ''}`
  const [opened, setOpened] = useState<{ popup: PopupState; stamp: string } | null>(null)
  const [closedAt, setClosedAt] = useState<string | null>(null)
  const fromSelection: PopupState | null =
    selectedId && !hasRoute && closedAt !== stamp ? { type: 'center', id: selectedId } : null
  const wanted = opened?.stamp === stamp ? opened.popup : fromSelection
  const popup = wanted?.type === 'center' && !byId.has(wanted.id) ? null : wanted
  const popupKey = popup
    ? popup.type === 'center'
      ? `center:${popup.id}`
      : `together:${popup.lngLat.join(',')}`
    : null
  const raised = popup?.type === 'center' && popup.id === selectedId

  // What the map's event handlers need, current at each render without re-subscribing them.
  const latest = useRef({ props, byId, inset, reducedMotion, threeD, copy, stamp })
  useEffect(() => {
    latest.current = { props, byId, inset, reducedMotion, threeD, copy, stamp }
  })
  const overlays = useRef<OverlayData>(EMPTY_OVERLAYS)
  const styleInputs = useRef({ theme, basemapId, threeD, hillshade })
  const movedByUser = useRef(false)
  const pressedAt = useRef<{ x: number; y: number } | null>(null)
  const focusedKey = useRef<string | null>(null)
  const pendingFocus = useRef<[number, number] | null>(null)
  const anchored = useRef(new Map<string, { element: HTMLElement; lngLat: [number, number] }>())
  const popupRef = useRef<Popup | null>(null)
  /** The popup was opened from the keyboard: focus goes into it, and back to its pin when it closes. */
  const focusPopup = useRef(false)
  const returnFocusTo = useRef<string | null>(null)
  /** The center last picked on the map itself, already in view: selecting it doesn't move the camera. */
  const pickedOnMap = useRef<string | null>(null)
  const askedFocus = useRef(focus)

  /** Keeps the buttons over the pins and the route labels on their spots as the map moves. */
  const place = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    for (const { element, lngLat } of anchored.current.values()) {
      const { x, y } = map.project(lngLat)
      element.style.transform = `translate(${x}px, ${y}px)`
    }
  }, [])

  const anchor = (key: string, lngLat: [number, number]) => (element: HTMLElement | null) => {
    if (element) anchored.current.set(key, { element, lngLat })
    else anchored.current.delete(key)
  }

  const fullStyle = useCallback(() => {
    const { theme, basemapId, threeD, hillshade } = styleInputs.current
    return withOverlays(
      basemapStyle({ tiles: settings.tiles, basemap: basemapId, theme, threeD, hillshade }),
      overlays.current,
      theme,
    )
  }, [settings.tiles])

  const openPopup = useCallback((popup: PopupState, viaKeyboard: boolean, from: string) => {
    focusPopup.current = viaKeyboard
    returnFocusTo.current = viaKeyboard ? from : null
    setOpened({ popup, stamp: latest.current.stamp })
  }, [])

  const closePopup = useCallback(() => {
    setOpened(null)
    setClosedAt(latest.current.stamp)
  }, [])

  /** After a popup opened from the keyboard closes, focus goes back to its pin, or to the map. */
  const restoreFocus = useCallback(() => {
    const key = returnFocusTo.current
    returnFocusTo.current = null
    if (key) (anchored.current.get(key)?.element ?? mapRef.current?.getCanvas())?.focus()
  }, [])

  const openCenter = useCallback(
    (id: string, viaKeyboard: boolean) => {
      pickedOnMap.current = id
      latest.current.props.onPick(id)
      openPopup({ type: 'center', id }, viaKeyboard, `pin:${id}`)
    },
    [openPopup],
  )

  /** Moves the map just enough that the open popup shows whole, clear of the panel and the controls. */
  const keepPopupInView = useCallback(() => {
    const map = mapRef.current
    const popup = popupRef.current?.getElement()
    if (!map || !popup) return
    const element = map.getContainer()
    const { inset, reducedMotion } = latest.current
    const padding = overlayPadding(
      { width: element.clientWidth, height: element.clientHeight },
      inset,
      16,
    )
    // Too wide to fit between the panel and the buttons: it may cover the buttons instead (it's drawn above them).
    if (popup.offsetWidth > element.clientWidth - padding.left - padding.right) padding.right = 8
    keepInView(map, popup, padding, motion(reducedMotion, 400))
  }, [])

  /** A cluster opens to the zoom where its centers part; centers at the same spot open as a list instead. */
  const openCluster = useCallback(
    async (clusterId: number, lngLat: [number, number], viaKeyboard: boolean) => {
      const map = mapRef.current
      const source = map?.getSource<GeoJSONSource>(SOURCES.centers)
      if (!map || !source) return
      const zoom = await source.getClusterExpansionZoom(clusterId)
      if (zoom <= MAX_ZOOM) {
        movedByUser.current = true
        pendingFocus.current = viaKeyboard ? lngLat : null
        map.easeTo({ center: lngLat, zoom, ...motion(latest.current.reducedMotion, 500) })
        return
      }
      const leaves = await source.getClusterLeaves(clusterId, 50, 0)
      const ids = leaves.flatMap((leaf) =>
        typeof leaf.properties?.id === 'string' ? [leaf.properties.id] : [],
      )
      openPopup({ type: 'together', lngLat, ids }, viaKeyboard, `cluster:${clusterId}`)
    },
    [openPopup],
  )

  // The map itself, made once. Later changes reach it through its own methods, never by making it again.
  useEffect(() => {
    const element = container.current
    if (!element) return
    const { copy } = latest.current
    const size = { width: element.clientWidth, height: element.clientHeight }
    let map: MapLibreMap
    try {
      map = new MapLibreMap({
        container: element,
        style: fullStyle(),
        bounds: PHILIPPINES,
        fitBoundsOptions: { padding: overlayPadding(size, 0, 0) },
        maxBounds: REGION,
        minZoom: 4,
        maxZoom: MAX_ZOOM,
        maxPitch: 60,
        renderWorldCopies: false,
        // The page scrolls past the map: the wheel zooms only once the map is clicked into or focused.
        scrollZoom: false,
        dragRotate: false,
        touchPitch: false,
        pitchWithRotate: true,
        attributionControl: false,
        // Phones and slower devices draw fewer pixels: sharp enough, and far lighter on the GPU.
        pixelRatio: Math.min(window.devicePixelRatio || 1, support.lowEnd ? 1.5 : 2),
        fadeDuration: latest.current.reducedMotion ? 0 : 300,
        reduceMotion: latest.current.reducedMotion || undefined,
        canvasContextAttributes: { antialias: !support.lowEnd },
        validateStyle: import.meta.env.DEV,
        locale: {
          'Map.Title': copy.canvas,
          'Popup.Close': copy.close,
          'AttributionControl.ToggleAttribution': copy.credits,
          'CooperativeGesturesHandler.WindowsHelpText': copy.gestures.windows,
          'CooperativeGesturesHandler.MacHelpText': copy.gestures.mac,
          'CooperativeGesturesHandler.MobileHelpText': copy.gestures.touch,
        },
      })
    } catch {
      // No WebGL 2 context after all, or the GPU refused one.
      latest.current.props.onFail('init')
      return
    }
    mapRef.current = map
    if (import.meta.env.DEV) window.__trackCenterMap = map
    map.setMissingStyleImageResolver((id) => addMarkerImage(map, id))
    map.addControl(
      new AttributionControl(
        settings.tiles.provider === 'custom' ? { customAttribution: OSM_CREDIT } : {},
      ),
      'bottom-right',
    )
    const overlay = document.createElement('div')
    overlay.className = 'center-map-hit'
    map.getCanvasContainer().append(overlay)

    map.once('load', () => {
      setOverlayNode(overlay)
      setReady(true)
      setStatus((current) => (current === 'loading' ? null : current))
    })
    map.on('move', place)
    map.on('resize', place)
    // A move the learner made: the map won't reframe itself over it, unless the results change.
    for (const type of ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart'] as const) {
      map.on(type, (event: { originalEvent?: unknown }) => {
        if (event.originalEvent) movedByUser.current = true
      })
    }
    map.on('idle', () => {
      const next = renderedTargets(map, LAYERS)
      setTargets((current) => (sameTargets(current, next) ? current : next))
      if (latest.current.threeD) setCoverage(buildingCoverage(map))
    })
    map.on('sourcedata', (event) => {
      if (event.sourceId !== BASEMAP_SOURCE || event.sourceDataType !== 'metadata') return
      // OpenMapTiles tiles list their layers; without a building layer there's nothing to raise.
      const ids = (map.getSource(BASEMAP_SOURCE) as { vectorLayerIds?: string[] } | undefined)
        ?.vectorLayerIds
      setBuildingsInTiles(ids ? ids.includes('building') : null)
    })

    let restoring: ReturnType<typeof setTimeout> | undefined
    map.on('webglcontextlost', () => {
      setStatus('contextLost')
      restoring = setTimeout(() => latest.current.props.onFail('context-lost'), CONTEXT_RESTORE_MS)
    })
    map.on('webglcontextrestored', () => {
      clearTimeout(restoring)
      setStatus((current) => (current === 'contextLost' ? null : current))
    })
    map.on('error', (event) => {
      const { sourceId, tile } = event as { sourceId?: string; tile?: unknown }
      if (sourceId === BASEMAP_SOURCE && !tile && !vectorFailed) {
        // The vector tiles' TileJSON itself failed (a refused key, an outage): OpenStreetMap's tiles instead, once.
        vectorFailed = true
        setBasemapId('standard')
        setStatus('vectorFailed')
      } else if (sourceId && ['basemap', 'satellite', 'osm', 'terrain'].includes(sourceId)) {
        setStatus((current) =>
          current === null || current === 'loading' ? 'tilesFailed' : current,
        )
      }
    })

    // A click on the map, not on one of the buttons over it: pins beyond those with buttons, clusters, routes, or
    // the map itself, which closes the popup.
    map.on('click', (event: MapMouseEvent) => {
      if (overlay.contains(event.originalEvent.target as Node | null)) return
      const layers = [LAYERS.selected, LAYERS.pins, LAYERS.clusters].filter((id) =>
        map.getLayer(id),
      )
      const [hit] = layers.length ? map.queryRenderedFeatures(event.point, { layers }) : []
      const properties = hit?.properties as Record<string, unknown> | undefined
      if (hit?.geometry.type === 'Point' && properties) {
        const lngLat = hit.geometry.coordinates as [number, number]
        if (typeof properties.cluster_id === 'number') {
          void openCluster(properties.cluster_id, lngLat, false)
          return
        }
        if (typeof properties.id === 'string' && properties.id !== ROUTE_END) {
          openCenter(properties.id, false)
          return
        }
      }
      if (popupRef.current) closePopup()
    })
    for (const layer of LAYERS.routeLines) {
      map.on('click', layer, (event: MapLayerMouseEvent) => {
        // A route's label sits on the map, often over another route's line: its own button chose its mode.
        if (overlay.contains(event.originalEvent.target as Node | null)) return
        const mode = event.features?.[0]?.properties?.mode
        if (typeof mode === 'string') latest.current.props.onTravelMode(mode as TravelMode)
      })
    }
    // A pointer over what can be clicked.
    const pointer = (cursor: string) => () => {
      map.getCanvas().style.cursor = cursor
    }
    for (const layer of [LAYERS.pins, LAYERS.clusters, LAYERS.selected, ...LAYERS.routeLines]) {
      map.on('mouseenter', layer, pointer('pointer'))
      map.on('mouseleave', layer, pointer(''))
    }
    // The learner's location or searched place says what it is, as Leaflet's tooltip did.
    const tip = new Popup({
      closeButton: false,
      closeOnClick: false,
      className: 'center-map-tip',
      offset: 14,
      anchor: 'bottom',
    })
    map.on('mouseenter', LAYERS.referenceDot, (event: MapLayerMouseEvent) => {
      const { reference } = latest.current.props
      const point = event.features?.[0]?.geometry
      if (!reference || point?.type !== 'Point') return
      tip
        .setLngLat(point.coordinates as [number, number])
        .setText(reference.mine ? latest.current.copy.yourLocation : reference.label)
        .addTo(map)
    })
    map.on('mouseleave', LAYERS.referenceDot, () => tip.remove())

    return () => {
      clearTimeout(restoring)
      popupRef.current?.remove()
      popupRef.current = null
      tip.remove()
      map.remove()
      mapRef.current = null
      if (import.meta.env.DEV && window.__trackCenterMap === map) delete window.__trackCenterMap
    }
    // Made once: everything read here that changes later has its own effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // How far the filter panel reaches over the map: TrainingPage sets it on the map's wrapper (--map-overlay-inset).
  useEffect(() => {
    const element = shell.current
    if (!element) return
    const read = () =>
      setInset(parseFloat(getComputedStyle(element).getPropertyValue('--map-overlay-inset')) || 0)
    read()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(read)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // The overlays' data, handed to the map as it changes.
  useEffect(() => {
    overlays.current = {
      centers: centersData,
      selected: selectedData,
      reference: referenceData,
      radius: radiusData,
      routes: routesData,
    }
    const map = mapRef.current
    if (!ready || !map) return
    const update = (id: string, data: GeoJSON) => map.getSource<GeoJSONSource>(id)?.setData(data)
    update(SOURCES.centers, centersData)
    update(SOURCES.selected, selectedData)
    update(SOURCES.reference, referenceData)
    update(SOURCES.radius, radiusData)
    update(SOURCES.routes, routesData)
    // The route layers, and with them the router's credit, show only while there's a route.
    const visibility = routesData.features.length ? 'visible' : 'none'
    for (const layer of ROUTE_LAYERS) {
      if (map.getLayer(layer)) map.setLayoutProperty(layer, 'visibility', visibility)
    }
  }, [ready, centersData, selectedData, referenceData, radiusData, routesData])

  // The base map's look: the theme, the layer chosen, and 3D. Diffed, so only what changed is redrawn.
  useEffect(() => {
    styleInputs.current = { theme, basemapId, threeD, hillshade }
    const map = mapRef.current
    if (!ready || !map) return
    map.setStyle(fullStyle(), { diff: true })
  }, [ready, theme, basemapId, threeD, hillshade, fullStyle])

  // 2D or 3D: a tilted, turnable view for 3D, flat and north up for 2D, with a smooth camera move between them.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const animation = motion(reducedMotion, 900)
    if (threeD) {
      map.dragRotate.enable()
      map.touchZoomRotate.enableRotation()
      map.touchPitch.enable()
      map.keyboard.enableRotation()
      if (map.getPitch() < 30) {
        map.easeTo({ pitch: PITCH_3D, bearing: map.getBearing() || BEARING_3D, ...animation })
      }
    } else {
      map.dragRotate.disable()
      map.touchZoomRotate.disableRotation()
      map.touchPitch.disable()
      map.keyboard.disableRotation()
      if (map.getPitch() !== 0 || map.getBearing() !== 0) {
        map.easeTo({ pitch: 0, bearing: 0, ...animation })
      }
    }
  }, [ready, threeD, reducedMotion])

  // Gestures. On a touch screen one finger scrolls the page past the map and two move it (as embedded Google Maps
  // do); with a mouse, the wheel zooms once the map is clicked into or focused.
  useEffect(() => {
    const map = mapRef.current
    const element = shell.current
    if (!ready || !map || !element) return
    if (touch) {
      map.cooperativeGestures.enable()
      map.scrollZoom.enable()
      return () => {
        map.cooperativeGestures.disable()
        map.scrollZoom.disable()
      }
    }
    const enable = () => map.scrollZoom.enable()
    const disable = (event: FocusEvent) => {
      if (!element.contains(event.relatedTarget as Node | null)) map.scrollZoom.disable()
    }
    map.on('click', enable)
    element.addEventListener('focusin', enable)
    element.addEventListener('focusout', disable)
    return () => {
      map.off('click', enable)
      element.removeEventListener('focusin', enable)
      element.removeEventListener('focusout', disable)
    }
  }, [ready, touch])

  // Frames the results when they change: the whole country without any, or a searched place with its closest
  // centers. An active radius frames its circle. A drawn route keeps the view on itself, and once the learner has
  // moved the map, a change of layout alone leaves their view where it is.
  const frameKey = JSON.stringify([
    points.map((center) => center.id),
    reference && [reference.latitude, reference.longitude],
    radius,
  ])
  const framed = useRef<{ key: string; inset: number } | null>(null)
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || hasRoute) return
    const previous = framed.current
    const changed = previous?.key !== frameKey
    if (!changed && (previous?.inset === inset || movedByUser.current)) return
    framed.current = { key: frameKey, inset }
    if (changed) movedByUser.current = false
    const frame: Frame = frameResults({ points, reference, radiusKm: radius })
    // The first frame is drawn at once; later ones ease there.
    applyFrame(map, frame, inset, previous ? motion(reducedMotion) : motion(true))
  }, [ready, frameKey, inset, hasRoute, points, reference, radius, reducedMotion])

  // Locate: each press brings the learner's own location to the middle of the map's clear part, close in, at once
  // when it's already known, or as soon as the browser answers. After the framing above, so a location that has just
  // arrived ends up centred, not framed with the centers. A refusal ends the request.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !locateAsk || answeredLocate.current === locateAsk) return
    if (reference?.mine) {
      answeredLocate.current = locateAsk
      const element = map.getContainer()
      const size = { width: element.clientWidth, height: element.clientHeight }
      map.easeTo({
        center: [reference.longitude, reference.latitude],
        zoom: LOCATE_ZOOM,
        offset: paddedOffset(overlayPadding(size, latest.current.inset, 40)),
        ...motion(reducedMotion, 800),
      })
      return
    }
    if (!locating) answeredLocate.current = locateAsk
  }, [ready, locateAsk, reference, locating, reducedMotion])

  // The selected center, chosen from the list or with View on map (which bumps `focus` to ask again): the camera goes
  // to it, closer in from far out, leaving room above it for its popup. Picked on the map itself, it's already in
  // view and the camera stays (the popup makes room for itself, below). A route has the view to itself.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !selectedId || hasRoute) return
    const askedAgain = askedFocus.current !== focus
    askedFocus.current = focus
    const fromMap = pickedOnMap.current === selectedId
    pickedOnMap.current = null
    const center = latest.current.byId.get(selectedId)
    if (!center || (fromMap && !askedAgain)) return
    const element = map.getContainer()
    const size = { width: element.clientWidth, height: element.clientHeight }
    const padding = overlayPadding(size, latest.current.inset, 40)
    const lngLat = lngLatOf(center)
    const far = map.getZoom() < 11
    if (!far && insidePadding(map.project(lngLat), size, padding)) return
    // The pin below the middle by half the popup's height, so pin and popup are framed together.
    const [x, y] = paddedOffset(padding)
    const room = Math.min((popupRef.current?.getElement().offsetHeight ?? 220) / 2, size.height / 4)
    map.easeTo({
      center: lngLat,
      ...(far ? { zoom: 13 } : {}),
      offset: [x, y + room],
      ...motion(latest.current.reducedMotion, 800),
    })
    map.once('moveend', keepPopupInView)
  }, [ready, selectedId, focus, hasRoute, keepPopupInView])

  // The routes: fitted once per set of directions; choosing a mode restyles them without moving the map. (The popup
  // closes as the route appears: a route has the view to itself.)
  const fitted = useRef<unknown>(null)
  useEffect(() => {
    const map = mapRef.current
    const data = directions.data
    if (!ready || !map || !route || !data?.routes.length || fitted.current === data) return
    fitted.current = data
    const element = map.getContainer()
    map.fitBounds(boundsOf(routeCorners(route, data.routes)), {
      padding: overlayPadding(
        { width: element.clientWidth, height: element.clientHeight },
        latest.current.inset,
        48,
      ),
      maxZoom: 16,
      ...motion(latest.current.reducedMotion),
    })
    // The route's ends are in its directions; the route object itself is new on every render of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, directions.data])

  // The popup: MapLibre's frame, holding the content rendered below, kept clear of the panel and the controls.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const current = latest.current
    const center = popup?.type === 'center' ? current.byId.get(popup.id) : undefined
    const lngLat = center ? lngLatOf(center) : popup?.type === 'together' ? popup.lngLat : null
    if (!popup || !lngLat) {
      const frame = popupRef.current
      popupRef.current = null
      frame?.remove()
      return
    }
    let frame = popupRef.current
    if (!frame) {
      const created = new Popup({
        closeButton: true,
        closeOnClick: false,
        closeOnMove: false,
        focusAfterOpen: false,
        maxWidth: 'none',
        anchor: 'bottom',
        className: 'center-map-popup',
      })
      created.setDOMContent(popupNode)
      // Closed with its own button: it stays closed until something else opens it.
      created.on('close', () => {
        if (popupRef.current !== created) return
        popupRef.current = null
        closePopup()
        restoreFocus()
      })
      popupRef.current = created
      frame = created
    }
    // Above the pin: a selected pin is drawn larger.
    frame.setOffset(popup.type === 'together' ? 26 : raised ? 60 : 48).setLngLat(lngLat)
    if (!frame.isOpen()) frame.addTo(map)
    // Once it's laid out: moved into view, and, opened from the keyboard, focused on its first button (View details).
    // A redraw in the same frame (the center becoming selected) cancels this one, and its own does it instead.
    const frameRequest = requestAnimationFrame(() => {
      // Not while the camera is still on its way somewhere: it checks again when it gets there.
      if (!map.isMoving()) keepPopupInView()
      if (!focusPopup.current) return
      focusPopup.current = false
      popupNode.querySelector<HTMLElement>('button')?.focus()
    })
    return () => cancelAnimationFrame(frameRequest)
    // popupKey says what the popup shows; the popup object itself is new on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, popupKey, raised, popupNode, closePopup, restoreFocus, keepPopupInView])

  // The buttons over the pins: placed before they're painted, and focus kept when a redraw replaces them.
  useLayoutEffect(() => {
    place()
    const map = mapRef.current
    const wanted = pendingFocus.current
    if (map && wanted && targets.length) {
      pendingFocus.current = null
      const at = map.project(wanted)
      const nearest = [...anchored.current.entries()]
        .filter(([key]) => key.startsWith('pin:') || key.startsWith('cluster:'))
        .map(([key, { lngLat }]) => {
          const point = map.project(lngLat)
          return { key, distance: Math.hypot(point.x - at.x, point.y - at.y) }
        })
        .sort((a, b) => a.distance - b.distance)[0]
      if (nearest) anchored.current.get(nearest.key)?.element.focus()
    } else if (
      focusedKey.current &&
      !anchored.current.has(focusedKey.current) &&
      document.activeElement === document.body
    ) {
      // The focused pin left the screen: focus goes back to the map rather than to the top of the page.
      map?.getCanvas().focus()
    }
  }, [targets, labels, place])

  const pressed = (event: PointerEvent) => {
    pressedAt.current = { x: event.clientX, y: event.clientY }
  }
  /** A real click, or Enter or Space on the button: not the end of a drag that began on it. */
  const isClick = (event: { detail: number; clientX: number; clientY: number }) => {
    const start = pressedAt.current
    pressedAt.current = null
    return (
      event.detail === 0 ||
      !start ||
      Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6
    )
  }

  const onPopupKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    closePopup()
    restoreFocus()
  }

  const popupCenter = popup?.type === 'center' ? byId.get(popup.id) : undefined
  const together = popup?.type === 'together' ? popup.ids.flatMap((id) => byId.get(id) ?? []) : []
  const statusText = typeof status === 'string' ? copy[status] : status?.message
  const coverageText = threeD && coverage ? copy.threeDNotes[coverage] : null
  const shownStatus =
    locating && props.locatingNotice !== false
      ? en.training.filters.locating
      : !points.length
        ? copy.none
        : (statusText ?? coverageText)

  const zoomBy = (delta: number) => {
    const map = mapRef.current
    if (!map) return
    movedByUser.current = true
    map.easeTo({ zoom: map.getZoom() + delta, ...motion(reducedMotion, 300) })
  }

  return (
    // A page holding the map elsewhere, as Skills Explorer does, can set its height (--center-map-height).
    <div
      ref={shell}
      className="center-map relative isolate h-[var(--center-map-height,680px)] overflow-hidden rounded-18 border border-border bg-map-water shadow-[0_6px_24px_rgb(var(--track-shadow-rgb)/0.05)] max-sm:h-[min(var(--center-map-height,460px),460px)]"
      data-engine="maplibre"
      data-radius-km={radius ?? undefined}
      data-three-d={threeD || undefined}
      role="region"
      aria-label={copy.label}
    >
      <div ref={container} className="absolute inset-0" />

      {overlayNode &&
        createPortal(
          <>
            {targets.map((target) => {
              const center = target.centerId ? byId.get(target.centerId) : undefined
              if (target.type === 'pin' && !center) return null
              const label =
                target.type === 'pin' && center
                  ? copy.pin(center.name, en.training.kinds[center.kind])
                  : copy.cluster(target.count ?? 0)
              return (
                <button
                  key={target.key}
                  ref={anchor(target.key, target.lngLat)}
                  type="button"
                  className={target.type === 'pin' ? 'center-map-pin' : 'center-map-cluster'}
                  data-selected={target.selected || undefined}
                  aria-label={label}
                  title={label}
                  onPointerDown={pressed}
                  onFocus={() => (focusedKey.current = target.key)}
                  // Removed while focused, a button blurs with nowhere to go, and the layout effect below
                  // brings focus back to the map. Only a move elsewhere forgets it.
                  onBlur={(event) => {
                    if (event.relatedTarget) focusedKey.current = null
                  }}
                  onClick={(event) => {
                    if (!isClick(event)) return
                    const viaKeyboard = event.detail === 0
                    if (target.type === 'pin' && target.centerId)
                      openCenter(target.centerId, viaKeyboard)
                    else if (target.clusterId !== undefined)
                      void openCluster(target.clusterId, target.lngLat, viaKeyboard)
                  }}
                />
              )
            })}
            {labels.map(({ mode, lngLat }) => {
              const option = options.find((item) => item.mode === mode)
              if (!option) return null
              const isChosen = mode === chosen
              return (
                <div key={mode} ref={anchor(`route:${mode}`, lngLat)} className="center-map-anchor">
                  {/* A route's label: picks its travel mode. */}
                  <button
                    type="button"
                    className={cx(
                      'center-map-route-label inline-flex -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center gap-2 rounded-10 border px-3 py-[7px] whitespace-nowrap hovered:border-blue',
                      isChosen
                        ? 'border-fill bg-fill text-13 font-[650] text-white shadow-[0_4px_12px_#175cd355]'
                        : 'border-border bg-surface text-[12.5px] font-semibold text-navy shadow-[0_3px_10px_rgb(var(--track-shadow-rgb)/0.15)]',
                    )}
                    aria-pressed={isChosen}
                    aria-label={copy.routeLabel(
                      `${routeLabel(option)} ${en.training.routes.modes[mode]}`,
                    )}
                    onPointerDown={pressed}
                    onClick={(event) => {
                      if (isClick(event)) onTravelMode(mode)
                    }}
                  >
                    <Icon name={MODE_ICONS[mode]} size={16} />
                    {routeLabel(option)}
                  </button>
                </div>
              )
            })}
          </>,
          overlayNode,
        )}

      {createPortal(
        // Escape closes the popup, returning to the pin it came from.
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions
        <div onKeyDown={onPopupKey}>
          {popupCenter && (
            <CenterPopup
              center={popupCenter}
              canRoute={props.canRoute}
              saved={props.saved}
              today={props.today}
              onDetails={props.onDetails}
              onRoute={props.onRoute}
              onToggleSaved={props.onToggleSaved}
              onCopied={(message) => setStatus({ message })}
            />
          )}
          {together.length > 0 && (
            <div className="grid gap-y-2.5 text-13">
              <p className="pr-[18px] text-15 font-bold text-navy">
                {copy.together(together.length)}
              </p>
              <ul className="m-0 grid list-none gap-1.5 p-0">
                {together.map((center) => (
                  <li key={center.id}>
                    <button
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-2 rounded-10 border border-border bg-surface px-3 py-2 text-left text-14 font-semibold text-navy hovered:bg-soft"
                      onClick={(event) => openCenter(center.id, event.detail === 0)}
                    >
                      <i
                        className={cx('size-2 flex-none rounded-full', KIND_DOTS[center.kind])}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 wrap-anywhere">{center.name}</span>
                      <span className="text-12 font-medium text-muted">
                        {en.training.kinds[center.kind]}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>,
        popupNode,
      )}

      {shownStatus && (
        <p
          className="pointer-events-none absolute top-[var(--map-status-top,0.875rem)] right-[70px] left-[calc(var(--map-overlay-inset,0px)_+_14px)] z-860 m-0 rounded-12 bg-glass px-3.5 py-2.5 text-13 text-muted shadow-[0_2px_10px_rgb(var(--track-shadow-rgb)/0.08)]"
          role="status"
        >
          {shownStatus}
        </p>
      )}

      <div className="absolute top-3.5 right-3.5 z-800 flex flex-col items-end gap-2">
        <Button
          className={cx(controlButton, 'rounded-12')}
          aria-label={copy.locate}
          onPress={() => {
            setLocateAsk((n) => n + 1)
            props.onLocate()
          }}
        >
          <Icon name="locate" size={20} />
        </Button>
        <div className={cx('flex flex-col overflow-hidden rounded-12', floating)}>
          <Button
            className={cx(
              controlButton,
              'rounded-none border-b border-solid border-border text-20 shadow-none',
            )}
            aria-label={copy.zoomIn}
            onPress={() => zoomBy(1)}
          >
            <Icon name="plus" size={18} />
          </Button>
          <Button
            className={cx(controlButton, 'rounded-none shadow-none')}
            aria-label={copy.zoomOut}
            onPress={() => zoomBy(-1)}
          >
            <Icon name="minus" size={18} />
          </Button>
        </div>
        {canThreeD && (
          <ToggleButton
            className={cx(
              'grid size-10.5 cursor-pointer place-items-center rounded-12 border-0 text-13 font-bold',
              threeD
                ? 'bg-fill text-white data-hovered:bg-fill-hover'
                : 'bg-surface text-navy data-hovered:bg-soft',
              floating,
            )}
            aria-label={copy.threeD}
            isSelected={threeD}
            onChange={(on) => {
              setThreeDWanted(on)
              writeItem(THREE_D_KEY, on ? 'on' : 'off')
            }}
          >
            {copy.threeDButton}
          </ToggleButton>
        )}
        <MenuTrigger>
          {/* In the column with the other controls, so the legend has the bottom of the map to itself. */}
          <Button className={cx(controlButton, 'rounded-12')} aria-label={copy.layers}>
            <Icon name="layers" size={18} />
          </Button>
          <Popover
            placement="start top"
            className="min-w-[180px] rounded-12 bg-surface p-1.5 shadow-[0_10px_28px_rgb(var(--track-shadow-rgb)/0.2)]"
          >
            <Menu
              className="outline-none"
              aria-label={copy.layers}
              selectionMode="single"
              selectedKeys={[basemapId]}
              disallowEmptySelection
              onSelectionChange={(keys: Selection) => {
                const [id] = [...keys]
                if (typeof id !== 'string') return
                setBasemapId(id as BasemapId)
                writeItem(BASEMAP_KEY, id)
              }}
            >
              {basemaps.map((id) => (
                <MenuItem
                  key={id}
                  id={id}
                  className="flex cursor-pointer items-center gap-2 rounded-8 px-2.5 py-[9px] text-13 text-navy outline-none data-focused:bg-soft data-selected:font-[650]"
                >
                  {({ isSelected }) => (
                    <>
                      <Icon name="tick" className={cx('text-blue', !isSelected && 'invisible')} />
                      {copy.basemaps[id]}
                    </>
                  )}
                </MenuItem>
              ))}
            </Menu>
          </Popover>
        </MenuTrigger>
        {threeD && <NorthButton mapRef={mapRef} ready={ready} reducedMotion={reducedMotion} />}
      </div>

      <div className="absolute bottom-3.5 left-[calc(var(--map-overlay-inset,0px)_+_4px)] z-800 flex flex-col items-start gap-2">
        {logo && (
          // MapTiler's free plan asks maps that use it to show its logo.
          <a
            className="block rounded-8 bg-glass-soft px-1.5 py-1 leading-none"
            href={logo.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              src={logo.src}
              alt={logo.alt}
              width={67}
              height={20}
              className="block h-5 w-auto"
            />
          </a>
        )}
        <div
          className="flex flex-wrap gap-[22px] rounded-14 bg-surface px-[18px] py-[11px] text-[12.5px] text-navy shadow-[0_4px_14px_rgb(var(--track-shadow-rgb)/0.1)] max-sm:gap-3 max-sm:px-3 max-sm:py-[9px] max-sm:text-[11.5px]"
          aria-hidden="true"
        >
          {(['training', 'assessment'] as const).map((kind) => (
            <span key={kind} className="inline-flex items-center gap-2">
              <i className={cx('size-3 rounded-full', KIND_DOTS[kind])} data-kind={kind} />
              {copy.legend[kind]}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/** In 3D the map can turn: this shows which way north is, and turns it back when pressed. */
function NorthButton({
  mapRef,
  ready,
  reducedMotion,
}: {
  mapRef: { current: MapLibreMap | null }
  ready: boolean
  reducedMotion: boolean
}) {
  const en = useCopy()
  const needle = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const turn = () => {
      if (needle.current) needle.current.style.transform = `rotate(${-map.getBearing()}deg)`
    }
    turn()
    map.on('rotate', turn)
    return () => {
      map.off('rotate', turn)
    }
  }, [mapRef, ready])
  return (
    <Button
      className={cx(controlButton, 'rounded-12')}
      aria-label={en.training.map.north}
      onPress={() => mapRef.current?.easeTo({ bearing: 0, ...motion(reducedMotion, 500) })}
    >
      <span ref={needle} className="grid place-items-center">
        <Icon name="compass" size={20} />
      </span>
    </Button>
  )
}

/** Frames the map: bounds fitted inside the controls and panel, or a point at a zoom. */
function applyFrame(
  map: MapLibreMap,
  frame: Frame,
  inset: number,
  animation: { duration: number; essential: boolean },
) {
  const element = map.getContainer()
  const size = { width: element.clientWidth, height: element.clientHeight }
  if ('center' in frame) {
    map.easeTo({
      center: frame.center,
      zoom: frame.zoom,
      offset: paddedOffset(overlayPadding(size, inset, 0)),
      ...animation,
    })
    return
  }
  map.fitBounds(frame.bounds, {
    padding: overlayPadding(size, inset, frame.margin),
    ...(frame.maxZoom ? { maxZoom: frame.maxZoom } : {}),
    ...animation,
  })
}

/** Moves the map just enough that a popup shows whole, clear of the panel and controls. */
function keepInView(
  map: MapLibreMap,
  popup: HTMLElement | undefined,
  padding: { top: number; right: number; bottom: number; left: number },
  animation: { duration: number },
) {
  if (!popup) return
  const box = popup.getBoundingClientRect()
  const frame = map.getContainer().getBoundingClientRect()
  const shift = (start: number, end: number, low: number, high: number) =>
    start < low ? start - low : end > high ? Math.min(end - high, start - low) : 0
  const dx = shift(box.left, box.right, frame.left + padding.left, frame.right - padding.right)
  const dy = shift(box.top, box.bottom, frame.top + padding.top, frame.bottom - padding.bottom)
  if (dx || dy) map.panBy([dx, dy], animation)
}

/**
 * Whether 3D has anything to show here: buildings appear from zoom 15, and only those with recorded heights rise.
 * Coverage varies a great deal across the Philippines, so the map says so rather than promising 3D everywhere.
 */
function buildingCoverage(map: MapLibreMap): CoverageNote {
  if (map.getZoom() < 15) return 'zoomIn'
  if (!map.getLayer(BUILDING_3D)) return null
  if (map.queryRenderedFeatures({ layers: [BUILDING_3D] }).length) return null
  return map.queryRenderedFeatures({ layers: [BUILDING_FLAT] }).length ? 'noHeights' : 'noBuildings'
}
