import { act } from '@testing-library/react'
import { vi } from 'vitest'

/**
 * jsdom has no IntersectionObserver. This stands in for it: `observed` lists what's being watched, and
 * `scrollIntoView` and `scrollOutOfView` report elements coming into view and leaving it, as a browser does when
 * the page scrolls.
 */
export function mockIntersectionObserver() {
  const observers = new Set<MockObserver>()

  class MockObserver {
    readonly elements = new Set<Element>()
    readonly options: IntersectionObserverInit | undefined
    private readonly callback: IntersectionObserverCallback

    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      this.callback = callback
      this.options = options
      observers.add(this)
    }

    observe(element: Element) {
      this.elements.add(element)
    }

    unobserve(element: Element) {
      this.elements.delete(element)
    }

    disconnect() {
      this.elements.clear()
      observers.delete(this)
    }

    takeRecords(): IntersectionObserverEntry[] {
      return []
    }

    report(elements: Element[], change: Partial<IntersectionObserverEntry>) {
      this.reportEach(elements.map((element) => [element, change]))
    }

    reportEach(changes: [Element, Partial<IntersectionObserverEntry>][]) {
      const entries = changes
        .filter(([element]) => this.elements.has(element))
        .map(([target, change]) => ({ target, ...change }) as IntersectionObserverEntry)
      if (entries.length) this.callback(entries, this as unknown as IntersectionObserver)
    }
  }

  vi.stubGlobal('IntersectionObserver', MockObserver)

  return {
    /** Every element being watched, by any observer. */
    observed: () => [...observers].flatMap((observer) => [...observer.elements]),
    /** How many observers are connected. */
    observerCount: () => observers.size,
    /** The settings each connected observer was made with. */
    options: () => [...observers].map((observer) => observer.options),
    /** Reports these elements as scrolled into view. */
    scrollIntoView(...elements: Element[]) {
      act(() => {
        for (const observer of [...observers]) observer.report(elements, { isIntersecting: true })
      })
    },
    /**
     * Reports an element out of view (its top this far from the window's) and back in, in one batch of entries, as a
     * browser can after a quick scroll.
     */
    scrollOutAndBack(element: Element, top: number) {
      const boundingClientRect = { top } as DOMRectReadOnly
      act(() => {
        for (const observer of [...observers]) {
          observer.reportEach([
            [element, { isIntersecting: false, boundingClientRect }],
            [element, { isIntersecting: true }],
          ])
        }
      })
    },
    /** Reports an element as scrolled out of view, with where it went (its top, from the window's). */
    scrollOutOfView(element: Element, top: number) {
      const boundingClientRect = { top } as DOMRectReadOnly
      act(() => {
        for (const observer of [...observers]) {
          observer.report([element], { isIntersecting: false, boundingClientRect })
        }
      })
    },
  }
}
