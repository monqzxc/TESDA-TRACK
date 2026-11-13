import { queryOptions } from '@tanstack/react-query'
import { api } from '../../api/client.ts'
import type { ApiError } from '../../api/errors.ts'
import { unwrap } from '../../api/errors.ts'
import type { components } from '../../api/schema.d.ts'

export type Outlook = components['schemas']['QualificationOutlook']
export type AreaOutlook = components['schemas']['AreaOutlook']
export type OutlookSummary = components['schemas']['OutlookSummary']
export type Balance = AreaOutlook['balance']

// One qualification across the regions: posting records beside recorded centers, and the analysis of one area.
// Only codes and the relocation choice are sent: never the learner's words or coordinates.

const query = (code: string, region: string | null, home: string | null, relocate: boolean) => ({
  qualification_code: code,
  ...(region ? { region_code: region } : {}),
  ...(home ? { home_region_code: home } : {}),
  relocate,
})

export const outlookQuery = (
  code: string,
  region: string | null,
  home: string | null,
  relocate: boolean,
) =>
  queryOptions<Outlook, ApiError>({
    queryKey: ['labor-market', 'outlook', code, region, home, relocate],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/v1/labor-market/outlook', {
          params: { query: query(code, region, home, relocate) },
          signal,
        }),
      ),
    staleTime: 60_000,
  })

/** The analysis as one paragraph: AI-written where the deployment has it on, otherwise the rules' own words. */
export const outlookSummaryQuery = (
  code: string,
  region: string | null,
  home: string | null,
  relocate: boolean,
) =>
  queryOptions<OutlookSummary, ApiError>({
    queryKey: ['labor-market', 'outlook-summary', code, region, home, relocate],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/v1/labor-market/outlook/summary', {
          params: { query: query(code, region, home, relocate) },
          signal,
        }),
      ),
    // Written once per selection and kept by the API; the page keeps it for the visit.
    staleTime: Infinity,
    retry: false,
  })
