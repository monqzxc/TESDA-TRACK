import { beforeEach, describe, expect, it } from 'vitest'
import { EXPLORE_KEY } from './key.ts'
import { revealKey, type Search, useExploreStore } from './useExplore.ts'

const search = (query: string, codes: string[]): Search => ({
  query,
  result: {
    profile: { intent: 'training_recommendation' },
    matches: codes.map((code) => ({
      qualification: { code, name: code, sector: '' },
      score: 80,
      reason: '',
    })),
  } as unknown as Search['result'],
})

const store = () => useExploreStore.getState()

beforeEach(() => {
  sessionStorage.clear()
  store().reset()
})

describe('guided store', () => {
  it('openQualification picks the code', () => {
    store().setSearch(search('drive', ['DRIVING-NC-II', 'DRIVING-NC-III']))
    store().openQualification('DRIVING-NC-III')
    expect(store().picked).toEqual(['DRIVING-NC-III'])
    expect(store().guidedFocus).toEqual({ kind: 'qualification', code: 'DRIVING-NC-III' })
  })

  it('openRegion saves and closeGuided restores the range', () => {
    store().setSearch(search('drive', ['DRIVING-NC-II']))
    store().setRange(10)
    store().openRegion('DRIVING-NC-II', 'III')
    expect(store().relocate).toBe(true)
    expect(store().guidedFocus).toEqual({
      kind: 'region',
      code: 'DRIVING-NC-II',
      regionCode: 'III',
      previous: { rangeKm: 10, relocate: false },
    })
    store().closeGuided()
    expect(store().relocate).toBe(false)
    expect(store().rangeKm).toBe(10)
    expect(store().guidedFocus).toBeNull()
    expect(store().picked).toEqual([])
  })

  it('back from a considered card restores the search', () => {
    const original = search('drive', ['DRIVING-NC-II'])
    store().setSearch(original)
    const chosen = { ...search('Customer Services', ['CUSTOMER-SERVICES-NC-II']), chosen: true }
    store().openConsidered(chosen)
    expect(store().search).toEqual(chosen)
    expect(store().guidedBack).toEqual(original)
    expect(store().guidedFocus).toEqual({ kind: 'qualification', code: 'CUSTOMER-SERVICES-NC-II' })
    store().closeGuided()
    expect(store().search).toEqual(original)
    expect(store().guidedBack).toBeNull()
    expect(store().guidedFocus).toBeNull()
  })

  it('a new typed search clears focus and back', () => {
    store().setSearch(search('drive', ['DRIVING-NC-II']))
    store().openConsidered(search('Cookery', ['COOKERY-NC-II']))
    store().setSearch(search('weld', ['SMAW-NC-II']))
    expect(store().guidedFocus).toBeNull()
    expect(store().guidedBack).toBeNull()
  })

  it('keeps the played reveal across a search change and a range change', () => {
    store().markRevealed('drive|DRIVING-NC-II')
    store().setRange(30)
    store().setSearch(search('weld', ['SMAW-NC-II']))
    expect(store().revealedFor).toBe('drive|DRIVING-NC-II')
  })

  it('guidedBack survives persist, revealedFor does not', () => {
    store().setSearch(search('drive', ['DRIVING-NC-II']))
    store().openConsidered(search('Cookery', ['COOKERY-NC-II']))
    store().markRevealed('drive|DRIVING-NC-II')
    const saved = JSON.parse(sessionStorage.getItem(EXPLORE_KEY) ?? '{}').state
    expect(saved.guidedBack.query).toBe('drive')
    expect(saved.guidedFocus).toEqual({ kind: 'qualification', code: 'COOKERY-NC-II' })
    expect(saved).not.toHaveProperty('revealedFor')
  })
})

describe('revealKey', () => {
  it('is order-independent', () => {
    expect(revealKey(search('drive', ['B', 'A']))).toBe('drive|A,B')
    expect(revealKey(search('drive', ['A', 'B']))).toBe('drive|A,B')
    expect(revealKey(null)).toBeNull()
  })
})
