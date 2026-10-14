import type { MouseEvent } from 'react'
import { Outlet, ScrollRestoration } from 'react-router'
import { en } from '../copy/en.ts'
import { useCurrentPage, useFocusOnNavigation, usePageTitle } from '../lib/navigation.ts'
import { Brand } from './Brand.tsx'
import { HomeHeader } from './HomeHeader.tsx'
import { MobileMenu } from './MobileMenu.tsx'
import { SidebarContent } from './Nav.tsx'
import styles from './Layout.module.css'

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

/** Home: the landing page's own top bar and no sidebar, as in the Streamlit app. */
export function HomeLayout() {
  return (
    <>
      <SkipLink />
      <HomeHeader />
      <main id="main" tabIndex={-1} className={styles.homeMain}>
        <Outlet />
      </main>
    </>
  )
}

type AppLayoutProps = {
  /** Shows Reports in the navigation. The signed-in account decides it (Task 10); nobody is an admin until then. */
  isAdmin?: boolean
}

/**
 * Every other page: the Streamlit app's sidebar beside the page. On phones the sidebar becomes a bar with the
 * brand and a Menu button, which opens the same sidebar over the page (MobileMenu).
 */
export function AppLayout({ isAdmin = false }: AppLayoutProps) {
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
