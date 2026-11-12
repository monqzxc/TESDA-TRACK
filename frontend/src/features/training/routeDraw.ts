import { useEffect, useState } from 'react'

// A route draws itself from the learner to the center when it first shows, and again when another travel mode is
// chosen: the chosen line grows along its path, evenly by distance, in at most two seconds. Both map renderers use
// it. With reduced motion, or where the browser can't say (no matchMedia, as in tests), it shows whole at once.

/** How long the line takes to reach the center. */
export const DRAW_MS = 1600

function drawsInstantly(): boolean {
  return (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** Slow at both ends, so the line sets off and arrives rather than starting and stopping. */
function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2
}

/**
 * How much of the route to draw, from 0 to 1. A new `key` (another route, or another mode of it) starts again from
 * nothing; `null` is no route.
 */
export function useRouteDraw(key: string | null): number {
  const [drawn, setDrawn] = useState(() => ({ key, t: key && !drawsInstantly() ? 0 : 1 }))
  // Reset during render, so the whole line never flashes for a frame before it starts to grow.
  if (drawn.key !== key) setDrawn({ key, t: key && !drawsInstantly() ? 0 : 1 })

  useEffect(() => {
    if (!key || drawsInstantly()) return
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / DRAW_MS)
      setDrawn({ key, t: easeInOut(progress) })
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [key])

  return drawn.key === key ? drawn.t : 0
}

/**
 * The first part of a path of [latitude, longitude] points, `t` of the way along it by distance, ending on a point
 * between two of its own. Distances are flat-earth, which is close enough over a route's few kilometres.
 */
export function partialPath<P extends readonly number[]>(
  path: readonly P[],
  t: number,
): number[][] {
  if (t >= 1 || path.length < 2) return path.map((point) => [...point])
  if (t <= 0) return [[...path[0]]]
  const scale = Math.cos(((path[0][0] ?? 0) * Math.PI) / 180)
  const lengths = path.slice(1).map((point, i) => {
    const [lat, lng] = path[i]
    return Math.hypot(point[0] - lat, (point[1] - lng) * scale)
  })
  let left = lengths.reduce((sum, length) => sum + length, 0) * t
  const out: number[][] = [[...path[0]]]
  for (let i = 0; i < lengths.length; i++) {
    const [lat, lng] = path[i]
    const [nextLat, nextLng] = path[i + 1]
    if (left <= lengths[i]) {
      const f = lengths[i] ? left / lengths[i] : 1
      out.push([lat + (nextLat - lat) * f, lng + (nextLng - lng) * f])
      return out
    }
    left -= lengths[i]
    out.push([nextLat, nextLng])
  }
  return out
}
