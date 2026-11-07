import type {
  ExpressionSpecification,
  LayerSpecification,
  SourceSpecification,
  StyleSpecification,
} from '@maplibre/maplibre-gl-style-spec'
import type { Feature, FeatureCollection, LineString, Point, Polygon, Position } from 'geojson'
import type { CenterKind } from '../address.ts'
import type { Center } from '../centers.ts'
import type { Reference } from '../useCenters.ts'
import { PIN_TIP_BELOW, SELECTED_TIP_BELOW } from './markers.ts'
import type { RouteProperties } from './routing.ts'
import { FIRST_LABEL_LAYER, type Theme } from './styles.ts'

// The centers and what's drawn around them, as map data over the base map: clustered pins, the selected pin, the
// learner's location or searched place, the search radius, and routes. Pins and clusters are drawn by MapLibre from
// one GeoJSON source, so hundreds of centers cost no DOM elements; markers.ts draws their images.

export const SOURCES = {
  centers: 'centers',
  selected: 'center-selected',
  reference: 'center-reference',
  radius: 'center-radius',
  routes: 'center-routes',
} as const

export const LAYERS = {
  clusters: 'center-clusters',
  pins: 'center-pins',
  selected: 'center-selected-pins',
  referenceDot: 'center-reference-dot',
  radiusFill: 'center-radius-fill',
  /** The routes' lines, which pick their travel mode when clicked. */
  routeLines: [
    'center-route-other-line',
    'center-route-other-plane',
    'center-route-chosen-line',
    'center-route-chosen-plane',
  ],
} as const

/** Every route layer, shown only while there's a route. */
export const ROUTE_LAYERS = [
  'center-route-connector',
  'center-route-other-casing',
  'center-route-other-line',
  'center-route-other-plane',
  'center-route-chosen-casing',
  'center-route-chosen-line',
  'center-route-chosen-plane',
] as const

/** Centers closer than this many pixels are drawn as one cluster (Leaflet.markercluster's maxClusterRadius). */
export const CLUSTER_RADIUS = 46
/** The map's deepest zoom. Centers at the same spot stay a cluster even there; it opens as a list instead. */
export const MAX_ZOOM = 19

const BLUE = '#175cd3'
const PALE_BLUE = '#8db2ee'
const ROUTE_CREDIT =
  'Route by <a href="https://project-osrm.org/" target="_blank" rel="noopener noreferrer">OSRM</a> · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener noreferrer">Fix the map</a>'

export interface CenterProperties {
  id: string
  kind: CenterKind
}

export interface OverlayData {
  centers: FeatureCollection<Point, CenterProperties>
  selected: FeatureCollection<Point, CenterProperties>
  reference: FeatureCollection<Point, { mine: boolean }>
  radius: FeatureCollection<Polygon>
  routes: FeatureCollection<LineString, RouteProperties>
}

const collection = <G extends Point | Polygon | LineString, P>(
  features: Feature<G, P>[] = [],
): FeatureCollection<G, P> => ({ type: 'FeatureCollection', features })

export const EMPTY_OVERLAYS: OverlayData = {
  centers: collection(),
  selected: collection(),
  reference: collection(),
  radius: collection(),
  routes: collection(),
}

/** The mapped centers as points, leaving out those drawn as selected (so a cluster doesn't count them too). */
export function centerPoints(
  centers: readonly Center[],
  except: ReadonlySet<string> = new Set(),
): FeatureCollection<Point, CenterProperties> {
  return collection(
    centers.flatMap((center) =>
      center.latitude === null || center.longitude === null || except.has(center.id)
        ? []
        : [
            {
              type: 'Feature' as const,
              properties: { id: center.id, kind: center.kind },
              geometry: {
                type: 'Point' as const,
                coordinates: [center.longitude, center.latitude],
              },
            },
          ],
    ),
  )
}

