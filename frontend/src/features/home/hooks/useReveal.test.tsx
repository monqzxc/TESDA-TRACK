import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockIntersectionObserver } from '../../../test/intersectionObserver.ts'
import { mockMediaQueries } from '../../../test/matchMedia.ts'
import { useReveal } from './useReveal.ts'

const REDUCE = '(prefers-reduced-motion: reduce)'

function Box({ name }: { name: string }) {
  const { ref, isIn } = useReveal<HTMLDivElement>()
  return (
    <div ref={ref} data-testid={name} data-in={isIn || undefined}>
      {name}
    </div>
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useReveal', () => {
  it('waits until the element scrolls into view, then lets it go', () => {
    mockMediaQueries({ [REDUCE]: false })
    const io = mockIntersectionObserver()
    render(<Box name="stop" />)
    const box = screen.getByTestId('stop')

    expect(box).not.toHaveAttribute('data-in')
    expect(io.observed()).toEqual([box])
    // The landing page's settings: 12% in view, above the bottom 12% of the window.
    expect(io.options()).toEqual([{ rootMargin: '0px 0px -12% 0px', threshold: 0.12 }])

    io.scrollIntoView(box)

    expect(box).toHaveAttribute('data-in')
    expect(io.observed()).toEqual([])
    expect(io.observerCount()).toBe(0)
  })

  it('watches every element with one observer, each until it is seen', () => {
    mockMediaQueries({ [REDUCE]: false })
    const io = mockIntersectionObserver()
    render(
      <>
        <Box name="first" />
        <Box name="second" />
      </>,
    )
    const [first, second] = [screen.getByTestId('first'), screen.getByTestId('second')]
    expect(io.observerCount()).toBe(1)

    io.scrollIntoView(first)

    expect(first).toHaveAttribute('data-in')
    expect(second).not.toHaveAttribute('data-in')
    expect(io.observed()).toEqual([second])
  })

  it('stops watching when the element goes away', () => {
    mockMediaQueries({ [REDUCE]: false })
    const io = mockIntersectionObserver()
    const { unmount } = render(<Box name="stop" />)
    expect(io.observed()).toHaveLength(1)

    unmount()

    expect(io.observed()).toEqual([])
    expect(io.observerCount()).toBe(0)
  })

  it('shows everything at once with reduced motion', () => {
    const device = mockMediaQueries({ [REDUCE]: true })
    mockIntersectionObserver()
    render(<Box name="stop" />)

    expect(screen.getByTestId('stop')).toHaveAttribute('data-in')

    // Turned off while the page is open: what hasn't scrolled into view yet waits for it.
    act(() => device.set(REDUCE, false))
    expect(screen.getByTestId('stop')).not.toHaveAttribute('data-in')
  })

  it('shows everything at once where scrolling cannot be watched', () => {
    mockMediaQueries({ [REDUCE]: false })
    vi.stubGlobal('IntersectionObserver', undefined)
    render(<Box name="stop" />)

    expect(screen.getByTestId('stop')).toHaveAttribute('data-in')
  })
})
