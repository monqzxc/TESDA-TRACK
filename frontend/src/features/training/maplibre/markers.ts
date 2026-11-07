import type { Map as MapLibreMap, MapGeoJSONFeature } from 'maplibre-gl'
import type { CenterKind } from '../address.ts'

// The images MapLibre draws for the centers: the same pins Leaflet draws (a teardrop in the center type's color with
// its glyph in white), larger and glowing when selected, and the cluster badges with their counts. They're drawn on a
// canvas when the map first needs them (Map.setMissingStyleImageResolver), so there's no sprite sheet to download and
// the counts don't wait for map fonts. Also: which pins and clusters are on screen, for the buttons that make them
// reachable by keyboard and screen reader.

const COLORS: Record<CenterKind, string> = { training: '#175cd3', assessment: '#0d9488' }
const PIN = { width: 34, height: 44, tip: 43 }
const PIN_PATH =
  'M17 1.5C8.4 1.5 1.5 8.3 1.5 16.9 1.5 28.4 17 42.5 17 42.5s15.5-14.1 15.5-25.6C32.5 8.3 25.6 1.5 17 1.5Z'
/** One glyph per center type on a 24-unit grid, as Leaflet's pins have. */
const GLYPHS: Record<CenterKind, string> = {
  training:
    'M12 6.5 4.5 10 12 13.5 19.5 10 12 6.5Z M7.5 11.6v3.1c2.6 1.7 6.4 1.7 9 0v-3.1 M19.5 10v4.2',
  assessment:
    'M15.7 9.6a3.7 3.7 0 1 1-7.4 0 3.7 3.7 0 1 1 7.4 0Z m-6.2 3 -1.3 4.9 3.8-1.8 3.8 1.8-1.3-4.9',
}
const SELECTED_SCALE = 1.3
/** Room around a pin for its shadow, and around a selected pin for its glow. */
const PAD = 6
const SELECTED_PAD = 10
const PIXEL_RATIO = 2
/** How far a pin's tip is above its image's bottom edge: the layers move the image down by it (icon-offset). */
export const PIN_TIP_BELOW = PAD + PIN.height - PIN.tip
export const SELECTED_TIP_BELOW = SELECTED_PAD + (PIN.height - PIN.tip) * SELECTED_SCALE
/** The pins' and clusters' sizes on screen, for the buttons laid over them. */
export const PIN_BOX = { width: PIN.width, height: PIN.height, tip: PIN.tip }
export const SELECTED_BOX = {
  width: PIN.width * SELECTED_SCALE,
  height: PIN.height * SELECTED_SCALE,
  tip: PIN.tip * SELECTED_SCALE,
}
export const CLUSTER_SIZE = 46

const FONT_FAMILY = "Figtree, 'Segoe UI', system-ui, sans-serif"
const COUNT_FONT = `700 13px ${FONT_FAMILY}`

interface DrawnImage {
  width: number
  height: number
  data: Uint8ClampedArray
}

function canvas(width: number, height: number) {
  const element = document.createElement('canvas')
  element.width = Math.ceil(width * PIXEL_RATIO)
  element.height = Math.ceil(height * PIXEL_RATIO)
  // Read back once, so the browser keeps it off the GPU rather than stalling to copy it back.
  const context = element.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.scale(PIXEL_RATIO, PIXEL_RATIO)
  return { element, context }
}

function pixels(drawn: NonNullable<ReturnType<typeof canvas>>): DrawnImage {
  const { element, context } = drawn
  const image = context.getImageData(0, 0, element.width, element.height)
  return { width: image.width, height: image.height, data: image.data }
}

/** A center's pin: its type's color with a white edge and glyph, shadowed, or glowing in its color when selected. */
export function drawPin(kind: CenterKind, selected: boolean): DrawnImage | null {
  const scale = selected ? SELECTED_SCALE : 1
  const pad = selected ? SELECTED_PAD : PAD
  const drawn = canvas(PIN.width * scale + pad * 2, PIN.height * scale + pad * 2)
  if (!drawn) return null
  const { context } = drawn
  context.translate(pad, pad)
  context.scale(scale, scale)
  // Shadows aren't scaled with the drawing, so they're given in device pixels.
  context.shadowColor = selected ? `${COLORS[kind]}aa` : 'rgba(16, 42, 86, 0.27)'
  context.shadowBlur = (selected ? 7 : 3) * PIXEL_RATIO
  context.shadowOffsetY = selected ? 0 : 3 * PIXEL_RATIO
  const pin = new Path2D(PIN_PATH)
  context.fillStyle = COLORS[kind]
  context.fill(pin)
  context.shadowColor = 'transparent'
  context.strokeStyle = '#ffffff'
  context.lineWidth = 2
  context.stroke(pin)
  context.translate(5, 4.5)
  context.lineWidth = 1.7
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.stroke(new Path2D(GLYPHS[kind]))
  return pixels(drawn)
}

