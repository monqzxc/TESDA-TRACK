import { describe, expect, it } from 'vitest'
import {
  NO_FILTERS,
  readTrainingAddress,
  shortName,
  trainingAddress,
  writeTrainingAddress,
} from './address.ts'

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

describe('readTrainingAddress and writeTrainingAddress', () => {
  it('read back what they wrote', () => {
    const filters = {
      ...NO_FILTERS,
      kinds: ['training' as const],
      region: 'III',
      province: 'Tarlac',
      qualifications: ['CSS-NC-II', 'SMAW-NC-II'],
      mode: 'online' as const,
      within: 30 as const,
      scholarship: true,
      search: 'welding',
      sort: 'soonest' as const,
      center: 'training-12',
    }
    expect(readTrainingAddress(writeTrainingAddress(filters))).toEqual(filters)
  })

  it('leave out what filters nothing', () => {
    expect(
      writeTrainingAddress({ ...NO_FILTERS, kinds: ['training', 'assessment'] }).toString(),
    ).toBe('')
  })

  it('read anything unknown as any', () => {
    expect(
      readTrainingAddress(
        new URLSearchParams('type=school&mode=by-boat&within=7&sort=random&scholarship=yes'),
      ),
    ).toEqual(NO_FILTERS)
  })
})
