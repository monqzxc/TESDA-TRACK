import { describe, expect, it } from 'vitest'
import { jobIcon, placeParts, readable, tier } from './jobDisplay.ts'

describe('job display', () => {
  it('reads capitals as names and keeps acronyms', () => {
    expect(readable('CALL CENTER AGENT')).toBe('Call Center Agent')
    expect(readable('CITY OF SAN FERNANDO (CAPITAL)')).toBe('City of San Fernando (Capital)')
    expect(readable('IT SUPPORT')).toBe('IT Support')
    expect(readable('CNC MACHINIST')).toBe('CNC Machinist')
  })

  it('splits a place from its province', () => {
    expect(placeParts('ANGELES CITY, PAMPANGA')).toEqual({
      place: 'Angeles City',
      province: 'Pampanga',
    })
    expect(placeParts('MARILAO')).toEqual({ place: 'Marilao', province: null })
  })

  it('picks an icon from the title and falls back to a briefcase', () => {
    expect(jobIcon('CALL CENTER AGENT')).toBe('phone')
    expect(jobIcon('JANITOR')).toBe('home')
    expect(jobIcon('ASTRONAUT')).toBe('briefcase')
  })

  it('tiers a count against the busiest job', () => {
    expect(tier(10, 10)).toBe('high')
    expect(tier(5, 10)).toBe('mid')
    expect(tier(2, 10)).toBe('low')
  })
})
