import { describe, expect, it } from 'vitest'
import type { Qualification } from '../api/queries.ts'
import {
  catalogNames,
  competencyGroups,
  filterQualifications,
  ncLevel,
  qualificationBlurb,
  qualificationTags,
  sectorsOf,
} from './qualifications.ts'

function qualification(overrides: Partial<Qualification>): Qualification {
  return {
    code: 'X',
    name: 'Example',
    sector: 'Example sector',
    possible_jobs: [],
    competencies: [],
    ...overrides,
  }
}

const cookery2 = qualification({
  code: 'CKY-NCII',
  name: 'Cookery NC II',
  sector: 'Tourism',
  possible_jobs: ['Cook', 'Kitchen helper', 'Commis', 'Line cook'],
  competencies: [
    { id: 3, position: 3, name: 'Prepare stocks', category: 'Core' },
    { id: 1, position: 1, name: 'Work in a team', category: 'Basic' },
    { id: 4, position: 4, name: 'Plate dishes', category: 'Core' },
    { id: 2, position: 2, name: 'Use kitchen tools', category: 'Common' },
  ],
})
const cookery3 = qualification({ code: 'CKY-NCIII', name: 'Cookery NC III', sector: 'Tourism' })
const welding = qualification({
  code: 'SMAW-NCI',
  name: 'Shielded Metal Arc Welding (SMAW) NC I',
  sector: 'Metals and Engineering',
  possible_jobs: ['Welder'],
})

describe('ncLevel', () => {
  it('reads the level from the name', () => {
    expect(ncLevel('Cookery NC II')).toBe('II')
    expect(ncLevel('Bread and Pastry Production NC IV')).toBe('IV')
    expect(ncLevel('Driving NC III (Passenger bus)')).toBe('III')
    expect(ncLevel('Trainers Methodology Level I')).toBeNull()
  })
})

describe('competencyGroups', () => {
  it('groups Basic, Common, then Core, each in position order', () => {
    const groups = competencyGroups(cookery2.competencies)
    expect(groups.map((group) => group.category)).toEqual(['Basic', 'Common', 'Core'])
    expect(groups[2].competencies.map((competency) => competency.name)).toEqual([
      'Prepare stocks',
      'Plate dishes',
    ])
  })

  it('puts any other category last, by name', () => {
    const groups = competencyGroups([
      { id: 1, position: 1, name: 'B', category: 'Zeta' },
      { id: 2, position: 2, name: 'A', category: 'Core' },
      { id: 3, position: 3, name: 'C', category: 'Elective' },
    ])
    expect(groups.map((group) => group.category)).toEqual(['Core', 'Elective', 'Zeta'])
  })
})

describe('qualificationTags', () => {
  it('shows the level, size and careers, and the next level up when the catalog has it', () => {
    const names = catalogNames([cookery2, cookery3, welding])
    expect(qualificationTags(cookery2, names)).toEqual([
      { icon: 'check', text: 'NC II' },
      { text: '4 competencies' },
      { text: '4 career options' },
      { icon: 'route', text: 'Pathway to NC III' },
    ])
  })

  it('leaves out what a qualification has none of, and says one in the singular', () => {
    const names = catalogNames([welding])
    expect(qualificationTags(welding, names)).toEqual([
      { icon: 'check', text: 'NC I' },
      { text: '1 career option' },
    ])
  })
})

describe('qualificationBlurb', () => {
  it('names up to three jobs and counts the competencies', () => {
    expect(qualificationBlurb(cookery2)).toBe(
      'Prepares you for jobs like Cook, Kitchen helper and Commis. ' +
        'Covers 4 competencies, including 2 core technical skills.',
    )
  })

  it('is empty for a qualification with no jobs or competencies listed', () => {
    expect(qualificationBlurb(cookery3)).toBe('')
  })
})

describe('filterQualifications', () => {
  const catalog = [cookery2, cookery3, welding]

  it('finds a word in the name, code, sector or jobs, ignoring case', () => {
    expect(filterQualifications(catalog, { query: 'WELD' })).toEqual([welding])
    expect(filterQualifications(catalog, { query: 'line cook' })).toEqual([cookery2])
    expect(filterQualifications(catalog, { query: 'ckY-nc' })).toEqual([cookery2, cookery3])
    expect(filterQualifications(catalog, { query: '  ' })).toEqual(catalog)
  })

  it('keeps to one sector', () => {
    expect(filterQualifications(catalog, { sector: 'Tourism', query: 'nc iii' })).toEqual([
      cookery3,
    ])
  })
})

describe('sectorsOf', () => {
  it('lists each sector once, alphabetically', () => {
    expect(sectorsOf([welding, cookery2, cookery3])).toEqual(['Metals and Engineering', 'Tourism'])
  })
})
