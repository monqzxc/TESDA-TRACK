import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SESSION_HINT_KEY } from '../../auth/session.ts'
import {
  admin,
  findAccountButton,
  maria,
  PASSWORD,
  rememberSignIn,
  serveAccountApi,
} from '../../test/account.tsx'
import { renderApp, serveCatalog } from '../../test/app.tsx'
import { server } from '../../test/server.ts'
import { useFinderStore } from '../finder/store.ts'

afterEach(() => {
  window.localStorage.clear()
  useFinderStore.getState().reset()
  window.sessionStorage.clear()
  vi.restoreAllMocks()
})

/** A response the test sends when it chooses, to act while the request is on its way. */
function deferred() {
  let resolve = () => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function openApp(path: string) {
  serveCatalog()
  const app = renderApp(path)
  await screen.findByRole('heading', { level: 1 })
  return app
}

async function openAccountMenu(user: ReturnType<typeof userEvent.setup>, name = maria.full_name) {
  const trigger = await findAccountButton(name)
  await user.click(trigger)
  const menu = await screen.findByRole('menu')
  return { trigger, menu }
}

async function openDataSettings(user: ReturnType<typeof userEvent.setup>) {
  const { trigger, menu } = await openAccountMenu(user)
  await user.click(within(menu).getByRole('menuitem', { name: 'Settings' }))
  const dialog = await screen.findByRole('dialog', { name: 'Settings' })
  await user.click(within(dialog).getByText('Your data & privacy'))
  return { trigger, menu: dialog }
}

describe('the account menu', () => {
  it('shows who is signed in, with their account actions', async () => {
    const user = userEvent.setup()
    rememberSignIn()
    serveAccountApi({ signedIn: true })
    await openApp('/qualifications')

    const { menu } = await openAccountMenu(user)

    expect(within(menu).getByText('Maria Santos')).toBeInTheDocument()
    expect(within(menu).getByText('maria@example.com')).toBeInTheDocument()
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Settings', 'Sign out'])
    expect(screen.queryByRole('radiogroup', { name: 'Theme' })).not.toBeInTheDocument()
  })

  it("is in Home's top bar too, with the learner's first name", async () => {
    rememberSignIn()
    serveAccountApi({ signedIn: true })

    renderApp('/')

    const trigger = await screen.findByRole('button', { name: 'Your account: Maria Santos' })
    expect(trigger).toHaveTextContent(/^Maria$/)
  })

  it('opens theme settings from the profile popup and returns focus when closed', async () => {
    const user = userEvent.setup()
    rememberSignIn()
    serveAccountApi({ signedIn: true })
    await openApp('/qualifications')

    const { trigger, menu } = await openAccountMenu(user)
    await user.click(within(menu).getByRole('menuitem', { name: 'Settings' }))
    const popup = await screen.findByRole('dialog', { name: 'Settings' })
    await user.click(within(popup).getByRole('radio', { name: 'Dark' }))

    expect(within(popup).getByRole('radio', { name: 'Dark' })).toBeChecked()
    expect(document.documentElement.dataset.theme).toBe('dark')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(trigger).toHaveFocus())
  })
})

describe('Download my data', () => {
  let saved: { blob: Blob; link: HTMLAnchorElement }[]

  beforeEach(() => {
    saved = []
    let blob: Blob | undefined
    // jsdom has no object URLs, and doesn't download.
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((value: Blob) => {
        blob = value
        return 'blob:export'
      }),
    })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      if (blob) saved.push({ blob, link: this })
    })
  })

  it("saves the API's export as tesda-track-my-data.json, as the Streamlit app does", async () => {
    const user = userEvent.setup()
    rememberSignIn()
    const account = serveAccountApi({ signedIn: true })
    await openApp('/qualifications')

    const { menu } = await openDataSettings(user)
    await user.click(within(menu).getByRole('button', { name: 'Download my data (JSON)' }))

    expect(
      await screen.findByText('Your data was downloaded as tesda-track-my-data.json.'),
    ).toBeInTheDocument()
    expect(saved).toHaveLength(1)
    const [{ blob, link }] = saved
    expect(link.download).toBe('tesda-track-my-data.json')
    expect(link.href).toBe('blob:export')
    expect(blob.type).toBe('application/json')
    expect(await blob.text()).toBe(JSON.stringify(account.exported, null, 2))
    expect(account.requests.at(-1)).toMatchObject({ method: 'GET', path: '/api/v1/me/export' })
  })

  it('says when the export fails, and saves nothing', async () => {
    const user = userEvent.setup()
    rememberSignIn()
    serveAccountApi({ signedIn: true })
    server.use(http.get('*/api/v1/me/export', () => HttpResponse.error()))
    await openApp('/qualifications')

    const { menu } = await openDataSettings(user)
    await user.click(within(menu).getByRole('button', { name: 'Download my data (JSON)' }))

    expect(
      await screen.findByText(
        "We can't reach the TESDA-TRACK service right now. Please try again shortly.",
      ),
    ).toBeInTheDocument()
    expect(saved).toEqual([])
  })

  it('saves nothing when the learner signs out before the export arrives', async () => {
    const user = userEvent.setup()
    rememberSignIn()
    const account = serveAccountApi({ signedIn: true })
    const answer = deferred()
    server.use(
      http.get('*/api/v1/me/export', async () => {
        await answer.promise
        return HttpResponse.json(account.exported)
      }),
    )
    await openApp('/qualifications')

    const { menu } = await openDataSettings(user)
    await user.click(within(menu).getByRole('button', { name: 'Download my data (JSON)' }))
    expect(await screen.findByText('Preparing your data…')).toBeInTheDocument()
    const { menu: again } = await openAccountMenu(user)
    await user.click(within(again).getByRole('menuitem', { name: 'Sign out' }))
    await screen.findByRole('button', { name: 'Sign in' })
    answer.resolve()

    // Long enough for the export to have been saved, had it gone on.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(saved).toEqual([])
    expect(screen.queryByText(/Your data was downloaded/)).not.toBeInTheDocument()
  })
})

