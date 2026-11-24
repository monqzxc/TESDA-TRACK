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
import type { Center, Program } from '../training/centers.ts'
import { AroundYouCard, useAroundYouOpen } from './AroundYouCard.tsx'
import {
  planAroundYou,
  qualificationsForJob,
  qualificationsTeaching,
  sameJob,
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
    possible_jobs: ['Welder', 'Pipe Welder'],
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

describe('detail matching', () => {
  it('matches a posting title to a possible job by whole words', () => {
    expect(sameJob('SERVICE CREW', 'Service Crew')).toBe(true)
    expect(sameJob('FAST FOOD SERVICE CREW', 'Service crew')).toBe(true)
    expect(sameJob('WELDER', 'Pipe Welder')).toBe(true)
    expect(sameJob('COOK', 'Cookery Instructor')).toBe(false)
    expect(sameJob('IT', 'IT Support')).toBe(false)
  })

  it('finds the qualifications that teach a skill and that lead to a job', () => {
    expect(qualificationsTeaching('weld carbon steel plates', catalog).map((q) => q.code)).toEqual([
      'SMAW-II',
      'GTAW-II',
    ])
    expect(qualificationsForJob('WELDER', catalog).map((q) => q.code)).toEqual(['SMAW-II'])
    // The server's link comes first, even where the catalog's jobs don't name the title.
    expect(qualificationsForJob('LINE COOK', catalog, 'Cookery NC II').map((q) => q.code)).toEqual([
      'COOK-II',
    ])
  })
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
  centers = [],
  onCenter,
}: {
  plan: AroundYouPlan
  onProvince?: () => void
  onQualification?: (code: string, name: string) => void
  centers?: Center[]
  onCenter?: (id: string, code: string) => void
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
      centers={centers}
      onCenter={onCenter}
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
      .getAllByRole('button', { name: /NC II$/ })
      .map((button) => button.getAttribute('aria-label'))
    expect(names).toEqual([
      'See details for Shielded Metal Arc Welding NC II',
      'See details for Gas Tungsten Arc Welding NC II',
      'See details for Cookery NC II',
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

  it('each list is its own panel: the top 3 show, and "more" opens and closes the rest', async () => {
    serve({
      jobs: jobsPage([
        ['WELDER', 12],
        ['PIPE FITTER', 5],
        ['COOK', 3],
        ['BAKER', 2],
        ['DRIVER', 1],
      ]),
    })
    renderWithQuery(<Card plan={planAroundYou(guest)!} />)
    const card = screen.getByRole('region', { name: 'Around you' })
    await within(card).findByText('Welder')
    // The rest wait behind "more": not yet on the page.
    expect(within(card).queryByText('Baker')).toBeNull()
    // Only the jobs list has more than three: one "more", counting what it opens.
    const more = within(card).getByRole('button', { name: /^2 more/ })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(more)
    expect(more).toHaveAttribute('aria-expanded', 'true')
    expect(more).toHaveTextContent('Show fewer')
    expect(within(card).getByText('Baker')).toBeVisible()
    expect(within(card).getByText('Driver')).toBeVisible()
    // Closed again, the rest slide shut and leave the reach of keyboards and screen readers.
    fireEvent.click(more)
    expect(more).toHaveAttribute('aria-expanded', 'false')
    const rest = document.getElementById(more.getAttribute('aria-controls')!)!
    expect(rest).toHaveAttribute('aria-hidden', 'true')
    expect(rest).toHaveAttribute('inert')
    // Asks for up to 10 jobs, so there is something to open.
    const jobs = requests.find((url) => url.pathname.endsWith('/jobs'))!
    expect(jobs.searchParams.get('limit')).toBe('10')
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

const trainingCenter = (id: number, name: string, distanceKm: number | null): Center =>
  ({
    id: `training-${id}`,
    kind: 'training',
    name,
    city: 'Imus',
    province: 'Cavite',
    region: 'CALABARZON',
    distanceKm,
    accredited: [],
    schedules: [],
    // The page's own programs are ignored: the details read each qualification's.
    programs: [],
  }) as unknown as Center

const program = (provider: number, code: string, extra: Partial<Program> = {}) =>
  ({
    id: provider * 100,
    title: code,
    description: null,
    qualification: { code, name: code, sector: 'Metals' },
    provider: { id: provider, name: `Provider ${provider}`, region_code: 'IV-A' },
    delivery_mode: 'institution_based',
    duration_hours: 268,
    cost: null,
    scholarship_available: false,
    scholarship_open: false,
    start_date: null,
    end_date: null,
    slots: null,
    is_active: true,
    ...extra,
  }) as unknown as Program

/** Each qualification's programs, as /training-programs answers for it. */
function servePrograms(programs: Program[]) {
  server.use(
    http.get('*/api/v1/training-programs', ({ request }) => {
      const code = new URL(request.url).searchParams.get('qualification_code')
      return HttpResponse.json(programs.filter((item) => item.qualification.code === code))
    }),
    http.get('*/api/v1/assessment-schedules', () => HttpResponse.json([])),
  )
}

describe('AroundYouCard details', () => {
  const centers = [
    trainingCenter(1, 'Far Welding School', 40),
    trainingCenter(2, 'Near Welding School', 3.2),
    trainingCenter(3, 'Kitchen Academy', 5),
  ]
  beforeEach(() =>
    servePrograms([
      program(1, 'SMAW-II'),
      program(2, 'SMAW-II'),
      program(2, 'SMAW-II', { id: 201, scholarship_open: true }),
      program(3, 'COOK-II'),
    ]),
  )

  it('a skill shows the qualifications that teach it, and leads on to one of them and back', async () => {
    serve()
    renderWithQuery(<Card plan={planAroundYou(guest)!} centers={centers} />)
    fireEvent.click(
      await screen.findByRole('button', { name: 'See details for Weld carbon steel plates' }),
    )
    const dialog = await screen.findByRole('dialog', { name: 'Weld carbon steel plates' })
    expect(
      within(dialog).getByRole('heading', { name: 'Qualifications that teach it' }),
    ).toBeVisible()
    // Most posting records here first: SMAW (10), then GTAW (4).
    const rows = within(dialog).getAllByRole('button', { name: /Arc Welding NC II/ })
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Shielded Metal Arc Welding NC II'),
      expect.stringContaining('Gas Tungsten Arc Welding NC II'),
    ])
    await waitFor(() => expect(rows[0]).toHaveTextContent('Nearest center 3.2 km'))
    // The jobs those qualifications lead to.
    expect(within(dialog).getByRole('button', { name: /Pipe Welder/ })).toBeVisible()

    fireEvent.click(rows[0]!)
    const next = await screen.findByRole('dialog', { name: 'Shielded Metal Arc Welding NC II' })
    fireEvent.click(within(next).getByRole('button', { name: 'Back to Weld carbon steel plates' }))
    expect(await screen.findByRole('dialog', { name: 'Weld carbon steel plates' })).toBeVisible()
  })

  it('a qualification lists its training centers nearest first, its jobs, and the way to the map', async () => {
    serve()
    const onQualification = vi.fn()
    const onCenter = vi.fn()
    renderWithQuery(
      <Card
        plan={planAroundYou(guest)!}
        centers={centers}
        onQualification={onQualification}
        onCenter={onCenter}
      />,
    )
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'See details for Shielded Metal Arc Welding NC II',
      }),
    )
    const dialog = await screen.findByRole('dialog', { name: 'Shielded Metal Arc Welding NC II' })
    expect(within(dialog).getByText('Metals')).toBeVisible()
    const rows = await within(dialog).findAllByRole('button', {
      name: /^Show .* School on the map$/,
    })
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
      'Show Near Welding School on the map',
      'Show Far Welding School on the map',
    ])
    expect(rows[0]).toHaveTextContent('3.2 km')
    expect(rows[0]).toHaveTextContent('Imus, Cavite')
    expect(rows[0]).toHaveTextContent('268 hours')
    expect(rows[0]).toHaveTextContent('Scholarship open')
    expect(rows[1]).not.toHaveTextContent('Scholarship open')
    // Welder has 12 postings here, so its chip carries the count.
    expect(within(dialog).getByRole('button', { name: /Welder, 12 postings/ })).toBeVisible()

    fireEvent.click(rows[0]!)
    expect(onCenter).toHaveBeenCalledWith('training-2', 'SMAW-II')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    fireEvent.click(
      screen.getByRole('button', { name: 'See details for Shielded Metal Arc Welding NC II' }),
    )
    fireEvent.click(await screen.findByRole('button', { name: /Show all its centers on the map/ }))
    expect(onQualification).toHaveBeenCalledWith('SMAW-II', 'Shielded Metal Arc Welding NC II')
  })

  it('a job shows its qualifications, where to train and the skills it needs', async () => {
    serve()
    renderWithQuery(<Card plan={planAroundYou(guest)!} centers={centers} onCenter={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'See details for Welder' }))
    const dialog = await screen.findByRole('dialog', { name: 'Welder' })
    expect(within(dialog).getByText('12 postings · 1 employers')).toBeVisible()
    expect(
      within(dialog).getByRole('button', { name: /Shielded Metal Arc Welding NC II/ }),
    ).toBeVisible()
    expect(await within(dialog).findByRole('heading', { name: 'Where to train' })).toBeVisible()
    expect(
      (await within(dialog).findAllByRole('button', { name: /^Show .* on the map$/ }))[0],
    ).toHaveAccessibleName('Show Near Welding School on the map')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Weld carbon steel pipes' }))
    expect(await screen.findByRole('dialog', { name: 'Weld carbon steel pipes' })).toBeVisible()
  })

  it('a qualification no center offers says so, and offers the map search instead', async () => {
    serve({ qualifications: qualificationsPage([area('COOK-II', 'Cookery NC II', 3)]) })
    servePrograms([])
    renderWithQuery(<Card plan={planAroundYou(guest)!} centers={centers} />)
    fireEvent.click(await screen.findByRole('button', { name: 'See details for Cookery NC II' }))
    const dialog = await screen.findByRole('dialog', { name: 'Cookery NC II' })
    expect(
      await within(dialog).findByText('No training center lists this qualification yet.'),
    ).toBeVisible()
    expect(within(dialog).getByRole('button', { name: /Search for it on the map/ })).toBeVisible()
  })

  it('a job no qualification leads to says so', async () => {
    serve()
    renderWithQuery(<Card plan={planAroundYou(guest)!} centers={centers} />)
    fireEvent.click(await screen.findByRole('button', { name: 'See details for Pipe Fitter' }))
    const dialog = await screen.findByRole('dialog', { name: 'Pipe Fitter' })
    expect(
      within(dialog).getByText(/No TESDA qualification is linked to this job title yet/),
    ).toBeVisible()
  })
})
