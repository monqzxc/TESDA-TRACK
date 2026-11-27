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
import { skillTerms } from './SkillResults.tsx'
import { useDemandStore, useExploreStore } from './useExplore.ts'

// The skills list on the Career Map (the default layout): the skills the search was read as, the view pills, the
// centers by kind, and where the skills are in demand.
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
      matches: [
        {
          qualification: WELDING,
          score: 80,
          reason: 'Matched 2 of your 2 skills or jobs: welding, metal cutting',
        },
      ],
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
    <MemoryRouter initialEntries={['/explore?layout=list']}>
      <ExplorePage />
    </MemoryRouter>,
  )
}

const LONG = { timeout: 4000 }

describe('skillTerms', () => {
  it('reads the search terms, the profile and the match reasons, never the qualifications', () => {
    const terms = skillTerms({
      search: {
        query: 'x',
        result: {
          profile: { intent: 'unknown', existing_skills: ['cooking'] },
          search: { terms: ['Cooking', 'cleaning'], unmatched: [] },
          matches: [
            { qualification: COOKERY, score: 70, reason: 'Matched your words: cook, dishwashing' },
            { qualification: WELDING, score: 40, reason: 'Similar in meaning to your goal.' },
          ],
        },
      },
    } as never)
    expect(terms).toEqual(['Cooking', 'Cleaning', 'Cook', 'Dishwashing'])
  })
})

describe('the skills list', () => {
  it('shows the skills, the pills, the centers by kind and where the skills are in demand', async () => {
    renderPage()
    expect(await screen.findByText('We read your search as these skills')).toBeInTheDocument()
    expect(screen.getByText('Welding')).toBeInTheDocument()
    expect(screen.getByText('Metal cutting')).toBeInTheDocument()
    // Skills, not qualification chips.
    expect(screen.queryByRole('group', { name: /Matched qualification/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'All', pressed: true })).toBeInTheDocument()
    expect(
      await screen.findByRole('heading', { name: 'Training centers' }, LONG),
    ).toBeInTheDocument()
    expect(screen.getAllByText('Strong match').length).toBe(1)
    expect(
      await screen.findByRole('button', { name: /Manila Welding Institute/ }, LONG),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Work: where your skills are in demand' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByText('Near you (National Capital Region): high demand', {}, LONG),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Central Visayas: show on the map' }),
    ).toBeInTheDocument()
  })

  it('Train narrows the list, and a place hiring opens the demand view there', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'Training centers' }, LONG)
    await user.click(screen.getByRole('button', { name: 'Train' }))
    expect(screen.queryByRole('heading', { name: /^Work/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'All' }))
    await user.click(
      await screen.findByRole('button', { name: 'Central Visayas: show on the map' }, LONG),
    )
    await waitFor(() => expect(useDemandStore.getState().region).toBe('VII'))
    expect(screen.getByRole('button', { name: 'Demand', pressed: true })).toBeInTheDocument()
  })

  it('a center opens its preview: photo, flag, Overview and Qualifications', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /Manila Welding Institute/ }, LONG))
    const preview = await screen.findByRole('article', { name: 'Manila Welding Institute' })
    expect(preview).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Sample image' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Overview', selected: true })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Center information' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Travel time' })).toBeInTheDocument()
    // The list stays beside it.
    expect(screen.getByRole('heading', { name: 'Training centers' })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /^Qualifications/ }))
    expect(await screen.findByText(WELDING.name, { selector: 'li span' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Raise a concern about this center' }))
    expect(await screen.findByText('Report a wrong suggestion')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send report' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() =>
      expect(screen.queryByRole('article', { name: 'Manila Welding Institute' })).toBeNull(),
    )
  })
})
