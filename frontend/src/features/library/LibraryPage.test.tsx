import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Qualification } from '../../api/queries.ts'
import { renderApp } from '../../test/app.tsx'
import { server } from '../../test/server.ts'
import { FINDER_KEY, useFinderStore } from '../finder/store.ts'

// 14 cookery-like qualifications in Tourism, then two in other sectors: 16 in all, two pages of 12.
const tourism: Qualification[] = Array.from({ length: 14 }, (_, i) => ({
  code: `TOUR-${i + 1}`,
  name: `Tourism qualification ${i + 1} NC II`,
  sector: 'Tourism',
  possible_jobs: [`Job ${i + 1}`],
  competencies: [],
}))
const welding: Qualification = {
  code: 'SMAW-NCI',
  name: 'Shielded Metal Arc Welding (SMAW) NC I',
  sector: 'Metals and Engineering',
  possible_jobs: ['Welder', 'Fabricator'],
  competencies: [
    { id: 2, position: 2, name: 'Weld carbon steel plates', category: 'Core' },
    { id: 1, position: 1, name: 'Participate in workplace communication', category: 'Basic' },
  ],
}
const welding2: Qualification = {
  ...welding,
  code: 'SMAW-NCII',
  name: 'Shielded Metal Arc Welding (SMAW) NC II',
  competencies: [],
}
const catalog = [...tourism, welding, welding2]

function serve(qualifications: Qualification[] = catalog) {
  server.use(http.get('*/api/v1/qualifications', () => HttpResponse.json(qualifications)))
}

async function openLibrary(path = '/qualifications') {
  const view = renderApp(path)
  await screen.findByRole('heading', { level: 1, name: 'Qualifications Library' })
  await screen.findByRole('searchbox', { name: 'Search qualifications or careers' })
  return view
}

const cards = () => screen.queryAllByRole('article')
const cardNames = () =>
  cards().map((card) => within(card).getByRole('heading', { level: 2 }).textContent)

beforeEach(() => {
  window.sessionStorage.clear()
  useFinderStore.getState().reset()
})

describe('Qualifications Library', () => {
  it('shows twelve cards a page, and Next opens the rest at an address of its own', async () => {
    serve()
    const user = userEvent.setup()
    const { router } = await openLibrary()

    expect(cards()).toHaveLength(12)
    expect(
      screen.getByText('16 of 16 qualifications · Showing 1–12 · Find your next possibility'),
    ).toBeInTheDocument()
    const pager = screen.getByRole('navigation', { name: 'Pages' })
    expect(within(pager).getByText('Page 1 of 2')).toBeInTheDocument()
    expect(within(pager).queryByRole('link', { name: 'Previous' })).not.toBeInTheDocument()

    await user.click(within(pager).getByRole('link', { name: 'Next' }))

    expect(router.state.location.search).toBe('?page=2')
    expect(cards()).toHaveLength(4)
    await waitFor(() => expect(screen.getByText(/Showing 13–16/)).toHaveFocus())
    expect(within(pager).queryByRole('link', { name: 'Next' })).not.toBeInTheDocument()
  })

  it('searches names, codes and careers, keeps the search in the address, and starts at page one', async () => {
    serve()
    const user = userEvent.setup()
    const { router } = await openLibrary('/qualifications?page=2')

    await user.type(screen.getByRole('searchbox'), 'fabricator')

    expect(cardNames()).toEqual([welding.name, welding2.name])
    expect(screen.getByText('2 of 16 qualifications · Filtered results')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?q=fabricator')
    expect(screen.queryByRole('navigation', { name: 'Pages' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(router.state.location.search).toBe('')
    expect(cards()).toHaveLength(12)
  })

  it('keeps to a sector chosen from the list', async () => {
    serve()
    const user = userEvent.setup()
    const { router } = await openLibrary()

    await user.click(screen.getByRole('button', { name: /Sector/ }))
    await user.click(await screen.findByRole('option', { name: 'Metals and Engineering' }))

    expect(cardNames()).toEqual([welding.name, welding2.name])
    expect(new URLSearchParams(router.state.location.search).get('sector')).toBe(
      'Metals and Engineering',
    )
  })

  it('can show every qualification while preserving filters and resetting pagination', async () => {
    serve()
    const user = userEvent.setup()
    const { router } = await openLibrary('/qualifications?sector=Tourism&page=2')
    expect(cards()).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Show all qualifications' }))
    expect(cards()).toHaveLength(14)
    expect(new URLSearchParams(router.state.location.search).get('sector')).toBe('Tourism')
    expect(new URLSearchParams(router.state.location.search).get('view')).toBe('all')
    expect(new URLSearchParams(router.state.location.search).has('page')).toBe(false)
    expect(screen.queryByRole('navigation', { name: 'Pages' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show 12 per page' }))
    expect(cards()).toHaveLength(12)
    expect(new URLSearchParams(router.state.location.search).get('sector')).toBe('Tourism')
  })

  it('opens a shared search as it was', async () => {
    serve()
    await openLibrary('/qualifications?q=qualification%201&sector=Tourism')

    expect(screen.getByRole('searchbox')).toHaveValue('qualification 1')
    // 1, and 10 to 14.
    expect(cards()).toHaveLength(6)
  })

  it('says when nothing matches', async () => {
    serve()
    await openLibrary('/qualifications?q=astronaut')

    expect(screen.getByRole('heading', { name: 'No qualifications found' })).toBeInTheDocument()
    expect(cards()).toHaveLength(0)
  })

  it('shows a card’s facts and its competencies by group', async () => {
    serve()
    const user = userEvent.setup()
    await openLibrary('/qualifications?q=SMAW-NCI')

    const card = screen.getByRole('article', { name: welding.name })
    expect(within(card).getByText('Welder, Fabricator')).toBeInTheDocument()
    expect(within(card).getByText('NC I')).toBeInTheDocument()
    expect(within(card).getByText('Pathway to NC II')).toBeInTheDocument()

    await user.click(within(card).getByText('View 2 sample competencies'))
    const groups = within(card).getAllByRole('heading', { level: 3 })
    expect(groups.map((heading) => heading.textContent)).toEqual(['Basic skills', 'Core skills'])
  })

  it('opens Find my pathway with the qualification as the goal, kept out of the address', async () => {
    serve()
    const user = userEvent.setup()
    const { router } = await openLibrary('/qualifications?q=SMAW-NCII')

    await user.click(screen.getByRole('button', { name: 'Explore this pathway' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/find'))
    expect(router.state.location.search).toBe('')
    const goal = 'I want to pursue Shielded Metal Arc Welding (SMAW) NC II.'
    expect(useFinderStore.getState().goal).toBe(goal)
    expect(window.sessionStorage.getItem(FINDER_KEY)).toContain(goal)
  })

  it('says when the catalog has no qualifications yet', async () => {
    serve([])
    renderApp('/qualifications')

    expect(
      await screen.findByRole('heading', { name: 'New possibilities are on the way' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh catalog' })).toBeInTheDocument()
  })
})
