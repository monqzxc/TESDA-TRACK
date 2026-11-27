import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '../../lib/motion.ts'
import type { GroupId } from './guided.ts'

/** The guided cards' rhythm: the same 500 ms step as the route intro, and a quicker step between cards. */
export const GROUP_GAP_MS = 500
export const CARD_GAP_MS = 150

export type RevealId = 'pick' | GroupId

/**
 * Which steps are on screen. Each shows in order, at the later of its data being ready and GROUP_GAP_MS after the
 * step before it. A search whose reveal already played (`played`), or a device asking for less motion, shows every
 * ready step at once without animation. A new `key` starts again. `onDone` hears the key once every step has shown.
 */
export function useReveal(
  steps: readonly RevealId[],
  ready: Readonly<Record<RevealId, boolean>>,
  key: string | null,
  played: boolean,
  onDone: (key: string) => void,
): { shown: ReadonlySet<RevealId>; animate: boolean; pending: RevealId | null } {
  const [state, setState] = useState({ key, count: 0, at: 0 })
  if (state.key !== key) setState({ key, count: 0, at: 0 })
  const count = state.key === key ? state.count : 0
  const instant = played || prefersReducedMotion()
  const next = steps[count]
  const nextReady = next !== undefined && ready[next]
  const done = useRef<string | null>(null)

  useEffect(() => {
    if (instant) return
    if (next === undefined) {
      if (key && done.current !== key) {
        done.current = key
        onDone(key)
      }
      return
    }
    if (!nextReady) return
    const delay = count === 0 ? 0 : Math.max(0, state.at + GROUP_GAP_MS - Date.now())
    const timer = window.setTimeout(
      () => setState((current) => ({ key: current.key, count: current.count + 1, at: Date.now() })),
      delay,
    )
    return () => window.clearTimeout(timer)
  }, [instant, next, nextReady, count, key, state.at, onDone])

  if (instant) {
    return {
      shown: new Set(steps.filter((step) => ready[step])),
      animate: false,
      pending: steps.find((step) => !ready[step]) ?? null,
    }
  }
  return { shown: new Set(steps.slice(0, count)), animate: true, pending: next ?? null }
}
