import { describe, expect, it } from 'vitest'
import { PHILIPPINES } from './maplibre/camera.ts'
import { homeView, homeWorldSize, zoomFor } from './mapLimits.ts'

const [[WEST, SOUTH], [EAST, NORTH]] = PHILIPPINES
const none = { top: 0, right: 0, bottom: 0, left: 0 }
const span = ([[west, south], [east, north]]: ReturnType<typeof homeView>) => ({
  width: east - west,
  height: north - south,
})

describe('the map’s home view of the Philippines', () => {
  it('holds the whole country on a wide screen, with the spare room at its sides', () => {
    const size = { width: 1920, height: 1080 }
    const [[west, south], [east, north]] = homeView(size)
    // The country's height fills the screen, so north and south are its own.
    expect(south).toBeCloseTo(SOUTH, 3)
    expect(north).toBeCloseTo(NORTH, 3)
    expect(west).toBeLessThan(WEST)
    expect(east).toBeGreaterThan(EAST)
    // Centred: as much sea to the west as to the east.
    expect(WEST - west).toBeCloseTo(east - EAST, 6)
  })

  it('holds the whole country on a phone, with the spare room above and below', () => {
    const [[west, south], [east, north]] = homeView({ width: 390, height: 844 })
    expect(west).toBeCloseTo(WEST, 3)
    expect(east).toBeCloseTo(EAST, 3)
    expect(south).toBeLessThan(SOUTH)
    expect(north).toBeGreaterThan(NORTH)
  })

  it('fits the country beside a panel and above a card, and keeps their room in the view', () => {
    const size = { width: 1440, height: 800 }
    const padded = { top: 70, right: 64, bottom: 200, left: 388 }
    // Less room, so a smaller scale: the country is drawn smaller.
    expect(homeWorldSize(size, padded)).toBeLessThan(homeWorldSize(size, none))
    const [[west, south], [east, north]] = homeView(size, padded)
    expect(west).toBeLessThan(WEST)
    expect(east).toBeGreaterThan(EAST)
    expect(south).toBeLessThan(SOUTH)
    expect(north).toBeGreaterThan(NORTH)
    // More room is kept on the panel's side than on the buttons', and below than above.
    expect(WEST - west).toBeGreaterThan(east - EAST)
    expect(SOUTH - south).toBeGreaterThan(north - NORTH)
  })

  it('shows the same share of the world at any scale: twice the scale, half the view', () => {
    const size = { width: 800, height: 600 }
    const scale = homeWorldSize(size)
    const near = span(homeView(size, none, scale * 2))
    const far = span(homeView(size, none, scale))
    expect(near.width).toBeCloseTo(far.width / 2, 6)
  })

  it('still answers when the panels leave no room', () => {
    const size = { width: 320, height: 300 }
    const crowded = { top: 200, right: 100, bottom: 200, left: 300 }
    expect(homeWorldSize(size, crowded)).toBeGreaterThan(0)
    expect(homeView(size, crowded).flat().every(Number.isFinite)).toBe(true)
  })

  it('turns a scale into each renderer’s zoom: MapLibre’s is one less than Leaflet’s', () => {
    const scale = homeWorldSize({ width: 1280, height: 720 })
    expect(zoomFor(scale, 256) - zoomFor(scale, 512)).toBeCloseTo(1, 10)
    // The whole country on a laptop is around Leaflet's zoom 5 to 6.
    expect(zoomFor(scale, 256)).toBeGreaterThan(5)
    expect(zoomFor(scale, 256)).toBeLessThan(6.5)
  })
})
