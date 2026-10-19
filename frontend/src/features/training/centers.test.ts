import { describe, expect, it } from 'vitest'
import type { Region } from '../../api/queries.ts'
import {
  buildCenters,
  filterCenters,
  findPlace,
  placeLabel,
  provinces,
  sortCenters,
  summary,
  withDistances,
  type AssessmentSite,
  type Center,
  type Filters,
  type Program,
  type Provider,
  type Schedule,
} from './centers.ts'

// Ported from classic/tests/test_centers.py.

const TODAY = '2026-10-07'
const REGIONS = new Map<string, Region>(
  [
    {
      code: 'NCR',
      name: 'National Capital Region',
      center_city: 'Manila',
      latitude: 14.5995,
      longitude: 120.9842,
    },
    {
      code: 'III',
      name: 'Central Luzon',
      center_city: 'San Fernando',
      latitude: 15.0286,
      longitude: 120.6898,
    },
    {
      code: 'VII',
      name: 'Central Visayas',
      center_city: 'Cebu City',
      latitude: 10.3157,
      longitude: 123.8854,
    },
  ].map((region) => [region.code, region]),
)
const NAMES: Record<string, string> = {
  'CSS-NC-II': 'Computer Systems Servicing NC II',
  'SMAW-NC-II': 'Shielded Metal Arc Welding NC II',
}
const MANILA = { latitude: 14.5995, longitude: 120.9842 }

function site(
  id: number,
  name: string,
  region: string,
  city: string | null,
  latitude: number | null,
  longitude: number | null,
  province: string | null = null,
): Provider {
  return {
    id,
    name,
    region_code: region,
    province,
    city,
    address: null,
    latitude,
    longitude,
    contact_email: null,
    contact_phone: null,
    website: null,
    is_active: true,
  }
}

const summaryOf = ({ id, name, region_code, city, latitude, longitude }: Provider) => ({
  id,
  name,
  region_code,
  city,
  latitude,
  longitude,
})

function program(
  id: number,
  provider: Provider,
  code: string,
  start: string | null = null,
  mode: Program['delivery_mode'] = 'institution_based',
  scholarship = false,
): Program {
  return {
    id,
    title: `${NAMES[code]} batch ${id}`,
    description: null,
    qualification: { code, name: NAMES[code], sector: 'Test' },
    provider: summaryOf(provider),
    delivery_mode: mode,
    duration_hours: 268,
    cost: '0.00',
    scholarship_available: scholarship,
    start_date: start,
    end_date: null,
    slots: 25,
    is_active: true,
    distance_km: null,
  }
}

function schedule(id: number, center: Provider, code: string, when: string): Schedule {
  return {
    id,
    qualification: { code, name: NAMES[code], sector: 'Test' },
    center: summaryOf(center),
    scheduled_at: when,
    slots: 25,
    seats_left: 10,
    fee: '500.00',
    status: 'open',
    distance_km: null,
  }
}

const TARLAC_TC = site(
  1,
  'Tarlac Skills Institute',
  'III',
  'Tarlac City',
  15.4755,
  120.5963,
  'Tarlac',
)
const MANILA_TC = site(2, 'Manila Welding Institute', 'NCR', 'Manila', 14.5995, 120.9842)
const CEBU_TC = site(3, 'Cebu Skills Center', 'VII', 'Cebu City', 10.3157, 123.8854, 'Cebu')
const MOBILE_TC = site(4, 'Mobile Training Unit', 'NCR', null, null, null)
const TARLAC_AC = site(1, 'Tarlac Assessment Center', 'III', 'Tarlac City', 15.48, 120.59, 'Tarlac')
const MANILA_AC = site(2, 'Manila Assessment Center', 'NCR', 'Manila', 14.6, 120.98)

const PROGRAMS = [
  program(1, TARLAC_TC, 'CSS-NC-II', '2026-10-21', 'institution_based', true),
  program(2, TARLAC_TC, 'SMAW-NC-II', '2027-01-10'),
  program(3, MANILA_TC, 'SMAW-NC-II', '2026-10-15', 'online'),
  program(4, CEBU_TC, 'CSS-NC-II', null, 'community_based'),
]
const SCHEDULES = [
  schedule(1, TARLAC_AC, 'CSS-NC-II', '2026-10-15T01:00:00Z'),
  schedule(2, MANILA_AC, 'SMAW-NC-II', '2026-12-20T02:00:00Z'),
  // 00:30 on Oct 7 in the Philippines, which is still Oct 6 in UTC.
  schedule(3, TARLAC_AC, 'SMAW-NC-II', '2026-10-06T16:30:00Z'),
]

function world(): Map<string, Center> {
  const centers = buildCenters(
    [TARLAC_TC, MANILA_TC, CEBU_TC, MOBILE_TC],
    [TARLAC_AC, MANILA_AC] as AssessmentSite[],
    PROGRAMS,
    SCHEDULES,
    REGIONS,
  )
  return new Map(centers.map((center) => [center.id, center]))
}
const all = () => [...world().values()]
const ids = (centers: Center[]) => centers.map((center) => center.id)

