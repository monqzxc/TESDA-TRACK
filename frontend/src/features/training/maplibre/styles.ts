import type {
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
  SourceSpecification,
  StyleSpecification,
} from '@maplibre/maplibre-gl-style-spec'
import type { VectorTiles } from '../mapSettings.ts'

// The center map's base map for MapLibre: a style drawn from the app's own colors (tokens.css) over OpenMapTiles-schema
// vector tiles, in light and dark, so MapTiler's tiles and any other OpenMapTiles source look the same. Quiet land,
// blue-grey roads and water, and clear labels leave the centers' pins as the strongest color. A muted variant, a
// satellite photo and OpenStreetMap's own raster map can be chosen instead.

export type Theme = 'light' | 'dark'
export type BasemapId = 'map' | 'light' | 'satellite' | 'standard'

/** The vector source every base layer reads, and the layer holding building footprints. */
export const BASEMAP_SOURCE = 'basemap'
export const BUILDING_FLAT = 'building'
export const BUILDING_3D = 'building-3d'

const OSM_COPYRIGHT =
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">&copy; OpenStreetMap contributors</a>'
export const OSM_CREDIT = OSM_COPYRIGHT
const MAPTILER_CREDIT = `<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener noreferrer">&copy; MapTiler</a> ${OSM_COPYRIGHT}`

export interface ProviderUrls {
  /** TileJSON of the OpenMapTiles-schema vector tiles. */
  tiles: string
  /** Elevation tiles for hillshade, when the provider has them. */
  terrain: string | null
  /** Satellite photos, when the provider has them. */
  satellite: string | null
  /** Credit shown for the tiles. Undefined: the TileJSON's own. */
  attribution: string | undefined
  /** The provider's logo, which its free plan asks maps to show. */
  logo: { href: string; src: string; alt: string } | null
}

/** Where the provider's files are. A MapTiler key goes in each address, as MapTiler expects. */
export function providerUrls(tiles: VectorTiles): ProviderUrls {
  if (tiles.provider === 'custom') {
    return {
      tiles: tiles.tilesUrl,
      terrain: null,
      satellite: null,
      attribution: undefined,
      logo: null,
    }
  }
  const key = `key=${encodeURIComponent(tiles.key)}`
  return {
    tiles: `https://api.maptiler.com/tiles/v3/tiles.json?${key}`,
    terrain: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?${key}`,
    satellite: `https://api.maptiler.com/tiles/satellite-v2/tiles.json?${key}`,
    attribution: MAPTILER_CREDIT,
    logo: {
      href: 'https://www.maptiler.com/',
      src: 'https://api.maptiler.com/resources/logo.svg',
      alt: 'MapTiler',
    },
  }
}

export interface Palette {
  land: string
  residential: string
  commercial: string
  education: string
  hospital: string
  park: string
  wood: string
  wetland: string
  sand: string
  water: string
  waterway: string
  aeroway: string
  runway: string
  building: string
  buildingOutline: string
  building3d: string
  roadMinor: string
  roadMinorCasing: string
  roadMajor: string
  roadMajorCasing: string
  roadTrunk: string
  roadTrunkCasing: string
  roadMotorway: string
  roadMotorwayCasing: string
  path: string
  rail: string
  ferry: string
  boundary: string
  boundaryRegion: string
  label: string
  labelHalo: string
  city: string
  town: string
  village: string
  waterLabel: string
  roadLabel: string
  hillshadeShadow: string
  hillshadeHighlight: string
  light: string
}

