import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { Match } from '../finder/api.ts'
import type { Center, Program } from '../training/centers.ts'
import type { QualificationFit } from '../tsp/passport.ts'
import { ComparePanel } from './ComparePanel.tsx'
import type { Explore } from './useExplore.ts'

const match = (code: string, name: string): Match => ({
  qualification: { code, name, sector: 'Land Transport' },
  score: 80,
  reason: '',
})
const driving = match('DRV-NCII', 'Driving NC II')
const bus = match('DPB-NCIII', 'Driving (Passenger Bus) NC III')
const school = {
  id: 'training-1',
  kind: 'training',
  distanceKm: 4,
  programs: [
    {
      qualification: driving.qualification,
      duration_hours: 118,
      scholarship_open: true,
    } as unknown as Program,
  ],
  schedules: [],
  accredited: [],
} as unknown as Center

const fit = (next_step: QualificationFit['next_step'], score: number) =>
  ({
    score,
    next_step,
    coverage: { covered: ['a', 'b'], missing: ['c'], expired: [] },
  }) as unknown as QualificationFit

const explore = (over: Partial<Record<string, unknown>> = {}) =>
  ({
    search: { query: 'driver', result: { matches: [driving, bus] } },
    allMatches: [driving, bus],
    matches: [driving, bus],
    picked: ['DRV-NCII', 'DPB-NCIII'],
    centers: [school],
    rangeKm: 25,
    reference: { latitude: 14.6, longitude: 121, label: 'Manila', mine: false },
    fits: new Map(),
    catalog: [{ code: 'DRV-NCII', possible_jobs: ['Taxi driver', 'Delivery driver'] }],
    passport: null,
    passportStatus: 'none',
    learnerId: null,
    ...over,
  }) as unknown as Explore

const renderPanel = (value: Explore) =>
  render(
    <MemoryRouter>
      <ComparePanel explore={value} />
    </MemoryRouter>,
  )

const row = (label: string) => screen.getByRole('rowheader', { name: label }).closest('tr')!

describe('ComparePanel', () => {
  it('compares every match when nothing is picked', () => {
    renderPanel(explore({ picked: [] }))
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Driving NC II',
      'Driving (Passenger Bus) NC III',
    ])
  })

  it('shows nothing when the search matched only one qualification', () => {
    const { container } = renderPanel(
      explore({ picked: [], allMatches: [driving], matches: [driving] }),
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows nothing for a qualification chosen from the library', () => {
    const { container } = renderPanel(
      explore({
        picked: [],
        search: { query: 'Driving NC II', chosen: true, result: { matches: [driving, bus] } },
      }),
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('signed out: shows the facts and the sign-in line, with no fit rows', () => {
    renderPanel(explore())
    expect(screen.getByRole('columnheader', { name: 'Driving NC II' })).toBeInTheDocument()
    expect(within(row('Training hours')).getByText('118')).toBeInTheDocument()
    expect(
      within(row('Possible jobs')).getByText('Taxi driver, Delivery driver'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Sign in and add your Skill Passport/ }),
    ).toHaveAttribute('href', '/sign-in')
    expect(screen.queryByRole('rowheader', { name: 'Your fit' })).not.toBeInTheDocument()
  })

  it('with a passport: shows the fit score and next step per qualification', () => {
    renderPanel(
      explore({
        passport: { skills: [] },
        passportStatus: 'loaded',
        learnerId: 'l1',
        fits: new Map([
          ['DRV-NCII', fit('assessment', 82)],
          ['DPB-NCIII', fit('gap_training', 40)],
        ]),
      }),
    )
    const fitRow = row('Your fit')
    expect(within(fitRow).getByText('82 · Assess now')).toBeInTheDocument()
    expect(within(fitRow).getByText('40 · Gap training')).toBeInTheDocument()
    expect(within(row('CORE units you have')).getAllByText('2 of 3 units')).toHaveLength(2)
    expect(screen.queryByText(/Sign in and add/)).not.toBeInTheDocument()
  })

  it('says when nothing on the passport points to a qualification', () => {
    renderPanel(
      explore({
        passport: { skills: [] },
        passportStatus: 'loaded',
        learnerId: 'l1',
        fits: new Map([['DRV-NCII', null]]),
      }),
    )
    expect(
      within(row('Your fit')).getByText('Nothing on your passport points to this yet'),
    ).toBeInTheDocument()
    expect(within(row('Your fit')).getByText('Checking…')).toBeInTheDocument()
  })

  it('shows — for values nobody lists', () => {
    renderPanel(explore())
    const cells = within(row('Training hours')).getAllByRole('cell')
    expect(cells.map((cell) => cell.textContent)).toEqual(['118', '—'])
    expect(
      within(row('Scholarship'))
        .getAllByRole('cell')
        .map((c) => c.textContent),
    ).toEqual(['Yes', '—'])
  })

  it('renders a single column for one pick', () => {
    renderPanel(explore({ matches: [driving], picked: ['DRV-NCII'] }))
    // One picked of several: only it is compared.
    expect(screen.getAllByRole('columnheader')).toHaveLength(1)
  })
})
