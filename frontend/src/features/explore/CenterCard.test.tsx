import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithQuery } from '../../test/query.tsx'
import { server } from '../../test/server.ts'
import {
  cebuCenter,
  cookeryProgram,
  manilaInstitute,
  REGIONS,
  weldingProgram,
} from '../../test/training.ts'
import type { CenterMapProps } from '../training/CenterMapTypes.ts'
import type { Program } from '../training/centers.ts'
import { useTrainingStore } from '../training/state.ts'
import ExplorePage from './ExplorePage.tsx'
import { useDemandStore, useExploreStore } from './useExplore.ts'

// Card 2: a center's details on the Explore map, for "I want to learn how to cook". Only listings a learner may
// see reach the map, the results and the card alike.
vi.mock('../training/CenterMap.tsx', () => ({
  default: (props: CenterMapProps) => (
    <ul data-testid="map">
      {props.centers.map((center) => (
        <li key={center.id}>{center.name}</li>
      ))}
    </ul>
  ),
}))

const at = (provider: typeof cebuCenter) => ({
  id: provider.id,
  name: provider.name,
  region_code: provider.region_code,
  city: provider.city,
  latitude: provider.latitude,
  longitude: provider.longitude,
})
const bread: Program = {
  ...cookeryProgram,
  id: 31,
  title: 'Bread and Pastry Production NC II',
  qualification: { code: 'BPP-NCII', name: 'Bread and Pastry Production NC II', sector: 'Tourism' },
  availability: { ...cookeryProgram.availability!, status: 'unavailable' },
}
const lapsedWelding: Program = {
  ...weldingProgram,
  id: 32,
  provider: at(cebuCenter),
  qualification: {
    code: 'EIM-NCII',
    name: 'Electrical Installation and Maintenance NC II',
    sector: 'Construction',
  },
  verification: { ...weldingProgram.verification!, status: 'expired' },
}
const cebuWelding: Program = { ...weldingProgram, id: 33, provider: at(cebuCenter) }
// Manila's only cookery batch has ended, so Manila isn't a cookery center.
const endedCookery: Program = {
  ...cookeryProgram,
  id: 34,
  provider: at(manilaInstitute),
  end_date: '2020-01-31',
}

beforeEach(() => {
  useExploreStore.getState().setSearch({
    query: 'I want to learn how to cook',
    result: {
      profile: { intent: 'training_recommendation' },
      matches: [
        {
          qualification: cookeryProgram.qualification,
          score: 90,
          reason: 'Matched cook',
        },
      ],
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
    useLocation: false,
    location: null,
    locating: false,
    placeText: '',
    locationError: null,
    routeTo: null,
  })
  const programs = [cookeryProgram, bread, lapsedWelding, cebuWelding, endedCookery]
  server.use(
    http.get('*/api/v1/regions', () => HttpResponse.json(REGIONS)),
    http.get('*/api/v1/qualifications', () => HttpResponse.json([])),
    http.get('*/api/v1/training-providers', () =>
      HttpResponse.json([manilaInstitute, { ...cebuCenter, website: '  ', contact_email: null }]),
    ),
    http.get('*/api/v1/training-programs', ({ request }) => {
      const query = new URL(request.url).searchParams
      const code = query.get('qualification_code')
      const provider = query.get('provider_id')
      return HttpResponse.json(
        programs.filter(
          (p) =>
            (!code || p.qualification.code === code) &&
            (!provider || String(p.provider.id) === provider),
        ),
      )
    }),
  )
})

describe('Explore center details', () => {
  it('lists only verified-or-unreviewed current offerings, and the card agrees with the results', async () => {
    renderWithQuery(
      <MemoryRouter initialEntries={['/explore']}>
        <ExplorePage />
      </MemoryRouter>,
    )
    const user = userEvent.setup()
    const row = await screen.findByRole('button', { name: /Cebu Skills Center/ })
    // Manila's cookery batch is over: it isn't offered as a cookery center.
    expect(
      screen.queryByRole('button', { name: /Manila Welding Institute/ }),
    ).not.toBeInTheDocument()
    await user.click(row)

    const card = (await screen.findByRole('heading', { name: 'Cebu Skills Center' })).closest(
      'article',
    )!
    const offered = within(card).getByText('Qualifications offered').parentElement!.parentElement!
    expect(within(offered).getByText('Cookery NC II')).toBeInTheDocument()
    expect(within(offered).getByRole('img', { name: 'Matches your search' })).toBeInTheDocument()
    // Not matched, but offered: listed after the match.
    expect(within(offered).getByText(weldingProgram.qualification.name)).toBeInTheDocument()
    // Unavailable and lapsed services never appear.
    expect(within(card).queryByText(/Bread and Pastry/)).not.toBeInTheDocument()
    expect(within(card).queryByText(/Electrical Installation/)).not.toBeInTheDocument()

    expect(within(card).getByText(cebuCenter.address!)).toBeInTheDocument()
    // The phone is on file; the email isn't, and the website is blank: neither is drawn.
    expect(within(card).getByRole('link', { name: /Call/ })).toHaveAttribute(
      'href',
      `tel:${cebuCenter.contact_phone}`,
    )
    expect(within(card).queryByRole('link', { name: /Email/ })).not.toBeInTheDocument()
    expect(within(card).queryByRole('link', { name: /Website/ })).not.toBeInTheDocument()
  })
})
