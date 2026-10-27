import 'leaflet/dist/leaflet.css'
// After leaflet.css, which it styles over.
import './center-map.css'
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
import centerPhoto from '../../components/img/center-thumb.jpg'
import { useCopy } from '../../i18n/copy.ts'
import { readItem, writeItem } from '../../lib/storage.ts'
import { cx } from '../../lib/style.ts'
import type { CenterKind } from './address.ts'
import { directionsQuery, type TravelMode } from './api.ts'
import { placeLabel, summary, type Center, type Point } from './centers.ts'
import { MODE_ICONS, googleMapsDirections } from './CenterDetail.tsx'
import { kilometres, routeLabel } from './format.ts'
import type { Reference } from './useCenters.ts'

// The center map (classic/training_view.py _CENTER_MAP, ported from its Leaflet code): clustered pins with popups,
// the learner's location or searched place, routes for each travel mode, a choice of map layers, and night tiles in
// dark. It's an extra: the list beside it has everything (US-08). Loaded only on this page, in its own chunk.

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
/** The map layer chosen, kept for this browser (the plan's small preferences). */
const BASEMAP_KEY = 'tesda-track.basemap'

// The map's own controls float over it. Leaflet's parts are styled in center-map.css.
const floating = 'shadow-[0_4px_14px_rgb(var(--track-shadow-rgb)/0.12)]'
const KIND_DOTS: Record<CenterKind, string> = {
  training: 'bg-[#175cd3]',
  assessment: 'bg-[#0d9488]',
}
// A pin's glow when it's selected, in its type's color.
const SELECTED_GLOWS: Record<CenterKind, string> = {
  training: 'drop-shadow-[0_0_7px_#175cd3aa]',
  assessment: 'drop-shadow-[0_0_7px_#0d9488aa]',
}
const POPUP_CHIPS: Record<CenterKind, string> = {
  training: 'border-tint bg-tint text-blue',
  assessment: 'border-good-bg bg-good-bg text-good-ink',
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

/** A center's pin in its type's color, larger when selected. Made once each and reused. */
function pinIcon(kind: CenterKind, selected: boolean): L.DivIcon {
  const key = `${kind}-${selected}`
  let icon = pinIcons.get(key)
  if (!icon) {
    icon = makePinIcon(kind, selected)
    pinIcons.set(key, icon)
  }
  return icon
}

/** Pins, clusters and the reference dot are Leaflet div icons: markup given to Leaflet, classes and all. */
function makePinIcon(kind: CenterKind, selected: boolean): L.DivIcon {
  const pin = cx(
    'h-11 w-[34px] origin-bottom transition-transform duration-150 ease-[ease]',
    selected
      ? cx('scale-130', SELECTED_GLOWS[kind])
      : 'drop-shadow-[0_3px_3px_rgb(var(--track-shadow-rgb)/0.27)]',
  )
  return L.divIcon({
    className: '',
    html: `<div class="${pin}" data-kind="${kind}"><svg class="block size-full" viewBox="0 0 34 44" aria-hidden="true"><path d="M17 1.5C8.4 1.5 1.5 8.3 1.5 16.9 1.5 28.4 17 42.5 17 42.5s15.5-14.1 15.5-25.6C32.5 8.3 25.6 1.5 17 1.5Z" fill="${COLORS[kind]}" stroke="#fff" stroke-width="2"/><g transform="translate(5 4.5)" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[kind]}</g></svg></div>`,
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

export interface MapRoute {
  from: Point
  to: Point
  kind: CenterKind
}

export interface CenterMapProps {
  centers: readonly Center[]
  selectedId: string | null
  /** Bumped by View on map, so asking again reopens a center that's already selected. */
  focus: number
  reference: Reference | null
  /** Search radius around the shared location or searched place, in kilometres. */
  radiusKm?: number | null
  /** The selected center's routes, from the learner's location. */
  route: MapRoute | null
  travelMode: TravelMode
  onTravelMode: (mode: TravelMode) => void
  /** Directions can be drawn here (routing is on, and the learner shared their location). */
  canRoute: boolean
  saved: readonly string[]
  cartoKey: string
  today: string
  locating: boolean
  onPick: (centerId: string) => void
  onDetails: (centerId: string) => void
  onRoute: (centerId: string) => void
  onToggleSaved: (centerId: string) => void
  onLocate: () => void
}

export default function CenterMap(props: CenterMapProps) {
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
  // How far the filter panel reaches over the map's left edge (0 when it doesn't): framing and popups keep clear.
  const [inset, setInset] = useState(0)

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

  const points = centers.filter((center) => center.latitude !== null && center.longitude !== null)
  const statusText = typeof status === 'string' ? copy[status] : status?.message
  const shownStatus = locating
    ? en.training.filters.locating
    : !points.length
      ? copy.none
      : statusText

  return (
    // A page holding the map elsewhere, as Skills Explorer does, can set its height (--center-map-height).
    <div
      ref={shell}
      className="center-map relative isolate h-[var(--center-map-height,680px)] overflow-hidden rounded-18 border border-border bg-map-water shadow-[0_6px_24px_rgb(var(--track-shadow-rgb)/0.05)] max-sm:h-[min(var(--center-map-height,460px),460px)]"
      data-soft={basemap.soft || undefined}
      role="region"
      aria-label={copy.label}
    >
      <MapContainer
        className="absolute inset-0 bg-map-water"
        bounds={PHILIPPINES}
        zoomSnap={0.5}
        scrollWheelZoom={false}
        zoomControl={false}
        attributionControl
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
        <WheelZoomOnFocus />
        <Pins
          {...props}
          points={points}
          inset={inset}
          onCopied={(message) => setStatus({ message })}
        />
        <ReferenceDot reference={props.reference} />
        {props.route && (
          <RouteLayer
            route={props.route}
            travelMode={props.travelMode}
            onTravelMode={props.onTravelMode}
            inset={inset}
          />
        )}
        <Framing
          points={points}
          reference={props.reference}
          radiusKm={props.radiusKm}
          hasRoute={props.route !== null}
          inset={inset}
        />
      </MapContainer>

      {shownStatus && (
        <p
          className="pointer-events-none absolute top-3.5 right-[70px] left-[calc(var(--map-overlay-inset,0px)_+_14px)] z-800 m-0 rounded-12 bg-glass px-3.5 py-2.5 text-13 text-muted shadow-[0_2px_10px_rgb(var(--track-shadow-rgb)/0.08)]"
          role="status"
        >
          {shownStatus}
        </p>
      )}
      <Button
        className={cx(
          'absolute top-3.5 right-3.5 z-800 grid size-10.5 cursor-pointer place-items-center rounded-12 border-0 bg-surface text-navy data-hovered:bg-soft',
          floating,
        )}
        aria-label={copy.locate}
        onPress={props.onLocate}
      >
        <Icon name="locate" size={20} />
      </Button>
      <MenuTrigger>
        <Button
          className={cx(
            'absolute right-3.5 bottom-7 z-800 inline-flex h-11 cursor-pointer items-center gap-[9px] rounded-12 border-0 bg-surface px-[18px] text-[13.5px] font-semibold text-navy data-hovered:bg-row-hover max-sm:px-3',
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
        className="absolute bottom-3.5 left-[calc(var(--map-overlay-inset,0px)_+_4px)] z-800 flex flex-wrap gap-[22px] rounded-14 bg-surface px-[18px] py-[11px] text-[12.5px] text-navy shadow-[0_4px_14px_rgb(var(--track-shadow-rgb)/0.1)] max-sm:gap-3 max-sm:px-3 max-sm:py-[9px] max-sm:text-[11.5px]"
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
  )
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
  onPick,
  onCopied,
  ...popup
}: CenterMapProps & { points: Center[]; inset: number; onCopied: (status: string) => void }) {
  const en = useCopy()
  const copy = en.training.map

  const group = useRef<L.MarkerClusterGroup>(null)
  const markers = useRef(new Map<string, L.Marker>())
  const map = useMap()

  // Open the selected center's popup, zooming in far enough to show its pin, unless a route has the view.
  useEffect(() => {
    if (!selectedId) {
      map.closePopup()
      return
    }
    const marker = markers.current.get(selectedId)
    if (!marker || route) return
    const open = () => marker.openPopup()
    if (group.current) group.current.zoomToShowLayer(marker, open)
    else open()
  }, [selectedId, focus, route, map])

  return (
    <ClusterGroup ref={group}>
      {points.map((center) => {
        const selected = center.id === selectedId
        return (
          <Marker
            key={center.id}
            position={[center.latitude as number, center.longitude as number]}
            icon={pinIcon(center.kind, selected)}
            // A div pin is named by its title (Leaflet gives alt text to image icons only).
            title={copy.pin(center.name, en.training.kinds[center.kind])}
            zIndexOffset={selected ? 1000 : 0}
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
      })}
    </ClusterGroup>
  )
}

/** A pin's popup: the center, how far it is, how to reach it, and its buttons. Text is rendered as text. */
function CenterPopup({
  center,
  canRoute,
  saved,
  today,
  onDetails,
  onRoute,
  onToggleSaved,
  onCopied,
}: Pick<
  CenterMapProps,
  'canRoute' | 'saved' | 'today' | 'onDetails' | 'onRoute' | 'onToggleSaved'
> & { center: Center; onCopied: (status: string) => void }) {
  const en = useCopy()
  const copy = en.training.map

  const point = { latitude: center.latitude as number, longitude: center.longitude as number }
  const isSaved = saved.includes(center.id)
  const copyLink = () => {
    const url = `https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`
    // The clipboard needs a secure page; elsewhere the link is shown instead.
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(
        () => onCopied(copy.copied),
        () => onCopied(copy.copyFailed(url)),
      )
    } else {
      onCopied(copy.copyFailed(url))
    }
  }
  const chip =
    'inline-flex items-center gap-[5px] rounded-8 border px-2 py-1 text-[11.5px] font-semibold'
  const contact = 'inline-flex items-center gap-1.5 no-underline'
  const iconButton = (active = false) =>
    cx(
      'box-border grid h-10.5 flex-[0_0_42px] cursor-pointer place-items-center rounded-10 border text-blue hovered:bg-soft',
      active ? 'border-hover-border bg-tint [&_svg_path]:fill-current' : 'border-border bg-surface',
    )
  // Leaflet's popup takes away its paragraphs' margins (center-map.css): those set here need !.
  return (
    <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-x-3.5 gap-y-3 text-12 text-muted max-sm:grid-cols-[56px_minmax(0,1fr)]">
      <img
        className="h-20 w-19 rounded-10 object-cover max-sm:h-15 max-sm:w-14"
        src={centerPhoto}
        alt=""
      />
      <div className="min-w-0 pr-[18px]">
        <p className="text-15 leading-[1.3] font-bold wrap-anywhere text-navy">{center.name}</p>
        <p className="mt-1! flex items-center gap-1.5 text-[12.5px]">
          <Icon name="pin" />
          {placeLabel(center)}
        </p>
        <p className="mt-2.5! flex flex-wrap gap-1.5">
          <span className={cx(chip, POPUP_CHIPS[center.kind])} data-kind={center.kind}>
            <Icon name={center.kind === 'training' ? 'learn' : 'clipboard'} />
            {en.training.kinds[center.kind]}
          </span>
          {center.distanceKm !== null && (
            <span className={cx(chip, 'border-border bg-surface text-navy')}>
              <Icon name="distance" />
              {en.training.center.away(kilometres(center.distanceKm))}
            </span>
          )}
        </p>
      </div>
      <p className="col-span-full">{center.address || summary(center, today)}</p>
      {(center.phone || center.email) && (
        // Its links are blue, as every link on the map is (center-map.css).
        <p className="col-span-full flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {center.phone && (
            <a className={contact} href={`tel:${center.phone.replace(/[^+\d]/g, '')}`}>
              <Icon name="phone" />
              {center.phone}
            </a>
          )}
          {center.email && (
            <a className={contact} href={`mailto:${center.email}`}>
              <Icon name="mail" />
              {center.email}
            </a>
          )}
        </p>
      )}
      <div className="col-span-full flex items-center gap-2.5 pt-0.5">
        <button
          type="button"
          className="inline-flex h-10.5 flex-[1_1_auto] cursor-pointer items-center justify-center gap-2 rounded-10 border-0 bg-fill px-4 text-14 font-[650] text-white hovered:bg-fill-hover"
          onClick={() => onDetails(center.id)}
        >
          {en.training.results.viewDetails}
          <Icon name="arrowRight" />
        </button>
        {canRoute ? (
          <button
            type="button"
            className={iconButton()}
            aria-label={en.training.center.directions}
            title={en.training.center.directions}
            onClick={() => onRoute(center.id)}
          >
            <Icon name="directions" size={18} />
          </button>
        ) : (
          <a
            className={iconButton()}
            href={googleMapsDirections(point)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={en.training.center.googleMapsHelp}
            title={en.training.center.googleMapsHelp}
          >
            <Icon name="directions" size={18} />
          </a>
        )}
        <button
          type="button"
          className={iconButton(isSaved)}
          aria-label={en.training.center.save}
          aria-pressed={isSaved}
          title={isSaved ? en.training.center.saved : en.training.center.save}
          onClick={() => onToggleSaved(center.id)}
        >
          <Icon name="bookmark" size={18} />
        </button>
        <button
          type="button"
          className={iconButton()}
          aria-label={copy.copy}
          title={copy.copy}
          onClick={copyLink}
        >
          <Icon name="link" size={18} />
        </button>
      </div>
    </div>
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
  // The panel's reach counts too: the map is framed again once it's known, or when the layout changes it.
  const key = JSON.stringify([
    points.map((center) => center.id),
    reference && [reference.latitude, reference.longitude],
    radius,
    inset,
  ])
  const last = useRef<string | null>(null)
  useEffect(() => {
    if (last.current === key || hasRoute) return
    last.current = key
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
