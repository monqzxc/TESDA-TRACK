import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client.ts'
import { useFinderStore } from '../features/finder/store.ts'
import {
  admin,
  findAccountButton,
  maria,
  PASSWORD,
  rememberSignIn,
  renderWithAuth,
  serveAccountApi,
} from '../test/account.tsx'
import { renderApp, serveCatalog } from '../test/app.tsx'
import { createTestQueryClient } from '../test/query.tsx'
import { server } from '../test/server.ts'
import { SESSION_HINT_KEY } from './session.ts'
import { useAuth, useRequireAccount } from './useAuth.ts'

type User = ReturnType<typeof userEvent.setup>

/** A response the test sends when it chooses, to act while the request is on its way. */
function deferred() {
  let resolve = () => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

afterEach(() => {
  window.localStorage.clear()
  useFinderStore.getState().reset()
  window.sessionStorage.clear()
})

/** Who the app thinks is signed in, as text. */
function AuthState() {
  const { isChecking, learner, isAdmin } = useAuth()
  let state = 'signed out'
  if (isChecking) state = 'checking'
  else if (learner) state = `${learner.full_name}${isAdmin ? ' (administrator)' : ''}`
  return <p data-testid="auth">{state}</p>
}

async function openApp(path = '/qualifications', client = createTestQueryClient()) {
  serveCatalog()
  const app = renderApp(path, client)
  await screen.findByRole('heading', { level: 1 })
  return app
}

async function signInWithDialog(user: User, email = maria.email, password = PASSWORD) {
  const dialog = await screen.findByRole('dialog', { name: 'Sign in' })
  await user.type(within(dialog).getByLabelText('Email'), email)
  await user.type(within(dialog).getByLabelText('Password'), password)
  await user.click(within(dialog).getByRole('button', { name: 'Sign in' }))
  return dialog
}

describe('the session', () => {
  it('is signed out without asking the API, when this browser has not signed in', async () => {
    let requests = 0
    server.use(
      http.all('*', () => {
        requests++
        return HttpResponse.error()
      }),
    )

    renderWithAuth(<AuthState />)

    expect(screen.getByTestId('auth')).toHaveTextContent('signed out')
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(requests).toBe(0)
  })

  it('is signed out when /me answers 401, and stops asking next time', async () => {
    rememberSignIn()
    const account = serveAccountApi({ signedIn: false })

    renderWithAuth(<AuthState />)

    expect(screen.getByTestId('auth')).toHaveTextContent('checking')
    await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('signed out'))
    expect(account.requests.map((r) => r.path)).toEqual(['/api/v1/me'])
    expect(window.localStorage.getItem(SESSION_HINT_KEY)).toBeNull()
  })

  it('shows the signed-in learner from /me', async () => {
    rememberSignIn()
    serveAccountApi({ signedIn: true })

    renderWithAuth(<AuthState />)

    await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('Maria Santos'))
    expect(screen.getByTestId('auth')).not.toHaveTextContent('administrator')
  })

  it('knows an administrator, who sees Reports', async () => {
    rememberSignIn()
    serveAccountApi({ learner: admin, signedIn: true })

    await openApp('/reports')

    await findAccountButton(admin.full_name)
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Reports' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Learner journey' }),
    ).toBeInTheDocument()
  })

  it("keeps another tab's sign-in when a check that started before it finds no session", async () => {
    window.localStorage.setItem(SESSION_HINT_KEY, 'before')
    serveAccountApi({ signedIn: false })
    const answer = deferred()
    server.use(
      http.get('*/api/v1/me', async () => {
        await answer.promise
        return HttpResponse.json({ detail: 'Sign in to continue.' }, { status: 401 })
      }),
    )
    renderWithAuth(<AuthState />)

    window.localStorage.setItem(SESSION_HINT_KEY, 'after')
    answer.resolve()

    await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('signed out'))
    expect(window.localStorage.getItem(SESSION_HINT_KEY)).toBe('after')
  })

  it('treats an unreachable API as signed out', async () => {
    rememberSignIn()
    server.use(http.get('*/api/v1/me', () => HttpResponse.error()))

    renderWithAuth(<AuthState />)

    // The query client retries; the test client doesn't.
    await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('signed out'))
  })
})

