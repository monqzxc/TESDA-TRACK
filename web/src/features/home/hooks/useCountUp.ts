import { useEffect, useState } from 'react'
import { useReducedMotion } from './useReducedMotion.ts'

interface CountUp {
  /** Counting starts when this turns true (e.g. when the number scrolls into view). */
  start: boolean
  /** In milliseconds. */
  duration: number
  /** How sharply it slows down at the end: 3 eases out like a cubic, 4 like a quartic. */
  power: number
}

/**
 * A number that counts up from 0 to `target`, easing out, once `start` is true; a new target counts up from 0 again.
 * With reduced motion it's the target from the start.
 */
export function useCountUp(target: number, { start, duration, power }: CountUp): number {
  const reduced = useReducedMotion()
  // The count so far, and the target it's counting to: a count towards an old target reads as 0.
  const [count, setCount] = useState({ target, value: 0 })

  useEffect(() => {
    if (reduced || !start) return
    // Timed by the frames' own clock, from the first one: performance.now() can run on another clock (it does in
    // jsdom), which would make the count run long.
    let begin: number | undefined
    let frame = requestAnimationFrame(function tick(now) {
      begin ??= now
      const t = Math.min(1, (now - begin) / duration)
      const value = Math.round(target * (1 - Math.pow(1 - t, power)))
      setCount({ target, value })
      if (t < 1) frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [target, start, duration, power, reduced])

  if (reduced) return target
  return count.target === target ? count.value : 0
}
