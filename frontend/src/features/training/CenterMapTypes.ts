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
  /** Regional posting totals joined to boundary polygons by region code. */
  demandAreas?: readonly DemandMapArea[]
  demandRegion?: string | null
  /** Frame every region rather than the selected one: a learner open to relocating compares them all. */
  demandOverview?: boolean
  demandSnapshotDates?: readonly string[]
  onDemandArea?: (regionCode: string) => void
  /** Centers recommended to the learner: starred, and never folded into a cluster. */
  recommended?: readonly string[]
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

/** How a region's share of a qualification's posting records compares with its share of the centers listing it. */
export type DemandBalance =
  'more_demand' | 'balanced' | 'more_supply' | 'demand_only' | 'supply_only' | 'no_records'

export interface DemandMapArea extends Point {
  region_code: string
  name: string
  /** Zero is drawn as a region without records. */
  posting_count: number
  titles: string[]
  /** With one qualification in focus: the recorded centers listing it here, and how that compares with demand. */
  centers?: number
  balance?: DemandBalance
}

/** How close the Locate button goes in on the learner's own location: their neighbourhood's streets. */
export const LOCATE_ZOOM = 14

/** The map layer chosen, kept for this browser (the plan's small preferences). Both renderers read it. */
export const BASEMAP_KEY = 'tesda-track.basemap'
