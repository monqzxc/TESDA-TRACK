import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec'
import { describe, expect, it } from 'vitest'
import { distanceKm, type Center } from '../centers.ts'
import {
  CLUSTER_RADIUS,
  EMPTY_OVERLAYS,
  LAYERS,
  ROUTE_LAYERS,
  SOURCES,
  centerPoints,
  circleRing,
  radiusArea,
  referencePoint,
  withOverlays,
} from './layers.ts'
import { basemapStyle, FIRST_LABEL_LAYER } from './styles.ts'

const center = (
  id: string,
  kind: Center['kind'],
  latitude: number | null,
  longitude: number | null,
) => ({ id, kind, latitude, longitude }) as Center
const MAKATI = { latitude: 14.5547, longitude: 121.0244, label: 'you', mine: true }

describe('the overlays’ data', () => {
  it('has a point per mapped center, in longitude and latitude order, but not those drawn as selected', () => {
    const points = centerPoints(
      [
        center('training-1', 'training', 14.6, 121.0),
        center('assessment-2', 'assessment', null, null),
        center('training-3', 'training', 10.3, 123.9),
      ],
      new Set(['training-3']),
    )
    expect(points.features).toEqual([
      {
        type: 'Feature',
        properties: { id: 'training-1', kind: 'training' },
        geometry: { type: 'Point', coordinates: [121.0, 14.6] },
      },
    ])
  })

  it('draws a radius that stays round on the ground: every point is that far from its center', () => {
    const ring = circleRing(MAKATI, 10)
    expect(ring[0]).toEqual(ring[ring.length - 1])
    for (const [longitude, latitude] of ring) {
      expect(distanceKm(MAKATI, { latitude, longitude })).toBeCloseTo(10, 6)
    }
  })

  it('has no radius without a place or a distance, and no reference without a place', () => {
    expect(radiusArea(null, 10).features).toEqual([])
    expect(radiusArea(MAKATI, null).features).toEqual([])
    expect(radiusArea(MAKATI, 10).features[0].geometry.type).toBe('Polygon')
    expect(referencePoint(null).features).toEqual([])
    expect(referencePoint(MAKATI).features[0].properties).toEqual({ mine: true })
  })
})

describe('the overlays over the base map', () => {
  const base = basemapStyle({
    tiles: { provider: 'maptiler', key: 'k' },
    basemap: 'map',
    theme: 'light',
    threeD: false,
    hillshade: false,
  })

  it('make a valid style, with the radius and routes under the labels and the pins on top', () => {
    const style = withOverlays(base, EMPTY_OVERLAYS, 'light')
    expect(validateStyleMin(style)).toEqual([])
    const ids = style.layers.map((layer) => layer.id)
    expect(ids.indexOf(LAYERS.radiusFill)).toBeLessThan(ids.indexOf(FIRST_LABEL_LAYER))
    expect(ids.indexOf('center-route-chosen-line')).toBeLessThan(ids.indexOf(FIRST_LABEL_LAYER))
    expect(ids.slice(-4)).toEqual([
      LAYERS.clusters,
      LAYERS.pins,
      LAYERS.recommended,
      LAYERS.selected,
    ])
  })

  it('cluster centers closer than Leaflet’s 46 pixels, even at the deepest zoom', () => {
    const style = withOverlays(base, EMPTY_OVERLAYS, 'light')
    expect(style.sources[SOURCES.centers]).toMatchObject({
      type: 'geojson',
      cluster: true,
      clusterRadius: CLUSTER_RADIUS,
      clusterMaxZoom: 19,
      maxzoom: 20,
    })
    expect(CLUSTER_RADIUS).toBe(46)
  })

  it('hide the routes, and with them the router’s credit, until there is a route', () => {
    const hidden = withOverlays(base, EMPTY_OVERLAYS, 'light')
    const routeLayers = hidden.layers.filter((layer) =>
      (ROUTE_LAYERS as readonly string[]).includes(layer.id),
    )
    expect(routeLayers).toHaveLength(ROUTE_LAYERS.length)
    expect(routeLayers.every((layer) => layer.layout?.visibility === 'none')).toBe(true)
    expect(hidden.sources[SOURCES.routes]).toMatchObject({
      attribution: expect.stringContaining('OSRM'),
    })

    const route = {
      ...EMPTY_OVERLAYS,
      routes: {
        type: 'FeatureCollection' as const,
        features: [
          {
            type: 'Feature' as const,
            properties: { mode: 'car' as const, chosen: true, plane: false, connector: false },
            geometry: {
              type: 'LineString' as const,
              coordinates: [
                [121, 14.5],
                [121.1, 14.6],
              ],
            },
          },
        ],
      },
    }
    const shown = withOverlays(base, route, 'light')
    expect(
      shown.layers
        .filter((layer) => (ROUTE_LAYERS as readonly string[]).includes(layer.id))
        .every((layer) => layer.layout?.visibility === 'visible'),
    ).toBe(true)
  })

  it('draw a searched place’s dot in the app’s navy by day and its blue at night', () => {
    const color = (theme: 'light' | 'dark') =>
      JSON.stringify(
        withOverlays(base, EMPTY_OVERLAYS, theme).layers.find(
          (layer) => layer.id === LAYERS.referenceDot,
        ),
      )
    expect(color('light')).toContain('#102a56')
    expect(color('dark')).toContain('#2f6fe0')
  })
})