describe('signing in', () => {
  it('opens the dialog from the sidebar, and Escape returns focus to Sign in', async () => {
    const user = userEvent.setup()
    serveAccountApi()
    await openApp()
    const signIn = screen.getByRole('button', { name: 'Sign in' })

    await user.click(signIn)

    const dialog = await screen.findByRole('dialog', { name: 'Sign in' })
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
    expect(
      within(dialog).getByText('Sign in to save your progress and pick up where you left off.'),
    ).toBeInTheDocument()

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(signIn).toHaveFocus())
  })

  it('signs in with the session cookie, stays on the page, and shows the name', async () => {
    const user = userEvent.setup()
    const account = serveAccountApi()
    const { router } = await openApp('/training')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await signInWithDialog(user)

    const button = await findAccountButton()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(button).toHaveFocus())
    expect(router.state.location.pathname).toBe('/training')
    // A new random value for each sign-in, so other tabs notice; nothing about the learner.
    expect(window.localStorage.getItem(SESSION_HINT_KEY)).toMatch(/^[0-9a-f]{16}$/)
    // The same form fields as /auth/token, form-encoded, with the header the API requires of cookie writes.
    const [request] = account.requests
    expect(request).toMatchObject({
      method: 'POST',
      path: '/api/v1/auth/session',
      contentType: 'application/x-www-form-urlencoded',
      requestedWith: 'XMLHttpRequest',
    })
    expect(Object.fromEntries(new URLSearchParams(request.body))).toEqual({
      username: maria.email,
      password: PASSWORD,
      scope: '',
    })
  })

  it('marks the email as the username for password managers, in both forms', async () => {
    const user = userEvent.setup()
    serveAccountApi()
    await openApp()
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    const signIn = await screen.findByRole('dialog', { name: 'Sign in' })
    expect(within(signIn).getByLabelText('Email')).toHaveAttribute('autocomplete', 'username')
    expect(within(signIn).getByLabelText('Password')).toHaveAttribute(
      'autocomplete',
      'current-password',
    )
    await user.click(within(signIn).getByRole('button', { name: 'New here? Create an account' }))
    const register = await screen.findByRole('dialog', { name: 'Create an account' })
    expect(within(register).getByLabelText('Email')).toHaveAttribute('autocomplete', 'username')
    expect(within(register).getByLabelText('Password')).toHaveAttribute(
      'autocomplete',
      'new-password',
    )
  })

  it('drops guest training fits on sign-in while keeping public listings', async () => {
    const user = userEvent.setup()
    serveAccountApi()
    const client = createTestQueryClient()
    const fitKey = ['training', 'fit', 'SMAW-NC-II', null, null, null, false]
    const listingKey = ['training', 'listings', ['SMAW-NC-II']]
    client.setQueryData(fitKey, new Map())
    client.setQueryData(listingKey, { programs: [], schedules: [], truncated: false })
    await openApp('/qualifications', client)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await signInWithDialog(user)

    await findAccountButton()
    expect(client.getQueryData(fitKey)).toBeUndefined()
    expect(client.getQueryData(listingKey)).toBeDefined()
  })

  it('says why an email or password is missing, and sends nothing', async () => {
    const user = userEvent.setup()
    const account = serveAccountApi()
    await openApp()
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    const dialog = await screen.findByRole('dialog', { name: 'Sign in' })

    await user.type(within(dialog).getByLabelText('Email'), 'maria')
    await user.click(within(dialog).getByRole('button', { name: 'Sign in' }))

    const email = within(dialog).getByLabelText('Email')
    expect(email).toHaveAccessibleDescription('Enter your email address.')
    expect(email).toBeInvalid()
    expect(within(dialog).getByLabelText('Password')).toHaveAccessibleDescription(
      'Enter your password.',
    )
    expect(email).toHaveFocus()
    expect(account.requests).toEqual([])
  })

  it('shows a wrong password and keeps the dialog open, without ending anything', async () => {
    const user = userEvent.setup()
    serveAccountApi()
    await openApp()
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    const dialog = await signInWithDialog(user, maria.email, 'not my password')

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Incorrect email or password.',
    )
    expect(within(dialog).queryByText(/session has expired/)).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Sign in' })).toBeEnabled()
    expect(window.localStorage.getItem(SESSION_HINT_KEY)).toBeNull()
  })

  it("shows the API's lockout message after too many attempts (429)", async () => {
    const user = userEvent.setup()
    serveAccountApi()
    server.use(
      http.post('*/api/v1/auth/session', () =>
        HttpResponse.json(
          { detail: 'Too many failed sign-in attempts. Try again in 15 minutes.' },
          { status: 429 },
        ),
      ),
    )
    await openApp()
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    const dialog = await signInWithDialog(user)

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Too many failed sign-in attempts. Try again in 15 minutes.',
    )
  })

  it('shows the service message when the API is unreachable', async () => {
    const user = userEvent.setup()
    server.use(http.post('*/api/v1/auth/session', () => HttpResponse.error()))
    await openApp()
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    const dialog = await signInWithDialog(user)

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "We can't reach the TESDA-TRACK service right now. Please try again shortly.",
    )
  })

  it('shows a name as typed, never as markup', async () => {
    rememberSignIn()
    const name = '<img src=x onerror=alert(1)> Ana'
    serveAccountApi({ learner: { ...maria, full_name: name }, signedIn: true })

    await openApp()

    const button = await findAccountButton(name)
    expect(button).toHaveTextContent(name)
    expect(button.querySelector('img')).toBeNull()
  })
})

