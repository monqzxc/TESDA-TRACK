import { useFinderStore } from '../finder/store.ts'
import type { ReadinessCheck, RecommendationSession } from './api.ts'
import { checkForSession, sessionQualification } from './journey.ts'

/**
 * Opens a saved recommendation in Find my pathway (US-10): its goal, profile and chosen qualification, by its id, so
 * the finder keeps saving to it. Restore only a check linked to this recommendation and qualification.
 */
export function resumeSession(
  session: RecommendationSession,
  learnerId: string,
  checks: readonly ReadinessCheck[] = [],
): boolean {
  const finder = useFinderStore.getState()
  finder.begin({
    query: session.query,
    profile: session.profile,
    sessionId: session.id,
    sessionOwner: learnerId,
  })
  finder.setGoal(session.query)
  const chosen = sessionQualification(session)?.code ?? null
  if (chosen) finder.choose(chosen)
  const check = checkForSession(session, checks)
  if (check) {
    finder.restoreCheck(check.qualification.code, {
      result: check,
      answers: check.answers,
      saved: true,
    })
  }
  // What the session already holds, so the finder doesn't send it again.
  finder.setSynced({
    experience_years: session.profile.experience_years ?? null,
    has_certification: session.profile.has_certification ?? null,
    qualification_code: chosen,
  })
  return check !== null
}
