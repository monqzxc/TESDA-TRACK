import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'

// The finder's state: the learner's goal and their work towards a pathway. It lives in sessionStorage, so a refresh
// keeps the learner's work (US-14) and closing the tab clears it, which suits shared computers. The goal never goes
// into an address: pages that start the finder with a goal (Home, the Library) call startWithGoal, then navigate.
// Task 12 adds the answers, the chosen qualification and the readiness answers here.

export const FINDER_KEY = 'tesda-track.finder'

/** The goal box's limit, as in the Streamlit app and the API. */
export const GOAL_MAX_LENGTH = 500

/** sessionStorage can be missing or throw (private windows, blocked site data): then nothing is saved. */
const sessionStore: StateStorage = {
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

export interface FinderState {
  goal: string
  /** Starts the finder with a new goal, as typed (trimmed and cut to the limit). */
  startWithGoal: (goal: string) => void
  /** Clears all finder work, e.g. on "Change goal". */
  reset: () => void
}

export const useFinderStore = create<FinderState>()(
  persist(
    (set) => ({
      goal: '',
      startWithGoal: (goal) => set({ goal: goal.trim().slice(0, GOAL_MAX_LENGTH) }),
      reset: () => set({ goal: '' }),
    }),
    { name: FINDER_KEY, storage: createJSONStorage(() => sessionStore), version: 1 },
  ),
)
