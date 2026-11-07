import { describe, expect, it } from 'vitest'
import type { TravelRoute } from '../api.ts'
import { LABEL_AT, chosenMode, routeCorners, routeFeatures, routeLabels } from './routing.ts'

const ROUTE = {
  from: { latitude: 14.5547, longitude: 121.0244 },
  to: { latitude: 14.5995, longitude: 120.9842 },
  kind: 'training' as const,
}
const road = (mode: 'car' | 'foot', path: number[][]): TravelRoute => ({
  mode,
  path,
  start: path[0],
  end: path[path.length - 1],
  distance_km: 10,
  duration_min: 20,
})
const CAR = road('car', [
  [14.555, 121.024],
  [14.58, 121.0],
  [14.599, 120.985],
])
const FOOT = road('foot', [
  [14.555, 121.024],
  [14.57, 121.01],
  [14.59, 120.99],
  [14.599, 120.985],
])

describe('the routes as map data', () => {
  it('has a line per travel mode, in longitude and latitude order, with the chosen one marked', () => {
    const { features } = routeFeatures(ROUTE, [CAR, FOOT], 'foot')
    const lines = features.filter((feature) => !feature.properties.connector)
    expect(lines.map((feature) => [feature.properties.mode, feature.properties.chosen])).toEqual([
      ['car', false],
      ['foot', true],
    ])
    expect(lines[0].geometry.coordinates[0]).toEqual([121.024, 14.555])
  })

  it('links the chosen route to the learner and the center where there’s no road', () => {
    const connectors = routeFeatures(ROUTE, [CAR, FOOT], 'car').features.filter(
      (feature) => feature.properties.connector,
    )
    expect(connectors.map((feature) => feature.geometry.coordinates)).toEqual([
      [
        [121.0244, 14.5547],
        [121.024, 14.555],
      ],
      [
        [120.985, 14.599],
        [120.9842, 14.5995],
      ],
    ])
    expect(
      connectors.every((feature) => feature.properties.chosen && feature.properties.mode === 'car'),
    ).toBe(true)
  })

  it('shows the mode chosen when the router found it, else the first it found', () => {
    expect(chosenMode([CAR, FOOT], 'foot')).toBe('foot')
    expect(chosenMode([CAR, FOOT], 'bike')).toBe('car')
    expect(chosenMode([], 'car')).toBeUndefined()
  })

  it('places each label partway along its own route, so labels on shared roads don’t cover each other', () => {
    expect(routeLabels([CAR, FOOT])).toEqual([
      { mode: 'car', lngLat: [121.0, 14.58] },
      { mode: 'foot', lngLat: [120.99, 14.59] },
    ])
    expect(LABEL_AT.car).not.toBe(LABEL_AT.foot)
  })

  it('frames the routes by every point they reach', () => {
    expect(routeCorners(ROUTE, [CAR])).toEqual([
      [121.0244, 14.5547],
      [120.9842, 14.5995],
      [121.024, 14.555],
      [121.0, 14.58],
      [120.985, 14.599],
    ])
  })
})
