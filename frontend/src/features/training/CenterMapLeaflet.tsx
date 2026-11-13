import 'leaflet/dist/leaflet.css'
// After leaflet.css, which it styles over.
import './center-map.css'
import './demand-map.css'
import L from 'leaflet'
// After Leaflet, which sets the global L the plugin extends.
import 'leaflet.markercluster'
import {
  createElementObject,
  createLayerComponent,
  extendContext,
  type LayerProps,
} from '@react-leaflet/core'
import { useQuery } from '@tanstack/react-query'
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button, Menu, MenuItem, MenuTrigger, Popover, type Selection } from 'react-aria-components'
import {
  Circle,
  CircleMarker,
  GeoJSON,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  ZoomControl,
  useMap,
} from 'react-leaflet'
import { Icon } from '../../components/Icon.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { readItem, writeItem } from '../../lib/storage.ts'
import { cx } from '../../lib/style.ts'
import type { CenterKind } from './address.ts'
import { directionsQuery, type TravelMode } from './api.ts'
import type { Center } from './centers.ts'
import { KIND_DOTS, MODE_ICONS } from './CenterDetail.tsx'
import {
  BASEMAP_KEY,
  LOCATE_ZOOM,
  type CenterMapProps,
  type MapRoute,
  type DemandMapArea,
} from './CenterMapTypes.ts'
import { CenterPopup } from './CenterPopup.tsx'
import { DemandLegend, RECOMMENDED_COLOR } from './DemandLegend.tsx'
import { BALANCE_MARKS, demandRegions, demandSymbol, useRegionBoundaries } from './demandMap.ts'
import { routeLabel } from './format.ts'
import { homeView, homeWorldSize, zoomFor } from './mapLimits.ts'
import { useOverlayEdges, type OverlayEdges } from './overlayEdges.ts'
import { partialPath, useRouteDraw } from './routeDraw.ts'
import type { Reference } from './useCenters.ts'

// The center map drawn by Leaflet (classic/training_view.py _CENTER_MAP, ported from its Leaflet code): clustered pins
// with popups, the learner's location or searched place, routes for each travel mode, a choice of raster map layers,
// and night tiles in dark. CenterMap.tsx uses it where MapLibre can't run: no vector tiles configured, no WebGL 2, or
// MapLibre failed. It's an extra: the list beside it has everything (US-08). Loaded only when chosen, in its own chunk.

const PHILIPPINES: L.LatLngBoundsExpression = [
  [4.5, 116.8],
  [21.2, 126.7],
]
const COLORS: Record<CenterKind, string> = { training: '#175cd3', assessment: '#0d9488' }
// One glyph per center type on a 24-unit grid, drawn in white on its pin.
const GLYPHS: Record<CenterKind, string> = {
  training:
    '<path d="M12 6.5 4.5 10 12 13.5 19.5 10 12 6.5Z M7.5 11.6v3.1c2.6 1.7 6.4 1.7 9 0v-3.1 M19.5 10v4.2"/>',
  assessment:
    '<circle cx="12" cy="9.6" r="3.7"/><path d="m9.5 12.6-1.3 4.9 3.8-1.8 3.8 1.8-1.3-4.9"/>',
}
// Where along its path each mode's label sits, so labels on shared roads don't cover each other.
const LABEL_AT: Record<TravelMode, number> = { car: 0.5, bike: 0.3, foot: 0.7, plane: 0.65 }
const ROUTE_CREDIT =
  'Route by <a href="https://project-osrm.org/" target="_blank" rel="noopener noreferrer">OSRM</a> · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener noreferrer">Fix the map</a>'
const OSM_CREDIT =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
const CARTO_CREDIT = `${OSM_CREDIT} &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a>`

// The map's own controls float over it. Leaflet's parts are styled in center-map.css.
const floating = 'shadow-[0_4px_14px_rgb(var(--track-shadow-rgb)/0.12)]'
// A pin's glow when it's selected, in its type's color.
const SELECTED_GLOWS: Record<CenterKind, string> = {
  training: 'drop-shadow-[0_0_7px_#175cd3aa]',
  assessment: 'drop-shadow-[0_0_7px_#0d9488aa]',
}

type BasemapId = keyof ReturnType<typeof useCopy>['training']['map']['basemaps']
interface Basemap {
  id: BasemapId
  url: string
  attribution: string
  subdomains?: string
  maxZoom: number
  /** OpenStreetMap's colors, muted, standing in for CARTO's without a key. */
  soft?: boolean
}

/** The map layers: CARTO's need the deployment's key; without one the map uses OpenStreetMap, muted. */
function basemaps(key: string): Basemap[] {
  const osm: Omit<Basemap, 'id'> = {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: OSM_CREDIT,
    maxZoom: 19,
  }
  const carto = (style: string): Omit<Basemap, 'id'> => ({
    url: `https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(key)}`,
    attribution: CARTO_CREDIT,
    subdomains: 'abcd',
    maxZoom: 20,
  })
  return key
    ? [
        { id: 'map', ...carto('rastertiles/voyager') },
        { id: 'light', ...carto('light_all') },
        { id: 'standard', ...osm },
      ]
    : [
        { id: 'map', ...osm, soft: true },
        { id: 'standard', ...osm },
      ]
}

