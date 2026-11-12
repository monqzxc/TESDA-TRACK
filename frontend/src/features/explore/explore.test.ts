import { describe, expect, it } from 'vitest'
import type { Match } from '../finder/api.ts'
import type { Center, Program, Schedule } from '../training/centers.ts'
import { cardsFor, estimateMinutes, firstKind, nearestRegion, strength } from './explore.ts'

const match = (code: string, score: number) =>
  ({ qualification: { code, name: code }, score, reason: 'Matched your words' }) as unknown as Match

const center = (
  id: string,
  kind: Center['kind'],
  codes: string[],
  distanceKm: number | null,
): Center =>
  ({
    id,
    kind,
    name: id,
    distanceKm,
    programs:
      kind === 'training'
        ? codes.map(
            (code) => ({ qualification: { code }, scholarship_available: false }) as Program,
          )
        : [],
    schedules:
      kind === 'assessment' ? codes.map((code) => ({ qualification: { code } }) as Schedule) : [],
  }) as unknown as Center

describe('estimateMinutes', () => {
  it('estimates by car from distance, at least a minute', () => {
    expect(estimateMinutes(10)).toBe(28)
    expect(estimateMinutes(0.1)).toBe(1)
  })

  it('gives no time beyond 100 km or without a distance', () => {
    expect(estimateMinutes(100)).not.toBeNull()
    expect(estimateMinutes(100.1)).toBeNull()
    expect(estimateMinutes(null)).toBeNull()
  })
})

describe('strength', () => {
  it('is strong from a score of 60', () => {
    expect(strength({ score: 60 })).toBe('strong')
    expect(strength({ score: 59 })).toBe('good')
  })
})

describe('firstKind', () => {
  it('puts training first for someone who wants to learn', () => {
    expect(firstKind('Gusto kong matuto magluto')).toBe('training')
    expect(firstKind('I want to become a welder')).toBe('training')
  })

  it('puts assessment first for a skill the learner has', () => {
    expect(firstKind('Marunong ako magluto')).toBe('assessment')
  })
})

describe('cardsFor', () => {
  const centers = [
    center('training-1', 'training', ['COOKERY'], 3),
    center('assessment-1', 'assessment', ['COOKERY'], 40),
    center('training-2', 'training', ['COOKERY', 'FBS'], 30),
  ]

  it('gives each matched qualification its centers of one kind, counting the near ones', () => {
    const cards = cardsFor('training', [match('COOKERY', 91), match('FBS', 40)], centers)
    expect(
      cards.map((card) => [card.match.qualification.code, card.centers.length, card.near]),
    ).toEqual([
      ['COOKERY', 2, 1],
      ['FBS', 1, 0],
    ])
    expect(cards.map((card) => card.strength)).toEqual(['strong', 'good'])
  })

  it('leaves out a qualification no center of that kind lists', () => {
    expect(cardsFor('assessment', [match('FBS', 40)], centers)).toEqual([])
  })
})

describe('nearestRegion', () => {
  const regions = [
    { code: 'NCR', latitude: 14.6, longitude: 121.0 },
    { code: 'VII', latitude: 10.3, longitude: 123.9 },
  ] as unknown as Parameters<typeof nearestRegion>[1]

  it('is the region whose center is nearest, or none without a point', () => {
    expect(nearestRegion({ latitude: 10.5, longitude: 124 }, regions)?.code).toBe('VII')
    expect(nearestRegion(null, regions)).toBeNull()
  })
})
