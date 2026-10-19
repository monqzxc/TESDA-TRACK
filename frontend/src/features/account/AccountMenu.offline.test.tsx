import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reloadPage } from '../../lib/reload.ts'
import {
  findAccountButton,
  maria,
  PASSWORD,
  rememberSignIn,
  serveAccountApi,
} from '../../test/account.tsx'
import { renderApp, serveCatalog } from '../../test/app.tsx'

// The account menu's code fails to download: offline, or after a release replaced the old files.

vi.mock('../../lib/reload.ts', () => ({ reloadPage: vi.fn() }))

vi.mock('./SignedInMenu.tsx', () =>
  Promise.reject(new TypeError('Failed to fetch dynamically imported module')),
)

beforeEach(() => {
  vi.mocked(reloadPage).mockClear()
  // React logs the errors its boundaries catch.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

async function openApp() {
  serveCatalog()
  renderApp('/qualifications')
  return screen.findByRole('heading', { level: 1, name: 'Qualifications Library' })
}

describe("when the account menu's code can't be downloaded", () => {
  it('keeps the account button, which says the menu can’t open and offers to reload', async () => {
    const user = userEvent.setup()
    rememberSignIn()
    serveAccountApi({ signedIn: true })
    const heading = await openApp()

    const button = await findAccountButton()
    expect(heading).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    await user.click(button)

    expect(
      await screen.findByText(
        "We can't open your account menu right now. Check your connection, then try again.",
      ),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reloadPage).toHaveBeenCalledOnce()
  })

  it('still signs the learner in', async () => {
    const user = userEvent.setup()
    serveAccountApi()
    await openApp()

    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    const dialog = await screen.findByRole('dialog', { name: 'Sign in' })
    await user.type(within(dialog).getByLabelText('Email'), maria.email)
    await user.type(within(dialog).getByLabelText('Password'), PASSWORD)
    await user.click(within(dialog).getByRole('button', { name: 'Sign in' }))

    expect(await findAccountButton()).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
  })
})
