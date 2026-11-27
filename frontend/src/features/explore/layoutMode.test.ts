import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LAYOUT_KEY, layoutMode } from './layoutMode.ts'

beforeEach(() => sessionStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('layoutMode', () => {
  it('param wins and is saved', () => {
    expect(layoutMode('?layout=guided', 'classic')).toBe('guided')
    expect(sessionStorage.getItem(LAYOUT_KEY)).toBe('guided')
    expect(layoutMode('?layout=classic&x=1', 'guided')).toBe('classic')
  })
  it('saved value is used', () => {
    sessionStorage.setItem(LAYOUT_KEY, 'guided')
    expect(layoutMode('', undefined)).toBe('guided')
  })
  it('fallback then the list', () => {
    expect(layoutMode('', 'guided')).toBe('guided')
    expect(layoutMode('', undefined)).toBe('list')
    expect(layoutMode('?layout=nonsense', 'nonsense')).toBe('list')
    expect(layoutMode('?layout=list', 'classic')).toBe('list')
  })
  it('storage throwing falls back', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(layoutMode('?layout=guided', undefined)).toBe('guided')
    expect(layoutMode('', 'guided')).toBe('guided')
  })
})
