import { describe, expect, it } from 'vitest'
import { FOCUS_SCALE, focusedOffset, TOP_CLEAR } from './dockOffset.ts'

describe('focusedOffset', () => {
  it('centers the unit', () => {
    expect(focusedOffset({ height: 900 }, { top: 600, height: 200 })).toBe(-250)
  })
  it('clamps the focused offset', () => {
    const offset = focusedOffset({ height: 600 }, { top: 300, height: 500 })
    expect(300 + offset).toBe(TOP_CLEAR)
  })
  it('moves a tall unit down to the middle', () => {
    // Docked, a tall open tray reaches near the top: centered, it comes down a little.
    expect(focusedOffset({ height: 900 }, { top: 56, height: 754 })).toBe(17)
  })
  it('scales a little', () => {
    expect(FOCUS_SCALE).toBe(1.02)
  })
})
