import { describe, expect, it } from 'vitest'
import type { Center, Program, Schedule } from '../training/centers.ts'
import { recommend, recommendedIds, supplyCenters } from './recommend.ts'

const CODE = 'PLUMBING'

const center = (
  id: string,
  regionCode: string,
  distanceKm: number | null,
  codes: string[] = [CODE],
): Center => {
  const kind = id.startsWith('training') ? 'training' : 'assessment'
  return {
    id,
    kind,
    name: id,
    regionCode,
    distanceKm,
    programs:
      kind === 'training' ? codes.map((code) => ({ qualification: { code } }) as Program) : [],
    schedules:
      kind === 'assessment' ? codes.map((code) => ({ qualification: { code } }) as Schedule) : [],
  } as unknown as Center
}

const pick = (supply: Center[], relocate = false, alternatives: string[] = []) =>
  recommend({ supply, homeRegion: 'NCR', relocate, alternatives })

describe('supplyCenters', () => {
  const centers = [
    center('training-1', 'NCR', 2),
    center('training-2', 'NCR', 4, ['COOKERY']),
    // The registry accredits it for the qualification, though it publishes no schedule.
    center('assessment-7', 'NCR', 5, []),
    center('assessment-8', 'NCR', 6, []),
  ]

  it('keeps the centers the listings name and the sites the outlook counts', () => {
    const outlook = { training_site_ids: [], assessment_site_ids: [7] }
    expect(supplyCenters(centers, CODE, outlook).map((item) => item.id)).toEqual([
      'training-1',
      'assessment-7',
    ])
  })

  it('falls back to the listings alone while the outlook is loading', () => {
    expect(supplyCenters(centers, CODE, undefined).map((item) => item.id)).toEqual(['training-1'])
  })
})

describe('recommend', () => {
  it('picks the nearest center of each kind and says how near it is', () => {
    const result = pick([
      center('training-far', 'NCR', 30),
      center('training-near', 'NCR', 3),
      center('assessment-region', 'NCR', 40),
      center('assessment-farther', 'III', 60),
    ])
    expect(result.training).toMatchObject({ center: { id: 'training-near' }, reason: 'near' })
    expect(result.assessment).toMatchObject({
      center: { id: 'assessment-region' },
      reason: 'region',
    })
    expect(result.relocation).toEqual([])
  })

  it('still names the nearest center when it is in another region', () => {
    const result = pick([center('training-cebu', 'VII', 570)])
    expect(result.training).toMatchObject({ center: { id: 'training-cebu' }, reason: 'elsewhere' })
    expect(result.assessment).toBeNull()
  })

  it('recommends nothing personal without a place to measure from', () => {
    const result = pick([center('training-1', 'NCR', null), center('assessment-1', 'NCR', null)])
    expect(result).toEqual({ training: null, assessment: null, relocation: [] })
  })

  it('adds a center in each stronger region only for a learner open to relocating', () => {
    const supply = [
      center('training-home', 'NCR', 3),
      center('assessment-cebu', 'VII', 572),
      center('training-cebu', 'VII', 575),
      center('assessment-davao', 'XI', 960),
      center('training-iloilo', 'VI', 450),
    ]
    expect(pick(supply, false, ['VII', 'XI', 'VI']).relocation).toEqual([])

    const moving = pick(supply, true, ['VII', 'XI', 'VI'])
    // A training center where the region has one, and no more than two regions.
    expect(moving.relocation.map((item) => [item.center.id, item.reason])).toEqual([
      ['training-cebu', 'relocation'],
      ['assessment-davao', 'relocation'],
    ])
    expect(recommendedIds(moving)).toEqual([
      'training-home',
      'assessment-cebu',
      'training-cebu',
      'assessment-davao',
    ])
  })

  it('does not repeat a center it already recommends, or the learner’s own region', () => {
    const supply = [center('training-cebu', 'VII', 570), center('training-home', 'NCR', 900)]
    const moving = pick(supply, true, ['NCR', 'VII'])
    expect(moving.training?.center.id).toBe('training-cebu')
    expect(moving.relocation).toEqual([])
  })
})
