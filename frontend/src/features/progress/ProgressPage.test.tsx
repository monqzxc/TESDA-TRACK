import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { maria, rememberSignIn, serveAccountApi } from '../../test/account.tsx'
import { renderApp } from '../../test/app.tsx'
import { server } from '../../test/server.ts'
import { useFinderStore } from '../finder/store.ts'
import type {
  Application,
  Certification,
  Enrollment,
  Goal,
  ReadinessCheck,
  RecommendationSession,
} from './api.ts'

const welding = {
  code: 'SMAW-NCII',
  name: 'Shielded Metal Arc Welding (SMAW) NC II',
  sector: 'Metals',
}
const CATALOG = [{ ...welding, possible_jobs: ['Welder'], competencies: [] }]

const session: RecommendationSession = {
  id: 'session-1',
  goal_id: null,
  query: 'I want to be a welder.',
  analysis_source: 'rules',
  profile: { intent: 'training_recommendation', experience_years: 2, has_certification: false },
  matches: [],
  selected_qualification: welding,
  pathway: {
    recommendation: 'SKILL_GAP_CHECK',
    reason: '',
    next_step: '',
    pathway: null,
  },
  created_at: '2026-10-01T02:00:00Z',
  updated_at: '2026-10-01T02:00:00Z',
}

const check = (id: string, at: string, score: number, answers: Record<string, 'confident'>) =>
  ({
    id,
    qualification: welding,
    score,
    level: score >= 50 ? 'Moderate readiness' : 'Low readiness',
    strengths: [],
    skill_gaps: [],
    recommendation: '',
    answers,
    recommendation_session_id: 'session-1',
    created_at: at,
  }) satisfies ReadinessCheck

const enrollment: Enrollment = {
  id: 'enrollment-1',
  pathway: {
    id: 7,
    qualification: welding,
    route: 'SKILL_GAP_CHECK',
    title: 'Close your skill gaps',
    description: '',
    steps: [],
  },
  status: 'active',
  completion_percent: 50,
  steps: [
    {
      id: 1,
      position: 1,
      kind: 'self_check',
      title: 'Complete the readiness check',
      description: '',
      status: 'completed',
    },
    {
      id: 2,
      position: 2,
      kind: 'training',
      title: 'Take focused training',
      description: '',
      status: 'not_started',
    },
  ],
  completed_at: null,
  created_at: '2026-10-02T00:00:00Z',
  updated_at: '2026-10-02T00:00:00Z',
}

const application: Application = {
  id: 'application-1',
  schedule: {
    id: 21,
    qualification: welding,
    center: {
      id: 1,
      name: 'Manila Assessment Center',
      region_code: 'NCR',
      city: 'Manila',
      latitude: 14.6,
      longitude: 120.98,
    },
    scheduled_at: '2099-12-01T01:00:00Z',
    slots: 15,
    seats_left: 4,
    fee: '750.00',
    status: 'open',
  },
  status: 'pending',
  result: null,
  reviewer_note: null,
  created_at: '2026-10-03T00:00:00Z',
  updated_at: '2026-10-03T00:00:00Z',
}

interface Records {
  sessions?: RecommendationSession[]
  checks?: ReadinessCheck[]
  enrollments?: Enrollment[]
  applications?: Application[]
  goals?: Goal[]
  certifications?: Certification[]
}

