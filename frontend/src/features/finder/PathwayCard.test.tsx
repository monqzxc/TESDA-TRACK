import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { rememberSignIn, renderWithAuth, serveAccountApi } from '../../test/account.tsx'
import { welding } from '../../test/finder.ts'
import { server } from '../../test/server.ts'
import { progressKeys, type Enrollment } from '../progress/api.ts'
import { PathwayCard } from './PathwayStep.tsx'
import type { CuratedPathway } from './api.ts'

const pathway: CuratedPathway = {
  id: 7,
  qualification: welding,
  route: 'SKILL_GAP_CHECK',
  title: 'Close your skill gaps',
  description: 'Train on the competencies you still need.',
  steps: [
    { id: 1, position: 1, kind: 'self_check', title: 'Check your readiness', description: '' },
    { id: 2, position: 2, kind: 'training', title: 'Take focused training', description: '' },
  ],
}

const enrollment: Enrollment = {
  id: 'enrollment-7',
  pathway,
  status: 'active',
  completion_percent: 50,
  steps: pathway.steps.map((step) => ({
    ...step,
    status: step.id === 1 ? 'completed' : 'not_started',
  })),
  completed_at: null,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
}

function openCard(signedIn = true) {
  if (signedIn) rememberSignIn()
  serveAccountApi({ signedIn })
  return renderWithAuth(
    <MemoryRouter>
      <PathwayCard pathway={pathway} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
})

describe('Save a qualification to My Progress', () => {
  it('shows a saved qualification as added without creating a duplicate', async () => {
    let posts = 0
    openCard()
    server.use(
      http.get('*/api/v1/me/pathways', () => HttpResponse.json([enrollment])),
      http.post('*/api/v1/me/pathways', () => {
        posts++
        return HttpResponse.json(enrollment, { status: 201 })
      }),
    )

    const added = await screen.findByRole('button', { name: 'Added to My Progress' })
    expect(added).toBeDisabled()
    await userEvent.click(added)
    expect(posts).toBe(0)
    expect(screen.getByRole('link', { name: 'View My Progress' })).toHaveAttribute(
      'href',
      '/progress',
    )
  })

  it('saves the pathway once and immediately updates My Progress in the cache', async () => {
    const { client } = openCard()
    const writes: unknown[] = []
    server.use(
      http.get('*/api/v1/me/pathways', () => HttpResponse.json([])),
      http.post('*/api/v1/me/pathways', async ({ request }) => {
        writes.push(await request.json())
        return HttpResponse.json(enrollment, { status: 201 })
      }),
    )
    const user = userEvent.setup()
    const add = await screen.findByRole('button', { name: 'Add to My Progress' })
    await waitFor(() => expect(add).toBeEnabled())
    await user.click(add)

    expect(await screen.findByRole('button', { name: 'Added to My Progress' })).toBeDisabled()
    expect(writes).toEqual([{ pathway_id: pathway.id }])
    expect(client.getQueryData(progressKeys.pathways)).toEqual([enrollment])
  })

  it('restores a removed qualification while preserving the steps already completed', async () => {
    const { client } = openCard()
    const writes: { method: string; body: unknown }[] = []
    server.use(
      http.get('*/api/v1/me/pathways', () =>
        HttpResponse.json([{ ...enrollment, status: 'withdrawn' }]),
      ),
      http.patch('*/api/v1/me/pathways/:id', async ({ request }) => {
        writes.push({ method: 'PATCH', body: await request.json() })
        return HttpResponse.json(enrollment)
      }),
      http.post('*/api/v1/me/pathways', async ({ request }) => {
        writes.push({ method: 'POST', body: await request.json() })
        return HttpResponse.json(enrollment, { status: 201 })
      }),
    )
    const add = await screen.findByRole('button', { name: 'Add to My Progress' })
    await waitFor(() => expect(add).toBeEnabled())
    await userEvent.click(add)

    expect(await screen.findByRole('button', { name: 'Added to My Progress' })).toBeDisabled()
    expect(writes).toEqual([{ method: 'PATCH', body: { status: 'active' } }])
    expect(client.getQueryData(progressKeys.pathways)).toEqual([enrollment])
  })

  it('recovers the added state when another tab saves the pathway first', async () => {
    openCard()
    let savedElsewhere = false
    server.use(
      http.get('*/api/v1/me/pathways', () => HttpResponse.json(savedElsewhere ? [enrollment] : [])),
      http.post('*/api/v1/me/pathways', () => {
        savedElsewhere = true
        return HttpResponse.json({ detail: 'Already following.' }, { status: 409 })
      }),
    )
    const add = await screen.findByRole('button', { name: 'Add to My Progress' })
    await waitFor(() => expect(add).toBeEnabled())
    await userEvent.click(add)

    expect(await screen.findByRole('button', { name: 'Added to My Progress' })).toBeDisabled()
    expect(
      screen.getByText('You’re already following this pathway. Find it under My Progress.'),
    ).toBeInTheDocument()
  })

  it('does not request private pathway records for a guest', async () => {
    let requests = 0
    openCard(false)
    server.use(
      http.get('*/api/v1/me/pathways', () => {
        requests++
        return HttpResponse.json([])
      }),
    )

    expect(await screen.findByRole('button', { name: 'Add to My Progress' })).toBeEnabled()
    expect(requests).toBe(0)
    expect(screen.queryByRole('link', { name: 'View My Progress' })).not.toBeInTheDocument()
  })
})
