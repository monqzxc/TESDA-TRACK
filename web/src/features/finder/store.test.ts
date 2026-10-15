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
