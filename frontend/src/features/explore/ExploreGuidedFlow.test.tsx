import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithAuth } from '../../test/account.tsx'
import { server } from '../../test/server.ts'
import { manilaInstitute, REGIONS, weldingProgram } from '../../test/training.ts'
import type { CenterMapProps } from '../training/CenterMapTypes.ts'
import { useTrainingStore } from '../training/state.ts'
import ExplorePage from './ExplorePage.tsx'
import { useDemandStore, useExploreStore } from './useExplore.ts'

// The guided step on the Career Map: a search shows TRACK's pick and the card groups first; a card opens its
// centers, and Back returns to the cards as they were.
vi.mock('../training/CenterMap.tsx', () => ({
  default: (props: CenterMapProps) => (
    <ul data-testid="map" data-place={props.placeRegion ?? ''}>
      {props.centers.length}
    </ul>
  ),
}))

const MAKATI = { latitude: 14.5547, longitude: 121.0244 }
const WELDING = weldingProgram.qualification
const area = (code: string, name: string, posting_count: number, extra: object = {}) => ({
  region_code: code,
  name,
  latitude: 10.3,
  longitude: 123.9,
  posting_count,
  titles: ['Welder'],
  training_sites: 1,
  assessment_sites: 0,
  example_sites: 0,
  demand_share: 0.5,
  supply_share: 0.5,
  balance: 'more_demand',
  limited: false,
  ...extra,
})
const outlook = (url: URL) => ({
  qualification: { code: url.searchParams.get('qualification_code'), name: WELDING.name },
  region_code: url.searchParams.get('region_code'),
  home_region_code: url.searchParams.get('home_region_code'),
  relocate: url.searchParams.get('relocate') === 'true',
  areas: [area('NCR', 'National Capital Region', 20), area('VII', 'Central Visayas', 9)],
  totals: {
    posting_count: 29,
    employer_count: 10,
    training_sites: 2,
    assessment_sites: 0,
    regions_with_postings: 2,
    regions_with_sites: 2,
  },
  alternatives: ['VII'],
  training_site_ids: [1],
  assessment_site_ids: [],
  snapshot_dates: ['2026-11-04'],
  insight: { headline: 'Welding in Metro Manila', summary: 'In demand.', points: [] },
  demand_available: true,
  demand_is_sample: false,
  home_demand: {
    region_code: 'NCR',
    name: 'National Capital Region',
    posting_count: 20,
    level: 'high',
    rank: 1,
    ranked_of: 2,
    limited: false,
  },
  higher_demand: [],
  includes_example_sites: false,
  ai_summary_available: false,
  method_version: 'qualification-outlook-v1',
  limitations: [],
})
const COOKERY = { code: 'CKY-NCII', name: 'Cookery NC II', sector: 'Tourism' }

beforeEach(() => {
  sessionStorage.clear()
  useExploreStore.getState().reset()
  useExploreStore.getState().setSearch({
    query: 'I can weld',
    result: {
      profile: { intent: 'training_recommendation' },
      matches: [{ qualification: WELDING, score: 80, reason: 'Matched weld' }],
    },
  })
  useDemandStore.setState({
    region: undefined,
    scope: undefined,
    locality: null,
    code: undefined,
    offset: 0,
  })
  useTrainingStore.setState({
    useLocation: true,
    location: MAKATI,
    locating: false,
    placeText: '',
    placePoint: null,
    locationError: null,
    routeTo: null,
  })
  server.use(
    http.get('*/api/v1/regions', () => HttpResponse.json(REGIONS)),
    http.get('*/api/v1/qualifications', () => HttpResponse.json([])),
    http.get('*/api/v1/training-providers', () => HttpResponse.json([manilaInstitute])),
    http.get('*/api/v1/training-programs', ({ request }) => {
      const code = new URL(request.url).searchParams.get('qualification_code')
      return HttpResponse.json(
        [weldingProgram].filter((p) => !code || p.qualification.code === code),
      )
    }),
    http.get('*/api/v1/labor-market/outlook', ({ request }) =>
      HttpResponse.json(outlook(new URL(request.url))),
    ),
    http.post('*/api/v1/labor-market/suggestions', () =>
      HttpResponse.json({
        region_code: 'NCR',
        region_name: 'National Capital Region',
        suggestions: [
          {
            qualification: COOKERY,
            posting_count: 30,
            level: 'high',
            limited: false,
            fit: 0,
            reasons: ['30 posting records in National Capital Region: high demand here.'],
          },
        ],
        method_version: 'nearby-suggestions-v1',
        limitations: [],
      }),
    ),
  )
})

function renderPage() {
  return renderWithAuth(
    <MemoryRouter initialEntries={['/explore']}>
      <ExplorePage />
    </MemoryRouter>,
  )
}

const LONG = { timeout: 4000 }

