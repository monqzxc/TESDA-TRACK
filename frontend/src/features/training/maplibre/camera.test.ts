import { describe, expect, it } from 'vitest'
import type { Center } from '../centers.ts'
import {
  PHILIPPINES,
  boundsOf,
  circleBounds,
  frameResults,
  insidePadding,
  motion,
  overlayPadding,
  paddedOffset,
} from './camera.ts'

const center = (
  id: string,
  latitude: number | null,
  longitude: number | null,
  distanceKm: number | null = null,
) => ({ id, latitude, longitude, distanceKm }) as Center

const MAKATI = { latitude: 14.5547, longitude: 121.0244 }

describe('framing the results', () => {
  it('shows the whole country without results or a place', () => {
    expect(frameResults({ points: [], reference: null, radiusKm: null })).toEqual({
      bounds: PHILIPPINES,
      margin: 0,
    })
  })

  it('shows a searched place at a city’s zoom when nothing is near it', () => {
    expect(frameResults({ points: [], reference: MAKATI, radiusKm: null })).toEqual({
      center: [121.0244, 14.5547],
      zoom: 9,
    })
  })

  it('fits an active radius, even without results, without zooming in past street level', () => {
    const frame = frameResults({ points: [], reference: MAKATI, radiusKm: 10 })
    expect(frame).toMatchObject({ maxZoom: 13 })
    if (!('bounds' in frame)) throw new Error('expected bounds')
    const [[west, south], [east, north]] = frame.bounds
    // 10 km each way: about 0.09° of latitude, a little more of longitude this far from the equator.
    expect(north - south).toBeCloseTo(0.181, 2)
    expect(east - west).toBeCloseTo(0.186, 2)
  })

  it('fits every mapped center without a place, leaving out those without coordinates', () => {
    const frame = frameResults({
      points: [center('a', 14.6, 121.0), center('b', 10.3, 123.9), center('c', null, null)],
      reference: null,
      radiusKm: null,
    })
    expect(frame).toEqual({
      bounds: [
        [121.0, 10.3],
        [123.9, 14.6],
      ],
      maxZoom: 13,
      margin: 40,
    })
  })

  it('keeps a place with its six closest centers, rather than the whole country', () => {
    const near = Array.from({ length: 6 }, (_, i) =>
      center(`n${i}`, 14.55 + i * 0.01, 121.0, i + 1),
    )
    const far = center('far', 7.07, 125.6, 950)
    const frame = frameResults({ points: [far, ...near], reference: MAKATI, radiusKm: null })
    if (!('bounds' in frame)) throw new Error('expected bounds')
    expect(frame.bounds[0][1]).toBeGreaterThan(14)
    expect(frame.bounds[1][0]).toBeLessThan(122)
  })

  it('finds the corners of any set of points', () => {
    expect(
      boundsOf([
        [121, 14],
        [120, 15],
        [122, 13.5],
      ]),
    ).toEqual([
      [120, 13.5],
      [122, 15],
    ])
    expect(circleBounds(MAKATI, 0)).toEqual([
      [121.0244, 14.5547],
      [121.0244, 14.5547],
    ])
  })
})

describe('room around the map’s controls', () => {
  it('keeps clear of the buttons on the right, the legend below, and the filter panel on the left', () => {
    const padding = overlayPadding({ width: 900, height: 680 }, 388, 40)
    expect(padding).toEqual({ top: 48, right: 64, bottom: 92, left: 436 })
  })

  it('takes a larger share of a phone’s map for its controls', () => {
    expect(overlayPadding({ width: 380, height: 460 }, 0, 24)).toEqual({
      top: 36,
      right: 64,
      bottom: 68,
      left: 32,
    })
  })

  it('never asks for more than a small map has, so fitting it never fails', () => {
    const padding = overlayPadding({ width: 300, height: 200 }, 388, 40)
    expect(padding.left + padding.right).toBeLessThanOrEqual(300 - 80)
    expect(padding.top + padding.bottom).toBeLessThanOrEqual(200 - 80)
  })

  it('tells whether a point is in the clear part, and how to center in it', () => {
    const size = { width: 900, height: 680 }
    const padding = overlayPadding(size, 388, 40)
    expect(insidePadding({ x: 600, y: 300 }, size, padding)).toBe(true)
    expect(insidePadding({ x: 200, y: 300 }, size, padding)).toBe(false)
    expect(paddedOffset(padding)).toEqual([186, -22])
  })

  it('moves at once for a learner who asked their device for less motion', () => {
    expect(motion(true)).toEqual({ duration: 0, essential: true })
    expect(motion(false, 500)).toEqual({ duration: 500, essential: true })
  })
})
