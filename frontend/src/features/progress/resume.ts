import { useFinderStore } from '../finder/store.ts'
import type { RecommendationSession } from './api.ts'
import { sessionQualification } from './journey.ts'

/**
 * Opens a saved recommendation in Find my pathway (US-10): its goal, profile and chosen qualification, by its id, so
 * the finder keeps saving to it. No readiness check comes with it: one saved with another recommendation or
 * qualification mustn't be shown as this one's.
 */
export function resumeSession(session: RecommendationSession, learnerId: string): void {
  const finder = useFinderStore.getState()
  finder.begin({
    query: session.query,
    profile: session.profile,
    sessionId: session.id,
    sessionOwner: learnerId,
  })
  finder.setGoal(session.query)
  const chosen = session.selected_qualification?.code ?? null
  if (chosen) finder.choose(chosen)
  // What the session already holds, so the finder doesn't send it again.
  finder.setSynced({
    experience_years: session.profile.experience_years ?? null,
    has_certification: session.profile.has_certification ?? null,
    qualification_code: chosen ?? sessionQualification(session)?.code ?? null,
  })
}
