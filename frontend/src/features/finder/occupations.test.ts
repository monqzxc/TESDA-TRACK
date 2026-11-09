import { describe, expect, it } from 'vitest'
import type { Qualification } from '../../api/queries.ts'
import { coreSkills, jobIndex, OCCUPATION_LIMIT, relatedOccupations } from './occupations.ts'

const qualification = (
  code: string,
  possible_jobs: string[],
  core: string[] = [],
): Qualification => ({
  code,
  name: `${code} NC II`,
  sector: 'Metals and Engineering',
  possible_jobs,
  competencies: [
    { id: 1, position: 1, name: 'Work in a team environment', category: 'Basic' },
    ...core.map((name, i) => ({ id: 10 + i, position: 10 + i, name, category: 'Core' })),
  ],
})

const smaw = qualification('SMAW', ['Welder', 'Fabricator', 'Structural Welder'], ['Weld plates'])
const gmaw = qualification('GMAW', ['welder ', 'Pipe Welder'], ['Weld pipes'])
const cookery = qualification('COOKERY', ['Cook', 'Kitchen Assistant'])
const catalog = [smaw, gmaw, cookery]
const index = jobIndex(catalog)

const titles = (codes: string[], terms: string[] = []) =>
  relatedOccupations(codes, terms, index, catalog).map((occupation) => occupation.title)

describe('relatedOccupations', () => {
  it('lists the matches’ jobs as the catalog spells them, in match order', () => {
    expect(titles(['COOKERY'])).toEqual(['Cook', 'Kitchen Assistant'])
    expect(titles(['SMAW', 'COOKERY'])).toEqual([
      'Welder',
      'Fabricator',
      'Structural Welder',
      'Cook',
      'Kitchen Assistant',
    ])
  })

  it('merges a job two qualifications list, whatever its case or spacing, and lists both', () => {
    const found = relatedOccupations(['SMAW', 'GMAW'], [], index, catalog)

    expect(found.filter((occupation) => occupation.key === 'welder')).toHaveLength(1)
    expect(found[0].qualifications.map((q) => q.code)).toEqual(['SMAW', 'GMAW'])
  })

  it('lists the matches first among a job’s qualifications, even one that wasn’t matched', () => {
    const [welder] = relatedOccupations(['GMAW'], [], index, catalog)

    expect(welder.title).toBe('Welder') // as the catalog first spells it
    expect(welder.qualifications.map((q) => q.code)).toEqual(['GMAW', 'SMAW'])
  })

  it('puts the jobs the learner named first', () => {
    expect(titles(['SMAW'], ['structural welder'])).toEqual([
      'Structural Welder',
      'Welder',
      'Fabricator',
    ])
    expect(titles(['SMAW', 'COOKERY'], ['cook'])[0]).toBe('Cook')
  })

  it('invents nothing: no matches, no jobs', () => {
    expect(titles([])).toEqual([])
    expect(titles(['UNKNOWN'])).toEqual([])
  })

  it('shows at most a dozen occupations', () => {
    const many = qualification(
      'MANY',
      Array.from({ length: 20 }, (_, i) => `Job ${i + 1}`),
    )
    const found = relatedOccupations(['MANY'], [], jobIndex([many]), [many])

    expect(found).toHaveLength(OCCUPATION_LIMIT)
  })
})

describe('coreSkills', () => {
  it('takes the core competencies in order, up to four', () => {
    const many = qualification('X', [], ['A', 'B', 'C', 'D', 'E'])

    expect(coreSkills(many)).toEqual(['A', 'B', 'C', 'D'])
    expect(coreSkills(cookery)).toEqual([])
  })
})