/** A signed-in learner with these records; every write is recorded in `writes`. */
function serveLearner(records: Records = {}) {
  rememberSignIn()
  serveAccountApi({ signedIn: true })
  const writes: { method: string; path: string; body: unknown }[] = []
  const write = async (request: Request) => {
    const text = await request.clone().text()
    writes.push({
      method: request.method,
      path: new URL(request.url).pathname,
      body: text ? (JSON.parse(text) as unknown) : undefined,
    })
  }
  server.use(
    http.get('*/api/v1/qualifications', () => HttpResponse.json(CATALOG)),
    http.get('*/api/v1/me/recommendations', () => HttpResponse.json(records.sessions ?? [])),
    http.get('*/api/v1/me/readiness-checks', () => HttpResponse.json(records.checks ?? [])),
    http.get('*/api/v1/me/pathways', () => HttpResponse.json(records.enrollments ?? [])),
    http.get('*/api/v1/me/assessment-applications', () =>
      HttpResponse.json(records.applications ?? []),
    ),
    http.get('*/api/v1/me/goals', () => HttpResponse.json(records.goals ?? [])),
    http.get('*/api/v1/me/certifications', () => HttpResponse.json(records.certifications ?? [])),
    http.patch('*/api/v1/me/pathways/:id/steps/:step', async ({ request }) => {
      await write(request)
      return HttpResponse.json({
        ...enrollment,
        completion_percent: 100,
        status: 'completed',
        steps: enrollment.steps.map((step) => ({ ...step, status: 'completed' })),
      })
    }),
    http.patch('*/api/v1/me/pathways/:id', async ({ request, params }) => {
      await write(request)
      return HttpResponse.json({
        ...(records.enrollments?.find((item) => item.id === params.id) ?? enrollment),
        status: 'withdrawn',
      })
    }),
    http.post('*/api/v1/me/assessment-applications/:id/withdraw', async ({ request }) => {
      await write(request)
      return HttpResponse.json({ ...application, status: 'withdrawn' })
    }),
    http.post('*/api/v1/me/goals', async ({ request }) => {
      await write(request)
      const body = (await request.json()) as { title: string }
      return HttpResponse.json(
        {
          id: 'goal-1',
          title: body.title,
          target_qualification: welding,
          status: 'active',
          target_date: null,
          created_at: '2026-10-04T00:00:00Z',
          updated_at: '2026-10-04T00:00:00Z',
        } satisfies Goal,
        { status: 201 },
      )
    }),
    http.patch('*/api/v1/me/goals/:id', async ({ request, params }) => {
      await write(request)
      const body = (await request.json()) as { status: Goal['status'] }
      return HttpResponse.json({
        ...records.goals?.find((goal) => goal.id === params.id),
        status: body.status,
      })
    }),
    http.post('*/api/v1/me/certifications', async ({ request }) => {
      await write(request)
      const body = (await request.json()) as { title: string; certificate_number: string | null }
      return HttpResponse.json(
        {
          id: 'cert-1',
          title: body.title,
          qualification: null,
          certificate_number: body.certificate_number,
          issuing_body: 'TESDA',
          issued_on: null,
          expires_on: null,
          verified: false,
          source: 'self_reported',
          created_at: '2026-10-04T00:00:00Z',
          updated_at: '2026-10-04T00:00:00Z',
        } satisfies Certification,
        { status: 201 },
      )
    }),
  )
  return writes
}

async function openProgress(section?: string) {
  const view = renderApp(section ? `/progress?section=${section}` : '/progress')
  await screen.findByRole('heading', { level: 2, name: 'Continue your journey' })
  return view
}

async function openProfile(section: 'records' | 'applications') {
  const view = renderApp(`/profile?section=${section}`)
  await screen.findByRole('region', {
    name: section === 'records' ? 'My goals' : 'My assessment applications',
  })
  return view
}

const region = (name: string) => screen.getByRole('region', { name })
const sections = () => screen.getByRole('navigation', { name: 'My Progress sections' })
const profileSections = () => screen.getByRole('navigation', { name: 'Profile sections' })
async function openSection(name: string) {
  await userEvent.click(within(sections()).getByRole('button', { name }))
}

beforeEach(() => {
  useFinderStore.getState().reset()
  window.sessionStorage.clear()
  window.localStorage.clear()
})

