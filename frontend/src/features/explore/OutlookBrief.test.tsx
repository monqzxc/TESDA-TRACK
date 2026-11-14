import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type Auth } from '../../auth/useAuth.ts'
import { renderWithQuery } from '../../test/query.tsx'
import { server } from '../../test/server.ts'
import type { CenterMapProps } from '../training/CenterMapTypes.ts'
import { useTrainingStore } from '../training/state.ts'
import ExplorePage from './ExplorePage.tsx'
import { useDemandStore, useExploreStore } from './useExplore.ts'

// The map says what it was given: which centers are starred, which regions carry a balance, and how it is framed.
vi.mock('../training/CenterMap.tsx', () => ({
  default: (props: CenterMapProps) => (
    <div
      data-testid="map"
      data-pins={props.centers.map((center) => center.id).join(' ')}
      data-recommended={(props.recommended ?? []).join(' ')}
      data-overview={String(Boolean(props.demandOverview))}
    >
      {props.demandAreas?.map((area) => (
        <span key={area.region_code}>
          {area.region_code}:{area.posting_count}:{area.centers}:{area.balance}
        </span>
      ))}
    </div>
  ),
}))

const CODE = 'HOUSEKEEPING-NC-II'
const NAME = 'Housekeeping NC II'
const regions = [
  { code: 'NCR', name: 'Metro Manila', latitude: 14.6, longitude: 121, center_city: 'Manila' },
  { code: 'VII', name: 'Central Visayas', latitude: 10.3, longitude: 123.9, center_city: 'Cebu' },
]
const site = (id: number, name: string, region: string, latitude: number, longitude: number) => ({
  id,
  name,
  region_code: region,
  city: null,
  latitude,
  longitude,
})
const providers = [
  site(1, 'Manila Hotel School', 'NCR', 14.61, 121.0),
  site(2, 'Cebu Hotel School', 'VII', 10.31, 123.9),
]
const centers = [site(7, 'Manila Assessment Center', 'NCR', 14.62, 121.01)]
const qualification = { code: CODE, name: NAME, sector: 'Tourism' }
const area = (region: (typeof regions)[number], extra: object) => ({
  region_code: region.code,
  name: region.name,
  latitude: region.latitude,
  longitude: region.longitude,
  titles: [],
  example_sites: 0,
  limited: false,
  ...extra,
})
const asked: URL[] = []
let aiSummary = false
let demandAvailable = true

const outlook = (url: URL) => {
  const relocate = url.searchParams.get('relocate') === 'true'
  return {
    qualification: { code: CODE, name: NAME },
    region_code: url.searchParams.get('region_code'),
    home_region_code: url.searchParams.get('home_region_code'),
    relocate,
    areas: [
      area(regions[0], {
        posting_count: 2,
        training_sites: 1,
        assessment_sites: 1,
        demand_share: 0.2,
        supply_share: 0.67,
        balance: 'more_supply',
        limited: true,
      }),
      area(regions[1], {
        posting_count: 8,
        training_sites: 1,
        assessment_sites: 0,
        demand_share: 0.8,
        supply_share: 0.33,
        balance: 'more_demand',
      }),
    ],
    totals: {
      posting_count: 10,
      employer_count: 9,
      training_sites: 2,
      assessment_sites: 1,
      regions_with_postings: 2,
      regions_with_sites: 2,
    },
    alternatives: ['VII'],
    training_site_ids: [1, 2],
    // The registry accredits it: the page's own listings don't know.
    assessment_site_ids: [7],
    snapshot_dates: ['2026-11-04'],
    insight: {
      headline: 'Metro Manila: training supply for Housekeeping NC II is ahead of recorded demand',
      summary: relocate
        ? 'You are in Metro Manila and are open to relocating. If you relocate, look first at Central Visayas.'
        : 'You are in Metro Manila and prefer not to relocate. That makes Metro Manila look saturated.',
      points: [{ kind: 'demand', text: '2 posting records in Metro Manila are linked to it.' }],
    },
    // Card 3, as the API ranks it: Manila has 2 of the 10 records, Cebu 8.
    demand_available: demandAvailable,
    home_demand: !demandAvailable
      ? null
      : url.searchParams.get('home_region_code') === 'NCR'
        ? {
            region_code: 'NCR',
            name: 'Metro Manila',
            posting_count: 2,
            level: 'low',
            rank: 2,
            ranked_of: 2,
            limited: true,
          }
        : url.searchParams.get('home_region_code') === 'VII'
          ? {
              region_code: 'VII',
              name: 'Central Visayas',
              posting_count: 8,
              level: 'high',
              rank: 1,
              ranked_of: 2,
              limited: false,
            }
          : null,
    higher_demand:
      demandAvailable && url.searchParams.get('home_region_code') === 'NCR'
        ? [
            {
              region_code: 'VII',
              name: 'Central Visayas',
              posting_count: 8,
              level: 'high',
              distance_km: 571.2,
              nearby: false,
            },
          ]
        : [],
    includes_example_sites: false,
    ai_summary_available: aiSummary,
    method_version: 'qualification-outlook-v1',
    limitations: [],
  }
}

