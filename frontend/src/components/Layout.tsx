import { useRef, type MouseEvent } from 'react'
import { Outlet, ScrollRestoration, useLocation } from 'react-router'
import { useAuth } from '../auth/useAuth.ts'
import { useCopy } from '../i18n/copy.ts'
import { TspNav } from '../features/tsp/TspNav.tsx'
import { TspConsent } from '../features/tsp/TspConsent.tsx'
import { TspSignInNotice } from '../features/tsp/TspSignInNotice.tsx'
import { TspStateProvider } from '../features/tsp/TspState.tsx'
import { useTspSignIn } from '../features/tsp/useTspSignIn.ts'
import { FirstVisitNotice } from '../features/privacy/FirstVisitNotice.tsx'
import { GuidedHelp } from '../features/help/GuidedHelp.tsx'
import { useCurrentPage, useFocusOnNavigation, usePageTitle } from '../lib/navigation.ts'
import { cx } from '../lib/style.ts'
import { HomeFooter } from './HomeFooter.tsx'
import { HomeHeader } from './HomeHeader.tsx'
import { MobileMenu } from './MobileMenu.tsx'
import { MenuButton, SidebarContent, SidebarTitle } from './Nav.tsx'
import { PageFooter } from './PageFooter.tsx'
import { useSidebarStore } from './sidebar.ts'
import { paths } from '../paths.ts'

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
      <GuidedHelp />
    </>
  )
}

/** The first Tab stop on every page, off screen until it has focus. It focuses the page's main region, so the
 *  next Tab goes into the page. */
function SkipLink() {
  const en = useCopy()

  const skip = (event: MouseEvent<HTMLAnchorElement>) => {
    // Focused here rather than followed: following #main would add a history entry for the same page.
    event.preventDefault()
    document.getElementById('main')?.focus()
  }
  return (
    <a
      href="#main"
      className="absolute top-3 left-4 z-200 translate-y-[calc(-100%-1rem)] rounded-10 bg-fill px-4 py-[0.6rem] font-semibold text-white no-underline focus:translate-none"
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
 * A compact shell for partner apps opening TESDA-TRACK in a phone WebView. Inside TSP's app it also signs the learner
 * in (useTspSignIn): a first visit asks for consent in place of the page.
 */
export function WebviewLayout() {
  const copy = useCopy().tspSignIn.notice
  const location = useLocation()
  const tsp = useTspSignIn()
  const isEntry = location.pathname === paths.tspWebview
  const isTool =
    location.pathname === paths.tspQualifications ||
    // A qualification's own page, opened from the library.
    location.pathname.startsWith(`${paths.tspQualifications}/`) ||
    location.pathname === paths.tspTraining ||
    location.pathname === paths.tspSkills
  return (
    // A new provider after TSP's logout: nothing the last learner's launch URL prefilled stays.
    <TspStateProvider key={tsp.resets}>
      <SkipLink />
      <div className="tsp-webview min-h-dvh">
        {isTool && <TspNav />}
        <main
          id="main"
          tabIndex={-1}
          className={`tsp-main ${isEntry ? 'tsp-main-entry' : isTool ? 'tsp-main-tool' : 'tsp-main-content'}`}
        >
          {tsp.state === 'failed' && (
            <TspSignInNotice canRetry={tsp.canRetry} onRetry={tsp.retry} blocked={tsp.blocked} />
          )}
          {tsp.blocked ? (
            tsp.state !== 'failed' && <p role="status">{copy.preparing}</p>
          ) : tsp.state === 'consent' && tsp.summary ? (
            <TspConsent summary={tsp.summary} onAnswer={tsp.answerConsent} />
          ) : (
            // The entry page shows the sign-in's progress (TspPassportStatus).
            <Outlet context={tsp.state} />
          )}
        </main>
      </div>
    </TspStateProvider>
  )
}

/**
 * Every other page: the sidebar beside the page, a white column with a border that stays put while the page scrolls.
 * Its burger folds it away, sliding shut, and a slim bar with the same burger above the page brings it back. On
 * phones the sidebar becomes a bar across the top with the burger and the name, and the burger opens the same
 * sidebar over the page (MobileMenu). Reports and Admin show for staff.
 *
 * The Career Map (/explore) has no sidebar: the map takes the window, and its search bar's burger opens the sidebar
 * over it.
 */
export function AppLayout() {
  const en = useCopy()
  const { canViewReports, canOpenAdmin } = useAuth()
  const ownMenu = useCurrentPage() === 'explore'
  const folded = useSidebarStore((state) => state.folded)
  const hideButton = useRef<HTMLButtonElement>(null)
  const showButton = useRef<HTMLButtonElement>(null)
  // The burger pressed goes away with what it folds or opens, so focus moves to the other one.
  const fold = (next: boolean) => {
    useSidebarStore.getState().setFolded(next)
    requestAnimationFrame(() => (next ? showButton : hideButton).current?.focus())
  }
  return (
    <>
      <SkipLink />
      <div
        className={cx(
          'min-h-screen',
          !ownMenu &&
            'grid transition-[grid-template-columns] duration-300 ease-out motion-reduce:transition-none max-md:block',
          !ownMenu &&
            (folded ? 'grid-cols-[0rem_minmax(0,1fr)]' : 'grid-cols-[16.5rem_minmax(0,1fr)]'),
        )}
      >
        {!ownMenu && (
          // Folded, it slides shut: the column narrows to nothing while the content keeps its width and is clipped,
          // so nothing rewraps on the way. Hidden once shut (visibility waits for the slide), so nothing in it is
          // reachable. Phones have no folding: there it's the top bar.
          <header
            className={cx(
              'sticky top-0 h-dvh overflow-hidden border-border bg-surface',
              'max-md:z-20 max-md:h-auto max-md:overflow-visible max-md:border-b',
              // Hidden only once the slide ends; shown at once on the way back, so its burger can take focus.
              folded ? 'md:invisible md:transition-[visibility] md:duration-300' : 'md:border-r',
            )}
          >
            <div className="flex h-full w-[16.5rem] flex-col overflow-y-auto px-3 pt-3 pb-4 max-md:h-auto max-md:w-auto max-md:overflow-visible max-md:py-1.5">
              <div className="flex shrink-0 items-center gap-1 md:mb-3">
                <MobileMenu isAdmin={canViewReports} canManage={canOpenAdmin} />
                <div className="max-md:hidden">
                  <MenuButton
                    ref={hideButton}
                    label={en.nav.hideMenu}
                    expanded={!folded}
                    turned={folded}
                    onPress={() => fold(true)}
                  />
                </div>
                <SidebarTitle />
              </div>
              <div className="flex flex-1 flex-col max-md:hidden">
                <SidebarContent isAdmin={canViewReports} canManage={canOpenAdmin} />
              </div>
            </div>
          </header>
        )}
        <div className="flex min-h-screen min-w-0 flex-col">
          {!ownMenu && folded && (
            <div className="flex items-center gap-1 px-3 pt-3 max-md:hidden">
              <MenuButton
                ref={showButton}
                label={en.nav.showMenu}
                expanded={false}
                iconClassName="animate-menu-spin-in"
                onPress={() => fold(false)}
              />
              <SidebarTitle />
            </div>
          )}
          <main
            id="main"
            tabIndex={-1}
            className="w-full max-w-full flex-1 px-10 pt-9 pb-8 focus:outline-none max-[1101px]:px-6 max-md:px-4 max-md:pt-6 max-md:pb-8"
          >
            <Outlet />
          </main>
          <PageFooter />
        </div>
      </div>
    </>
  )
}
