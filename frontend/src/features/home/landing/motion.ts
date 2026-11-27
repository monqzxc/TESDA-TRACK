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

/** Enhance visible content only: without an observer or with reduced motion everything stays readable. */
export function useScrollReveals(ref: RefObject<HTMLDivElement | null>) {
  const reduced = useReducedMotion()
  useEffect(() => {
    if (reduced || !ref.current || typeof IntersectionObserver === 'undefined') return
    const targets = ref.current.querySelectorAll<HTMLElement>(
      '#about > div > div, #about li, #how > div > div, #how > div > ol > li, #benefits > div > div, #benefits li',
    )
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
    targets.forEach((target, i) => {
      target.dataset.reveal = 'pending'
      target.style.setProperty('--reveal-delay', `${(i % 3) * 65}ms`)
      observer.observe(target)
    })
    return () => {
      observer.disconnect()
      targets.forEach((target) => {
        delete target.dataset.reveal
        target.style.removeProperty('--reveal-delay')
      })
    }
  }, [ref, reduced])
}
