import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findAccountButton, maria } from '../test/account.tsx'
import { renderApp, serveCatalog } from '../test/app.tsx'
import { server } from '../test/server.ts'
import { useFinderStore } from '../features/finder/store.ts'

// "Sign in with TSP" against the mock TSP (docs/tsp-mock.md), in the guest-only app as it ships.
const ana = { ...maria, email: null, full_name: 'Ana Lopez Reyes' }

beforeEach(() => {
  vi.stubEnv('VITE_LEARNER_ACCOUNTS', 'off')
})

afterEach(() => {
  vi.unstubAllEnvs()
  window.localStorage.clear()
  useFinderStore.getState().reset()
  window.sessionStorage.clear()
})

/** The mock TSP and the TSP sign-in routes: a first visit asks for consent. */
function serveMockTsp() {
  const state = { signedIn: false, codes: [] as string[] }
  server.use(
    http.get('*/api/v1/client-config', () =>
      HttpResponse.json({
        carto_key: '',
        routing_enabled: false,
        skills_bridge_enabled: false,
        tsp_sign_in: true,
        tsp_mock: true,
      }),
    ),
    http.get('*/api/v1/me', () =>
      state.signedIn
        ? HttpResponse.json(ana)
        : HttpResponse.json({ detail: 'Sign in to continue.' }, { status: 401 }),
    ),
    http.post('*/api/v1/tsp-mock/handoff', async ({ request }) => {
      const body = (await request.json()) as { username: string; password: string }
      if (body.password !== 'TspDemo-Ana-2026') {
        return HttpResponse.json({ detail: 'Incorrect TSP username or password.' }, { status: 401 })
      }
      return HttpResponse.json({
        success: true,
        data: { code: 'code-1', state: null, expires_in: 60 },
      })
    }),
    http.post('*/api/v1/auth/tsp/session', async ({ request }) => {
      state.codes.push(((await request.json()) as { code: string }).code)
      return HttpResponse.json(
        {
          consent_required: true,
          pending_id: 'pending-1',
          summary: { name: 'Ana Lopez Reyes', keeps: ['skills', 'location'] },
        },
        { status: 202 },
      )
    }),
    http.post('*/api/v1/auth/tsp/consent', async ({ request }) => {
      const body = (await request.json()) as { accept: boolean }
      if (!body.accept) return new HttpResponse(null, { status: 204 })
      state.signedIn = true
      return HttpResponse.json({ learner: ana, expires_in: 3600 })
    }),
  )
  return state
}

async function openTspSignIn() {
  serveCatalog()
  renderApp('/find')
  await screen.findByRole('heading', { level: 1 })
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Sign in with TSP' }))
  await screen.findByLabelText('TSP email')
  return user
}

describe('Sign in with TSP, with the mock TSP on', () => {
  it('signs a synthetic account in through the handoff code and consent', async () => {
    const state = serveMockTsp()
    const user = await openTspSignIn()
    expect(screen.getByText(/TSP test accounts/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('TSP email'), 'ana.reyes@example.com')
    await user.type(screen.getByLabelText('Password'), 'TspDemo-Ana-2026')
    await user.click(screen.getByRole('button', { name: 'Sign in with TSP' }))

    expect(
      await screen.findByText(/signed in to TESDA Skill Passport as Ana Lopez Reyes/),
    ).toBeInTheDocument()
    expect(screen.getByText('Your skills')).toBeInTheDocument()
    expect(state.codes).toEqual(['code-1'])
    await user.click(screen.getByRole('button', { name: 'Agree and continue' }))

    await findAccountButton('Ana Lopez Reyes')
    await waitFor(() => expect(screen.queryByLabelText('TSP email')).not.toBeInTheDocument())
  })

  it('says so when the password is wrong, and signs nobody in', async () => {
    const state = serveMockTsp()
    const user = await openTspSignIn()
    await user.type(screen.getByLabelText('TSP email'), 'ana.reyes@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong password')
    await user.click(screen.getByRole('button', { name: 'Sign in with TSP' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Incorrect TSP username or password.',
    )
    expect(state.codes).toEqual([])
  })

  it('keeps nothing when the learner declines', async () => {
    serveMockTsp()
    const user = await openTspSignIn()
    await user.type(screen.getByLabelText('TSP email'), 'ana.reyes@example.com')
    await user.type(screen.getByLabelText('Password'), 'TspDemo-Ana-2026')
    await user.click(screen.getByRole('button', { name: 'Sign in with TSP' }))
    await user.click(await screen.findByRole('button', { name: 'Not now' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Nothing was saved.')
    expect(screen.getByLabelText('TSP email')).toBeInTheDocument()
  })
})
