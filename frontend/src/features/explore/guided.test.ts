import { describe, expect, it } from 'vitest'
import type { Match } from '../finder/api.ts'
import type { Center } from '../training/centers.ts'
import type { PersonalFit } from './demandApi.ts'
import {
  candidateFor,
  checksFor,
  choosePick,
  considerGroup,
  demandGroup,
  type DemandSignal,
  demandSignal,
  fitsYou,
  groupOrder,
  nearGroup,
  type PickCandidate,
  widenKm,
} from './guided.ts'
import type { NearbySuggestion, Outlook } from './outlookApi.ts'

const match = (code: string, score: number, name = code): Match =>
  ({ qualification: { code, name, sector: 'Automotive' }, score, reason: '' }) as Match

const center = ({
  code,
  km,
  city = 'Malolos',
  kind = 'assessment',
  id = `${kind}-${code}-${km}`,
}: {
  code: string
  km: number | null
  city?: string
  kind?: 'assessment' | 'training'
  id?: string
}): Center => ({
  id,
  kind,
  name: `${city} center`,
  regionCode: 'III',
  region: 'Region III',
  province: 'Bulacan',
  city,
  address: null,
  latitude: 14.84,
  longitude: 120.81,
  email: null,
  phone: null,
  website: null,
  programs:
    kind === 'training' ? ([{ qualification: { code } }] as unknown as Center['programs']) : [],
  schedules: [],
  accredited: kind === 'assessment' ? [code] : [],
  distanceKm: km,
})

const HIGH: DemandSignal = {
  level: 'high',
  limited: false,
  count: 45,
  sample: true,
  rank: 1,
  rankedOf: 18,
}

const candidate = (over: Partial<PickCandidate> = {}): PickCandidate => ({
  match: match('DRIVING-NC-II', 80),
  nearCount: 1,
  nearestKm: 4,
  nearestName: 'A',
  demand: HIGH,
  fit: true,
  ...over,
})

type Area = Outlook['areas'][number]
const area = (code: string, name: string, posting_count: number, over: Partial<Area> = {}): Area =>
  ({
    region_code: code,
    name,
    latitude: 15,
    longitude: 121,
    posting_count,
    titles: ['Driver'],
    training_sites: 1,
    assessment_sites: 1,
    example_sites: 0,
    demand_share: null,
    supply_share: null,
    balance: 'more_demand',
    limited: false,
    ...over,
  }) as Area

const outlook = ({
  home = 'NCR',
  rank = 1,
  level = 'high' as DemandSignal['level'],
  sample = false,
  areas = [] as Area[],
} = {}): Outlook =>
  ({
    home_region_code: home,
    demand_is_sample: sample,
    areas,
    home_demand: home
      ? {
          region_code: home,
          name: 'National Capital Region',
          posting_count: 45,
          level,
          rank,
          ranked_of: 18,
          limited: false,
        }
      : null,
  }) as unknown as Outlook

const CALOOCAN = { latitude: 14.65, longitude: 120.98 }

describe('checksFor', () => {
  it('1-record high is not in demand', () => {
    expect(checksFor(candidate({ demand: { ...HIGH, limited: true, count: 1 } })).demand).toBe(
      false,
    )
  })
  it('a stale "high" from fewer than 3 records is not in demand', () => {
    expect(checksFor(candidate({ demand: { ...HIGH, limited: false, count: 2 } })).demand).toBe(
      false,
    )
  })
  it('demand unknown is not in demand', () => {
    expect(checksFor(candidate({ demand: null })).demand).toBe(false)
  })
})

describe('demandSignal', () => {
  it('reads home_demand and the modelled flag', () => {
    expect(demandSignal(outlook({ sample: true }))).toEqual({
      level: 'high',
      limited: false,
      count: 45,
      sample: true,
      rank: 1,
      rankedOf: 18,
    })
    expect(demandSignal(undefined)).toBeNull()
    expect(demandSignal(outlook({ home: '' }))).toBeNull()
  })
})

