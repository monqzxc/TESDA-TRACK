import { describe, expect, it } from 'vitest'
import { partialPath } from './routeDraw.ts'

// Three points on the equator, the second leg twice as long as the first.
const path = [
  [0, 0],
  [0, 1],
  [0, 3],
]

describe('partialPath', () => {
  it('is the whole path at the end, and its first point at the start', () => {
    expect(partialPath(path, 1)).toEqual(path)
    expect(partialPath(path, 0)).toEqual([[0, 0]])
  })

  it('goes evenly by distance, ending between two points', () => {
    // A sixth of 3 is half the first leg.
    expect(partialPath(path, 1 / 6)).toEqual([
      [0, 0],
      [0, 0.5],
    ])
    // Two thirds of 3 is the first leg and half the second.
    expect(partialPath(path, 2 / 3)).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
    ])
  })

  it('leaves a path too short to draw as it is', () => {
    expect(partialPath([[1, 2]], 0.5)).toEqual([[1, 2]])
  })
})
