import { describe, expect, it } from 'vitest'
import {
  deliveryLabel,
  kilometres,
  localTime,
  peso,
  programCost,
  scheduleFee,
  travelTime,
} from './format.ts'

describe('format', () => {
  it('labels an unknown delivery mode from imported listings', () => {
    expect(deliveryLabel('unknown')).toBe('Delivery mode not provided')
  })
  it('writes distances and money', () => {
    expect(kilometres(105.94)).toBe('105.9 km')
    expect(kilometres(1234)).toBe('1,234.0 km')
    expect(peso('1500')).toBe('₱1,500.00')
  })

  it('writes travel times as a learner reads them', () => {
    expect(travelTime(0.2)).toBe('1 min')
    expect(travelTime(25)).toBe('25 min')
    expect(travelTime(60)).toBe('1 hr')
    expect(travelTime(125)).toBe('2 hr 5 min')
  })

  it('writes times in Philippine time', () => {
    // 01:00 UTC is 09:00 in Manila.
    expect(localTime('2026-10-15T01:00:00Z')).toBe('Thu, Oct 15 · 9:00 AM')
    // 16:30 UTC on Oct 6 is already Oct 7 in Manila.
    expect(localTime('2026-10-06T16:30:00Z')).toBe('Wed, Oct 7 · 12:30 AM')
  })

  it('says a recorded zero is free, and an unknown amount isn’t provided (US-08)', () => {
    expect(programCost({ cost: '0.00' })).toBe('Free')
    expect(programCost({ cost: null })).toBe('Not provided')
    expect(programCost({ cost: '8500' })).toBe('₱8,500.00')
    expect(scheduleFee({ fee: '0' })).toBe('No fee')
    expect(scheduleFee({ fee: null })).toBe('Not provided')
    expect(scheduleFee({ fee: '500.00' })).toBe('₱500.00 fee')
  })
})
