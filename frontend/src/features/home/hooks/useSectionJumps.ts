import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { useLocation } from 'react-router'

/** The element id an address's hash names, or null when it names none (or can't be decoded, as with "#%"). */
function hashTarget(hash: string): string | null {
  if (hash.length < 2) return null
  try {
    return decodeURIComponent(hash.slice(1))
  } catch {
    return null
  }
}

/** Whether Home has been on screen before, in this document. */
let shownBefore = false

interface SectionJumps<T> {
  /** Goes on Home's root. */
  ref: RefObject<T | null>
  /** Home has been on screen before: its whole page is laid out from the start (data-laid-out on its root). */
  laidOut: boolean
}

/**
 * Home's sections under the hero are laid out only as they come near the window on its first showing in a document
 * (content-visibility, see HomePage.module.css), so until then their heights are guesses. That first showing never
 * has a position to bring back: on a reload, ScrollRestoration (Layout.tsx) restores before Home's code arrives,
 * while the page is one screen tall, so it opens at the top. But a jump to a section would land in the wrong place,
 * so when the address names one of Home's sections (an address like /#catalog, or a top bar link), this lays out the
 * whole page (data-laid-out on the element the ref goes on) and scrolls to the section. Its layout effect runs after
 * ScrollRestoration's, which has just jumped by the guessed heights.
 *
 * Any later showing (Back to Home, or a link to it) is laid out from its first render, so ScrollRestoration lands
 * in the right place by itself, at the position Back brings back or at the section. Once the page is laid out,
 * this leaves every jump to ScrollRestoration.
 */
export function useSectionJumps<T extends HTMLElement>(): SectionJumps<T> {
  const page = useRef<T>(null)
  const { hash } = useLocation()
  const [laidOut] = useState(() => shownBefore)

  useEffect(() => {
    shownBefore = true
  }, [])

  useLayoutEffect(() => {
    const root = page.current
    const id = hashTarget(hash)
    if (!root || !id || root.hasAttribute('data-laid-out')) return
    const section = document.getElementById(id)
    if (!section || !root.contains(section)) return
    root.dataset.laidOut = ''
    // jsdom has no scrollIntoView.
    section.scrollIntoView?.()
  }, [hash])

  return { ref: page, laidOut }
}
