import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockMediaQueries } from '../../test/matchMedia.ts'
import { ChatDock, type DockMode } from './ChatDock.tsx'

function Harness({
  phone = false,
  start = 'docked' as DockMode,
  onSubmit = () => {},
}: {
  phone?: boolean
  start?: DockMode
  onSubmit?: () => void
}) {
  const [mode, setMode] = useState<DockMode>(start)
  return (
    <div>
      <button type="button">Map</button>
      <ChatDock
        mode={mode}
        onMode={setMode}
        phone={phone}
        line={<span>7 results</span>}
        tray={
          <div data-testid="tray-scroll" style={{ overflow: 'auto' }}>
            <p>Card one</p>
          </div>
        }
        composer={
          <form
            onSubmit={(event) => {
              event.preventDefault()
              onSubmit()
            }}
          >
            <input aria-label="Query" />
            <button type="submit">Send</button>
          </form>
        }
      />
      <output data-testid="mode">{mode}</output>
    </div>
  )
}

const mode = () => screen.getByTestId('mode').textContent
const unit = () => screen.getByTestId('chat-dock')

beforeEach(() => mockMediaQueries({}))
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('ChatDock', () => {
  it('pointerdown on the composer focuses', () => {
    render(<Harness />)
    fireEvent.pointerDown(screen.getByRole('textbox', { name: 'Query' }))
    expect(mode()).toBe('focused')
  })

  it('a press on the tray line focuses', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: '7 results' }))
    expect(mode()).toBe('focused')
    expect(screen.getByRole('button', { name: '7 results' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('pointerdown outside docks', () => {
    render(<Harness start="focused" />)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Map' }))
    expect(mode()).toBe('docked')
  })

  it('a press inside a popover does not dock', () => {
    render(<Harness start="focused" />)
    const popover = document.createElement('div')
    popover.setAttribute('role', 'dialog')
    const inside = document.createElement('button')
    popover.append(inside)
    document.body.append(popover)
    fireEvent.pointerDown(inside)
    expect(mode()).toBe('focused')
    popover.remove()
  })

  it('Escape docks and keeps the field focused', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('textbox', { name: 'Query' }))
    expect(mode()).toBe('focused')
    await user.keyboard('{Escape}')
    expect(mode()).toBe('docked')
    expect(screen.getByRole('textbox', { name: 'Query' })).toHaveFocus()
    // Typing again brings it back.
    await user.keyboard('a')
    expect(mode()).toBe('focused')
  })

  it('the scrim docks and the press goes no further', () => {
    render(<Harness start="focused" />)
    const scrim = screen.getByTestId('chat-dock-scrim')
    const event = new Event('pointerdown', { bubbles: true, cancelable: true })
    act(() => {
      scrim.dispatchEvent(event)
    })
    expect(mode()).toBe('docked')
    expect(event.defaultPrevented).toBe(true)
  })

  it('submit keeps it focused', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<Harness onSubmit={onSubmit} />)
    await user.click(screen.getByRole('textbox', { name: 'Query' }))
    await user.click(screen.getByRole('button', { name: 'Send' }))
    expect(onSubmit).toHaveBeenCalled()
    expect(mode()).toBe('focused')
  })

  it('tray content survives a dock', () => {
    render(<Harness start="focused" />)
    const scroller = screen.getByTestId('tray-scroll')
    scroller.scrollTop = 120
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Map' }))
    fireEvent.pointerDown(screen.getByRole('textbox', { name: 'Query' }))
    expect(screen.getByTestId('tray-scroll')).toBe(scroller)
    expect(scroller.scrollTop).toBe(120)
  })

  it('desktop focus scales, then moves', async () => {
    vi.useFakeTimers()
    render(<Harness />)
    fireEvent.pointerDown(screen.getByRole('textbox', { name: 'Query' }))
    expect(unit().style.transform).toContain('scale(1.02)')
    expect(unit().style.transform).not.toContain('translateY(-')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(130)
    })
    expect(unit().style.transform).toMatch(/translateY\(-?\d/)
  })

  it('phone has no transform', () => {
    render(<Harness phone start="focused" />)
    expect(unit().style.transform).toBe('')
    expect(screen.queryByTestId('chat-dock-scrim')).toBeNull()
  })

  it('reduced motion has no transform transition', () => {
    mockMediaQueries({ '(prefers-reduced-motion: reduce)': true })
    render(<Harness />)
    fireEvent.pointerDown(screen.getByRole('textbox', { name: 'Query' }))
    expect(unit().style.transition).not.toContain('transform')
  })
})
