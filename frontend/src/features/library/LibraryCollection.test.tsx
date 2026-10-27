import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Qualification } from '../../api/queries.ts'
import { rememberSignIn, serveAccountApi } from '../../test/account.tsx'
import { renderApp } from '../../test/app.tsx'
import { server } from '../../test/server.ts'
import { progressKeys, type Enrollment, type Goal } from '../progress/api.ts'

const qualification: Qualification = {
  code: 'COOKERY-NC-II',
  name: 'Cookery NC II',
  sector: 'Tourism',
  possible_jobs: ['Cook'],
  competencies: [],
}
const goal: Goal = {
  id: 'goal-cooking',
  title: qualification.name,
  target_qualification: qualification,
  status: 'active',
  target_date: null,
  created_at: '2026-10-22T00:00:00Z',
  updated_at: '2026-10-22T00:00:00Z',
}
const enrollment: Enrollment = {
  id: 'cooking-pathway',
  pathway: {
    id: 7,
    qualification,
    route: 'SKILL_GAP_CHECK',
    title: 'Build your cookery skills',
    description: '',
    steps: [],
  },
  status: 'active',
  completion_percent: 50,
  steps: [],
  completed_at: null,
  created_at: '2026-10-21T00:00:00Z',
  updated_at: '2026-10-21T00:00:00Z',
}

function serve(signedIn = true, goals: Goal[] = [], pathways: Enrollment[] = []) {
  if (signedIn) rememberSignIn()
  const account = serveAccountApi({ signedIn })
  server.use(
    http.get('*/api/v1/qualifications', () => HttpResponse.json([qualification])),
    http.get('*/api/v1/me/goals', () => HttpResponse.json(goals)),
    http.get('*/api/v1/me/pathways', () => HttpResponse.json(pathways)),
  )
  return account
}

async function open() {
  const view = renderApp('/qualifications')
  await screen.findByRole('article', { name: qualification.name })
  return view
}

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
})

describe('Save from the Qualifications Library', () => {
  it('keeps guest browsing available without private requests or save controls', async () => {
    const account = serve(false)
    let reads = 0
    server.use(
      http.get('*/api/v1/me/goals', () => {
        reads++
        return HttpResponse.json([])
      }),
      http.get('*/api/v1/me/pathways', () => {
        reads++
        return HttpResponse.json([])
      }),
    )
    await open()
    expect(screen.getByRole('button', { name: 'Explore this pathway' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Add to My Progress' })).not.toBeInTheDocument()
    expect(reads).toBe(0)
    expect(account.requests).toEqual([])
  })

  it('saves a catalog qualification without requiring a curated pathway and prevents repeated adds', async () => {
    serve()
    const writes: unknown[] = []
    server.use(
      http.post('*/api/v1/me/goals', async ({ request }) => {
        writes.push(await request.json())
        return HttpResponse.json(goal, { status: 201 })
      }),
    )
    const { client } = await open()
    const user = userEvent.setup()
    const add = await screen.findByRole('button', { name: 'Add to My Progress' })
    await waitFor(() => expect(add).toBeEnabled())
    await user.click(add)
    const added = await screen.findByRole('button', { name: 'Added to My Progress' })
    expect(added).toBeDisabled()
    await user.click(added)
    expect(writes).toEqual([
      { title: qualification.name, target_qualification_code: qualification.code },
    ])
    expect(client.getQueryData(progressKeys.goals)).toEqual([goal])
    expect(screen.getByRole('link', { name: 'View My Progress' })).toHaveAttribute(
      'href',
      '/progress',
    )
  })

  it.each(['goal', 'pathway'] as const)(
    'recognizes a qualification already saved as a %s',
    async (record) => {
      serve(true, record === 'goal' ? [goal] : [], record === 'pathway' ? [enrollment] : [])
      await open()
      expect(await screen.findByRole('button', { name: 'Added to My Progress' })).toBeDisabled()
      expect(screen.queryByRole('button', { name: 'Add to My Progress' })).not.toBeInTheDocument()
    },
  )

  it('reactivates an archived qualification goal instead of creating a duplicate', async () => {
    serve(true, [{ ...goal, status: 'archived' }])
    const writes: unknown[] = []
    server.use(
      http.patch('*/api/v1/me/goals/:id', async ({ request }) => {
        writes.push(await request.json())
        return HttpResponse.json(goal)
      }),
    )
    await open()
    const add = await screen.findByRole('button', { name: 'Add to My Progress' })
    await waitFor(() => expect(add).toBeEnabled())
    await userEvent.click(add)
    expect(await screen.findByRole('button', { name: 'Added to My Progress' })).toBeDisabled()
    expect(writes).toEqual([{ status: 'active' }])
  })

  it('restores a removed pathway with its existing progress', async () => {
    serve(true, [], [{ ...enrollment, status: 'withdrawn' }])
    const writes: unknown[] = []
    server.use(
      http.patch('*/api/v1/me/pathways/:id', async ({ request }) => {
        writes.push(await request.json())
        return HttpResponse.json(enrollment)
      }),
    )
    const { client } = await open()
    const add = await screen.findByRole('button', { name: 'Add to My Progress' })
    await waitFor(() => expect(add).toBeEnabled())
    await userEvent.click(add)
    expect(await screen.findByRole('button', { name: 'Added to My Progress' })).toBeDisabled()
    expect(writes).toEqual([{ status: 'active' }])
    expect(client.getQueryData(progressKeys.pathways)).toEqual([enrollment])
  })

  it('shows a save error without falsely marking the qualification as added', async () => {
    serve()
    server.use(
      http.post('*/api/v1/me/goals', () =>
        HttpResponse.json({ detail: 'Unavailable' }, { status: 503 }),
      ),
    )
    await open()
    const add = await screen.findByRole('button', { name: 'Add to My Progress' })
    await waitFor(() => expect(add).toBeEnabled())
    await userEvent.click(add)
    expect(await screen.findByRole('alert')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Added to My Progress' })).not.toBeInTheDocument()
    expect(add).toBeEnabled()
  })
})
