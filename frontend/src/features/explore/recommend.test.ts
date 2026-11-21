import { describe, expect, it } from 'vitest'
import type { Center, Program, Schedule } from '../training/centers.ts'
import type { Outlook } from './outlookApi.ts'
import {
  highDemandRegions,
  rankCenters,
  recommend,
  recommendedIds,
  serviceScore,
  supplyCenters,
  type ServiceScores,
} from './recommend.ts'

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
    accredited: [],
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

  it('leaves a center without coordinates out of the recommendations (US-0014)', () => {
    const unlocated = { ...center('training-cebu', 'VII', null), latitude: null, longitude: null }
    const located = center('assessment-cebu', 'VII', 572)
    const home = [center('training-home', 'NCR', 3), center('assessment-home', 'NCR', 4)]
    const moving = pick([...home, unlocated, located], true, ['VII'])
    expect(moving.relocation.map((item) => item.center.id)).toEqual(['assessment-cebu'])
  })

  it('does not repeat a center it already recommends, or the learner’s own region', () => {
    const supply = [center('training-cebu', 'VII', 570), center('training-home', 'NCR', 900)]
    const moving = pick(supply, true, ['NCR', 'VII'])
    expect(moving.training?.center.id).toBe('training-cebu')
    expect(moving.relocation).toEqual([])
  })
})

describe('rankCenters (recommended centers with reasons)', () => {
  // A training center with a program for CODE, its scholarship open or not.
  const training = (id: string, km: number, scholarship = false, regionCode = 'NCR') =>
    ({
      ...center(`training-${id}`, regionCode, km),
      programs: [{ qualification: { code: CODE }, scholarship_open: scholarship } as Program],
    }) as Center
  const ids = (items: { center: Center }[]) => items.map((item) => item.center.id)

  it('ranks shorter trips first and says the first is the shortest', () => {
    const ranked = rankCenters({
      supply: [training('far', 18), training('near', 4), training('mid', 9)],
      code: CODE,
    })
    expect(ids(ranked)).toEqual(['training-near', 'training-mid', 'training-far'])
    expect(ranked[0]).toMatchObject({ reason: 'nearest', scholarship: false, demand: false })
    expect(ranked[0].minutes).toBeGreaterThan(0)
    expect(ranked[1].reason).toBe('inRange')
  })

  it('moves a center with an open scholarship above one with a similar trip', () => {
    const ranked = rankCenters({
      supply: [training('plain', 10), training('funded', 11.5, true)],
      code: CODE,
    })
    expect(ids(ranked)).toEqual(['training-funded', 'training-plain'])
    expect(ranked[0]).toMatchObject({ reason: 'scholarship', scholarship: true })
  })

  it('moves a center in a high-demand region above one with a similar trip', () => {
    const ranked = rankCenters({
      supply: [training('plain', 10, false, 'NCR'), training('wanted', 10.8, false, 'IV-A')],
      code: CODE,
      demandRegions: new Set(['IV-A']),
    })
    expect(ids(ranked)).toEqual(['training-wanted', 'training-plain'])
    expect(ranked[0]).toMatchObject({ reason: 'demand', demand: true })
  })

  it('keeps a much shorter trip first, scholarship or not', () => {
    const ranked = rankCenters({
      supply: [training('near', 3), training('funded', 20, true)],
      code: CODE,
    })
    expect(ids(ranked)).toEqual(['training-near', 'training-funded'])
  })

  it('moves assessment up when the Skill Passport suggests the learner may be ready', () => {
    const supply = [training('t', 8), center('assessment-a', 'NCR', 9)]
    expect(ids(rankCenters({ supply, code: CODE }))).toEqual(['training-t', 'assessment-a'])
    const ranked = rankCenters({ supply, code: CODE, ready: true })
    expect(ids(ranked)).toEqual(['assessment-a', 'training-t'])
    expect(ranked[0]).toMatchObject({ reason: 'ready', ready: true })
  })

  it('lists only centers within range, and the nearest few when none is', () => {
    const supply = [training('a', 30), training('b', 60), training('c', 90), training('d', 120)]
    expect(ids(rankCenters({ supply: [training('in', 5), ...supply], code: CODE }))).toEqual([
      'training-in',
    ])
    const outside = rankCenters({ supply, code: CODE, rangeKm: 10 })
    expect(ids(outside)).toEqual(['training-a', 'training-b', 'training-c'])
    expect(outside.every((item) => item.reason === 'outside')).toBe(true)
  })

  it('ranks nothing without a location', () => {
    expect(rankCenters({ supply: [center('training-1', 'NCR', null)], code: CODE })).toEqual([])
  })

  it('gives the brief and the map the same top pick as the list', () => {
    const supply = [training('plain', 10), training('funded', 11.5, true)]
    const result = recommend({
      supply,
      homeRegion: 'NCR',
      relocate: false,
      alternatives: [],
      code: CODE,
    })
    expect(result.training?.center.id).toBe('training-funded')
  })
})

