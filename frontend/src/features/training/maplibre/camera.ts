import type { Position } from 'geojson'
import type { Center, Point } from '../centers.ts'

// Where the camera goes, as plain functions (Leaflet's Framing in CenterMapLeaflet.tsx made the same choices): the
// whole country without results, a searched place with its closest centers rather than the whole country, a search
// radius fitted without zooming in too far, and room kept clear of the controls floating over the map.

export type Bounds = [[number, number], [number, number]]

/** Pixels kept clear on each side of the map. */
export interface Padding {
  top: number
  right: number
  bottom: number
  left: number
}

export const PHILIPPINES: Bounds = [
  [116.8, 4.5],
  [126.7, 21.2],
]
/** How far the map can be moved: the Philippines and the seas around it, with room to spare at the edges. */
export const REGION: Bounds = [
  [105, -3],
  [139, 28],
]

/** A frame: bounds to fit, keeping `margin` pixels clear inside the controls, or a point and zoom. */
export type Frame =
  { bounds: Bounds; maxZoom?: number; margin: number } | { center: [number, number]; zoom: number }

/** The closest centers framed with a searched place, so the view stays local. */
const NEAREST = 6

export function boundsOf(positions: readonly Position[]): Bounds {
  let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [lng, lat] of positions) {
    west = Math.min(west, lng)
    east = Math.max(east, lng)
    south = Math.min(south, lat)
    north = Math.max(north, lat)
  }
  return [
    [west, south],
    [east, north],
  ]
}

/** The box around a circle `km` across from its center, a little generous at its corners. */
export function circleBounds(center: Point, km: number): Bounds {
  const latitude = km / 110.574
  const longitude = km / (111.32 * Math.cos((center.latitude * Math.PI) / 180))
  return [
    [center.longitude - longitude, center.latitude - latitude],
    [center.longitude + longitude, center.latitude + latitude],
  ]
}

/**
 * How to frame the results: an active radius frames its circle, even without results; otherwise the centers, or, with
 * a searched place or the learner's location, it and its closest centers; the whole country without any.
 */
export function frameResults({
  points,
  reference,
  radiusKm,
}: {
  points: readonly Center[]
  reference: Point | null
  radiusKm: number | null
}): Frame {
  if (reference && radiusKm && radiusKm > 0) {
    return { bounds: circleBounds(reference, radiusKm), maxZoom: 13, margin: 24 }
  }
  const mapped = points.filter((center) => center.latitude !== null && center.longitude !== null)
  if (!mapped.length) {
    return reference
      ? { center: [reference.longitude, reference.latitude], zoom: 9 }
      : { bounds: PHILIPPINES, margin: 0 }
  }
  const at = (center: Center): Position => [center.longitude as number, center.latitude as number]
  if (!reference) return { bounds: boundsOf(mapped.map(at)), maxZoom: 13, margin: 40 }
  const nearest = mapped
    .filter((center) => center.distanceKm !== null)
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
    .slice(0, NEAREST)
  return {
    bounds: boundsOf([[reference.longitude, reference.latitude], ...nearest.map(at)]),
    maxZoom: 13,
    margin: 40,
  }
}

/** Below this width the map is a phone's: its controls take a larger share of it. */
export const NARROW = 640
/** The column of buttons on the map's right: 14px from the edge, 42px wide, and a gap. */
const CONTROLS = 64

/**
 * Padding that keeps what's framed clear of the map's own controls (the buttons on the right, the legend and layers
 * along the bottom) and of the filter panel over its left edge (`inset`), plus `margin`. Never more than the map has
 * room for: MapLibre won't fit bounds into a box padded to nothing.
 */
export function overlayPadding(
  size: { width: number; height: number },
  inset: number,
  margin: number,
): Padding {
  const narrow = size.width < NARROW
  const padding = {
    top: margin + (narrow ? 12 : 8),
    right: Math.max(CONTROLS, margin + 8),
    bottom: margin + (narrow ? 44 : 52),
    left: inset + margin + 8,
  }
  const fit = (start: 'left' | 'top', end: 'right' | 'bottom', room: number) => {
    const total = padding[start] + padding[end]
    const most = Math.max(0, room - 80)
    if (total <= most) return
    const scale = most / total
    padding[start] = Math.floor(padding[start] * scale)
    padding[end] = Math.floor(padding[end] * scale)
  }
  fit('left', 'right', size.width)
  fit('top', 'bottom', size.height)
  return padding
}

/** Whether a point on screen is inside the padded part of the map, where it can be seen clear of the controls. */
export function insidePadding(
  point: { x: number; y: number },
  size: { width: number; height: number },
  padding: Padding,
): boolean {
  return (
    point.x >= padding.left &&
    point.x <= size.width - padding.right &&
    point.y >= padding.top &&
    point.y <= size.height - padding.bottom
  )
}

/** The offset from the map's middle to the middle of its padded part: easing there centers a point in what's clear. */
export function paddedOffset(padding: Padding): [number, number] {
  return [(padding.left - padding.right) / 2, (padding.top - padding.bottom) / 2]
}

/** Animation lengths: none when the learner asked their device for less motion. */
export function motion(reduced: boolean, duration = 700): { duration: number; essential: boolean } {
  return { duration: reduced ? 0 : duration, essential: true }
}
