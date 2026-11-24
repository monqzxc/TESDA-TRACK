import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  maria,
  PASSWORD,
  rememberSignIn,
  renderWithAuth,
  serveAccountApi,
} from '../../test/account.tsx'
import { mockMediaQueries } from '../../test/matchMedia.ts'
import { server } from '../../test/server.ts'
import { manilaInstitute, REGIONS } from '../../test/training.ts'
import type { CenterMapProps } from '../training/CenterMapTypes.ts'
import { useTrainingStore } from '../training/state.ts'
import ExplorePage from './ExplorePage.tsx'
import { useDemandStore, useExploreStore } from './useExplore.ts'

// The Career Map has no top bar: the learner's icon and account menu, or Sign in for a guest, sit in the map's top
// right corner from a tablet up, and in the search bar on a phone.
vi.mock('../training/CenterMap.tsx', () => ({
  default: (props: CenterMapProps) => <ul data-testid="map">{props.centers.length}</ul>,
}))

const TABLET_UP = '(min-width: 769px)'

beforeEach(() => {
  window.sessionStorage.clear()
  useExploreStore.getState().reset()
  useDemandStore.setState({ region: undefined, scope: undefined, locality: null, code: null })
  useTrainingStore.setState({
    useLocation: false,
    location: null,
    locating: false,
    placeText: '',
    locationError: null,
    askedOnOpen: true,
  })
  server.use(
    http.get('*/api/v1/regions', () => HttpResponse.json(REGIONS)),
    http.get('*/api/v1/qualifications', () => HttpResponse.json([])),
    http.get('*/api/v1/training-providers', () => HttpResponse.json([manilaInstitute])),
    http.get('*/api/v1/training-programs', () => HttpResponse.json([])),
  )
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

function renderPage() {
  return renderWithAuth(
    <MemoryRouter initialEntries={['/explore']}>
      <ExplorePage />
    </MemoryRouter>,
  )
}

/** The account button, once the menu's code is in (a disabled stand-in shows until then). */
function findAvatar() {
  return waitFor(() => {
    const button = screen.getByRole('button', { name: `Account: ${maria.full_name}` })
    expect(button).toBeEnabled()
    return button
  })
}

/**
 * The mouse moves onto the button. Tips open only for a hover the mouse made, which React Aria knows from the mouse
 * having moved; user-event's hover moves it only once it is over the button, so it moves over the map first.
 */
async function hover(user: ReturnType<typeof userEvent.setup>, element: HTMLElement) {
  await user.hover(screen.getByTestId('map'))
  await user.hover(element)
}

/** The map's wrapper, which carries the lengths the map's own buttons keep clear of. */
function mapShell() {
  return screen.getByTestId('map').closest<HTMLElement>('[style*="--map-controls-top"]')!
}

describe('the Career Map account control, from a tablet up', () => {
  beforeEach(() => {
    mockMediaQueries({ [TABLET_UP]: true })
  })

  it('shows the signed-in learner’s icon, opening the account menu, and signs out in place', async () => {
    const user = userEvent.setup()
    rememberSignIn()
    serveAccountApi({ signedIn: true })
    renderPage()

    const avatar = await findAvatar()
    // Only the icon shows; the name is read out.
    expect(within(avatar).getByText(maria.full_name)).toHaveClass('sr-only')
    // Not in the search card: over the map.
    expect(avatar.closest('form')).toBeNull()

    await user.click(avatar)
    const menu = await screen.findByRole('menu')
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['My Profile', 'Sign out'])

    await user.click(within(menu).getByRole('menuitem', { name: 'Sign out' }))
    // Signed out, still on the map: Sign in takes the icon's place.
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByTestId('map')).toBeInTheDocument()
  })

  it('opens the menu from the keyboard, and Esc hands focus back to the icon', async () => {
    const user = userEvent.setup()
    rememberSignIn()
    serveAccountApi({ signedIn: true })
    renderPage()

    const avatar = await findAvatar()
    avatar.focus()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('menu')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    await waitFor(() => expect(avatar).toHaveFocus())
  })

  it('moves the map’s own buttons down under it', async () => {
    serveAccountApi()
    renderPage()
    await screen.findByRole('button', { name: 'Sign in' })
    expect(mapShell().style.getPropertyValue('--map-controls-top')).toBe('56px')
  })
})

describe('the Career Map’s Sign in, for a guest', () => {
  beforeEach(() => {
    mockMediaQueries({ [TABLET_UP]: true })
  })

  it('is an icon named Sign in, with a tip, that opens the sign-in dialog', async () => {
    const user = userEvent.setup()
    serveAccountApi()
    renderPage()

    const signIn = await screen.findByRole('button', { name: 'Sign in' })
    expect(signIn).not.toHaveTextContent(/\S/)
    await hover(user, signIn)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Sign in')

    await user.click(signIn)
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Email'), maria.email)
    await user.type(within(dialog).getByLabelText('Password'), PASSWORD)
    await user.click(within(dialog).getByRole('button', { name: 'Sign in' }))

    // Signed in, still on the map: the learner's icon takes Sign in's place, and focus.
    const avatar = await findAvatar()
    expect(avatar.closest('form')).toBeNull()
    await waitFor(() => expect(avatar).toHaveFocus())
    expect(screen.getByTestId('map')).toBeInTheDocument()
  })

  it('offers Sign in with TSP, as the top bar does, where only TSP sign-in is offered', async () => {
    vi.stubEnv('VITE_LEARNER_ACCOUNTS', 'off')
    const user = userEvent.setup()
    serveAccountApi()
    renderPage()

    const signIn = await screen.findByRole('button', { name: 'Sign in with TSP' })
    await hover(user, signIn)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Sign in with TSP')
    await user.click(signIn)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: 'Sign in with TSP' })).toBeInTheDocument()
  })

  it('starts sign-in from the keyboard', async () => {
    const user = userEvent.setup()
    serveAccountApi()
    renderPage()

    const signIn = await screen.findByRole('button', { name: 'Sign in' })
    signIn.focus()
    await user.keyboard(' ')
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })
})

describe('the Career Map account control on a phone', () => {
  it('sits in the search bar, and leaves the map’s own buttons where they are', async () => {
    mockMediaQueries({ [TABLET_UP]: false })
    rememberSignIn()
    serveAccountApi({ signedIn: true })
    renderPage()

    const avatar = await findAvatar()
    const bar = screen.getByRole('button', { name: 'Menu' }).closest('form')!
    expect(bar).toContainElement(avatar)
    expect(mapShell().style.getPropertyValue('--map-controls-top')).toBe('0px')
  })
})