describe('fitsYou', () => {
  it('guest strong only', () => {
    expect(fitsYou(match('A', 60), null, false)).toBe(true)
    expect(fitsYou(match('A', 59), null, false)).toBe(false)
  })
  it('signed in follows the next step', () => {
    const fit = (next_step: PersonalFit['next_step']) => ({ next_step }) as PersonalFit
    expect(fitsYou(match('A', 10), fit('assessment'), true)).toBe(true)
    expect(fitsYou(match('A', 10), fit('gap_training'), true)).toBe(true)
    expect(fitsYou(match('A', 99), fit('training'), true)).toBe(false)
    expect(fitsYou(match('A', 99), null, true)).toBe(false)
  })
})

describe('choosePick', () => {
  const malolos = [center({ code: 'DRIVING-NC-II', km: 27.3 })]
  const manuel = (rangeKm: number) =>
    candidateFor(match('DRIVING-NC-II', 80), malolos, rangeKm, false, HIGH, true)

  it('Manuel at 10 km is a 2-of-3 pick', () => {
    const pick = choosePick([manuel(10)])
    expect(pick?.tier).toBe('pick')
    expect(pick?.checks).toEqual({ near: false, demand: true, fit: true })
    expect(pick?.candidate.nearestKm).toBe(27.3)
    expect(pick?.candidate.nearestName).toBe('Malolos center')
  })
  it('at 30 km it is best', () => {
    expect(choosePick([manuel(30)])?.tier).toBe('best')
  })
  it('one check gives no pick', () => {
    expect(choosePick([candidate({ nearCount: 0, demand: null })])).toBeNull()
  })
  it('only one best', () => {
    const pick = choosePick([
      candidate({ match: match('LOW', 70) }),
      candidate({ match: match('HIGH', 90) }),
    ])
    expect(pick?.candidate.match.qualification.code).toBe('HIGH')
  })
  it('tie-breaks by demand, then distance', () => {
    const more = candidate({ match: match('MORE', 80), demand: { ...HIGH, count: 50 } })
    const less = candidate({ match: match('LESS', 80), demand: { ...HIGH, count: 10 } })
    expect(choosePick([less, more])?.candidate.match.qualification.code).toBe('MORE')
    const near = candidate({ match: match('NEAR', 80), nearestKm: 2 })
    const far = candidate({ match: match('FAR', 80), nearestKm: 9 })
    const unknown = candidate({ match: match('UNK', 80), nearestKm: null })
    expect(choosePick([unknown, far, near])?.candidate.match.qualification.code).toBe('NEAR')
  })
})

describe('candidateFor', () => {
  it('relocate counts every center', () => {
    const far = [center({ code: 'W', km: 210 })]
    expect(candidateFor(match('W', 80), far, 10, true, null, false).nearCount).toBe(1)
    expect(candidateFor(match('W', 80), far, 10, false, null, false).nearCount).toBe(0)
  })
  it('only counts centers offering it', () => {
    const other = [center({ code: 'OTHER', km: 1 })]
    expect(candidateFor(match('W', 80), other, 10, false, null, false)).toMatchObject({
      nearCount: 0,
      nearestKm: null,
    })
  })
})

describe('widenKm', () => {
  it('rounds up to 10 km within the custom limit', () => {
    expect(widenKm(27.3)).toBe(30)
    expect(widenKm(399)).toBe(400)
    expect(widenKm(1000)).toBe(400)
  })
})

