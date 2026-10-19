import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockIntersectionObserver } from '../../test/intersectionObserver.ts'
import { mockMediaQueries } from '../../test/matchMedia.ts'
import { GoalConsole } from './GoalConsole.tsx'

const REDUCE = '(prefers-reduced-motion: reduce)'
const FIRST_GOAL = 'Gusto kong maging welder.'

let io: ReturnType<typeof mockIntersectionObserver>

/** The console, in view: its first goal is on show, and the cycle has started. */
function showConsole() {
  render(<GoalConsole />)
  const console = screen.getByRole('group', { name: 'Example: a goal matched to a qualification' })
  io.scrollIntoView(console)
  return console
}

/** Lets the console move on this many scenes (each a keystroke or a pause), if it's moving at all. */
function wait(scenes: number) {
  for (let i = 0; i < scenes; i++) act(() => vi.advanceTimersToNextTimer())
}

/** Enough scenes to see the goal change, if the console is moving at all. */
const A_WHILE = 12

function setTabHidden(hidden: boolean) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (hidden ? 'hidden' : 'visible'),
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('the hero console', () => {
  beforeEach(() => {
    mockMediaQueries({ [REDUCE]: false })
    io = mockIntersectionObserver()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    Reflect.deleteProperty(document, 'visibilityState')
  })

  it('moves on to the next goal once it is in view', () => {
    const console = showConsole()
    expect(console).toHaveTextContent(FIRST_GOAL)

    wait(A_WHILE)

    expect(console).not.toHaveTextContent(FIRST_GOAL)
  })

  it('holds still wherever it is while the pointer is on it, and carries on after', () => {
    const console = showConsole()
    // Part way through clearing the first goal.
    wait(4)
    const midway = console.textContent

    fireEvent.pointerEnter(console)
    wait(A_WHILE)

    expect(console.textContent).toBe(midway)

    fireEvent.pointerLeave(console)
    wait(A_WHILE)

    expect(console.textContent).not.toBe(midway)
  })

  it('holds still while focus is inside it', () => {
    const console = showConsole()

    fireEvent.focusIn(console)
    wait(A_WHILE)

    expect(console).toHaveTextContent(FIRST_GOAL)

    fireEvent.focusOut(console)
    wait(A_WHILE)

    expect(console).not.toHaveTextContent(FIRST_GOAL)
  })

  it('holds still while it is out of view', () => {
    const console = showConsole()

    io.scrollOutOfView(console, -900)
    wait(A_WHILE)

    expect(console).toHaveTextContent(FIRST_GOAL)
    expect(console).toHaveAttribute('data-paused')

    io.scrollIntoView(console)
    wait(A_WHILE)

    expect(console).not.toHaveTextContent(FIRST_GOAL)
  })

  it('holds still while the tab is hidden', () => {
    const console = showConsole()

    act(() => setTabHidden(true))
    wait(A_WHILE)

    expect(console).toHaveTextContent(FIRST_GOAL)

    act(() => setTabHidden(false))
    wait(A_WHILE)

    expect(console).not.toHaveTextContent(FIRST_GOAL)
  })
})
