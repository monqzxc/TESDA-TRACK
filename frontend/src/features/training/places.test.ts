import { describe, expect, it } from 'vitest'
import { bestPlace, exactPlace, foldPlace, gazetteer as places, suggestPlaces } from './places.ts'

const gazetteer = places()

describe('places', () => {
  it('folds accents, case and abbreviations', () => {
    expect(foldPlace('Parañaque')).toBe('paranaque')
    expect(foldPlace('Sto. Tomas, Batangas')).toBe('santo tomas batangas')
  })

  it('measures a typed province from its capital', () => {
    const place = exactPlace('pampanga', gazetteer)
    expect(place).toMatchObject({
      kind: 'province',
      label: 'Pampanga',
      capital: 'San Fernando City',
    })
    expect(place?.latitude).toBeCloseTo(15.03, 1)
    expect(exactPlace('Metro Manila', gazetteer)).toMatchObject({ capital: 'Manila City' })
  })

  it('finds a town by its name with or without "City"', () => {
    for (const text of ['Tagum', 'tagum city', 'City of Tagum', 'Tagum, Davao del Norte']) {
      expect(exactPlace(text, gazetteer)).toMatchObject({ label: 'Tagum City, Davao del Norte' })
    }
    expect(exactPlace('Makati', gazetteer)).toMatchObject({ label: 'Makati City, Metro Manila' })
  })

  it('prefers the province over a town of the same name', () => {
    expect(exactPlace('Bulacan', gazetteer)).toMatchObject({
      kind: 'province',
      capital: 'Malolos City',
    })
  })

  it('suggests every town sharing a name, capitals first', () => {
    const labels = suggestPlaces('San Fernando', gazetteer).map((option) => option.label)
    expect(labels.slice(0, 2).sort()).toEqual([
      'San Fernando City, La Union',
      'San Fernando City, Pampanga',
    ])
    expect(labels.length).toBeGreaterThan(3)
  })

  it('suggests from a few letters and resolves the best one', () => {
    expect(suggestPlaces('t', gazetteer)).toEqual([])
    expect(suggestPlaces('tagu', gazetteer)[0].label).toBe('Tagum City, Davao del Norte')
    expect(bestPlace('tagu', gazetteer)?.label).toBe('Tagum City, Davao del Norte')
    expect(bestPlace('zzzz', gazetteer)).toBeNull()
  })
})
