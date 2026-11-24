import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Qualification } from '../../api/queries.ts'
import { AuthContext, type Auth } from '../../auth/useAuth.ts'
import { renderWithAuth } from '../../test/account.tsx'
import { mockMediaQueries } from '../../test/matchMedia.ts'
import { createTestQueryClient, renderWithQuery } from '../../test/query.tsx'
import { server } from '../../test/server.ts'
import type { CenterMapProps } from '../training/CenterMapTypes.ts'
import { useTrainingStore } from '../training/state.ts'
import { AroundYouCard, useAroundYouOpen } from './AroundYouCard.tsx'
import {
  planAroundYou,
  shortRegion,
  topSkills,
  type AroundYouInput,
  type AroundYouPlan,
} from './aroundYou.ts'
import type { AreaQualification } from './demandApi.ts'
import ExplorePage from './ExplorePage.tsx'
import { useDemandStore, useExploreStore } from './useExplore.ts'

vi.mock('../training/CenterMap.tsx', () => ({
  default: (props: CenterMapProps) => <div data-testid="map" data-centers={props.centers.length} />,
}))

const LIVE = { regionCode: 'IV-A', regionName: 'CALABARZON', province: 'Cavite' }
const guest: AroundYouInput = { learnerId: null, live: null, homeProvince: null, searchCodes: [] }
const learner: AroundYouInput = { ...guest, learnerId: 'learner-1' }

// Section 3's "When it shows" table, row by row.
describe('planAroundYou', () => {
  it('sharing on, signed in, address known: near the location, the home province, elsewhere', () => {
    const plan = planAroundYou({ ...learner, live: LIVE, homeProvince: 'Laguna' })!
    expect(plan.blocks.map((block) => [block.kind, block.place])).toEqual([
      ['near', 'CALABARZON'],
      ['province', 'Laguna'],
    ])
    expect(plan.blocks[1]).toMatchObject({ area: { province: 'Laguna' }, postingsOnly: true })
    expect(plan.elsewhere).toMatchObject({ exclude: 'Laguna', personalFor: 'learner-1' })
    expect(plan.pillPlace).toBe('Laguna')
  })

  it('a location inside the home province shows only the province, titled near you', () => {
    const plan = planAroundYou({
      ...learner,
      live: { ...LIVE, province: 'LAGUNA' },
      homeProvince: 'Laguna',
    })!
    expect(plan.blocks).toHaveLength(1)
    expect(plan.blocks[0]).toMatchObject({ kind: 'near', place: 'Laguna', postingsOnly: true })
  })

  it('sharing on, signed in, no address: the region, then elsewhere without the location province', () => {
    const plan = planAroundYou({ ...learner, live: LIVE })!
    expect(plan.blocks.map((block) => block.kind)).toEqual(['near'])
    expect(plan.elsewhere?.exclude).toBe('Cavite')
    expect(plan.pillPlace).toBe('CALABARZON')
  })

  it('sharing off, signed in, address known: no near block, the province and elsewhere', () => {
    const plan = planAroundYou({ ...learner, homeProvince: 'Laguna' })!
    expect(plan.blocks.map((block) => block.kind)).toEqual(['province'])
    expect(plan.elsewhere).not.toBeNull()
  })

  it('sharing on, guest: the region as top lists; elsewhere only with a search', () => {
    const plan = planAroundYou({ ...guest, live: LIVE })!
    expect(plan.blocks).toEqual([
      expect.objectContaining({
        kind: 'top',
        area: { region: 'IV-A', province: null },
        personalFor: null,
      }),
    ])
    expect(plan.elsewhere).toBeNull()
    expect(plan.hint).toBe(true)
    const searched = planAroundYou({
      ...guest,
      live: LIVE,
      searchCodes: ['A', 'B', 'C', 'D', 'E', 'F'],
    })!
    expect(searched.elsewhere).toEqual({
      exclude: 'Cavite',
      codes: ['A', 'B', 'C', 'D', 'E'],
      personalFor: null,
    })
    expect(searched.hint).toBe(false)
  })

  it('sharing off, guest: nationwide top lists', () => {
    const plan = planAroundYou(guest)!
    expect(plan.blocks).toEqual([
      expect.objectContaining({ kind: 'top', area: { region: null, province: null }, place: null }),
    ])
    expect(plan.pillPlace).toBeNull()
  })

  it('sharing off, signed in with no address: no card', () => {
    expect(planAroundYou(learner)).toBeNull()
  })
})

