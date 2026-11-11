import { queryOptions } from '@tanstack/react-query'
import { api } from '../../api/client.ts'
import type { ApiError } from '../../api/errors.ts'
import { unwrap } from '../../api/errors.ts'
import type { components } from '../../api/schema.d.ts'

export type EvidenceGeography = components['schemas']['Geography']
export type EvidenceMeasure = components['schemas']['Measure']
export type QualificationEvidenceResponse = components['schemas']['QualificationEvidencePanel']

/** Public evidence has no learner input; area and qualification identify this cache independently. */
export const qualificationEvidenceQuery = (qualificationCode: string, regionCode: string | null) =>
  queryOptions<QualificationEvidenceResponse, ApiError>({
    queryKey: ['labor-market', 'qualification-evidence', qualificationCode, regionCode],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/v1/labor-market/evidence', {
          params: {
            query: {
              qualification_code: qualificationCode,
              ...(regionCode ? { region_code: regionCode } : {}),
            },
          },
          signal,
        }),
      ),
    // Availability and authorization can change; a long-lived registry cache would hide that change.
    staleTime: 60_000,
  })