describe('buildCenters', () => {
  it('joins listings to the site of their own kind', () => {
    const centers = world()
    expect(new Set(centers.keys())).toEqual(
      new Set([
        'training-1',
        'training-2',
        'training-3',
        'training-4',
        'assessment-1',
        'assessment-2',
      ]),
    )
    // Provider 1 and assessment center 1 share a numeric id; their listings must not mix.
    expect(centers.get('training-1')!.programs.map((item) => item.id)).toEqual([1, 2])
    expect(centers.get('training-1')!.schedules).toEqual([])
    expect(centers.get('assessment-1')!.schedules.map((item) => item.id)).toEqual([1, 3])
    expect(centers.get('assessment-1')!.programs).toEqual([])
  })

  it('shows the center of a listing whose site the site list missed', () => {
    const stray = site(9, 'New Provider', 'NCR', 'Quezon City', 14.676, 121.0437)
    const centers = buildCenters([], [], [program(5, stray, 'CSS-NC-II')], [], REGIONS)
    expect(ids(centers)).toEqual(['training-9'])
    expect(centers[0]).toMatchObject({ name: 'New Provider', region: 'National Capital Region' })
  })

  it('treats out-of-range coordinates as unmapped', () => {
    const broken = site(5, 'Broken Pin', 'NCR', 'Manila', 999, 120.9)
    const [center] = buildCenters([broken], [], [], [], REGIONS)
    expect(center).toMatchObject({ latitude: null, longitude: null })
  })
})

describe('placeLabel', () => {
  it.each([
    [site(1, 'A', 'III', 'Tarlac City', 15.4, 120.5, 'Tarlac'), 'Tarlac City, Tarlac'],
    [site(2, 'B', 'NCR', 'Manila', 14.6, 120.9), 'Manila, National Capital Region'],
    [site(3, 'C', 'NCR', null, null, null), 'National Capital Region'],
    [
      site(4, 'D', 'III', 'San Fernando, Pampanga', 15.0, 120.6, 'Pampanga'),
      'San Fernando, Pampanga',
    ],
  ])('reads the city, then the province or region (%#)', (place, expected) => {
    expect(placeLabel(buildCenters([place], [], [], [], REGIONS)[0])).toBe(expected)
  })
})

describe('withDistances', () => {
  it('measures from the reference point', () => {
    const distance = new Map(
      withDistances(all(), MANILA).map((center) => [center.id, center.distanceKm]),
    )
    expect(distance.get('training-2')).toBe(0)
    expect(distance.get('assessment-2')).toBeCloseTo(0.5, 1)
    expect(distance.get('training-1')).toBeCloseTo(105.9, 0)
    expect(distance.get('training-3')).toBeCloseTo(571.0, 0)
    // A center without coordinates has no distance.
    expect(distance.get('training-4')).toBeNull()
  })

  it('shows no distance without a reference point', () => {
    expect(withDistances(all(), null).every((center) => center.distanceKm === null)).toBe(true)
  })
})

describe('findPlace', () => {
  it.each([
    ['manila', 'Manila', 14.5998, 120.9821],
    ['Tarlac', 'Tarlac', 15.4778, 120.5932],
    ['tarlac city', 'Tarlac City', 15.4778, 120.5932],
    ['Cebu', 'Cebu', 10.3157, 123.8854],
    ['central visayas', 'Central Visayas', 10.3157, 123.8854],
    ['NCR', 'National Capital Region', 14.5995, 120.9842],
    ['Region III', 'Central Luzon', 15.0286, 120.6898],
    ['tarl', 'Tarlac', 15.4778, 120.5932],
  ])('resolves %s to a known point', (text, label, latitude, longitude) => {
    const place = findPlace(text, all(), REGIONS)
    expect(place?.label).toBe(label)
    expect(place?.latitude).toBeCloseTo(latitude, 3)
    expect(place?.longitude).toBeCloseTo(longitude, 3)
  })

  it.each(['', '   ', 'Atlantis', 'ab'])('resolves %j to nothing', (text) => {
    expect(findPlace(text, all(), REGIONS)).toBeNull()
  })
})

