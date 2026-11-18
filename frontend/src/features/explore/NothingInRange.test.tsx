import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithQuery } from '../../test/query.tsx'
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
  default: (props: CenterMapProps) => <ul data-testid="map">{props.centers.length}</ul>,
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
  useExploreStore.setState({ rangeKm: NEAR_KM, askingRange: false })
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
  return renderWithQuery(
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
})
