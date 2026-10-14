import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { basename } from './routes.tsx'
import { renderApp, serveCatalog } from './test/app.tsx'
import { server } from './test/server.ts'

// Every address, its h1, the step it shows (the finder's), its document title, and whether it loads the catalog.
const PAGES = [
  ['/', 'Every career has a track. Find yours.', null, 'TESDA-TRACK · Your next step', false],
  ['/find', 'Find my pathway', 'Your goal', 'Your goal · Find my pathway · TESDA-TRACK', true],
  [
    '/find/matches',
    'Find my pathway',
    'Your match',
    'Your match · Find my pathway · TESDA-TRACK',
    true,
  ],
  [
    '/find/readiness',
    'Find my pathway',
    'Readiness check',
    'Readiness check · Find my pathway · TESDA-TRACK',
    true,
  ],
  [
    '/find/pathway',
    'Find my pathway',
    'Your pathway',
    'Your pathway · Find my pathway · TESDA-TRACK',
    true,
  ],
  ['/qualifications', 'Qualifications Library', null, 'Qualifications Library · TESDA-TRACK', true],
  ['/training', 'Training & Assessment', null, 'Training & Assessment · TESDA-TRACK', true],
  ['/progress', 'My Progress', null, 'My Progress · TESDA-TRACK', true],
  ['/skills', 'Skills Explorer', null, 'Skills Explorer · TESDA-TRACK', true],
  ['/reports', 'Reports', null, 'Reports · TESDA-TRACK', true],
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
      if (step) expect(screen.getByRole('heading', { level: 2, name: step })).toBeInTheDocument()
      await waitFor(() => expect(document.title).toBe(title))
      // The line under the heading shows once the catalog is in, on the pages that need it.
      if (needsCatalog) expect(await screen.findByText(/^Soon /)).toBeInTheDocument()
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
    expect(screen.getByText('The new home page is coming soon.')).toBeInTheDocument()
    expect(requests).toBe(0)
  })

  it("puts Home under the landing page's top bar, and other pages beside the sidebar", async () => {
    serveCatalog()
    const { router } = renderApp('/')
    await screen.findByRole('heading', { level: 1 })

    const sections = screen.getByRole('navigation', { name: 'Sections' })
    expect(within(sections).getByRole('link', { name: 'How it works' })).toHaveAttribute(
      'href',
      '#how',
    )
    expect(screen.getByRole('link', { name: 'Find my path' })).toHaveAttribute('href', '/find')
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
