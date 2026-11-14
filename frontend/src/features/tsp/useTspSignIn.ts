import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { api, onSignInRequired } from '../../api/client.ts'
import type { components } from '../../api/schema.d.ts'
import type { Learner } from '../../auth/session.ts'
import { useAuth, type Auth } from '../../auth/useAuth.ts'
import { paths } from '../../paths.ts'
import { clientConfigQuery } from '../training/api.ts'
import { connectBridge, type Bridge, type ErrorCode, type ReadyReason } from './bridge.ts'

// Signing in from TESDA Skill Passport's WebView (docs/contracts/tsp-tracker-embed/CONTRACT.md). On every load the
// page first ends any earlier session, then asks TSP for a code (the contract's fresh-load guarantee), so the next
// person on a shared phone never sees the last one's data. Pages stay closed until that cleanup succeeds; a
// failed handoff after cleanup leaves the learner using the page as a guest.

export type TspConsentSummary = components['schemas']['TspConsentSummary']
export type TspSignInState = 'guest' | 'signing_in' | 'consent' | 'signed_in' | 'failed'

export interface TspSignIn {
  state: TspSignInState
  /** Keep account-backed pages closed until the previous session has been cleared. */
  blocked: boolean
  /** What the consent screen shows, while `state` is 'consent'. */
  summary: TspConsentSummary | null
  /** Whether "Sign in again" can help: not after client_rejected or a TSP session that ended. */
  canRetry: boolean
  retry: () => void
  answerConsent: (accept: boolean) => Promise<void>
  /** Goes up on TSP's logout: what the launch URL prefilled belongs to the learner who left. */
  resets: number
}

type ContractError = Exclude<ErrorCode, 'timeout'>
export type Outcome =
  | { signedIn: Learner }
  | { consent: { pendingId: string; summary: TspConsentSummary } }
  | { declined: true }
  | { error: ContractError | 'pending_expired' }

const CONTRACT_ERRORS: readonly string[] = ['handoff_expired', 'unavailable', 'client_rejected']

/** The contract error code the API sent with a refusal; anything else counts as unavailable. */
function errorCode(body: unknown): ContractError {
  const code = (body as { code?: unknown } | undefined)?.code
  return typeof code === 'string' && CONTRACT_ERRORS.includes(code)
    ? (code as ContractError)
    : 'unavailable'
}

export async function postSession(code: string): Promise<Outcome> {
  try {
    const { data, error } = await api.POST('/api/v1/auth/tsp/session', { body: { code } })
    if (data && 'consent_required' in data) {
      return { consent: { pendingId: data.pending_id, summary: data.summary } }
    }
    if (data) return { signedIn: data.learner }
    return { error: errorCode(error) }
  } catch {
    return { error: 'unavailable' }
  }
}

export async function postConsent(pendingId: string, accept: boolean): Promise<Outcome> {
  try {
    const { data, error, response } = await api.POST('/api/v1/auth/tsp/consent', {
      body: { pending_id: pendingId, accept },
    })
    if (response.status === 204) return { declined: true }
    if (data) return { signedIn: data.learner }
    // Waited too long: the server forgot the profile, so ask TSP for a new code.
    if (response.status === 404) return { error: 'pending_expired' }
    return { error: errorCode(error) }
  } catch {
    return { error: 'unavailable' }
  }
}

interface View {
  setBlocked: (blocked: boolean) => void
  setState: (state: TspSignInState) => void
  setSummary: (summary: TspConsentSummary | null) => void
  setCanRetry: (canRetry: boolean) => void
}

/**
 * One connection's sign-in. Once closed (the page went away) or after TSP's logout, it does nothing more: a code or
 * answer arriving later is dropped.
 */
