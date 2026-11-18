import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, expect, it } from 'vitest'
import { renderWithQuery } from '../../test/query.tsx'
import { server } from '../../test/server.ts'
import { SuggestionFeedback } from './SuggestionFeedback.tsx'

const goal = 'I want to learn welding'
const props = {
  kind: 'qualification',
  resultKey: 'SMAW-NC-II',
  resultName: 'Welding NC II',
  goal,
} as const

beforeEach(() => sessionStorage.clear())

it.each([
  [
    'Not Found',
    'This version of the app can’t accept feedback. Open an updated version and try again.',
  ],
  ['Center not found.', 'Center not found.'],
])('shows an actionable feedback error for %s', async (detail, message) => {
  server.use(
    http.post('*/api/v1/feedback/suggestions', () =>
      HttpResponse.json({ detail }, { status: 404 }),
    ),
  )
  const user = userEvent.setup()
  renderWithQuery(<SuggestionFeedback kind="training" resultKey="5" resultName="Training Center" />)
  await user.click(screen.getByRole('button', { name: 'Yes' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(message)
  expect(screen.getByRole('button', { name: 'Yes' })).toBeEnabled()
})

function collectRequests() {
  const requests: Record<string, unknown>[] = []
  server.use(
    http.post('*/api/v1/feedback/suggestions', async ({ request }) => {
      requests.push((await request.json()) as Record<string, unknown>)
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return requests
}

it('rates a result once across a remount and never sends its goal with the rating', async () => {
  const requests = collectRequests()
  const user = userEvent.setup()
  const view = renderWithQuery(<SuggestionFeedback {...props} />)
  const rating = screen.getByRole('group', { name: 'Was this helpful?' })
  await user.click(within(rating).getByRole('button', { name: 'Yes' }))
  expect(await screen.findByText('Thanks for your feedback.')).toBeVisible()
  view.unmount()
  renderWithQuery(<SuggestionFeedback {...props} />)
  expect(screen.queryByRole('button', { name: 'Yes' })).toBeNull()
  expect(
    screen.getByText('This is a suggestion. Confirm with the center or your TESDA office.'),
  ).toBeVisible()
  expect(requests).toEqual([
    {
      action: 'rating',
      helpful: true,
      receipt: expect.any(String),
      result_kind: 'qualification',
      result_key: 'SMAW-NC-II',
    },
  ])
})

it.each([false, true])('only includes the goal in a report when opted in (%s)', async (optedIn) => {
  const requests = collectRequests()
  const user = userEvent.setup()
  renderWithQuery(<SuggestionFeedback {...props} />)
  await user.click(screen.getByRole('button', { name: 'Report a wrong suggestion' }))
  const submit = screen.getByRole('button', { name: 'Send report' })
  expect(submit).toBeDisabled()
  await user.click(screen.getByRole('button', { name: /Reason/ }))
  await user.click(await screen.findByRole('option', { name: 'Wrong qualification' }))
  const consent = screen.getByRole('checkbox', { name: /Include my goal text/ })
  expect(consent).not.toBeChecked()
  if (optedIn) await user.click(consent)
  await user.click(submit)
  expect(await screen.findByText('Report sent for review.')).toBeVisible()
  expect(requests).toEqual([
    {
      action: 'report',
      reason: 'wrong_qualification',
      receipt: expect.any(String),
      result_kind: 'qualification',
      result_key: 'SMAW-NC-II',
      ...(optedIn ? { shared_goal: { goal, consent: true } } : {}),
    },
  ])
})
