import { describe, expect, it } from 'vitest'
import type { Match } from '../finder/api.ts'
import type { Center, Program } from '../training/centers.ts'
import type { QualificationFit } from '../tsp/passport.ts'
import { qualificationFacts } from './qualificationFacts.ts'

const match = (code: string): Match => ({
  qualification: { code, name: `${code} NC II`, sector: 'Test' },
  score: 80,
  reason: '',
})
const program = (code: string, hours: number | null, scholarship = false) =>
  ({
    qualification: { code, name: code, sector: 'Test' },
    duration_hours: hours,
    scholarship_open: scholarship,
  }) as unknown as Program
const center = (
  id: string,
  kind: 'training' | 'assessment',
  distanceKm: number | null,
  programs: Program[] = [],
  accredited: string[] = [],
) => ({ id, kind, distanceKm, programs, schedules: [], accredited }) as unknown as Center

const base = {
  rangeKm: 25,
  hasReference: true,
  fits: new Map<string, QualificationFit | null>(),
  catalog: [],
}

describe('qualificationFacts', () => {
  it('gives the range of training hours across centers in range', () => {
    const [column] = qualificationFacts({
      ...base,
      matches: [match('A')],
      centers: [
        center('t1', 'training', 3, [program('A', 118)]),
        center('t2', 'training', 9, [program('A', 160)]),
        center('far', 'training', 90, [program('A', 400)]),
      ],
    })
    expect(column!.hours).toEqual({ min: 118, max: 160 })
  })

  it('says nothing about hours no program lists', () => {
    const [column] = qualificationFacts({
      ...base,
      matches: [match('A')],
      centers: [center('t1', 'training', 3, [program('A', null)])],
    })
    expect(column!.hours).toBeNull()
  })

  it('knows a scholarship only from a program offering one, and nothing without a program', () => {
    const [withOne, without] = qualificationFacts({
      ...base,
      matches: [match('A'), match('B')],
      centers: [center('t1', 'training', 3, [program('A', 100, true)])],
    })
    expect(withOne!.scholarship).toBe(true)
    expect(without!.scholarship).toBeNull()
  })

  it('counts centers near only with a reference point', () => {
    const centers = [
      center('t1', 'training', 3, [program('A', 100)]),
      center('a1', 'assessment', 4, [], ['A']),
      center('a2', 'assessment', 70, [], ['A']),
    ]
    const [near] = qualificationFacts({ ...base, matches: [match('A')], centers })
    expect([near!.trainNear, near!.assessNear]).toEqual([1, 1])
    const [unknown] = qualificationFacts({
      ...base,
      hasReference: false,
      matches: [match('A')],
      centers,
    })
    expect([unknown!.trainNear, unknown!.assessNear]).toEqual([null, null])
  })

  it('reads CORE coverage from the fit, and leaves the fit undefined when it was never fetched', () => {
    const fit = {
      score: 82,
      next_step: 'assessment',
      coverage: { covered: ['u1', 'u2', 'u3'], missing: ['u4'], expired: [] },
    } as unknown as QualificationFit
    const [a, b, c] = qualificationFacts({
      ...base,
      matches: [match('A'), match('B'), match('C')],
      centers: [],
      fits: new Map([
        ['A', fit],
        ['B', null],
      ]),
    })
    expect([a!.coreHave, a!.coreTotal]).toEqual([3, 4])
    expect(b!.fit).toBeNull()
    expect(c!.fit).toBeUndefined()
    expect([c!.coreHave, c!.coreTotal]).toEqual([null, null])
  })

  it('lists at most three possible jobs from the catalog', () => {
    const [column] = qualificationFacts({
      ...base,
      matches: [match('A')],
      centers: [],
      catalog: [{ code: 'A', possible_jobs: ['j1', 'j2', 'j3', 'j4'] }],
    })
    expect(column!.jobs).toEqual(['j1', 'j2', 'j3'])
  })
})
