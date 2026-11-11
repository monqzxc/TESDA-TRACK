import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../../test/app.tsx'
import { server } from '../../test/server.ts'
import {
  cookeryProgram,
  serveTrainingApi,
  weldingProgram,
  type TrainingRequest,
} from '../../test/training.ts'
import { useFinderStore } from '../finder/store.ts'
import { useTrainingStore } from './state.ts'

vi.mock('./CenterMap.tsx', () => ({
  default: ({ centers }: { centers: { id: string; name: string }[] }) => (
    <ul data-testid="map">
      {centers.map((center) => (
        <li key={center.id}>{center.name}</li>
      ))}
    </ul>
  ),
}))

// Source rendering has separate tests; this suite exercises the real workspace's state and requests.
vi.mock('../labor-market/QualificationEvidence.tsx', () => ({
  QualificationEvidence: ({ qualificationCode }: { qualificationCode: string }) => (
    <section aria-label="Selected qualification evidence">Evidence for {qualificationCode}</section>
  ),
}))

const catalog = [weldingProgram.qualification, cookeryProgram.qualification].map(
  (qualification) => ({
    ...qualification,
    possible_jobs: [],
    competencies: [],
  }),
)
const unrelatedFinderGoal = 'I want to become a cook in a restaurant.'
const profile = { existing_skills: [], intent: 'training_recommendation' as const }

function beginUnrelatedJourney() {
  useFinderStore.getState().begin({
    query: unrelatedFinderGoal,
    profile,
    sessionId: null,
    sessionOwner: null,
  })
}

function fitRequests(requests: TrainingRequest[]) {
  return requests
    .filter(
      (request) => request.method === 'POST' && request.path === '/api/v1/recommendations/training',
    )
    .map((request) => request.body as { qualification_code: string; goal: string | null })
}

async function openTrainingRecommendations(user: ReturnType<typeof userEvent.setup>) {
  const view = renderApp('/training?type=training')
  await screen.findByRole('heading', { level: 2, name: 'All results (3)' })
  await user.click(screen.getByRole('button', { name: 'Qualification recommendations' }))
  await screen.findByRole('textbox', { name: 'Your goal or skills' })
  return view
}

function serveDirectory(requested: (string | null)[] = []) {
  server.use(
    http.get('*/api/v1/labor-market/qualifications', ({ request }) => {
      const region = new URL(request.url).searchParams.get('region_code')
      requested.push(region)
      return HttpResponse.json({
        items: [
          {
            qualification_code: weldingProgram.qualification.code,
            qualification_name: weldingProgram.qualification.name,
            observed_posting_count: 3,
            posting_unit: 'distinct posting records',
            observation_dates: ['2026-11-04'],
            observation_geography: {
              scope: region ? 'regional' : 'multi_regional',
              region_code: region,
              label: region ?? 'Observed regions',
            },
            forecast_support: [],
            has_selected_area_evidence: Boolean(region),
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
        region_code: region,
        evaluated_at: '2026-11-10T10:00:00+08:00',
        observed_since: '2026-01-01',
        observed_through: '2026-11-10',
        ordering: 'qualification_name',
        method_version: 'area-qualifications-v1',
      })
    }),
  )
}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  window.localStorage.clear()
  window.sessionStorage.clear()
  useFinderStore.getState().reset()
  useTrainingStore.setState({
    useLocation: false,
    askedOnOpen: true,
    location: null,
    locating: false,
    locationError: null,
    placeText: '',
    routeTo: null,
    travelMode: 'car',
    saved: [],
  })
  server.use(http.get('*/api/v1/qualifications', () => HttpResponse.json(catalog)))
})

afterEach(() => vi.unstubAllGlobals())

