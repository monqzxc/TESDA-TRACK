import { queryOptions } from '@tanstack/react-query'
import { api } from '../../api/client.ts'
import type { ApiError } from '../../api/errors.ts'
import { unwrap } from '../../api/errors.ts'
import type { components } from '../../api/schema.d.ts'

// Skills Explorer's requests. Everything goes through our API, which takes the skill and role terms out of the
// learner's sentence and sends only those to Skills Bridge. A 503 carries Skills Bridge's own curated message.

export type Exploration = components['schemas']['SkillsBridgeExploreResponse']
export type OccupationMatch = NonNullable<Exploration['occupations']>[number]
export type BridgeQualification = NonNullable<Exploration['qualifications']>[number]
export type OccupationDetails = components['schemas']['SkillsBridgeOccupationDetailsResponse']
export type Standard = NonNullable<OccupationDetails['data']['profile']['standards']>[number]

/** Looks up a short sentence of skills and roles. The sentence goes in the request body only. */
export function explore(text: string): Promise<Exploration> {
  return unwrap(api.POST('/api/v1/skills-bridge/explore', { body: { text } }), {
    detailOn503: true,
  })
}

/** An occupation's qualifications, a preview of its skills, and its international mappings. */
export const occupationQuery = (occupationId: number) =>
  queryOptions<OccupationDetails, ApiError>({
    queryKey: ['skills-bridge', 'occupation', occupationId],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/v1/skills-bridge/occupations/{occupation_id}', {
          params: { path: { occupation_id: occupationId } },
          signal,
        }),
        { detailOn503: true },
      ),
    staleTime: 10 * 60_000,
    // A refused lookup (rate limits) fails the same way again at once.
    retry: false,
  })