/** The everyday map, light: off-white land, white roads with blue-grey edges, soft blue water (tokens.css). */
const LIGHT: Palette = {
  land: '#f2f4f7',
  residential: '#eceff3',
  commercial: '#eef0f5',
  education: '#eef0f8',
  hospital: '#f6eef0',
  park: '#e0eedd',
  wood: '#d6e8d4',
  wetland: '#dcece6',
  sand: '#f2eee2',
  water: '#c8dff2',
  waterway: '#b5d1ec',
  aeroway: '#e8ebf0',
  runway: '#d7dce5',
  building: '#e3e7ed',
  buildingOutline: '#d2d9e3',
  building3d: '#dbe2ec',
  roadMinor: '#ffffff',
  roadMinorCasing: '#dde3eb',
  roadMajor: '#ffffff',
  roadMajorCasing: '#cbd4e1',
  roadTrunk: '#eef3fc',
  roadTrunkCasing: '#b9cae6',
  roadMotorway: '#dfe9f9',
  roadMotorwayCasing: '#a6bce2',
  path: '#c9d1dc',
  rail: '#c3cad5',
  ferry: '#8fb2dc',
  boundary: '#8e9bb1',
  boundaryRegion: '#bac4d3',
  label: '#3e5272',
  labelHalo: '#ffffff',
  city: '#102a56',
  town: '#24395f',
  village: '#52647e',
  waterLabel: '#3d6fa5',
  roadLabel: '#52647e',
  hillshadeShadow: '#3e5272',
  hillshadeHighlight: '#ffffff',
  light: '#ffffff',
}

/** The everyday map, dark: the app's night navy, with water darker than land and roads in its blues. */
const DARK: Palette = {
  land: '#13213e',
  residential: '#162543',
  commercial: '#172746',
  education: '#18284b',
  hospital: '#1d2443',
  park: '#122a39',
  wood: '#112d37',
  wetland: '#112a37',
  sand: '#1b2643',
  water: '#0a1530',
  waterway: '#0d1a38',
  aeroway: '#192948',
  runway: '#22335a',
  building: '#1b2a4b',
  buildingOutline: '#24375e',
  building3d: '#2a3d66',
  roadMinor: '#22325a',
  roadMinorCasing: '#14223f',
  roadMajor: '#2a3d6b',
  roadMajorCasing: '#18284c',
  roadTrunk: '#2f4677',
  roadTrunkCasing: '#1b2d55',
  roadMotorway: '#365490',
  roadMotorwayCasing: '#203562',
  path: '#2c3d63',
  rail: '#2c3d63',
  ferry: '#2f5a99',
  boundary: '#5d7091',
  boundaryRegion: '#3a4c70',
  label: '#c3d0e6',
  labelHalo: '#0b1630',
  city: '#e4ebf7',
  town: '#cdd8ec',
  village: '#9fb1ce',
  waterLabel: '#7fa8d9',
  roadLabel: '#9fb1ce',
  hillshadeShadow: '#000814',
  hillshadeHighlight: '#2a3f68',
  light: '#c3d0e6',
}

/** The muted map: almost no color but water, for when the pins should stand out most. */
const MUTED: Record<Theme, Partial<Palette>> = {
  light: {
    land: '#f5f6f8',
    residential: '#f1f3f6',
    commercial: '#f1f3f6',
    education: '#f1f3f6',
    hospital: '#f1f3f6',
    park: '#eaf0ea',
    wood: '#e6ede6',
    wetland: '#e8eeec',
    sand: '#f3f2ee',
    water: '#d7e4f0',
    waterway: '#c9dbec',
    roadMinorCasing: '#e6e9ee',
    roadMajorCasing: '#dce1e8',
    roadTrunk: '#ffffff',
    roadTrunkCasing: '#d3dae4',
    roadMotorway: '#f3f6fb',
    roadMotorwayCasing: '#ccd5e2',
    building: '#eaecf0',
    buildingOutline: '#dee2e8',
    label: '#6b7b93',
    city: '#3e5272',
    town: '#52647e',
    village: '#6b7b93',
  },
  dark: {
    land: '#0f1b34',
    residential: '#111e38',
    commercial: '#111e38',
    education: '#111e38',
    hospital: '#111e38',
    park: '#10213a',
    wood: '#10233a',
    wetland: '#10223a',
    sand: '#131f3a',
    water: '#08122a',
    roadMinor: '#1a284a',
    roadMajor: '#1f2f55',
    roadTrunk: '#24365f',
    roadMotorway: '#2a3e6b',
    building: '#16244a',
    label: '#8a9cba',
    city: '#c3d0e6',
    town: '#9fb1ce',
    village: '#8a9cba',
  },
}

