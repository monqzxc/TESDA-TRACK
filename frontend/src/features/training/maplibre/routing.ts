import type { Feature, FeatureCollection, LineString, Position } from 'geojson'
import type { TravelMode, TravelRoute } from '../api.ts'
import type { Point } from '../centers.ts'
import type { MapRoute } from '../CenterMapTypes.ts'

// The selected center's routes as map data: one line per travel mode, the chosen one marked, and dotted links where
// there's no road (from the approximate location to the nearest road, and from the last road to the center). The API
// gives points as [latitude, longitude]; map data is [longitude, latitude].

export interface RouteProperties {
  mode: TravelMode
  chosen: boolean
  /** A flight is an estimate between airports, not a road: drawn dashed, as flight paths are. */
  plane: boolean
  /** A dotted link where there's no road, drawn for the chosen route only. */
  connector: boolean
}

/** Where along its path each mode's label sits, so labels on shared roads don't cover each other. */
export const LABEL_AT: Record<TravelMode, number> = { car: 0.5, bike: 0.3, foot: 0.7, plane: 0.65 }

const lngLat = ([latitude, longitude]: number[]): Position => [longitude, latitude]
const fromPoint = ({ latitude, longitude }: Point): Position => [longitude, latitude]

/** The mode shown: the one chosen, when the router found it, else the first it found. */
export function chosenMode(
  options: readonly TravelRoute[],
  travelMode: TravelMode,
): TravelMode | undefined {
  return options.some((option) => option.mode === travelMode) ? travelMode : options[0]?.mode
}

export function routeFeatures(
  route: MapRoute,
  options: readonly TravelRoute[],
  chosen: TravelMode | undefined,
): FeatureCollection<LineString, RouteProperties> {
  const features: Feature<LineString, RouteProperties>[] = []
  for (const option of options) {
    const properties = {
      mode: option.mode,
      chosen: option.mode === chosen,
      plane: option.mode === 'plane',
    }
    features.push({
      type: 'Feature',
      properties: { ...properties, connector: false },
      geometry: { type: 'LineString', coordinates: option.path.map(lngLat) },
    })
    if (option.mode !== chosen) continue
    for (const [from, to] of [
      [fromPoint(route.from), lngLat(option.start)],
      [lngLat(option.end), fromPoint(route.to)],
    ]) {
      features.push({
        type: 'Feature',
        properties: { ...properties, connector: true },
        geometry: { type: 'LineString', coordinates: [from, to] },
      })
    }
  }
  return { type: 'FeatureCollection', features }
}

/** Each route's label point: partway along its path (LABEL_AT). */
export function routeLabels(
  options: readonly TravelRoute[],
): { mode: TravelMode; lngLat: [number, number] }[] {
  return options.flatMap((option) => {
    const path = option.path
    if (!path.length) return []
    const at = path[Math.floor((path.length - 1) * (LABEL_AT[option.mode] ?? 0.5))]
    return [{ mode: option.mode, lngLat: lngLat(at) as [number, number] }]
  })
}

/** Every point the routes reach, for framing them. */
export function routeCorners(route: MapRoute, options: readonly TravelRoute[]): Position[] {
  return [
    fromPoint(route.from),
    fromPoint(route.to),
    ...options.flatMap((option) => option.path.map(lngLat)),
  ]
}