/** A cluster's badge: its count on a blue disc with a white edge, in a soft blue ring. Only a count, never any text a
 *  center or learner gave. */
export function drawCluster(count: string): DrawnImage | null {
  const drawn = canvas(CLUSTER_SIZE, CLUSTER_SIZE)
  if (!drawn) return null
  const { context } = drawn
  const middle = CLUSTER_SIZE / 2
  const disc = (radius: number, color: string) => {
    context.beginPath()
    context.arc(middle, middle, radius, 0, Math.PI * 2)
    context.fillStyle = color
    context.fill()
  }
  disc(23, 'rgba(23, 92, 211, 0.18)')
  disc(17, '#ffffff')
  disc(15, COLORS.training)
  context.fillStyle = '#ffffff'
  context.font = COUNT_FONT
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(count, middle, middle + 0.5, 28)
  return pixels(drawn)
}

/** Adds an image the map asked for: "pin-training", "pin-assessment-selected", "cluster-12". */
export async function addMarkerImage(map: MapLibreMap, id: string): Promise<void> {
  let image: DrawnImage | null = null
  const pin = /^pin-(training|assessment)(-selected)?$/.exec(id)
  if (pin) {
    image = drawPin(pin[1] as CenterKind, Boolean(pin[2]))
  } else if (id.startsWith('cluster-')) {
    // The count in the app's own font, once it's ready (the font may still be loading on a first visit).
    await document.fonts?.load(COUNT_FONT).catch(() => undefined)
    image = drawCluster(id.slice('cluster-'.length))
  }
  if (image && !map.hasImage(id)) map.addImage(id, image, { pixelRatio: PIXEL_RATIO })
}

export interface HitTarget {
  /** Stable while the pin or cluster stays on screen, so its button keeps focus across redraws. */
  key: string
  type: 'pin' | 'cluster'
  lngLat: [number, number]
  selected: boolean
  centerId?: string
  clusterId?: number
  count?: number
}

/**
 * The pins and clusters on screen, top to bottom, for the buttons laid over them: at most `limit`, so a crowded view
 * can't add hundreds of buttons. Pins further down the list are still drawn, and still open when clicked.
 */
export function renderedTargets(
  map: MapLibreMap,
  layers: { pins: string; selected: string; clusters: string },
  limit = 120,
): HitTarget[] {
  // While a new style is swapped in, its layers can be missing for a moment: nothing to query yet.
  const present = [layers.selected, layers.pins, layers.clusters].filter((id) => map.getLayer(id))
  if (!present.length) return []
  const features: MapGeoJSONFeature[] = map.queryRenderedFeatures({ layers: present })
  const seen = new Set<string>()
  const found: { target: HitTarget; x: number; y: number }[] = []
  for (const feature of features) {
    if (feature.geometry.type !== 'Point') continue
    const [lng, lat] = feature.geometry.coordinates
    const properties = feature.properties as Record<string, unknown>
    const cluster = typeof properties.cluster_id === 'number' ? properties.cluster_id : null
    const centerId = typeof properties.id === 'string' ? properties.id : null
    // The route's end has a pin of its own, which only marks the end.
    if (cluster === null && (!centerId || centerId === ROUTE_END)) continue
    const key = cluster === null ? `pin:${centerId}` : `cluster:${cluster}`
    if (seen.has(key)) continue
    seen.add(key)
    const { x, y } = map.project([lng, lat])
    const target: HitTarget = {
      key,
      type: cluster === null ? 'pin' : 'cluster',
      lngLat: [lng, lat],
      selected: feature.layer.id === layers.selected,
      ...(cluster === null
        ? { centerId: centerId as string }
        : { clusterId: cluster, count: Number(properties.point_count) }),
    }
    found.push({ target, x, y })
  }
  return found
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .slice(0, limit)
    .map(({ target }) => target)
}

/** The id of the extra pin marking a route's end, when the selected pin isn't already there. */
export const ROUTE_END = 'route-end'
