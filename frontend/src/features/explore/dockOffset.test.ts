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
  it('never moves the unit down', () => {
    expect(focusedOffset({ height: 900 }, { top: 100, height: 200 })).toBe(0)
  })
  it('scales a little', () => {
    expect(FOCUS_SCALE).toBe(1.02)
  })
})