beforeEach(() => {
  asked.length = 0
  aiSummary = false
  demandAvailable = true
  useDemandStore.setState({
    region: undefined,
    scope: undefined,
    locality: null,
    code: undefined,
    offset: 0,
  })
  useExploreStore.setState({
    draft: 'housekeeping',
    relocate: false,
    search: {
      query: 'housekeeping',
      result: {
        profile: { intent: 'training_recommendation' },
        matches: [{ qualification, score: 90, reason: 'Matched housekeeping' }],
      },
    } as never,
  })
  // The learner shared a location in Manila.
  useTrainingStore.setState({
    useLocation: true,
    location: { latitude: 14.6, longitude: 121 },
    locating: false,
    placeText: '',
    locationError: null,
    routeTo: null,
  })
  server.use(
    http.get('*/api/v1/regions', () => HttpResponse.json(regions)),
    http.get('*/api/v1/qualifications', () =>
      HttpResponse.json([{ ...qualification, possible_jobs: [], competencies: [] }]),
    ),
    http.get('*/api/v1/client-config', () =>
      HttpResponse.json({ routing_enabled: false, carto_key: '' }),
    ),
    http.get('*/api/v1/training-providers', () => HttpResponse.json(providers)),
    http.get('*/api/v1/assessment-centers', () => HttpResponse.json(centers)),
    http.get('*/api/v1/training-programs', () =>
      HttpResponse.json(
        providers.map((provider, index) => ({
          id: index + 1,
          qualification,
          provider,
          title: NAME,
          delivery_mode: 'unknown',
          scholarship_available: false,
        })),
      ),
    ),
    http.get('*/api/v1/assessment-schedules', () => HttpResponse.json([])),
    http.get('*/api/v1/labor-market/jobs', () =>
      HttpResponse.json({
        items: [],
        total: 0,
        posting_count: 0,
        employer_count: 0,
        limit: 20,
        offset: 0,
        region_code: null,
        locality: null,
        localities: [],
        areas: [],
        snapshot_dates: [],
        posted_between: [],
        source_url: '',
        limitations: [],
      }),
    ),
    http.get('*/api/v1/labor-market/outlook', ({ request }) => {
      const url = new URL(request.url)
      asked.push(url)
      return HttpResponse.json(outlook(url))
    }),
    http.get('*/api/v1/labor-market/outlook/summary', () =>
      HttpResponse.json({
        source: 'ai',
        model: 'test',
        text: 'An AI-written note about Metro Manila.',
      }),
    ),
  )
})

const open = (path = '/explore') =>
  renderWithQuery(
    <MemoryRouter initialEntries={[path]}>
      <ExplorePage />
    </MemoryRouter>,
  )
const brief = () => screen.findByRole('region', { name: 'Supply and demand analysis' })