describe('creating an account', () => {
  async function openRegister(user: User) {
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    const signInDialog = await screen.findByRole('dialog', { name: 'Sign in' })
    await user.click(
      within(signInDialog).getByRole('button', { name: 'New here? Create an account' }),
    )
    return screen.findByRole('dialog', { name: 'Create an account' })
  }

  async function fillIn(user: User, dialog: HTMLElement) {
    await user.type(within(dialog).getByLabelText('Full name'), 'Maria Santos')
    await user.type(within(dialog).getByLabelText('Email'), maria.email)
    await user.type(within(dialog).getByLabelText('Password'), PASSWORD)
  }

  it('shows the privacy notice, and creates the account and signs in once the learner agrees', async () => {
    const user = userEvent.setup()
    const account = serveAccountApi()
    await openApp()
    const dialog = await openRegister(user)
    expect(within(dialog).getByLabelText('Full name')).toHaveFocus()

    await fillIn(user, dialog)
    const consent = within(dialog).getByRole('checkbox', { name: 'I agree to the privacy notice' })
    expect(consent).toHaveAccessibleDescription(expect.stringContaining('never sold'))
    await user.click(consent)
    await user.click(within(dialog).getByRole('button', { name: 'Create account' }))

    await findAccountButton()
    expect(account.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'POST /api/v1/auth/register',
      'POST /api/v1/auth/session',
    ])
    expect(JSON.parse(account.requests[0].body)).toEqual({
      full_name: 'Maria Santos',
      email: maria.email,
      password: PASSWORD,
      privacy_consent: true,
    })
  })

  it('asks for consent, and sends nothing without it', async () => {
    const user = userEvent.setup()
    const account = serveAccountApi()
    await openApp()
    const dialog = await openRegister(user)

    await fillIn(user, dialog)
    await user.click(within(dialog).getByRole('button', { name: 'Create account' }))

    const consent = within(dialog).getByRole('checkbox', { name: 'I agree to the privacy notice' })
    expect(consent).toBeInvalid()
    expect(consent).toHaveAccessibleDescription(
      expect.stringContaining('Agree to the privacy notice to create your account.'),
    )
    expect(account.requests).toEqual([])
  })

  it('says what each field needs', async () => {
    const user = userEvent.setup()
    serveAccountApi()
    await openApp()
    const dialog = await openRegister(user)

    await user.type(within(dialog).getByLabelText('Email'), 'maria@')
    await user.type(within(dialog).getByLabelText('Password'), 'short')
    await user.click(within(dialog).getByRole('button', { name: 'Create account' }))

    expect(within(dialog).getByLabelText('Full name')).toHaveAccessibleDescription(
      'Enter your name.',
    )
    expect(within(dialog).getByLabelText('Email')).toHaveAccessibleDescription(
      'Enter a valid email address.',
    )
    expect(within(dialog).getByLabelText('Password')).toHaveAccessibleDescription(
      'At least 10 characters. Use at least 10 characters.',
    )
  })

  it("shows the API's message when the email is taken", async () => {
    const user = userEvent.setup()
    serveAccountApi()
    server.use(
      http.post('*/api/v1/auth/register', () =>
        HttpResponse.json(
          { detail: 'An account with this email already exists.' },
          { status: 409 },
        ),
      ),
    )
    await openApp()
    const dialog = await openRegister(user)

    await fillIn(user, dialog)
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'I agree to the privacy notice' }),
    )
    await user.click(within(dialog).getByRole('button', { name: 'Create account' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'An account with this email already exists.',
    )
  })

  it('moves on to sign in when the account was made but signing in failed', async () => {
    const user = userEvent.setup()
    serveAccountApi()
    server.use(http.post('*/api/v1/auth/session', () => HttpResponse.error()))
    await openApp()
    const dialog = await openRegister(user)

    await fillIn(user, dialog)
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'I agree to the privacy notice' }),
    )
    await user.click(within(dialog).getByRole('button', { name: 'Create account' }))

    const signIn = await screen.findByRole('dialog', { name: 'Sign in' })
    expect(within(signIn).getByRole('status')).toHaveTextContent(
      'Your account was created. Sign in to continue.',
    )
    expect(within(signIn).getByLabelText('Email')).toHaveValue(maria.email)
  })
})

