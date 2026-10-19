import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/** How far the page scrolls before Home's top bar turns solid, as on the landing page. */
const SOLID_AFTER = 24

/**
 * Home's top bar sits over the hero, see-through, until the page scrolls. This keeps --home-bar-height on <html>
 * in step with the bar's height, which wraps onto a second row on phones (the hero starts under the bar, and
 * Home's sections and whatever takes focus in them scroll to below it), and says whether the page has scrolled.
 */
export function useHomeBar<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [scrolled, setScrolled] = useState(false)

  // Before paint, so the hero never shows at the wrong offset.
  useLayoutEffect(() => {
    const bar = ref.current
    if (!bar) return
    const root = document.documentElement
    const measure = () => root.style.setProperty('--home-bar-height', `${bar.offsetHeight}px`)
    measure()
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    resize?.observe(bar)
    return () => {
      resize?.disconnect()
      root.style.removeProperty('--home-bar-height')
    }
  }, [])

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      setScrolled(window.scrollY > SOLID_AFTER)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])

  return { ref, scrolled }
}
