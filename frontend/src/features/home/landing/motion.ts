import { createContext, useEffect, useSyncExternalStore, type RefObject } from 'react'

export const LandingMotionPaused = createContext(false)

const motionQuery = () =>
  typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null
const subscribeMotion = (notify: () => void) => {
  const query = motionQuery()
  query?.addEventListener('change', notify)
  return () => query?.removeEventListener('change', notify)
}
const reducedMotion = () => motionQuery()?.matches ?? true
export const useReducedMotion = () =>
  useSyncExternalStore(subscribeMotion, reducedMotion, () => true)

/** Siblings follow one another by this much; the How it works steps (data-reveal-route) a little slower, so their
    rules draw one after another like a route being traced. */
const STAGGER_MS = 70
const ROUTE_STAGGER_MS = 160

/** Enhance visible content only: without an observer or with reduced motion everything stays readable. */
export function useScrollReveals(ref: RefObject<HTMLDivElement | null>) {
  const reduced = useReducedMotion()
  useEffect(() => {
    if (reduced || !ref.current || typeof IntersectionObserver === 'undefined') return
    // Each section under the hero: its heading block, then every item of its list, one after another. Links and
    // buttons are never targets themselves (their own transitions would win), only the blocks around them.
    const root = ref.current
    const groups = [
      ...root.querySelectorAll<HTMLElement>(':scope > section:not(:first-child) > div'),
    ]
    const targets = groups.flatMap((group) => {
      const blocks = [...group.children].filter(
        (child): child is HTMLElement =>
          child instanceof HTMLElement && !child.matches('a, button, ul, ol'),
      )
      const items = [...group.querySelectorAll<HTMLElement>(':scope > :is(ul, ol) > li')]
      return [
        ...blocks.map((target, i) => ({ target, order: Math.min(i, 3) })),
        ...items.map((target, i) => ({ target, order: Math.min(i, 5) })),
      ]
    })
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.setAttribute('data-reveal', 'shown')
          observer.unobserve(entry.target)
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -24px 0px' },
    )
    targets.forEach(({ target, order }) => {
      target.dataset.reveal = 'pending'
      const step = 'revealRoute' in target.dataset ? ROUTE_STAGGER_MS : STAGGER_MS
      target.style.setProperty('--reveal-delay', `${order * step}ms`)
      observer.observe(target)
    })
    return () => {
      observer.disconnect()
      targets.forEach(({ target }) => {
        delete target.dataset.reveal
        target.style.removeProperty('--reveal-delay')
      })
    }
  }, [ref, reduced])
}
