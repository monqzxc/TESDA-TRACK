import { useRef, type MouseEvent } from 'react'
import { Button } from 'react-aria-components'
import { Outlet, ScrollRestoration, useLocation } from 'react-router'
import { learnerAccounts } from '../auth/accounts.ts'
import { AccountControl } from '../features/account/AccountMenu.tsx'
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
import { MenuButton, SidebarTitle } from './Nav.tsx'
import { PageFooter } from './PageFooter.tsx'
import { TspBadge } from './TspBadge.tsx'
import { Sidebar } from './Sidebar.tsx'
import { useSidebarStore } from './sidebarState.ts'
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
 * Every other page: a slim bar across the top with the burger, the name and the account control (the learner's icon
 * and menu, or Sign in), and the page under it. The burger opens
 * the sidebar over the page (Sidebar), the same on every page and at every width. Reports and Admin show in it for
 * staff.
 *
 * The Career Map (/explore) has no top bar, padding or footer: the map covers the window edge to edge, its search
 * bar's burger opens the sidebar, and the page itself links to the privacy policy.
 */
export function AppLayout() {
  const en = useCopy()
  const { canViewReports, canOpenAdmin, learner, openSignIn } = useAuth()
  // Signed out and guest-only: Sign in with TSP at the bar's right end, as on Home's bar and at the sidebar's foot.
  const offersTsp = !learner && !learnerAccounts()
  const currentPage = useCurrentPage()
  const ownMenu = currentPage === 'explore'
  const privacyPage = currentPage === 'privacy'
  const open = useSidebarStore((state) => state.open)
  const menuButton = useRef<HTMLButtonElement>(null)
  return (
    <>
      <SkipLink />
      <Sidebar refreshed={privacyPage} isAdmin={canViewReports} canManage={canOpenAdmin} />
      <div
        className={cx(
          'flex min-w-0 flex-col',
          ownMenu ? 'h-dvh overflow-hidden' : 'min-h-screen',
          privacyPage && 'landing bg-(--l-panel) font-text text-(--l-body)',
        )}
      >
        {!ownMenu && (
          <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-1 border-b border-border bg-surface px-3">
            <MenuButton
              ref={menuButton}
              tour="mobile-menu"
              label={en.nav.menu}
              hasPopup
              expanded={open}
              turned={open}
              onPress={() => useSidebarStore.getState().openMenu(menuButton.current)}
            />
            <SidebarTitle refreshed={privacyPage} />
            {offersTsp ? (
              <Button
                onPress={() => openSignIn({ tsp: true })}
                className="ml-auto inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border-0 bg-transparent px-2 py-1 text-15 font-semibold whitespace-nowrap text-navy data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus data-hovered:bg-soft data-pressed:bg-chip"
              >
                <TspBadge small />
                <span className="max-[431px]:sr-only">{en.account.tsp.signIn}</span>
              </Button>
            ) : (
              // The learner's icon and first name, opening the account menu (Profile, Sign out); Sign in when
              // signed out. On small phones only the icon shows; the name stays for screen readers.
              <div className="ml-auto flex min-w-0">
                <AccountControl
                  variant="header"
                  labels={{ menu: en.account.menu.topLabel, signIn: en.account.menu.topSignIn }}
                  buttonClassName="rounded-full px-2 py-1 text-15 font-semibold whitespace-nowrap text-navy data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus data-hovered:bg-soft data-pressed:bg-chip max-[431px]:[&_span]:sr-only"
                />
              </div>
            )}
          </header>
        )}
        <main
          id="main"
          tabIndex={-1}
          className={cx(
            'w-full flex-1 focus:outline-none',
            ownMenu
              ? 'min-h-0 max-w-full'
              : privacyPage
                ? 'mx-auto max-w-[1440px] px-[clamp(1.5rem,8.334vw,7.5rem)] py-12 max-sm:px-4 max-sm:py-6'
                : 'max-w-full px-10 pt-9 pb-8 max-[1101px]:px-6 max-md:px-4 max-md:pt-6 max-md:pb-8',
          )}
        >
          <Outlet />
        </main>
        {!ownMenu && (privacyPage ? <HomeFooter /> : <PageFooter />)}
      </div>
    </>
  )
}
