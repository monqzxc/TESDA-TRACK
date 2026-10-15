import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FINDER_KEY } from '../features/finder/key.ts'
import { reloadPage } from '../lib/reload.ts'
import { findAccountButton, rememberSignIn, serveAccountApi } from '../test/account.tsx'
import { renderApp, serveCatalog } from '../test/app.tsx'

// Parts of the app the AuthProvider downloads when they're needed, failing to download: offline, or after a
// release replaced the old files.

vi.mock('../lib/reload.ts', () => ({ reloadPage: vi.fn() }))

vi.mock('./SignInDialog.tsx', () =>
  Promise.reject(new TypeError('Failed to fetch dynamically imported module')),
)

vi.mock('../features/finder/store.ts', () =>
  Promise.reject(new TypeError('Failed to fetch dynamically imported module')),
)

beforeEach(() => {
  vi.mocked(reloadPage).mockClear()
  // React logs the errors its boundaries catch.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  vi.restoreAllMocks()
})

const UNAVAILABLE = "We can't open sign-in right now. Check your connection, then try again."

async function openApp(path: string, name: string) {
  serveCatalog()
  renderApp(path)
  return screen.findByRole('heading', { level: 1, name })
}

// These open the dialog from My Progress's button, which doesn't fetch the dialog's code ahead (the sidebar's Sign
// in does, on hover). Under Vitest, a second download of a module mocked to fail never settles while the first is
// on its way, so the dialog would never hear that its download failed, as it does in a browser.
describe("when the sign-in dialog's code can't be downloaded", () => {
  it('says so, offers to reload, and the rest of the app keeps working', async () => {
    const user = userEvent.setup()
    serveAccountApi()
    const heading = await openApp('/progress', 'My Progress')
    const signIn = screen.getByRole('button', { name: 'Sign in or create an account' })

    await user.click(signIn)

    expect(await screen.findByText(UNAVAILABLE)).toBeInTheDocument()
    expect(heading).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(signIn).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reloadPage).toHaveBeenCalledOnce()
  })

  it('says so again the next time', async () => {
    const user = userEvent.setup()
    serveAccountApi()
    await openApp('/progress', 'My Progress')
    const signIn = screen.getByRole('button', { name: 'Sign in or create an account' })
    await user.click(signIn)
    await user.click(await screen.findByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText(UNAVAILABLE)).not.toBeInTheDocument()

    await user.click(signIn)

    expect(await screen.findByText(UNAVAILABLE)).toBeInTheDocument()
  })

  it('says nothing when fetching it ahead fails, as the learner may not open it', async () => {
    const user = userEvent.setup()
    serveAccountApi()
    // A page that never needs the finder's code (the Library does, to start the finder with a goal).
    await openApp('/no-such-page', 'Page not found')

    // Hovering over Sign in fetches the dialog's code. Uncaught, the failure would fail the test run.
    await user.hover(screen.getByRole('button', { name: 'Sign in' }))
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(screen.queryByText(UNAVAILABLE)).not.toBeInTheDocument()
  })
})

describe("when the finder's code can't be downloaded", () => {
  it("signing out still clears the finder's work from this tab", async () => {
    const user = userEvent.setup()
    rememberSignIn()
    serveAccountApi({ signedIn: true })
    // Work from an earlier page, which the store saved before this page was loaded.
    window.sessionStorage.setItem(
      FINDER_KEY,
      JSON.stringify({ state: { goal: 'Become an electrician' }, version: 1 }),
    )
    await openApp('/no-such-page', 'Page not found')

    await user.click(await findAccountButton())
    await user.click(
      within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Sign out' }),
    )

    await screen.findByRole('button', { name: 'Sign in' })
    expect(window.sessionStorage.getItem(FINDER_KEY)).toBeNull()
  })
})
