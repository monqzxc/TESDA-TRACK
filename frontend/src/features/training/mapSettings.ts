import type { ClientConfig } from './api.ts'

// Which renderer draws the center map, and from which vector tiles (docs/center-map.md). The deployment's settings
// come from the API (GET /api/v1/client-config, as the CARTO key does), so one build runs everywhere; a build's own
// VITE_ variables fill in for an API that doesn't send them. Either side can turn MapLibre or 3D off.

export type MapEngine = 'maplibre' | 'leaflet'

/** OpenMapTiles-schema vector tiles: MapTiler's, or another source given by its TileJSON. */
export type VectorTiles =
  { provider: 'maptiler'; key: string } | { provider: 'custom'; tilesUrl: string }

export interface MapSettings {
  engine: MapEngine
  /** Null when no vector tiles are set up: the map stays on Leaflet's raster tiles. */
  tiles: VectorTiles | null
  /** 3D buildings may be offered, where the tiles record building heights. */
  buildings3d: boolean
}

export type BuildSettings = Pick<
  ImportMetaEnv,
  'VITE_MAP_ENGINE' | 'VITE_MAPTILER_KEY' | 'VITE_MAP_TILES_URL' | 'VITE_MAP_3D_ENABLED'
>

type ServerSettings = Partial<
  Pick<ClientConfig, 'map_engine' | 'maptiler_key' | 'map_tiles_url' | 'map_3d'>
>

const OFF = new Set(['false', '0', 'off', 'no'])

/**
 * An address the browser can fetch tiles from: https, or http when the page itself is (local development). An https
 * page can't load http tiles.
 */
function usableUrl(value: string | undefined, pageProtocol: string): string | null {
  const text = value?.trim()
  if (!text) return null
  try {
    const { protocol } = new URL(text)
    return protocol === 'https:' || (pageProtocol === 'http:' && protocol === 'http:') ? text : null
  } catch {
    return null
  }
}

function vectorTiles(
  key: string | undefined,
  tilesUrl: string | undefined,
  pageProtocol: string,
): VectorTiles | null {
  const tiles = usableUrl(tilesUrl, pageProtocol)
  if (tiles) return { provider: 'custom', tilesUrl: tiles }
  const trimmed = key?.trim()
  return trimmed ? { provider: 'maptiler', key: trimmed } : null
}

/**
 * The renderer to use: MapLibre where vector tiles are set up, the settings allow it, the browser has WebGL 2, and
 * MapLibre hasn't already failed during this visit; Leaflet everywhere else. `webgl2` is asked only when it matters,
 * since checking makes a WebGL context.
 */
export function chooseRenderer(
  settings: MapSettings,
  webgl2: () => boolean,
  failed: boolean,
): MapEngine {
  return settings.engine === 'maplibre' && settings.tiles && !failed && webgl2()
    ? 'maplibre'
    : 'leaflet'
}

/** The center map's settings, from the API's client-config and the build's own variables. */
export function mapSettings(
  server: ServerSettings | undefined,
  build: BuildSettings = import.meta.env,
  pageProtocol: string = typeof window === 'undefined' ? 'https:' : window.location.protocol,
): MapSettings {
  const leaflet =
    server?.map_engine === 'leaflet' || build.VITE_MAP_ENGINE?.trim().toLowerCase() === 'leaflet'
  const tiles =
    vectorTiles(server?.maptiler_key, server?.map_tiles_url, pageProtocol) ??
    vectorTiles(build.VITE_MAPTILER_KEY, build.VITE_MAP_TILES_URL, pageProtocol)
  const buildings3d =
    server?.map_3d !== false && !OFF.has(build.VITE_MAP_3D_ENABLED?.trim().toLowerCase() ?? '')
  return { engine: leaflet ? 'leaflet' : 'maplibre', tiles, buildings3d }
}
