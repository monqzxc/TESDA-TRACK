import { screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { admin, findAccountButton, rememberSignIn, serveAccountApi } from '../test/account.tsx'
import { renderApp, serveCatalog } from '../test/app.tsx'
import { useFinderStore } from '../features/finder/store.ts'

// TESDA-TRACK as it ships: guest-only, with no learner accounts (src/auth/accounts.ts).
beforeEach(() => {
  vi.stubEnv('VITE_LEARNER_ACCOUNTS', 'off')
})

afterEach(() => {
  vi.unstubAllEnvs()
  window.localStorage.clear()
  useFinderStore.getState().reset()
  window.sessionStorage.clear()
})

async function openApp(path: string) {
  serveCatalog()
  const app = renderApp(path)
  await screen.findByRole('heading', { level: 1 })
  return app
}

describe('guest-only', () => {
  it('offers no Sign in on Home, nor its section about what an account keeps', async () => {
    const { container } = await openApp('/')
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument()
    expect(container.querySelector('a[href="/#progress"]')).toBeNull()
    expect(container.querySelector('#progress')).toBeNull()
  })

  it('offers no Sign in, Save to profile or My progress in the app', async () => {
    await openApp('/find')
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /my progress/i })).not.toBeInTheDocument()
  })

  it.each(['/progress', '/profile'])('sends a guest from %s to Home', async (path) => {
    const { router } = await openApp(path)
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('signs staff in at /sign-in, with no way to create an account', async () => {
    serveAccountApi()
    await openApp('/sign-in')
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /create an account/i })).not.toBeInTheDocument()
  })

  it('still gives staff who are signed in their account menu', async () => {
    rememberSignIn()
    serveAccountApi({ learner: admin, signedIn: true })
    await openApp('/find')
    await findAccountButton(admin.full_name)
  })
})
