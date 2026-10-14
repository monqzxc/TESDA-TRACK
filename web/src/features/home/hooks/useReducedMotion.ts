import { useSyncExternalStore } from 'react'

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)'

function reduceQuery(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(REDUCE_QUERY) : null
}

function subscribe(onChange: () => void) {
  const query = reduceQuery()
  query?.addEventListener('change', onChange)
  return () => query?.removeEventListener('change', onChange)
}

/** Whether the device asks for less motion. It follows the setting while the page is open. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => reduceQuery()?.matches ?? false,
    () => false,
  )
}

/**
 * Whether Home's sections wait off stage and come in as they scroll into view: only when motion is welcome and the
 * browser can watch scrolling (IntersectionObserver). Otherwise everything shows at once, as it does without script.
 */
export function useRevealMotion(): boolean {
  const reduced = useReducedMotion()
  return !reduced && typeof IntersectionObserver === 'function'
}
