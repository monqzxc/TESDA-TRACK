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
