import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithAuth } from '../../test/account.tsx'
import { server } from '../../test/server.ts'
import { manilaInstitute, REGIONS, weldingProgram } from '../../test/training.ts'
import type { CenterMapProps } from '../training/CenterMapTypes.ts'
import type { Program } from '../training/centers.ts'
import { useTrainingStore } from '../training/state.ts'
import ExplorePage from './ExplorePage.tsx'
import { NEAR_KM } from './explore.ts'
import { useDemandStore, useExploreStore } from './useExplore.ts'

// BUG-16 (US-0013): from Makati, "I can weld" has its only welding center in Baguio, 210.9 km away. The closest
// center shows a travel time, a related qualification within range is suggested, and the range can be changed.
vi.mock('../training/CenterMap.tsx', () => ({
  default: (props: CenterMapProps) => (
    <div>
      <ul data-testid="map" data-radius={props.radiusKm ?? ''}>
        {props.centers.length}
      </ul>
      {/* Stands in for dragging the searched place's dot on the map. */}
      {props.onMoveReference && (
        <button
          type="button"
          onClick={() => props.onMoveReference?.({ latitude: 14.5612, longitude: 121.0301 })}
        >
          Drop the pin
        </button>
      )}
    </div>
  ),
}))

const MAKATI = { latitude: 14.5547, longitude: 121.0244 }
const baguio = {
  ...manilaInstitute,
  id: 7,
  name: 'Cordillera Welding Institute',
  region_code: 'CAR',
  city: 'Baguio City',
  latitude: 16.4023,
  longitude: 120.596,
}
const baguioWelding: Program = {
  ...weldingProgram,
  id: 71,
  provider: {
    id: baguio.id,
    name: baguio.name,
    region_code: baguio.region_code,
    city: baguio.city,
    latitude: baguio.latitude,
    longitude: baguio.longitude,
  },
}
// In Manila, about 5 km from Makati: the same sector, but not what the search matched.
const manilaPipefitting: Program = {
  ...weldingProgram,
  id: 72,
  title: 'Pipefitting NC II',
  qualification: { code: 'PIPE-NCII', name: 'Pipefitting NC II', sector: 'Metals and Engineering' },
}
const programs = [baguioWelding, manilaPipefitting]

beforeEach(() => {
  useExploreStore.setState({ rangeKm: NEAR_KM, rangeChosen: false, askingRange: false })
  useExploreStore.getState().setSearch({
    query: 'I can weld',
    result: {
      profile: { intent: 'assessment_recommendation' },
      matches: [{ qualification: weldingProgram.qualification, score: 50, reason: 'Matched weld' }],
    },
  })
  useDemandStore.setState({
    region: undefined,
    scope: undefined,
    locality: null,
    code: null,
    offset: 0,
  })
  useTrainingStore.setState({
    useLocation: true,
    location: MAKATI,
    locating: false,
    placeText: '',
    placePoint: null,
    locationError: null,
    routeTo: null,
  })
  server.use(
    http.get('*/api/v1/regions', () => HttpResponse.json(REGIONS)),
    http.get('*/api/v1/qualifications', () => HttpResponse.json([])),
    http.get('*/api/v1/training-providers', () => HttpResponse.json([manilaInstitute, baguio])),
    http.get('*/api/v1/training-programs', ({ request }) => {
      const code = new URL(request.url).searchParams.get('qualification_code')
      return HttpResponse.json(programs.filter((p) => !code || p.qualification.code === code))
    }),
  )
})

function renderPage() {
  return renderWithAuth(
    <MemoryRouter initialEntries={['/explore']}>
      <ExplorePage />
    </MemoryRouter>,
  )
}

