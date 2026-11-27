import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { en } from './copy/en.ts'
import { basename } from './routes.tsx'
import { SESSION_HINT_KEY } from './auth/session.ts'
import { serveAccountApi } from './test/account.tsx'
import { renderApp, serveCatalog } from './test/app.tsx'
import { server } from './test/server.ts'

const GOAL_STEP = 'Where would you like to go?'
const GOAL_TITLE = 'Your goal · Find my pathway · TESDA-TRACK'

// Every address, its h1, the step it shows (the finder's h2), its document title, and whether it loads the catalog.
const PAGES = [
  ['/', 'Your next TESDA step, on a map near you.', null, 'TESDA-TRACK · Your next step', false],
  [
    '/tsp/webview',
    'Find your TESDA qualification',
    null,
    'Find a TESDA pathway · TESDA-TRACK',
    false,
  ],
  ['/find', 'Find my pathway', GOAL_STEP, GOAL_TITLE, true],
  // Without a goal, the finder's later steps go back to Your goal.
  ['/find/matches', 'Find my pathway', GOAL_STEP, GOAL_TITLE, true],
  ['/find/readiness', 'Find my pathway', GOAL_STEP, GOAL_TITLE, true],
  ['/find/pathway', 'Find my pathway', GOAL_STEP, GOAL_TITLE, true],
  ['/qualifications', 'Qualifications Library', null, 'Qualifications Library · TESDA-TRACK', true],
  ['/training', 'Find training and assessment centers', null, 'Career Map · TESDA-TRACK', true],
  [
    '/tsp/webview/training',
    'Training & Assessment',
    null,
    'Training & Assessment · TESDA-TRACK',
    true,
  ],
  // Signed out, My Progress asks the learner to sign in, and Reports isn't available (see account tests).
  ['/progress', 'My Progress', null, 'My Progress · TESDA-TRACK', false],
  // Skills Bridge is off on the test server, so Skills Explorer says so without the catalog.
  ['/skills', 'Skills Explorer', null, 'Skills Explorer · TESDA-TRACK', false],
  ['/reports', 'Reports', null, 'Reports · TESDA-TRACK', false],
  ['/profile', 'My Profile', null, 'My Profile · TESDA-TRACK', false],
  ['/sign-in', 'Sign in', null, 'Sign in · TESDA-TRACK', false],
  ['/privacy', 'Privacy policy', null, 'Privacy policy · TESDA-TRACK', false],
  ['/no-such-page', 'Page not found', null, 'Page not found · TESDA-TRACK', false],
] as const

describe('routes', () => {
  it.each(PAGES)(
    '%s shows its page and title',
    async (path, heading, step, title, needsCatalog) => {
      const catalog = serveCatalog()

      const { router } = renderApp(path)
      if (path === '/training') {
        await waitFor(() => expect(router.state.location.pathname).toBe('/explore'))
      }

      expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
      if (step) {
        expect(await screen.findByRole('heading', { level: 2, name: step })).toBeInTheDocument()
      }
      await waitFor(() => expect(document.title).toBe(title))
      // The pages that need the catalog ask for it once, and show once it's in.
      if (needsCatalog) {
        await waitFor(() => expect(catalog.count).toBe(1))
        await waitFor(() => expect(screen.queryByText(en.catalog.loading)).not.toBeInTheDocument())
      }
      expect(catalog.count).toBe(needsCatalog ? 1 : 0)
    },
  )

  it('keeps filters and the fragment when redirecting an old training bookmark', async () => {
    serveCatalog()
    const { router } = renderApp('/training?type=assessment&region=NCR&scholarship=1#centers')
    await waitFor(() => expect(router.state.location.pathname).toBe('/explore'))
    expect(router.state.location.search).toBe('?type=assessment&region=NCR&scholarship=1')
    expect(router.state.location.hash).toBe('#centers')
    expect(screen.queryByText(/This is the earlier version of this page/)).not.toBeInTheDocument()
  })

  it('shows Home without the API', async () => {
    let requests = 0
    server.use(
      http.all('*', () => {
        requests++
        return HttpResponse.error()
      }),
    )

    renderApp('/')

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Your next TESDA step, on a map near you.',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Ready for your next step?' }),
    ).toBeInTheDocument()
    expect(requests).toBe(0)
  })

  it("puts Home under the landing page's top bar, and other pages beside the sidebar", async () => {
    serveCatalog()
    const { router } = renderApp('/')
    await screen.findByRole('heading', { level: 1 })

    const sections = screen.getByRole('navigation', { name: 'Sections' })
    expect(within(sections).getByRole('link', { name: 'How it works' })).toHaveAttribute(
      'href',
      '/#how',
    )
    // Get started opens the two ways in (Sign in with TSP, Continue as guest), not a page.
    expect(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Get started' }),
    ).toHaveAttribute('aria-haspopup', 'true')
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()

    await router.navigate('/qualifications')

    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Sections' })).not.toBeInTheDocument()
  })

  it("shows the account's icon in the app's top bar: Sign in signed out, the account menu signed in", async () => {
    serveCatalog()
    serveAccountApi({ signedIn: false })
    const { unmount } = renderApp('/qualifications')
    const bar = await screen.findByRole('banner')
    expect(
      await within(bar).findByRole('button', { name: 'Sign in to your account' }),
    ).toBeVisible()
    unmount()

    window.localStorage.setItem(SESSION_HINT_KEY, 'signed-in')
    serveAccountApi({ signedIn: true })
    renderApp('/qualifications')
    const signedIn = await screen.findByRole('banner')
    const menu = await within(signedIn).findByRole('button', { name: 'Account: Maria Santos' })
    expect(menu).toHaveTextContent('Maria')
    window.localStorage.removeItem(SESSION_HINT_KEY)
  })

  it('keeps the title fixed when the address carries more', async () => {
    serveCatalog()
    const { router } = renderApp('/qualifications')
    await waitFor(() => expect(document.title).toBe('Qualifications Library · TESDA-TRACK'))

    await router.navigate('/qualifications?q=welding%20in%20Cebu#top')

    expect(document.title).toBe('Qualifications Library · TESDA-TRACK')
  })
})

describe('basename', () => {
  it("is the app's base without its trailing slash", () => {
    expect(basename('/')).toBe('/')
    expect(basename('/app/')).toBe('/app')
  })
})
