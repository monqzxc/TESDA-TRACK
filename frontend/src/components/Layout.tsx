import type { MouseEvent } from 'react'
import { Outlet, ScrollRestoration } from 'react-router'
import { useAuth } from '../auth/useAuth.ts'
import { en } from '../copy/en.ts'
import { FirstVisitNotice } from '../features/privacy/FirstVisitNotice.tsx'
import { useCurrentPage, useFocusOnNavigation, usePageTitle } from '../lib/navigation.ts'
import { Brand } from './Brand.tsx'
import { HomeFooter } from './HomeFooter.tsx'
import { HomeHeader } from './HomeHeader.tsx'
import { MobileMenu } from './MobileMenu.tsx'
import { SidebarContent } from './Nav.tsx'
import styles from './Layout.module.css'

/**
 * The root route, around every page: the title follows the page, focus moves to its heading after a navigation,
 * and ScrollRestoration starts new pages at the top and puts Back where the learner left off. A first visit opens
 * with the privacy notice over the page.
 */
export function Root() {
  usePageTitle(useCurrentPage())
  useFocusOnNavigation()
  return (
    <>
      <ScrollRestoration />
      <Outlet />
      <FirstVisitNotice />
    </>
  )
}

/** The first Tab stop on every page. It focuses the page's main region, so the next Tab goes into the page. */
function SkipLink() {
  const skip = (event: MouseEvent<HTMLAnchorElement>) => {
    // Focused here rather than followed: following #main would add a history entry for the same page.
    event.preventDefault()
    document.getElementById('main')?.focus()
  }
  return (
    <a href="#main" className={styles.skipLink} onClick={skip}>
      {en.skipToContent}
    </a>
  )
}

/**
 * Home: the landing page's own top bar and footer, and no sidebar, as in the Streamlit app. The footer is outside
 * <main>, as on the landing page, so it's the page's contentinfo landmark.
 */
export function HomeLayout() {
  return (
    <>
      <SkipLink />
      <HomeHeader />
      <main id="main" tabIndex={-1} className={styles.homeMain}>
        <Outlet />
      </main>
      <HomeFooter />
    </>
  )
}

/**
 * Every other page: the Streamlit app's sidebar beside the page. On phones the sidebar becomes a bar with the
 * brand and a Menu button, which opens the same sidebar over the page (MobileMenu). Reports shows for
 * administrators.
 */
export function AppLayout() {
  const { isAdmin } = useAuth()
  return (
    <>
      <SkipLink />
      <div className={styles.shell}>
        <header className={styles.sidebar}>
          <div className={styles.bar}>
            <MobileMenu isAdmin={isAdmin} />
            <div className={styles.wide}>
              <Brand />
            </div>
            <div className={styles.phone}>
              <Brand compact />
            </div>
          </div>
          <div className={styles.wide}>
            <SidebarContent isAdmin={isAdmin} />
          </div>
        </header>
        <main id="main" tabIndex={-1} className={styles.main}>
          <Outlet />
        </main>
      </div>
    </>
  )
}