const pinIcons = new Map<string, L.DivIcon>()
const STAR_PATH = 'm12 3.5 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8L12 3.5Z'

/** A center's pin in its type's color, larger when selected, starred when recommended. Made once each and reused. */
function pinIcon(kind: CenterKind, selected: boolean, recommended = false): L.DivIcon {
  const key = `${kind}-${selected}-${recommended}`
  let icon = pinIcons.get(key)
  if (!icon) {
    icon = makePinIcon(kind, selected, recommended)
    pinIcons.set(key, icon)
  }
  return icon
}

/** Pins, clusters and the reference dot are Leaflet div icons: markup given to Leaflet, classes and all. */
function makePinIcon(kind: CenterKind, selected: boolean, recommended: boolean): L.DivIcon {
  const pin = cx(
    'relative h-11 w-[34px] origin-bottom transition-transform duration-150 ease-[ease]',
    selected
      ? cx('scale-130', SELECTED_GLOWS[kind])
      : recommended
        ? 'scale-115 drop-shadow-[0_0_6px_#f5a524]'
        : 'drop-shadow-[0_3px_3px_rgb(var(--track-shadow-rgb)/0.27)]',
  )
  // A gold star on the pin's shoulder: a shape as well as a color, so it reads without color.
  const star = recommended
    ? `<svg class="absolute -top-1.5 -right-2 size-[18px]" viewBox="0 0 24 24" aria-hidden="true" data-recommended><circle cx="12" cy="12" r="11" fill="#fff"/><path d="${STAR_PATH}" fill="${RECOMMENDED_COLOR}" stroke="#b45309" stroke-width="1.2" stroke-linejoin="round"/></svg>`
    : ''
  return L.divIcon({
    className: '',
    html: `<div class="${pin}" data-kind="${kind}"><svg class="block size-full" viewBox="0 0 34 44" aria-hidden="true"><path d="M17 1.5C8.4 1.5 1.5 8.3 1.5 16.9 1.5 28.4 17 42.5 17 42.5s15.5-14.1 15.5-25.6C32.5 8.3 25.6 1.5 17 1.5Z" fill="${COLORS[kind]}" stroke="#fff" stroke-width="2"/><g transform="translate(5 4.5)" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[kind]}</g></svg>${star}</div>`,
    iconSize: [34, 44],
    iconAnchor: [17, 43],
    popupAnchor: [0, -40],
  })
}

/** Leaflet.markercluster as a layer that react-leaflet's markers add themselves to. */
const ClusterGroup = createLayerComponent<
  L.MarkerClusterGroup,
  LayerProps & { children?: ReactNode }
>(function createClusterGroup(_props, context) {
  const group = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 46,
    spiderfyOnMaxZoom: true,
    // Only a count: never any text a center or learner gave.
    iconCreateFunction: (cluster) =>
      L.divIcon({
        className: '',
        iconSize: [46, 46],
        html: `<div class="grid size-11.5 place-items-center rounded-full bg-[#175cd32e]"><span class="grid size-8.5 place-items-center rounded-full border-2 border-white bg-[#175cd3] text-13 font-bold text-white">${cluster.getChildCount()}</span></div>`,
      }),
  })
  return createElementObject(group, extendContext(context, { layerContainer: group }))
})

