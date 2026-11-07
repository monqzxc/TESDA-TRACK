import type { Map as MapLibreMap, MapGeoJSONFeature } from 'maplibre-gl'
import { describe, expect, it } from 'vitest'
import { LAYERS } from './layers.ts'
import { ROUTE_END, renderedTargets } from './markers.ts'

const feature = (
  layer: string,
  properties: Record<string, unknown>,
  coordinates: [number, number],
) =>
  ({
    layer: { id: layer },
    properties,
    geometry: { type: 'Point', coordinates },
  }) as unknown as MapGeoJSONFeature

/** A map drawing these features, whose screen is the coordinates scaled: north is up. */
function drawing(
  features: MapGeoJSONFeature[],
  layers: string[] = [LAYERS.pins, LAYERS.clusters, LAYERS.selected],
) {
  return {
    getLayer: (id: string) => (layers.includes(id) ? { id } : undefined),
    queryRenderedFeatures: () => features,
    project: ([lng, lat]: [number, number]) => ({ x: lng * 100, y: -lat * 100 }),
  } as unknown as MapLibreMap
}

describe('the pins and clusters on screen', () => {
  it('lists each once, top to bottom, for the buttons laid over them', () => {
    const map = drawing([
      feature(LAYERS.pins, { id: 'training-2', kind: 'training' }, [123.9, 10.3]),
      feature(LAYERS.clusters, { cluster_id: 7, point_count: 2 }, [121.0, 14.6]),
      // The same pin again, from a neighbouring tile.
      feature(LAYERS.pins, { id: 'training-2', kind: 'training' }, [123.9, 10.3]),
      feature(LAYERS.selected, { id: 'training-1', kind: 'training' }, [121.02, 14.55]),
    ])
    expect(renderedTargets(map, LAYERS)).toEqual([
      {
        key: 'cluster:7',
        type: 'cluster',
        lngLat: [121.0, 14.6],
        selected: false,
        clusterId: 7,
        count: 2,
      },
      {
        key: 'pin:training-1',
        type: 'pin',
        lngLat: [121.02, 14.55],
        selected: true,
        centerId: 'training-1',
      },
      {
        key: 'pin:training-2',
        type: 'pin',
        lngLat: [123.9, 10.3],
        selected: false,
        centerId: 'training-2',
      },
    ])
  })

  it('leaves out the pin that only marks a route’s end', () => {
    const map = drawing([
      feature(LAYERS.selected, { id: ROUTE_END, kind: 'training' }, [121, 14.6]),
    ])
    expect(renderedTargets(map, LAYERS)).toEqual([])
  })

  it('adds at most a set number of buttons, however crowded the view', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      feature(LAYERS.pins, { id: `training-${i}` }, [121, 14 + i / 100]),
    )
    expect(renderedTargets(drawing(many), LAYERS, 10)).toHaveLength(10)
  })

  it('has nothing to list while a new style is swapped in and its layers are missing', () => {
    expect(renderedTargets(drawing([], []), LAYERS)).toEqual([])
  })
})