describe('the guided step', () => {
  it('search shows the guided cards, not the range question', async () => {
    renderPage()
    expect(await screen.findByText('★ Best fit for you', {}, LONG)).toBeInTheDocument()
    expect(
      await screen.findByText('In demand in National Capital Region', {}, LONG),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'How far can you go?' })).toBeNull()
    // The chips' job is done by the cards.
    expect(screen.queryByRole('group', { name: /Matched qualification/ })).toBeNull()
  })

  it('tapping the pick opens its centers and back returns without replay', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('In demand in National Capital Region', {}, LONG)
    await user.click(screen.getByRole('button', { name: 'See centers' }))
    expect(
      (await screen.findAllByRole('button', { name: /Manila Welding Institute/ })).length,
    ).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Back to suggestions' }))
    // Already played: every group is there at once.
    expect(screen.getByText('★ Best fit for you')).toBeInTheDocument()
    expect(screen.getByText('In demand in National Capital Region')).toBeInTheDocument()
    expect(useExploreStore.getState().picked).toEqual([])
  })

  it('an early tap, then Back, shows the cards in place without replaying', async () => {
    const user = userEvent.setup()
    renderPage()
    // Tapped as soon as the pick shows, before the other groups have appeared.
    await user.click(await screen.findByRole('button', { name: 'See centers' }, LONG))
    await user.click(await screen.findByRole('button', { name: 'Back to suggestions' }))
    expect(screen.getByText('In demand in National Capital Region')).toBeInTheDocument()
  })

  it('back from a considered card', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /Cookery NC II/ }, LONG))
    await waitFor(() => expect(useExploreStore.getState().search?.chosen).toBe(true))
    expect(useExploreStore.getState().guidedBack?.query).toBe('I can weld')
    await user.click(await screen.findByRole('button', { name: 'Back to suggestions' }))
    expect(useExploreStore.getState().search?.query).toBe('I can weld')
    expect(screen.getByText('★ Best fit for you')).toBeInTheDocument()
  })

  it('relocate from the pill puts the demand group first', async () => {
    // A second match in Manila, so the near group has a card of its own beside the pick.
    const pipefitting = {
      ...weldingProgram,
      id: 72,
      qualification: {
        code: 'PIPE-NCII',
        name: 'Pipefitting NC II',
        sector: 'Metals and Engineering',
      },
    }
    server.use(
      http.get('*/api/v1/training-programs', ({ request }) => {
        const code = new URL(request.url).searchParams.get('qualification_code')
        return HttpResponse.json(
          [weldingProgram, pipefitting].filter((p) => !code || p.qualification.code === code),
        )
      }),
    )
    useExploreStore.getState().setSearch({
      query: 'I can weld',
      result: {
        profile: { intent: 'training_recommendation' },
        matches: [
          { qualification: WELDING, score: 80, reason: 'Matched weld' },
          { qualification: pipefitting.qualification, score: 70, reason: 'Matched pipe' },
        ],
      },
    })
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Pipefitting NC II', {}, LONG)
    await user.click(screen.getByRole('button', { name: /^How far can you go\?/ }))
    const picker = await screen.findByRole('dialog', { name: 'How far can you go?' })
    await user.click(
      Array.from(picker.querySelectorAll('button')).find((b) =>
        b.textContent?.startsWith('Relocate'),
      )!,
    )
    // Relocating asks for the outlook again; the groups come back in the new order.
    await waitFor(() => {
      const labels = screen.getAllByRole('heading', { level: 3 }).map((node) => node.textContent)
      const demand = labels.indexOf(`Where ${WELDING.name} is in demand`)
      expect(demand).toBeGreaterThanOrEqual(0)
      expect(demand).toBeLessThan(labels.indexOf(`${WELDING.name} near you`))
    }, LONG)
  })

  it('region card filters to the region and back clears it', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /Central Visayas/ }, LONG))
    expect(useExploreStore.getState().relocate).toBe(true)
    // The region, and "any distance" while it's open.
    expect(await screen.findByRole('button', { name: 'Filters, 2 on' })).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Back to suggestions' }))
    expect(useExploreStore.getState().relocate).toBe(false)
    expect(await screen.findByRole('button', { name: /^Filters$/ })).toBeInTheDocument()
  })

  it('a region without a center narrows the recommendations, says so, and points outside', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /Central Visayas/ }, LONG))
    // The empty region says so, with its demand, and names the nearest center outside it.
    const empty = await screen.findByTestId('place-empty', {}, LONG)
    expect(empty).toHaveTextContent(
      `No center for ${WELDING.name} is recorded in Central Visayas yet.`,
    )
    expect(empty).toHaveTextContent('Employers there want it: 9 job posts.')
    expect(empty).toHaveTextContent('Nearest centers outside Central Visayas')
    expect(empty).toHaveTextContent('Manila Welding Institute')
    // The ranked list is the region's: empty, so the message above stands in for it.
    expect(screen.queryByTestId('ranked-centers')).not.toBeInTheDocument()
    // The map outlines the region and draws its heat.
    expect(screen.getByTestId('map')).toHaveAttribute('data-place', 'VII')
    await user.click(screen.getByRole('button', { name: 'Back to suggestions' }))
    await waitFor(() => expect(screen.getByTestId('map')).toHaveAttribute('data-place', ''))
  })

  it('a region with centers recommends from them', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('*/api/v1/labor-market/outlook', ({ request }) =>
        HttpResponse.json({
          ...outlook(new URL(request.url)),
          areas: [area('NCR', 'National Capital Region', 20), area('VII', 'Central Visayas', 9)],
          home_demand: {
            ...outlook(new URL(request.url)).home_demand,
            region_code: 'VII',
            name: 'Central Visayas',
            rank: 2,
          },
        }),
      ),
    )
    useTrainingStore.setState({ location: { latitude: 10.3157, longitude: 123.8854 } })
    renderPage()
    await user.click(await screen.findByRole('button', { name: /National Capital Region/ }, LONG))
    const ranked = await screen.findByTestId('ranked-centers', {}, LONG)
    await waitFor(() => expect(ranked).toHaveTextContent('Manila Welding Institute'), LONG)
    expect(screen.queryByTestId('place-empty')).not.toBeInTheDocument()
  })
})