export default function CenterMapLeaflet(props: CenterMapProps) {
  const en = useCopy()
  const copy = en.training.map

  const { centers, cartoKey, locating } = props
  const shell = useRef<HTMLDivElement>(null)
  const layers = useMemo(() => basemaps(cartoKey), [cartoKey])
  const [basemapId, setBasemapId] = useState<BasemapId>(() => {
    const saved = readItem(BASEMAP_KEY)
    return layers.some((layer) => layer.id === saved) ? (saved as BasemapId) : layers[0].id
  })
  const basemap = layers.find((layer) => layer.id === basemapId) ?? layers[0]
  const [status, setStatus] = useState<'loading' | 'tilesFailed' | { message: string } | null>(
    'loading',
  )
  // Bumped by each press of Locate, so the map goes to the learner's location even when it hasn't changed.
  const [locateAsk, setLocateAsk] = useState(0)
  // How far the page's panels, bars and cards reach over the map's edges. From the left it is the filter panel
  // (0 when it doesn't reach over the map): framing and popups keep clear.
  const edges = useOverlayEdges(shell)
  const inset = edges.left
  // How far out the map may go, once StayOnPhilippines has worked it out. Leaflet.markercluster builds the pins'
  // clusters for the whole-number zooms from the map's lowest up, and can't follow that lowest zoom down afterwards:
  // the pins wait for the limit, and are built again when its whole number changes.
  const [limits, setLimits] = useState<MapLimits | null>(null)

  const points = centers.filter((center) => center.latitude !== null && center.longitude !== null)
  // One qualification's supply and demand: the regions carry their balance, and its centers are pinned over them.
  const outlook = Boolean(props.demandAreas?.some((area) => area.balance))
  const statusText = typeof status === 'string' ? copy[status] : status?.message
  const shownStatus =
    locating && props.locatingNotice !== false
      ? en.training.filters.locating
      : !points.length && !props.demandAreas
        ? copy.none
        : statusText

  return (
    // A page holding the map elsewhere, as Skills Explorer does, can set its height (--center-map-height).
    <div
      ref={shell}
      className="center-map relative isolate h-[var(--center-map-height,680px)] overflow-hidden rounded-18 border border-border bg-map-water shadow-[0_6px_24px_rgb(var(--track-shadow-rgb)/0.05)] max-sm:h-[min(var(--center-map-height,460px),460px)]"
      data-engine="leaflet"
      data-demand={props.demandAreas ? true : undefined}
      data-soft={basemap.soft || undefined}
      role="region"
      aria-label={
        outlook
          ? en.explore.outlook.mapLabel
          : props.demandAreas
            ? en.explore.demand.mapLabel
            : copy.label
      }
    >
      <MapContainer
        className="absolute inset-0 bg-map-water"
        bounds={PHILIPPINES}
        zoomSnap={0.5}
        scrollWheelZoom={false}
        zoomControl={false}
        attributionControl
        // The map stays on the Philippines (StayOnPhilippines): pushed against its limit, it doesn't give.
        maxBoundsViscosity={1}
      >
        <TileLayer
          key={basemap.id}
          url={basemap.url}
          attribution={basemap.attribution}
          maxZoom={basemap.maxZoom}
          {...(basemap.subdomains ? { subdomains: basemap.subdomains } : {})}
          eventHandlers={{
            load: () => setStatus((current) => (current === 'loading' ? null : current)),
            tileerror: () => setStatus('tilesFailed'),
          }}
        />
        <ZoomControl position="topright" />
        <FollowSize />
        <StayOnPhilippines inset={inset} edges={edges} limits={limits} onLimits={setLimits} />
        <WheelZoomOnFocus />
        {limits && (
          <Pins
            key={Math.floor(limits.minZoom)}
            {...props}
            points={points}
            inset={inset}
            onCopied={(message) => setStatus({ message })}
          />
        )}
        <ReferenceDot reference={props.reference} />
        {props.demandAreas && (
          <DemandAreas
            areas={props.demandAreas}
            selected={props.demandRegion}
            overview={props.demandOverview}
            onPick={props.onDemandArea}
            inset={inset}
            edges={edges}
          />
        )}
        {props.route && (
          <RouteLayer
            route={props.route}
            travelMode={props.travelMode}
            onTravelMode={props.onTravelMode}
            inset={inset}
          />
        )}
        {!props.demandAreas && (
          <Framing
            points={points}
            reference={props.reference}
            radiusKm={props.radiusKm}
            hasRoute={props.route !== null}
            inset={inset}
          />
        )}
        {/* After Framing, so a location that has just arrived ends up centred, not framed with the centers. */}
        <GoToMine ask={locateAsk} reference={props.reference} locating={locating} inset={inset} />
      </MapContainer>

      {shownStatus && (
        <p
          className="pointer-events-none absolute top-[var(--map-status-top,0.875rem)] right-[70px] left-[calc(var(--map-overlay-inset,0px)_+_14px)] z-800 m-0 rounded-12 bg-glass px-3.5 py-2.5 text-13 text-muted shadow-[0_2px_10px_rgb(var(--track-shadow-rgb)/0.08)]"
          role="status"
        >
          {shownStatus}
        </p>
      )}
      <Button
        className={cx(
          'absolute top-[calc(var(--map-overlay-top,0px)_+_0.875rem)] right-3.5 z-800 grid size-10.5 cursor-pointer place-items-center rounded-12 border-0 bg-surface text-navy data-hovered:bg-soft',
          floating,
        )}
        aria-label={copy.locate}
        onPress={() => {
          setLocateAsk((n) => n + 1)
          props.onLocate()
        }}
      >
        <Icon name="locate" size={20} />
      </Button>
      <MenuTrigger>
        <Button
          className={cx(
            'absolute right-3.5 bottom-[calc(var(--map-overlay-bottom,0px)_+_var(--map-corner-clear,0px)_+_1.75rem)] z-800 inline-flex h-11 cursor-pointer items-center gap-[9px] rounded-12 border-0 bg-surface px-[18px] text-[13.5px] font-semibold text-navy data-hovered:bg-row-hover max-sm:px-3',
            floating,
          )}
          aria-label={copy.layers}
        >
          <Icon name="layers" size={18} />
          <span className="max-sm:hidden">{copy.layersButton}</span>
        </Button>
        <Popover
          placement="top end"
          className="min-w-[180px] rounded-12 bg-surface p-1.5 shadow-[0_10px_28px_rgb(var(--track-shadow-rgb)/0.2)]"
        >
          <Menu
            className="outline-none"
            aria-label={copy.layers}
            selectionMode="single"
            selectedKeys={[basemap.id]}
            disallowEmptySelection
            onSelectionChange={(keys: Selection) => {
              const [id] = [...keys]
              if (typeof id !== 'string') return
              setBasemapId(id as BasemapId)
              writeItem(BASEMAP_KEY, id)
            }}
          >
            {layers.map((layer) => (
              <MenuItem
                key={layer.id}
                id={layer.id}
                className="flex cursor-pointer items-center gap-2 rounded-8 px-2.5 py-[9px] text-13 text-navy outline-none data-focused:bg-soft data-selected:font-[650]"
              >
                {({ isSelected }) => (
                  <>
                    <Icon name="tick" className={cx('text-blue', !isSelected && 'invisible')} />
                    {copy.basemaps[layer.id]}
                  </>
                )}
              </MenuItem>
            ))}
          </Menu>
        </Popover>
      </MenuTrigger>
      <div
        className="absolute bottom-[calc(var(--map-overlay-bottom,0px)_+_0.875rem)] left-[calc(var(--map-overlay-inset,0px)_+_4px)] z-800 flex flex-wrap gap-[22px] rounded-14 bg-surface px-[18px] py-[11px] text-[12.5px] text-navy shadow-[0_4px_14px_rgb(var(--track-shadow-rgb)/0.1)] max-sm:gap-3 max-sm:px-3 max-sm:py-[9px] max-sm:text-[11.5px]"
        aria-hidden={props.demandAreas ? undefined : true}
      >
        {props.demandAreas ? (
          <DemandLegend
            areas={props.demandAreas}
            dates={props.demandSnapshotDates}
            outlook={outlook}
            recommended={Boolean(props.recommended?.length)}
          />
        ) : (
          (['training', 'assessment'] as const).map((kind) => (
            <span key={kind} className="inline-flex items-center gap-2">
              <i className={cx('size-3 rounded-full', KIND_DOTS[kind])} data-kind={kind} />
              {copy.legend[kind]}
            </span>
          ))
        )}
      </div>
    </div>
  )
}

