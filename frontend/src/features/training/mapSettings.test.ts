import { describe, expect, it, vi } from 'vitest'
import { chooseRenderer, mapSettings, type BuildSettings } from './mapSettings.ts'

const NO_BUILD: BuildSettings = {}

describe('the center map’s settings', () => {
  it('have no vector tiles without a key or tiles: the map stays on Leaflet', () => {
    const settings = mapSettings(undefined, NO_BUILD, 'https:')
    expect(settings).toEqual({ engine: 'maplibre', tiles: null, buildings3d: true })
    expect(chooseRenderer(settings, () => true, false)).toBe('leaflet')
  })

  it('use the API’s MapTiler key, trimmed', () => {
    expect(mapSettings({ maptiler_key: '  public-key ' }, NO_BUILD, 'https:').tiles).toEqual({
      provider: 'maptiler',
      key: 'public-key',
    })
  })

  it('prefer another OpenMapTiles source the API names, at an address the page can fetch', () => {
    const tiles = { map_tiles_url: 'https://tiles.example.ph/planet', maptiler_key: 'public-key' }
    expect(mapSettings(tiles, NO_BUILD, 'https:').tiles).toEqual({
      provider: 'custom',
      tilesUrl: 'https://tiles.example.ph/planet',
    })
    // An https page can't fetch http tiles: the key is used instead.
    expect(
      mapSettings({ ...tiles, map_tiles_url: 'http://tiles.example.ph/planet' }, NO_BUILD, 'https:')
        .tiles,
    ).toEqual({ provider: 'maptiler', key: 'public-key' })
    // Local development, over http, may.
    expect(
      mapSettings({ map_tiles_url: 'http://localhost:8080/planet' }, NO_BUILD, 'http:').tiles,
    ).toEqual({ provider: 'custom', tilesUrl: 'http://localhost:8080/planet' })
    expect(mapSettings({ map_tiles_url: 'not an address' }, NO_BUILD, 'https:').tiles).toBeNull()
  })

  it('fall back to the build’s own variables for an API that doesn’t send them', () => {
    const build: BuildSettings = { VITE_MAPTILER_KEY: 'build-key' }
    // An API older than this release: no map fields at all.
    expect(mapSettings({}, build, 'https:').tiles).toEqual({
      provider: 'maptiler',
      key: 'build-key',
    })
    expect(mapSettings({ maptiler_key: 'api-key' }, build, 'https:').tiles).toEqual({
      provider: 'maptiler',
      key: 'api-key',
    })
    expect(
      mapSettings({}, { VITE_MAP_TILES_URL: 'https://tiles.example.ph/planet' }, 'https:').tiles,
    ).toEqual({ provider: 'custom', tilesUrl: 'https://tiles.example.ph/planet' })
  })

  it('keep Leaflet when either the API or the build asks for it', () => {
    expect(
      mapSettings({ map_engine: 'leaflet', maptiler_key: 'k' }, NO_BUILD, 'https:').engine,
    ).toBe('leaflet')
    expect(
      mapSettings({ maptiler_key: 'k' }, { VITE_MAP_ENGINE: ' Leaflet ' }, 'https:').engine,
    ).toBe('leaflet')
    expect(
      mapSettings({ map_engine: 'maplibre' }, { VITE_MAP_ENGINE: 'maplibre' }, 'https:').engine,
    ).toBe('maplibre')
  })

  it('turn 3D buildings off when either the API or the build does', () => {
    expect(mapSettings({ map_3d: false }, NO_BUILD, 'https:').buildings3d).toBe(false)
    for (const off of ['false', '0', 'off', 'NO']) {
      expect(
        mapSettings({ map_3d: true }, { VITE_MAP_3D_ENABLED: off }, 'https:').buildings3d,
      ).toBe(false)
    }
    expect(
      mapSettings({ map_3d: true }, { VITE_MAP_3D_ENABLED: 'true' }, 'https:').buildings3d,
    ).toBe(true)
  })
})

describe('choosing the renderer', () => {
  const maplibre = mapSettings({ maptiler_key: 'k' }, NO_BUILD, 'https:')

  it('picks MapLibre only with vector tiles, WebGL 2, and no failure yet during this visit', () => {
    expect(chooseRenderer(maplibre, () => true, false)).toBe('maplibre')
    expect(chooseRenderer(maplibre, () => false, false)).toBe('leaflet')
    expect(chooseRenderer(maplibre, () => true, true)).toBe('leaflet')
    expect(chooseRenderer({ ...maplibre, engine: 'leaflet' }, () => true, false)).toBe('leaflet')
  })

  it('checks for WebGL 2 only when it matters, since checking makes a context', () => {
    const webgl2 = vi.fn(() => true)
    chooseRenderer(mapSettings({}, NO_BUILD, 'https:'), webgl2, false)
    chooseRenderer({ ...maplibre, engine: 'leaflet' }, webgl2, false)
    chooseRenderer(maplibre, webgl2, true)
    expect(webgl2).not.toHaveBeenCalled()
  })
})
