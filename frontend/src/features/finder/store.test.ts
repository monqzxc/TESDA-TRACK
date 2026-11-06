import { afterEach, describe, expect, it, vi } from 'vitest'
import { FINDER_KEY, GOAL_MAX_LENGTH, useFinderStore } from './store.ts'

afterEach(() => {
  useFinderStore.getState().reset()
  window.sessionStorage.clear()
  vi.restoreAllMocks()
})

describe('finder store', () => {
  it('keeps the goal as typed, trimmed and cut to the limit', () => {
    useFinderStore.getState().startWithGoal('  I want to <b>weld</b> boats  ')
    expect(useFinderStore.getState().goal).toBe('I want to <b>weld</b> boats')

    useFinderStore.getState().startWithGoal('x'.repeat(GOAL_MAX_LENGTH + 20))
    expect(useFinderStore.getState().goal).toHaveLength(GOAL_MAX_LENGTH)
  })

  it('saves to sessionStorage, not localStorage', () => {
    useFinderStore.getState().startWithGoal('Be a welder')
    expect(window.sessionStorage.getItem(FINDER_KEY)).toContain('Be a welder')
    expect(window.localStorage.getItem(FINDER_KEY)).toBeNull()
  })

  it('starts a new journey without the old goal’s answers and results (US-01)', () => {
    const store = useFinderStore.getState()
    const profile = { intent: 'unknown' as const }
    store.begin({ query: 'Be a welder', profile, sessionId: null, sessionOwner: null })
    store.setExperience('1-3')
    store.choose('SMAW-NCII')
    store.answer('SMAW-NCII', 4, 'confident')
    store.setPart('SMAW-NCII', 1)

    useFinderStore
      .getState()
      .begin({ query: 'Be a cook', profile, sessionId: null, sessionOwner: null })

    const state = useFinderStore.getState()
    expect(state.journey?.query).toBe('Be a cook')
    expect(state).toMatchObject({
      experience: null,
      selected: null,
      answers: {},
      parts: {},
      checks: {},
    })
  })

  it('asks about a recommendation again once a new result replaces it, and forgets answers with the goal', () => {
    const store = useFinderStore.getState()
    const goal = (query: string) =>
      ({ query, profile: { intent: 'unknown' }, sessionId: null, sessionOwner: null }) as const
    const check = (score: number) => ({
      result: { score, level: 'Low readiness', strengths: [], skill_gaps: [], recommendation: '' },
      answers: {},
      saved: false,
    })
    store.begin(goal('Be a welder'))
    store.setCheck('SMAW-NCII', check(25))
    store.setCheck('CKY-NCII', check(25))
    store.setFeedback('SMAW-NCII', { id: 'a', satisfied: true, reason: null })
    store.setFeedback('CKY-NCII', { id: 'b', satisfied: false, reason: null })

    useFinderStore.getState().setCheck('SMAW-NCII', check(50))
    expect(Object.keys(useFinderStore.getState().feedback)).toEqual(['CKY-NCII'])

    useFinderStore.getState().begin(goal('Be a cook'))
    expect(useFinderStore.getState().feedback).toEqual({})
  })

  it('keeps the goal box’s text from a version 1 save', async () => {
    window.sessionStorage.setItem(
      FINDER_KEY,
      JSON.stringify({ state: { goal: 'Become an electrician' }, version: 1 }),
    )
    await useFinderStore.persist.rehydrate()
    expect(useFinderStore.getState()).toMatchObject({
      goal: 'Become an electrician',
      journey: null,
    })
  })

  it('still works when sessionStorage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    useFinderStore.getState().startWithGoal('Be a cook')
    expect(useFinderStore.getState().goal).toBe('Be a cook')
  })
})

describe('final recommendation career goal', () => {
  it('replaces one selected occupation, survives rehydration, and preserves matching and readiness', async () => {
    const store = useFinderStore.getState()
    store.begin({
      query: 'Electrician',
      profile: { intent: 'unknown' },
      sessionId: null,
      sessionOwner: null,
    })
    store.choose('EIM-NC-II')
    store.answer('EIM-NC-II', 1, 'confident')
    store.setCheck('EIM-NC-II', {
      result: {
        score: 80,
        level: 'High readiness',
        strengths: [],
        skill_gaps: [],
        recommendation: '',
      },
      answers: { '1': 'confident' },
      saved: false,
    })
    const before = useFinderStore.getState()
    store.setCareerGoal({ key: 'electrician', title: 'Electrician' })
    store.setCareerGoal({
      key: 'electrical maintenance worker',
      title: 'Electrical Maintenance Worker',
    })
    await useFinderStore.persist.rehydrate()
    const after = useFinderStore.getState()
    expect(after.careerGoal?.title).toBe('Electrical Maintenance Worker')
    expect(after.journey).toEqual(before.journey)
    expect(after.selected).toBe(before.selected)
    expect(after.checks).toEqual(before.checks)
    expect(after.answers).toEqual(before.answers)
    store.begin({
      query: 'Cook',
      profile: { intent: 'unknown' },
      sessionId: null,
      sessionOwner: null,
    })
    expect(useFinderStore.getState().careerGoal).toBeNull()
  })

  it('opens legacy version-2 journeys without an occupation and clears selection on reset', async () => {
    useFinderStore.getState().reset()
    const journey = {
      query: 'Welder',
      profile: { intent: 'unknown' },
      sessionId: null,
      sessionOwner: null,
      synced: null,
    }
    window.sessionStorage.setItem(FINDER_KEY, JSON.stringify({ state: { journey }, version: 2 }))
    await useFinderStore.persist.rehydrate()
    expect(useFinderStore.getState().journey?.query).toBe('Welder')
    expect(useFinderStore.getState().careerGoal).toBeNull()
    useFinderStore.getState().setCareerGoal({ key: 'welder', title: 'Welder' })
    useFinderStore.getState().reset()
    expect(useFinderStore.getState().careerGoal).toBeNull()
  })
})