/** Labels over a satellite photo: white text on a dark halo, whatever the theme. */
const SATELLITE_LABELS: Partial<Palette> = {
  label: '#ffffff',
  labelHalo: 'rgba(9, 18, 38, 0.8)',
  city: '#ffffff',
  town: '#f4f7fc',
  village: '#e4ebf7',
  waterLabel: '#d6e8ff',
  roadLabel: '#f4f7fc',
  roadMajor: 'rgba(255, 255, 255, 0.45)',
  roadTrunk: 'rgba(255, 255, 255, 0.55)',
  roadMotorway: 'rgba(255, 224, 160, 0.6)',
  boundary: 'rgba(255, 255, 255, 0.7)',
  boundaryRegion: 'rgba(255, 255, 255, 0.45)',
}

export function palette(theme: Theme, basemap: BasemapId = 'map'): Palette {
  const base = theme === 'dark' ? DARK : LIGHT
  if (basemap === 'light') return { ...base, ...MUTED[theme] }
  if (basemap === 'satellite') return { ...base, ...SATELLITE_LABELS }
  return base
}

// Labels in the app's own font (Figtree, base.css), drawn by the browser: MapLibre makes them without a font server
// when the style names none (no "glyphs"), so no font files are downloaded for the map. The first name sets the weight
// and style; the browser finds Figtree, already loaded for the page, by the second, and its own sans-serif for
// letters Figtree's Latin subset lacks.
const REGULAR = ['Figtree Regular', 'Figtree']
const BOLD = ['Figtree Bold', 'Figtree']
const ITALIC = ['Figtree Italic', 'Figtree']
/** Place names in Latin script where the tiles have one: neighbouring countries' names stay readable. */
const NAME: ExpressionSpecification = ['coalesce', ['get', 'name:latin'], ['get', 'name']]

/** A width or size that grows with zoom: pairs of zoom and value. */
function byZoom(...stops: number[]): ExpressionSpecification {
  return ['interpolate', ['exponential', 1.4], ['zoom'], ...stops] as ExpressionSpecification
}

const IS_LINE: ExpressionSpecification = ['==', ['geometry-type'], 'LineString']

const classIn = (...classes: string[]): ExpressionSpecification => [
  'match',
  ['get', 'class'],
  classes,
  true,
  false,
]

/**
 * A building whose height OpenStreetMap records. OpenMapTiles gives every other building a render_height of 5 m, so
 * only taller ones are known: those are drawn in 3D, the rest stay flat rather than shown with a made-up height.
 */
export const HAS_HEIGHT: ExpressionSpecification = [
  '>',
  ['to-number', ['coalesce', ['get', 'render_height'], 0]],
  5,
]
/** Outlines whose building:parts are drawn instead (OpenMapTiles' hide_3d). */
const DRAWN_AS_PARTS: ExpressionSpecification = ['==', ['get', 'hide_3d'], true]

interface RoadClass {
  id: string
  classes: string[]
  minzoom: number
  fill: keyof Palette
  casing: keyof Palette
  /** Fill width by zoom; the casing is a little wider. */
  width: number[]
}

const ROADS: RoadClass[] = [
  {
    id: 'minor',
    classes: ['minor', 'service'],
    minzoom: 13,
    fill: 'roadMinor',
    casing: 'roadMinorCasing',
    width: [13, 1, 16, 6, 19, 18],
  },
  {
    id: 'major',
    classes: ['secondary', 'tertiary'],
    minzoom: 9,
    fill: 'roadMajor',
    casing: 'roadMajorCasing',
    width: [9, 0.6, 13, 2.5, 16, 9, 19, 24],
  },
  {
    id: 'trunk',
    classes: ['primary', 'trunk'],
    minzoom: 6,
    fill: 'roadTrunk',
    casing: 'roadTrunkCasing',
    width: [6, 0.5, 10, 1.6, 13, 3.5, 16, 11, 19, 28],
  },
  {
    id: 'motorway',
    classes: ['motorway'],
    minzoom: 5,
    fill: 'roadMotorway',
    casing: 'roadMotorwayCasing',
    width: [5, 0.6, 10, 2, 13, 4, 16, 12, 19, 30],
  },
]