function DemandAreas({
  areas,
  selected,
  overview = false,
  onPick,
  inset,
  edges,
}: {
  areas: readonly DemandMapArea[]
  selected?: string | null
  /** Frame every region, whichever is selected. */
  overview?: boolean
  onPick?: (code: string) => void
  inset: number
  edges: OverlayEdges
}) {
  const map = useMap()
  const en = useCopy()
  const copy = en.explore.demand
  const boundaries = useRegionBoundaries()
  const data = useMemo(
    () => demandRegions(boundaries.data, areas, selected),
    [boundaries.data, areas, selected],
  )
  // The camera follows the regions' shapes and the selection, not each refresh of their counts, nor a card of the
  // page's growing by a line: the edges are read as they stand when it moves.
  const shapes = boundaries.data
  const reach = useRef(edges)
  useEffect(() => {
    reach.current = edges
  })
  const framed = overview ? null : selected
  useEffect(() => {
    const shown = framed
      ? (shapes?.features ?? []).filter((feature) => feature.properties.region_code === framed)
      : (shapes?.features ?? [])
    if (!shown.length) return
    const bounds = L.geoJSON(shown).getBounds()
    map.fitBounds(bounds, {
      paddingTopLeft: [inset + 40, reach.current.top + 75],
      paddingBottomRight: [60, reach.current.bottom + 60],
      maxZoom: framed ? 11 : 8,
    })
  }, [map, shapes, framed, inset])
  const labelOf = (area: DemandMapArea | undefined, name: string, count: number | null) =>
    area?.balance
      ? en.explore.outlook.mapMarker(
          name,
          area.posting_count,
          area.centers ?? 0,
          en.explore.outlook.balance[area.balance],
        )
      : count === null
        ? copy.mapRegionEmpty(name)
        : copy.mapMarker(name, count)
  if (boundaries.isPending || boundaries.isError)
    return (
      <p
        role="status"
        className="absolute top-20 right-16 z-800 m-0 max-w-64 rounded-8 bg-surface p-3 text-13 text-navy"
      >
        {boundaries.isError ? copy.mapBoundaryFailed : copy.mapBoundaryLoading}
      </p>
    )
  return (
    <>
      {data.features.map((feature) => {
        const {
          region_code: code,
          name,
          posting_count: count,
          color,
          selected: active,
        } = feature.properties
        const area = areas.find((item) => item.region_code === code)
        const label = labelOf(area, name, count)
        return (
          <GeoJSON
            key={`${code}:${count}:${active}:${area?.balance ?? ''}:${area?.centers ?? ''}`}
            data={feature}
            style={{
              className: 'demand-region-polygon',
              fillColor: color,
              fillOpacity: active ? 0.76 : 0.56,
              color: active ? '#175cd3' : '#6f6475',
              weight: active ? 3 : 1,
              opacity: 0.9,
              dashArray: count === null ? '3 3' : undefined,
            }}
            onEachFeature={(_item, layer) => {
              const path = layer as L.Path
              const choose = () => onPick?.(code)
              path.on('click', choose)
              path.on('add', () => {
                const element = path.getElement()
                element?.setAttribute('tabindex', '0')
                element?.setAttribute('role', 'button')
                element?.setAttribute('aria-label', label)
                element?.setAttribute('aria-pressed', String(active))
                element?.addEventListener('keydown', (event) => {
                  const key = (event as KeyboardEvent).key
                  if (key === 'Enter' || key === ' ') {
                    event.preventDefault()
                    choose()
                  }
                })
              })
            }}
          >
            <Tooltip>
              {label}
              <br />
              {area?.titles.join(' · ')}
            </Tooltip>
          </GeoJSON>
        )
      })}
      {/* With a qualification in focus, each region with records wears its badge: balance mark, code, postings. */}
      {areas
        .filter((area) => area.balance && BALANCE_MARKS[area.balance])
        .map((area) => {
          const active = area.region_code === selected
          const badge = demandSymbol(area, active, labelOf(area, area.name, area.posting_count))
          badge.addEventListener('click', (event) => {
            // The polygon under the badge would pick the region a second time.
            event.stopPropagation()
            onPick?.(area.region_code)
          })
          return (
            <Marker
              key={`badge:${area.region_code}:${area.posting_count}:${area.balance}:${active}`}
              position={[area.latitude, area.longitude]}
              icon={L.divIcon({ className: 'demand-region-badge', html: badge, iconSize: [0, 0] })}
              // The badge is its own button; the marker around it takes no focus, and sits under the pins.
              keyboard={false}
              zIndexOffset={active ? -700 : -800}
            />
          )
        })}
    </>
  )
}

