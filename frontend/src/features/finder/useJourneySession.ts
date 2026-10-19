import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { failureMessage } from '../../auth/fields.tsx'
import { sessionKey, type Learner } from '../../auth/session.ts'
import { useAuth, type Notice } from '../../auth/useAuth.ts'
import { en } from '../../copy/en.ts'
import { startSession, submitReadiness, updateSession } from './api.ts'
import { answeredProfile, sameSessionState, sessionState } from './rules.ts'
import { useFinderStore, type Profile } from './store.ts'

const copy = en.finder.save

/** Whether the journey's recommendation session belongs to this learner, so the finder may write to it. */
export function ownsSession(learner: Learner | null, sessionOwner: string | null): boolean {
  return learner !== null && sessionOwner === learner.id
}

/**
 * Keeps a signed-in learner's recommendation session in step with their follow-up answers and chosen
 * qualification (classic/app.py save_session_progress): each change is sent once. A session that belongs to
 * someone else (another learner signed in on this tab) is left alone. `failed` says the last change wasn't saved;
 * `retry` sends it again.
 */
export function useSessionSync(profile: Profile | undefined, code: string | null) {
  const { learner } = useAuth()
  const journey = useFinderStore((state) => state.journey)
  const setSynced = useFinderStore((state) => state.setSynced)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const sessionId = journey?.sessionId ?? null
  const owned = ownsSession(learner, journey?.sessionOwner ?? null)
  const synced = journey?.synced ?? null
  // The effect depends on these values, not the profile object, which is new on every render.
  const experience = profile?.experience_years ?? null
  const certification = profile?.has_certification ?? null
  const ready = profile !== undefined

  useEffect(() => {
    if (!ready || !owned || sessionId === null) return
    const next = sessionState(
      { experience_years: experience, has_certification: certification },
      code,
    )
    if (sameSessionState(synced, next)) return
    let current = true
    updateSession(sessionId, next).then(
      () => {
        if (!current) return
        setSynced(next)
        setFailed(false)
      },
      () => {
        if (current) setFailed(true)
      },
    )
    return () => {
      current = false
    }
  }, [ready, owned, sessionId, experience, certification, code, synced, setSynced, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  return { saved: owned && sessionId !== null && !failed, failed: owned && failed, retry }
}

/**
 * Saves a journey started as a guest to the learner's account (US-02): a recommendation session for the goal, the
 * follow-up answers and chosen qualification, and the readiness check for it if one was submitted. Each part is
 * saved once: running it again carries on from the part that failed. Use it with useRequireAccount, so it runs
 * after signing in; it reads who signed in when it runs.
 */
export function useSaveJourney() {
  const queryClient = useQueryClient()
  const { notify } = useAuth()
  const [pending, setPending] = useState(false)

  const save = useCallback(
    (code: string | null) => {
      const learner = queryClient.getQueryData<Learner | null>(sessionKey)
      if (!learner) return Promise.resolve()
      setPending(true)
      return saveJourney(learner, code, notify).finally(() => setPending(false))
    },
    [queryClient, notify],
  )

  return { save, pending }
}

async function saveJourney(
  learner: Learner,
  code: string | null,
  notify: (notice: Notice) => void,
): Promise<void> {
  const start = useFinderStore.getState()
  if (!start.journey) return
  const saved: string[] = []
  try {
    let sessionId = ownsSession(learner, start.journey.sessionOwner)
      ? start.journey.sessionId
      : null
    if (sessionId === null) {
      sessionId = (await startSession(start.journey.query)).id
      useFinderStore.getState().setSession(sessionId, learner.id)
    }
    saved.push(copy.goal)

    const state = useFinderStore.getState()
    const profile = answeredProfile(start.journey.profile, state.experience, state.certification)
    const next = sessionState(profile, code)
    if (!sameSessionState(state.journey?.synced ?? null, next)) {
      await updateSession(sessionId, next)
      useFinderStore.getState().setSynced(next)
    }
    if (code !== null || state.experience !== null || state.certification !== null) {
      saved.push(copy.answers)
    }

    // Only a check the learner submitted; answers still being given stay a draft.
    const check = code === null ? undefined : state.checks[code]
    if (code !== null && check && !check.saved) {
      await submitReadiness(code, check.answers, { sessionId })
      useFinderStore.getState().markCheckSaved(code)
      saved.push(copy.check)
    }
    notify({ tone: 'success', message: copy.done(saved) })
  } catch (error) {
    notify({
      tone: 'error',
      message: copy.failed(saved, failureMessage(error)),
      action: {
        label: en.finder.summary.retry,
        onPress: () => void saveJourney(learner, code, notify),
      },
    })
  }
}
