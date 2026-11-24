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

// The "Around you" card (AroundYouCard.tsx): one area's top jobs and qualifications, and the other provinces that
// need the learner's skills. `personalFor` works as above: the learner's id, in the key, when signed in.

export type AreaQualification = components['schemas']['AreaQualification']
export type ElsewhereProvince = components['schemas']['ElsewhereProvince']
export type AreaJob = components['schemas']['AreaJob']

/** The card's area: a region, a province (its postings only), or neither for every recorded region. */
export interface AroundArea {
  region: string | null
  province: string | null
}

/** The card shows each list's top 3; "more" opens the rest, up to AROUND_MORE. */
export const AROUND_TOP = 3
export const AROUND_MORE = 10
// A region's qualifications come back in name order unless they are personalized (only a province's are ranked by
// postings), so the card reads them all, ranks them itself and works out the top skills from the same list.
const AROUND_QUALIFICATIONS_READ = 100

export const aroundJobsQuery = (area: AroundArea, personalFor: string | null) =>
  queryOptions({
    queryKey: ['labor-market', 'around-jobs', area.region, area.province, personalFor],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/v1/labor-market/jobs', {
          params: {
            query: {
              region_code: area.region,
              province: area.province,
              limit: AROUND_MORE,
              ...(personalFor ? { personalize: true } : {}),
            },
          },
          signal,
        }),
      ),
    staleTime: 60_000,
  })

export const aroundQualificationsQuery = (area: AroundArea, personalFor: string | null) =>
  queryOptions({
    queryKey: ['labor-market', 'around-qualifications', area.region, area.province, personalFor],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/v1/labor-market/qualifications', {
          params: {
            query: {
              region_code: area.region,
              province: area.province,
              limit: AROUND_QUALIFICATIONS_READ,
              ...(personalFor ? { personalize: true } : {}),
            },
          },
          signal,
        }),
      ),
    staleTime: 60_000,
  })

/**
 * Other provinces where the learner's skills are in demand. Signed in, the server ranks by the Skill Passport; a
 * guest's searched qualifications (at most 5) are sent instead, and with none there is nothing to ask.
 */
export const elsewhereQuery = (
  exclude: string | null,
  codes: readonly string[],
  personalFor: string | null,
) =>
  queryOptions({
    queryKey: ['labor-market', 'elsewhere', exclude, [...codes], personalFor],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/v1/labor-market/elsewhere', {
          params: {
            query: {
              exclude_province: exclude,
              limit: AROUND_MORE,
              ...(codes.length ? { qualification_code: codes.slice(0, 5) } : {}),
              ...(personalFor ? { personalize: true } : {}),
            },
          },
          signal,
        }),
      ),
    staleTime: 60_000,
  })
