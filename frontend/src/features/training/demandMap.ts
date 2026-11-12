import { queryOptions, useQuery } from '@tanstack/react-query'
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import boundaryUrl from './data/philippines-regions.json?url'
import type { DemandMapArea } from './CenterMapTypes.ts'

export const DEMAND_COLORS = ['#fff3c4', '#f5cf8a', '#ec91b8', '#c54b8c'] as const
export const NO_DEMAND_COLOR = '#b8bec8'
export interface RegionProperties {
  region_code: string
  name: string
  psgc: number
}
export type RegionBoundaries = FeatureCollection<Polygon | MultiPolygon, RegionProperties>
export interface DemandRegionProperties extends RegionProperties {
  posting_count: number | null
  color: string
  selected: boolean
}
export type DemandRegions = FeatureCollection<Polygon | MultiPolygon, DemandRegionProperties>

export const regionBoundariesQuery = queryOptions({
  queryKey: ['map', 'philippines-regions', '2026-3q'],
  queryFn: async ({ signal }): Promise<RegionBoundaries> => {
    const response = await fetch(boundaryUrl, { signal })
    if (!response.ok) throw new Error('Regional boundaries could not be loaded.')
    return response.json()
  },
  staleTime: Infinity,
})

export const useRegionBoundaries = (enabled = true) =>
  useQuery({ ...regionBoundariesQuery, enabled })

export function demandColor(count: number | null, maximum: number) {
  if (count === null || maximum <= 0) return NO_DEMAND_COLOR
  const share = count / maximum
  return DEMAND_COLORS[share >= 0.65 ? 3 : share >= 0.15 ? 2 : share >= 0.04 ? 1 : 0]
}

export function demandRegions(
  boundaries: RegionBoundaries | undefined,
  areas: readonly DemandMapArea[] | undefined,
  selected?: string | null,
): DemandRegions {
  if (!boundaries || !areas) return { type: 'FeatureCollection', features: [] }
  const counts = new Map(areas.map((area) => [area.region_code, area.posting_count]))
  const maximum = Math.max(0, ...counts.values())
  return {
    type: 'FeatureCollection',
    features: boundaries.features.map((feature) => {
      const count = counts.get(feature.properties.region_code) ?? null
      return {
        ...feature,
        properties: {
          ...feature.properties,
          posting_count: count,
          color: demandColor(count, maximum),
          selected: feature.properties.region_code === selected,
        },
      }
    }),
  }
}

/** Frame the actual selected shape, including all islands, rather than zooming to a reference point. */
export function demandBounds(
  data: DemandRegions,
  code?: string | null,
): [[number, number], [number, number]] | null {
  let west = Infinity,
    south = Infinity,
    east = -Infinity,
    north = -Infinity
  const visit = (coordinates: unknown) => {
    if (!Array.isArray(coordinates)) return
    if (typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
      west = Math.min(west, coordinates[0])
      east = Math.max(east, coordinates[0])
      south = Math.min(south, coordinates[1])
      north = Math.max(north, coordinates[1])
    } else coordinates.forEach(visit)
  }
  data.features
    .filter((feature) => !code || feature.properties.region_code === code)
    .forEach((feature) => visit(feature.geometry.coordinates))
  return Number.isFinite(west)
    ? [
        [west, south],
        [east, north],
      ]
    : null
}

/** Canvas maps keep a keyboard target over each filled region; its label appears on focus. */
export function demandSymbol(area: DemandMapArea, selected: boolean, label: string) {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'demand-region-hit'
  element.setAttribute('aria-label', label)
  element.setAttribute('aria-pressed', String(selected))
  element.title = `${label}\n${area.titles.join(' · ')}`
  const text = document.createElement('span')
  text.textContent = `${area.region_code} · ${area.posting_count.toLocaleString()}`
  text.setAttribute('aria-hidden', 'true')
  element.append(text)
  return element
}
