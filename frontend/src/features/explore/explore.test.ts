import { describe, expect, it } from 'vitest'
import type { Match } from '../finder/api.ts'
import type { Center, Program, Schedule } from '../training/centers.ts'
import {
  anyOutOfRange,
  cardsFor,
  estimateMinutes,
  firstKind,
  nearestRegion,
  relatedWithin,
  strength,
} from './explore.ts'

const match = (code: string, score: number, sector = 'Tourism') =>
  ({
    qualification: { code, name: code, sector },
    score,
    reason: 'Matched your words',
  }) as unknown as Match

const center = (
  id: string,
  kind: Center['kind'],
  codes: string[],
  distanceKm: number | null,
  accredited: string[] = [],
  sector = 'Tourism',
): Center =>
  ({
    id,
    kind,
    name: id,
    distanceKm,
    accredited,
    programs:
      kind === 'training'
        ? codes.map(
            (code) =>
              ({
                qualification: { code, name: code, sector },
                scholarship_available: false,
              }) as Program,
          )
        : [],
    schedules:
      kind === 'assessment'
        ? codes.map((code) => ({ qualification: { code, name: code, sector } }) as Schedule)
        : [],
  }) as unknown as Center

describe('estimateMinutes', () => {
  it('estimates by car from distance, at least a minute', () => {
    expect(estimateMinutes(10)).toBe(28)
    expect(estimateMinutes(0.1)).toBe(1)
  })

  it('drives the rest of a long trip on highways', () => {
    // Makati to Baguio: 295 km of road, 35 km of it in town.
    expect(estimateMinutes(210.9)).toBe(330)
  })

  it('gives no time beyond 400 km, where a ferry or flight is likely, or without a distance', () => {
    expect(estimateMinutes(400)).not.toBeNull()
    expect(estimateMinutes(400.1)).toBeNull()
    expect(estimateMinutes(null)).toBeNull()
  })
})

describe('strength', () => {
  it('is strong from a score of 60', () => {
    expect(strength({ score: 60 })).toBe('strong')
    expect(strength({ score: 59 })).toBe('good')
  })

  it('is weaker at a score of 35 or less', () => {
    expect(strength({ score: 36 })).toBe('good')
    expect(strength({ score: 35 })).toBe('weak')
    expect(strength({ score: 20 })).toBe('weak')
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

  it('lists an assessment center the registry accredits for it, though it has no schedule', () => {
    // The registry has accreditations but no dates: without them the Assess tab was always empty.
    const accredited = [...centers, center('assessment-2', 'assessment', [], 5, ['FBS', 'COOKERY'])]
    const cards = cardsFor('assessment', [match('COOKERY', 91), match('FBS', 40)], accredited)
    expect(
      cards.map((card) => [
        card.match.qualification.code,
        card.centers.map((item) => item.id),
        card.near,
      ]),
    ).toEqual([
      ['COOKERY', ['assessment-1', 'assessment-2'], 1],
      ['FBS', ['assessment-2'], 1],
    ])
    expect(cardsFor('training', [match('FBS', 40)], [accredited[3]])).toEqual([])
  })
})

describe('cardsFor with a range', () => {
  it("counts the centers within the learner's range", () => {
    const centers = [center('t', 'training', ['COOKERY'], 40)]
    expect(cardsFor('training', [match('COOKERY', 90)], centers)[0].near).toBe(0)
    expect(cardsFor('training', [match('COOKERY', 90)], centers, 50)[0].near).toBe(1)
  })
})

describe('anyOutOfRange', () => {
  it('is true when a kind lists the qualification only beyond range, though the other kind is near', () => {
    const centers = [
      center('far-training', 'training', ['MMAW'], 210.9),
      center('near-assessment', 'assessment', ['MMAW'], 3),
    ]
    expect(anyOutOfRange([match('MMAW', 50)], centers, 25)).toBe(true)
    expect(anyOutOfRange([match('MMAW', 50)], centers, 250)).toBe(false)
  })

  it('is false without distances', () => {
    expect(anyOutOfRange([match('MMAW', 50)], [center('t', 'training', ['MMAW'], null)], 25)).toBe(
      false,
    )
  })
})

describe('relatedWithin', () => {
  const welding = match('MMAW', 50, 'Metals and Engineering')
  const nearby = [
    center('cookery', 'training', ['COOKERY'], 2),
    center('gtaw', 'training', ['GTAW'], 8, [], 'Metals and Engineering'),
    center('gmaw', 'training', ['GMAW'], 4, [], 'Metals and Engineering'),
    center('assessor', 'assessment', [], 1, ['FCAW']),
  ]
  const catalog = [
    { code: 'FCAW', name: 'Flux-Cored Arc Welding', sector: 'Metals and Engineering' },
  ]

  it('suggests the nearest center listing a qualification in the same sector', () => {
    const related = relatedWithin({
      kind: 'training',
      match: welding,
      matches: [welding],
      nearby,
      catalog,
      rangeKm: 25,
    })
    expect([related?.qualification.code, related?.center.id]).toEqual(['GMAW', 'gmaw'])
  })

  it('prefers another qualification the search matched', () => {
    const related = relatedWithin({
      kind: 'training',
      match: welding,
      matches: [welding, match('GTAW', 40, 'Metals and Engineering')],
      nearby,
      catalog,
      rangeKm: 25,
    })
    expect(related?.center.id).toBe('gtaw')
  })

  it('names an accreditation from the catalog, and stays within range and kind', () => {
    const related = relatedWithin({
      kind: 'assessment',
      match: welding,
      matches: [welding],
      nearby,
      catalog,
      rangeKm: 25,
    })
    expect(related?.qualification).toEqual({ code: 'FCAW', name: 'Flux-Cored Arc Welding' })
    expect(
      relatedWithin({
        kind: 'training',
        match: welding,
        matches: [welding],
        nearby,
        catalog,
        rangeKm: 3,
      }),
    ).toBeNull()
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
