import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Qualification } from '../../api/queries.ts'
import { renderApp } from '../../test/app.tsx'
import { server } from '../../test/server.ts'
import { useFinderStore } from '../finder/store.ts'

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
  await screen.findByRole('searchbox', { name: 'Search qualifications' })
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
    expect(screen.getByText('16 of 16 qualifications · Showing 1–12')).toBeInTheDocument()
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
    expect(screen.getByText('2 of 16 qualifications')).toBeInTheDocument()
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

  it('shows a card’s level, competencies and the level after it', async () => {
    serve()
    await openLibrary('/qualifications?q=SMAW-NCI')

    const card = screen.getByRole('article', { name: welding.name })
    expect(within(card).getByText('NC I')).toBeInTheDocument()
    expect(within(card).getByText('2 competencies')).toBeInTheDocument()
    expect(within(card).getByText('NC II also available')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'See competencies' })).toHaveAttribute(
      'href',
      '/qualifications/SMAW-NCI',
    )
  })

  it('opens a qualification’s page, whose breadcrumb returns to the search', async () => {
    serve()
    const user = userEvent.setup()
    const { router } = await openLibrary('/qualifications?q=SMAW-NCI')

    const card = screen.getByRole('article', { name: welding.name })
    await user.click(within(card).getByRole('link', { name: 'See competencies' }))

    expect(await screen.findByRole('heading', { level: 1, name: welding.name })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/qualifications/SMAW-NCI')
    expect(screen.getByText('2 competencies (1 basic, 1 core)')).toBeInTheDocument()
    const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(
      within(breadcrumb).getByRole('link', { name: 'Qualifications Library' }),
    ).toHaveAttribute('href', '/qualifications?q=SMAW-NCI')
  })

  it('lists a qualification’s competencies by group, numbered on from one group to the next', async () => {
    serve()
    renderApp('/qualifications/SMAW-NCI')

    await screen.findByRole('heading', { level: 1, name: welding.name })
    const groups = screen.getAllByRole('heading', { level: 2 })
    expect(groups.map((heading) => heading.textContent)).toEqual([
      'Basic competencies (1)',
      'Core competencies (1)',
    ])
    const core = screen.getByRole('region', { name: 'Core competencies (1)' })
    expect(within(core).getByRole('list')).toHaveAttribute('start', '2')
    expect(within(core).getByText('Weld carbon steel plates')).toBeInTheDocument()
    const onThisPage = screen.getByRole('navigation', { name: 'On this page' })
    expect(
      within(onThisPage)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Basic competencies · 1', 'Core competencies · 1'])
  })

  it('opens the map page with the qualification’s training or assessment centers', async () => {
    serve()
    renderApp('/qualifications/SMAW-NCI')

    await screen.findByRole('heading', { level: 1, name: welding.name })
    expect(screen.getByRole('link', { name: 'Find training centers' })).toHaveAttribute(
      'href',
      '/explore?qualification=SMAW-NCI&type=training',
    )
    expect(screen.getByRole('link', { name: 'Find assessment centers' })).toHaveAttribute(
      'href',
      '/explore?qualification=SMAW-NCI&type=assessment',
    )
  })

  it('says when a qualification isn’t in the catalog', async () => {
    serve()
    renderApp('/qualifications/NOT-A-CODE')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Qualification not found' }),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: 'Qualifications Library' }),
    ).toHaveAttribute('href', '/qualifications')
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