/**
 * The map stays on the Philippines: it can't be zoomed out past the view that shows the whole country in the part of
 * the map clear of the page's panels, nor moved outside that view. Worked out again when the map's box or those
 * panels change.
 */
interface MapLimits {
  minZoom: number
  /** South-west and north-east corners, or none for a map with no box to fit the country into. */
  bounds: [L.LatLngTuple, L.LatLngTuple] | null
}

function StayOnPhilippines({
  inset,
  edges,
  limits,
  onLimits,
}: {
  inset: number
  edges: OverlayEdges
  limits: MapLimits | null
  onLimits: (limits: MapLimits) => void
}) {
  const map = useMap()
  // Worked out here, and put on the map below once the page has drawn with it: by then pins built for the old
  // limit have been taken off the map, and those built for the new one aren't on it yet.
  useEffect(() => {
    const measure = () => {
      const { x: width, y: height } = map.getSize()
      // A map with no box yet has nothing to fit; it's asked again when it gets one.
      if (!width || !height) return onLimits({ minZoom: map.getMinZoom(), bounds: null })
      const size = { width, height }
      const padding = { top: edges.top, right: 0, bottom: edges.bottom, left: inset }
      // Down to a zoom Leaflet stops on, so the whole country always fits.
      const snap = map.options.zoomSnap || 1
      const minZoom = Math.max(
        0,
        Math.floor(zoomFor(homeWorldSize(size, padding), 256) / snap) * snap,
      )
      const [[west, south], [east, north]] = homeView(size, padding, 256 * 2 ** minZoom)
      onLimits({
        minZoom,
        bounds: [
          [south, west],
          [north, east],
        ],
      })
    }
    measure()
    map.on('resize', measure)
    return () => {
      map.off('resize', measure)
    }
  }, [map, inset, edges, onLimits])
  useEffect(() => {
    if (!limits?.bounds) return
    map.setMinZoom(limits.minZoom)
    map.setMaxBounds(limits.bounds)
  }, [map, limits])
  return null
}

/** Leaflet measures its box once: it's told when the box changes size (the layout, or the map shown again). */
function FollowSize() {
  const map = useMap()
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map])
  return null
}

/** The page scrolls past the map: the wheel zooms only once the map is clicked into or focused. */
function WheelZoomOnFocus() {
  const map = useMap()
  useEffect(() => {
    const element = map.getContainer()
    const enable = () => map.scrollWheelZoom.enable()
    const disable = () => map.scrollWheelZoom.disable()
    map.on('click', enable)
    element.addEventListener('focus', enable)
    element.addEventListener('blur', disable)
    return () => {
      map.off('click', enable)
      element.removeEventListener('focus', enable)
      element.removeEventListener('blur', disable)
    }
  }, [map])
  return null
}

