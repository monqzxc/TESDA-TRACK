import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DemandMapArea } from './CenterMapTypes.ts'
import { DemandLegend } from './DemandLegend.tsx'
import {
  DEMAND_COLORS,
  NO_DEMAND_COLOR,
  demandColor,
  demandBounds,
  demandRegions,
  demandSymbol,
  type RegionBoundaries,
} from './demandMap.ts'
import geometry from './data/philippines-regions.json'

const area = (count: number, code = 'NCR'): DemandMapArea => ({
  region_code: code,
  name: code,
  latitude: 14.6,
  longitude: 121,
  posting_count: count,
  titles: ['Customer service assistant'],
})

describe('regional demand heatmap', () => {
  it('colors regions by posting volume and keeps missing evidence separate', () => {
    expect(demandColor(1000, 1000)).toBe(DEMAND_COLORS[3])
    expect(demandColor(250, 1000)).toBe(DEMAND_COLORS[2])
    expect(demandColor(6, 1000)).toBe(DEMAND_COLORS[0])
    expect(demandColor(null, 1000)).toBe(NO_DEMAND_COLOR)
  })

  it('joins all 18 real boundaries by region code, preserving geometry and unknown counts', () => {
    const boundaries = geometry as RegionBoundaries
    const data = demandRegions(boundaries, [area(1954), area(6, 'XII')], 'NCR')
    expect(data.features).toHaveLength(18)
    expect(data.features.find((f) => f.properties.region_code === 'NCR')?.properties).toMatchObject(
      { posting_count: 1954, selected: true, color: DEMAND_COLORS[3] },
    )
    expect(
      data.features.find((f) => f.properties.region_code === 'BARMM')?.properties,
    ).toMatchObject({ posting_count: null, color: NO_DEMAND_COLOR })
    expect(data.features.some((f) => f.properties.region_code === 'NIR')).toBe(true)
    expect(data.features[0].geometry).toBe(boundaries.features[0].geometry)
    expect(boundaries.features[0].properties).not.toHaveProperty('posting_count')
    expect(demandRegions(undefined, []).features).toEqual([])
    const bounds = demandBounds(data, 'NCR')!
    expect(bounds[0][0]).toBeGreaterThan(120)
    expect(bounds[1][0]).toBeLessThan(122)
    expect(bounds[1][1] - bounds[0][1]).toBeGreaterThan(0.4)
    expect(demandBounds(data, 'unknown')).toBeNull()
  })

  it('keeps small areas reachable and exposes exact counts without injecting source HTML', () => {
    const item = { ...area(6), titles: ['<img src=x onerror=alert(1)>'] }
    const symbol = demandSymbol(item, true, 'NCR: 6 posting records')
    expect(symbol.tagName).toBe('BUTTON')
    expect(symbol.getAttribute('aria-label')).toBe('NCR: 6 posting records')
    expect(symbol.getAttribute('aria-pressed')).toBe('true')
    expect(symbol.title).toContain(item.titles[0])
    expect(symbol.querySelector('img')).toBeNull()
    expect(symbol.querySelector('span')).toHaveTextContent('NCR · 6')
  })

  it('shows the real regional range, units, scope and snapshot date in the legend', () => {
    render(<DemandLegend areas={[area(1954), area(6, 'XII')]} dates={['2026-11-04']} />)
    expect(screen.getByText('6–1,954')).toBeVisible()
    expect(screen.getByText('Fewer postings')).toBeVisible()
    expect(screen.getByText('More postings')).toBeVisible()
    expect(screen.getByText(/Deeper colors show more recorded postings/)).toBeVisible()
    expect(screen.getByText('No posting records in this snapshot')).toBeVisible()
    expect(screen.getByText('Snapshot: 2026-11-04.')).toBeVisible()
  })
})
