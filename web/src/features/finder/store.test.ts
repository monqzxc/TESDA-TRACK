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

  it('still works when sessionStorage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    useFinderStore.getState().startWithGoal('Be a cook')
    expect(useFinderStore.getState().goal).toBe('Be a cook')
  })
})
