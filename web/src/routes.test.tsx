import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { en } from './copy/en.ts'
import { basename } from './routes.tsx'
import { renderApp, serveCatalog } from './test/app.tsx'
import { server } from './test/server.ts'

const GOAL_STEP = 'What would you like to achieve?'
const GOAL_TITLE = 'Your goal · Find my pathway · TESDA-TRACK'

// Every address, its h1, the step it shows (the finder's h2), its document title, and whether it loads the catalog.
const PAGES = [
  ['/', 'Every career has a track. Find yours.', null, 'TESDA-TRACK · Your next step', false],
  ['/find', 'Find my pathway', GOAL_STEP, GOAL_TITLE, true],
  // Without a goal, the finder's later steps go back to Your goal.
  ['/find/matches', 'Find my pathway', GOAL_STEP, GOAL_TITLE, true],
  ['/find/readiness', 'Find my pathway', GOAL_STEP, GOAL_TITLE, true],
  ['/find/pathway', 'Find my pathway', GOAL_STEP, GOAL_TITLE, true],
  ['/qualifications', 'Qualifications Library', null, 'Qualifications Library · TESDA-TRACK', true],
  ['/training', 'Training & Assessment', null, 'Training & Assessment · TESDA-TRACK', true],
  // Signed out, My Progress asks the learner to sign in, and Reports isn't available (see account tests).
  ['/progress', 'My Progress', null, 'My Progress · TESDA-TRACK', false],
  // Skills Bridge is off on the test server, so Skills Explorer says so without the catalog.
  ['/skills', 'Skills Explorer', null, 'Skills Explorer · TESDA-TRACK', false],
  ['/reports', 'Reports', null, 'Reports · TESDA-TRACK', false],
  ['/sign-in', 'Sign in', null, 'Sign in · TESDA-TRACK', false],
  ['/no-such-page', 'Page not found', null, 'Page not found · TESDA-TRACK', false],
] as const

describe('routes', () => {
  it.each(PAGES)(
    '%s shows its page and title',
    async (path, heading, step, title, needsCatalog) => {
      const catalog = serveCatalog()

      renderApp(path)

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
        name: 'Every career has a track. Find yours.',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'What would you like to achieve?' }),
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
    expect(
      within(screen.getByRole('banner')).getByRole('link', { name: 'Find my path' }),
    ).toHaveAttribute('href', '/find')
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()

    await router.navigate('/qualifications')

    expect(await screen.findByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Sections' })).not.toBeInTheDocument()
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
    expect(basename('/beta/')).toBe('/beta')
  })
})
