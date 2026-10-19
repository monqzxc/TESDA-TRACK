import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockIntersectionObserver } from '../../../test/intersectionObserver.ts'
import { mockMediaQueries } from '../../../test/matchMedia.ts'
import { drawnLength, routePath, useRoute } from './useRoute.ts'

const REDUCE = '(prefers-reduced-motion: reduce)'

describe('routePath', () => {
  it('runs straight down through the stops on a narrow track', () => {
    expect(
      routePath(
        [
          [50, 100],
          [50, 500],
        ],
        600,
      ),
    ).toBe('M50 0 L50 100 C50 280, 50 320, 50 500 L50 590')
  })

  it('bends between the stops on a wide track, one way and then the other', () => {
    expect(
      routePath(
        [
          [500, 100],
          [500, 500],
          [500, 900],
        ],
        1000,
      ),
    ).toBe('M500 0 L500 100 C620 280, 380 320, 500 500 C380 680, 620 720, 500 900 L500 990')
  })

  it('is empty without stops', () => {
    expect(routePath([], 1000)).toBe('')
  })
})

describe('drawnLength', () => {
  const samples = [
    [0, 0],
    [10, 50],
    [20, 100],
  ] as const

  it('reaches the first point at or below the eye line', () => {
    expect(drawnLength(samples, 60, 30)).toBe(20)
    expect(drawnLength(samples, 0, 30)).toBe(0)
  })

  it('is the whole road once the eye line is past its end', () => {
    expect(drawnLength(samples, 500, 30)).toBe(30)
  })
})

// The track starts 200px down the page and is 1000 by 1600, with a waypoint in the middle of it at each of these
// heights. The road runs straight down, so its length and height match.
const STOPS = [100, 500, 900, 1300]
let scrolled = 0
let io: ReturnType<typeof mockIntersectionObserver>

function box(left: number, top: number, width: number, height: number) {
  return { left, top, width, height, x: left, y: top, right: left + width, bottom: top + height }
}

function Road() {
  const { trackRef, roadRef, geometry, lit } = useRoute()
  return (
    <div ref={trackRef} data-testid="track">
      <svg>
        <path ref={roadRef} data-testid="road" d={geometry?.d} />
      </svg>
      {STOPS.map((y, i) => (
        <span key={y} data-waypoint="" data-y={y} data-lit={i < lit || undefined} />
      ))}
    </div>
  )
}

const litStops = () => document.querySelectorAll('[data-lit]').length

describe('useRoute', () => {
  beforeEach(() => {
    scrolled = 0
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const top = 200 - scrolled
      if (this.getAttribute('data-testid') === 'track') return box(0, top, 1000, 1600) as DOMRect
      const y = Number(this.getAttribute('data-y'))
      return box(485, top + y - 15, 30, 30) as DOMRect
    })
    // jsdom doesn't measure SVG paths.
    Object.defineProperty(SVGElement.prototype, 'getTotalLength', {
      configurable: true,
      value: () => 1600,
    })
    Object.defineProperty(SVGElement.prototype, 'getPointAtLength', {
      configurable: true,
      value: (length: number) => ({ x: 500, y: length }),
    })
    // The reader's eye line is 62% down a 1000px window: 420px into the track before scrolling.
    vi.stubGlobal('innerHeight', 1000)
    io = mockIntersectionObserver()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    Reflect.deleteProperty(SVGElement.prototype, 'getTotalLength')
    Reflect.deleteProperty(SVGElement.prototype, 'getPointAtLength')
  })

  it('draws the road through the waypoints, as far as the eye line', () => {
    mockMediaQueries({ [REDUCE]: false })
    render(<Road />)
    const road = screen.getByTestId('road')

    expect(road.getAttribute('d')).toMatch(/^M500 0 L500 100 C620 /)
    expect(road.style.strokeDasharray).toBe('1600 1600')
    // Drawn to 424, the first measured point past 420.
    expect(road.style.strokeDashoffset).toBe('1176')
    expect(litStops()).toBe(1)
  })

  it('draws on, and lights each waypoint it reaches, as the page scrolls', async () => {
    mockMediaQueries({ [REDUCE]: false })
    render(<Road />)
    const road = screen.getByTestId('road')
    io.scrollIntoView(screen.getByTestId('track'))

    scrolled = 600
    window.dispatchEvent(new Event('scroll'))

    // The eye line is now 1020px into the track.
    await waitFor(() => expect(road.style.strokeDashoffset).toBe('576'))
    expect(litStops()).toBe(3)

    scrolled = 2000
    window.dispatchEvent(new Event('scroll'))

    await waitFor(() => expect(road.style.strokeDashoffset).toBe('0'))
    expect(litStops()).toBe(4)
  })

  it('measures the page only while the track is in view, and draws it once more as it leaves', async () => {
    mockMediaQueries({ [REDUCE]: false })
    render(<Road />)
    const road = screen.getByTestId('road')
    const track = screen.getByTestId('track')
    io.scrollIntoView(track)
    // Scrolled past: the track's top is 2000px above the window.
    io.scrollOutOfView(track, -2000)

    expect(road.style.strokeDashoffset).toBe('0')
    expect(litStops()).toBe(4)

    const measured = vi.mocked(Element.prototype.getBoundingClientRect).mock.calls.length
    scrolled = 3000
    window.dispatchEvent(new Event('scroll'))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(vi.mocked(Element.prototype.getBoundingClientRect).mock.calls.length).toBe(measured)
  })

  it('goes by the latest of several reports at once', async () => {
    mockMediaQueries({ [REDUCE]: false })
    render(<Road />)
    const road = screen.getByTestId('road')
    // Out of view and back in, reported together: it's in view.
    io.scrollOutAndBack(screen.getByTestId('track'), 900)

    scrolled = 600
    window.dispatchEvent(new Event('scroll'))

    await waitFor(() => expect(road.style.strokeDashoffset).toBe('576'))
    expect(litStops()).toBe(3)
  })

  it('is drawn whole, with every waypoint lit, when motion is reduced', () => {
    mockMediaQueries({ [REDUCE]: true })
    render(<Road />)
    const road = screen.getByTestId('road')

    expect(road.style.strokeDashoffset).toBe('0')
    expect(litStops()).toBe(4)
  })

  it('stops following the page when it goes away', async () => {
    mockMediaQueries({ [REDUCE]: false })
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(<Road />)

    unmount()

    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function))
    const measured = vi.mocked(Element.prototype.getBoundingClientRect).mock.calls.length
    window.dispatchEvent(new Event('scroll'))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(vi.mocked(Element.prototype.getBoundingClientRect).mock.calls.length).toBe(measured)
  })
})
