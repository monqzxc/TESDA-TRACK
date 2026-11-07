import type { Page, Route } from '@playwright/test'
import { crc32, deflateSync } from 'node:zlib'

// A stand-in for MapTiler's vector tiles, answered in the browser so the MapLibre map runs here without a network:
// real Mapbox Vector Tiles cut on demand from a little made-up OpenMapTiles-schema data around Manila, Makati and
// Cebu City. Makati's blocks have buildings, half of them with a recorded height (render_height above OpenMapTiles'
// 5 m default), so 3D has something to raise and something to leave flat. Hillshade gets flat elevation tiles.

export const MAPTILER_KEY = 'e2e-public-key'
const ORIGIN = 'https://api.maptiler.com'

type Geometry =
  | { type: 'Point'; coordinates: number[] }
  | { type: 'LineString'; coordinates: number[][] }
  | { type: 'Polygon'; coordinates: number[][][] }

interface Feature {
  type: 'Feature'
  properties: Record<string, string | number | boolean>
  geometry: Geometry
}

const feature = (properties: Feature['properties'], geometry: Geometry): Feature => ({
  type: 'Feature',
  properties,
  geometry,
})
const box = (west: number, south: number, east: number, north: number): Geometry => ({
  type: 'Polygon',
  coordinates: [
    [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ],
  ],
})
const line = (...points: [number, number][]): Geometry => ({
  type: 'LineString',
  coordinates: points,
})
const point = (lng: number, lat: number): Geometry => ({ type: 'Point', coordinates: [lng, lat] })

function makatiBuildings(): Feature[] {
  const buildings: Feature[] = []
  for (let i = 0; i < 14; i++) {
    for (let j = 0; j < 12; j++) {
      const west = 121.014 + i * 0.0012
      const south = 14.549 + j * 0.0011
      // Every other building has a recorded height; the rest get OpenMapTiles' 5 m default.
      const known = (i + j) % 2 === 0
      buildings.push(
        feature(
          { render_height: known ? 18 + ((i * 7 + j * 11) % 9) * 12 : 5, render_min_height: 0 },
          box(west, south, west + 0.0008, south + 0.0007),
        ),
      )
    }
  }
  return buildings
}

const LAYERS: Record<string, Feature[]> = {
  water: [
    // Manila Bay, west of the city, and a stretch of the Mactan Channel by Cebu City.
    feature({ class: 'ocean' }, box(120.55, 14.3, 120.955, 14.75)),
    feature({ class: 'ocean' }, box(123.89, 10.25, 124.05, 10.33)),
  ],
  waterway: [
    feature(
      { class: 'river', name: 'Pasig River' },
      line([120.958, 14.596], [120.99, 14.59], [121.03, 14.577], [121.07, 14.56]),
    ),
  ],
  landuse: [
    feature({ class: 'residential' }, box(120.96, 14.52, 121.06, 14.66)),
    feature({ class: 'commercial' }, box(121.012, 14.547, 121.032, 14.563)),
    feature({ class: 'university' }, box(120.986, 14.6, 120.995, 14.607)),
  ],
  park: [feature({ class: 'park' }, box(121.035, 14.545, 121.045, 14.553))],
  transportation: [
    feature({ class: 'motorway' }, line([121.0, 14.66], [121.03, 14.585], [121.02, 14.52])),
    feature({ class: 'primary' }, line([120.97, 14.6], [121.0, 14.58], [121.06, 14.55])),
    feature({ class: 'secondary' }, line([120.98, 14.55], [121.03, 14.57])),
    ...Array.from({ length: 8 }, (_, i) =>
      feature(
        { class: 'minor' },
        line([121.012, 14.5485 + i * 0.0022], [121.032, 14.5485 + i * 0.0022]),
      ),
    ),
    feature({ class: 'primary' }, line([123.86, 10.29], [123.89, 10.31], [123.92, 10.33])),
  ],
  transportation_name: [
    feature(
      { class: 'primary', name: 'Gil Puyat Avenue' },
      line([120.97, 14.6], [121.0, 14.58], [121.06, 14.55]),
    ),
  ],
  building: makatiBuildings(),
  boundary: [feature({ admin_level: 4, maritime: 0 }, line([121.05, 14.5], [121.05, 14.7]))],
  place: [
    feature({ class: 'city', name: 'Manila', rank: 3 }, point(120.9842, 14.5995)),
    feature({ class: 'city', name: 'Makati', rank: 4 }, point(121.03, 14.556)),
    feature({ class: 'city', name: 'Quezon City', rank: 3 }, point(121.04, 14.676)),
    feature({ class: 'city', name: 'Cebu City', rank: 3 }, point(123.8854, 10.3157)),
    feature({ class: 'suburb', name: 'Poblacion', rank: 10 }, point(121.033, 14.565)),
  ],
}

