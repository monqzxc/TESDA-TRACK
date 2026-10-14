// Saved preferences. localStorage can be missing or throw (private windows, blocked site data, a full quota), so
// every read and write is wrapped: a failure means nothing is saved, never a broken page.

/**
 * The saved theme: "system", "light" or "dark".
 *
 * public/theme-init.js reads the same key before the first paint, and it is the source of truth: change the key
 * there too (storage.test.ts checks that they match).
 */
export const THEME_KEY = 'tesda-track.theme'

export function readItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Not saved: the choice still applies until the page is closed.
  }
}

export function removeItem(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Nothing to remove.
  }
}
