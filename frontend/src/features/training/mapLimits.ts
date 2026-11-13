import { PHILIPPINES, type Bounds, type Padding } from './maplibre/camera.ts'

// The map stays on the Philippines: it can't be zoomed out past the view that shows the whole country, nor moved
// outside that view. Both renderers ask here for that "home view", worked out in Web Mercator's own units (the world
// is 1 across), so Leaflet (256-pixel tiles) and MapLibre (512) can each turn it into their zoom.

export interface Size {
  width: number
  height: number
}

const NO_PADDING: Padding = { top: 0, right: 0, bottom: 0, left: 0 }

const mercatorX = (longitude: number) => (longitude + 180) / 360
const mercatorY = (latitude: number) =>
  (1 - Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360)) / Math.PI) / 2
const longitudeAt = (x: number) => x * 360 - 180
const latitudeAt = (y: number) => (Math.atan(Math.exp((1 - 2 * y) * Math.PI)) * 360) / Math.PI - 90

/** The part of the map clear of the panels floating over it, never narrower than a sliver. */
function clear(size: Size, padding: Padding) {
  return {
    width: Math.max(size.width - padding.left - padding.right, Math.min(size.width, 80)),
    height: Math.max(size.height - padding.top - padding.bottom, Math.min(size.height, 80)),
  }
}

/**
 * How many pixels across the whole world is when `bounds` just fits the clear part of the map: the map's smallest
 * scale. Leaflet's zoom is log2 of it over 256, MapLibre's over 512.
 */
export function homeWorldSize(
  size: Size,
  padding: Padding = NO_PADDING,
  bounds: Bounds = PHILIPPINES,
) {
  const [[west, south], [east, north]] = bounds
  const room = clear(size, padding)
  return Math.min(
    room.width / (mercatorX(east) - mercatorX(west)),
    room.height / (mercatorY(south) - mercatorY(north)),
  )
}

/**
 * What the map shows at that scale with `bounds` centred in its clear part: the home view, and the farthest the map
 * may be moved. Zoomed in, every part of the country can still be brought clear of the panels, since the view keeps
 * the room they take.
 */
export function homeView(
  size: Size,
  padding: Padding = NO_PADDING,
  worldSize = homeWorldSize(size, padding),
  bounds: Bounds = PHILIPPINES,
): Bounds {
  const [[west, south], [east, north]] = bounds
  const room = clear(size, padding)
  const centerX = (mercatorX(west) + mercatorX(east)) / 2
  const centerY = (mercatorY(north) + mercatorY(south)) / 2
  // The clear part's middle, measured from the map's top left, sits on the country's middle.
  const left = centerX - (padding.left + room.width / 2) / worldSize
  const top = centerY - (padding.top + room.height / 2) / worldSize
  const right = left + size.width / worldSize
  const bottom = top + size.height / worldSize
  return [
    [longitudeAt(left), latitudeAt(Math.min(bottom, 1))],
    [longitudeAt(right), latitudeAt(Math.max(top, 0))],
  ]
}

/** A zoom from a world size, for tiles `tileSize` pixels across. */
export const zoomFor = (worldSize: number, tileSize: number) => Math.log2(worldSize / tileSize)