export function referencePoint(reference: Reference | null): OverlayData['reference'] {
  if (!reference) return collection()
  return collection([
    {
      type: 'Feature',
      properties: { mine: reference.mine },
      geometry: { type: 'Point', coordinates: [reference.longitude, reference.latitude] },
    },
  ])
}

const EARTH_RADIUS_KM = 6371.0088

/** The points `km` away from a center on the ground, all around it: a circle that stays round on the map. */
export function circleRing(
  center: { latitude: number; longitude: number },
  km: number,
  steps = 96,
): Position[] {
  const radians = (degrees: number) => (degrees * Math.PI) / 180
  const degrees = (value: number) => (value * 180) / Math.PI
  const lat = radians(center.latitude)
  const lon = radians(center.longitude)
  const angular = km / EARTH_RADIUS_KM
  const ring: Position[] = []
  for (let i = 0; i < steps; i++) {
    const bearing = (2 * Math.PI * i) / steps
    const lat2 = Math.asin(
      Math.sin(lat) * Math.cos(angular) + Math.cos(lat) * Math.sin(angular) * Math.cos(bearing),
    )
    const lon2 =
      lon +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angular) * Math.cos(lat),
        Math.cos(angular) - Math.sin(lat) * Math.sin(lat2),
      )
    ring.push([degrees(lon2), degrees(lat2)])
  }
  ring.push(ring[0])
  return ring
}

export function radiusArea(reference: Reference | null, km: number | null): OverlayData['radius'] {
  if (!reference || !km || km <= 0) return collection()
  return collection([
    {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [circleRing(reference, km)] },
    },
  ])
}

export function overlaySources(data: OverlayData): Record<string, SourceSpecification> {
  return {
    [SOURCES.radius]: { type: 'geojson', data: data.radius },
    // The routing service asks to be credited, with a way to report mistakes in the map it routes on. The credit
    // shows while the route layers do.
    [SOURCES.routes]: { type: 'geojson', data: data.routes, attribution: ROUTE_CREDIT },
    [SOURCES.reference]: { type: 'geojson', data: data.reference },
    [SOURCES.centers]: {
      type: 'geojson',
      data: data.centers,
      cluster: true,
      clusterRadius: CLUSTER_RADIUS,
      clusterMaxZoom: MAX_ZOOM,
      maxzoom: MAX_ZOOM + 1,
    },
    [SOURCES.selected]: { type: 'geojson', data: data.selected, maxzoom: MAX_ZOOM + 1 },
  }
}

const isConnector: ExpressionSpecification = ['==', ['get', 'connector'], true]
const isChosen: ExpressionSpecification = ['==', ['get', 'chosen'], true]
const isPlane: ExpressionSpecification = ['==', ['get', 'plane'], true]

/** The upright pin images, which stand facing the viewer when the map is tilted. */
const UPRIGHT = {
  'icon-allow-overlap': true,
  'icon-ignore-placement': true,
  'icon-pitch-alignment': 'viewport',
  'icon-rotation-alignment': 'viewport',
} as const

function routeLayers(visible: boolean): LayerSpecification[] {
  const visibility = visible ? 'visible' : 'none'
  const line = (
    id: string,
    chosen: boolean,
    plane: boolean | null,
    color: string,
    width: number,
    opacity: number,
  ): LayerSpecification => ({
    id,
    type: 'line',
    source: SOURCES.routes,
    filter: [
      'all',
      ['!', isConnector],
      chosen ? isChosen : ['!', isChosen],
      ...(plane === null ? [] : [plane ? isPlane : ['!', isPlane]]),
    ] as ExpressionSpecification,
    layout: { 'line-join': 'round', 'line-cap': 'round', visibility },
    paint: {
      'line-color': color,
      'line-width': width,
      'line-opacity': opacity,
      ...(plane ? { 'line-dasharray': [10 / width, 9 / width] } : {}),
    },
  })
  return [
    {
      id: 'center-route-connector',
      type: 'line',
      source: SOURCES.routes,
      filter: ['all', isConnector, isChosen],
      layout: { 'line-cap': 'round', visibility },
      paint: {
        'line-color': BLUE,
        'line-width': 3,
        'line-opacity': 0.8,
        'line-dasharray': [0.1, 2.4],
      },
    },
    // The chosen route last, so it's drawn on top.
    line('center-route-other-casing', false, null, '#ffffff', 7, 0.85),
    line('center-route-other-line', false, false, PALE_BLUE, 4, 0.9),
    line('center-route-other-plane', false, true, PALE_BLUE, 4, 0.9),
    line('center-route-chosen-casing', true, null, '#ffffff', 10, 0.95),
    line('center-route-chosen-line', true, false, BLUE, 6, 0.95),
    line('center-route-chosen-plane', true, true, BLUE, 6, 0.95),
  ]
}

