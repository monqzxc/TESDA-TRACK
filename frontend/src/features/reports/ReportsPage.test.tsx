import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { admin, rememberSignIn, serveAccountApi } from '../../test/account.tsx'
import { renderApp } from '../../test/app.tsx'
import { server } from '../../test/server.ts'
import type { CompetencyGap, QualificationDemand } from './api.ts'

const CATALOG = [
  {
    code: 'BKP-NCIII',
    name: 'Bookkeeping NC III',
    sector: 'Business and management',
    possible_jobs: [],
    competencies: [],
  },
  {
    code: 'SMAW-NCII',
    name: 'Shielded Metal Arc Welding (SMAW) NC II',
    sector: 'Metals and Engineering',
    possible_jobs: [],
    competencies: [],
  },
  {
    code: 'CKY-NCII',
    name: 'Cookery NC II',
    sector: 'Tourism',
    possible_jobs: [],
    competencies: [],
  },
]

const row = (
  index: number,
  counts: Partial<Omit<QualificationDemand, 'qualification'>>,
): QualificationDemand => ({
  qualification: {
    code: CATALOG[index].code,
    name: CATALOG[index].name,
    sector: CATALOG[index].sector,
  },
  top_match: 0,
  chosen: 0,
  readiness_checks: 0,
  average_readiness: null,
  assessment_applications: 0,
  competent: 0,
  certified: 0,
  ...counts,
})

// Bookkeeping is quiet; welding is busiest; cookery has one check, the most-checked after welding.
const DEMAND = [
  row(0, {}),
  row(1, {
    top_match: 6,
    chosen: 4,
    readiness_checks: 3,
    average_readiness: 67.5,
    assessment_applications: 2,
    competent: 1,
    certified: 1,
  }),
  row(2, { readiness_checks: 1, average_readiness: 40 }),
]
const gap = (position: number, name: string, answers: number, rate: number | null) =>
  ({
    competency_id: position,
    position,
    name,
    answers,
    confident: 0,
    some_experience: 0,
    not_familiar: 0,
    gap_rate: rate,
  }) satisfies CompetencyGap

interface ReportRequest {
  report: string
  search: string
}

function serveReports() {
  const requests: ReportRequest[] = []
  const record = (request: Request) => {
    const url = new URL(request.url)
    requests.push({ report: url.pathname.split('/').pop() ?? '', search: url.search })
  }
  rememberSignIn()
  serveAccountApi({ learner: admin, signedIn: true })
  server.use(
    http.get('*/api/v1/qualifications', () => HttpResponse.json(CATALOG)),
    http.get('*/api/v1/admin/reports/overview', ({ request }) => {
      record(request)
      return HttpResponse.json({
        learners: 1250,
        recommendation_sessions: 310,
        semantic_analyses: 200,
        readiness_checks: 96,
        average_readiness: 61.25,
        training_rankings: 40,
        assessment_applications: { pending: 3 },
        certifications: { total: 9, verified: 7 },
      })
    }),
    http.get('*/api/v1/admin/reports/funnel', ({ request }) => {
      record(request)
      return HttpResponse.json({
        registered: 1250,
        saved_a_recommendation: 310,
        checked_readiness: 80,
        applied_for_assessment: 12,
        certified: 7,
      })
    }),
    http.get('*/api/v1/admin/reports/qualification-demand', ({ request }) => {
      record(request)
      return HttpResponse.json(DEMAND)
    }),
    http.get('*/api/v1/admin/reports/skill-gaps', ({ request }) => {
      record(request)
      const code = new URL(request.url).searchParams.get('qualification_code')
      return HttpResponse.json(
        code === 'SMAW-NCII'
          ? [gap(2, 'Weld carbon steel plates', 3, 0.667), gap(1, 'Prepare weld joints', 3, 0)]
          : [gap(1, 'Keep books of accounts', 0, null)],
      )
    }),
    http.get('*/api/v1/admin/reports/supply', ({ request }) => {
      record(request)
      return HttpResponse.json([
        {
          region_code: 'NCR',
          region: 'National Capital Region',
          training_providers: 12,
          training_programs: 30,
          upcoming_assessments: 5,
          open_seats: 40,
        },
        {
          region_code: 'VII',
          region: 'Central Visayas',
          training_providers: 4,
          training_programs: 9,
          upcoming_assessments: 2,
          open_seats: 15,
        },
      ])
    }),
  )
  return requests
}

