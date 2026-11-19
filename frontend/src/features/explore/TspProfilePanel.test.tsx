import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Passport } from '../tsp/passport.ts'
import { TspProfilePanel } from './Panels.tsx'
import type { Explore } from './useExplore.ts'

// US-0004: "From your TSP profile" on the Career Map, for the synthetic Kuya Manuel account.
const manuel: Passport = {
  skills: ['Driving', 'Cooking'],
  experience: ['Jeepney driver'],
  education: ['High School graduate'],
  qualifications: [],
  credentials: [],
  licenses: ["LTO Professional Driver's License"],
  municipality: 'Caloocan City',
  province: 'Metro Manila',
  region_code: 'NCR',
  sample: true,
}

const explore = (passportStatus: Explore['passportStatus'], passport?: Passport | null) =>
  ({ passportStatus, passport }) as unknown as Explore

describe('TspProfilePanel', () => {
  it('shows the skills, license and home area, with no sample label', () => {
    render(<TspProfilePanel explore={explore('loaded', manuel)} />)
    expect(screen.getByRole('heading', { name: 'From your TSP profile' })).toBeInTheDocument()
    expect(screen.getByText('Driving, Cooking')).toBeInTheDocument()
    expect(screen.getByText("LTO Professional Driver's License")).toBeInTheDocument()
    expect(screen.getByText('Caloocan City, Metro Manila')).toBeInTheDocument()
    expect(screen.queryByText('Sample data')).not.toBeInTheDocument()
  })

  it('says when a section is empty', () => {
    render(
      <TspProfilePanel explore={explore('loaded', { ...manuel, licenses: [], sample: false })} />,
    )
    expect(screen.queryByText('Sample data')).not.toBeInTheDocument()
    expect(screen.getByText('None listed')).toBeInTheDocument()
  })

  it('says when the profile could not be loaded, pointing to the place box', () => {
    render(<TspProfilePanel explore={explore('failed')} />)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'We couldn’t load your TSP profile. Type a city or province below to continue.',
    )
  })

  it('shows nothing for a guest or an account without a Skill Passport', () => {
    const { container } = render(<TspProfilePanel explore={explore('none', null)} />)
    expect(container).toBeEmptyDOMElement()
  })
})