describe('recommendation context in the complete training workspace', () => {
  it('selects area evidence without leaking an unrelated saved Finder goal into center fit', async () => {
    const training = serveTrainingApi()
    serveDirectory()
    beginUnrelatedJourney()
    const user = userEvent.setup()
    const { router } = await openTrainingRecommendations(user)
    await user.click(screen.getByText('Explore other qualifications by area'))
    const heading = await screen.findByRole('heading', {
      level: 4,
      name: weldingProgram.qualification.name,
    })
    await user.click(
      within(heading.closest('li')!).getByRole('button', { name: 'Compare centers' }),
    )

    await waitFor(() =>
      expect(fitRequests(training.requests)).toContainEqual({
        qualification_code: weldingProgram.qualification.code,
        goal: null,
        preferred_delivery_mode: null,
        needs_scholarship: false,
        require_confirmed_availability: true,
        limit: 50,
      }),
    )
    expect(
      fitRequests(training.requests).every((request) => request.goal !== unrelatedFinderGoal),
    ).toBe(true)
    expect(router.state.location.search).not.toMatch(/restaurant|cook|goal=/)
    expect(new URLSearchParams(router.state.location.search).get('qualification')).toBe(
      weldingProgram.qualification.code,
    )
  })

  it('uses the submitted goal for its chosen qualification and clears it for manual switching or goal editing', async () => {
    const training = serveTrainingApi()
    beginUnrelatedJourney()
    server.use(
      http.post('*/api/v1/analysis/goal', () =>
        HttpResponse.json({ profile, source: 'rules', matching_mode: 'goal' }),
      ),
      http.post('*/api/v1/analysis/matches', () =>
        HttpResponse.json({
          profile,
          matches: [
            {
              qualification: weldingProgram.qualification,
              score: 80,
              reason: 'Related to your welding goal.',
            },
          ],
        }),
      ),
    )
    const user = userEvent.setup()
    const { router } = await openTrainingRecommendations(user)
    const input = screen.getByRole('textbox', { name: 'Your goal or skills' })
    const goal = 'I want to improve my welding skills.'
    fireEvent.change(input, { target: { value: goal } })
    await user.click(screen.getByRole('button', { name: 'Find qualifications' }))
    await screen.findByText('Related to your welding goal.')
    await user.click(screen.getByRole('button', { name: 'Compare centers' }))
    await waitFor(() =>
      expect(fitRequests(training.requests)).toEqual([
        expect.objectContaining({ qualification_code: weldingProgram.qualification.code, goal }),
      ]),
    )

    await act(async () => {
      await router.navigate('/training?type=training&qualification=CKY-NCII')
    })
    await waitFor(() =>
      expect(fitRequests(training.requests)).toContainEqual(
        expect.objectContaining({
          qualification_code: cookeryProgram.qualification.code,
          goal: null,
        }),
      ),
    )
    expect(
      fitRequests(training.requests).some(
        (request) =>
          request.qualification_code === cookeryProgram.qualification.code && request.goal === goal,
      ),
    ).toBe(false)

    await act(async () => {
      await router.navigate('/training?type=training&qualification=SMAW-NCII')
    })
    await screen.findByRole('heading', { level: 2, name: 'All results (1)' })
    fireEvent.change(input, { target: { value: 'I want a different career.' } })
    await waitFor(() =>
      expect(fitRequests(training.requests).at(-1)).toEqual(
        expect.objectContaining({
          qualification_code: weldingProgram.qualification.code,
          goal: null,
        }),
      ),
    )
    expect(
      fitRequests(training.requests).every((request) => request.goal !== unrelatedFinderGoal),
    ).toBe(true)
  })

  it('changes evidence geography without imposing a center-region restriction or removing neighboring results', async () => {
    serveTrainingApi()
    const requested: (string | null)[] = []
    serveDirectory(requested)
    const user = userEvent.setup()
    const { router } = await openTrainingRecommendations(user)
    await user.click(screen.getByText('Explore other qualifications by area'))
    await screen.findByText('3 observed postings · Observed regions')
    await user.click(screen.getByRole('button', { name: /Evidence area/ }))
    await user.click(screen.getByRole('option', { name: 'National Capital Region' }))

    await waitFor(() => expect(requested.at(-1)).toBe('NCR'))
    expect(new URLSearchParams(router.state.location.search).has('region')).toBe(false)
    expect(screen.getByRole('heading', { level: 2, name: 'All results (3)' })).toBeInTheDocument()
    const map = within(await screen.findByTestId('map'))
    expect(map.getByText('Cebu Skills Center')).toBeInTheDocument()
    expect(map.getByText('Manila Welding Institute')).toBeInTheDocument()
  })
})
