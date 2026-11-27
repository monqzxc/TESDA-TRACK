import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, type Auth } from '../../auth/useAuth.ts'
import { renderWithAuth } from '../../test/account.tsx'
import { openCenterList } from '../../test/explore.ts'
import { server } from '../../test/server.ts'
import type { CenterMapProps } from '../training/CenterMapTypes.ts'
import { useTrainingStore } from '../training/state.ts'
import ExplorePage from './ExplorePage.tsx'
import { RANGE_LOADER } from './Panels.tsx'
import { useDemandStore, useExploreStore } from './useExplore.ts'

// The map says what it was given: which centers are starred, which regions carry a balance, and how it is framed.
vi.mock('../training/CenterMap.tsx', () => ({
  default: (props: CenterMapProps) => (
    <div
      data-testid="map"
      data-pins={props.centers.map((center) => center.id).join(' ')}
      data-recommended={(props.recommended ?? []).join(' ')}
      data-selected={props.selectedId ?? ''}
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
let noRecordsAtHome = false
// Metro Manila in high demand while saturated: many jobs, and even more centers.
let crowdedAtHome = false
let demandIsSample = false

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
    demand_is_sample: demandIsSample,
    home_demand: !demandAvailable
      ? null
      : url.searchParams.get('home_region_code') === 'NCR'
        ? {
            region_code: 'NCR',
            name: 'Metro Manila',
            posting_count: noRecordsAtHome ? 0 : 2,
            level: noRecordsAtHome ? 'none' : crowdedAtHome ? 'high' : 'low',
            rank: noRecordsAtHome ? null : 2,
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
              training_sites: 1,
              assessment_sites: 0,
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
  noRecordsAtHome = false
  crowdedAtHome = false
  demandIsSample = false
  useDemandStore.setState({
    region: undefined,
    scope: undefined,
    locality: null,
    code: undefined,
    offset: 0,
  })
  useExploreStore.setState({
    draft: 'housekeeping',
    rangeKm: 25,
    relocate: false,
    search: {
      query: 'housekeeping',
      result: {
        profile: { intent: 'training_recommendation' },
        matches: [{ qualification, score: 90, reason: 'Matched housekeeping' }],
      },
    } as never,
  })
  openCenterList()
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
          scholarship_open: false,
          scholarship_is_sample: false,
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
  renderWithAuth(
    <MemoryRouter initialEntries={[path]}>
      <ExplorePage />
    </MemoryRouter>,
  )
const brief = () => screen.findByRole('region', { name: 'Supply and demand analysis' })
// The strip's button opens the full analysis in the panel beside the map.
const showAnalysis = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'See full analysis' }))
  return screen.findByRole('article', { name: 'Supply and demand analysis' })
}

describe('the supply and demand strip and analysis', () => {
  it('gives the verdict and counts in one line, and the full analysis in the panel', async () => {
    open()
    const strip = within(await brief())
    expect(await strip.findByText('Saturated')).toBeVisible()
    // How rough the signal is, is said in the full analysis: the strip keeps to one verdict.
    expect(strip.queryByText('Rough signal')).toBeNull()
    expect(strip.getByText(NAME)).toBeVisible()
    // The strip is one line: the analysis's words, steps and centers are in the panel, not over the map.
    expect(strip.queryByText(/ahead of recorded demand/)).toBeNull()
    expect(strip.queryByRole('button', { name: /Manila Hotel School/ })).toBeNull()
    expect(strip.queryByRole('switch')).toBeNull()
    // Only codes and the relocation choice are sent: the region nearest the learner, never their coordinates.
    const url = asked.at(-1) as URL
    expect(Object.fromEntries(url.searchParams)).toEqual({
      qualification_code: CODE,
      region_code: 'NCR',
      home_region_code: 'NCR',
      relocate: 'false',
    })

    const analysis = within(await showAnalysis())
    expect(analysis.getByRole('heading', { level: 2 })).toHaveTextContent(NAME)
    expect(analysis.getByText('Rough signal')).toBeVisible()
    expect(analysis.getByText(/training supply for Housekeeping NC II is ahead/)).toBeVisible()
    expect(analysis.getByRole('heading', { name: 'From training to work' })).toBeVisible()
    expect(analysis.getByText('Get trained')).toBeVisible()
    expect(analysis.getByText('Land a job')).toBeVisible()
    // The recommended centers are starred in the results and on the map, not listed again here.
    expect(
      await analysis.findByText(
        '2 recommended centers are starred in your results and on the map.',
      ),
    ).toBeVisible()
    expect(analysis.queryByRole('button', { name: /Manila Hotel School/ })).toBeNull()
    await waitFor(() =>
      expect(screen.getByTestId('map')).toHaveAttribute(
        'data-recommended',
        'training-1 assessment-7',
      ),
    )
    // The analysis in words sits folded under Why: the verdict and counts carry it.
    expect(analysis.getByText(/prefer not to relocate/)).not.toBeVisible()
    fireEvent.click(analysis.getByText('Why'))
    expect(analysis.getByText(/prefer not to relocate/)).toBeVisible()
  })

  it('opens and closes the analysis from the strip, and goes back to the results', async () => {
    open()
    await showAnalysis()
    expect(screen.queryByTestId('ranked-centers')).toBeNull()
    const toggle = within(await brief()).getByRole('button', { name: 'Hide analysis' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(toggle)
    expect(await screen.findByTestId('ranked-centers')).toBeVisible()
    expect(screen.queryByRole('article', { name: 'Supply and demand analysis' })).toBeNull()
    // "See them in your results" returns to the list where the starred centers are.
    const analysis = within(await showAnalysis())
    fireEvent.click(await analysis.findByRole('button', { name: 'See them in your results' }))
    expect(await screen.findByTestId('ranked-centers')).toBeVisible()
    const again = within(await showAnalysis())
    fireEvent.click(again.getByRole('button', { name: 'Back to results' }))
    expect(await screen.findByTestId('ranked-centers')).toBeVisible()
  })

  it('marks the recommended center with a pulse and an (i) that says why, without opening it', async () => {
    open()
    const list = await screen.findByTestId('ranked-centers')
    const [top] = await within(list).findAllByTestId('ranked-center')
    expect(top!.parentElement).toHaveClass('animate-recommend-pulse')
    fireEvent.click(within(list).getByRole('button', { name: 'Why it’s recommended' }))
    const why = await screen.findByRole('dialog', { name: 'Why it’s recommended' })
    expect(within(why).getByText('It comes first of the centers listed for you.')).toBeVisible()
    // The (i) opens only its note: the center itself stays closed.
    expect(screen.getByTestId('ranked-centers')).toBeVisible()
  })

  it('shows a loader for a moment after each answer to "How far can you go?"', async () => {
    RANGE_LOADER.ms = 300
    try {
      open()
      await screen.findByTestId('ranked-centers')
      act(() => useExploreStore.getState().setReach('farther'))
      expect(screen.getByTestId('results-loader')).toHaveTextContent(
        'Finding centers within your distance…',
      )
      expect(screen.queryByTestId('ranked-centers')).toBeNull()
      expect(await screen.findByTestId('ranked-centers')).toBeVisible()
      expect(screen.queryByTestId('results-loader')).toBeNull()
    } finally {
      RANGE_LOADER.ms = 0
    }
  })

  it('ranks the recommended centers beside the map, each with its reason and trip (core)', async () => {
    open()
    const list = await screen.findByTestId('ranked-centers')
    expect(within(list).getByRole('heading', { name: 'Recommended centers' })).toBeVisible()
    expect(within(list).getByText(`For ${NAME}, best first`)).toBeVisible()
    const rows = await within(list).findAllByTestId('ranked-center')
    // Within the 25 km range: Manila's two centers, the nearer first. Cebu is out of range.
    expect(rows.map((row) => within(row).getByText(/School|Center/).textContent)).toEqual([
      'Manila Hotel School',
      'Manila Assessment Center',
    ])
    expect(rows[0]).toHaveTextContent('Recommended')
    expect(rows[0]).toHaveTextContent('The shortest trip from you')
    expect(rows[1]).not.toHaveTextContent('Recommended')
    // In the combined list the reason describes travel order; schedule details remain on the center.
    expect(rows[1]).toHaveTextContent(/Within your \d+ km range/)
    expect(within(rows[0]).getByTestId('ranked-trip')).toHaveTextContent(
      /^\d+(\.\d)? km · about \d+ min$/,
    )
    // The travel times are estimates: the "i" button beside the heading says so, and how the list ranks.
    expect(within(list).queryByText('Sample data')).toBeNull()
    expect(screen.queryByText(/not measured routes/)).toBeNull()
    fireEvent.click(within(list).getByRole('button', { name: 'How ranking works' }))
    expect(await screen.findByText(/not measured routes/)).toBeVisible()
    // Escape closes it once focus has moved into it, as a learner's key press would find it.
    const dialog = screen.getByRole('dialog')
    await waitFor(() => expect(dialog).toHaveFocus())
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByText(/not measured routes/)).toBeNull())
    // Choosing a center highlights its pin on the map.
    fireEvent.click(rows[1])
    await waitFor(() =>
      expect(screen.getByTestId('map')).toHaveAttribute('data-selected', 'assessment-7'),
    )
  })

  it('recommends a nearer assessment before training in the combined list', async () => {
    server.use(
      http.get('*/api/v1/assessment-centers', () =>
        HttpResponse.json([{ ...centers[0], latitude: 14.6009, longitude: 121 }]),
      ),
    )
    open()
    const list = await screen.findByTestId('ranked-centers')
    await waitFor(() => {
      const rows = within(list).getAllByTestId('ranked-center')
      expect(rows[0]).toHaveTextContent('Manila Assessment Center')
      expect(rows[0]).toHaveTextContent('Recommended')
      expect(rows[0]).toHaveTextContent('The shortest trip from you')
      expect(rows[1]).toHaveTextContent('Manila Hotel School')
      expect(rows[1]).not.toHaveTextContent('Recommended')
    })
  })

  it('looks further for a learner open to relocating', async () => {
    open()
    const analysis = within(await showAnalysis())
    act(() => useExploreStore.getState().setRelocate(true))
    await analysis.findByText(/look first at Central Visayas/)
    fireEvent.click(analysis.getByText('Why'))
    expect(analysis.getByText(/look first at Central Visayas/)).toBeVisible()
    expect(asked.at(-1)?.searchParams.get('relocate')).toBe('true')
    await waitFor(() =>
      expect(screen.getByTestId('map')).toHaveAttribute(
        'data-recommended',
        'training-1 assessment-7 training-2',
      ),
    )
    expect(
      analysis.getByText('3 recommended centers are starred in your results and on the map.'),
    ).toBeVisible()
  })

  it('shows the demand view as the qualification’s regions with its centers pinned over them', async () => {
    open()
    const analysis = within(await showAnalysis())
    fireEvent.click(await analysis.findByRole('button', { name: 'Demand map' }))
    const map = screen.getByTestId('map')
    expect(await within(map).findByText('NCR:2:2:more_supply')).toBeInTheDocument()
    expect(within(map).getByText('VII:8:1:more_demand')).toBeInTheDocument()
    expect(map).toHaveAttribute('data-pins', 'training-1 assessment-7 training-2')
    expect(map).toHaveAttribute('data-overview', 'false')
    act(() => useExploreStore.getState().setRelocate(true))
    await waitFor(() => expect(map).toHaveAttribute('data-overview', 'true'))
    expect(analysis.getByRole('button', { name: 'All results' })).toBeVisible()
  })

  it('shows the AI-written summary where the deployment has it, with the numbers behind it', async () => {
    aiSummary = true
    open()
    const analysis = within(await showAnalysis())
    await analysis.findByText('An AI-written note about Metro Manila.')
    fireEvent.click(analysis.getByText('Why'))
    expect(analysis.getByText('An AI-written note about Metro Manila.')).toBeVisible()
    expect(analysis.getByText('AI summary')).toBeVisible()
    expect(
      analysis.getByText('2 posting records in Metro Manila are linked to it.'),
    ).toBeInTheDocument()
  })

  it('shows the area’s counts with an icon each', async () => {
    open()
    const strip = within(await brief())
    await strip.findByText('Saturated')
    expect(strip.getByText('training').closest('li')).toHaveTextContent(/^\d+training$/)
    expect(strip.getByText('assessment').closest('li')).toHaveTextContent(/^\d+assessment$/)
  })

  it('is absent without a qualification in focus', async () => {
    useExploreStore.setState({ search: null })
    open()
    await screen.findByTestId('map')
    expect(screen.queryByRole('region', { name: 'Supply and demand analysis' })).toBeNull()
  })
})

describe('Demand where you are (Card 3)', () => {
  it.each([5, 10, 25])('keeps other regions hidden at %s km with Relocate off', async (rangeKm) => {
    useExploreStore.setState({ rangeKm, relocate: false })
    const local = await brief('Low demand')
    expect(within(local).queryByText('Needed more in')).not.toBeInTheDocument()
    expect(
      within(local).queryByRole('button', { name: 'Show Central Visayas on the map' }),
    ).not.toBeInTheDocument()
    expect(local).not.toHaveTextContent('Your region leads for this one.')
    expect(local).toHaveTextContent('2 records in Metro Manila')
  })

  it('hides cached distant areas immediately when Relocate is turned off', async () => {
    useExploreStore.setState({ rangeKm: 25, relocate: true })
    const local = await brief('Low demand')
    expect(
      await within(local).findByRole('button', { name: 'Show Central Visayas on the map' }),
    ).toBeVisible()
    act(() => useExploreStore.getState().setRelocate(false))
    expect(
      within(local).queryByRole('button', { name: 'Show Central Visayas on the map' }),
    ).not.toBeInTheDocument()
  })

  it('does not show a 571 km alternative when farther means 100 km', async () => {
    useExploreStore.setState({ rangeKm: 100, relocate: false })
    const local = await brief('Low demand')
    expect(
      within(local).queryByRole('button', { name: 'Show Central Visayas on the map' }),
    ).not.toBeInTheDocument()
  })

  // The first answer can come before the regions, without an area: wait for the one about the learner's area.
  const brief = async (settled: string | RegExp) => {
    renderWithAuth(
      <MemoryRouter initialEntries={['/explore']}>
        <ExplorePage />
      </MemoryRouter>,
    )
    await showAnalysis()
    await screen.findByText(settled)
    return screen.getByRole('group', { name: 'Demand in your area' })
  }

  it('gives the level where the learner is and where the qualification is needed more', async () => {
    useExploreStore.getState().setRelocate(true)
    const local = await brief('Low demand')
    expect(within(local).getByText(/Your location/)).toBeInTheDocument()
    expect(local).toHaveTextContent(/2 records in Metro Manila · #2 of 2 regions/)
    expect(within(local).getByText('Elsewhere')).toBeInTheDocument()
    const cebu = within(local).getByRole('button', { name: 'Show Central Visayas on the map' })
    expect(cebu).toHaveTextContent('8 records')
    expect(cebu).toHaveTextContent('571 km')
    expect(cebu).toHaveTextContent('1 center')
    expect(within(local).queryByText(/sample data/i)).not.toBeInTheDocument()
    expect(asked.at(-1)?.searchParams.get('home_region_code')).toBe('NCR')

    // Chosen, the area is analysed and shaded on the demand map; the learner's own area stays theirs.
    fireEvent.click(cebu)
    await waitFor(() => expect(asked.at(-1)?.searchParams.get('region_code')).toBe('VII'))
    expect(asked.at(-1)?.searchParams.get('home_region_code')).toBe('NCR')
    expect(await screen.findByText('VII:8:1:more_demand')).toBeInTheDocument()
  })

  it('says both when the area is in demand and saturated', async () => {
    crowdedAtHome = true
    const local = await brief('High demand')
    expect(local).toHaveTextContent(
      'Employers here ask for this skill more than in most regions, but many centers here train for it too: expect competition.',
    )
  })

  it('says the learner is already where it is needed most', async () => {
    useTrainingStore.setState({ location: { latitude: 10.3, longitude: 123.9 } })
    const local = await brief('High demand')
    expect(within(local).getByText(/Top of 2 regions/)).toBeInTheDocument()
    expect(within(local).getByText(/Your region leads/)).toBeInTheDocument()
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
          licenses: [],
          sample: false,
          region_code: 'VII',
        }),
      ),
    )
    renderWithAuth(
      <AuthContext.Provider value={{ learner: { id: 'ana' } } as Auth}>
        <MemoryRouter initialEntries={['/explore']}>
          <ExplorePage />
        </MemoryRouter>
      </AuthContext.Provider>,
    )
    await showAnalysis()
    await screen.findByText('High demand')
    const local = screen.getByRole('group', { name: 'Demand in your area' })
    expect(within(local).getByText(/Skill Passport/)).toBeInTheDocument()
    expect(asked.at(-1)?.searchParams.get('home_region_code')).toBe('VII')
  })

  it('asks for an area when it has none', async () => {
    useTrainingStore.setState({ useLocation: false, location: null })
    const local = await brief(/type a city to see local demand/)
    expect(within(local).getByRole('status')).toHaveTextContent(/to see local demand/)
  })

  it('counts modelled demand as records, with no sample label (US-0018)', async () => {
    demandIsSample = true
    useExploreStore.getState().setRelocate(true)
    const local = await brief('Low demand')
    // The demand is shown as records. (The ranked list beside the map labels its estimated travel times as sample
    // data, which is about trips, not demand.)
    const analysis = screen.getByRole('region', { name: 'Supply and demand analysis' })
    expect(within(analysis).queryByText(/sample data|December 2|demo/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/demand is modelled/i)).not.toBeInTheDocument()
    expect(screen.getAllByText('records').length).toBeGreaterThan(0)
    expect(
      within(local).getByRole('button', { name: 'Show Central Visayas on the map' }),
    ).toBeInTheDocument()
  })

  it('says plainly when there is no demand data for the qualification', async () => {
    demandAvailable = false
    const local = await brief(/No posting records yet/)
    expect(within(local).getByText('Demand not available')).toBeInTheDocument()
    expect(within(local).getByRole('status')).toHaveTextContent(/not low demand/)
    expect(within(local).queryByText(/ demand$/)).not.toBeInTheDocument()
  })

  // QA-2026-11-23-W (US-0018 AC5): the Product Owner's exact wording, and no "0 records" to read as low demand.
  it('says "Demand not available" for an area with no records, without a count', async () => {
    noRecordsAtHome = true
    const local = await brief('Demand not available')
    expect(local).toHaveTextContent('Metro Manila')
    expect(local).toHaveTextContent(/not low demand/)
    expect(local).not.toHaveTextContent(/No recorded demand|0 records in/)
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
    renderWithAuth(
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
    await showAnalysis()
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

  it('leaves the card out when nothing else is in demand nearby, with no fallback message', async () => {
    serve([])
    open()
    await showAnalysis()
    await waitFor(() => expect(sent.length).toBeGreaterThan(0))
    await waitFor(() =>
      expect(
        screen.queryByRole('group', { name: 'Also in demand skills near you' }),
      ).not.toBeInTheDocument(),
    )
    expect(screen.queryByText(/Nothing else stands out/)).not.toBeInTheDocument()
  })

  it('leaves the card out when there is no demand data for the area (US-0021 AC4)', async () => {
    demandAvailable = false
    serve([food])
    open()
    await showAnalysis()
    await screen.findByText(/No posting records yet/)
    expect(
      screen.queryByRole('group', { name: 'Also in demand skills near you' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Look at Food and Beverage Services NC II' }),
    ).not.toBeInTheDocument()
  })
})

describe('Find Jobs on TSP (Card 5)', () => {
  const open = () =>
    renderWithAuth(
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
    await showAnalysis()
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
    await showAnalysis()
    const link = await screen.findByRole('link', { name: /in Central Visayas/ })
    expect(link.getAttribute('href')).toContain('area=Central+Visayas')
  })

  it('is left out until the deployment sets the TSP link', async () => {
    open()
    await showAnalysis()
    await screen.findByRole('group', { name: /Demand in your area/i })
    expect(screen.queryByRole('button', { name: /Find Jobs on TSP/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Find Jobs on TSP/ })).not.toBeInTheDocument()
  })
})
