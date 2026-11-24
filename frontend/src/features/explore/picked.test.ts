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
  it('selects one at a time: another replaces it', () => {
    const { togglePicked } = useExploreStore.getState()
    togglePicked('A')
    togglePicked('B')
    expect(useExploreStore.getState().picked).toEqual(['B'])
  })
  it('clears the selection when the selected one is tapped again', () => {
    const { togglePicked } = useExploreStore.getState()
    togglePicked('A')
    togglePicked('A')
    expect(useExploreStore.getState().picked).toEqual([])
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
  it('gives the demand focus back to the search when the selection is cleared', () => {
    const { togglePicked } = useExploreStore.getState()
    togglePicked('A')
    togglePicked('B')
    expect(useDemandStore.getState().code).toBe('B')
    togglePicked('B')
    expect(useDemandStore.getState().code).toBeUndefined()
  })
})