describe('the supply and demand brief', () => {
  it('analyses the first matched qualification for the learner’s own region and recommends the nearest centers', async () => {
    open()
    const card = within(await brief())
    expect(await card.findByRole('heading', { level: 2 })).toHaveTextContent(
      'training supply for Housekeeping NC II is ahead',
    )
    expect(await card.findByText('Saturated')).toBeVisible()
    expect(card.getByText('Rough signal')).toBeVisible()
    expect(card.getByText(/prefer not to relocate/)).toBeVisible()
    // Only codes and the relocation choice are sent: the region nearest the learner, never their coordinates.
    const url = asked.at(-1) as URL
    expect(Object.fromEntries(url.searchParams)).toEqual({
      qualification_code: CODE,
      region_code: 'NCR',
      home_region_code: 'NCR',
      relocate: 'false',
    })
    // The nearest training center, and the assessment center only the registry links to the qualification.
    expect(await card.findByRole('button', { name: /Manila Hotel School/ })).toHaveTextContent(
      'Nearest to you',
    )
    expect(card.getByRole('button', { name: /Manila Assessment Center/ })).toBeVisible()
    expect(card.queryByRole('button', { name: /Cebu Hotel School/ })).toBeNull()
    await waitFor(() =>
      expect(screen.getByTestId('map')).toHaveAttribute(
        'data-recommended',
        'training-1 assessment-7',
      ),
    )
  })

  it('looks further for a learner open to relocating', async () => {
    open()
    const card = within(await brief())
    fireEvent.click(await card.findByRole('switch', { name: 'Open to relocating' }))
    expect(await card.findByText(/look first at Central Visayas/)).toBeVisible()
    expect(asked.at(-1)?.searchParams.get('relocate')).toBe('true')
    expect(await card.findByRole('button', { name: /Cebu Hotel School/ })).toHaveTextContent(
      'If you relocate: Central Visayas',
    )
    await waitFor(() =>
      expect(screen.getByTestId('map')).toHaveAttribute(
        'data-recommended',
        'training-1 assessment-7 training-2',
      ),
    )
  })

  it('shows the demand view as the qualification’s regions with its centers pinned over them', async () => {
    open()
    const card = within(await brief())
    fireEvent.click(await card.findByRole('button', { name: 'Show demand on the map' }))
    const map = screen.getByTestId('map')
    expect(await within(map).findByText('NCR:2:2:more_supply')).toBeInTheDocument()
    expect(within(map).getByText('VII:8:1:more_demand')).toBeInTheDocument()
    expect(map).toHaveAttribute('data-pins', 'training-1 assessment-7 training-2')
    expect(map).toHaveAttribute('data-overview', 'false')
    fireEvent.click(card.getByRole('switch', { name: 'Open to relocating' }))
    await waitFor(() => expect(map).toHaveAttribute('data-overview', 'true'))
    expect(card.getByRole('button', { name: 'Back to all results' })).toBeVisible()
  })

  it('shows the AI-written summary where the deployment has it, with the numbers behind it', async () => {
    aiSummary = true
    open()
    const card = within(await brief())
    expect(await card.findByText('An AI-written note about Metro Manila.')).toBeVisible()
    expect(card.getByText('AI summary')).toBeVisible()
    expect(
      card.getByText('2 posting records in Metro Manila are linked to it.'),
    ).toBeInTheDocument()
  })

  it('folds to its headline, and is absent without a qualification in focus', async () => {
    const view = open()
    const card = within(await brief())
    await card.findByText(/prefer not to relocate/)
    fireEvent.click(card.getByRole('button', { name: 'Hide analysis' }))
    expect(card.getByRole('heading', { level: 2 })).toBeVisible()
    expect(card.queryByText(/prefer not to relocate/)).not.toBeVisible()
    view.unmount()
    useExploreStore.setState({ search: null })
    open()
    await screen.findByTestId('map')
    expect(screen.queryByRole('region', { name: 'Supply and demand analysis' })).toBeNull()
  })
})