/** The TileJSON, listing the layers as OpenMapTiles' does. */
function tileJson(key: string) {
  return {
    tilejson: '3.0.0',
    name: 'E2E OpenMapTiles stand-in',
    tiles: [`${ORIGIN}/tiles/v3/{z}/{x}/{y}.pbf?key=${key}`],
    minzoom: 0,
    maxzoom: 14,
    attribution: '© MapTiler © OpenStreetMap contributors',
    vector_layers: Object.keys(LAYERS).map((id) => ({
      id,
      fields: id === 'building' ? { render_height: 'Number', render_min_height: 'Number' } : {},
    })),
  }
}

const tiles = new Map<string, Buffer>()
// Imported as modules whichever way this file is loaded: geojson-vt's CommonJS build doesn't export when required.
const encoders = Promise.all([import('@maplibre/geojson-vt'), import('@maplibre/vt-pbf')])

async function vectorTile(z: number, x: number, y: number): Promise<Buffer> {
  const key = `${z}/${x}/${y}`
  const cached = tiles.get(key)
  if (cached) return cached
  const [{ geoJSONToTile }, { fromGeojsonVt }] = await encoders
  const layers: Parameters<typeof fromGeojsonVt>[0] = {}
  for (const [name, features] of Object.entries(LAYERS)) {
    const tile = geoJSONToTile({ type: 'FeatureCollection', features } as never, z, x, y, {
      extent: 4096,
      buffer: 64,
    })
    if (tile?.features.length) layers[name] = tile as never
  }
  const body = Object.keys(layers).length
    ? Buffer.from(fromGeojsonVt(layers, { version: 2 }))
    : Buffer.alloc(0)
  tiles.set(key, body)
  return body
}

/** A PNG of one color, `size` pixels square: flat ground for hillshade (Mapbox's encoding of 0 m), or a photo. */
function solidPng(size: number, [r, g, b]: [number, number, number]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8)
    head.writeUInt32BE(data.length, 0)
    head.write(type, 4, 'ascii')
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0)
    return Buffer.concat([head, data, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.set([8, 2, 0, 0, 0], 8)
  const row = Buffer.alloc(1 + size * 3)
  for (let i = 0; i < size; i++) row.set([r, g, b], 1 + i * 3)
  const pixels = Buffer.concat(Array.from({ length: size }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const FLAT_GROUND = solidPng(256, [1, 134, 160])
const PHOTO = solidPng(256, [96, 120, 92])
const LOGO =
  '<svg xmlns="http://www.w3.org/2000/svg" width="67" height="20"><rect width="67" height="20" rx="4" fill="#fff"/></svg>'

export interface VectorTileOptions {
  /** Answer the TileJSON with this status instead, as MapTiler does for a refused key. */
  tileJsonStatus?: number
}

/** Answers every MapTiler request the MapLibre map makes. Returns the paths asked for, to check what was loaded. */
export async function serveVectorTiles(
  page: Page,
  options: VectorTileOptions = {},
): Promise<string[]> {
  const asked: string[] = []
  await page.route(`${ORIGIN}/**`, async (route: Route) => {
    const url = new URL(route.request().url())
    asked.push(url.pathname)
    const key = url.searchParams.get('key') ?? ''
    const path = url.pathname
    if (path === '/tiles/v3/tiles.json') {
      return options.tileJsonStatus
        ? route.fulfill({ status: options.tileJsonStatus, json: { message: 'Invalid key' } })
        : route.fulfill({ json: tileJson(key) })
    }
    const tile = /^\/tiles\/v3\/(\d+)\/(\d+)\/(\d+)\.pbf$/.exec(path)
    if (tile) {
      const [z, x, y] = tile.slice(1).map(Number)
      return route.fulfill({
        body: await vectorTile(z, x, y),
        contentType: 'application/x-protobuf',
      })
    }
    for (const [name, image] of [
      ['terrain-rgb-v2', FLAT_GROUND],
      ['satellite-v2', PHOTO],
    ] as const) {
      if (path === `/tiles/${name}/tiles.json`) {
        return route.fulfill({
          json: {
            tilejson: '3.0.0',
            tiles: [`${ORIGIN}/tiles/${name}/{z}/{x}/{y}.png?key=${key}`],
            tileSize: 256,
            maxzoom: 12,
          },
        })
      }
      if (path.startsWith(`/tiles/${name}/`))
        return route.fulfill({ body: image, contentType: 'image/png' })
    }
    if (path === '/resources/logo.svg')
      return route.fulfill({ body: LOGO, contentType: 'image/svg+xml' })
    return route.fulfill({ status: 404 })
  })
  return asked
}