describe('Delete my account', () => {
  async function openDeleteDialog(user: ReturnType<typeof userEvent.setup>) {
    const { trigger, menu } = await openDataSettings(user)
    await user.click(within(menu).getByRole('button', { name: 'Delete my account' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete my account' })
    return { trigger, dialog }
  }

  it('asks for confirmation first, then deletes, signs out and says so', async () => {
    const user = userEvent.setup()
    rememberSignIn()
    const account = serveAccountApi({ signedIn: true })
    useFinderStore.getState().startWithGoal('Become an electrician')
    await openApp('/qualifications')

    const { dialog } = await openDeleteDialog(user)
    expect(dialog).toHaveAccessibleDescription(
      "This can't be undone. If you want a copy of your data, download it first.",
    )
    const remove = within(dialog).getByRole('button', { name: 'Delete my account' })
    expect(remove).toBeDisabled()

    await user.click(
      within(dialog).getByRole('checkbox', {
        name: 'I understand this permanently deletes my account and saved records.',
      }),
    )
    expect(remove).toBeEnabled()
    await user.click(remove)

    expect(
      await screen.findByText('Your account and saved records were deleted.'),
    ).toBeInTheDocument()
    const signIn = screen.getByRole('button', { name: 'Sign in' })
    await waitFor(() => expect(signIn).toHaveFocus())
    expect(
      account.requests.slice(-2).map((r) => `${r.method} ${r.path} ${r.requestedWith}`),
    ).toEqual(['DELETE /api/v1/me XMLHttpRequest', 'DELETE /api/v1/auth/session XMLHttpRequest'])
    expect(useFinderStore.getState().goal).toBe('')
    expect(window.localStorage.getItem(SESSION_HINT_KEY)).toBeNull()
  })

  it('keeps the account when cancelled, with focus back on the menu button', async () => {
    const user = userEvent.setup()
    rememberSignIn()
    const account = serveAccountApi({ signedIn: true })
    await openApp('/qualifications')

    const { trigger, dialog } = await openDeleteDialog(user)
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(account.requests.some((r) => r.method === 'DELETE')).toBe(false)
  })

  it('says when deleting fails, and stays signed in', async () => {
    const user = userEvent.setup()
    rememberSignIn()
    serveAccountApi({ signedIn: true })
    server.use(http.delete('*/api/v1/me', () => HttpResponse.error()))
    await openApp('/qualifications')

    const { trigger, dialog } = await openDeleteDialog(user)
    await user.click(within(dialog).getByRole('checkbox'))
    await user.click(within(dialog).getByRole('button', { name: 'Delete my account' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "We can't reach the TESDA-TRACK service right now. Please try again shortly.",
    )
    expect(window.localStorage.getItem(SESSION_HINT_KEY)).toBe('1')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(await findAccountButton()).toBe(trigger)
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it("can't be closed while deleting, so a failure is always seen", async () => {
    const user = userEvent.setup()
    rememberSignIn()
    serveAccountApi({ signedIn: true })
    const answer = deferred()
    server.use(
      http.delete('*/api/v1/me', async () => {
        await answer.promise
        return HttpResponse.error()
      }),
    )
    await openApp('/qualifications')

    const { dialog } = await openDeleteDialog(user)
    await user.click(within(dialog).getByRole('checkbox'))
    await user.click(within(dialog).getByRole('button', { name: 'Delete my account' }))
    await within(dialog).findByRole('button', { name: 'Deleting your account…' })
    await user.keyboard('{Escape}')
    // A tap outside the dialog.
    await user.click(document.body)
    answer.resolve()

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "We can't reach the TESDA-TRACK service right now. Please try again shortly.",
    )
    expect(screen.getByRole('alertdialog')).toBe(dialog)
  })
})

describe('pages that need an account', () => {
  it('My Progress asks a signed-out learner to sign in, and its button opens the dialog', async () => {
    const user = userEvent.setup()
    serveAccountApi()
    await openApp('/progress')

    expect(
      screen.getByRole('heading', { level: 2, name: 'Your journey deserves a place to grow' }),
    ).toBeInTheDocument()
    const gateButton = screen.getByRole('button', { name: 'Sign in or create an account' })
    await user.click(gateButton)

    expect(await screen.findByRole('dialog', { name: 'Sign in' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(gateButton).toHaveFocus())
  })

  it("My Progress's button signs in, then focus goes to the page's heading, as the button has gone", async () => {
    const user = userEvent.setup()
    serveAccountApi()
    await openApp('/progress')

    await user.click(screen.getByRole('button', { name: 'Sign in or create an account' }))
    const dialog = await screen.findByRole('dialog', { name: 'Sign in' })
    await user.type(within(dialog).getByLabelText('Email'), maria.email)
    await user.type(within(dialog).getByLabelText('Password'), PASSWORD)
    await user.click(within(dialog).getByRole('button', { name: 'Sign in' }))

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Continue your journey' }),
    ).toBeInTheDocument()
    const heading = screen.getByRole('heading', { level: 1, name: 'My Progress' })
    await waitFor(() => expect(heading).toHaveFocus())
  })

  it('My Progress shows the page once signed in', async () => {
    rememberSignIn()
    serveAccountApi({ signedIn: true })

    await openApp('/progress')

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Continue your journey' }),
    ).toBeInTheDocument()
  })

  it('sends a learner without report access back home', async () => {
    rememberSignIn()
    serveAccountApi({ signedIn: true })
    const { router } = await openApp('/reports')

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(router.state.historyAction).toBe('REPLACE')
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Every career has a track. Find yours.',
      }),
    ).toBeInTheDocument()
  })

  it('Reports offers sign-in when signed out', async () => {
    serveAccountApi()
    await openApp('/reports')

    expect(
      screen.getByText(
        'Reports are only available to administrator and analyst accounts. Sign in with one to see them.',
      ),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('main')).getByRole('button', { name: 'Sign in' }),
    ).toBeInTheDocument()
  })

  it('Reports shows the page to an administrator', async () => {
    rememberSignIn()
    serveAccountApi({ learner: admin, signedIn: true })

    await openApp('/reports')

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Learner journey' }),
    ).toBeInTheDocument()
  })
})

describe('the /sign-in page', () => {
  async function signInOnPage(user: ReturnType<typeof userEvent.setup>) {
    const main = screen.getByRole('main')
    await user.type(within(main).getByLabelText('Email'), maria.email)
    await user.type(within(main).getByLabelText('Password'), PASSWORD)
    await user.click(within(main).getByRole('button', { name: 'Sign in' }))
  }

  it('signs in with the same form, then goes on to ?next=', async () => {
    const user = userEvent.setup()
    serveAccountApi()
    const { router } = await openApp('/sign-in?next=%2Fprogress')

    await signInOnPage(user)

    await waitFor(() => expect(router.state.location.pathname).toBe('/progress'))
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Continue your journey' }),
    ).toBeInTheDocument()
  })

  it.each([
    ['another site', '%2F%2Fevil.com'],
    ['an absolute address', 'https%3A%2F%2Fevil.com%2Fprogress'],
  ])('goes home instead of to %s', async (_, next) => {
    const user = userEvent.setup()
    serveAccountApi()
    const { router } = await openApp(`/sign-in?next=${next}`)

    await signInOnPage(user)

    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })

  it('goes straight on when already signed in', async () => {
    rememberSignIn()
    serveAccountApi({ signedIn: true })

    const { router } = renderApp('/sign-in?next=%2Ftraining')

    await waitFor(() => expect(router.state.location.pathname).toBe('/training'))
  })

  it('switches to creating an account', async () => {
    const user = userEvent.setup()
    serveAccountApi()
    await openApp('/sign-in')

    await user.click(screen.getByRole('button', { name: 'New here? Create an account' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Create an account' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Full name')).toHaveFocus())
  })
})