describe('filterCenters', () => {
  it.each<[Filters, string[]]>([
    [{ kinds: ['assessment'] }, ['assessment-1', 'assessment-2']],
    [{ regionCode: 'III' }, ['training-1', 'assessment-1']],
    [{ province: 'Cebu' }, ['training-3']],
    [{ text: 'welding manila' }, ['training-2', 'assessment-2']],
    [{ text: 'TARLAC' }, ['training-1', 'assessment-1']],
    [{ text: 'computer systems' }, ['training-1', 'training-3', 'assessment-1']],
    [{ text: 'batch 3' }, ['training-2']],
    [{}, ['training-1', 'training-2', 'training-3', 'training-4', 'assessment-1', 'assessment-2']],
  ])('picks the centers that match %j', (filters, expected) => {
    expect(new Set(ids(filterCenters(all(), filters, TODAY)))).toEqual(new Set(expected))
  })

  it('keeps only the centers that offer a qualification, and only its listings', () => {
    const centers = new Map(
      filterCenters(all(), { qualificationCodes: ['CSS-NC-II'] }, TODAY).map((c) => [c.id, c]),
    )
    expect(new Set(centers.keys())).toEqual(new Set(['training-1', 'training-3', 'assessment-1']))
    expect(centers.get('training-1')!.programs.map((item) => item.id)).toEqual([1])
    expect(centers.get('assessment-1')!.schedules.map((item) => item.id)).toEqual([1])
  })

  it('leaves the unfiltered centers as they were', () => {
    const original = world()
    filterCenters([...original.values()], { qualificationCodes: ['CSS-NC-II'] }, TODAY)
    expect(original.get('training-1')!.programs.map((item) => item.id)).toEqual([1, 2])
  })

  it.each<[Filters, Record<string, number[]>]>([
    [{ deliveryMode: 'online' }, { 'training-2': [3] }],
    [{ scholarship: true }, { 'training-1': [1] }],
  ])('narrows only training centers by %j', (filters, training) => {
    const centers = filterCenters(all(), filters, TODAY)
    expect(
      Object.fromEntries(
        centers
          .filter((center) => center.kind === 'training')
          .map((center) => [center.id, center.programs.map((item) => item.id)]),
      ),
    ).toEqual(training)
    // Assessment centers aren't narrowed by these.
    expect(ids(centers)).toEqual(expect.arrayContaining(['assessment-1', 'assessment-2']))
  })

  it('counts days in Philippine time, and programs with a flexible start, within an availability window', () => {
    const centers = filterCenters(all(), { withinDays: 30 }, TODAY)
    expect(
      Object.fromEntries(
        centers.map((center) => [
          center.id,
          [...center.programs, ...center.schedules].map((item) => item.id),
        ]),
      ),
    ).toEqual({
      'training-1': [1],
      'training-2': [3],
      'training-3': [4],
      'assessment-1': [1, 3],
    })
  })

  it('leaves out a listing that is earlier today in UTC but yesterday here', () => {
    // 23:00 on Oct 6, Philippine time.
    const late = schedule(4, MANILA_AC, 'CSS-NC-II', '2026-10-06T15:00:00Z')
    const centers = buildCenters([], [MANILA_AC as AssessmentSite], [], [late], REGIONS)
    expect(filterCenters(centers, { withinDays: 30 }, TODAY)).toEqual([])
  })
})

describe('sortCenters', () => {
  it('puts centers without a distance last, nearest first', () => {
    expect(ids(sortCenters(withDistances(all(), MANILA), 'nearest', TODAY))).toEqual([
      'training-2',
      'assessment-2',
      'training-1',
      'assessment-1',
      'training-3',
      'training-4',
    ])
  })

  it('orders by the next start or assessment day, soonest first', () => {
    expect(ids(sortCenters(all(), 'soonest', TODAY))).toEqual([
      'assessment-1',
      'training-2',
      'training-1',
      'assessment-2',
      'training-3',
      'training-4',
    ])
  })

  it('orders by name ignoring case', () => {
    const lower = site(7, 'abra skills center', 'NCR', 'Manila', 14.6, 120.98)
    const centers = sortCenters(
      buildCenters([MANILA_TC, lower, CEBU_TC], [], [], [], REGIONS),
      'name',
      TODAY,
    )
    expect(centers.map((center) => center.name)).toEqual([
      'abra skills center',
      'Cebu Skills Center',
      'Manila Welding Institute',
    ])
  })
})

describe('summary', () => {
  it('counts listings and names the next date', () => {
    const centers = world()
    const tarlac = summary(centers.get('training-1')!, TODAY)
    expect(tarlac).toContain('2 programs')
    expect(tarlac).toContain('Oct 21')
    expect(tarlac).not.toContain('2027')
    const cebu = summary(centers.get('training-3')!, TODAY)
    expect(cebu).toBe('1 program · Flexible start')
    const assessments = summary(centers.get('assessment-1')!, TODAY)
    expect(assessments).toBe('2 upcoming assessments · Next Oct 7')
    expect(summary(centers.get('training-4')!, TODAY)).toBe('No programs listed yet')
    expect(
      summary(buildCenters([], [MANILA_AC as AssessmentSite], [], [], REGIONS)[0], TODAY),
    ).toBe('No upcoming assessments yet')
  })

  it('gives the year of a date in another year', () => {
    const nextYear = buildCenters([TARLAC_TC], [], [PROGRAMS[1]], [], REGIONS)[0]
    expect(summary(nextYear, TODAY)).toContain('Jan 10, 2027')
  })
})

describe('provinces', () => {
  it('lists each known province once', () => {
    expect(provinces(all())).toEqual(['Cebu', 'Tarlac'])
    expect(provinces(all(), 'III')).toEqual(['Tarlac'])
    expect(provinces(all(), 'NCR')).toEqual([])
  })
})
