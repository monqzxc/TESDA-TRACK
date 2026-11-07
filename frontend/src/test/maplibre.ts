import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec'
import { vi } from 'vitest'

// A stand-in for MapLibre GL JS in unit tests: jsdom has no WebGL. It keeps the style and sources it's given, records
// camera moves, and lets a test fire the map's events, so CenterMapLibre.tsx's wiring can be checked here. Real
// drawing is checked in a browser (tests/e2e/training.spec.ts). Use with
//   vi.mock('maplibre-gl', () => import('../../test/maplibre.ts'))

type Listener = (event: Record<string, unknown>) => void

/** What a test sets for queryRenderedFeatures to return, by layer. */
export type Rendered = Record<string, Record<string, unknown>[]>

function handler() {
  let enabled = false
  return {
    enable: vi.fn(() => (enabled = true)),
    disable: vi.fn(() => (enabled = false)),
    isEnabled: () => enabled,
    enableRotation: vi.fn(),
    disableRotation: vi.fn(),
  }
}

export class FakeSource {
  data: unknown
  setData = vi.fn((data: unknown) => {
    this.data = data
  })
  getClusterExpansionZoom = vi.fn<(clusterId: number) => Promise<number>>(async () => 12)
  getClusterLeaves = vi.fn<
    (clusterId: number, limit: number, offset: number) => Promise<unknown[]>
  >(async () => [])
  vectorLayerIds?: string[]
  constructor(spec: { data?: unknown }) {
    this.data = spec.data
  }
}

export class Map {
  static instances: Map[] = []
  /** Set to make the next map fail to start, as it does without a WebGL context. */
  static failNext = false

  options: Record<string, unknown>
  style: StyleSpecification
  sources = new globalThis.Map<string, FakeSource>()
  listeners: { type: string; layer?: string; listener: Listener; once?: boolean }[] = []
  rendered: Rendered = {}
  zoom = 6
  pitch = 0
  bearing = 0
  removed = false
  container: HTMLElement
  canvas = document.createElement('canvas')
  canvasContainer = document.createElement('div')
  controls: unknown[] = []
  images = new Set<string>()
  resolver: ((id: string) => unknown) | null = null

  easeTo = vi.fn((options: Record<string, unknown>) => {
    this.move(options)
    return this
  })
  fitBounds = vi.fn<(bounds: unknown, options?: Record<string, unknown>) => this>(() => this)
  jumpTo = vi.fn((options: Record<string, unknown>) => {
    this.move(options)
    return this
  })
  panBy = vi.fn<(offset: unknown, options?: unknown) => this>(() => this)
  setStyle = vi.fn((style: StyleSpecification, ...options: unknown[]) => {
    void options
    this.applyStyle(style)
    return this
  })
  setLayoutProperty = vi.fn((id: string, name: string, value: unknown) => {
    const layer = this.style.layers.find((item) => item.id === id) as {
      layout?: Record<string, unknown>
    }
    layer.layout = { ...layer.layout, [name]: value }
    return this
  })

  scrollZoom = handler()
  dragRotate = handler()
  touchZoomRotate = handler()
  touchPitch = handler()
  keyboard = handler()
  cooperativeGestures = handler()

  constructor(options: Record<string, unknown>) {
    if (Map.failNext) {
      Map.failNext = false
      throw new Error('Failed to initialize WebGL')
    }
    this.options = options
    this.container = options.container as HTMLElement
    this.canvasContainer.className = 'maplibregl-canvas-container'
    this.canvas.className = 'maplibregl-canvas'
    this.canvasContainer.append(this.canvas)
    this.container.append(this.canvasContainer)
    this.style = { version: 8, sources: {}, layers: [] }
    this.applyStyle(options.style as StyleSpecification)
    Map.instances.push(this)
  }

  private applyStyle(style: StyleSpecification) {
    this.style = structuredClone(style)
    for (const [id, spec] of Object.entries(style.sources)) {
      if (!this.sources.has(id)) this.sources.set(id, new FakeSource(spec as { data?: unknown }))
    }
    for (const id of this.sources.keys()) if (!(id in style.sources)) this.sources.delete(id)
  }

  private move(options: Record<string, unknown>) {
    if (typeof options.zoom === 'number') this.zoom = options.zoom
    if (typeof options.pitch === 'number') this.pitch = options.pitch
    if (typeof options.bearing === 'number') this.bearing = options.bearing
    this.fire('movestart')
    this.fire('move')
    this.fire('moveend')
  }

