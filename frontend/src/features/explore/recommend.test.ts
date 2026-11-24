import { describe, expect, it } from 'vitest'
import type { Center, Program, Schedule } from '../training/centers.ts'
import type { Outlook } from './outlookApi.ts'
import {
  ASSESSMENT_BANDS_KM,
  ASSESSMENT_WEIGHTS,
  assessmentBand,
  assessmentScore,
  highDemandRegions,
  rankCenters,
  recommend,
  recommendedIds,
  regionalDemand,
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

  it('puts assessment first when the Skill Passport suggests the learner may be ready', () => {
    const supply = [training('t', 8), center('assessment-a', 'NCR', 9)]
    expect(ids(rankCenters({ supply, code: CODE }))).toEqual(['training-t', 'assessment-a'])
    const ranked = rankCenters({ supply, code: CODE, ready: true })
    expect(ids(ranked)).toEqual(['assessment-a', 'training-t'])
    // Ready is a tag now: the reason is still the assessment center's band and score.
    expect(ranked[0]).toMatchObject({ reason: 'assessment', ready: true })
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

  it('ranks assessment centers on their own, first when the learner may be ready', () => {
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

describe('rankCenters for assessment centers: distance bands, then the ranking rule', () => {
  const TODAY = '2026-11-24'
  const SOON = '2026-12-10T09:00:00+08:00'
  const LATER = '2027-03-01T09:00:00+08:00'
  type Seat = 'open' | 'later' | 'full'
  const schedule = (
    seat: Seat,
    extra: Partial<{ fee: string | null; verification: string; availability: string }> = {},
  ) =>
    ({
      status: 'open',
      qualification: { code: CODE },
      scheduled_at: seat === 'later' ? LATER : SOON,
      seats_left: seat === 'full' ? 0 : 4,
      fee: extra.fee ?? null,
      verification: { status: extra.verification ?? 'verified' },
      availability: { status: extra.availability ?? 'available' },
    }) as unknown as Schedule
  // An assessment center for CODE: open schedules as given, or accredited by the registry with none.
  const site = (
    id: string,
    km: number | null,
    schedules: Schedule[] = [],
    { regionCode = 'NCR', province = 'Metro Manila', accredited = !schedules.length } = {},
  ) =>
    ({
      ...center(`assessment-${id}`, regionCode, km, []),
      province,
      schedules,
      accredited: accredited ? [CODE] : [],
    }) as Center
  const rank = (supply: Center[], extra: Partial<Parameters<typeof rankCenters>[0]> = {}) =>
    rankCenters({ supply, code: CODE, today: TODAY, ...extra })
  const ids = (items: { center: Center }[]) => items.map((item) => item.center.id)

  it('exports the band limits and weights, the weights adding up to 1', () => {
    expect(ASSESSMENT_BANDS_KM).toEqual([10, 25, 60])
    const total = Object.values(ASSESSMENT_WEIGHTS).reduce((sum, weight) => sum + weight, 0)
    expect(total).toBeCloseTo(1)
    expect(ASSESSMENT_WEIGHTS).toEqual({
      schedule: 0.4,
      verification: 0.25,
      proximity: 0.15,
      demand: 0.15,
      fee: 0.05,
    })
  })

  it('puts 20 km in another province above 150 km in the learner’s own province', () => {
    const nextProvince = site('cavite', 20, [], { regionCode: 'IV-A', province: 'Cavite' })
    const ownProvince = site('home', 150, [schedule('open', { fee: '500' })])
    const ranked = rank([ownProvince, nextProvince])
    expect(ids(ranked)).toEqual(['assessment-cavite', 'assessment-home'])
    expect(ranked[0].assessment).toMatchObject({ band: 2, schedule: 'accredited' })
    expect(ranked[1].assessment).toMatchObject({ band: 4, schedule: 'open' })
    // The farther one scores higher: the band still wins.
    expect(ranked[1].score).toBeGreaterThan(ranked[0].score as number)
  })

  it('always ranks a nearer band first, whatever the scores', () => {
    const ranked = rank([
      site('within60', 45, [schedule('open')]),
      site('near', 18, [schedule('open')]),
      site('veryNear', 8, [schedule('full', { verification: 'unknown' })]),
      site('far1', 70, [schedule('open')]),
      site('far2', 80),
      site('far3', 90),
      site('far4', 95),
    ])
    expect(ranked.map((item) => [item.center.id, item.assessment?.band])).toEqual([
      ['assessment-veryNear', 1],
      ['assessment-near', 2],
      ['assessment-within60', 3],
      ['assessment-far1', 4],
      ['assessment-far2', 4],
    ])
    // Beyond 60 km and the range, only the nearest 3 are listed.
    const far = rank([site('far4', 95), site('far1', 70), site('far2', 80), site('far3', 90)])
    expect(ids(far)).toEqual(['assessment-far1', 'assessment-far2', 'assessment-far3'])
  })

  it('orders a band by the ranking rule: open with seats, later, accredited only, full', () => {
    const ranked = rank([
      site('accredited', 30),
      site('full', 31, [schedule('full')]),
      site('later', 35, [schedule('later')]),
      site('open', 39, [schedule('open')]),
    ])
    expect(ids(ranked)).toEqual([
      'assessment-open',
      'assessment-later',
      'assessment-accredited',
      'assessment-full',
    ])
    expect(ranked.map((item) => item.assessment?.schedule)).toEqual([
      'open',
      'later',
      'accredited',
      'full',
    ])
    expect(
      ranked.every((item) => item.reason === 'assessment' && item.assessment?.band === 3),
    ).toBe(true)
    expect(ranked[0].assessment?.strongest).toBe('schedule')
  })

  it('ranks a verified open schedule with seats above a slightly closer accredited-only center', () => {
    const ranked = rank([site('accredited', 12), site('open', 14, [schedule('open')])])
    expect(ids(ranked)).toEqual(['assessment-open', 'assessment-accredited'])
  })

  it('puts a center whose open schedules are all full last in its band, even verified and in demand', () => {
    const ranked = rank(
      [
        site('full', 11, [schedule('full', { fee: '100' })], { regionCode: 'IV-A' }),
        site('accredited', 24, [], { regionCode: 'III' }),
      ],
      {
        regionDemand: new Map([
          ['IV-A', 1],
          ['III', 0],
        ]),
      },
    )
    expect(ids(ranked)).toEqual(['assessment-accredited', 'assessment-full'])
  })

  it('scores schedule, verification, proximity, demand and fee by the table, leaving out what is missing', () => {
    // Open with seats, verified and available, 10 km (proximity 0.9), the busiest region, the lowest fee.
    const [best] = rank(
      [
        site('best', 10, [schedule('open', { fee: '500' })], { regionCode: 'IV-A' }),
        site('dear', 9, [schedule('open', { fee: '900', verification: 'unknown' })]),
      ],
      {
        regionDemand: new Map([
          ['IV-A', 1],
          ['NCR', 0.5],
        ]),
      },
    )
    expect(best.center.id).toBe('assessment-best')
    expect(best.assessment?.components).toEqual({
      schedule: 1,
      verification: 1,
      proximity: 0.9,
      demand: 1,
      fee: 1,
    })
    expect(best.score).toBe(Math.round(100 * (0.4 + 0.25 + 0.15 * 0.9 + 0.15 + 0.05)))
    // No open schedule: verification and fee are left out; no posting records: demand too.
    const [accredited] = rank([site('only', 20)])
    expect(accredited.assessment?.components).toEqual({ schedule: 0.3, proximity: 0.8 })
    expect(accredited.score).toBe(Math.round((100 * (0.4 * 0.3 + 0.15 * 0.8)) / 0.55))
    // Not yet reviewed counts half; unavailable or expired, nothing. A closed schedule doesn't count.
    const unknown = rank([site('u', 5, [schedule('open', { availability: 'unknown' })])])[0]
    expect(unknown.assessment?.components.verification).toBe(0.5)
    const expired = rank([site('x', 5, [schedule('open', { verification: 'expired' })])])[0]
    expect(expired.assessment?.components.verification).toBe(0)
    const closed = { ...schedule('open'), status: 'closed' } as Schedule
    expect(rank([site('c', 5, [closed], { accredited: true })])[0].assessment?.schedule).toBe(
      'accredited',
    )
  })

  it('moves the band 2 limit with the learner’s range', () => {
    expect(assessmentBand(18, 25)).toBe(2)
    expect(assessmentBand(18, 10)).toBe(3)
    expect(assessmentBand(40, 50)).toBe(2)
    // 10 km or less merges the first two bands; over 60 km leaves the third empty.
    expect(assessmentBand(8, 5)).toBe(1)
    expect(assessmentBand(80, 100)).toBe(2)
    expect(assessmentBand(101, 100)).toBe(4)
    const supply = [site('a', 18, [schedule('open')]), site('b', 40, [schedule('open')])]
    expect(rank(supply).map((item) => item.assessment?.band)).toEqual([2, 3])
    expect(rank(supply, { rangeKm: 10 }).map((item) => item.assessment?.band)).toEqual([3, 3])
    expect(rank(supply, { rangeKm: 50 }).map((item) => item.assessment?.band)).toEqual([2, 2])
  })

  it('breaks ties by the shorter distance, then by name', () => {
    // Same band, same rounded score.
    const ranked = rank([site('a', 12.4), site('b', 12), site('y', 12), site('x', 12)])
    expect(new Set(ranked.map((item) => item.score)).size).toBe(1)
    expect(ids(ranked)).toEqual(['assessment-b', 'assessment-x', 'assessment-y', 'assessment-a'])
  })

  it('names the strongest component, and says when there is no open schedule', () => {
    const [accredited] = rank([site('only', 3)])
    // Proximity (0.15 × 0.97) adds more than accreditation alone (0.4 × 0.3).
    expect(accredited.assessment).toMatchObject({ strongest: 'proximity', schedule: 'accredited' })
    const [none] = rank([site('none', 30, [], { accredited: false })])
    expect(none.assessment).toMatchObject({ schedule: 'none' })
    expect(assessmentScore({ schedule: 0, verification: 0.5 }).strongest).toBe('schedule')
  })

  it('ranks nothing without a location, and recommend() stars the top-ranked center', () => {
    expect(rank([site('a', null)])).toEqual([])
    const supply = [site('accredited', 4), site('open', 9, [schedule('open')])]
    const result = recommend({
      supply,
      homeRegion: 'NCR',
      relocate: false,
      alternatives: [],
      code: CODE,
      today: TODAY,
    })
    expect(result.assessment?.center.id).toBe(rank(supply)[0]?.center.id)
    expect(result.assessment?.center.id).toBe('assessment-open')
  })
})

describe('regionalDemand', () => {
  it("compares each region's posting records with the busiest region's", () => {
    const areas = [
      { region_code: 'NCR', posting_count: 40 },
      { region_code: 'III', posting_count: 10 },
    ] as Outlook['areas']
    expect(Object.fromEntries(regionalDemand({ areas }))).toEqual({ NCR: 1, III: 0.25 })
    const none = [{ region_code: 'NCR', posting_count: 0 }] as Outlook['areas']
    expect(regionalDemand({ areas: none }).size).toBe(0)
    expect(regionalDemand(undefined).size).toBe(0)
  })
})
