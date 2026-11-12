import type { CenterKind } from './address.ts'
import type { TravelMode } from './api.ts'
import type { Center, Point } from './centers.ts'
import type { Reference } from './useCenters.ts'

// What every center map renderer is given: CenterMap.tsx picks MapLibre or Leaflet, and both take the same props and
// call back the same way, so the pages holding the map don't know which one drew it.

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
  /** Say "Finding your location" over the map while locating. Off where the page says it itself. Default on. */
  locatingNotice?: boolean
  onPick: (centerId: string) => void
  onDetails: (centerId: string) => void
  onRoute: (centerId: string) => void
  onToggleSaved: (centerId: string) => void
  onLocate: () => void
}

/** How close the Locate button goes in on the learner's own location: their neighbourhood's streets. */
export const LOCATE_ZOOM = 14

/** The map layer chosen, kept for this browser (the plan's small preferences). Both renderers read it. */
export const BASEMAP_KEY = 'tesda-track.basemap'
