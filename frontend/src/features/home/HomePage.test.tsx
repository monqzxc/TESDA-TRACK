import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { en } from '../../copy/en.ts'
import { renderApp, serveCatalog } from '../../test/app.tsx'
import { mockIntersectionObserver } from '../../test/intersectionObserver.ts'
import { mockMediaQueries } from '../../test/matchMedia.ts'
import { FINDER_KEY, GOAL_MAX_LENGTH, useFinderStore } from '../finder/store.ts'
import { CATALOG, REGIONS } from './data.ts'

const REDUCE = '(prefers-reduced-motion: reduce)'
const HEADING = 'Every career has a track. Find yours.'

async function openHomeAt(path: string) {
  const view = renderApp(path)
  await screen.findByRole('heading', { level: 1, name: HEADING })
  return view
}

const openHome = () => openHomeAt('/')

const goalBox = () => screen.getByRole('textbox', { name: 'Your goal' })
const submit = () => screen.getByRole('button', { name: 'Find my path' })

afterEach(() => {
  useFinderStore.getState().reset()
  window.sessionStorage.clear()
  vi.unstubAllGlobals()
})

describe('Home', () => {
  it('has one h1, then a heading for each section, in order', async () => {
    await openHome()

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Four stops between a goal and a certificate.',
      'Training and assessment near you.',
      '319 qualifications',
      'Save your path. Tick off each step.',
      'What would you like to achieve?',
    ])
  })

  it("has a section for each of the top bar's links", async () => {
    await openHome()
    const sections = screen.getByRole('navigation', { name: 'Sections' })

    for (const link of within(sections).getAllByRole('link')) {
      const { pathname, hash } = new URL(link.getAttribute('href')!, 'http://localhost')
      expect(pathname).toBe('/')
      expect(document.getElementById(hash.slice(1))?.tagName).toBe('SECTION')
    }
  })

  it('takes a section link as a page change of its own, so Back returns to where the page was', async () => {
    const user = userEvent.setup()
    const { router } = await openHome()
    const sections = screen.getByRole('navigation', { name: 'Sections' })

    await user.click(within(sections).getByRole('link', { name: 'Qualifications' }))

    await waitFor(() => expect(router.state.location.hash).toBe('#catalog'))
    expect(router.state.historyAction).toBe('PUSH')
    // An entry of the router's own: a plain link's entry has the page load's key, "default".
    expect(router.state.location.key).not.toBe('default')
  })

  it("has its footer after the main region, as the page's contentinfo landmark", async () => {
    await openHome()

    const footer = screen.getByRole('contentinfo')
    expect(footer).toHaveTextContent(en.home.footer)
    expect(footer).toHaveTextContent(en.footer.copyright)
    expect(screen.getByRole('main')).not.toContainElement(footer)
  })

  it("quotes the catalog's figures from data.ts", async () => {
    await openHome()

    expect(
      screen.getByRole('link', { name: `Browse ${CATALOG.qualifications} qualifications` }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: `${CATALOG.qualifications} qualifications` }),
    ).toBeInTheDocument()
    expect(screen.getByText(`Search all ${REGIONS.length} regions`)).toBeInTheDocument()
    expect(
      screen.getByRole('img', {
        name: en.home.near.mapLabel,
      }),
    ).toBeInTheDocument()
    // The copy takes whatever the figures are.
    expect(en.home.catalog.heading(1005)).toBe('1,005 qualifications')
    expect(en.home.hero.notes(17)).toContain('Search all 17 regions')
  })

  it.each([
    ['Browse 319 qualifications', '/qualifications'],
    ['Find training near you', '/training'],
    ['Open the qualifications library', '/qualifications'],
    ['Go to My progress', '/progress'],
  ])('links "%s" to %s', async (name, path) => {
    await openHome()

    expect(screen.getByRole('link', { name })).toHaveAttribute('href', path)
  })

  it('opens the finder from the hero, without a goal', async () => {
    serveCatalog()
    const user = userEvent.setup()
    const { router } = await openHome()
    const hero = screen.getByRole('region', { name: HEADING })

    await user.click(within(hero).getByRole('link', { name: 'Find my path' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/find'))
    expect(useFinderStore.getState().goal).toBe('')
  })

  it('starts the finder with the goal, which stays out of the address and the title', async () => {
    serveCatalog()
    const user = userEvent.setup()
    const { router } = await openHome()
    const goal = 'Gusto kong maging <b>welder</b> sa Cebu'

    await user.type(goalBox(), goal)
    await user.click(submit())

    await waitFor(() => expect(router.state.location.pathname).toBe('/find'))
    const { search, hash, state } = router.state.location
    expect([search, hash, state]).toEqual(['', '', null])
    expect(useFinderStore.getState().goal).toBe(goal)
    expect(window.sessionStorage.getItem(FINDER_KEY)).toContain('welder')
    await waitFor(() => expect(document.title).toBe('Your goal · Find my pathway · TESDA-TRACK'))
  })

  it.each([
    ['an empty', ''],
    ['a blank', '   '],
  ])('keeps %s goal on Home, with an instruction beside the box', async (_, typed) => {
    const user = userEvent.setup()
    const { router } = await openHome()

    if (typed) await user.type(goalBox(), typed)
    await user.click(submit())

    const box = goalBox()
    expect(box).toHaveAttribute('aria-invalid', 'true')
    expect(box).toHaveAccessibleDescription(
      expect.stringContaining('Describe your career goal or skills to get started.'),
    )
    expect(box).toHaveFocus()
    expect(router.state.location.pathname).toBe('/')
    expect(useFinderStore.getState().goal).toBe('')

    // Typing clears the instruction.
    await user.type(box, 'Welding')
    expect(box).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByText('Describe your career goal or skills to get started.')).toBeNull()
  })

  it(`takes ${GOAL_MAX_LENGTH} characters at most, and counts them`, async () => {
    serveCatalog()
    const user = userEvent.setup()
    const { router } = await openHome()
    const box = goalBox()
    expect(box).toHaveAccessibleDescription('0 of 500 characters')

    await user.click(box)
    await user.paste('a'.repeat(GOAL_MAX_LENGTH + 20))

    expect(box).toHaveValue('a'.repeat(GOAL_MAX_LENGTH))
    expect(box).toHaveAccessibleDescription('500 of 500 characters')
    expect(screen.getByText('500/500')).toBeInTheDocument()

    await user.click(submit())

    await waitFor(() => expect(router.state.location.pathname).toBe('/find'))
    expect(useFinderStore.getState().goal).toHaveLength(GOAL_MAX_LENGTH)
  })

  it('scores the readiness check as it changes, and picks the route', async () => {
    const user = userEvent.setup()
    await openHome()
    const check = screen.getByRole('group', { name: 'Barista NC II · core units' })
    const routes = () =>
      screen.getAllByRole('listitem').filter((item) => item.hasAttribute('aria-current'))

    expect(check).toHaveAccessibleDescription('60% Moderate readiness')
    expect(routes().map((route) => route.querySelector('strong')?.textContent)).toEqual([
      'Take focused training, then the NC assessment',
    ])

    for (const unit of within(check).getAllByRole('radiogroup')) {
      await user.click(within(unit).getByRole('radio', { name: 'Confident' }))
    }

    expect(check).toHaveAccessibleDescription('100% High readiness')
    expect(routes().map((route) => route.querySelector('strong')?.textContent)).toEqual([
      'Apply for the NC assessment',
    ])
  })

  it('shows the example goal and its match in the hero', async () => {
    mockMediaQueries({ [REDUCE]: true })
    await openHome()
    const example = screen.getByRole('group', {
      name: 'Example: a goal matched to a qualification',
    })

    expect(example).toHaveTextContent('Gusto kong maging welder.')
    expect(example).toHaveTextContent('Manual Metal Arc Welding (MMAW) NC II')
    expect(example).toHaveTextContent('92%')
  })

  describe('scroll reveal', () => {
    const page = () => document.querySelector('main > div')!
    const revealed = () => [...document.querySelectorAll('[data-reveal]')]

    it('waits for each part to scroll into view', async () => {
      mockMediaQueries({ [REDUCE]: false })
      const io = mockIntersectionObserver()
      await openHome()

      expect(page()).toHaveAttribute('data-motion')
      const waiting = revealed()
      expect(waiting.length).toBeGreaterThan(20)
      expect(waiting.filter((part) => part.hasAttribute('data-in'))).toEqual([])

      io.scrollIntoView(...io.observed())

      expect(revealed().filter((part) => !part.hasAttribute('data-in'))).toEqual([])
    })

    it('shows everything at once with reduced motion', async () => {
      mockMediaQueries({ [REDUCE]: true })
      mockIntersectionObserver()
      await openHome()

      expect(page()).not.toHaveAttribute('data-motion')
      expect(revealed().filter((part) => !part.hasAttribute('data-in'))).toEqual([])
      // Figures are there from the start, and the example plan's first steps are ticked off.
      expect(screen.getByText('319')).toBeInTheDocument()
      const fact = screen.getByText('units of competency to rate yourself on').closest('li')!
      expect(fact.querySelector('b')).toHaveTextContent('4,981')
      const steps = [...document.querySelectorAll('ol > li')]
      const state = (step: Element) => step.getAttribute('data-state')
      expect(steps.map(state)).toEqual(['done', 'done', 'next', 'to-do'])
    })
  })
})
