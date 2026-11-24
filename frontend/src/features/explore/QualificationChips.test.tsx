import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithAuth } from '../../test/account.tsx'
import { server } from '../../test/server.ts'
import {
  cebuCenter,
  cookeryProgram,
  manilaInstitute,
  REGIONS,
  weldingProgram,
} from '../../test/training.ts'
import type { Match } from '../finder/api.ts'
import type { CenterMapProps } from '../training/CenterMapTypes.ts'
import { useTrainingStore } from '../training/state.ts'
import ExplorePage from './ExplorePage.tsx'
import { useDemandStore, useExploreStore } from './useExplore.ts'

vi.mock('../training/CenterMap.tsx', () => ({
  default: (props: CenterMapProps) => (
    <ul data-testid="map">
      {props.centers.map((center) => (
        <li key={center.id}>{center.name}</li>
      ))}
    </ul>
  ),
}))

const match = (qualification: Match['qualification'], score = 80): Match => ({
  qualification,
  score,
  reason: 'Matched',
})
const cookery = match(cookeryProgram.qualification, 90)
const welding = match(weldingProgram.qualification, 85)
const bread = match({
  code: 'BPP-NCII',
  name: 'Bread and Pastry Production NC II',
  sector: 'Tourism',
})
const eim = match({
  code: 'EIM-NCII',
  name: 'Electrical Installation and Maintenance NC II',
  sector: 'Construction',
})

let listingRequests = 0
const searchFor = (matches: Match[], chosen?: boolean) =>
  useExploreStore.getState().setSearch({
    query: 'skills',
    result: { profile: { intent: 'training_recommendation' }, matches },
    ...(chosen ? { chosen } : {}),
  })

beforeEach(() => {
  localStorage.setItem('track.explore.locationAsked', 'no')
  useExploreStore.getState().reset()
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
    placeText: '',
    placePoint: null,
    locationError: null,
    routeTo: null,
  })
  const programs = [cookeryProgram, weldingProgram]
  server.use(
    http.get('*/api/v1/regions', () => HttpResponse.json(REGIONS)),
    http.get('*/api/v1/qualifications', () => HttpResponse.json([])),
    http.get('*/api/v1/training-providers', () => HttpResponse.json([manilaInstitute, cebuCenter])),
    http.get('*/api/v1/training-programs', ({ request }) => {
      listingRequests += 1
      const code = new URL(request.url).searchParams.get('qualification_code')
      return HttpResponse.json(programs.filter((p) => !code || p.qualification.code === code))
    }),
  )
})

const renderPage = () =>
  renderWithAuth(
    <MemoryRouter initialEntries={['/explore']}>
      <ExplorePage />
    </MemoryRouter>,
  )

const chipGroup = () => screen.queryByRole('group', { name: 'Narrow it down (optional)' })
const pinNames = () =>
  within(screen.getByTestId('map'))
    .queryAllByRole('listitem')
    .map((item) => item.textContent)

describe('Qualification chips', () => {
  it('renders nothing with fewer than 2 matches', async () => {
    searchFor([cookery])
    renderPage()
    await screen.findByRole('button', { name: /Cebu Skills Center/ })
    expect(chipGroup()).not.toBeInTheDocument()
  })

  it('renders nothing for a search chosen from the library', async () => {
    searchFor([cookery, welding], true)
    renderPage()
    await screen.findByRole('button', { name: /Cebu Skills Center/ })
    expect(chipGroup()).not.toBeInTheDocument()
  })

  it('toggles a chip and narrows the map', async () => {
    searchFor([cookery, welding])
    renderPage()
    const user = userEvent.setup()
    await screen.findByRole('button', { name: /Manila Welding Institute/ })
    const chip = within(chipGroup()!).getByRole('button', { name: 'Cookery NC II' })
    const before = listingRequests
    await user.click(chip)
    await screen.findByRole('region', { name: 'Compare' })
    expect(listingRequests).toBe(before)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    // Narrowing filters what is already loaded: the results and the comparison stay, with no loading in between.
    expect(screen.getByRole('region', { name: 'Compare' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Cebu Skills Center/ })).toBeInTheDocument()
    expect(pinNames()).toEqual(['Cebu Skills Center'])
    await user.click(chip)
    expect(pinNames()).toHaveLength(2)
  })

  it('disables a 4th pick with the hint', async () => {
    searchFor([cookery, welding, bread, eim])
    renderPage()
    const user = userEvent.setup()
    const group = await screen.findByRole('group', { name: 'Narrow it down (optional)' })
    for (const name of ['Cookery NC II', /Shielded Metal Arc/, /Bread and Pastry/]) {
      await user.click(within(group).getByRole('button', { name }))
    }
    expect(within(group).getByRole('button', { name: /Electrical Installation/ })).toBeDisabled()
    expect(screen.getByText('Compare up to 3')).toBeInTheDocument()
  })
})
