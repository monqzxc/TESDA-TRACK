import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactElement } from 'react'
import { expect } from 'vitest'
import { AuthProvider } from '../auth/AuthProvider.tsx'
import { SESSION_HINT_KEY, type Learner } from '../auth/session.ts'
import { createTestQueryClient } from './query.tsx'
import { server } from './server.ts'

export const maria: Learner = {
  id: '6f1c2a52-8b7e-4d3a-9c51-2f0e7a1b3c4d',
  email: 'maria@example.com',
  full_name: 'Maria Santos',
  role: 'learner',
  permissions: [],
  created_at: '2026-10-01T08:00:00Z',
}

export const admin: Learner = {
  ...maria,
  id: '0b9d7e1f-3c2a-4b5d-8e6f-7a1b2c3d4e5f',
  email: 'admin@example.com',
  full_name: 'Ana Reyes',
  role: 'admin',
}

export const PASSWORD = 'correct horse battery'

/**
 * The signed-in learner's account button, once it can be used. While the menu's code comes down, AccountControl
 * shows a disabled stand-in with the same name, which a click would miss.
 */
export function findAccountButton(name = maria.full_name): Promise<HTMLElement> {
  return waitFor(() => {
    const button = screen.getByRole('button', { name: `Your account: ${name}` })
    expect(button).toBeEnabled()
    return button
  })
}

/** This browser has signed in before, so the app asks the API who is signed in. */
export function rememberSignIn() {
  window.localStorage.setItem(SESSION_HINT_KEY, '1')
}

export interface ServedRequest {
  method: string
  path: string
  contentType: string | null
  requestedWith: string | null
  body: string
}

interface AccountApiOptions {
  learner?: Learner
  /** The browser holds a valid session cookie to start with. */
  signedIn?: boolean
}

/**
 * The account routes, answered as the API does, with a session cookie the tests can end (`state.signedIn`). Every
 * request is recorded in `state.requests`, bodies included.
 */
export function serveAccountApi({ learner = maria, signedIn = false }: AccountApiOptions = {}) {
  const state = { signedIn, requests: [] as ServedRequest[], exported: { account: learner } }

  const record = async (request: Request) => {
    const url = new URL(request.url)
    state.requests.push({
      method: request.method,
      path: url.pathname,
      contentType: request.headers.get('Content-Type'),
      requestedWith: request.headers.get('X-Requested-With'),
      body: request.method === 'GET' ? '' : await request.clone().text(),
    })
  }
  const signInRequired = () =>
    HttpResponse.json(
      { detail: 'Your session has expired. Please sign in again.' },
      { status: 401 },
    )

  server.use(
    http.get('*/api/v1/me', async ({ request }) => {
      await record(request)
      return state.signedIn ? HttpResponse.json(learner) : signInRequired()
    }),
    http.post('*/api/v1/auth/session', async ({ request }) => {
      await record(request)
      const form = new URLSearchParams(await request.text())
      if (form.get('username') !== learner.email || form.get('password') !== PASSWORD) {
        return HttpResponse.json({ detail: 'Incorrect email or password.' }, { status: 401 })
      }
      state.signedIn = true
      return HttpResponse.json({ learner, expires_in: 3600 })
    }),
    http.delete('*/api/v1/auth/session', async ({ request }) => {
      await record(request)
      state.signedIn = false
      return new HttpResponse(null, { status: 204 })
    }),
    http.post('*/api/v1/auth/register', async ({ request }) => {
      await record(request)
      return HttpResponse.json(learner, { status: 201 })
    }),
    http.get('*/api/v1/me/export', async ({ request }) => {
      await record(request)
      return state.signedIn ? HttpResponse.json(state.exported) : signInRequired()
    }),
    http.delete('*/api/v1/me', async ({ request }) => {
      await record(request)
      if (!state.signedIn) return signInRequired()
      state.signedIn = false
      return new HttpResponse(null, { status: 204 })
    }),
    // A learner's own records, none yet, for My Progress.
    ...[
      'goals',
      'recommendations',
      'readiness-checks',
      'pathways',
      'assessment-applications',
      'certifications',
    ].map((records) =>
      http.get(`*/api/v1/me/${records}`, async ({ request }) => {
        await record(request)
        return state.signedIn ? HttpResponse.json([]) : signInRequired()
      }),
    ),
  )
  return state
}

/** A component under the AuthProvider, without the router, with a fresh query client. */
export function renderWithAuth(ui: ReactElement, client: QueryClient = createTestQueryClient()) {
  const view = render(
    <QueryClientProvider client={client}>
      <AuthProvider>{ui}</AuthProvider>
    </QueryClientProvider>,
  )
  return { client, ...view }
}
