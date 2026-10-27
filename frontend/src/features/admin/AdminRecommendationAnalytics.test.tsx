import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, expect, it } from 'vitest'
import { admin, rememberSignIn, serveAccountApi } from '../../test/account.tsx'
import { renderApp, serveCatalog } from '../../test/app.tsx'
import { server } from '../../test/server.ts'
import type { RecommendationAnalytics } from '../reports/api.ts'

afterEach(() => window.localStorage.clear())

it('offers recommendation analytics to report staff and applies the Recommendation tab period', async () => {
  rememberSignIn()
  serveAccountApi({
    learner: { ...admin, role: 'analyst', permissions: ['reports:read'] },
    signedIn: true,
  })
  serveCatalog()
  const requests: string[] = []
  const analytics: RecommendationAnalytics = {
    feedback_answers: 0,
    accepted: 0,
    rejected: 0,
    acceptance_rate: null,
    qualification_groups: [],
    improvement_priorities: [],
    demand: {
      recent_from: '2026-09-21',
      recent_to: '2026-10-20',
      previous_from: '2026-08-22',
      previous_to: '2026-09-20',
      forecast_from: '2026-10-21',
      forecast_to: '2026-11-19',
      window_days: 30,
      minimum_recent_learners: 10,
      minimum_previous_learners: 5,
      method: 'linear_recent_trend',
      qualifications: [],
    },
  }
  server.use(
    http.get('*/api/v1/admin/reports/matching', () =>
      HttpResponse.json({ requests: 0, no_match: 0, no_match_rate: null, days: [] }),
    ),
    http.get('*/api/v1/admin/reports/recommendation-analytics', ({ request }) => {
      requests.push(new URL(request.url).search)
      return HttpResponse.json(analytics)
    }),
  )

  renderApp('/admin?section=recommendations')
  expect(await screen.findByRole('heading', { name: 'Recommendation analytics' })).toBeVisible()
  expect(
    await screen.findByRole('heading', { name: 'Where to improve recommendations' }),
  ).toBeVisible()
  expect(requests).toEqual([''])
  const filter = screen.getByRole('group', { name: 'Reporting period' })
  const from = within(filter).getByLabelText('From')
  const to = within(filter).getByLabelText('To')

  fireEvent.change(from, { target: { value: '2026-10-15' } })
  await waitFor(() => expect(requests).toContain('?date_from=2026-10-15'))
  const count = requests.length
  fireEvent.change(to, { target: { value: '2026-10-01' } })
  expect(screen.getByRole('alert')).toHaveTextContent('End date must be on or after start date.')
  expect(
    screen.queryByRole('heading', { name: 'Recommendation analytics' }),
  ).not.toBeInTheDocument()
  expect(requests).toHaveLength(count)

  fireEvent.change(to, { target: { value: '2026-10-20' } })
  await waitFor(() => expect(requests).toContain('?date_from=2026-10-15&date_to=2026-10-20'))
  expect(screen.getByRole('heading', { name: 'Recommendation analytics' })).toBeVisible()
})
