import { queryOptions } from '@tanstack/react-query'
import { api } from '../../api/client.ts'
import { unwrap } from '../../api/errors.ts'
import type { components } from '../../api/schema.d.ts'

export type JobArea = components['schemas']['JobArea']

export const areaJobsQuery = (
  region: string | null,
  locality: string | null,
  code: string | null,
  offset = 0,
) =>
  queryOptions({
    queryKey: ['labor-market', 'jobs', region, locality, code, offset],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/v1/labor-market/jobs', {
          params: {
            query: { region_code: region, locality, qualification_code: code, limit: 20, offset },
          },
          signal,
        }),
      ),
    staleTime: 60_000,
  })

export const areaQualificationsQuery = (region: string | null, offset = 0) =>
  queryOptions({
    queryKey: ['labor-market', 'area-qualifications', region, offset],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/v1/labor-market/qualifications', {
          params: { query: { region_code: region, limit: 20, offset } },
          signal,
        }),
      ),
    staleTime: 60_000,
  })
