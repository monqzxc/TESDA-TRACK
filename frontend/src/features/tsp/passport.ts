import { queryOptions, useQuery } from '@tanstack/react-query'
import { api } from '../../api/client.ts'
import { ApiError, unwrap } from '../../api/errors.ts'
import type { components } from '../../api/schema.d.ts'
import { useAuth } from '../../auth/useAuth.ts'
import type { Profile } from '../finder/store.ts'
import type { TspSignInState } from './useTspSignIn.ts'

// The signed-in learner's Skill Passport (GET /api/v1/auth/tsp/profile), as kept at their last sign-in from TSP.
// "Find my match" adds it to the profile it sends, behind what the learner typed; the form never shows it.

export type Passport = components['schemas']['TspProfile']

const SKILL_LENGTH = 80
const SKILL_LIMIT = 20

/** Keyed by learner, so a different learner on a shared phone never gets the last one's passport from the cache. */
export const passportQuery = (learnerId: string) =>
  queryOptions<Passport | null, ApiError>({
    queryKey: ['tsp-passport', learnerId],
    queryFn: async ({ signal }) => {
      try {
        return await unwrap(api.GET('/api/v1/auth/tsp/profile', { signal }))
      } catch (error) {
        // An account with no Skill Passport linked: nothing to add, which isn't a failure.
        if (error instanceof ApiError && error.status === 404) return null
        throw error
      }
    },
    staleTime: Infinity,
  })

/** The passport once TSP has signed the learner in; idle otherwise. */
export function usePassport(signIn: TspSignInState | undefined) {
  const { learner } = useAuth()
  return useQuery({
    ...passportQuery(learner?.id ?? ''),
    enabled: signIn === 'signed_in' && learner !== null,
  })
}

/** The profile with the passport's skills after the learner's own, without repeats, within the API's limits. */
export function withPassport(profile: Profile, passport: Passport | null | undefined): Profile {
  if (!passport) return profile
  const seen = new Set<string>()
  const skills = [...(profile.existing_skills ?? []), ...passport.skills]
    .map((skill) => skill.trim().slice(0, SKILL_LENGTH))
    .filter((skill) => {
      const key = skill.toLocaleLowerCase()
      if (!skill || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, SKILL_LIMIT)
  return { ...profile, existing_skills: skills }
}
