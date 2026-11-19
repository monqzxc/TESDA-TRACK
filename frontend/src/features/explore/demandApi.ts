import { queryOptions } from '@tanstack/react-query'
import { api } from '../../api/client.ts'
import { unwrap } from '../../api/errors.ts'
import type { components } from '../../api/schema.d.ts'

export type JobArea = components['schemas']['JobArea']
export type PersonalFit = components['schemas']['PersonalFit']
export type FitReason = components['schemas']['FitReason']

// `personalFor` is the signed-in learner's id when the answer should be ranked by their Skill Passport, else null.
// It is part of the query key, so one learner's ranking is never shown to another after a change of account; the
// server reads the Skill Passport from the session itself, never from the address.

export const areaJobsQuery = (
  region: string | null,
  locality: string | null,
  code: string | null,
  offset = 0,
  personalFor: string | null = null,
) =>
  queryOptions({
    queryKey: ['labor-market', 'jobs', region, locality, code, offset, personalFor],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/v1/labor-market/jobs', {
          params: {
            query: {
              region_code: region,
              locality,
              qualification_code: code,
              limit: 20,
              offset,
              ...(personalFor ? { personalize: true } : {}),
            },
          },
          signal,
        }),
      ),
    staleTime: 60_000,
  })

export const areaQualificationsQuery = (
  region: string | null,
  offset = 0,
  personalFor: string | null = null,
) =>
  queryOptions({
    queryKey: ['labor-market', 'area-qualifications', region, offset, personalFor],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/v1/labor-market/qualifications', {
          params: {
            query: {
              region_code: region,
              limit: 20,
              offset,
              ...(personalFor ? { personalize: true } : {}),
            },
          },
          signal,
        }),
      ),
    staleTime: 60_000,
  })