describe('signing out', () => {
  it("ends the session, clears the account's data and the finder's work, and focuses Sign in", async () => {
    const user = userEvent.setup()
    rememberSignIn()
    const account = serveAccountApi({ signedIn: true })
    const client = createTestQueryClient()
    client.setQueryData(['me', 'goals'], [{ title: 'Become an electrician' }])
    client.setQueryData(['admin', 'reports', 'overview'], { learners: 12 })
    useFinderStore.getState().startWithGoal('Become an electrician')
    await openApp('/qualifications', client)

    await user.click(await findAccountButton())
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }))

    const signIn = await screen.findByRole('button', { name: 'Sign in' })
    await waitFor(() => expect(signIn).toHaveFocus())
    expect(account.requests.at(-1)).toMatchObject({
      method: 'DELETE',
      path: '/api/v1/auth/session',
      requestedWith: 'XMLHttpRequest',
    })
    expect(client.getQueryData(['me', 'goals'])).toBeUndefined()
    expect(client.getQueryData(['admin', 'reports', 'overview'])).toBeUndefined()
    // Public data stays.
    expect(client.getQueryData(['qualifications'])).toBeDefined()
    // As in the Streamlit app: personal results go before another learner uses the browser (US-02).
    expect(useFinderStore.getState().goal).toBe('')
    expect(window.localStorage.getItem(SESSION_HINT_KEY)).toBeNull()
  })

  it('stays signed in, and says so, when the API cannot be reached', async () => {
    const user = userEvent.setup()
    rememberSignIn()
    serveAccountApi({ signedIn: true })
    server.use(http.delete('*/api/v1/auth/session', () => HttpResponse.error()))
    useFinderStore.getState().startWithGoal('Become an electrician')
    await openApp()

    await user.click(await findAccountButton())
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }))

    expect(
      await screen.findByText(
        "We can't reach the TESDA-TRACK service right now. Please try again shortly.",
      ),
    ).toBeInTheDocument()
    expect(await findAccountButton()).toBeInTheDocument()
    expect(useFinderStore.getState().goal).toBe('Become an electrician')
  })
})

