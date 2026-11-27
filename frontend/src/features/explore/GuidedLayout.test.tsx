import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithAuth } from '../../test/account.tsx'
import { mockMediaQueries } from '../../test/matchMedia.ts'
import { server } from '../../test/server.ts'
import { manilaInstitute, REGIONS, weldingProgram } from '../../test/training.ts'
import type { CenterMapProps } from '../training/CenterMapTypes.ts'
import { useTrainingStore } from '../training/state.ts'
import ExplorePage from './ExplorePage.tsx'
import { LAYOUT_KEY } from './layoutMode.ts'
import { useDemandStore, useExploreStore } from './useExplore.ts'

// The guided layout (?layout=guided): the map with a chat dock at the bottom and simple icons on the right.
vi.mock('../training/CenterMap.tsx', () => ({
  default: (props: CenterMapProps) => (
    <ul data-testid="map" data-route={props.route ? 'yes' : 'no'}>
      {props.centers.length}
    </ul>
  ),
}))

const WELDING = weldingProgram.qualification

beforeEach(() => {
  sessionStorage.clear()
  // From a tablet up.
  mockMediaQueries({ '(min-width: 769px)': true })
  useExploreStore.getState().reset()
  useExploreStore.getState().setSearch({
    query: 'I can weld',
    result: {
      profile: { intent: 'training_recommendation' },
      matches: [{ qualification: WELDING, score: 80, reason: 'Matched weld' }],
    },
  })
  useDemandStore.setState({ region: undefined, scope: undefined, locality: null, code: undefined, offset: 0 })
  useTrainingStore.setState({
    useLocation: true,
    location: { latitude: 14.5547, longitude: 121.0244 },
    locating: false,
    placeText: '',
    placePoint: null,
    locationError: null,
    routeTo: null,
  })
  server.use(
    http.get('*/api/v1/regions', () => HttpResponse.json(REGIONS)),
    http.get('*/api/v1/qualifications', () => HttpResponse.json([])),
    http.get('*/api/v1/training-providers', () => HttpResponse.json([manilaInstitute])),
    http.get('*/api/v1/training-programs', () => HttpResponse.json([weldingProgram])),
    http.get('*/api/v1/client-config', () =>
      HttpResponse.json({ carto_key: '', routing_enabled: true, skills_bridge_enabled: false }),
    ),
  )
})

const open = (path: string) =>
  renderWithAuth(
    <MemoryRouter initialEntries={[path]}>
      <ExplorePage />
    </MemoryRouter>,
  )

describe('the guided layout', () => {
  it('guided renders the dock and no left panel', async () => {
    open('/explore?layout=guided')
    const dock = await screen.findByTestId('chat-dock')
    expect(within(dock).getByRole('searchbox')).toBeInTheDocument()
    expect(within(dock).getByRole('button', { name: /^How far can you go\?/ })).toBeInTheDocument()
    expect(within(dock).getByRole('button', { name: 'Search' })).toBeInTheDocument()
    // No left panel, no supply and demand strip, no floating "Around you" card.
    expect(screen.queryByRole('region', { name: 'Supply and demand analysis' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Show less' })).toBeNull()
    expect(sessionStorage.getItem(LAYOUT_KEY)).toBe('guided')
  })

  it('view toggles are in the column and filter the view', async () => {
    const user = userEvent.setup()
    open('/explore?layout=guided')
    const toggles = await screen.findByRole('group', { name: 'Show on the map' })
    const training = within(toggles).getByRole('button', { name: 'Training centers' })
    await user.click(training)
    expect(training).toHaveAttribute('aria-pressed', 'true')
    await user.click(training)
    expect(training).toHaveAttribute('aria-pressed', 'false')
  })

  it('pressing the chat bar focuses the dock; the map docks it', async () => {
    const user = userEvent.setup()
    open('/explore?layout=guided')
    const dock = await screen.findByTestId('chat-dock')
    await user.click(within(dock).getByRole('searchbox'))
    expect(dock).toHaveAttribute('data-mode', 'focused')
    await user.click(screen.getByTestId('chat-dock-scrim'))
    expect(dock).toHaveAttribute('data-mode', 'docked')
  })

  it('a center tap docks and starts the route', async () => {
    const user = userEvent.setup()
    open('/explore?layout=guided')
    const dock = await screen.findByTestId('chat-dock')
    await user.click(within(dock).getByRole('searchbox'))
    await user.click(await within(dock).findByRole('button', { name: 'See centers' }, { timeout: 4000 }))
    const [center] = await within(dock).findAllByRole('button', { name: /Manila Welding Institute/ })
    await user.click(center!)
    expect(dock).toHaveAttribute('data-mode', 'docked')
    expect(screen.getByTestId('map')).toHaveAttribute('data-route', 'yes')
  })

  it('on a phone the dock sits above the Help button', async () => {
    mockMediaQueries({})
    open('/explore?layout=guided')
    const dock = await screen.findByTestId('chat-dock')
    expect(dock.style.bottom).toContain('56px')
  })

  it('classic is unchanged', async () => {
    open('/explore?layout=classic')
    expect(await screen.findByRole('button', { name: 'Show less' })).toBeInTheDocument()
    expect(screen.queryByTestId('chat-dock')).toBeNull()
  })
})
