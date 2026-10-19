import { useEffect, useRef } from 'react'
import { useLocation, useMatches } from 'react-router'
import { en } from '../copy/en.ts'

// What happens on every navigation: the document title follows the page, and focus moves to the new page's
// heading. Scrolling is React Router's <ScrollRestoration /> (see Layout.tsx).

/** A page in en.pages: its title, heading and placeholder copy. */
export type PageKey = keyof typeof en.pages

/** The `handle` of a page's route in routes.tsx. */
export interface RouteHandle {
  page: PageKey
}

function isRouteHandle(handle: unknown): handle is RouteHandle {
  return (
    typeof handle === 'object' &&
    handle !== null &&
    'page' in handle &&
    typeof handle.page === 'string' &&
    Object.hasOwn(en.pages, handle.page)
  )
}

/** The page on screen: the deepest route with a handle. */
export function useCurrentPage(): PageKey | undefined {
  const matches = useMatches()
  for (let i = matches.length - 1; i >= 0; i--) {
    const { handle } = matches[i]
    if (isRouteHandle(handle)) return handle.page
  }
  return undefined
}

/**
 * The document title for a page. It takes a page key, not a string, so a title is always one of the fixed strings
 * in en.pages and can never carry anything a learner typed (a goal, a name or a place).
 */
export function pageTitle(page: PageKey | undefined): string {
  return page ? en.pages[page].title : en.app.name
}

export function usePageTitle(page: PageKey | undefined): void {
  useEffect(() => {
    document.title = pageTitle(page)
  }, [page])
}

/**
 * The element that takes focus after a navigation: the page's h1, or the main region when it has none. Also where
 * focus goes after a sign-in took away the control that had it (AuthProvider).
 */
export function navigationTarget(): HTMLElement | null {
  const main = document.getElementById('main')
  return main?.querySelector<HTMLElement>('h1[tabindex="-1"]') ?? main
}

/**
 * Moves focus to the new page's heading after each navigation to another page, so a screen reader announces it
 * and Tab carries on from the top of the page. The first load leaves focus where the browser puts it, and a
 * change of query or hash on the same page (filters, in-page links) doesn't move it.
 */
export function useFocusOnNavigation(): void {
  const { pathname } = useLocation()
  const previous = useRef(pathname)
  useEffect(() => {
    if (previous.current === pathname) return
    previous.current = pathname
    // preventScroll: ScrollRestoration has already put the page where it belongs (the top, or where Back left it).
    navigationTarget()?.focus({ preventScroll: true })
  }, [pathname])
}
