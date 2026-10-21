import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import {
  admin,
  findAccountButton,
  maria,
  PASSWORD,
  rememberSignIn,
  serveAccountApi,
} from '../../test/account.tsx'
import { renderApp } from '../../test/app.tsx'
import { server } from '../../test/server.ts'

afterEach(() => window.localStorage.clear())

describe('My Profile', () => {
  it.each([
    [maria, 'Learner'],
    [admin, 'Administrator'],
    [{ ...maria, role: 'training_coordinator' }, 'Training Coordinator'],
  ])(
    'shows the current account and its role without fetching other records',
    async (learner, role) => {
      rememberSignIn()
      const api = serveAccountApi({ signedIn: true, learner })
      renderApp('/profile')

      const details = await screen.findByRole('region', { name: 'Account details' })
      expect(within(details).getByText(learner.full_name)).toBeInTheDocument()
      expect(within(details).getByText(learner.email)).toBeInTheDocument()
      expect(within(details).getByText(role)).toBeInTheDocument()
      expect(within(details).getByText('October 1, 2026')).toHaveAttribute(
        'datetime',
        learner.created_at,
      )
      expect(document.title).toBe('My Profile · TESDA-TRACK')
      expect(screen.getByRole('link', { name: 'View my progress' })).toHaveAttribute(
        'href',
        '/progress',
      )
      expect(api.requests.map((request) => request.path)).toEqual(['/api/v1/me'])
    },
  )

  it('asks a guest to sign in and displays their profile after signing in', async () => {
    const user = userEvent.setup()
    serveAccountApi()
    const { router } = renderApp('/profile')

    await user.click(await screen.findByRole('button', { name: 'Sign in or create an account' }))
    const dialog = await screen.findByRole('dialog', { name: 'Sign in' })
    await user.type(within(dialog).getByRole('textbox', { name: 'Email' }), maria.email)
    await user.type(within(dialog).getByLabelText('Password'), PASSWORD)
    await user.click(within(dialog).getByRole('button', { name: 'Sign in' }))

    const details = await screen.findByRole('region', { name: 'Account details' })
    expect(within(details).getByText(maria.email)).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/profile')
    expect(screen.queryByRole('dialog', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  it('waits for the session before showing any account details', async () => {
    rememberSignIn()
    let finish = () => {}
    const response = new Promise<void>((resolve) => {
      finish = resolve
    })
    server.use(
      http.get('*/api/v1/me', async () => {
        await response
        return HttpResponse.json(maria)
      }),
    )
    renderApp('/profile')

    expect(await screen.findByRole('status')).toHaveTextContent('Checking your account…')
    expect(screen.queryByRole('region', { name: 'Account details' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Sign in or create an account' }),
    ).not.toBeInTheDocument()
    finish()

    expect(await screen.findByRole('region', { name: 'Account details' })).toBeInTheDocument()
  })

  it('removes profile details on sign-out while staying on the profile page', async () => {
    const user = userEvent.setup()
    rememberSignIn()
    serveAccountApi({ signedIn: true })
    const { router } = renderApp('/profile')
    await screen.findByRole('region', { name: 'Account details' })

    await user.click(await findAccountButton())
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }))

    expect(
      await screen.findByRole('button', { name: 'Sign in or create an account' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(maria.email)).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Account details' })).not.toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toBe('/profile'))
  })

  it('shows the sign-in gate when a remembered session is no longer valid', async () => {
    rememberSignIn()
    serveAccountApi({ signedIn: false })
    renderApp('/profile')

    expect(
      await screen.findByRole('button', { name: 'Sign in or create an account' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Account details' })).not.toBeInTheDocument()
  })
})