const competency = (name: string, category = 'Core') => ({
  id: name.length,
  position: 1,
  name,
  category,
})
const catalog: Qualification[] = [
  {
    code: 'SMAW-II',
    name: 'Shielded Metal Arc Welding NC II',
    sector: 'Metals',
    possible_jobs: [],
    competencies: [
      competency('Participate in workplace communication', 'Basic'),
      competency('Weld carbon steel plates'),
      competency('Weld carbon steel pipes'),
    ],
  },
  {
    code: 'GTAW-II',
    name: 'Gas Tungsten Arc Welding NC II',
    sector: 'Metals',
    possible_jobs: [],
    competencies: [
      competency('Participate in workplace communication', 'Basic'),
      competency('Weld carbon steel plates'),
      competency('Read welding blueprints'),
    ],
  },
  {
    code: 'COOK-II',
    name: 'Cookery NC II',
    sector: 'Tourism',
    possible_jobs: [],
    competencies: [
      competency('Participate in workplace communication', 'Basic'),
      competency('Prepare stocks and sauces'),
    ],
  },
]

const area = (
  code: string,
  name: string,
  postings: number | null,
  forecast = false,
): AreaQualification => ({
  qualification_code: code,
  qualification_name: name,
  observed_posting_count: postings,
  posting_unit: 'distinct posting records',
  observation_dates: ['2026-11-04'],
  observation_geography: { scope: 'regional', label: 'CALABARZON' } as never,
  forecast_support: forecast
    ? ([
        {
          classification: 'in_demand',
          geography_match: 'selected_area',
          geography: { label: 'CALABARZON' },
          period_label: '2025–2026',
        },
      ] as never)
    : [],
  has_selected_area_evidence: true,
})

describe('shortRegion', () => {
  it('names a region briefly for the card', () => {
    expect(shortRegion({ code: 'IV-A', name: 'Region IV-A (CALABARZON)' })).toBe('CALABARZON')
    expect(shortRegion({ code: 'NCR', name: 'National Capital Region' })).toBe('NCR')
    expect(shortRegion({ code: 'MIMAROPA', name: 'MIMAROPA Region' })).toBe('MIMAROPA Region')
  })
})

describe('topSkills', () => {
  it('weights the core competencies of the linked qualifications by posting records', () => {
    const items = [
      area('COOK-II', 'Cookery NC II', 3),
      area('GTAW-II', 'Gas Tungsten Arc Welding NC II', 4),
      area('SMAW-II', 'Shielded Metal Arc Welding NC II', 10),
    ]
    // Plates 14, pipes 10, blueprints 4, stocks 3; workplace communication is basic and never counted.
    expect(topSkills(items, catalog)).toEqual([
      'Weld carbon steel plates',
      'Weld carbon steel pipes',
      'Read welding blueprints',
    ])
  })

  it('leaves out qualifications without postings or missing from the catalog', () => {
    expect(topSkills([area('SMAW-II', 'SMAW', null), area('NONE', 'Unknown', 9)], catalog)).toEqual(
      [],
    )
  })
})