function createSignIn(bridge: Bridge, view: View, auth: () => Auth) {
  let closed = false
  let signedIn = false
  let pendingId: string | null = null
  let sessionCleared = false

  const fail = (canRetry: boolean) => {
    view.setCanRetry(canRetry)
    view.setState('failed')
  }
  const report = (code: ErrorCode) => {
    bridge.error(code)
    fail(code !== 'client_rejected')
  }

  async function attempt(reason: ReadyReason, retried: boolean): Promise<void> {
    view.setState('signing_in')
    const result = await bridge.requestCode(reason)
    if (closed) return
    if ('timeout' in result) return report('timeout')
    // TSP couldn't get a code and knows it: no error goes back.
    if ('failed' in result) return fail(result.failed !== 'not_signed_in')
    await settle(await postSession(result.code), retried)
  }

  async function settle(outcome: Outcome, retried: boolean): Promise<void> {
    if (closed) return
    if ('signedIn' in outcome) {
      await auth().adoptSession(outcome.signedIn)
      if (closed) return
      signedIn = true
      bridge.signedIn()
      view.setSummary(null)
      view.setState('signed_in')
      return
    }
    if ('consent' in outcome) {
      pendingId = outcome.consent.pendingId
      view.setSummary(outcome.consent.summary)
      view.setState('consent')
      return
    }
    if ('declined' in outcome) {
      view.setSummary(null)
      view.setState('guest')
      return
    }
    if (outcome.error === 'pending_expired') {
      view.setSummary(null)
      return attempt('retry', retried)
    }
    // A code can expire on the way (a slow phone): one more try, then the learner decides.
    if (outcome.error === 'handoff_expired' && !retried) return attempt('retry', true)
    report(outcome.error)
  }

  async function start(reason: ReadyReason) {
    view.setBlocked(true)
    view.setState('signing_in')
    try {
      await auth().signOut()
    } catch {
      if (!closed) report('unavailable')
      return
    }
    if (closed) return
    sessionCleared = true
    view.setBlocked(false)
    await attempt(reason, false)
  }

  return {
    start: () => start('initial'),
    retry() {
      if (!closed) void (sessionCleared ? attempt('retry', false) : start('retry'))
    },
    /** The API refused the session (it expired): ask TSP for a new code, as the contract says. */
    sessionExpired() {
      if (closed || !signedIn) return
      signedIn = false
      void attempt('session_expired', false)
    },
    async answerConsent(accept: boolean) {
      if (closed || !pendingId) return
      const answering = pendingId
      pendingId = null
      await settle(await postConsent(answering, accept), false)
    },
    close() {
      closed = true
    },
  }
}

/** Signs the learner in when /tsp/webview runs inside TSP's app and this deployment has TSP sign-in on. */
export function useTspSignIn(): TspSignIn {
  const auth = useAuth()
  const navigate = useNavigate()
  const configuration = useQuery(clientConfigQuery)
  const enabled = configuration.data?.tsp_sign_in === true
  const hasHost =
    typeof window.TspTrackerHost?.postMessage === 'function' &&
    new URLSearchParams(window.location.search).get('host') !== 'web'
  const [state, setState] = useState<TspSignInState>('guest')
  const [sessionBlocked, setBlocked] = useState(true)
  const [summary, setSummary] = useState<TspConsentSummary | null>(null)
  const [canRetry, setCanRetry] = useState(false)
  const [resets, setResets] = useState(0)
  const signIn = useRef<ReturnType<typeof createSignIn> | null>(null)
  // The connection outlives renders, so it reads the latest auth actions and navigate from here.
  const latest = useRef({ auth, navigate })
  useEffect(() => {
    latest.current = { auth, navigate }
  })

  useEffect(() => {
    if (!enabled) return
    const bridge = connectBridge()
    if (!bridge) return
    let active = true
    const current = createSignIn(
      bridge,
      { setState, setSummary, setCanRetry, setBlocked },
      () => latest.current.auth,
    )
    signIn.current = current
    const stopLogout = bridge.onLogout(() => {
      // Until TSP opens the page again, no code is asked for or accepted.
      current.close()
      setSummary(null)
      setCanRetry(false)
      setResets((count) => count + 1)
      setBlocked(true)
      setState('signing_in')
      void latest.current.auth
        .signOut()
        .then(() => {
          if (!active) return
          setBlocked(false)
          setState('guest')
        })
        .catch(() => {
          if (active) setState('failed')
        })
      void latest.current.navigate(paths.tspWebview)
    })
    const stopExpiry = onSignInRequired(() => current.sessionExpired())
    void current.start()
    return () => {
      stopExpiry()
      active = false
      stopLogout()
      current.close()
      bridge.close()
      signIn.current = null
    }
  }, [enabled])

  const configurationError = configuration.isError
  const refetchConfiguration = configuration.refetch
  const retry = useCallback(() => {
    if (configurationError) void refetchConfiguration()
    else signIn.current?.retry()
  }, [configurationError, refetchConfiguration])
  const answerConsent = useCallback(
    (accept: boolean) => signIn.current?.answerConsent(accept) ?? Promise.resolve(),
    [],
  )
  const blocked =
    hasHost && (configuration.isPending || configuration.isError || enabled) && sessionBlocked
  const configurationFailed = blocked && configuration.isError
  return {
    state: configurationFailed ? 'failed' : state,
    blocked,
    summary,
    canRetry: configurationFailed || canRetry,
    retry,
    answerConsent,
    resets,
  }
}
