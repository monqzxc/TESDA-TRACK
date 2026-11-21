import { queryOptions } from '@tanstack/react-query'
import { api } from '../../api/client.ts'
import { type ApiError, unwrap } from '../../api/errors.ts'
import type { ServiceScores } from './recommend.ts'

/** The policy whose components rankCenters knows how to combine with proximity. */
const SERVICE_POLICY = 'verified-services-v2'

/**
 * The server's service scores for one qualification's training programs (POST /recommendations/training), asked
 * for WITHOUT the learner's location: the browser adds proximity itself (recommend.ts, serviceScore). Resolves to
 * null when the server ranked with another policy (a learner's structured self-assessment), whose components are
 * not these: the map then ranks by trip, as before.
 */
export const serviceScoresQuery = (learnerId: string, code: string, goal: string | null) =>
  queryOptions<ServiceScores | null, ApiError>({
    queryKey: ['explore', 'service-scores', learnerId, code, goal],
    queryFn: async ({ signal }) => {
      const ranking = await unwrap(
        api.POST('/api/v1/recommendations/training', {
          // As the Training page asks: unconfirmed intake goes to "requires verification", not the ranking.
          body: {
            qualification_code: code,
            goal: goal || null,
            needs_scholarship: false,
            require_confirmed_availability: true,
            limit: 50,
          },
          signal,
        }),
      )
      if (ranking.policy_version !== SERVICE_POLICY) return null
      return {
        weights: ranking.weights as unknown as Record<string, number>,
        byProgram: new Map(
          ranking.results.map((item) => [
            item.program.id,
            {
              components: item.components as Record<string, number | null>,
              status: (item.component_status ?? {}) as Record<string, string>,
              explanation: item.explanation,
            },
          ]),
        ),
        unconfirmed: new Map(
          (ranking.requires_verification ?? []).map((item) => [item.program.id, item.reasons]),
        ),
      }
    },
    staleTime: 5 * 60_000,
  })
