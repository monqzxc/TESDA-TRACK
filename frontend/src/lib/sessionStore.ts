import type { StateStorage } from 'zustand/middleware'

// Work kept for this tab only: sessionStorage survives a refresh and is cleared when the tab closes, which suits
// shared computers. It can be missing or throw (private windows, blocked site data), so every call is wrapped: a
// failure means nothing is saved, never a broken page.

export const sessionStore: StateStorage = {
  getItem: (key) => {
    try {
      return window.sessionStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem: (key, value) => {
    try {
      window.sessionStorage.setItem(key, value)
    } catch {
      // Not saved: the work still applies until the page is closed.
    }
  },
  removeItem: (key) => {
    try {
      window.sessionStorage.removeItem(key)
    } catch {
      // Nothing to remove.
    }
  },
}
