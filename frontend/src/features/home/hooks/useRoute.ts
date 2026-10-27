import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useReducedMotion } from './useReducedMotion.ts'

// "How it works": one road, like the logo's, winds through the four stops and draws itself as the page scrolls.
// Each stop's waypoint (an element with data-waypoint inside the track) lights up as the road reaches it. With
// reduced motion the road is drawn whole and every waypoint is lit.

/** A point in the track, from its top left corner. */
export type Point = readonly [x: number, y: number]

/** The road's shape, for the SVG that covers the track. */
export interface RouteGeometry {
  d: string
  width: number
  height: number
  /** How far down the track each waypoint's middle is, top to bottom. */
  stops: readonly number[]
}

/** Where the road's tip is: this far down the window (62%), so it follows the reader's eye line. */
const REACH = 0.62
/** How many points along the road are measured to find how much of it lies above the reader's eye line. */
const SAMPLES = 200

const round = (n: number) => Math.round(n * 10) / 10

/**
 * The road through the waypoints: in from above the first, an S-bend between each pair (straight lines on narrow
 * tracks, where the stops sit in one column), and out below the last.
 */
export function routePath(points: readonly Point[], width: number): string {
  if (points.length === 0) return ''
  const swing = width < 700 ? 0 : Math.min(150, width * 0.12)
  const [[x0, y0]] = points
  let d = `M${round(x0)} ${round(Math.max(0, y0 - 120))} L${round(x0)} ${round(y0)}`
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1]
    const [bx, by] = points[i]
    const dy = by - ay
    const side = i % 2 ? 1 : -1
    d +=
      ` C${round(ax + side * swing)} ${round(ay + dy * 0.45)},` +
      ` ${round(bx - side * swing)} ${round(by - dy * 0.45)}, ${round(bx)} ${round(by)}`
  }
  const [lx, ly] = points[points.length - 1]
  return `${d} L${round(lx)} ${round(ly + 90)}`
}

/** A point along the road: how far along it is, and how far down the track. */
export type Sample = readonly [length: number, y: number]

/** How much of the road to draw: up to the first point at or below `reach` (the whole road if none is). */
export function drawnLength(samples: readonly Sample[], reach: number, total: number): number {
  return samples.find(([, y]) => y >= reach)?.[0] ?? total
}

function measureRoad(road: SVGPathElement): { total: number; samples: Sample[] } {
  // Browsers measure SVG paths; jsdom doesn't.
  if (typeof road.getTotalLength !== 'function') return { total: 0, samples: [] }
  const total = road.getTotalLength()
  const samples: Sample[] = []
  for (let i = 0; i <= SAMPLES; i++) {
    const length = (total * i) / SAMPLES
    samples.push([length, road.getPointAtLength(length).y])
  }
  return { total, samples }
}

function sameGeometry(a: RouteGeometry | null, b: RouteGeometry): boolean {
  return a !== null && a.d === b.d && a.width === b.width && a.height === b.height
}

export function useRoute() {
  const trackRef = useRef<HTMLDivElement>(null)
  const roadRef = useRef<SVGPathElement>(null)
  const reduced = useReducedMotion()
  const [geometry, setGeometry] = useState<RouteGeometry | null>(null)
  /** How many waypoints the road has reached. */
  const [lit, setLit] = useState(0)

  // The road's shape follows the waypoints: built once the track is laid out, and again when it changes size (as
  // when the fonts arrive). Home's lower sections are only laid out near the window (content-visibility, see
  // styles/home.css), so the track is measured when the browser reports its size, never before: measuring it
  // earlier would lay out the whole section while the page first loads.
  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    let alive = true
    const build = () => {
      if (!alive) return
      const box = track.getBoundingClientRect()
      if (!box.width) return
      const points = Array.from(track.querySelectorAll('[data-waypoint]'), (waypoint): Point => {
        const r = waypoint.getBoundingClientRect()
        return [r.left - box.left + r.width / 2, r.top - box.top + r.height / 2]
      })
      if (points.length === 0) return
      const next: RouteGeometry = {
        d: routePath(points, box.width),
        width: round(box.width),
        height: round(box.height),
        stops: points.map(([, y]) => y),
      }
      setGeometry((current) => (sameGeometry(current, next) ? current : next))
    }
    if (typeof ResizeObserver === 'function') {
      // It reports the track's size as soon as it's laid out, then whenever it changes.
      const resize = new ResizeObserver(build)
      resize.observe(track)
      return () => {
        alive = false
        resize.disconnect()
      }
    }
    build()
    window.addEventListener('resize', build)
    // document.fonts is missing in jsdom.
    void document.fonts?.ready.then(build)
    return () => {
      alive = false
      window.removeEventListener('resize', build)
    }
  }, [])

  // Drawn before paint, so the whole road never flashes up, then again as the page scrolls (once a frame at most)
  // while the track is in the window. As it leaves, it's drawn once more for where it went.
  useLayoutEffect(() => {
    const track = trackRef.current
    const road = roadRef.current
    if (!geometry || !track || !road) return
    const { total, samples } = measureRoad(road)
    const draw = (top: number) => {
      const reach = reduced ? Infinity : window.innerHeight * REACH - top
      if (total) {
        road.style.strokeDasharray = `${total} ${total}`
        road.style.strokeDashoffset = String(total - drawnLength(samples, reach, total))
      }
      setLit(geometry.stops.filter((y) => y <= reach).length)
    }
    draw(track.getBoundingClientRect().top)
    if (reduced) return
    // Without IntersectionObserver, it follows every scroll.
    let inView = typeof IntersectionObserver !== 'function'
    const watch = inView
      ? null
      : new IntersectionObserver((entries) => {
          // Only the track is watched, but a quick scroll can report it more than once: the last report is now.
          const entry = entries[entries.length - 1]
          inView = entry.isIntersecting
          if (!inView) draw(entry.boundingClientRect.top)
        })
    watch?.observe(track)
    let frame = 0
    const onScroll = () => {
      if (!inView || frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        draw(track.getBoundingClientRect().top)
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      watch?.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [geometry, reduced])

  return { trackRef, roadRef, geometry, lit }
}