  on(type: string, layerOrListener: string | Listener, maybe?: Listener) {
    if (typeof layerOrListener === 'string') {
      this.listeners.push({ type, layer: layerOrListener, listener: maybe as Listener })
    } else {
      this.listeners.push({ type, listener: layerOrListener })
    }
    return this
  }
  once(type: string, listener: Listener) {
    this.listeners.push({ type, listener, once: true })
    return this
  }
  off(type: string, listener: Listener) {
    this.listeners = this.listeners.filter(
      (item) => item.type !== type || item.listener !== listener,
    )
    return this
  }
  /** Fires a map event, or a layer's (with `layer`), as MapLibre would. */
  fire(type: string, event: Record<string, unknown> = {}, layer?: string) {
    for (const item of [...this.listeners]) {
      if (item.type !== type || item.layer !== layer) continue
      if (item.once) this.listeners = this.listeners.filter((other) => other !== item)
      item.listener({ type, target: this, ...event })
    }
    return this
  }

  getSource<T = FakeSource>(id: string) {
    return this.sources.get(id) as T | undefined
  }
  getLayer(id: string) {
    return this.style.layers.find((layer) => layer.id === id)
  }
  getStyle() {
    return this.style
  }
  getLayoutProperty(id: string, name: string) {
    return (this.getLayer(id) as { layout?: Record<string, unknown> } | undefined)?.layout?.[name]
  }
  getPaintProperty(id: string, name: string) {
    return (this.getLayer(id) as { paint?: Record<string, unknown> } | undefined)?.paint?.[name]
  }
  queryRenderedFeatures(pointOrOptions?: unknown, maybeOptions?: { layers?: string[] }) {
    const options = (maybeOptions ?? pointOrOptions) as { layers?: string[] } | undefined
    return (options?.layers ?? Object.keys(this.rendered)).flatMap((layer) =>
      (this.rendered[layer] ?? []).map((feature) => ({ layer: { id: layer }, ...feature })),
    )
  }
  /** Lays the map's coordinates out on screen simply: 100 pixels a degree, north up. */
  project([lng, lat]: [number, number]) {
    return { x: (lng - 116) * 100, y: (22 - lat) * 100 }
  }
  getZoom() {
    return this.zoom
  }
  getPitch() {
    return this.pitch
  }
  getBearing() {
    return this.bearing
  }
  isMoving() {
    return false
  }
  loaded() {
    return true
  }
  getContainer() {
    return this.container
  }
  getCanvas() {
    return this.canvas
  }
  getCanvasContainer() {
    return this.canvasContainer
  }
  getPixelRatio() {
    return this.options.pixelRatio as number
  }
  addControl(control: unknown) {
    this.controls.push(control)
    return this
  }
  setMissingStyleImageResolver(resolver: ((id: string) => unknown) | null) {
    this.resolver = resolver
    return this
  }
  hasImage(id: string) {
    return this.images.has(id)
  }
  addImage(id: string) {
    this.images.add(id)
    return this
  }
  remove() {
    this.removed = true
    this.container.replaceChildren()
  }
}

export class Popup {
  static instances: Popup[] = []
  options: Record<string, unknown>
  element = document.createElement('div')
  lngLat: unknown = null
  offset: unknown = null
  text: string | null = null
  private open = false
  private listeners: { type: string; listener: () => void }[] = []

  constructor(options: Record<string, unknown> = {}) {
    this.options = options
    this.element.className = `maplibregl-popup ${String(options.className ?? '')}`
    Popup.instances.push(this)
  }
  setDOMContent(node: Node) {
    this.element.append(node)
    return this
  }
  setText(text: string) {
    this.text = text
    return this
  }
  setLngLat(lngLat: unknown) {
    this.lngLat = lngLat
    return this
  }
  setOffset(offset: unknown) {
    this.offset = offset
    return this
  }
  addTo(map: Map) {
    map.getContainer().append(this.element)
    this.open = true
    return this
  }
  isOpen() {
    return this.open
  }
  getElement() {
    return this.element
  }
  on(type: string, listener: () => void) {
    this.listeners.push({ type, listener })
    return this
  }
  remove() {
    if (!this.open) return this
    this.open = false
    this.element.remove()
    for (const item of this.listeners) if (item.type === 'close') item.listener()
    return this
  }
}

export class AttributionControl {
  options: Record<string, unknown>
  constructor(options: Record<string, unknown> = {}) {
    this.options = options
  }
}

export const setWorkerUrl = vi.fn()

/** Forgets every map and popup made, between tests. */
export function resetFakeMaps() {
  Map.instances = []
  Map.failNext = false
  Popup.instances = []
}

/** The last map made. */
export function lastMap(): Map {
  const map = Map.instances.at(-1)
  if (!map) throw new Error('No map was made')
  return map
}
