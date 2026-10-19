import { describe, expect, it } from 'vitest'
import { readinessLevel, readinessScore, STARTING_ANSWERS } from './readiness.ts'

describe('the readiness check', () => {
  it('averages the answers: Confident counts 1, Some experience a half, New to me nothing', () => {
    expect(readinessScore(['yes', 'yes', 'yes'])).toBe(100)
    expect(readinessScore(['yes', 'some', 'new', 'new'])).toBe(37.5)
    expect(readinessScore([])).toBe(0)
  })

  it('picks the band as the API does: 80 and up, 50 to 79, and below 50', () => {
    expect(readinessLevel(80)).toBe('high')
    expect(readinessLevel(79.9)).toBe('moderate')
    expect(readinessLevel(50)).toBe('moderate')
    expect(readinessLevel(49.9)).toBe('low')
  })

  it('starts at 60%, moderate, as on the landing page', () => {
    expect(readinessScore(STARTING_ANSWERS)).toBe(60)
  })
})
