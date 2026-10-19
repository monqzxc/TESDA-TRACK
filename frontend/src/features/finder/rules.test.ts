import { describe, expect, it } from 'vitest'
import { answeredProfile, sameSessionState, sessionState, verdictFor } from './rules.ts'
import type { Profile, ReadinessResult } from './store.ts'

const blank: Profile = {
  career_goal: 'Welder',
  existing_skills: [],
  experience_years: null,
  has_certification: null,
  intent: 'training_recommendation',
}

describe('answeredProfile', () => {
  it('fills the blanks the goal left with the follow-up answers', () => {
    expect(answeredProfile(blank, '1-3', 'no')).toMatchObject({
      experience_years: 2,
      has_certification: false,
    })
    expect(answeredProfile(blank, 'under-1', 'yes')).toMatchObject({
      experience_years: 0.5,
      has_certification: true,
    })
  })

  it('leaves the certification unknown for "I’m not sure"', () => {
    expect(answeredProfile(blank, 'none', 'unsure').has_certification).toBeNull()
  })

  it('keeps what the goal itself said', () => {
    const said = { ...blank, experience_years: 5, has_certification: false }
    expect(answeredProfile(said, 'none', 'yes')).toMatchObject({
      experience_years: 5,
      has_certification: false,
    })
  })

  it('leaves blanks blank until they are answered', () => {
    expect(answeredProfile(blank, null, null)).toMatchObject({
      experience_years: null,
      has_certification: null,
    })
  })
})

describe('sessionState', () => {
  it('holds what a saved recommendation session records, and compares by value', () => {
    const state = sessionState(answeredProfile(blank, '1-3', 'no'), 'SMAW-NCII')
    expect(state).toEqual({
      experience_years: 2,
      has_certification: false,
      qualification_code: 'SMAW-NCII',
    })
    expect(sameSessionState(state, { ...state })).toBe(true)
    expect(sameSessionState(state, { ...state, qualification_code: null })).toBe(false)
    expect(sameSessionState(null, state)).toBe(false)
  })
})

describe('verdictFor', () => {
  const result = (score: number, level: string): ReadinessResult => ({
    score,
    level,
    strengths: [],
    skill_gaps: [],
    recommendation: '',
  })

  it('reads the level’s first word', () => {
    expect(verdictFor(result(85, 'High readiness'))).toBe('high')
    expect(verdictFor(result(60, 'Moderate Readiness'))).toBe('moderate')
    expect(verdictFor(result(20, 'Low readiness'))).toBe('low')
  })

  it('falls back to the 80% and 50% bands for a level it doesn’t know', () => {
    expect(verdictFor(result(80, 'Ready'))).toBe('high')
    expect(verdictFor(result(79.5, 'Ready'))).toBe('moderate')
    expect(verdictFor(result(50, ''))).toBe('moderate')
    expect(verdictFor(result(49, ''))).toBe('low')
  })
})