const jobsPage = (titles: [string, number][], snapshot = '2026-11-04') => ({
  items: titles.map(([title, posting_count]) => ({
    title,
    posting_count,
    employer_count: 1,
    localities: [],
    region_codes: ['IV-A'],
  })),
  total: titles.length,
  posting_count: titles.reduce((sum, [, count]) => sum + count, 0),
  employer_count: titles.length,
  limit: 3,
  offset: 0,
  region_code: null,
  locality: null,
  localities: [],
  areas: [],
  snapshot_dates: titles.length ? [snapshot] : [],
  posted_between: [],
  ordering: 'posting_count',
  personalized: false,
  source_url: 'https://philjobnet.gov.ph/job-vacancies/',
  limitations: [],
})
const qualificationsPage = (items: AreaQualification[], ordering = 'qualification_name') => ({
  items,
  total: items.length,
  limit: 100,
  offset: 0,
  evaluated_at: '2026-11-24T00:00:00+08:00',
  observed_since: '2026-01-01',
  observed_through: '2026-11-24',
  ordering,
  personalized: false,
  method_version: 'area-qualifications-v1',
  limitations: [],
})

const requests: URL[] = []

function serve({
  jobs = jobsPage([
    ['WELDER', 12],
    ['PIPE FITTER', 5],
    ['COOK', 3],
  ]),
  qualifications = qualificationsPage([
    area('COOK-II', 'Cookery NC II', 3),
    area('GTAW-II', 'Gas Tungsten Arc Welding NC II', 4),
    area('SMAW-II', 'Shielded Metal Arc Welding NC II', 10, true),
  ]),
  elsewhere = [],
}: {
  jobs?: ReturnType<typeof jobsPage>
  qualifications?: ReturnType<typeof qualificationsPage>
  elsewhere?: Record<string, unknown>[]
} = {}) {
  server.use(
    http.get('*/api/v1/labor-market/jobs', ({ request }) => {
      requests.push(new URL(request.url))
      return HttpResponse.json(jobs)
    }),
    http.get('*/api/v1/labor-market/qualifications', ({ request }) => {
      requests.push(new URL(request.url))
      return HttpResponse.json(qualifications)
    }),
    http.get('*/api/v1/labor-market/elsewhere', ({ request }) => {
      requests.push(new URL(request.url))
      return HttpResponse.json({
        items: elsewhere,
        exclude_province: null,
        personalized: false,
        ordering: 'posting_count',
        min_postings: 3,
        snapshot_dates: ['2026-11-04'],
        source_url: 'https://philjobnet.gov.ph/job-vacancies/',
        method_version: 'elsewhere-demand-v1',
        limitations: [],
      })
    }),
  )
}

function Card({
  plan,
  onProvince = () => {},
  onQualification = () => {},
}: {
  plan: AroundYouPlan
  onProvince?: () => void
  onQualification?: (code: string, name: string) => void
}) {
  const [open, setOpen] = useAroundYouOpen(true)
  return (
    <AroundYouCard
      plan={plan}
      catalog={catalog}
      open={open}
      onOpenChange={setOpen}
      variant="float"
      onProvince={onProvince}
      onQualification={onQualification}
    />
  )
}

beforeEach(() => {
  requests.length = 0
  window.sessionStorage.clear()
})