function landLayers(p: Palette): LayerSpecification[] {
  const fill = (
    id: string,
    sourceLayer: string,
    filter: FilterSpecification | null,
    color: string,
    minzoom = 0,
    opacity: number | ExpressionSpecification = 1,
  ): LayerSpecification => ({
    id,
    type: 'fill',
    source: BASEMAP_SOURCE,
    'source-layer': sourceLayer,
    minzoom,
    ...(filter ? { filter } : {}),
    paint: { 'fill-color': color, 'fill-opacity': opacity },
  })
  const line = (
    id: string,
    sourceLayer: string,
    filter: FilterSpecification,
    color: string,
    minzoom: number,
    width: ExpressionSpecification,
  ): LayerSpecification => ({
    id,
    type: 'line',
    source: BASEMAP_SOURCE,
    'source-layer': sourceLayer,
    minzoom,
    filter,
    layout: { 'line-cap': 'round' },
    paint: { 'line-color': color, 'line-width': width },
  })
  return [
    fill('landcover-wood', 'landcover', classIn('wood', 'forest'), p.wood, 0, 0.8),
    fill('landcover-grass', 'landcover', classIn('grass', 'farmland'), p.park, 0, 0.5),
    fill('landcover-wetland', 'landcover', classIn('wetland'), p.wetland, 0, 0.7),
    fill('landcover-sand', 'landcover', classIn('sand', 'beach'), p.sand),
    fill(
      'landuse-residential',
      'landuse',
      classIn('residential', 'suburb', 'quarter', 'neighbourhood'),
      p.residential,
      9,
      ['interpolate', ['linear'], ['zoom'], 9, 0, 11, 1],
    ),
    fill(
      'landuse-commercial',
      'landuse',
      classIn('commercial', 'retail', 'industrial'),
      p.commercial,
      11,
    ),
    fill(
      'landuse-education',
      'landuse',
      classIn('school', 'college', 'university', 'kindergarten'),
      p.education,
      12,
    ),
    fill('landuse-hospital', 'landuse', classIn('hospital'), p.hospital, 12),
    fill(
      'landuse-park',
      'landuse',
      classIn('pitch', 'playground', 'stadium', 'cemetery'),
      p.park,
      12,
    ),
    fill('park', 'park', null, p.park, 6, 0.6),
    fill('water', 'water', ['!=', ['get', 'intermittent'], 1], p.water),
    line(
      'waterway',
      'waterway',
      classIn('river', 'canal'),
      p.waterway,
      8,
      byZoom(8, 0.6, 13, 2, 18, 10),
    ),
    line('waterway-stream', 'waterway', classIn('stream'), p.waterway, 13, byZoom(13, 0.5, 18, 3)),
    fill('aeroway-area', 'aeroway', classIn('aerodrome', 'apron'), p.aeroway, 11),
    line(
      'aeroway-runway',
      'aeroway',
      ['all', IS_LINE, classIn('runway')],
      p.runway,
      11,
      byZoom(11, 3, 17, 50),
    ),
    line(
      'aeroway-taxiway',
      'aeroway',
      ['all', IS_LINE, classIn('taxiway')],
      p.runway,
      13,
      byZoom(13, 1, 17, 14),
    ),
  ]
}

function buildingLayers(p: Palette, threeD: boolean): LayerSpecification[] {
  return [
    {
      id: BUILDING_FLAT,
      type: 'fill',
      source: BASEMAP_SOURCE,
      'source-layer': 'building',
      minzoom: 13,
      // In 3D, only the buildings that aren't raised: those without a recorded height.
      ...(threeD
        ? { filter: ['any', ['!', HAS_HEIGHT], DRAWN_AS_PARTS] as FilterSpecification }
        : {}),
      paint: {
        'fill-color': p.building,
        'fill-outline-color': p.buildingOutline,
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, 1],
      },
    },
  ]
}

