import { beforeEach, describe, expect, it } from 'vitest'
import { useDemandStore, useExploreStore } from './useExplore.ts'

const search = (query: string) => ({
  query,
  result: { profile: { intent: 'training_recommendation' as const }, matches: [] },
})

beforeEach(() => {
  useExploreStore.getState().reset()
  useExploreStore.getState().setSearch(search('driver'))
})

describe('picked qualifications', () => {
  it('picks up to three', () => {
    const { togglePicked } = useExploreStore.getState()
    for (const code of ['A', 'B', 'C', 'D']) togglePicked(code)
    expect(useExploreStore.getState().picked).toEqual(['A', 'B', 'C'])
  })
  it('unpicks a picked one', () => {
    const { togglePicked } = useExploreStore.getState()
    for (const code of ['A', 'B', 'C', 'B']) togglePicked(code)
    expect(useExploreStore.getState().picked).toEqual(['A', 'C'])
  })
  it('clears the picks on a new search', () => {
    useExploreStore.getState().togglePicked('A')
    useExploreStore.getState().setSearch(search('mechanic'))
    expect(useExploreStore.getState().picked).toEqual([])
  })
  it('puts the demand focus on a newly picked qualification', () => {
    useExploreStore.getState().togglePicked('A')
    expect(useDemandStore.getState().code).toBe('A')
  })
  it('moves the demand focus back to what is still picked on an unpick', () => {
    const { togglePicked } = useExploreStore.getState()
    togglePicked('A')
    togglePicked('B')
    togglePicked('B')
    expect(useDemandStore.getState().code).toBe('A')
    togglePicked('A')
    expect(useDemandStore.getState().code).toBeUndefined()
  })
})
