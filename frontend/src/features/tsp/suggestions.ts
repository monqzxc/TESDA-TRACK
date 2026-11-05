import { queryOptions } from '@tanstack/react-query'
import { api } from '../../api/client.ts'
import type { ApiError } from '../../api/errors.ts'
import { unwrap } from '../../api/errors.ts'
import type { components } from '../../api/schema.d.ts'
import type { Profile } from '../finder/store.ts'
import type { TspLearnerParams } from './params.ts'
import { withPassport, type Passport } from './passport.ts'

// Suggestions for the webview's entry page: qualifications worked out from what TSP already knows about the
// learner, so they can see somewhere to start before typing a goal. The profile goes in the request body only,
// never in an address, and the API neither stores nor logs it (the plan's privacy rules, as for matching).

export type SuggestionResult = components['schemas']['SuggestionResult']
export type Suggestion = SuggestionResult['suggestions'][number]

const MINUTE = 60_000
const SKILL_LENGTH = 80
const SKILL_LIMIT = 20
export const SUGGESTION_LIMIT = 3

/**
 * The launch hints and the Skill Passport as one profile. The goal box is deliberately not a field here: a
 * suggestion comes from what TSP knows, so it must not change under the learner as they type.
 */
export function suggestionProfile(
  learner: Pick<TspLearnerParams, 'skills' | 'experienceYears' | 'hasCertification'>,
  passport: Passport | null | undefined,
): Profile {
  const skills = learner.skills
    .split(',')
    .map((skill) => skill.trim().slice(0, SKILL_LENGTH))
    .filter(Boolean)
    .slice(0, SKILL_LIMIT)
  return withPassport(
    {
      career_goal: null,
      possible_sector: null,
      existing_skills: skills,
      experience_years: learner.experienceYears === '' ? null : Number(learner.experienceYears),
      has_certification:
        learner.hasCertification === '' ? null : learner.hasCertification === 'yes',
      intent: 'unknown',
    },
    passport,
  )
}

/**
 * Whether there is anything to suggest from. Experience and certification alone say how a learner should train,
 * not what in, so they never trigger a suggestion on their own.
 */
export function hasSuggestionSignal(profile: Profile): boolean {
  return Boolean(profile.career_goal) || (profile.existing_skills?.length ?? 0) > 0
}

/** The same profile gets the same suggestions, so they're kept for the visit rather than refetched per section. */
export const suggestionsQuery = (profile: Profile) =>
  queryOptions<SuggestionResult, ApiError>({
    queryKey: ['tsp', 'suggestions', profile],
    queryFn: ({ signal }) =>
      unwrap(
        api.POST('/api/v1/analysis/suggestions', {
          body: { profile, limit: SUGGESTION_LIMIT },
          signal,
        }),
      ),
    staleTime: Infinity,
    gcTime: 30 * MINUTE,
  })