describe('nearGroup', () => {
  it('no place', () => {
    expect(nearGroup([match('A', 80)], [], 10, false, new Set())).toEqual({ kind: 'no-place' })
  })
  it('none in range', () => {
    const malolos = [center({ code: 'DRIVING-NC-II', km: 27.3 })]
    expect(nearGroup([match('DRIVING-NC-II', 80)], malolos, 10, true, new Set())).toEqual({
      kind: 'none-in-range',
      nearestKm: 27.3,
      town: 'Malolos',
      widenTo: 30,
    })
  })
  it('excludes and caps', () => {
    const codes = ['A', 'B', 'C', 'D', 'E']
    const matches = codes.map((code, index) => match(code, 50 + index))
    const centers = codes.map((code) => center({ code, km: 3 }))
    const group = nearGroup(matches, centers, 10, true, new Set(['E']))
    expect(group.kind).toBe('cards')
    if (group.kind !== 'cards') return
    expect(group.cards.map((card) => card.match.qualification.code)).toEqual(['D', 'C', 'B'])
    expect(group.cards[0]).toMatchObject({ nearCount: 1, nearestKm: 3 })
    expect(group.cards[0]?.nearestMinutes).toBeGreaterThan(0)
  })
  it('an excluded-only match leaves an empty card list, not a none-in-range', () => {
    const group = nearGroup(
      [match('A', 80)],
      [center({ code: 'A', km: 3 })],
      10,
      true,
      new Set(['A']),
    )
    expect(group).toEqual({ kind: 'cards', cards: [] })
  })
  // QA-2026-11-28-NEW4 (US-0014 AC5): with no center for any match anywhere, say so instead of hiding the group,
  // with or without a place.
  it('no center anywhere, with or without a place', () => {
    const others = [center({ code: 'OTHER-NC-II', km: 3 })]
    const air = match('AIR-DUCT-SERVICING-NC-II', 80)
    for (const hasPlace of [true, false]) {
      expect(nearGroup([match('B', 40), air], others, 10, hasPlace, new Set())).toEqual({
        kind: 'none-anywhere',
        match: air,
      })
    }
  })
  it('still waits for a place while the centers have not loaded', () => {
    expect(nearGroup([match('A', 80)], [], 10, false, new Set())).toEqual({ kind: 'no-place' })
  })
})

describe('demandGroup', () => {
  const areas = [
    area('NCR', 'National Capital Region', 45),
    area('III', 'Region III (Central Luzon)', 45),
    area('VII', 'Region VII (Central Visayas)', 37),
    area('CAR', 'Cordillera', 2),
  ]
  it('leaves out home and thin regions', () => {
    const group = demandGroup(outlook({ areas }), CALOOCAN)
    expect(group.cards.map((card) => card.regionCode)).toEqual(['III', 'VII'])
    expect(group.cards[0]).toMatchObject({
      count: 45,
      training: 1,
      assessment: 1,
      titles: ['Driver'],
    })
    expect(group.cards[0]?.km).toBeGreaterThan(0)
  })
  it('good news when home is #1', () => {
    expect(demandGroup(outlook({ areas }), CALOOCAN).goodNews).toEqual({
      home: 'National Capital Region',
      rankedOf: 18,
    })
    expect(demandGroup(outlook({ areas, rank: 2 }), CALOOCAN).goodNews).toBeNull()
    expect(demandGroup(outlook({ areas, level: 'low' }), CALOOCAN).goodNews).toBeNull()
  })
  it('modelled flag', () => {
    const group = demandGroup(outlook({ areas, sample: true }), CALOOCAN)
    expect(group.cards.every((card) => card.sample)).toBe(true)
  })
  it('no reference', () => {
    const group = demandGroup(outlook({ areas }), null)
    expect(group.cards.every((card) => card.km === null)).toBe(true)
    expect(group.goodNews).toBeNull()
  })
  it('no outlook', () => {
    expect(demandGroup(undefined, CALOOCAN)).toEqual({ goodNews: null, cards: [] })
  })
})

describe('considerGroup', () => {
  it('drops shown codes and caps', () => {
    const items = ['A', 'B', 'C', 'D', 'E'].map(
      (code) => ({ qualification: { code, name: code } }) as NearbySuggestion,
    )
    expect(considerGroup(items, new Set(['A'])).map((item) => item.qualification.code)).toEqual([
      'B',
      'C',
      'D',
    ])
  })
})

describe('groupOrder', () => {
  it('relocate puts demand first', () => {
    expect(groupOrder(false)).toEqual(['near', 'demand', 'consider'])
    expect(groupOrder(true)).toEqual(['demand', 'near', 'consider'])
  })
})