/** Buildings with recorded heights, raised to them. Drawn after the roads so they hide what's behind them. */
function extrusionLayer(p: Palette, threeD: boolean): LayerSpecification {
  return {
    id: BUILDING_3D,
    type: 'fill-extrusion',
    source: BASEMAP_SOURCE,
    'source-layer': 'building',
    minzoom: 14,
    filter: ['all', HAS_HEIGHT, ['!', DRAWN_AS_PARTS]],
    layout: { visibility: threeD ? 'visible' : 'none' },
    paint: {
      'fill-extrusion-color': p.building3d,
      // Rising from the ground as the buildings come into view, rather than appearing at full height.
      'fill-extrusion-height': [
        'interpolate',
        ['linear'],
        ['zoom'],
        14,
        0,
        15,
        ['to-number', ['get', 'render_height']],
      ],
      'fill-extrusion-base': [
        'interpolate',
        ['linear'],
        ['zoom'],
        14,
        0,
        15,
        ['to-number', ['coalesce', ['get', 'render_min_height'], 0]],
      ],
      'fill-extrusion-opacity': 0.9,
      'fill-extrusion-vertical-gradient': true,
    },
  }
}

function roadLayers(p: Palette, satellite: boolean): LayerSpecification[] {
  const roads = satellite ? ROADS.filter((road) => road.id !== 'minor') : ROADS
  const line = (road: RoadClass, casing: boolean): LayerSpecification => ({
    id: `road-${road.id}${casing ? '-casing' : ''}`,
    type: 'line',
    source: BASEMAP_SOURCE,
    'source-layer': 'transportation',
    minzoom: satellite ? Math.max(road.minzoom, 10) : road.minzoom,
    filter: ['all', IS_LINE, classIn(...road.classes)],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: casing
      ? {
          'line-color': p[road.casing],
          'line-width': byZoom(...road.width.map((value, i) => (i % 2 ? value + 1.6 : value))),
        }
      : {
          'line-color': p[road.fill],
          // Over a photo, thin lines that show the way without covering it.
          'line-width': satellite ? byZoom(10, 0.6, 16, 2.5, 19, 5) : byZoom(...road.width),
        },
  })
  return [
    ...(satellite
      ? []
      : [
          {
            id: 'road-path',
            type: 'line',
            source: BASEMAP_SOURCE,
            'source-layer': 'transportation',
            minzoom: 15,
            filter: ['all', IS_LINE, classIn('path', 'track')],
            paint: {
              'line-color': p.path,
              'line-width': byZoom(15, 0.8, 19, 2.5),
              'line-dasharray': [2, 1.5],
            },
          } satisfies LayerSpecification,
          {
            id: 'rail',
            type: 'line',
            source: BASEMAP_SOURCE,
            'source-layer': 'transportation',
            minzoom: 10,
            filter: classIn('rail', 'transit'),
            paint: {
              'line-color': p.rail,
              'line-width': byZoom(10, 0.8, 16, 2.5),
              'line-dasharray': [3, 2],
            },
          } satisfies LayerSpecification,
          {
            id: 'ferry',
            type: 'line',
            source: BASEMAP_SOURCE,
            'source-layer': 'transportation',
            minzoom: 7,
            filter: classIn('ferry'),
            paint: {
              'line-color': p.ferry,
              'line-width': byZoom(7, 0.6, 14, 1.6),
              'line-dasharray': [3, 3],
              'line-opacity': 0.7,
            },
          } satisfies LayerSpecification,
        ]),
    ...(satellite ? [] : roads.map((road) => line(road, true))),
    ...roads.map((road) => line(road, false)),
  ]
}

