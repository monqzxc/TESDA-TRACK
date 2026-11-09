import { describe, expect, it } from 'vitest'
import { demandPreference } from './demandIntent.ts'
import { finalOccupations } from './occupations.ts'
import type { Qualification } from '../../api/queries.ts'

const qualification: Qualification = {
  code: 'TEST',
  name: 'Test NC II',
  sector: 'Construction',
  possible_jobs: ['Builder', 'Assistant'],
  competencies: [],
}
const evidence = [
  { occupation_key: 'builder', occupation_title: 'Builder', classification: 'in_demand' as const },
  { occupation_key: 'builder', occupation_title: 'Builder', classification: 'in_demand' as const },
  {
    occupation_key: 'specialist',
    occupation_title: 'Specialist',
    classification: 'hard_to_fill' as const,
  },
]
describe('explicit demand discovery', () => {
  it.each([
    ['web developer', null],
    ['Welding, blueprint reading', null],
    ['Suggest qualifications relevant to in-demand jobs in my area', 'in_demand'],
    ['hard-to-fill jobs', 'hard_to_fill'],
    ['in-demand and hard-to-fill jobs', 'either'],
    ["I don't want in-demand jobs. I want cooking.", null],
    ['I don’t want in-demand jobs. I want cooking.', null],
    ["I'm not interested in in-demand jobs. I want welding.", null],
    ['gusto ko ng indemand na trabaho', 'in_demand'],
  ])('interprets %s', (query, expected) => expect(demandPreference(query!)).toBe(expected))
  it('keeps catalog careers without demand evidence', () =>
    expect(finalOccupations(qualification, [qualification], [], null).map((j) => j.title)).toEqual([
      'Builder',
      'Assistant',
    ]))
  it('combines and deduplicates ordinary job discovery', () =>
    expect(
      finalOccupations(qualification, [qualification], evidence, null).map((j) => j.title),
    ).toEqual(['Builder', 'Assistant']))
  it('filters only when demand was requested', () => {
    expect(
      finalOccupations(qualification, [qualification], evidence, 'in_demand').map((j) => j.title),
    ).toEqual(['Builder'])
    expect(
      finalOccupations(qualification, [qualification], evidence, 'hard_to_fill').map(
        (j) => j.title,
      ),
    ).toEqual([])
    expect(finalOccupations(qualification, [qualification], [], 'in_demand')).toEqual([])
  })
  it('adds dated posting jobs without treating them as forecast demand', () => {
    const posting = {
      occupation_title: 'Installer',
      occupation_key: 'installer',
      classification: 'observed_posting' as const,
    }
    expect(
      finalOccupations(qualification, [qualification], [posting], null).map((job) => job.title),
    ).toEqual(['Installer', 'Builder', 'Assistant'])
    expect(finalOccupations(qualification, [qualification], [posting], 'in_demand')).toEqual([])
  })
  it('excludes hard-to-fill catalog jobs unless also supported as in-demand', () => {
    const hard = {
      occupation_title: 'Builder',
      occupation_key: 'builder',
      classification: 'hard_to_fill' as const,
    }
    expect(
      finalOccupations(qualification, [qualification], [hard], null).map((job) => job.title),
    ).toEqual(['Assistant'])
    expect(
      finalOccupations(qualification, [qualification], [hard, evidence[0]], null).map(
        (job) => job.title,
      ),
    ).toEqual(['Builder', 'Assistant'])
  })
})
