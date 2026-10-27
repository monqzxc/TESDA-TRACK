import { describe, expect, it } from 'vitest'
import type { Qualification } from '../../api/queries.ts'
import { localQualification } from './local.ts'

const q = (code: string, name: string): Qualification => ({
  code,
  name,
  sector: 'Test',
  possible_jobs: [],
  competencies: [],
})
const CATALOG = [
  q('SMAW-NCII', 'Shielded Metal Arc Welding (SMAW) NC II'),
  q('CSS-NCII', 'Computer Systems Servicing NC II'),
  q('PROG-NCIV', 'Programming (Java) NC IV'),
]

describe('localQualification', () => {
  it('matches a code exactly, ignoring case', () => {
    expect(localQualification({ code: 'smaw-ncii', title: 'Anything' }, CATALOG)?.code).toBe(
      'SMAW-NCII',
    )
  })

  it('falls back to a title that shares two words, or most of its words', () => {
    expect(
      localQualification({ code: 'X-1', title: 'Shielded Metal Arc Welding NC I' }, CATALOG)?.code,
    ).toBe('SMAW-NCII')
    expect(localQualification({ title: 'Computer Servicing' }, CATALOG)?.code).toBe('CSS-NCII')
  })

  it('doesn’t match on one shared word, nor on level words alone', () => {
    expect(
      localQualification({ title: 'Computer Animation Studio Production' }, CATALOG),
    ).toBeNull()
    expect(localQualification({ title: 'Programming NC IV' }, CATALOG)).toBeNull()
    expect(localQualification({ title: null }, CATALOG)).toBeNull()
  })
})