describe('highDemandRegions', () => {
  const area = (region_code: string, demand_share: number | null, limited = false) =>
    ({ region_code, demand_share, limited }) as Outlook['areas'][number]

  it('marks regions with 1.5 times an even share of the records or more, when not a rough signal', () => {
    const areas = [area('NCR', 0.5), area('III', 0.3), area('VII', 0.2), area('X', 0)]
    // Four regions: an even share is 0.25, so 0.375 or more is high.
    expect([...highDemandRegions({ areas })]).toEqual(['NCR'])
    expect([...highDemandRegions({ areas: [area('NCR', 0.9, true), area('III', 0.1)] })]).toEqual(
      [],
    )
    expect(highDemandRegions(undefined).size).toBe(0)
  })
})

describe("rankCenters with the server's service scores (Day 5)", () => {
  // The server's default weights (config.RankingWeights).
  const WEIGHTS = {
    semantic: 0.45,
    proximity: 0.18,
    assessment: 0.135,
    schedule: 0.09,
    preference: 0.045,
    demand: 0.1,
  }
  // Asked for without a location, so the server marks proximity not_applicable.
  const entry = (components: Partial<Record<string, number>>, explanation: string[] = []) => ({
    components: {
      semantic: 0,
      proximity: 0,
      assessment: 0,
      schedule: 0,
      preference: 0,
      demand: 0,
      ...components,
    },
    status: {
      semantic: 'not_applicable',
      proximity: 'not_applicable',
      assessment: 'observed',
      schedule: 'observed',
      preference: 'not_applicable',
      demand: 'observed',
    },
    explanation,
  })
  const program = (id: number) => ({ id, qualification: { code: CODE } }) as Program
  const training = (id: string, km: number, programId: number) =>
    ({ ...center(`training-${id}`, 'NCR', km), programs: [program(programId)] }) as Center
  const scores = (
    byProgram: [number, ReturnType<typeof entry>][],
    unconfirmed: [number, string[]][] = [],
  ): ServiceScores => ({
    weights: WEIGHTS,
    byProgram: new Map(byProgram),
    unconfirmed: new Map(unconfirmed),
  })
  const ids = (items: { center: Center }[]) => items.map((item) => item.center.id)

  it("adds proximity in the browser with the server's weight and formula", () => {
    // Measured: assessment, schedule, demand (0.325) and proximity (0.18): 0.505 in all.
    const full = entry({ assessment: 1, schedule: 1, demand: 0.5 })
    // 10 km: proximity 0.9. (0.18*0.9 + 0.135 + 0.09 + 0.1*0.5) / 0.505 = 0.865
    expect(serviceScore(full, WEIGHTS, 10)).toBe(87)
    // Without a distance, proximity is left out, not counted as zero.
    expect(serviceScore(full, WEIGHTS, null)).toBe(Math.round((100 * 0.275) / 0.325))
  })

  it("lets a better service beat a slightly shorter trip, and says the server's reasons", () => {
    const ranked = rankCenters({
      supply: [training('near', 4, 1), training('better', 9, 2)],
      code: CODE,
      scores: scores([
        [1, entry({ schedule: 0 }, ['Start date not confirmed'])],
        [
          2,
          entry({ assessment: 1, schedule: 1, demand: 1 }, [
            'An assessment with open seats is available nearby',
          ]),
        ],
      ]),
    })
    expect(ids(ranked)).toEqual(['training-better', 'training-near'])
    expect(ranked[0]).toMatchObject({
      reason: 'service',
      why: ['An assessment with open seats is available nearby'],
    })
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score as number)
  })

  it('leaves out a center the server excluded, and puts unconfirmed ones after the scored', () => {
    const ranked = rankCenters({
      supply: [training('excluded', 2, 1), training('unsure', 3, 2), training('ok', 20, 3)],
      code: CODE,
      scores: scores(
        [[3, entry({ schedule: 1 })]],
        [[2, ['Provider authority requires verification.']]],
      ),
    })
    expect(ids(ranked)).toEqual(['training-ok', 'training-unsure'])
    expect(ranked[1]).toMatchObject({
      reason: 'unconfirmed',
      why: ['Provider authority requires verification.'],
    })
  })

  it('still ranks assessment centers by trip, first when the learner may be ready', () => {
    const supply = [
      training('t', 8, 1),
      center('assessment-a', 'NCR', 9),
      center('assessment-b', 'NCR', 3),
    ]
    const withScores = scores([[1, entry({ schedule: 1 })]])
    expect(ids(rankCenters({ supply, code: CODE, scores: withScores }))).toEqual([
      'training-t',
      'assessment-b',
      'assessment-a',
    ])
    expect(ids(rankCenters({ supply, code: CODE, scores: withScores, ready: true }))).toEqual([
      'assessment-b',
      'training-t',
      'assessment-a',
    ])
  })

  it('gives the brief and the map the same top training pick as the list', () => {
    const supply = [training('near', 4, 1), training('better', 9, 2)]
    const withScores = scores([
      [1, entry({})],
      [2, entry({ assessment: 1, schedule: 1 })],
    ])
    const result = recommend({
      supply,
      homeRegion: 'NCR',
      relocate: false,
      alternatives: [],
      code: CODE,
      scores: withScores,
    })
    expect(result.training?.center.id).toBe('training-better')
  })
})