function boundaryLayers(p: Palette): LayerSpecification[] {
  return [
    {
      id: 'boundary-region',
      type: 'line',
      source: BASEMAP_SOURCE,
      'source-layer': 'boundary',
      minzoom: 6,
      filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
      paint: {
        'line-color': p.boundaryRegion,
        'line-width': byZoom(6, 0.6, 12, 1.4),
        'line-dasharray': [3, 2],
      },
    },
    {
      id: 'boundary-country',
      type: 'line',
      source: BASEMAP_SOURCE,
      'source-layer': 'boundary',
      filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
      paint: { 'line-color': p.boundary, 'line-width': byZoom(3, 0.8, 10, 2) },
    },
  ]
}

/** The first label layer: overlays meant to sit under the labels (the search radius, routes) go before it. */
export const FIRST_LABEL_LAYER = 'label-waterway'

function labelLayers(p: Palette): LayerSpecification[] {
  const halo = { 'text-halo-color': p.labelHalo, 'text-halo-width': 1.3, 'text-halo-blur': 0.4 }
  const place = (
    id: string,
    classes: string[],
    minzoom: number,
    maxzoom: number,
    color: string,
    font: string[],
    size: ExpressionSpecification,
  ): LayerSpecification => ({
    id,
    type: 'symbol',
    source: BASEMAP_SOURCE,
    'source-layer': 'place',
    minzoom,
    maxzoom,
    filter: classIn(...classes),
    layout: {
      'text-field': NAME,
      'text-font': font,
      'text-size': size,
      'text-max-width': 8,
      'text-padding': 3,
      // Larger places first, where labels compete for room.
      'symbol-sort-key': ['to-number', ['coalesce', ['get', 'rank'], 99]],
    },
    paint: { 'text-color': color, ...halo },
  })
  return [
    {
      id: FIRST_LABEL_LAYER,
      type: 'symbol',
      source: BASEMAP_SOURCE,
      'source-layer': 'waterway',
      minzoom: 13,
      filter: classIn('river', 'canal'),
      layout: {
        'text-field': NAME,
        'text-font': ITALIC,
        'text-size': 11,
        'symbol-placement': 'line',
        'text-letter-spacing': 0.05,
      },
      paint: { 'text-color': p.waterLabel, ...halo },
    },
    {
      // Lakes, bays and straits by name. Seas and oceans are left unnamed: they don't help find a center.
      id: 'label-water',
      type: 'symbol',
      source: BASEMAP_SOURCE,
      'source-layer': 'water_name',
      minzoom: 7,
      filter: [
        'all',
        ['==', ['geometry-type'], 'Point'],
        ['match', ['get', 'class'], ['ocean', 'sea'], false, true],
      ],
      layout: { 'text-field': NAME, 'text-font': ITALIC, 'text-size': 12, 'text-max-width': 7 },
      paint: { 'text-color': p.waterLabel, ...halo },
    },
    {
      id: 'label-road',
      type: 'symbol',
      source: BASEMAP_SOURCE,
      'source-layer': 'transportation_name',
      minzoom: 13,
      layout: {
        'text-field': NAME,
        'text-font': REGULAR,
        'text-size': byZoom(13, 10, 18, 13),
        'symbol-placement': 'line',
        'text-rotation-alignment': 'map',
      },
      paint: { 'text-color': p.roadLabel, ...halo },
    },
    {
      id: 'label-airport',
      type: 'symbol',
      source: BASEMAP_SOURCE,
      'source-layer': 'aerodrome_label',
      minzoom: 9,
      layout: { 'text-field': NAME, 'text-font': REGULAR, 'text-size': 11, 'text-max-width': 8 },
      paint: { 'text-color': p.label, ...halo },
    },
    place('label-island', ['island', 'islet'], 6, 13, p.village, ITALIC, byZoom(6, 10, 12, 13)),
    place(
      'label-village',
      ['village', 'hamlet', 'suburb', 'quarter', 'neighbourhood'],
      11,
      24,
      p.village,
      REGULAR,
      byZoom(11, 10.5, 16, 13),
    ),
    place('label-town', ['town'], 8, 24, p.town, REGULAR, byZoom(8, 11, 14, 14.5)),
    place('label-city', ['city'], 4, 24, p.city, BOLD, byZoom(4, 11, 8, 13.5, 13, 18)),
    place('label-country', ['country'], 3, 7, p.village, BOLD, byZoom(3, 10, 7, 13)),
  ]
}