describe('My Progress', () => {
  it('sends a learner with no records to the finder, and opens qualification goals by default', async () => {
    serveLearner()
    await openProgress()

    expect(
      within(region('Continue your journey')).getByRole('link', { name: 'Find my pathway' }),
    ).toHaveAttribute('href', '/find')
    expect(region('My qualification goals')).toBeVisible()
    expect(screen.queryByRole('region', { name: 'My pathways' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Readiness over time' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'My assessment applications' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'My goals' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Recommendation history' })).not.toBeInTheDocument()
    expect(
      within(sections()).queryByRole('button', { name: 'Recommendations' }),
    ).not.toBeInTheDocument()
    await openSection('Readiness')
    expect(
      screen.getByText(
        'Complete an Assessment Readiness check while signed in to start your history.',
      ),
    ).toBeVisible()
    await openSection('Pathways')
    expect(
      screen.getByText('Follow a recommended pathway from Find my pathway to track it here.'),
    ).toBeVisible()
    await openSection('Milestones')
    expect(region('Milestones and badges')).toBeVisible()
  })

  it('switches sections at shareable addresses and shows only the selected content', async () => {
    serveLearner({ sessions: [session] })
    const { router } = await openProgress()
    for (const [label, section, heading] of [
      ['Pathways', 'pathways', 'My pathways'],
      ['Readiness', 'readiness', 'Readiness over time'],
      ['Recommendations', 'history', 'Recommendation history'],
      ['Milestones', 'milestones', 'Milestones and badges'],
      ['Qualifications', 'qualifications', 'My qualification goals'],
    ]) {
      await openSection(label)
      expect(
        new URLSearchParams(router.state.location.search).get('section') ?? 'qualifications',
      ).toBe(section)
      expect(within(sections()).getByRole('button', { name: label })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      expect(region(heading)).toBeVisible()
      if (section !== 'qualifications')
        expect(
          screen.queryByRole('region', { name: 'My qualification goals' }),
        ).not.toBeInTheDocument()
    }
  })

  it.each(['unknown', 'history'])(
    'falls back to Qualifications for unavailable section %s',
    async (section) => {
      serveLearner()
      await openProgress(section)
      expect(region('My qualification goals')).toBeVisible()
      expect(
        within(sections()).getByRole('button', { name: 'Qualifications' }),
      ).toHaveAttribute('aria-pressed', 'true')
    },
  )

  it('opens the application section from the next-step shortcut', async () => {
    serveLearner({ applications: [application] })
    const { router } = await openProgress()
    await userEvent.click(
      within(region('Continue your journey')).getByRole('button', {
        name: 'View your application',
      }),
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/profile'))
    expect(new URLSearchParams(router.state.location.search).get('section')).toBe('applications')
    expect(await screen.findByRole('region', { name: 'My assessment applications' })).toBeVisible()
  })

  it('retains an unsaved personal goal while switching sections', async () => {
    serveLearner()
    const user = userEvent.setup()
    await openProfile('records')
    await user.type(
      within(region('My goals')).getByRole('textbox', { name: 'New goal' }),
      'Earn my certificate',
    )
    await user.click(within(profileSections()).getByRole('button', { name: 'Overview' }))
    await user.click(within(profileSections()).getByRole('button', { name: 'Goals & certificates' }))
    expect(within(region('My goals')).getByRole('textbox', { name: 'New goal' })).toHaveValue(
      'Earn my certificate',
    )
  })

  it('offers the pathway with steps left first, and its button goes to it (US-10)', async () => {
    serveLearner({ sessions: [session], enrollments: [enrollment], applications: [application] })
    const user = userEvent.setup()
    await openProgress()

    const card = region('Continue your journey')
    expect(within(card).getByText('You’re following Close your skill gaps.')).toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: 'Continue your pathway' }))
    expect(screen.getByRole('heading', { name: 'My pathways' })).toHaveFocus()
  })

  it('shows only saved pathways as qualification goals, with checklist progress and pending BSRS data', async () => {
    serveLearner({
      sessions: [session],
      enrollments: [enrollment, { ...enrollment, id: 'withdrawn', status: 'withdrawn' }],
    })
    await openProgress()

    const collection = region('My qualification goals')
    expect(within(collection).getByText('1 qualification saved')).toBeVisible()
    expect(within(collection).getAllByRole('article')).toHaveLength(1)
    expect(within(collection).getByRole('heading', { name: welding.name })).toBeVisible()
    expect(within(collection).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
    expect(within(collection).getByText(/1 of 2 steps completed/)).toBeVisible()
    expect(within(collection).getByText('BSRS not connected')).toBeVisible()
    expect(within(collection).getByText(/A training percentage will be available/)).toBeVisible()
  })

  it('does not automatically add recommended qualifications to the collection', async () => {
    serveLearner({ sessions: [session] })
    await openProgress()

    const collection = region('My qualification goals')
    expect(within(collection).getByText('0 qualifications saved')).toBeVisible()
    expect(within(collection).queryByRole('article')).not.toBeInTheDocument()
    expect(within(collection).getByText('Build your learning collection')).toBeVisible()
  })

  it('shows a qualification saved from the library without inventing a pathway or percentage', async () => {
    serveLearner({
      goals: [
        {
          id: 'library-goal',
          title: welding.name,
          target_qualification: welding,
          status: 'active',
          target_date: null,
          created_at: '2026-10-04T00:00:00Z',
          updated_at: '2026-10-04T00:00:00Z',
        },
      ],
    })
    const user = userEvent.setup()
    const { router } = await openProgress()

    const collection = region('My qualification goals')
    expect(within(collection).getByText('1 qualification saved')).toBeVisible()
    expect(within(collection).getByText('Saved qualification')).toBeVisible()
    expect(within(collection).getByText('No pathway selected yet')).toBeVisible()
    expect(within(collection).queryByRole('progressbar')).not.toBeInTheDocument()
    expect(within(collection).getByText('BSRS not connected')).toBeVisible()
    expect(within(collection).getByRole('link', { name: 'Add a qualification' })).toHaveAttribute(
      'href',
      '/qualifications',
    )

    await user.click(within(collection).getByRole('button', { name: 'Explore this pathway' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/find'))
    expect(useFinderStore.getState().goal).toBe(`I want to pursue ${welding.name}.`)
  })

  it('merges a saved qualification goal and its pathway, and removes both records together', async () => {
    const goal: Goal = {
      id: 'library-goal',
      title: welding.name,
      target_qualification: welding,
      status: 'active',
      target_date: null,
      created_at: '2026-10-04T00:00:00Z',
      updated_at: '2026-10-04T00:00:00Z',
    }
    const writes = serveLearner({ goals: [goal], enrollments: [enrollment] })
    const user = userEvent.setup()
    await openProgress()
    const collection = region('My qualification goals')
    expect(within(collection).getAllByRole('article')).toHaveLength(1)
    expect(within(collection).getByText('1 qualification saved')).toBeVisible()
    expect(within(collection).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')

    await user.click(within(collection).getByRole('button', { name: `Remove: ${welding.name}` }))
    expect(await within(collection).findByText('0 qualifications saved')).toBeVisible()
    expect(writes).toEqual(
      expect.arrayContaining([
        {
          method: 'PATCH',
          path: '/api/v1/me/pathways/enrollment-1',
          body: { status: 'withdrawn' },
        },
        { method: 'PATCH', path: '/api/v1/me/goals/library-goal', body: { status: 'archived' } },
      ]),
    )
  })

  it('excludes archived qualification goals and goals with no target qualification', async () => {
    const goal: Goal = {
      id: 'archived',
      title: welding.name,
      target_qualification: welding,
      status: 'archived',
      target_date: null,
      created_at: '2026-10-04T00:00:00Z',
      updated_at: '2026-10-04T00:00:00Z',
    }
    serveLearner({
      goals: [goal, { ...goal, id: 'personal', status: 'active', target_qualification: null }],
    })
    await openProgress()
    expect(
      within(region('My qualification goals')).getByText('0 qualifications saved'),
    ).toBeVisible()
  })

  it('groups saved routes for one qualification and removes the full selection', async () => {
    const alternate = {
      ...enrollment,
      id: 'another-route',
      pathway: { ...enrollment.pathway, id: 8, title: 'Prepare for assessment' },
      created_at: '2026-10-01T00:00:00Z',
    }
    const writes = serveLearner({ enrollments: [enrollment, alternate] })
    const user = userEvent.setup()
    await openProgress()

    const collection = region('My qualification goals')
    expect(within(collection).getByText('1 qualification saved')).toBeVisible()
    expect(within(collection).getAllByRole('article')).toHaveLength(1)
    await user.click(within(collection).getByRole('button', { name: /Prepare for assessment/ }))
    expect(
      within(region('My pathways')).getByRole('heading', { name: 'Prepare for assessment' }),
    ).toHaveFocus()

    await openSection('Qualifications')
    const returnedCollection = region('My qualification goals')
    await user.click(
      within(returnedCollection).getByRole('button', { name: `Remove: ${welding.name}` }),
    )
    expect(await within(returnedCollection).findByText('0 qualifications saved')).toBeVisible()
    expect(writes.map((write) => write.path).sort()).toEqual([
      '/api/v1/me/pathways/another-route',
      '/api/v1/me/pathways/enrollment-1',
    ])
    expect(
      within(returnedCollection).getByRole('heading', { name: 'My qualification goals' }),
    ).toHaveFocus()
  })

  it('takes a saved qualification to its own checklist', async () => {
    serveLearner({ enrollments: [enrollment] })
    const user = userEvent.setup()
    await openProgress()
    await user.click(
      within(region('My qualification goals')).getByRole('button', { name: 'View pathway steps' }),
    )
    expect(
      within(region('My pathways')).getByRole('heading', { name: 'Close your skill gaps' }),
    ).toHaveFocus()
  })

  it('keeps a failed route visible if another route was successfully removed', async () => {
    const alternate = {
      ...enrollment,
      id: 'another-route',
      pathway: { ...enrollment.pathway, id: 8 },
    }
    serveLearner({ enrollments: [enrollment, alternate] })
    server.use(
      http.patch('*/api/v1/me/pathways/another-route', () =>
        HttpResponse.json({ detail: 'Unavailable' }, { status: 503 }),
      ),
    )
    const user = userEvent.setup()
    await openProgress()
    const collection = region('My qualification goals')
    await user.click(within(collection).getByRole('button', { name: `Remove: ${welding.name}` }))
    expect(await within(collection).findByRole('alert')).toHaveTextContent(/couldn’t be removed/)
    expect(within(collection).getByText('1 qualification saved')).toBeVisible()
    await openSection('Pathways')
    expect(within(region('My pathways')).getAllByRole('article')).toHaveLength(1)
  })

  it('removes a qualification from both the collection and checklist after the API saves it', async () => {
    const writes = serveLearner({ enrollments: [enrollment] })
    const user = userEvent.setup()
    await openProgress()

    const collection = region('My qualification goals')
    await user.click(within(collection).getByRole('button', { name: `Remove: ${welding.name}` }))

    expect(await within(collection).findByText('0 qualifications saved')).toBeVisible()
    expect(writes).toEqual([
      { method: 'PATCH', path: '/api/v1/me/pathways/enrollment-1', body: { status: 'withdrawn' } },
    ])
    expect(
      within(collection).getByRole('heading', { name: 'My qualification goals' }),
    ).toHaveFocus()
    await openSection('Pathways')
    expect(within(region('My pathways')).queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('keeps a qualification visible when removing it fails', async () => {
    serveLearner({ enrollments: [enrollment] })
    server.use(
      http.patch('*/api/v1/me/pathways/:id', () =>
        HttpResponse.json({ detail: 'Unavailable' }, { status: 503 }),
      ),
    )
    const user = userEvent.setup()
    await openProgress()

    const collection = region('My qualification goals')
    await user.click(within(collection).getByRole('button', { name: `Remove: ${welding.name}` }))
    expect(await within(collection).findByRole('alert')).toHaveTextContent(/couldn’t be removed/)
    expect(within(collection).getByText('1 qualification saved')).toBeVisible()
  })

  it('compares readiness checks for a qualification, and says when they asked about different skills (US-11)', async () => {
    serveLearner({
      checks: [
        check('c-2', '2026-10-09T02:00:00Z', 76, { 1: 'confident', 2: 'confident' }),
        check('c-1', '2026-10-01T02:00:00Z', 35, { 1: 'confident' }),
      ],
    })
    await openProgress('readiness')

    const history = region('Readiness over time')
    const rows = within(within(history).getByRole('table')).getAllByRole('row')
    expect(rows.slice(1).map((row) => row.textContent)).toEqual([
      'Oct 1, 202635%Low readiness',
      'Oct 9, 202676%Moderate readiness',
    ])
    expect(
      within(history).getByText('Up 41 points from Oct 1, 2026 to Oct 9, 2026.'),
    ).toBeInTheDocument()
    expect(within(history).getByText(/asked about different skills/)).toBeInTheDocument()
    expect(within(history).getByText(/Not an official assessment/)).toBeInTheDocument()
    // Latest readiness, among the figures.
    const latest = screen.getByText('Latest readiness').closest('div') as HTMLElement
    expect(within(latest).getByText('76%')).toBeInTheDocument()
  })

  it('reopens a saved recommendation in the finder by its id, with no check from elsewhere (US-10)', async () => {
    serveLearner({
      sessions: [session],
      checks: [check('c-1', '2026-10-01T02:00:00Z', 35, { 1: 'confident' })],
    })
    const user = userEvent.setup()
    const { router } = await openProgress('history')

    await user.click(screen.getByRole('button', { name: 'Continue: I want to be a welder.' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/find/matches'))
    const finder = useFinderStore.getState()
    expect(finder.journey).toMatchObject({
      query: 'I want to be a welder.',
      sessionId: 'session-1',
      sessionOwner: maria.id,
    })
    expect(finder.selected).toBe(welding.code)
    expect(finder.checks).toEqual({})
  })

  it('ticks off a step, and shows the pathway as the API saves it', async () => {
    const writes = serveLearner({ enrollments: [enrollment] })
    const user = userEvent.setup()
    await openProgress('pathways')

    await user.click(screen.getByRole('checkbox', { name: '2. Take focused training' }))

    expect(await screen.findByText('Completed')).toBeInTheDocument()
    expect(writes).toEqual([
      {
        method: 'PATCH',
        path: '/api/v1/me/pathways/enrollment-1/steps/2',
        body: { status: 'completed' },
      },
    ])
  })

  it('asks before withdrawing the specific application, then shows its status (US-09)', async () => {
    const writes = serveLearner({ applications: [application] })
    const user = userEvent.setup()
    await openProfile('applications')
    const applications = region('My assessment applications')
    expect(within(applications).getByText('Awaiting review')).toBeInTheDocument()

    await user.click(within(applications).getByRole('button', { name: 'Withdraw' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Withdraw this application?' })
    expect(within(dialog).getByText('Manila Assessment Center')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Keep it' }))
    expect(writes).toEqual([])

    await user.click(within(applications).getByRole('button', { name: 'Withdraw' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Withdraw application',
      }),
    )

    expect(
      await within(applications).findByText('Your application was withdrawn.'),
    ).toBeInTheDocument()
    expect(within(applications).getByText('Withdrawn')).toBeInTheDocument()
    expect(within(applications).queryByRole('button', { name: 'Withdraw' })).not.toBeInTheDocument()
    expect(writes.map((w) => w.path)).toEqual([
      '/api/v1/me/assessment-applications/application-1/withdraw',
    ])
  })

  it('adds a goal, asking for its words first, and marks it achieved', async () => {
    const goal: Goal = {
      id: 'goal-1',
      title: 'Earn my SMAW NC II',
      target_qualification: welding,
      status: 'active',
      target_date: null,
      created_at: '2026-10-04T00:00:00Z',
      updated_at: '2026-10-04T00:00:00Z',
    }
    const writes = serveLearner({ goals: [goal] })
    const user = userEvent.setup()
    await openProfile('records')
    const goals = region('My goals')

    await user.click(within(goals).getByRole('button', { name: 'Add goal' }))
    expect(within(goals).getByText('Describe your goal first.')).toBeInTheDocument()
    expect(within(goals).getByRole('textbox', { name: 'New goal' })).toHaveFocus()

    await user.type(within(goals).getByRole('textbox', { name: 'New goal' }), 'Pass the assessment')
    await user.click(within(goals).getByRole('button', { name: 'Add goal' }))
    expect(await within(goals).findByText('Pass the assessment')).toBeInTheDocument()

    await user.click(
      within(goals).getByRole('button', { name: 'Mark achieved: Earn my SMAW NC II' }),
    )
    await waitFor(() =>
      expect(writes.map((w) => [w.method, w.path, w.body])).toEqual([
        [
          'POST',
          '/api/v1/me/goals',
          { title: 'Pass the assessment', target_qualification_code: null },
        ],
        ['PATCH', '/api/v1/me/goals/goal-1', { status: 'achieved' }],
      ]),
    )
  })

  it('adds a certification as self-reported', async () => {
    const writes = serveLearner()
    const user = userEvent.setup()
    await openProfile('records')
    const certifications = region('My certifications')

    await user.type(
      within(certifications).getByRole('textbox', { name: 'Certificate title' }),
      'SMAW NC I',
    )
    await user.type(
      within(certifications).getByRole('textbox', { name: 'Certificate number (optional)' }),
      '12345',
    )
    await user.click(within(certifications).getByRole('button', { name: 'Add certification' }))

    expect(
      await within(certifications).findByText('TESDA · Self-reported · No. 12345'),
    ).toBeInTheDocument()
    expect(writes[0].body).toMatchObject({
      title: 'SMAW NC I',
      certificate_number: '12345',
      issuing_body: 'TESDA',
    })
  })
})