describe('Demand where you are (Card 3)', () => {
  // The first answer can come before the regions, without an area: wait for the one about the learner's area.
  const brief = async (settled: string | RegExp) => {
    renderWithQuery(
      <MemoryRouter initialEntries={['/explore']}>
        <ExplorePage />
      </MemoryRouter>,
    )
    await screen.findByText(settled)
    return screen.getByRole('group', { name: 'Demand where you are' })
  }

  it('gives the level where the learner is and where the qualification is needed more', async () => {
    const local = await brief('Low demand')
    expect(within(local).getByText(/From your location/)).toBeInTheDocument()
    expect(
      within(local).getByText(/2 posting records in Metro Manila\. Number 2 of 2 regions/),
    ).toBeInTheDocument()
    expect(within(local).getByText('Elsewhere')).toBeInTheDocument()
    const cebu = within(local).getByRole('button', { name: 'Show Central Visayas on the map' })
    expect(cebu).toHaveTextContent('8 records')
    expect(cebu).toHaveTextContent('about 571 km away')
    expect(asked.at(-1)?.searchParams.get('home_region_code')).toBe('NCR')

    // Chosen, the area is analysed and shaded on the demand map; the learner's own area stays theirs.
    fireEvent.click(cebu)
    await waitFor(() => expect(asked.at(-1)?.searchParams.get('region_code')).toBe('VII'))
    expect(asked.at(-1)?.searchParams.get('home_region_code')).toBe('NCR')
    expect(await screen.findByText('VII:8:1:more_demand')).toBeInTheDocument()
  })

  it('says the learner is already where it is needed most', async () => {
    useTrainingStore.setState({ location: { latitude: 10.3, longitude: 123.9 } })
    const local = await brief('High demand')
    expect(within(local).getByText(/The most of 2 regions/)).toBeInTheDocument()
    expect(within(local).getByText(/No region has more recorded demand/)).toBeInTheDocument()
  })

  it('takes the area from the Skill Passport when no location is shared', async () => {
    useTrainingStore.setState({ useLocation: false, location: null })
    server.use(
      http.get('*/api/v1/auth/tsp/profile', () =>
        HttpResponse.json({
          skills: [],
          experience: [],
          education: [],
          qualifications: [],
          credentials: [],
          region_code: 'VII',
        }),
      ),
    )
    renderWithQuery(
      <AuthContext.Provider value={{ learner: { id: 'ana' } } as Auth}>
        <MemoryRouter initialEntries={['/explore']}>
          <ExplorePage />
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    await screen.findByText('High demand')
    const local = screen.getByRole('group', { name: 'Demand where you are' })
    expect(within(local).getByText(/From your Skill Passport/)).toBeInTheDocument()
    expect(asked.at(-1)?.searchParams.get('home_region_code')).toBe('VII')
  })

  it('asks for an area when it has none', async () => {
    useTrainingStore.setState({ useLocation: false, location: null })
    const local = await brief(/type a city to see demand where you are/)
    expect(within(local).getByRole('status')).toHaveTextContent(/to see demand where you are/)
  })

  it('says plainly when there is no demand data for the qualification', async () => {
    demandAvailable = false
    const local = await brief(/No posting records link to this qualification yet/)
    expect(within(local).getByRole('status')).toHaveTextContent(/not proof of low demand/)
    expect(within(local).queryByText(/ demand$/)).not.toBeInTheDocument()
  })
})

describe('Other qualifications in demand near you (Card 4)', () => {
  const sent: { region_code: string; skills: string[]; held: string[] }[] = []
  const food = {
    qualification: {
      code: 'FBS-NC-II',
      name: 'Food and Beverage Services NC II',
      sector: 'Tourism',
    },
    posting_count: 12,
    level: 'high',
    limited: false,
    fit: 60,
    reasons: [
      '12 posting records in Metro Manila: high demand here.',
      'Same sector as Housekeeping NC II: Tourism.',
    ],
  }
  const serve = (suggestions: object[]) =>
    server.use(
      http.post('*/api/v1/labor-market/suggestions', async ({ request }) => {
        sent.push((await request.json()) as (typeof sent)[number])
        return HttpResponse.json({
          region_code: 'NCR',
          region_name: 'Metro Manila',
          suggestions,
          method_version: 'nearby-suggestions-v1',
          limitations: [],
        })
      }),
    )
  const open = () =>
    renderWithQuery(
      <MemoryRouter initialEntries={['/explore']}>
        <ExplorePage />
      </MemoryRouter>,
    )

  beforeEach(() => {
    sent.length = 0
    useExploreStore.setState({
      search: {
        query: 'I clean rooms',
        result: {
          profile: { intent: 'training_recommendation', existing_skills: ['cleaning'] },
          matches: [{ qualification, score: 90, reason: 'Matched housekeeping' }],
        },
      } as never,
    })
  })

  it('suggests a few with why, from the learner’s region, skills and chosen qualification', async () => {
    serve([food])
    open()
    const choice = await screen.findByRole('button', {
      name: 'Look at Food and Beverage Services NC II',
    })
    expect(choice).toHaveTextContent('High demand')
    expect(choice).toHaveTextContent('12 posting records in Metro Manila: high demand here.')
    expect(choice).toHaveTextContent('Same sector as Housekeeping NC II: Tourism.')
    expect(sent.at(-1)).toEqual({
      region_code: 'NCR',
      skills: ['cleaning'],
      held: [CODE],
      limit: 3,
    })

    // Chosen, it becomes the qualification the brief and the map analyse.
    fireEvent.click(choice)
    await waitFor(() =>
      expect(asked.at(-1)?.searchParams.get('qualification_code')).toBe('FBS-NC-II'),
    )
  })

  it('follows the learner’s region', async () => {
    serve([food])
    useTrainingStore.setState({ location: { latitude: 10.3, longitude: 123.9 } })
    open()
    await waitFor(() => expect(sent.at(-1)?.region_code).toBe('VII'))
  })

  it('says so when nothing else is in demand nearby', async () => {
    serve([])
    open()
    const group = await screen.findByRole('group', {
      name: 'Other qualifications in demand near you',
    })
    expect(
      await within(group).findByText(/No other qualification shows enough recorded demand/),
    ).toBeInTheDocument()
  })
})

describe('Find Jobs on TSP (Card 5)', () => {
  const open = () =>
    renderWithQuery(
      <MemoryRouter initialEntries={['/explore']}>
        <ExplorePage />
      </MemoryRouter>,
    )

  it('opens TSP Find Jobs for the qualification and area, in a new tab', async () => {
    server.use(
      http.get('*/api/v1/client-config', () =>
        HttpResponse.json({
          routing_enabled: false,
          carto_key: '',
          tsp_find_jobs_url: 'https://tsp.example.ph/find-jobs',
          tsp_find_jobs_skill_param: 'skill',
          tsp_find_jobs_area_param: 'area',
        }),
      ),
    )
    open()
    const link = await screen.findByRole('link', {
      name: 'Find Jobs on TSP for Housekeeping NC II in Metro Manila (opens TESDA Skill Passport in a new tab)',
    })
    expect(link).toHaveAttribute(
      'href',
      'https://tsp.example.ph/find-jobs?skill=Housekeeping+NC+II&area=Metro+Manila',
    )
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.getAttribute('rel')).toContain('noreferrer')
  })

  it('follows the area being looked at', async () => {
    server.use(
      http.get('*/api/v1/client-config', () =>
        HttpResponse.json({ tsp_find_jobs_url: 'https://tsp.example.ph/find-jobs' }),
      ),
    )
    useDemandStore.setState({ region: 'VII' })
    open()
    const link = await screen.findByRole('link', { name: /in Central Visayas/ })
    expect(link.getAttribute('href')).toContain('area=Central+Visayas')
  })

  it('stays turned off until the deployment sets the TSP link', async () => {
    open()
    const button = await screen.findByRole('button', { name: /Find Jobs on TSP/ })
    expect(button).toBeDisabled()
    expect(screen.getByText('The TSP Find Jobs link isn’t set up yet.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Find Jobs on TSP/ })).not.toBeInTheDocument()
  })
})
