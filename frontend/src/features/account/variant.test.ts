import { describe, expect, it } from 'vitest'
import { initials } from './variant.ts'

describe('initials', () => {
  it('takes the first letters of the first two words', () => {
    expect(initials('Maria Clara Santos')).toBe('MC')
    expect(initials('  juan   dela cruz ')).toBe('JD')
    expect(initials('Ñora')).toBe('Ñ')
  })

  it('is empty for a blank name', () => {
    expect(initials('   ')).toBe('')
  })
})
