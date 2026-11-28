import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { rememberSignIn, renderWithAuth, serveAccountApi } from '../../test/account.tsx'
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

function renderPage(path = '/explore?layout=list') {
  return renderWithAuth(
    <MemoryRouter initialEntries={[path]}>
      <ExplorePage />
    </MemoryRouter>,
  )
}

const LONG = { timeout: 4000 }

describe('skillTerms', () => {
  it("shows the matched qualifications' competencies when the server sends them", () => {
    const terms = skillTerms({
      search: {
        query: 'cook',
        result: {
          profile: { intent: 'unknown', existing_skills: [] },
          search: { terms: ['cook'], unmatched: [] },
          skills: ['Prepare stocks, sauces and soups', 'Prepare appetizers'],
          matches: [{ qualification: COOKERY, score: 70, reason: 'Matched your words: cook' }],
        },
      },
    } as never)
    expect(terms).toEqual(['Prepare stocks, sauces and soups', 'Prepare appetizers'])
  })

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
  it('shows sample scholarship dates only for open scholarships in the center preview', async () => {
    server.use(
      http.get('*/api/v1/training-programs', () =>
        HttpResponse.json([
          { ...weldingProgram, scholarship_is_sample: true, scholarship_closes_on: '2099-12-31' },
          {
            ...weldingProgram,
            id: 999,
            scholarship_open: false,
            scholarship_is_sample: true,
            scholarship_closes_on: '2020-01-01',
          },
        ]),
      ),
    )
    const user = userEvent.setup()
    renderPage()
    const section = (
      await screen.findByRole('heading', { name: 'Training centers' }, LONG)
    ).closest('section')!
    await user.click(
      await within(section).findByRole('button', { name: /Manila Welding Institute/ }, LONG),
    )
    const preview = await screen.findByRole('article', { name: 'Manila Welding Institute' })
    expect(
      within(preview).getByText('Sample scholarship data for the December 2 demo.'),
    ).toBeVisible()
    expect(preview).toHaveTextContent('Scholarship closes 2099-12-31')
    expect(preview).not.toHaveTextContent('2020-01-01')
  })

  it('explains outside-range scholarship options without calling them the best place', async () => {
    useExploreStore.setState({ rangeKm: 1 })
    const user = userEvent.setup()
    renderPage('/explore?layout=list&scholarship=1')
    const section = (await screen.findByRole('heading', { name: 'Best for you' }, LONG)).closest(
      'section',
    )!
    await waitFor(
      () => expect(section).toHaveTextContent('Nearest, though outside your 1 km range'),
      LONG,
    )
    expect(within(section).queryByText('Best place to train')).not.toBeInTheDocument()
    expect(section).toHaveTextContent(/No center within 1 km\. The closest is/)
    await user.click(screen.getByRole('button', { name: /^Train$/ }))
    expect(await screen.findByText(/No center within 1 km\. The closest is/)).toBeVisible()
  })

  it('shows the skills, the pills, the centers by kind and where the skills are in demand', async () => {
    renderPage()
    expect(await screen.findByText('We read your search as these skills')).toBeInTheDocument()
    expect(screen.getByText('Welding')).toBeInTheDocument()
    expect(screen.getByText('Metal cutting')).toBeInTheDocument()
    // Skills, not qualification chips.
    expect(screen.queryByRole('group', { name: /Matched qualification/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'All', pressed: true })).toBeInTheDocument()
    const trainingHeading = await screen.findByRole('heading', { name: 'Training centers' }, LONG)
    const training = within(trainingHeading.closest('section')!)
    expect(training.getAllByText('Strong match').length).toBe(1)
    expect(
      await training.findByRole('button', { name: /Manila Welding Institute/ }, LONG),
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

  // QA-2026-11-28-NEW2 (US-0011 AC1/AC2, US-0014 AC2): a ranked list of the centers in range, each with distance and
  // travel time, not just the nearest; more open on request, and the center last opened is marked.
  it('ranks every center in range for a qualification, nearest first, with distance and travel time', async () => {
    const near = [1.2, 2.4, 3.1, 4.5, 6.2].map((km, i) => {
      const provider = {
        ...manilaInstitute,
        id: 200 + i,
        name: `Makati Center ${i + 1}`,
        latitude: MAKATI.latitude + km / 111,
        longitude: MAKATI.longitude,
      }
      const program = {
        ...weldingProgram,
        id: 900 + i,
        provider: {
          ...weldingProgram.provider,
          id: provider.id,
          name: provider.name,
          latitude: provider.latitude,
          longitude: provider.longitude,
        },
      }
      return { provider, program }
    })
    server.use(
      http.get('*/api/v1/training-providers', () => HttpResponse.json(near.map((n) => n.provider))),
      http.get('*/api/v1/training-programs', () => HttpResponse.json(near.map((n) => n.program))),
    )
    const user = userEvent.setup()
    renderPage()
    const list = await screen.findByRole(
      'list',
      { name: `Centers for ${WELDING.name}, nearest first` },
      LONG,
    )
    const entries = () => within(list).getAllByRole('button')
    expect(entries().map((button) => button.textContent)).toEqual([
      expect.stringMatching(/^1Makati Center 1.*km · about \d+ min/),
      expect.stringMatching(/^2Makati Center 2/),
      expect.stringMatching(/^3Makati Center 3/),
    ])
    await user.click(screen.getByRole('button', { name: 'Show 2 more centers' }))
    expect(entries()).toHaveLength(5)
    expect(screen.getByRole('button', { name: 'Show fewer centers' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  // QA-2026-11-28 retest of QA-2026-11-23-W (US-0018 AC5): no records where the learner is reads "Demand not
  // available", never "low demand", and "hiring instead" only shows when places follow.
  it('says "Demand not available" for an area with no records, without a level or empty "hiring instead"', async () => {
    server.use(
      http.get('*/api/v1/labor-market/outlook', ({ request }) => {
        const base = outlook(new URL(request.url))
        return HttpResponse.json({
          ...base,
          areas: [area('NCR', 'National Capital Region', 0), area('IV-B', 'MIMAROPA', 2)],
          home_demand: { ...base.home_demand, posting_count: 0, level: 'none', rank: null },
        })
      }),
    )
    renderPage()
    expect(
      await screen.findByText('Near you (National Capital Region): Demand not available', {}, LONG),
    ).toBeInTheDocument()
    expect(
      screen.getByText('No job records here yet: missing data, not low demand.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/low demand$/)).toBeNull()
    expect(screen.queryByText(/hiring instead/)).toBeNull()
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

  it('folds many skills to one row, with the rest a press away', async () => {
    const skills = ['Weld plates', 'Cut metal', 'Read blueprints', 'Grind joints', 'Fit pipes']
    useExploreStore.getState().setSearch({
      query: 'I can weld',
      result: {
        profile: { intent: 'training_recommendation' },
        skills,
        matches: [{ qualification: WELDING, score: 80, reason: 'Matched your words: weld' }],
      },
    } as never)
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText('Weld plates')).toHaveAttribute('title', 'Weld plates')
    expect(screen.getByText('Read blueprints')).toBeInTheDocument()
    expect(screen.queryByText('Grind joints')).toBeNull()
    const more = screen.getByRole('button', { name: 'Show 2 more skills' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    expect(more).toHaveTextContent('+2 more')
    await user.click(more)
    expect(screen.getByText('Grind joints')).toBeInTheDocument()
    expect(screen.getByText('Fit pipes')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show fewer skills' }))
    expect(screen.queryByText('Fit pipes')).toBeNull()
  })

  // QA-2026-11-28-NEW3 (US-0005 AC2, US-0011 AC4): without a place, no center is called best; the learner is asked
  // for a place instead of getting the first center alphabetically.
  it('Best for you asks for a place, and names no best center, until there is one', async () => {
    useTrainingStore.setState({ location: null })
    renderPage()
    const heading = await screen.findByRole('heading', { name: 'Best for you' }, LONG)
    const best = within(heading.closest('section')!)
    expect(
      best.getByText(
        'Share your location or type a city to see your best place to train and get assessed.',
      ),
    ).toBeInTheDocument()
    expect(best.queryByText('Best place to train')).toBeNull()
    expect(best.queryByText('Best place to get assessed')).toBeNull()
  })

  it('Best for you: the place hiring most and the best center, and its Analysis opens in a dialog', async () => {
    const user = userEvent.setup()
    renderPage()
    const heading = await screen.findByRole('heading', { name: 'Best for you' }, LONG)
    const best = within(heading.closest('section')!)
    // The learner's own area is hiring, so it is the place to point at.
    expect(
      await best.findByRole('button', { name: 'National Capital Region: show on the map' }, LONG),
    ).toBeInTheDocument()
    expect(best.getByText('Most in demand')).toBeInTheDocument()
    expect(best.getByText('Best place to train')).toBeInTheDocument()
    expect(best.getByRole('button', { name: /Manila Welding Institute/ })).toBeInTheDocument()
    // Only in All.
    await user.click(screen.getByRole('button', { name: 'Train' }))
    expect(screen.queryByRole('heading', { name: 'Best for you' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'All' }))

    const section = within(
      screen.getByRole('heading', { name: 'Best for you' }).closest('section')!,
    )
    await user.click(await section.findByRole('button', { name: 'Analysis' }, LONG))
    const dialog = await screen.findByRole('dialog', { name: 'Why these are best for you' })
    // The dialog explains the same cards the list shows, each with its reasons.
    const demand = within(
      within(dialog).getByRole('region', { name: 'Most in demand: National Capital Region' }),
    )
    expect(demand.getByText('20 job records')).toBeInTheDocument()
    expect(demand.getByText('#1 of 2 regions')).toBeInTheDocument()
    expect(
      demand.getByText(/your own area \(National Capital Region\), and employers here are hiring/),
    ).toBeInTheDocument()
    expect(
      demand.getByText('It holds 69% of all 29 posting records: #1 of 2 regions.'),
    ).toBeInTheDocument()
    const train = within(
      within(dialog).getByRole('region', {
        name: /^Best place to train: Manila Welding Institute/,
      }),
    )
    expect(train.getByText(/It offers .+: a strong match for your search\./)).toBeInTheDocument()
    expect(
      train.getByText(/centers? of this kind listed for it, [\d.]+ km from you\./),
    ).toBeInTheDocument()
    // The dialog closes itself: no Back of the panel's.
    expect(within(dialog).queryByRole('button', { name: 'Back to results' })).toBeNull()
    await user.click(within(dialog).getByRole('button', { name: 'Close the analysis' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('a center opens its preview: photo, flag, Overview and Qualifications', async () => {
    const user = userEvent.setup()
    renderPage()
    const heading = await screen.findByRole('heading', { name: 'Training centers' }, LONG)
    await user.click(
      await within(heading.closest('section')!).findByRole(
        'button',
        { name: /Manila Welding Institute/ },
        LONG,
      ),
    )
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

describe('based on your skills, you can also try', () => {
  // Kuya Manuel (US-0004): his Skill Passport says Driving and Cooking, whatever he searched for.
  const DRIVING = { code: 'DRV-NCII', name: 'Driving NC II', sector: 'Automotive' }
  function serveManuel() {
    rememberSignIn()
    serveAccountApi({ signedIn: true })
    server.use(
      http.get('*/api/v1/auth/tsp/profile', () =>
        HttpResponse.json({
          skills: ['Driving', 'Cooking'],
          experience: ['Jeepney driver'],
          education: [],
          qualifications: [],
          credentials: [],
          licenses: [],
          municipality: 'Caloocan City',
          province: 'Metro Manila',
          region_code: 'NCR',
          sample: true,
        }),
      ),
      http.post('*/api/v1/analysis/matches', async ({ request }) => {
        const { query } = (await request.json()) as { query: string }
        // The search's own qualification comes first for Driving, so the next one is suggested.
        const matches =
          query === 'Driving'
            ? [WELDING, DRIVING].map((qualification) => ({ qualification, score: 70, reason: '' }))
            : [{ qualification: COOKERY, score: 75, reason: '' }]
        return HttpResponse.json({ profile: { intent: 'training_recommendation' }, matches })
      }),
    )
  }

  it('signed in, suggests a qualification per Skill Passport skill that the search did not show', async () => {
    const user = userEvent.setup()
    serveManuel()
    renderPage()
    const group = within(
      await screen.findByRole('group', { name: 'Based on your skills, you can also try' }, LONG),
    )
    expect(
      await group.findByRole('button', { name: 'Cookery NC II: see centers and demand' }, LONG),
    ).toBeInTheDocument()
    expect(group.getByText('Because you can: Cooking')).toBeInTheDocument()
    expect(
      group.getByRole('button', { name: 'Driving NC II: see centers and demand' }),
    ).toBeInTheDocument()
    expect(group.queryByText(WELDING.name)).toBeNull()
    await user.click(group.getByRole('button', { name: 'Cookery NC II: see centers and demand' }))
    await waitFor(() =>
      expect(useExploreStore.getState().search?.result.matches[0]?.qualification.code).toBe(
        COOKERY.code,
      ),
    )
  })

  it('shows nothing for a guest', async () => {
    renderPage()
    await screen.findByText('Near you (National Capital Region): high demand', {}, LONG)
    expect(
      screen.queryByRole('group', { name: 'Based on your skills, you can also try' }),
    ).toBeNull()
  })
})
