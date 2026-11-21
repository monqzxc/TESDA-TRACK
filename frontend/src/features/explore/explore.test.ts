import { describe, expect, it } from 'vitest'
import type { Match } from '../finder/api.ts'
import type { Center, Program, Schedule } from '../training/centers.ts'
import {
  anyOutOfRange,
  anyScholarship,
  cardsFor,
  estimateMinutes,
  firstKind,
  hasScholarship,
  inRangeOr,
  nearestRegion,
  readinessEvidence,
  qualificationFamily,
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
                scholarship_open: false,
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

describe('inRangeOr', () => {
  it('keeps the centers within range, in order, or all of them when none is', () => {
    const centers = [
      center('a', 'training', [], 3),
      center('b', 'training', [], 8),
      center('c', 'training', [], 40),
      center('d', 'training', [], null),
    ]
    expect(inRangeOr(centers, 10).map((c) => c.id)).toEqual(['a', 'b'])
    expect(inRangeOr(centers, 5).map((c) => c.id)).toEqual(['a'])
    expect(inRangeOr(centers.slice(2), 10).map((c) => c.id)).toEqual(['c', 'd'])
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

  it('names an accreditation from the catalog, and stays within range', () => {
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
        rangeKm: 0.5,
      }),
    ).toBeNull()
  })

  it('falls back to a center of the other kind when none of its own kind lists a related one', () => {
    // Within 3 km only the assessment center, 1 km away, lists a welding qualification.
    const related = relatedWithin({
      kind: 'training',
      match: welding,
      matches: [welding],
      nearby,
      catalog,
      rangeKm: 3,
    })
    expect([related?.qualification.code, related?.center.id]).toEqual(['FCAW', 'assessor'])
  })

  // BUG-16: Tagum, "Gusto kong maging driver ng truck". Nothing for Driving (Articulated Vehicle) NC III within
  // 25 km, but an assessment center 3.7 km away is accredited for Driving NC II.
  describe('another level of the same qualification', () => {
    const transport = 'Automotive and Land Transportation'
    const articulated = {
      qualification: {
        code: 'DRIVING-NC-III',
        name: 'Driving (Articulated Vehicle) NC III',
        sector: transport,
      },
      score: 68,
      reason: 'Similar in meaning to your goal.',
    } as unknown as Match
    const bus = {
      qualification: {
        code: 'DRIVING-NC-III-2',
        name: 'Driving (Passenger Bus/Straight Truck) NC III',
        sector: transport,
      },
      score: 44,
      reason: 'Similar in meaning to your goal.',
    } as unknown as Match
    const drivingCatalog = [
      { code: 'DRIVING-NC-II', name: 'Driving NC II', sector: transport },
      { code: 'AUTO-NC-I', name: 'Automotive Servicing NC I', sector: transport },
    ]
    const tagum = [
      center('auto-shop', 'training', ['AUTO-NC-I'], 2, [], transport),
      center('magugpo', 'assessment', [], 3.7, ['DRIVING-NC-II']),
    ]

    it('reads a family from the name, without level or variant', () => {
      expect(qualificationFamily('Driving (Articulated Vehicle) NC III')).toBe('driving')
      expect(qualificationFamily('Driving NC II')).toBe('driving')
      expect(qualificationFamily('Bread and Pastry Production NC II')).toBe(
        'bread and pastry production',
      )
    })

    it('suggests Driving NC II at the nearby assessment center over a closer same-sector course', () => {
      const related = relatedWithin({
        kind: 'training',
        match: articulated,
        matches: [articulated, bus],
        nearby: tagum,
        catalog: drivingCatalog,
        rangeKm: 25,
      })
      expect(related?.qualification).toEqual({ code: 'DRIVING-NC-II', name: 'Driving NC II' })
      expect(related?.center.id).toBe('magugpo')
    })

    it('prefers the family at a center of the card’s own kind', () => {
      const school = center('school', 'training', ['DRIVING-NC-II'], 12, [], transport)
      school.programs[0].qualification.name = 'Driving NC II'
      const related = relatedWithin({
        kind: 'training',
        match: articulated,
        matches: [articulated],
        nearby: [...tagum, school],
        catalog: drivingCatalog,
        rangeKm: 25,
      })
      expect(related?.center.id).toBe('school')
    })
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

describe('hasScholarship', () => {
  const withPrograms = (programs: Partial<Program>[]) =>
    ({ kind: 'training', programs, schedules: [] }) as unknown as Center
  const program = (code: string, open: boolean, sample: boolean) => ({
    qualification: { code } as Program['qualification'],
    scholarship_available: true,
    scholarship_open: open,
    scholarship_is_sample: sample,
  })

  it('counts only a scholarship still open for the qualification (US-0019)', () => {
    expect(hasScholarship(withPrograms([program('A', true, false)]), 'A')).toBe(true)
    expect(hasScholarship(withPrograms([program('A', false, false)]), 'A')).toBe(false)
    expect(hasScholarship(withPrograms([program('B', true, false)]), 'A')).toBe(false)
  })

  it('labels a training center with any open scholarship, for the Scholarships filter', () => {
    expect(
      anyScholarship(withPrograms([program('A', false, false), program('B', true, false)])),
    ).toBe(true)
    expect(anyScholarship(withPrograms([program('A', false, false)]))).toBe(false)
    const assessment = { kind: 'assessment', programs: [program('A', true, false)], schedules: [] }
    expect(anyScholarship(assessment as unknown as Center)).toBe(false)
  })
})

describe('readinessEvidence (US-0004)', () => {
  const manuel = {
    skills: ['Driving', 'Cooking'],
    licenses: ["LTO Professional Driver's License"],
  }

  it('finds the skills and licenses that name the trade', () => {
    expect(readinessEvidence(manuel, 'Driving NC II')).toEqual([
      'Driving',
      "LTO Professional Driver's License",
    ])
    expect(readinessEvidence(manuel, 'Cookery NC II')).toEqual(['Cooking'])
  })

  it('finds nothing for an unrelated trade, a bare license word or no passport', () => {
    expect(readinessEvidence(manuel, 'Shielded Metal Arc Welding (SMAW) NC I')).toEqual([])
    expect(
      readinessEvidence({ skills: [], licenses: ['PRC License'] }, 'Pharmacy Services NC III'),
    ).toEqual([])
    expect(readinessEvidence(null, 'Driving NC II')).toEqual([])
  })
})
