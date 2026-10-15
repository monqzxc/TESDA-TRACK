import { describe, expect, it } from 'vitest'
import { shortName, trainingAddress } from './address.ts'

describe('trainingAddress', () => {
  it('puts the filters in the query', () => {
    expect(
      trainingAddress({
        kinds: ['assessment'],
        qualifications: ['SMAW-NCII'],
        search: 'Shielded Metal Arc Welding',
      }),
    ).toBe('/training?type=assessment&qualification=SMAW-NCII&q=Shielded+Metal+Arc+Welding')
  })

  it('is the plain address without filters', () => {
    expect(trainingAddress({})).toBe('/training')
    expect(trainingAddress({ search: '  ' })).toBe('/training')
  })
})

describe('shortName', () => {
  it('drops the NC level and any abbreviation', () => {
    expect(shortName('Shielded Metal Arc Welding (SMAW) NC II')).toBe('Shielded Metal Arc Welding')
    expect(shortName('Cookery NC II')).toBe('Cookery')
    expect(shortName('Driving NC II (Articulated vehicle)')).toBe('Driving')
  })

  it('keeps a name that would be left empty', () => {
    expect(shortName('NC II')).toBe('NC II')
  })
})
