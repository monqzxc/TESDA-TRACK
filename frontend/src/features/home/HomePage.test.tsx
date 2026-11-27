import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { en } from '../../copy/en.ts'
import { renderApp, serveCatalog } from '../../test/app.tsx'
import { useExploreStore } from '../explore/useExplore.ts'
import { GOAL_MAX_LENGTH } from '../finder/store.ts'

// The location-first landing page (Trello: "[UI/UX] Landing page redesign"). PO, 19 Nov 2026: every way in opens the
// Career Map, Get started offers Sign in with TSP or Continue as guest (no sign-up), and the privacy notice and the
// language selector stay.

const HEADING = en.pages.home.heading
const copy = en.landingPage

async function openHome() {
  const view = renderApp('/')
  await screen.findByRole('heading', { level: 1, name: HEADING })
  return view
}

const goalBox = () => screen.getByRole('textbox', { name: copy.hero.label })
const findMyPath = () => screen.getByRole('button', { name: copy.hero.submit })

afterEach(() => {
  useExploreStore.getState().setDraft('')
  window.sessionStorage.clear()
})

describe('Home', () => {
  it('has one h1, then a heading for each section, in order', async () => {
    await openHome()

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      copy.about.title,
      copy.howItWorks.title,
      copy.perks.title,
      copy.closing.title,
    ])
  })

  it("has a section for each of the top bar's links", async () => {
    await openHome()
    const bar = screen.getByRole('navigation', { name: copy.sections })

    const links = within(bar).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual([
      copy.nav.about,
      copy.nav.how,
      copy.nav.benefits,
    ])
    for (const link of links) {
      const { pathname, hash } = new URL(link.getAttribute('href')!, 'http://localhost')
      expect(pathname).toBe('/')
      expect(document.getElementById(hash.slice(1))?.tagName).toBe('SECTION')
    }
  })

  it('takes a section link as a page change of its own, so Back returns to where the page was', async () => {
    const user = userEvent.setup()
    const { router } = await openHome()
    const bar = screen.getByRole('navigation', { name: copy.sections })

    await user.click(within(bar).getByRole('link', { name: copy.nav.how }))

    await waitFor(() => expect(router.state.location.hash).toBe('#how'))
    expect(router.state.historyAction).toBe('PUSH')
    expect(router.state.location.key).not.toBe('default')
  })

  it('opens Get started with Sign in with TSP and Continue as guest, and no sign-up', async () => {
    serveCatalog()
    const user = userEvent.setup()
    const { router } = await openHome()

    await user.click(screen.getAllByRole('button', { name: copy.getStarted })[0])
    const menu = await screen.findByRole('dialog', { name: copy.getStarted })
    expect(
      within(menu)
        .getAllByRole('button')
        .filter((item) => item.textContent)
        .map((item) => item.textContent),
    ).toEqual([expect.stringContaining(copy.tsp.title), expect.stringContaining(copy.guest.title)])
    expect(within(menu).queryByText(/sign up|create an account/i)).toBeNull()

    await user.click(within(menu).getByRole('button', { name: new RegExp(copy.guest.title) }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/explore'))
    expect(router.state.location.state).toEqual({ focusSearch: true })
  })

  it('opens the Career Map with the goal and runs its search, out of the address', async () => {
    serveCatalog()
    const user = userEvent.setup()
    const { router } = await openHome()
    const goal = 'Gusto kong maging <b>welder</b> sa Cebu'

    await user.type(goalBox(), goal)
    await user.click(findMyPath())

    await waitFor(() => expect(router.state.location.pathname).toBe('/explore'))
    const { search, hash, state } = router.state.location
    expect([search, hash, state]).toEqual(['', '', { focusSearch: true, runSearch: true }])
    expect(useExploreStore.getState().draft).toBe(goal)
  })

  it.each([
    ['an empty', ''],
    ['a blank', '   '],
  ])('keeps %s goal on Home, with an instruction beside the box', async (_, typed) => {
    const user = userEvent.setup()
    const { router } = await openHome()

    if (typed) await user.type(goalBox(), typed)
    await user.click(findMyPath())

    const box = goalBox()
    expect(box).toHaveAttribute('aria-invalid', 'true')
    expect(box).toHaveAccessibleDescription(expect.stringContaining(copy.hero.empty))
    expect(box).toHaveFocus()
    expect(router.state.location.pathname).toBe('/')

    await user.type(box, 'Welding')
    expect(box).not.toHaveAttribute('aria-invalid')
  })

  it(`takes ${GOAL_MAX_LENGTH} characters at most`, async () => {
    await openHome()
    expect(goalBox()).toHaveAttribute('maxlength', String(GOAL_MAX_LENGTH))
  })

  it('never links to the previous-version training page or to /find', async () => {
    await openHome()
    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'))
    expect(
      hrefs.filter((href) => href?.startsWith('/training') || href?.startsWith('/find')),
    ).toEqual([])
  })

  it('keeps the privacy notice in reach, from the hero and the footer', async () => {
    await openHome()
    expect(screen.getByRole('link', { name: copy.hero.privacyLink })).toHaveAttribute(
      'href',
      '/privacy',
    )
    expect(
      within(screen.getByRole('contentinfo')).getByRole('link', { name: en.privacy.link }),
    ).toHaveAttribute('href', '/privacy')
  })

  it('labels the animated recommendations as illustrative and hides them when the learner types', async () => {
    const user = userEvent.setup()
    await openHome()
    const preview = screen.getByTestId('hero-match-preview')
    expect(
      within(preview).getByRole('img', { name: new RegExp(copy.howItWorks.example) }),
    ).toBeInTheDocument()
    for (const row of copy.hero.previewRows) expect(preview).toHaveTextContent(row.title)
    await user.type(goalBox(), 'Welding')
    expect(within(preview).queryByRole('img')).toBeNull()
    expect(preview).toHaveTextContent(copy.hero.editingHint)
    await user.clear(goalBox())
    expect(within(preview).getByRole('img')).toBeInTheDocument()
  })
})
