import { createContext, useCallback, useContext, useEffect, useRef } from 'react'
import type { Learner, Registration } from './session.ts'

export type SignInView = 'signIn' | 'register'

/** A short message for the learner after an account action, shown at the foot of the screen until dismissed. */
export interface Notice {
  tone: 'info' | 'success' | 'error'
  message: string
  /** A button beside the message, e.g. one that reloads the app after a part of it failed to download. */
  action?: { label: string; onPress: () => void }
}

export interface OpenSignInOptions {
  /** Which form to show first. Sign in by default. */
  view?: SignInView
  /** A line at the top of the dialog saying why it opened, e.g. that the session ended. */
  message?: string
  /** Runs once the learner has signed in (or created an account) from this dialog. Closing it drops it. */
  onSignedIn?: () => void
  /**
   * Where focus goes when the dialog closes. By default, the element that had focus when it opened, or the page's
   * heading if signing in took that element away (a "Sign in or create an account" button). Pass this when there's
   * a better place, e.g. the phone menu's button when the "Sign in" that opened the dialog was in that menu.
   */
  returnFocus?: () => HTMLElement | null | undefined
}

export interface Auth {
  /** The signed-in learner, or null. Their name and email are learner text: render them as text. */
  learner: Learner | null
  isSignedIn: boolean
  /** Administrator identity; authorization is enforced by the API. */
  isAdmin: boolean
  canViewReports: boolean
  /** The app is asking the API who is signed in (only when this browser has signed in before). */
  isChecking: boolean
  /** Signs in with the session cookie. Rejects with an ApiError whose message is for the learner. */
  signIn: (email: string, password: string) => Promise<Learner>
  /** Creates the account, then signs in. Rejects with SignInAfterRegistrationError if only the first worked. */
  register: (details: Registration) => Promise<Learner>
  /** Ends the session, then clears the learner's data and finder work from this browser. */
  signOut: () => Promise<void>
  /** Permanently deletes the account and its records, then signs out the same way. */
  deleteAccount: () => Promise<void>
  /** Opens the sign-in dialog. */
  openSignIn: (options?: OpenSignInOptions) => void
  /** Shows a notice, or clears it with null. */
  notify: (notice: Notice | null) => void
}

export const AuthContext = createContext<Auth | null>(null)

/**
 * The sign-in dialog's code (its forms), downloaded the first time it's needed rather than with the app. Controls
 * that open it can call this a moment early (on hover or focus).
 */
export const loadSignInDialog = () => import('./SignInDialog.tsx')

/** The signed-in learner and the account actions. Must be used under AuthProvider. */
export function useAuth(): Auth {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth must be used inside AuthProvider')
  return auth
}

/**
 * For actions that need an account (follow a pathway, apply, save; US-02). `requireAccount(action)` runs the action
 * now when the learner is signed in. Otherwise it opens the sign-in dialog and runs the action after they sign in
 * or create an account there, so they carry on where they were, with their work as it was. Closing the dialog
 * drops the action, even if a sign-in sent before it closed goes through afterwards. While the app is still asking
 * the API who is signed in, it waits for the answer before deciding.
 *
 * The action runs after the dialog has closed and focus is back on the control that opened it. It shouldn't rely on
 * auth values it captured before signing in (they're from before); the API call it makes is signed in.
 */
export function useRequireAccount(): (
  action: () => void,
  options?: Pick<OpenSignInOptions, 'view'>,
) => void {
  const { isSignedIn, isChecking, openSignIn } = useAuth()
  // An action asked for while the session check was still out. Only the last one counts, as with a dialog.
  const waiting = useRef<{ action: () => void; view?: SignInView } | null>(null)

  const decide = useCallback(
    (action: () => void, view?: SignInView) => {
      if (isSignedIn) action()
      else openSignIn({ view, onSignedIn: action })
    },
    [isSignedIn, openSignIn],
  )

  useEffect(() => {
    if (isChecking || !waiting.current) return
    const { action, view } = waiting.current
    waiting.current = null
    decide(action, view)
  }, [isChecking, decide])

  return useCallback(
    (action, options) => {
      if (isChecking) waiting.current = { action, view: options?.view }
      else decide(action, options?.view)
    },
    [isChecking, decide],
  )
}