/** The centers' pins, clustered, each with its popup. The selected one is larger and opens its popup. */
function Pins({
  points,
  selectedId,
  focus,
  inset,
  route,
  recommended,
  onPick,
  onCopied,
  ...popup
}: CenterMapProps & { points: Center[]; inset: number; onCopied: (status: string) => void }) {
  const en = useCopy()
  const copy = en.training.map

  const group = useRef<L.MarkerClusterGroup>(null)
  const markers = useRef(new Map<string, L.Marker>())
  const map = useMap()
  const starred = useMemo(() => new Set(recommended), [recommended])

  // Open the selected center's popup, zooming in far enough to show its pin, unless a route has the view.
  useEffect(() => {
    if (!selectedId) {
      map.closePopup()
      return
    }
    const marker = markers.current.get(selectedId)
    if (!marker || route) return
    const open = () => marker.openPopup()
    // A recommended pin stands outside the clusters, so there's no cluster to open first.
    if (group.current?.hasLayer(marker)) group.current.zoomToShowLayer(marker, open)
    else open()
  }, [selectedId, focus, route, map])

  const pin = (center: Center) => {
    const selected = center.id === selectedId
    const isRecommended = starred.has(center.id)
    const label = copy.pin(center.name, en.training.kinds[center.kind])
    return (
      <Marker
        key={center.id}
        position={[center.latitude as number, center.longitude as number]}
        icon={pinIcon(center.kind, selected, isRecommended)}
        // A div pin is named by its title (Leaflet gives alt text to image icons only).
        title={isRecommended ? en.explore.outlook.pin(label) : label}
        zIndexOffset={selected ? 1000 : isRecommended ? 500 : 0}
        ref={(marker) => {
          if (marker) markers.current.set(center.id, marker)
          else markers.current.delete(center.id)
        }}
        eventHandlers={{ click: () => onPick(center.id) }}
      >
        <Popup
          maxWidth={380}
          minWidth={250}
          autoPanPadding={[24, 24]}
          autoPanPaddingTopLeft={[inset + 24, 24]}
        >
          <CenterPopup center={center} {...popup} onCopied={onCopied} />
        </Popup>
      </Marker>
    )
  }

  return (
    <>
      <ClusterGroup ref={group}>
        {points.filter((center) => !starred.has(center.id)).map(pin)}
      </ClusterGroup>
      {/* Recommended centers are never folded into a cluster: their stars show at every zoom. */}
      {points.filter((center) => starred.has(center.id)).map(pin)}
    </>
  )
}

/** The learner's approximate location, or the place they searched for, beneath the pins. */
function ReferenceDot({ reference }: { reference: Reference | null }) {
  const en = useCopy()
  const copy = en.training.map

  if (!reference) return null
  return (
    <Marker
      position={[reference.latitude, reference.longitude]}
      icon={L.divIcon({
        className: '',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
        html: `<div class="${cx(
          'box-border size-4.5 rounded-full border-3 border-white',
          reference.mine
            ? 'bg-[#175cd3] shadow-[0_0_0_7px_#175cd333,0_1px_4px_rgb(var(--track-shadow-rgb)/0.4)]'
            : 'bg-step-current shadow-[0_0_0_7px_rgb(var(--track-shadow-rgb)/0.13),0_1px_4px_rgb(var(--track-shadow-rgb)/0.4)]',
        )}"></div>`,
      })}
      keyboard={false}
      zIndexOffset={-1000}
    >
      <Tooltip direction="top" offset={[0, -8]}>
        {reference.mine ? copy.yourLocation : reference.label}
      </Tooltip>
    </Marker>
  )
}

/**
 * Locate: each press brings the learner's own location to the middle of the map's clear part, close in, at once
 * when it's already known, or as soon as the browser answers. (Framing moves the map only when the location
 * changes, so pressing again after panning away would otherwise do nothing.) A refusal ends the request.
 */
function GoToMine({
  ask,
  reference,
  locating,
  inset,
}: {
  ask: number
  reference: Reference | null
  locating: boolean
  inset: number
}) {
  const map = useMap()
  const answered = useRef(0)
  useEffect(() => {
    if (!ask || answered.current === ask) return
    if (reference?.mine) {
      answered.current = ask
      const target = L.latLng(reference.latitude, reference.longitude)
      // Left of the target by half the panel's reach, so the target sits in the middle of what the panel leaves.
      const middle = map.project(target, LOCATE_ZOOM).subtract([inset / 2, 0])
      map.setView(map.unproject(middle, LOCATE_ZOOM), LOCATE_ZOOM)
      return
    }
    if (!locating) answered.current = ask
  }, [ask, reference, locating, inset, map])
  return null
}

/**
 * Fits the map to the results when they change: the whole country without any, or a searched place with its
 * closest centers rather than the whole country. An active radius frames its circle, even without results.
 * A drawn route keeps the view on itself.
 */
