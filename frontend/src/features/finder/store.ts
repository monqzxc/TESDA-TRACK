import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import type { components } from '../../api/schema.d.ts'
import { FINDER_KEY, GOAL_MAX_LENGTH } from './key.ts'

// The finder's state: the learner's goal and their work towards a pathway. It lives in sessionStorage, so a refresh
// keeps the learner's work (US-14) and closing the tab clears it, which suits shared computers. The goal never goes
// into an address: pages that start the finder with a goal (Home, the Library) call startWithGoal, then navigate.
// Nothing here calls the API; the finder's pages do, and record what came back.

export { FINDER_KEY, GOAL_MAX_LENGTH }

export type Profile = components['schemas']['Profile']
/** goal: a sentence about what the learner wants. skills: a list of skills or job titles, each matched on its own. */
export type SearchMode = components['schemas']['MatchRequest']['mode'] & string
export type ReadinessResult = components['schemas']['ReadinessResult']
/** The learner's answer about a recommendation, as the API recorded it. */
export type GivenFeedback = components['schemas']['FeedbackPublic']

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

/**
 * Where the pathway report looks for options. The region only sorts them by distance from its center; none of it
 * belongs to a goal, so a new goal keeps it.
 */
export interface ReportPlace {
  region: string | null
  mode: components['schemas']['PathwayReportRequest']['preferred_delivery_mode']
  scholarship: boolean
}

/**
 * Where a goal entered in the TSP webview came from: typed there, or a suggestion from the learner's TSP profile that
 * they tapped. Only the webview sets it; the API counts webview steps by it, so pilot uptake can be compared.
 */
export type GoalOrigin = 'typed' | 'suggestion'

/** A submitted goal. */
export interface Journey {
  query: string
  /** Set only in the TSP webview (see GoalOrigin). */
  origin?: GoalOrigin
  /** The API's reading of the goal alone. Its blanks are what the follow-up questions ask about. */
  profile: Profile
  /** The signed-in learner's recommendation session for this goal (/me/recommendations), once there is one. */
  sessionId: string | null
  /** Whose session it is: another learner signing in on this tab must not write to it. */
  sessionOwner: string | null
  /** What the session last saved, so only changes are sent. */
  synced: SessionState | null
  /** How the learner searched; a journey from before skills search has none, and was a goal. */
  mode?: SearchMode
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
  /** The skills box's text, kept apart from the goal's so switching tabs loses neither. */
  skills: string
  /** The Goal step's tab. */
  searchMode: SearchMode
  journey: Journey | null
  /** One occupation chosen in final recommendations; independent of matching and readiness. */
  careerGoal: { key: string; title: string } | null
  careerGoalJourneyKey: string | null
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
  /** The learner's answer about the recommendation from that check, by qualification code. */
  feedback: Record<string, GivenFeedback>
  /** Where the pathway report looks for options. */
  place: ReportPlace

  /** Puts a goal in the goal box, as typed (trimmed and cut to the limit), for the learner to review. */
  startWithGoal: (goal: string) => void
  /** The learner typing in the goal box. */
  setGoal: (goal: string) => void
  /** The learner typing in the skills box. */
  setSkills: (skills: string) => void
  setSearchMode: (mode: SearchMode) => void
  /** A new goal was analysed: it starts a new journey, and the old goal's answers and results go (US-01). */
  begin: (
    journey: Pick<Journey, 'query' | 'origin' | 'profile' | 'sessionId' | 'sessionOwner' | 'mode'>,
  ) => void
  setExperience: (answer: ExperienceAnswer) => void
  setCertification: (answer: CertificationAnswer) => void
  setCareerGoalJourneyKey: (key: string) => void
  setCareerGoal: (goal: { key: string; title: string }) => void
  choose: (code: string) => void
  answer: (code: string, competencyId: number, answer: Answer) => void
  setPart: (code: string, part: number) => void
  /** A new result is a new recommendation, so any answer about the last one goes. */
  setCheck: (code: string, check: SubmittedCheck) => void
  /** Reopens a saved check with the answers and result it was based on. */
  restoreCheck: (code: string, check: SubmittedCheck) => void
  markCheckSaved: (code: string) => void
  setFeedback: (code: string, feedback: GivenFeedback) => void
  setPlace: (place: Partial<ReportPlace>) => void
  /** The journey's recommendation session was created, for this learner. */
  setSession: (sessionId: string, owner: string) => void
  setSynced: (synced: SessionState) => void
  /** Clears all finder work, e.g. on sign-out. */
  reset: () => void
}

const EMPTY = {
  goal: '',
  skills: '',
  searchMode: 'goal' as SearchMode,
  journey: null,
  careerGoal: null,
  careerGoalJourneyKey: null,
  experience: null,
  certification: null,
  selected: null,
  answers: {},
  parts: {},
  checks: {},
  feedback: {},
  place: { region: null, mode: null, scholarship: false },
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
      // A goal from another page opens the goal tab, where it was put.
      startWithGoal: (goal) => set({ goal: clean(goal.trim()), searchMode: 'goal' }),
      setGoal: (goal) => set({ goal: clean(goal) }),
      setSkills: (skills) => set({ skills: clean(skills) }),
      setSearchMode: (searchMode) => set({ searchMode }),
      begin: (journey) =>
        set({
          journey: { ...journey, synced: null },
          careerGoal: null,
          careerGoalJourneyKey: crypto.randomUUID(),
          experience: null,
          certification: null,
          selected: null,
          answers: {},
          parts: {},
          checks: {},
          feedback: {},
        }),
      setExperience: (experience) => set({ experience }),
      setCertification: (certification) => set({ certification }),
      setCareerGoalJourneyKey: (careerGoalJourneyKey) => set({ careerGoalJourneyKey }),
      setCareerGoal: (careerGoal) => set((state) => (state.journey ? { careerGoal } : {})),
      choose: (selected) => set({ selected }),
      answer: (code, competencyId, answer) =>
        set((state) => ({
          answers: { ...state.answers, [code]: { ...state.answers[code], [competencyId]: answer } },
        })),
      setPart: (code, part) => set((state) => ({ parts: { ...state.parts, [code]: part } })),
      setCheck: (code, check) =>
        set((state) => {
          const feedback = { ...state.feedback }
          delete feedback[code]
          return { checks: { ...state.checks, [code]: check }, feedback }
        }),
      restoreCheck: (code, check) =>
        set((state) => ({
          answers: { ...state.answers, [code]: check.answers },
          checks: { ...state.checks, [code]: check },
        })),
      markCheckSaved: (code) =>
        set((state) => {
          const check = state.checks[code]
          return check ? { checks: { ...state.checks, [code]: { ...check, saved: true } } } : {}
        }),
      setFeedback: (code, feedback) =>
        set((state) => ({ feedback: { ...state.feedback, [code]: feedback } })),
      setPlace: (place) => set((state) => ({ place: { ...state.place, ...place } })),
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