describe('Explore with nothing in range', () => {
  it('shows the closest center with its distance and travel time, and a related qualification in range', async () => {
    renderPage()
    expect(await screen.findByText(/No center within 25 km\. The closest is/)).toBeInTheDocument()
    const far = screen.getByRole('button', { name: /Cordillera Welding Institute/ })
    // About 5 hours by car: the far center has a travel time, not only a distance.
    expect(within(far).getByText(/^\d hr( \d+ min)?$/)).toBeInTheDocument()

    expect(await screen.findByText('A related qualification within 25 km')).toBeInTheDocument()
    const near = screen.getByRole('button', { name: /Manila Welding Institute/ })
    expect(within(near).getByText('Training for Pipefitting NC II')).toBeInTheDocument()
  })

  it('returns to "How far can you go?" on Change, and a wider range brings the center in', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(
      await screen.findByRole('button', { name: 'Change how far you can go (now 25 km)' }),
    )
    const step = screen.getByRole('region', { name: 'How far can you go?' })
    expect(within(step).getByRole('heading', { name: 'How far can you go?' })).toHaveFocus()
    expect(within(step).getByRole('button', { name: '25 km', pressed: true })).toBeInTheDocument()

    await user.click(within(step).getByRole('button', { name: '100 km' }))
    expect(screen.queryByRole('region', { name: 'How far can you go?' })).not.toBeInTheDocument()
    expect(await screen.findByText(/No center within 100 km\./)).toBeInTheDocument()
    expect(useExploreStore.getState().rangeKm).toBe(100)
  })

  it('offers 5 to 100 km next to the location, and the map draws the range once picked', async () => {
    const user = userEvent.setup()
    renderPage()
    const picker = await screen.findByRole('group', { name: 'How far can you go?' })
    expect(
      within(picker)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['5 km', '10 km', '25 km', '50 km', '100 km'])
    expect(within(picker).getByRole('button', { name: '25 km', pressed: true })).toBeVisible()
    // Until the learner picks, the map frames the nearest centers, not a circle.
    expect(screen.getByTestId('map')).toHaveAttribute('data-radius', '')

    await user.click(within(picker).getByRole('button', { name: '10 km' }))
    expect(await screen.findByText(/No center within 10 km\./)).toBeInTheDocument()
    expect(screen.getByTestId('map')).toHaveAttribute('data-radius', '10')
  })
})

describe('Explore from a typed place', () => {
  beforeEach(() => useTrainingStore.setState({ useLocation: false, location: null }))

  it('suggests places as the learner types, and measures a province from its capital', async () => {
    const user = userEvent.setup()
    renderPage()
    const place = await screen.findByRole('combobox', { name: 'Or type a city or province' })
    await user.type(place, 'pampa')
    const option = await screen.findByRole('option', { name: /^Pampanga/ })
    expect(within(option).getByText('From San Fernando City, the capital')).toBeInTheDocument()
    await user.click(option)
    expect(place).toHaveValue('Pampanga')
    expect(useTrainingStore.getState().placePoint).toMatchObject({
      label: 'Pampanga',
      pinned: false,
    })
    expect(useTrainingStore.getState().placePoint?.latitude).toBeCloseTo(15.03, 1)
    expect(await screen.findByText('Near Pampanga')).toBeInTheDocument()
  })

  it('measures from a picked town as from a shared location, and from the pin once it is moved', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(
      await screen.findByRole('combobox', { name: 'Or type a city or province' }),
      'makati',
    )
    await user.click(await screen.findByRole('option', { name: 'Makati City, Metro Manila' }))
    expect(await screen.findByText('Near Makati City, Metro Manila')).toBeInTheDocument()
    expect(screen.getByText(/Drag the pin on the map to be more exact/)).toBeInTheDocument()
    // The same answer as from a shared location in Makati: the far center, and a related one within range.
    expect(await screen.findByText(/No center within 25 km\. The closest is/)).toBeInTheDocument()
    expect(await screen.findByText('A related qualification within 25 km')).toBeInTheDocument()

    await user.click(screen.getByText('Drop the pin'))
    expect(await screen.findByText('Your pin near Makati City, Metro Manila')).toBeInTheDocument()
    expect(useTrainingStore.getState().placePoint).toEqual({
      label: 'Makati City, Metro Manila',
      latitude: 14.561,
      longitude: 121.03,
      pinned: true,
    })
    await user.click(screen.getByRole('button', { name: 'Reset pin' }))
    expect(await screen.findByText('Near Makati City, Metro Manila')).toBeInTheDocument()
  })
})

describe('Explore from Find my pathway', () => {
  // BUG-11: the qualification chosen in Find my pathway continues to "How far can you go?".
  it('opens the chosen qualification on "How far can you go?", then leaves the address clean', async () => {
    const { code, name, sector } = weldingProgram.qualification
    server.use(
      http.get('*/api/v1/qualifications', () =>
        HttpResponse.json([{ code, name, sector, possible_jobs: [], competencies: [] }]),
      ),
    )
    useExploreStore.setState({ search: null })
    const user = userEvent.setup()
    renderWithAuth(
      <MemoryRouter initialEntries={[`/explore?qualification=${code}&range=ask`]}>
        <ExplorePage />
      </MemoryRouter>,
    )

    const step = await screen.findByRole('region', { name: 'How far can you go?' })
    expect(within(step).getByRole('heading', { name: 'How far can you go?' })).toHaveFocus()
    expect(useExploreStore.getState().search?.result.matches[0]?.qualification.code).toBe(code)

    await user.click(within(step).getByRole('button', { name: '50 km' }))
    expect(useExploreStore.getState().rangeKm).toBe(50)
    expect(screen.queryByRole('region', { name: 'How far can you go?' })).not.toBeInTheDocument()
  })
})
