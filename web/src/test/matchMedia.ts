import { vi } from 'vitest'

/**
 * jsdom has no matchMedia. This stands in for the device's prefers-color-scheme setting: `setDark` changes it and
 * tells every listener, as a browser does when the device switches.
 */
export function mockColorScheme(initiallyDark: boolean) {
  let dark = initiallyDark
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const query = {
    get matches() {
      return dark
    },
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.delete(listener),
  }
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => query),
  )
  return {
    setDark(next: boolean) {
      dark = next
      for (const listener of listeners) listener({ matches: next } as MediaQueryListEvent)
    },
    listenerCount: () => listeners.size,
  }
}

/**
 * Stands in for the device's settings, one media query at a time, e.g.
 * mockMediaQueries({ '(prefers-reduced-motion: reduce)': true }). Queries not named don't match. `set` changes one
 * and tells its listeners, as a browser does when the setting changes.
 */
export function mockMediaQueries(initial: Record<string, boolean>) {
  const matches = new Map(Object.entries(initial))
  const listeners = new Map<string, Set<(event: MediaQueryListEvent) => void>>()
  const listenersFor = (media: string) => {
    if (!listeners.has(media)) listeners.set(media, new Set())
    return listeners.get(media)!
  }
  vi.stubGlobal(
    'matchMedia',
    vi.fn((media: string) => ({
      get matches() {
        return matches.get(media) ?? false
      },
      media,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
        listenersFor(media).add(listener),
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
        listenersFor(media).delete(listener),
    })),
  )
  return {
    set(media: string, next: boolean) {
      matches.set(media, next)
      for (const listener of listenersFor(media)) {
        listener({ matches: next, media } as MediaQueryListEvent)
      }
    },
  }
}
