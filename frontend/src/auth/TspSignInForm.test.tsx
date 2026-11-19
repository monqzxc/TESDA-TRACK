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
  // The top bar's and the sidebar's: either opens the dialog.
  await user.click(screen.getAllByRole('button', { name: 'Sign in with TSP' })[0])
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

  it('offers Retry and Continue as guest when sign-in cannot be reached (US-0002 AC6)', async () => {
    const state = serveMockTsp()
    let down = true
    server.use(
      http.post('*/api/v1/tsp-mock/handoff', () =>
        down
          ? HttpResponse.error()
          : HttpResponse.json({
              success: true,
              data: { code: 'code-2', state: null, expires_in: 60 },
            }),
      ),
    )
    const user = await openTspSignIn()
    await user.type(screen.getByLabelText('TSP email'), 'ana.reyes@example.com')
    await user.type(screen.getByLabelText('Password'), 'TspDemo-Ana-2026')
    await user.click(screen.getByRole('button', { name: 'Sign in with TSP' }))

    expect(await screen.findByRole('alert')).toHaveTextContent("We can't reach")
    expect(screen.getByRole('button', { name: 'Continue as guest' })).toBeInTheDocument()

    down = false
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('button', { name: 'Agree and continue' })).toBeInTheDocument()
    expect(state.codes).toEqual(['code-2'])
  })

  it('closes sign-in when the learner continues as a guest', async () => {
    serveMockTsp()
    server.use(
      http.post('*/api/v1/tsp-mock/handoff', () => new HttpResponse(null, { status: 503 })),
    )
    const user = await openTspSignIn()
    await user.type(screen.getByLabelText('TSP email'), 'ana.reyes@example.com')
    await user.type(screen.getByLabelText('Password'), 'TspDemo-Ana-2026')
    await user.click(screen.getByRole('button', { name: 'Sign in with TSP' }))

    await user.click(await screen.findByRole('button', { name: 'Continue as guest' }))
    await waitFor(() => expect(screen.queryByLabelText('TSP email')).not.toBeInTheDocument())
  })

  it('offers no Retry for a wrong password', async () => {
    serveMockTsp()
    const user = await openTspSignIn()
    await user.type(screen.getByLabelText('TSP email'), 'ana.reyes@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong password')
    await user.click(screen.getByRole('button', { name: 'Sign in with TSP' }))

    await screen.findByRole('alert')
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
  })
})