function Framing({
  points,
  reference,
  radiusKm,
  hasRoute,
  inset,
}: {
  points: Center[]
  reference: Reference | null
  radiusKm?: number | null
  hasRoute: boolean
  inset: number
}) {
  const map = useMap()
  const circle = useRef<L.Circle>(null)
  const radius = reference && radiusKm && radiusKm > 0 ? radiusKm : null
  const key = JSON.stringify([
    points.map((center) => center.id),
    reference && [reference.latitude, reference.longitude],
    radius,
  ])
  const last = useRef<{ key: string; inset: number } | null>(null)
  // The learner moved the map themselves: it won't reframe itself over their view, unless the results change.
  const moved = useRef(false)
  useEffect(() => {
    const element = map.getContainer()
    const mark = () => {
      moved.current = true
    }
    element.addEventListener('pointerdown', mark)
    element.addEventListener('wheel', mark, { passive: true })
    element.addEventListener('keydown', mark)
    return () => {
      element.removeEventListener('pointerdown', mark)
      element.removeEventListener('wheel', mark)
      element.removeEventListener('keydown', mark)
    }
  }, [map])
  useEffect(() => {
    if (hasRoute) return
    // The panel's reach counts too: the map is framed again once it's known, or when the layout changes it.
    const previous = last.current
    const changed = previous?.key !== key
    if (!changed && (previous?.inset === inset || moved.current)) return
    last.current = { key, inset }
    if (changed) moved.current = false
    const padding = (size: number) => ({
      paddingTopLeft: [inset + size, size] as L.PointTuple,
      paddingBottomRight: [size, size] as L.PointTuple,
    })
    // The mounted circle supplies bounds even when no centers fall within the search radius.
    if (radius && circle.current) {
      map.fitBounds(circle.current.getBounds(), { ...padding(32), maxZoom: 13 })
      return
    }
    if (!points.length) {
      if (reference) map.setView([reference.latitude, reference.longitude], 9)
      else map.fitBounds(PHILIPPINES, padding(0))
      return
    }
    let corners: L.LatLngTuple[] = points.map((center) => [
      center.latitude as number,
      center.longitude as number,
    ])
    if (reference) {
      const nearest = points
        .filter((center) => center.distanceKm !== null)
        .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
        .slice(0, 6)
      corners = [
        [reference.latitude, reference.longitude],
        ...nearest.map((center): L.LatLngTuple => [
          center.latitude as number,
          center.longitude as number,
        ]),
      ]
    }
    map.fitBounds(L.latLngBounds(corners), { ...padding(48), maxZoom: 13 })
  }, [key, hasRoute, inset, map, points, reference, radius])
  return radius && reference ? (
    <Circle
      ref={circle}
      className="center-map-radius"
      center={[reference.latitude, reference.longitude]}
      radius={radius * 1000}
      interactive={false}
      pathOptions={{ color: COLORS.training, weight: 2, fillOpacity: 0.08, opacity: 0.65 }}
    />
  ) : null
}

/**
 * The routes to the selected center, one per travel mode, from the same request as the list's travel modes. The
 * chosen one is on top; each label picks its mode. Dotted where there's no road: from the approximate location to
 * the nearest road, and from the last road on.
 */
