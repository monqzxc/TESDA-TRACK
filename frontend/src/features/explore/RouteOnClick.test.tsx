import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithAuth } from '../../test/account.tsx'
import { openCenterList } from '../../test/explore.ts'
import { server } from '../../test/server.ts'
import { cebuCenter, cookeryProgram, manilaInstitute, REGIONS } from '../../test/training.ts'
import type { CenterMapProps } from '../training/CenterMapTypes.ts'
import type { Program } from '../training/centers.ts'
import { useTrainingStore } from '../training/state.ts'
import ExplorePage from './ExplorePage.tsx'
import { useDemandStore, useExploreStore } from './useExplore.ts'

// The map stands in as a list of its pins, saying whether a route is drawn.
vi.mock('../training/CenterMap.tsx', () => ({
  default: (props: CenterMapProps) => (
    <ul data-testid="map" data-route={props.route ? 'on' : 'off'}>
      {props.centers.map((center) => (
        <li key={center.id}>{center.name}</li>
      ))}
    </ul>
  ),
}))

const manilaCookery: Program = {
  ...cookeryProgram,
  id: 41,
  provider: {
    id: manilaInstitute.id,
    name: manilaInstitute.name,
    region_code: manilaInstitute.region_code,
    city: manilaInstitute.city,
    latitude: manilaInstitute.latitude,
    longitude: manilaInstitute.longitude,
  },
}

const MAKATI = { latitude: 14.55, longitude: 121.02, label: 'Makati', pinned: false }

beforeEach(() => {
  localStorage.setItem('track.explore.locationAsked', 'no')
  useExploreStore.getState().setSearch({
    query: 'I want to learn how to cook',
    result: {
      profile: { intent: 'training_recommendation' },
      matches: [{ qualification: cookeryProgram.qualification, score: 90, reason: 'Matched cook' }],
    },
  })
  openCenterList()
  useDemandStore.setState({
    region: undefined,
    scope: undefined,
    locality: null,
    code: null,
    offset: 0,
  })
  useTrainingStore.setState({
    useLocation: false,
    location: null,
    locating: false,
    placeText: 'Makati',
    placePoint: MAKATI,
    locationError: null,
    routeTo: null,
  })
  const programs = [cookeryProgram, manilaCookery]
  server.use(
    http.get('*/api/v1/client-config', () =>
      HttpResponse.json({ carto_key: '', routing_enabled: true, skills_bridge_enabled: false }),
    ),
    http.get('*/api/v1/regions', () => HttpResponse.json(REGIONS)),
    http.get('*/api/v1/qualifications', () => HttpResponse.json([])),
    http.get('*/api/v1/training-providers', () => HttpResponse.json([manilaInstitute, cebuCenter])),
    http.get('*/api/v1/training-programs', ({ request }) => {
      const code = new URL(request.url).searchParams.get('qualification_code')
      return HttpResponse.json(programs.filter((p) => !code || p.qualification.code === code))
    }),
    http.get('*/api/v1/routes', () =>
      HttpResponse.json({
        routing_enabled: true,
        routes: [],
        missing_modes: ['car', 'bike', 'foot'],
      }),
    ),
  )
})

const renderPage = () =>
  renderWithAuth(
    <MemoryRouter initialEntries={['/explore']}>
      <ExplorePage />
    </MemoryRouter>,
  )

const pinNames = () =>
  within(screen.getByTestId('map'))
    .queryAllByRole('listitem')
    .map((item) => item.textContent)

describe('Explore: route on click', () => {
  it('draws the route as soon as a center is opened', async () => {
    renderPage()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /Manila Welding Institute/ }))
    await screen.findByRole('heading', { name: 'Manila Welding Institute' })
    expect(useTrainingStore.getState().routeTo).not.toBeNull()
    expect(screen.getByTestId('map')).toHaveAttribute('data-route', 'on')
  })

  it('shows only the routed center on the map', async () => {
    renderPage()
    const user = userEvent.setup()
    const row = await screen.findByRole('button', { name: /Manila Welding Institute/ })
    expect(pinNames().length).toBeGreaterThan(1)
    await user.click(row)
    await screen.findByRole('heading', { name: 'Manila Welding Institute' })
    expect(pinNames()).toEqual(['Manila Welding Institute'])
  })

  it('brings the other centers back when going back or hiding the route', async () => {
    renderPage()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /Manila Welding Institute/ }))
    await screen.findByRole('heading', { name: 'Manila Welding Institute' })
    await user.click(screen.getByRole('button', { name: /Back to results/ }))
    expect(useTrainingStore.getState().routeTo).toBeNull()
    expect(pinNames().length).toBeGreaterThan(1)

    await user.click(await screen.findByRole('button', { name: /Manila Welding Institute/ }))
    await user.click(await screen.findByRole('button', { name: /Hide route/ }))
    expect(useTrainingStore.getState().routeTo).toBeNull()
    expect(pinNames().length).toBeGreaterThan(1)
  })

  it('does not route when the page cannot draw routes', async () => {
    server.use(
      http.get('*/api/v1/client-config', () =>
        HttpResponse.json({ carto_key: '', routing_enabled: false, skills_bridge_enabled: false }),
      ),
    )
    renderPage()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /Manila Welding Institute/ }))
    await screen.findByRole('heading', { name: 'Manila Welding Institute' })
    expect(useTrainingStore.getState().routeTo).toBeNull()
    expect(pinNames().length).toBeGreaterThan(1)
  })
})
