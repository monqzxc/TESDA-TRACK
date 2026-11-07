import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec'
import type {
  FillExtrusionLayerSpecification,
  FillLayerSpecification,
} from '@maplibre/maplibre-gl-style-spec'
import { describe, expect, it } from 'vitest'
import type { VectorTiles } from '../mapSettings.ts'
import {
  BUILDING_3D,
  BUILDING_FLAT,
  FIRST_LABEL_LAYER,
  basemapStyle,
  basemapsFor,
  hasVectorBuildings,
  palette,
  providerUrls,
  type BasemapId,
  type Theme,
} from './styles.ts'

const MAPTILER: VectorTiles = { provider: 'maptiler', key: 'public key+1' }
const CUSTOM: VectorTiles = { provider: 'custom', tilesUrl: 'https://tiles.example.ph/planet' }

const layer = <T>(style: ReturnType<typeof basemapStyle>, id: string) =>
  style.layers.find((item) => item.id === id) as T | undefined

describe('the base map style', () => {
  it('is a valid MapLibre style for every base map, theme, provider and 2D or 3D', () => {
    for (const tiles of [MAPTILER, CUSTOM]) {
      for (const basemap of ['map', 'light', 'satellite', 'standard'] as BasemapId[]) {
        for (const theme of ['light', 'dark'] as Theme[]) {
          for (const threeD of [false, true]) {
            for (const hillshade of [false, true]) {
              const style = basemapStyle({ tiles, basemap, theme, threeD, hillshade })
              expect(validateStyleMin(style), `${tiles.provider} ${basemap} ${theme}`).toEqual([])
            }
          }
        }
      }
    }
  })

  it('puts the MapTiler key in each address, encoded, and credits MapTiler and OpenStreetMap', () => {
    const urls = providerUrls(MAPTILER)
    expect(urls.tiles).toBe('https://api.maptiler.com/tiles/v3/tiles.json?key=public%20key%2B1')
    expect(urls.terrain).toBe(
      'https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=public%20key%2B1',
    )
    expect(urls.attribution).toMatch(/MapTiler/)
    expect(urls.attribution).toMatch(/OpenStreetMap contributors/)
    expect(urls.logo?.src).toBe('https://api.maptiler.com/resources/logo.svg')
  })

  it('reads another provider’s tiles as given, crediting it from its own TileJSON', () => {
    const style = basemapStyle({
      tiles: CUSTOM,
      basemap: 'map',
      theme: 'light',
      threeD: false,
      hillshade: true,
    })
    expect(style.sources.basemap).toEqual({ type: 'vector', url: CUSTOM.tilesUrl })
    // No elevation tiles to shade from.
    expect(style.sources.terrain).toBeUndefined()
    expect(basemapsFor(CUSTOM)).toEqual(['map', 'light', 'standard'])
  })

  it('offers satellite photos only where the provider has them', () => {
    expect(basemapsFor(MAPTILER)).toContain('satellite')
    const style = basemapStyle({
      tiles: CUSTOM,
      basemap: 'satellite',
      theme: 'light',
      threeD: false,
      hillshade: false,
    })
    expect(style.sources.satellite).toBeUndefined()
    expect(layer(style, 'water')).toBeDefined()
  })

  it('shades relief only when asked, from MapTiler’s elevation tiles', () => {
    const shaded = basemapStyle({
      tiles: MAPTILER,
      basemap: 'map',
      theme: 'light',
      threeD: false,
      hillshade: true,
    })
    expect(shaded.sources.terrain).toMatchObject({ type: 'raster-dem' })
    expect(layer(shaded, 'hillshade')).toBeDefined()
    const flat = basemapStyle({
      tiles: MAPTILER,
      basemap: 'map',
      theme: 'light',
      threeD: false,
      hillshade: false,
    })
    expect(flat.sources.terrain).toBeUndefined()
  })

  it('draws OpenStreetMap’s own raster map, inverted for the night', () => {
    const night = basemapStyle({
      tiles: MAPTILER,
      basemap: 'standard',
      theme: 'dark',
      threeD: false,
      hillshade: false,
    })
    expect(night.sources.osm).toMatchObject({
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    })
    expect(layer(night, 'osm')).toMatchObject({ paint: { 'raster-hue-rotate': 180 } })
    expect(hasVectorBuildings('standard')).toBe(false)
    expect(hasVectorBuildings('satellite')).toBe(false)
  })

  it('draws labels in the app’s own font, without a font server', () => {
    for (const basemap of ['map', 'satellite'] as BasemapId[]) {
      const style = basemapStyle({
        tiles: MAPTILER,
        basemap,
        theme: 'light',
        threeD: false,
        hillshade: false,
      })
      expect(style.glyphs).toBeUndefined()
      const fonts = style.layers.flatMap((item) =>
        item.type === 'symbol' && item.layout?.['text-font'] ? [item.layout['text-font']] : [],
      )
      expect(fonts.length).toBeGreaterThan(0)
      for (const font of fonts)
        expect(font).toEqual([expect.stringMatching(/^Figtree /), 'Figtree'])
    }
  })

  it('keeps labels above the overlays that go under them', () => {
    const style = basemapStyle({
      tiles: MAPTILER,
      basemap: 'map',
      theme: 'light',
      threeD: true,
      hillshade: false,
    })
    const ids = style.layers.map((item) => item.id)
    expect(ids.indexOf(FIRST_LABEL_LAYER)).toBeGreaterThan(ids.indexOf('road-motorway'))
    expect(ids.indexOf(FIRST_LABEL_LAYER)).toBeGreaterThan(ids.indexOf(BUILDING_3D))
    expect(
      style.layers.slice(ids.indexOf(FIRST_LABEL_LAYER)).every((item) => item.type === 'symbol'),
    ).toBe(true)
  })
})