function RouteLayer({
  route,
  travelMode,
  onTravelMode,
  inset,
}: {
  route: MapRoute
  travelMode: TravelMode
  onTravelMode: (mode: TravelMode) => void
  inset: number
}) {
  const en = useCopy()
  const copy = en.training.map

  const map = useMap()
  const directions = useQuery(directionsQuery(route.from, route.to))
  const options = directions.data?.routes ?? []
  const selected = options.some((option) => option.mode === travelMode)
    ? travelMode
    : options[0]?.mode
  // The chosen route draws itself out to the center, once per route and mode; the others and the labels follow.
  const drawn = useRouteDraw(
    selected
      ? `${route.from.latitude},${route.from.longitude}>${route.to.latitude},${route.to.longitude}:${selected}`
      : null,
  )

  const hasRoutes = options.length > 0
  // The routing service asks to be credited, with a way to report mistakes in the map it routes on.
  useEffect(() => {
    if (!hasRoutes) return
    map.attributionControl.addAttribution(ROUTE_CREDIT)
    return () => {
      map.attributionControl.removeAttribution(ROUTE_CREDIT)
    }
  }, [hasRoutes, map])

  // Fitted once per set of routes; choosing a mode restyles them without moving the map.
  const fitted = useRef<unknown>(null)
  useEffect(() => {
    const data = directions.data
    if (!data?.routes.length || fitted.current === data) return
    fitted.current = data
    map.closePopup()
    const corners: L.LatLngTuple[] = [
      [route.from.latitude, route.from.longitude],
      [route.to.latitude, route.to.longitude],
      ...data.routes.flatMap((option) => option.path as L.LatLngTuple[]),
    ]
    map.fitBounds(L.latLngBounds(corners), {
      paddingTopLeft: [inset + 56, 56],
      paddingBottomRight: [56, 56],
      maxZoom: 16,
    })
  }, [directions.data, map, route, inset])

  if (!options.length) return null
  // The chosen route last, so it's drawn on top.
  const ordered = [...options].sort(
    (a, b) => Number(a.mode === selected) - Number(b.mode === selected),
  )
  const origin: L.LatLngTuple = [route.from.latitude, route.from.longitude]
  const destination: L.LatLngTuple = [route.to.latitude, route.to.longitude]
  const drawing = options.find((option) => option.mode === selected)
  if (drawing && drawn < 1) {
    // While it draws: the chosen line only, from the learner's dotted start, with a dot at its leading end.
    const path = partialPath(drawing.path, drawn) as L.LatLngTuple[]
    return (
      <>
        <Polyline
          positions={[origin, drawing.start as L.LatLngTuple]}
          interactive={false}
          pathOptions={{
            color: COLORS.training,
            weight: 3,
            dashArray: '1 7',
            lineCap: 'round',
            opacity: 0.8,
          }}
        />
        <Polyline
          positions={path}
          interactive={false}
          pathOptions={{ color: '#fff', lineJoin: 'round', weight: 10, opacity: 0.95 }}
        />
        <Polyline
          positions={path}
          interactive={false}
          pathOptions={{
            color: COLORS.training,
            lineJoin: 'round',
            weight: 6,
            opacity: 0.95,
            dashArray: drawing.mode === 'plane' ? '10 9' : undefined,
          }}
        />
        <CircleMarker
          center={path[path.length - 1]}
          radius={7}
          interactive={false}
          pathOptions={{ color: '#fff', weight: 3, fillColor: COLORS.training, fillOpacity: 1 }}
        />
      </>
    )
  }
  return (
    <>
      {ordered.map((option) => {
        const chosen = option.mode === selected
        const path = option.path as L.LatLngTuple[]
        const at = path[Math.floor((path.length - 1) * (LABEL_AT[option.mode] ?? 0.5))]
        return (
          <Fragment key={option.mode}>
            {[
              [origin, option.start as L.LatLngTuple],
              [option.end as L.LatLngTuple, destination],
            ].map((points, i) => (
              <Polyline
                key={i}
                positions={points}
                interactive={false}
                pathOptions={{
                  color: COLORS.training,
                  weight: 3,
                  dashArray: '1 7',
                  lineCap: 'round',
                  opacity: chosen ? 0.8 : 0,
                }}
              />
            ))}
            <Polyline
              positions={path}
              pathOptions={{
                color: '#fff',
                lineJoin: 'round',
                weight: chosen ? 10 : 7,
                opacity: chosen ? 0.95 : 0.85,
              }}
              eventHandlers={{ click: () => onTravelMode(option.mode) }}
            />
            <Polyline
              positions={path}
              pathOptions={{
                color: chosen ? COLORS.training : '#8db2ee',
                lineJoin: 'round',
                weight: chosen ? 6 : 4,
                opacity: chosen ? 0.95 : 0.9,
                // A flight is an estimate between airports, not a road: dashed, as flight paths are drawn.
                dashArray: option.mode === 'plane' ? '10 9' : undefined,
              }}
              eventHandlers={{ click: () => onTravelMode(option.mode) }}
            >
              {/* The label rides on its line (a tooltip needs a layer), at its own point along it. */}
              <Tooltip
                position={at}
                permanent
                interactive
                direction="center"
                className="center-map-route-tooltip"
                opacity={1}
              >
                {/* A route's label: picks its travel mode. */}
                <button
                  type="button"
                  className={cx(
                    'inline-flex cursor-pointer items-center gap-2 rounded-10 border px-3 py-[7px] whitespace-nowrap hovered:border-blue',
                    chosen
                      ? 'border-fill bg-fill text-13 font-[650] text-white shadow-[0_4px_12px_#175cd355]'
                      : 'border-border bg-surface text-[12.5px] font-semibold text-navy shadow-[0_3px_10px_rgb(var(--track-shadow-rgb)/0.15)]',
                  )}
                  aria-pressed={chosen}
                  aria-label={copy.routeLabel(
                    `${routeLabel(option)} ${en.training.routes.modes[option.mode]}`,
                  )}
                  onClick={() => onTravelMode(option.mode)}
                >
                  <Icon name={MODE_ICONS[option.mode]} size={16} />
                  {routeLabel(option)}
                </button>
              </Tooltip>
            </Polyline>
          </Fragment>
        )
      })}
      {/* The center's own pin can be folded into a cluster at this zoom; this copy always marks the end. */}
      <Marker
        position={destination}
        icon={pinIcon(route.kind, true)}
        interactive={false}
        keyboard={false}
        zIndexOffset={2000}
      />
    </>
  )
}