describe('an expired session', () => {
  it("opens the dialog to say so, clears the account's data, and keeps the finder's work", async () => {
    const user = userEvent.setup()
    rememberSignIn()
    const account = serveAccountApi({ signedIn: true })
    const client = createTestQueryClient()
    client.setQueryData(['me', 'goals'], [{ title: 'Become an electrician' }])
    useFinderStore.getState().startWithGoal('Become an electrician')
    const { router } = await openApp('/training', client)
    await findAccountButton()

    // The cookie runs out; the next request for the learner's records finds it.
    account.signedIn = false
    await act(async () => {
      await api.GET('/api/v1/me/goals')
    })

    const dialog = await screen.findByRole('dialog', { name: 'Sign in' })
    expect(dialog).toHaveAccessibleDescription('Your session has expired. Please sign in again.')
    expect(client.getQueryData(['me', 'goals'])).toBeUndefined()
    expect(window.localStorage.getItem(SESSION_HINT_KEY)).toBeNull()
    expect(useFinderStore.getState().goal).toBe('Become an electrician')

    // Signing in again carries on, on the same page, with the work as it was.
    await user.type(within(dialog).getByLabelText('Email'), maria.email)
    await user.type(within(dialog).getByLabelText('Password'), PASSWORD)
    await user.click(within(dialog).getByRole('button', { name: 'Sign in' }))

    await findAccountButton()
    expect(router.state.location.pathname).toBe('/training')
    expect(useFinderStore.getState().goal).toBe('Become an electrician')
  })

  it('is not reported for a 401 while signed out', async () => {
    serveAccountApi({ signedIn: false })
    await openApp()

    await act(async () => {
      await api.GET('/api/v1/me/goals')
    })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('another tab', () => {
  /** The browser telling this tab that another one changed the hint. */
  function otherTabSetsHint(value: string | null) {
    if (value === null) window.localStorage.removeItem(SESSION_HINT_KEY)
    else window.localStorage.setItem(SESSION_HINT_KEY, value)
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: SESSION_HINT_KEY, newValue: value }))
    })
  }

  it("signing out there signs this tab out, and clears the account's data here", async () => {
    rememberSignIn()
    const account = serveAccountApi({ signedIn: true })
    const client = createTestQueryClient()
    client.setQueryData(['me', 'goals'], [{ title: 'Become an electrician' }])
    useFinderStore.getState().startWithGoal('Become an electrician')
    await openApp('/progress', client)
    await findAccountButton()

    account.signedIn = false
    otherTabSetsHint(null)

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Your journey deserves a place to grow' }),
    ).toBeInTheDocument()
    expect(client.getQueryData(['me', 'goals'])).toBeUndefined()
    // The finder's work belongs to this tab.
    expect(useFinderStore.getState().goal).toBe('Become an electrician')
  })

  it('signing in as someone else there shows them here, with nothing of the account before', async () => {
    rememberSignIn()
    serveAccountApi({ signedIn: true })
    const client = createTestQueryClient()
    client.setQueryData(['me', 'goals'], [{ title: 'Become an electrician' }])
    const fitKey = ['training', 'fit', 'SMAW-NC-II', null, null, null, false]
    client.setQueryData(fitKey, new Map([[1, { score: 90, explanation: [] }]]))
    await openApp('/qualifications', client)
    await findAccountButton()

    // The cookie the tabs share is now Ana's.
    serveAccountApi({ learner: admin, signedIn: true })
    otherTabSetsHint('another-sign-in')

    await findAccountButton(admin.full_name)
    expect(screen.queryByRole('button', { name: /Maria Santos/ })).not.toBeInTheDocument()
    expect(client.getQueryData(['me', 'goals'])).toBeUndefined()
    expect(client.getQueryData(fitKey)).toBeUndefined()
  })

  it('signing in there shows the learner in a tab that had never signed in', async () => {
    serveAccountApi()
    await openApp()

    serveAccountApi({ signedIn: true })
    otherTabSetsHint('a-sign-in')

    expect(await findAccountButton()).toBeInTheDocument()
  })
})