describe('AroundYouCard', () => {
  it('a guest with no search and no location sees the nationwide top 3 lists', async () => {
    serve()
    renderWithQuery(<Card plan={planAroundYou(guest)!} />)
    const card = screen.getByRole('region', { name: 'Around you' })
    expect(
      within(card).getByRole('button', { name: /Top in demand · Philippines/ }),
    ).toHaveAttribute('aria-expanded', 'true')
    expect(await within(card).findByRole('heading', { name: 'Top 3 skills' })).toBeVisible()
    expect(within(card).getByRole('heading', { name: 'Top 3 qualifications' })).toBeVisible()
    expect(within(card).getByRole('heading', { name: 'Top 3 jobs' })).toBeVisible()
    // The skills come from the competencies of the area's linked qualifications.
    expect(within(card).getByText('Weld carbon steel plates')).toBeVisible()
    expect(within(card).queryByText('Participate in workplace communication')).toBeNull()
    // Qualifications ranked by postings here, not in the server's name order.
    const names = within(card)
      .getAllByRole('button', { name: /^Find centers for/ })
      .map((button) => button.getAttribute('aria-label'))
    expect(names).toEqual([
      'Find centers for Shielded Metal Arc Welding NC II',
      'Find centers for Gas Tungsten Arc Welding NC II',
      'Find centers for Cookery NC II',
    ])
    expect(within(card).getByText('Welder')).toBeVisible()
    expect(within(card).getByText('Based on job postings, Nov 4, 2026')).toBeVisible()
    expect(
      within(card).getByText("Search your skills or sign in to see where else you're in demand."),
    ).toBeVisible()
    // Nationwide and not personalized: no region, no province, no personalize.
    for (const url of requests) {
      expect(url.searchParams.get('region_code')).toBeNull()
      expect(url.searchParams.get('personalize')).toBeNull()
    }
    expect(requests.some((url) => url.pathname.endsWith('/elsewhere'))).toBe(false)
  })

  it('a guest with a search also sees elsewhere, for the searched qualifications', async () => {
    serve({
      elsewhere: [
        {
          province: 'Pampanga',
          region_code: 'III',
          region_name: 'Central Luzon',
          latitude: 15.07,
          longitude: 120.66,
          location_basis: 'centers',
          posting_count: 9,
          titles: ['WELDER'],
          qualifications: [{ code: 'SMAW-II', name: 'Welding NC II', posting_count: 9 }],
          reasons: [],
          observed_on: '2026-11-04',
        },
      ],
    })
    const onProvince = vi.fn()
    const onQualification = vi.fn()
    renderWithQuery(
      <Card
        plan={planAroundYou({ ...guest, live: LIVE, searchCodes: ['SMAW-II'] })!}
        onProvince={onProvince}
        onQualification={onQualification}
      />,
    )
    expect(
      await screen.findByRole('heading', { name: 'Your skills are in demand in…' }),
    ).toBeVisible()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Show demand in Pampanga on the map' }),
    )
    expect(onProvince).toHaveBeenCalledWith(expect.objectContaining({ province: 'Pampanga' }))
    fireEvent.click(screen.getByRole('button', { name: 'Find centers for Welding NC II' }))
    expect(onQualification).toHaveBeenCalledWith('SMAW-II', 'Welding NC II')
    const elsewhere = requests.find((url) => url.pathname.endsWith('/elsewhere'))!
    expect(elsewhere.searchParams.getAll('qualification_code')).toEqual(['SMAW-II'])
    expect(elsewhere.searchParams.get('exclude_province')).toBe('Cavite')
    expect(screen.queryByText(/Search your skills or sign in/)).toBeNull()
  })

  it('signed in: personalized, with the learner id in every query key', async () => {
    serve()
    const client = createTestQueryClient()
    renderWithQuery(
      <Card plan={planAroundYou({ ...learner, live: LIVE, homeProvince: 'Laguna' })!} />,
      client,
    )
    expect(await screen.findByRole('heading', { name: 'Near you · CALABARZON' })).toBeVisible()
    expect(screen.getByRole('heading', { name: 'In your province · Laguna' })).toBeVisible()
    await screen.findByText('No other province has enough job postings for your skills yet.')
    const keys = client
      .getQueryCache()
      .findAll({ queryKey: ['labor-market'] })
      .map((query) => query.queryKey)
    expect(keys.length).toBe(5)
    for (const key of keys) expect(key).toContain('learner-1')
    expect(requests.length).toBeGreaterThan(0)
    for (const url of requests) expect(url.searchParams.get('personalize')).toBe('true')
    const province = requests.filter((url) => url.searchParams.get('province') === 'Laguna')
    expect(province.map((url) => url.pathname.split('/').at(-1)).sort()).toEqual([
      'jobs',
      'qualifications',
    ])
  })

  it('a province says it is based on postings and never shows a regional forecast', async () => {
    serve()
    renderWithQuery(<Card plan={planAroundYou({ ...learner, homeProvince: 'Laguna' })!} />)
    const block = (await screen.findByRole('heading', { name: 'In your province · Laguna' }))
      .parentElement!
    expect(await within(block).findByText('Based on job postings, Nov 4, 2026')).toBeVisible()
    expect(within(block).queryByText(/Forecast/)).toBeNull()
  })

  it('a region shows its forecast as the demand level', async () => {
    serve()
    renderWithQuery(<Card plan={planAroundYou({ ...learner, live: LIVE })!} />)
    expect(await screen.findByText('Forecast: in demand')).toBeVisible()
  })

  it('says when an area has no postings, and when no other province fits', async () => {
    serve({ jobs: jobsPage([]), qualifications: qualificationsPage([]) })
    renderWithQuery(
      <Card plan={planAroundYou({ ...learner, homeProvince: 'Maguindanao del Norte' })!} />,
    )
    expect(
      await screen.findByText('No job postings recorded in Maguindanao del Norte yet.'),
    ).toBeVisible()
    expect(
      await screen.findByText('No other province has enough job postings for your skills yet.'),
    ).toBeVisible()
  })

  it('collapses to a pill and stays collapsed for the visit', async () => {
    serve()
    const plan = planAroundYou({ ...learner, homeProvince: 'Laguna' })!
    const { unmount } = renderWithQuery(<Card plan={plan} />)
    const toggle = screen.getByRole('button', { name: 'Around you · Laguna' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('heading', { name: 'In your province · Laguna' })).toBeNull()
    unmount()
    // A later visit to the page in the same tab: still a pill.
    renderWithQuery(<Card plan={plan} />)
    expect(screen.getByRole('button', { name: 'Around you · Laguna' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('shows a quiet line when the lists fail', async () => {
    server.use(http.get('*/api/v1/labor-market/jobs', () => HttpResponse.json({}, { status: 500 })))
    renderWithQuery(<Card plan={planAroundYou(guest)!} />)
    expect(
      await screen.findByText('What is in demand around you could not be loaded.'),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible()
  })
})

describe('Around you on the Career Map', () => {
  beforeEach(() => {
    useExploreStore.setState({ search: null, draft: '' })
    useDemandStore.setState({ region: undefined, code: undefined, offset: 0, personal: true })
    useTrainingStore.setState({
      useLocation: false,
      location: null,
      locating: false,
      placeText: '',
      locationError: null,
      routeTo: null,
    })
    serve()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const open = (path = '/explore', auth?: Auth) =>
    renderWithAuth(
      auth ? (
        <AuthContext.Provider value={auth}>
          <MemoryRouter initialEntries={[path]}>
            <ExplorePage />
          </MemoryRouter>
        </AuthContext.Provider>
      ) : (
        <MemoryRouter initialEntries={[path]}>
          <ExplorePage />
        </MemoryRouter>
      ),
    )

  it('floats over the map from a tablet up, outside the results panel', async () => {
    mockMediaQueries({ '(min-width: 769px)': true })
    open()
    const card = await screen.findByRole('region', { name: 'Around you' })
    const panel = screen.getByRole('region', { name: 'What can you do?' })
    expect(panel.contains(card)).toBe(false)
    expect(within(card).getByRole('button', { name: /Top in demand/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('on a phone it is a folded section of the results sheet', async () => {
    mockMediaQueries({ '(min-width: 769px)': false })
    open()
    const card = await screen.findByRole('region', { name: 'Around you' })
    const panel = screen.getByRole('region', { name: 'What can you do?' })
    expect(panel.contains(card)).toBe(true)
    expect(within(card).getByRole('button', { name: /Top in demand/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('is hidden in the demand view', async () => {
    mockMediaQueries({ '(min-width: 769px)': true })
    open('/explore?type=demand')
    await screen.findByTestId('map')
    expect(screen.queryByRole('region', { name: 'Around you' })).toBeNull()
  })

  it('is not shown to a signed-in learner with no location and no address', async () => {
    mockMediaQueries({ '(min-width: 769px)': true })
    open('/explore', { learner: { id: 'ana' } } as Auth)
    await screen.findByTestId('map')
    // The Skill Passport answers "not linked" (the default handler): there is nothing to place the card by.
    await waitFor(() => expect(requests.length).toBe(0))
    expect(screen.queryByRole('region', { name: 'Around you' })).toBeNull()
  })
})
