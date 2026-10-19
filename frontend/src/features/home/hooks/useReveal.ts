import { useCallback, useState, type RefCallback } from 'react'
import { useRevealMotion } from './useReducedMotion.ts'

// One IntersectionObserver for every element on the page that reveals as it scrolls into view, with the landing
// page's settings: an element counts as seen once 12% of it is above the bottom 12% of the window. Each element is
// watched until it's first seen, then let go; the observer stops when nothing is left to watch.

const OPTIONS: IntersectionObserverInit = { rootMargin: '0px 0px -12% 0px', threshold: 0.12 }

const watching = new Map<Element, () => void>()
let observer: IntersectionObserver | null = null

function unwatch(element: Element) {
  if (!watching.delete(element)) return
  observer?.unobserve(element)
  if (watching.size === 0) {
    observer?.disconnect()
    observer = null
  }
}

function watch(element: Element, onSeen: () => void): () => void {
  watching.set(element, onSeen)
  observer ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const seen = watching.get(entry.target)
      unwatch(entry.target)
      seen?.()
    }
  }, OPTIONS)
  observer.observe(element)
  return () => unwatch(element)
}

export interface Reveal<T extends Element> {
  /** Goes on the element to watch. */
  ref: RefCallback<T>
  /**
   * The element has scrolled into view, so it shows (with data-in, see Reveal.tsx) and starts what it
   * animates. Always true when motion is reduced or scrolling can't be watched: everything shows at once.
   */
  isIn: boolean
}

/** Watches an element until it first scrolls into view. Unmounting stops watching it. */
export function useReveal<T extends Element = HTMLElement>(): Reveal<T> {
  const motion = useRevealMotion()
  const [seen, setSeen] = useState(false)
  const ref = useCallback((element: T | null) => {
    if (!element || typeof IntersectionObserver !== 'function') return
    // Watched even when motion is reduced, so the page is ready if the setting changes while it's open.
    return watch(element, () => setSeen(true))
  }, [])
  return { ref, isIn: seen || !motion }
}