describe('useRequireAccount', () => {
  function FollowPathway({ onFollow }: { onFollow: () => void }) {
    const requireAccount = useRequireAccount()
    return (
      <button type="button" onClick={() => requireAccount(onFollow)}>
        Follow this pathway
      </button>
    )
  }

  it('runs the action at once when signed in', async () => {
    const user = userEvent.setup()
    rememberSignIn()
    serveAccountApi({ signedIn: true })
    const onFollow = vi.fn()
    renderWithAuth(
      <>
        <AuthState />
        <FollowPathway onFollow={onFollow} />
      </>,
    )
    await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('Maria Santos'))

    await user.click(screen.getByRole('button', { name: 'Follow this pathway' }))

    expect(onFollow).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('waits for a sign-in, then runs the action with focus back where the learner was', async () => {
    const user = userEvent.setup()
    serveAccountApi()
    const onFollow = vi.fn()
    renderWithAuth(<FollowPathway onFollow={onFollow} />)
    const follow = screen.getByRole('button', { name: 'Follow this pathway' })

    await user.click(follow)
    const dialog = await screen.findByRole('dialog', { name: 'Sign in' })
    expect(onFollow).not.toHaveBeenCalled()

    await user.type(within(dialog).getByLabelText('Email'), maria.email)
    await user.type(within(dialog).getByLabelText('Password'), PASSWORD)
    await user.click(within(dialog).getByRole('button', { name: 'Sign in' }))

    await waitFor(() => expect(onFollow).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(follow).toHaveFocus()
  })

  it.each([
    ['runs the action for a learner who is signed in', true],
    ['opens the dialog for one who is not', false],
  ])('waits while the app checks the session, then %s', async (_, signedIn) => {
    const user = userEvent.setup()
    rememberSignIn()
    serveAccountApi({ signedIn })
    const answer = deferred()
    server.use(
      http.get('*/api/v1/me', async () => {
        await answer.promise
        return signedIn
          ? HttpResponse.json(maria)
          : HttpResponse.json({ detail: 'Sign in to continue.' }, { status: 401 })
      }),
    )
    const onFollow = vi.fn()
    renderWithAuth(
      <>
        <AuthState />
        <FollowPathway onFollow={onFollow} />
      </>,
    )
    expect(screen.getByTestId('auth')).toHaveTextContent('checking')

    await user.click(screen.getByRole('button', { name: 'Follow this pathway' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onFollow).not.toHaveBeenCalled()
    answer.resolve()

    if (signedIn) {
      await waitFor(() => expect(onFollow).toHaveBeenCalledTimes(1))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    } else {
      expect(await screen.findByRole('dialog', { name: 'Sign in' })).toBeInTheDocument()
      expect(onFollow).not.toHaveBeenCalled()
    }
  })

  it('runs the action after creating an account too', async () => {
    const user = userEvent.setup()
    serveAccountApi()
    const onFollow = vi.fn()
    renderWithAuth(<FollowPathway onFollow={onFollow} />)

    await user.click(screen.getByRole('button', { name: 'Follow this pathway' }))
    await user.click(await screen.findByRole('button', { name: 'New here? Create an account' }))
    const dialog = await screen.findByRole('dialog', { name: 'Create an account' })
    await user.type(within(dialog).getByLabelText('Full name'), 'Maria Santos')
    await user.type(within(dialog).getByLabelText('Email'), maria.email)
    await user.type(within(dialog).getByLabelText('Password'), PASSWORD)
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'I agree to the privacy notice' }),
    )
    await user.click(within(dialog).getByRole('button', { name: 'Create account' }))

    await waitFor(() => expect(onFollow).toHaveBeenCalledTimes(1))
  })

  it('drops the action when the dialog is closed', async () => {
    const user = userEvent.setup()
    serveAccountApi()
    const onFollow = vi.fn()
    renderWithAuth(<FollowPathway onFollow={onFollow} />)
    const follow = screen.getByRole('button', { name: 'Follow this pathway' })

    await user.click(follow)
    const dialog = await screen.findByRole('dialog', { name: 'Sign in' })
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(follow).toHaveFocus())
    expect(onFollow).not.toHaveBeenCalled()
  })

  it('drops the action when the dialog is closed while signing in, though the sign-in goes through', async () => {
    const user = userEvent.setup()
    serveAccountApi()
    const answer = deferred()
    server.use(
      http.post('*/api/v1/auth/session', async () => {
        await answer.promise
        return HttpResponse.json({ learner: maria, expires_in: 3600 })
      }),
    )
    const onFollow = vi.fn()
    renderWithAuth(
      <>
        <AuthState />
        <FollowPathway onFollow={onFollow} />
      </>,
    )
    const follow = screen.getByRole('button', { name: 'Follow this pathway' })

    await user.click(follow)
    const dialog = await signInWithDialog(user)
    await within(dialog).findByRole('button', { name: 'Signing you in…' })
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    answer.resolve()

    await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('Maria Santos'))
    // Long enough for an action that was still waiting to have run.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(onFollow).not.toHaveBeenCalled()
    expect(follow).toHaveFocus()
  })
})
