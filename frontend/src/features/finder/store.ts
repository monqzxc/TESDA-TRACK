import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import type { components } from '../../api/schema.d.ts'
import { FINDER_KEY } from './key.ts'

// The finder's state: the learner's goal and their work towards a pathway. It lives in sessionStorage, so a refresh
// keeps the learner's work (US-14) and closing the tab clears it, which suits shared computers. The goal never goes
// into an address: pages that start the finder with a goal (Home, the Library) call startWithGoal, then navigate.
// Nothing here calls the API; the finder's pages do, and record what came back.

export { FINDER_KEY }

/** The goal box's limit, as in the Streamlit app and the API. */
export const GOAL_MAX_LENGTH = 500

export type Profile = components['schemas']['Profile']
export type ReadinessResult = components['schemas']['ReadinessResult']

/** A readiness answer, as the API takes it. */
export type Answer = 'confident' | 'some_experience' | 'not_familiar'
/** Answers for one qualification, by competency id. */
export type Answers = Record<string, Answer>

/** The follow-up questions' answers, for a goal that didn't say (classic/app.py EXPERIENCE_OPTIONS). */
export type ExperienceAnswer = 'none' | 'under-1' | '1-3' | 'over-3'
export type CertificationAnswer = 'yes' | 'no' | 'unsure'

/** What a signed-in learner's saved recommendation session holds, as last sent to the API. */
export interface SessionState {
  experience_years: number | null
  has_certification: boolean | null
  qualification_code: string | null
}

/** A submitted goal. */
export interface Journey {
  query: string
  /** The API's reading of the goal alone. Its blanks are what the follow-up questions ask about. */
  profile: Profile
  /** The signed-in learner's recommendation session for this goal (/me/recommendations), once there is one. */
  sessionId: string | null
  /** Whose session it is: another learner signing in on this tab must not write to it. */
  sessionOwner: string | null
  /** What the session last saved, so only changes are sent. */
  synced: SessionState | null
}

/** A readiness check's result, with the answers it was worked out from. */
export interface SubmittedCheck {
  result: ReadinessResult
  answers: Answers
  /** Saved to the learner's account (/me/readiness-checks), not only worked out. */
  saved: boolean
}

export interface FinderState {
  /** The goal box's text: a draft until it's submitted. */
  goal: string
  journey: Journey | null
  experience: ExperienceAnswer | null
  certification: CertificationAnswer | null
  /** The qualification the learner chose. Until they do, the finder goes with the top match. */
  selected: string | null
  /** Readiness answers, by qualification code: kept while the learner moves between parts and steps. */
  answers: Record<string, Answers>
  /** The readiness part on screen, by qualification code. */
  parts: Record<string, number>
  /** The last submitted readiness check, by qualification code. */
  checks: Record<string, SubmittedCheck>

  /** Puts a goal in the goal box, as typed (trimmed and cut to the limit), for the learner to review. */
  startWithGoal: (goal: string) => void
  /** The learner typing in the goal box. */
  setGoal: (goal: string) => void
  /** A new goal was analysed: it starts a new journey, and the old goal's answers and results go (US-01). */
  begin: (journey: Pick<Journey, 'query' | 'profile' | 'sessionId' | 'sessionOwner'>) => void
  setExperience: (answer: ExperienceAnswer) => void
  setCertification: (answer: CertificationAnswer) => void
  choose: (code: string) => void
  answer: (code: string, competencyId: number, answer: Answer) => void
  setPart: (code: string, part: number) => void
  setCheck: (code: string, check: SubmittedCheck) => void
  markCheckSaved: (code: string) => void
  /** The journey's recommendation session was created, for this learner. */
  setSession: (sessionId: string, owner: string) => void
  setSynced: (synced: SessionState) => void
  /** Clears all finder work, e.g. on sign-out. */
  reset: () => void
}

const EMPTY = {
  goal: '',
  journey: null,
  experience: null,
  certification: null,
  selected: null,
  answers: {},
  parts: {},
  checks: {},
} satisfies Partial<FinderState>

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

const clean = (goal: string) => goal.slice(0, GOAL_MAX_LENGTH)

export const useFinderStore = create<FinderState>()(
  persist(
    (set) => ({
      ...EMPTY,
      startWithGoal: (goal) => set({ goal: clean(goal.trim()) }),
      setGoal: (goal) => set({ goal: clean(goal) }),
      begin: (journey) =>
        set({
          journey: { ...journey, synced: null },
          experience: null,
          certification: null,
          selected: null,
          answers: {},
          parts: {},
          checks: {},
        }),
      setExperience: (experience) => set({ experience }),
      setCertification: (certification) => set({ certification }),
      choose: (selected) => set({ selected }),
      answer: (code, competencyId, answer) =>
        set((state) => ({
          answers: { ...state.answers, [code]: { ...state.answers[code], [competencyId]: answer } },
        })),
      setPart: (code, part) => set((state) => ({ parts: { ...state.parts, [code]: part } })),
      setCheck: (code, check) => set((state) => ({ checks: { ...state.checks, [code]: check } })),
      markCheckSaved: (code) =>
        set((state) => {
          const check = state.checks[code]
          return check ? { checks: { ...state.checks, [code]: { ...check, saved: true } } } : {}
        }),
      setSession: (sessionId, sessionOwner) =>
        set((state) =>
          state.journey
            ? { journey: { ...state.journey, sessionId, sessionOwner, synced: null } }
            : {},
        ),
      setSynced: (synced) =>
        set((state) => (state.journey ? { journey: { ...state.journey, synced } } : {})),
      reset: () => set(EMPTY),
    }),
    {
      name: FINDER_KEY,
      storage: createJSONStorage(() => sessionStore),
      version: 2,
      // Version 1 kept only the goal box's text.
      migrate: (saved, version) => {
        const goal =
          version === 1 && typeof saved === 'object' && saved !== null && 'goal' in saved
            ? String(saved.goal)
            : ''
        return { ...EMPTY, goal: clean(goal) } as FinderState
      },
    },
  ),
)
