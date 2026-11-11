import { queryOptions } from '@tanstack/react-query'
import { api } from '../../api/client.ts'
import { unwrap } from '../../api/errors.ts'
import type { components } from '../../api/schema.d.ts'

export type AreaQualifications = components['schemas']['AreaQualifications']

/** Learner input stays in POST bodies and transient component state, never in an address. */
export async function matchPathway(goal: string, regionCode: string | null, signal: AbortSignal) {
  const analysis = await unwrap(
    api.POST('/api/v1/analysis/goal', {
      body: { query: goal, interpret_input: true },
      signal,
    }),
  )
  return unwrap(
    api.POST('/api/v1/analysis/matches', {
      body: {
        query: goal,
        profile: analysis.profile,
        mode: analysis.matching_mode ?? 'goal',
        ...(regionCode ? { region_code: regionCode } : {}),
      },
      signal,
    }),
  )
}

export const areaQualificationsQuery = (regionCode: string | null, offset = 0) =>
  queryOptions({
    queryKey: ['training', 'area-qualifications', regionCode, offset],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/v1/labor-market/qualifications', {
          params: {
            query: { ...(regionCode ? { region_code: regionCode } : {}), limit: 20, offset },
          },
          signal,
        }),
      ),
    staleTime: 60_000,
  })
