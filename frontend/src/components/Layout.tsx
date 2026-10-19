import type { MouseEvent } from 'react'
import { Outlet, ScrollRestoration } from 'react-router'
import { useAuth } from '../auth/useAuth.ts'
import { en } from '../copy/en.ts'
import { useCurrentPage, useFocusOnNavigation, usePageTitle } from '../lib/navigation.ts'
import { Brand } from './Brand.tsx'
import { HomeFooter } from './HomeFooter.tsx'
import { HomeHeader } from './HomeHeader.tsx'
import { MobileMenu } from './MobileMenu.tsx'
import { SidebarContent } from './Nav.tsx'

/**
 * The root route, around every page: the title follows the page, focus moves to its heading after a navigation,
 * and ScrollRestoration starts new pages at the top and puts Back where the learner left off.
 */
export function Root() {
  usePageTitle(useCurrentPage())
  useFocusOnNavigation()
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  )
}

/** The first Tab stop on every page, off screen until it has focus. It focuses the page's main region, so the
 *  next Tab goes into the page. */
function SkipLink() {
  const skip = (event: MouseEvent<HTMLAnchorElement>) => {
    // Focused here rather than followed: following #main would add a history entry for the same page.
    event.preventDefault()
    document.getElementById('main')?.focus()
  }
  return (
    <a
      href="#main"
      className="absolute top-3 left-4 z-200 translate-y-[calc(-100%_-_1rem)] rounded-10 bg-fill px-4 py-[0.6rem] font-semibold text-white no-underline focus:translate-none"
      onClick={skip}
    >
      {en.skipToContent}
    </a>
  )
}

/**
 * Home: the landing page's own top bar and footer, and no sidebar, as in the Streamlit app. The footer is outside
 * <main>, as on the landing page, so it's the page's contentinfo landmark. Home's sections run the full width of
 * the window and set their own widths and spacing (features/home).
 *
 * Focus moves to <main> from script (Skip to content, or a page without an h1); it isn't a Tab stop, so it shows no
 * ring.
 */
export function HomeLayout() {
  return (
    <>
      <SkipLink />
      <HomeHeader />
      <main id="main" tabIndex={-1} className="block focus:outline-none">
        <Outlet />
      </main>
      <HomeFooter />
    </>
  )
}

/**
 * Every other page: the Streamlit app's sidebar beside the page, a white column with a border that stays put while
 * the page scrolls. On phones the sidebar becomes a bar across the top with the brand and a Menu button, which
 * opens the same sidebar over the page (MobileMenu). Reports shows for administrators.
 */
export function AppLayout() {
  const { isAdmin } = useAuth()
  return (
    <>
      <SkipLink />
      <div className="grid min-h-screen grid-cols-[19rem_minmax(0,1fr)] max-md:block">
        <header
          className={
            'sticky top-0 h-dvh overflow-y-auto border-r border-border bg-surface px-5 pt-[1.3rem] pb-6 ' +
            'max-md:z-20 max-md:h-auto max-md:overflow-visible max-md:border-r-0 max-md:border-b max-md:px-4 max-md:py-[0.6rem]'
          }
        >
          <div className="max-md:flex max-md:items-center max-md:gap-3">
            <MobileMenu isAdmin={isAdmin} />
            <div className="max-md:hidden">
              <Brand />
            </div>
            <div className="hidden max-md:block">
              <Brand compact />
            </div>
          </div>
          <div className="max-md:hidden">
            <SidebarContent isAdmin={isAdmin} />
          </div>
        </header>
        <main
          id="main"
          tabIndex={-1}
          className="w-full max-w-[1520px] px-10 pt-[3.8rem] pb-8 focus:outline-none max-[1101px]:px-6 max-md:px-4 max-md:pt-6 max-md:pb-8"
        >
          <Outlet />
        </main>
      </div>
    </>
  )
}
