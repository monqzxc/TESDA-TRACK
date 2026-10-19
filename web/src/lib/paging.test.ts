import { describe, expect, it } from 'vitest'
import { clampPage, pageCount, pageOf } from './paging.ts'

const items = Array.from({ length: 25 }, (_, i) => i + 1)

describe('pageCount', () => {
  it('rounds up, and is at least one', () => {
    expect(pageCount(25, 12)).toBe(3)
    expect(pageCount(24, 12)).toBe(2)
    expect(pageCount(0, 12)).toBe(1)
  })
})

describe('clampPage', () => {
  it('keeps a page number in range, and reads anything else as the first page', () => {
    expect(clampPage(2, 3)).toBe(2)
    expect(clampPage(9, 3)).toBe(3)
    expect(clampPage(0, 3)).toBe(1)
    expect(clampPage(Number.NaN, 3)).toBe(1)
    expect(clampPage(1.5, 3)).toBe(1)
  })
})

describe('pageOf', () => {
  it('gives one page of items and where they sit in the whole list', () => {
    expect(pageOf(items, 3, 12)).toEqual({ items: [25], page: 3, pages: 3, first: 25, last: 25 })
    expect(pageOf(items, 1, 12)).toMatchObject({ first: 1, last: 12 })
  })

  it('shows the last page for a page past the end', () => {
    expect(pageOf(items, 7, 12).page).toBe(3)
  })

  it('has nothing to show for an empty list', () => {
    expect(pageOf([], 1, 12)).toEqual({ items: [], page: 1, pages: 1, first: 0, last: 0 })
  })
})