async function openReports(path = '/reports') {
  const view = renderApp(path)
  await screen.findByRole('heading', { level: 2, name: 'Learner journey' }, { timeout: 15_000 })
  return view
}

const region = (name: string) => screen.getByRole('region', { name })
/** The line naming the period, which screen readers hear as it changes. */
const showing = () => screen.getByText(/^Showing /)
const rows = (table: HTMLElement) =>
  within(table)
    .getAllByRole('row')
    .slice(1)
    .map((tableRow) => [...tableRow.querySelectorAll('th, td')].map((cell) => cell.textContent))

beforeEach(() => {
  window.localStorage.clear()
})

describe('Reports', () => {
  it('shows the figures, the journey, busy qualifications, skill gaps and supply', async () => {
    const requests = serveReports()
    await openReports()

    expect(showing()).toHaveTextContent('Showing all activity.')
    const figures = region('Pilot activity')
    const figure = (label: string) =>
      within(figures).getByText(label).nextElementSibling?.firstElementChild?.textContent
    expect(figure('Learners')).toBe('1,250')
    expect(figure('Saved recommendations')).toBe('310')
    expect(figure('Readiness checks')).toBe('96')
    expect(figure('Average readiness')).toBe('61.3%')
    expect(figure('Verified certifications')).toBe('7')
    // Seats are listed now, across every region.
    expect(figure('Open assessment seats')).toBe('55')

    expect(rows(within(region('Learner journey')).getByRole('table'))).toEqual([
      ['Registered', '1,250'],
      ['Saved a recommendation', '310'],
      ['Checked readiness', '80'],
      ['Applied for assessment', '12'],
      ['Certified', '7'],
    ])

    // Only the qualifications with activity, busiest first.
    const demand = region('Demand by qualification')
    expect(rows(within(demand).getByRole('table'))).toEqual([
      ['Shielded Metal Arc Welding (SMAW) NC II', '6', '4', '3', '67.5%', '2', '1', '1'],
      ['Cookery NC II', '0', '0', '1', '40%', '0', '0', '0'],
    ])
    expect(
      within(demand).getByText('1 other qualification had no activity in this period.'),
    ).toBeVisible()

    // Skill gaps open on the qualification checked most.
    const gaps = region('Skill gaps')
    expect(within(gaps).getByRole('combobox', { name: 'Qualification' })).toHaveValue(
      'Shielded Metal Arc Welding (SMAW) NC II',
    )
    const gapTable = await within(gaps).findByRole('table', {
      name: 'Self-reported skill gaps for Shielded Metal Arc Welding (SMAW) NC II',
    })
    expect(rows(gapTable)).toEqual([
      ['1. Prepare weld joints', '3', '0%'],
      ['2. Weld carbon steel plates', '3', '67%'],
    ])

    expect(
      rows(within(region('Training and assessment supply by region')).getByRole('table')),
    ).toEqual([
      ['National Capital Region', '12', '30', '5', '40'],
      ['Central Visayas', '4', '9', '2', '15'],
    ])
    expect(
      requests.every((request) => request.search === '' || request.report === 'skill-gaps'),
    ).toBe(true)
  })

  it('reports on a period from the address, and keeps a new one there', async () => {
    const requests = serveReports()
    const user = userEvent.setup()
    const { router } = await openReports('/reports?from=2026-10-01')

    expect(showing()).toHaveTextContent('Showing activity from Oct 1, 2026.')
    expect(requests.find((request) => request.report === 'overview')?.search).toBe(
      '?date_from=2026-10-01',
    )

    await user.type(screen.getByLabelText('To (optional)'), '2026-10-15')

    await waitFor(() => expect(router.state.location.search).toBe('?from=2026-10-01&to=2026-10-15'))
    await waitFor(() =>
      expect(showing()).toHaveTextContent('Showing activity from Oct 1, 2026 to Oct 15, 2026.'),
    )
    expect(requests.map((request) => request.search)).toContain(
      '?date_from=2026-10-01&date_to=2026-10-15',
    )
    // Supply doesn't depend on the period: it's asked for once.
    expect(requests.filter((request) => request.report === 'supply')).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Clear dates' }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
    expect(showing()).toHaveTextContent('Showing all activity.')
  })

  it('refuses an end date before the start without asking the API', async () => {
    const requests = serveReports()
    renderApp('/reports?from=2026-10-15&to=2026-10-01')

    const alert = await screen.findByRole('alert')
    await waitFor(() =>
      expect(alert).toHaveTextContent('Choose an end date on or after the start date.'),
    )
    const to = screen.getByLabelText('To (optional)')
    expect(to).toHaveAttribute('aria-invalid', 'true')
    expect(to).toHaveAccessibleDescription(/Choose an end date on or after the start date/)
    expect(screen.queryByRole('heading', { name: 'Learner journey' })).not.toBeInTheDocument()
    expect(requests).toEqual([])
  })

  it('ignores a date in the address that isn’t one', async () => {
    const requests = serveReports()
    await openReports('/reports?from=2026-02-30&to=0002-10-01')

    expect(showing()).toHaveTextContent('Showing all activity.')
    expect(requests.find((request) => request.report === 'overview')?.search).toBe('')
  })

  it('shows the skill gaps of the qualification picked, and keeps it in the address', async () => {
    const requests = serveReports()
    const user = userEvent.setup()
    const { router } = await openReports()
    const gaps = region('Skill gaps')
    await within(gaps).findByRole('table')

    const picker = within(gaps).getByRole('combobox', { name: 'Qualification' })
    await user.clear(picker)
    await user.type(picker, 'book')
    await user.click(await screen.findByRole('option', { name: 'Bookkeeping NC III' }))

    await waitFor(() => expect(router.state.location.search).toBe('?qualification=BKP-NCIII'))
    expect(
      await within(gaps).findByText(
        'No readiness responses for this qualification in the selected period.',
      ),
    ).toBeVisible()
    expect(requests.at(-1)).toEqual({
      report: 'skill-gaps',
      search: '?qualification_code=BKP-NCIII',
    })
  })

  it('shows how satisfied learners were with their recommendation, and why not', async () => {
    serveReports()
    const [, welding] = CATALOG
    server.use(
      http.get('*/api/v1/admin/reports/feedback', () =>
        HttpResponse.json({
          answers: 8,
          satisfied: 6,
          by_place: {
            top_match: { answers: 5, satisfied: 5 },
            other_match: { answers: 1, satisfied: 0 },
            own_choice: { answers: 2, satisfied: 1 },
          },
          reasons: { wrong_qualification: 1, readiness_off: 0, pathway_not_helpful: 0, none: 1 },
          by_model: [
            { model: 'intfloat/multilingual-e5-small', answers: 6, satisfied: 5 },
            { model: null, answers: 2, satisfied: 1 },
          ],
          by_qualification: [
            {
              qualification: { code: welding.code, name: welding.name, sector: welding.sector },
              answers: 8,
              satisfied: 6,
            },
          ],
        }),
      ),
    )
    await openReports()

    const feedback = region('Recommendation feedback')
    const table = (name: string) => rows(within(feedback).getByRole('table', { name }))
    expect(within(feedback).getByText('75% satisfied: 6 of 8 answers.')).toBeVisible()
    expect(
      table('Satisfaction by where the recommended qualification stood among the matches'),
    ).toEqual([
      ['The top match', '5', '100%'],
      ['Another match', '1', '0%'],
      ['Picked from the library', '2', '50%'],
    ])
    expect(table('Reasons given for No')).toEqual([
      ['Wrong qualification for the goal', '1'],
      ['Readiness result seemed wrong', '0'],
      ['Pathway not helpful', '0'],
      ['No reason given', '1'],
    ])
    expect(table('Satisfaction by matching model')).toEqual([
      ['intfloat/multilingual-e5-small', '6', '83%'],
      ['Keyword matching only', '2', '50%'],
    ])
    expect(table('Satisfaction by qualification')).toEqual([[welding.name, '8', '75%']])
  })

  it('says when there are no answers about recommendations yet', async () => {
    serveReports()
    await openReports()

    expect(
      within(region('Recommendation feedback')).getByText(
        'No answers in this period. They appear as learners finish Find my pathway.',
      ),
    ).toBeVisible()
  })
})