describe('3D buildings', () => {
  const style = (threeD: boolean) =>
    basemapStyle({ tiles: MAPTILER, basemap: 'map', theme: 'light', threeD, hillshade: false })

  it('raise only buildings with a recorded height, to that height', () => {
    const extrusion = layer<FillExtrusionLayerSpecification>(style(true), BUILDING_3D)
    expect(extrusion?.layout?.visibility).toBe('visible')
    // OpenMapTiles gives a building without a height 5 m: those aren't raised.
    expect(JSON.stringify(extrusion?.filter)).toContain(
      '["to-number",["coalesce",["get","render_height"],0]],5',
    )
    expect(JSON.stringify(extrusion?.paint?.['fill-extrusion-height'])).toContain('render_height')
    expect(JSON.stringify(extrusion?.paint?.['fill-extrusion-base'])).toContain('render_min_height')
  })

  it('leave buildings without a height flat in 3D, and every building flat in 2D', () => {
    const flat3d = layer<FillLayerSpecification>(style(true), BUILDING_FLAT)
    expect(JSON.stringify(flat3d?.filter)).toContain('"!"')
    const flat2d = layer<FillLayerSpecification>(style(false), BUILDING_FLAT)
    expect(flat2d?.filter).toBeUndefined()
    expect(
      layer<FillExtrusionLayerSpecification>(style(false), BUILDING_3D)?.layout?.visibility,
    ).toBe('none')
  })
})

describe('palettes', () => {
  it('follow the app’s light and dark colors, with distinct land and water in each', () => {
    const light = palette('light')
    const dark = palette('dark')
    expect(light.city).toBe('#102a56')
    expect(dark.labelHalo).toBe('#0b1630')
    for (const p of [light, dark, palette('light', 'light'), palette('dark', 'light')]) {
      expect(p.land).not.toBe(p.water)
      expect(p.label).not.toBe(p.labelHalo)
    }
  })

  it('keep labels readable over satellite photos in either theme', () => {
    expect(palette('light', 'satellite').label).toBe('#ffffff')
    expect(palette('dark', 'satellite').label).toBe('#ffffff')
  })
})