export interface BasemapOptions {
  tiles: VectorTiles
  basemap: BasemapId
  theme: Theme
  /** Buildings with recorded heights are raised. */
  threeD: boolean
  /** Subtle relief, where the provider has elevation tiles and the device has room for them. */
  hillshade: boolean
}

/**
 * The base map: its sources and layers, without the centers' overlays (layers.ts adds those). Satellite falls back to
 * the everyday map for a provider without photos.
 */
export function basemapStyle({
  tiles,
  basemap,
  theme,
  threeD,
  hillshade,
}: BasemapOptions): StyleSpecification {
  const urls = providerUrls(tiles)
  const kind = basemap === 'satellite' && !urls.satellite ? 'map' : basemap
  const p = palette(theme, kind)
  const sources: Record<string, SourceSpecification> = {}
  const layers: LayerSpecification[] = [
    { id: 'background', type: 'background', paint: { 'background-color': p.land } },
  ]

  if (kind === 'standard') {
    // OpenStreetMap's own map, with night colors made by inverting its light and turning its hues back.
    sources.osm = {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: OSM_CREDIT,
    }
    layers.push({
      id: 'osm',
      type: 'raster',
      source: 'osm',
      paint:
        theme === 'dark'
          ? {
              'raster-brightness-min': 0.92,
              'raster-brightness-max': 0.08,
              'raster-hue-rotate': 180,
              'raster-saturation': -0.3,
              'raster-contrast': -0.1,
            }
          : {},
    })
    return { version: 8, sources, layers }
  }

  sources[BASEMAP_SOURCE] = {
    type: 'vector',
    url: urls.tiles,
    ...(urls.attribution ? { attribution: urls.attribution } : {}),
  }
  if (kind === 'satellite' && urls.satellite) {
    sources.satellite = { type: 'raster', url: urls.satellite, tileSize: 512 }
    layers.push({
      id: 'satellite',
      type: 'raster',
      source: 'satellite',
      paint: theme === 'dark' ? { 'raster-brightness-max': 0.85 } : {},
    })
    layers.push(...roadLayers(p, true), ...boundaryLayers(p), ...labelLayers(p))
    return { version: 8, sources, layers }
  }

  layers.push(...landLayers(p))
  if (hillshade && urls.terrain) {
    sources.terrain = { type: 'raster-dem', url: urls.terrain }
    layers.push({
      id: 'hillshade',
      type: 'hillshade',
      source: 'terrain',
      maxzoom: 15,
      paint: {
        // Relief for the islands' mountains at a glance, fading out at street level.
        'hillshade-exaggeration': ['interpolate', ['linear'], ['zoom'], 5, 0.3, 11, 0.2, 14, 0],
        'hillshade-shadow-color': p.hillshadeShadow,
        'hillshade-highlight-color': p.hillshadeHighlight,
        'hillshade-accent-color': p.hillshadeShadow,
      },
    })
  }
  layers.push(
    ...buildingLayers(p, threeD),
    ...roadLayers(p, false),
    ...boundaryLayers(p),
    extrusionLayer(p, threeD),
    ...labelLayers(p),
  )
  return {
    version: 8,
    // Soft light from the upper left: raised buildings get a gentle shade rather than hard grey sides.
    light: { anchor: 'viewport', color: p.light, intensity: theme === 'dark' ? 0.25 : 0.3 },
    sources,
    layers,
  }
}

/** The base maps a provider offers: satellite only where it has photos. */
export function basemapsFor(tiles: VectorTiles): BasemapId[] {
  return providerUrls(tiles).satellite
    ? ['map', 'light', 'satellite', 'standard']
    : ['map', 'light', 'standard']
}

/** Whether the base map draws the vector buildings, so 3D can be offered on it. */
export function hasVectorBuildings(basemap: BasemapId): boolean {
  return basemap === 'map' || basemap === 'light'
}