/**
 * The overlays' layers: the radius and routes go under the base map's labels, the rest on top. `routes` hides the route
 * layers, and with them the router's credit, when there are none.
 */
export function overlayLayers(
  theme: Theme,
  routes: boolean,
): { under: LayerSpecification[]; over: LayerSpecification[] } {
  // The searched place's dot: the app's dark navy, or its blue at night (--track-current).
  const placeDot = theme === 'dark' ? '#2f6fe0' : '#102a56'
  return {
    under: [
      {
        id: LAYERS.radiusFill,
        type: 'fill',
        source: SOURCES.radius,
        paint: { 'fill-color': BLUE, 'fill-opacity': 0.08 },
      },
      {
        id: 'center-radius-line',
        type: 'line',
        source: SOURCES.radius,
        paint: { 'line-color': BLUE, 'line-width': 2, 'line-opacity': 0.65 },
      },
      ...routeLayers(routes),
    ],
    over: [
      {
        id: 'center-reference-halo',
        type: 'circle',
        source: SOURCES.reference,
        paint: {
          'circle-radius': 16,
          'circle-color': ['case', ['get', 'mine'], BLUE, '#102a56'],
          'circle-opacity': ['case', ['get', 'mine'], 0.2, 0.13],
          'circle-pitch-alignment': 'map',
        },
      },
      {
        id: LAYERS.referenceDot,
        type: 'circle',
        source: SOURCES.reference,
        paint: {
          'circle-radius': 7.5,
          'circle-color': ['case', ['get', 'mine'], BLUE, placeDot],
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
        },
      },
      {
        id: LAYERS.clusters,
        type: 'symbol',
        source: SOURCES.centers,
        filter: ['has', 'point_count'],
        layout: {
          ...UPRIGHT,
          'icon-image': ['concat', 'cluster-', ['to-string', ['get', 'point_count_abbreviated']]],
        },
      },
      {
        id: LAYERS.pins,
        type: 'symbol',
        source: SOURCES.centers,
        filter: ['!', ['has', 'point_count']],
        layout: {
          ...UPRIGHT,
          'icon-image': ['concat', 'pin-', ['get', 'kind']],
          'icon-anchor': 'bottom',
          'icon-offset': [0, PIN_TIP_BELOW],
        },
      },
      {
        id: LAYERS.selected,
        type: 'symbol',
        source: SOURCES.selected,
        layout: {
          ...UPRIGHT,
          'icon-image': ['concat', 'pin-', ['get', 'kind'], '-selected'],
          'icon-anchor': 'bottom',
          'icon-offset': [0, SELECTED_TIP_BELOW],
        },
      },
    ],
  }
}

/** The base map with the overlays added: the radius and routes under its labels, everything else on top. */
export function withOverlays(
  base: StyleSpecification,
  data: OverlayData,
  theme: Theme,
): StyleSpecification {
  const { under, over } = overlayLayers(theme, data.routes.features.length > 0)
  const labels = base.layers.findIndex((layer) => layer.id === FIRST_LABEL_LAYER)
  const at = labels === -1 ? base.layers.length : labels
  return {
    ...base,
    sources: { ...base.sources, ...overlaySources(data) },
    layers: [...base.layers.slice(0, at), ...under, ...base.layers.slice(at), ...over],
  }
}
