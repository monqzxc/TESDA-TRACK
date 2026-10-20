import { queryOptions } from '@tanstack/react-query'
import { api } from '../../api/client.ts'
import type { ApiError } from '../../api/errors.ts'
import { unwrap } from '../../api/errors.ts'
import type { components } from '../../api/schema.d.ts'
import type { AssessmentSite, Point, Program, Provider, Schedule } from './centers.ts'
import type { DeliveryMode } from './address.ts'

// Training & Assessment's requests (classic/training_view.py _sites, _listings, _fit and _routes). Cache times
// follow its st.cache_data TTLs: sites 5 minutes, listings 2.

export type Ranking = components['schemas']['TrainingRanking']
export type Directions = components['schemas']['Directions']
export type RoadRoute = components['schemas']['RoadRoute']
export type FlightEstimate = components['schemas']['FlightEstimate']
export type TravelRoute = Directions['routes'][number]
export type TravelMode = TravelRoute['mode']
export type Application = components['schemas']['AssessmentApplicationPublic']
export type ClientConfig = components['schemas']['ClientConfig']

const MINUTE = 60_000
/** The largest page the listing endpoints return, and how many pages are read at most. */
const PAGE_SIZE = 100
const MAX_PAGES = 10

export const trainingKeys = {
  sites: ['training', 'sites'] as const,
  listings: (codes: readonly string[]) => ['training', 'listings', [...codes].sort()] as const,
}

/** Every active training provider and assessment center, with its location when one is on file. */
export const sitesQuery = queryOptions<
  { providers: Provider[]; assessmentSites: AssessmentSite[] },
  ApiError
>({
  queryKey: trainingKeys.sites,
  queryFn: async ({ signal }) => {
    const [providers, assessmentSites] = await Promise.all([
      unwrap(api.GET('/api/v1/training-providers', { signal })),
      unwrap(api.GET('/api/v1/assessment-centers', { signal })),
    ])
    return { providers, assessmentSites }
  },
  staleTime: 5 * MINUTE,
})

/** Every page of a listing, up to MAX_PAGES. `more` says whether some were left unread. */
async function allPages<T>(
  fetchPage: (offset: number) => Promise<T[]>,
): Promise<{ rows: T[]; more: boolean }> {
  const rows: T[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await fetchPage(page * PAGE_SIZE)
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) return { rows, more: false }
  }
  return { rows, more: true }
}

export interface Listings {
  programs: Program[]
  schedules: Schedule[]
  /** Some listings weren't read: a qualification narrows the search. */
  truncated: boolean
}

/** The programs and assessment schedules for the chosen qualifications, or for all of them. */
export const listingsQuery = (codes: readonly string[]) =>
  queryOptions<Listings, ApiError>({
    queryKey: trainingKeys.listings(codes),
    queryFn: async ({ signal }) => {
      const result: Listings = { programs: [], schedules: [], truncated: false }
      for (const code of codes.length ? codes : [undefined]) {
        const query = code ? { qualification_code: code } : {}
        const [programs, schedules] = await Promise.all([
          allPages((offset) =>
            unwrap(
              api.GET('/api/v1/training-programs', {
                params: { query: { ...query, limit: PAGE_SIZE, offset } },
                signal,
              }),
            ),
          ),
          allPages((offset) =>
            unwrap(
              api.GET('/api/v1/assessment-schedules', {
                params: { query: { ...query, limit: PAGE_SIZE, offset } },
                signal,
              }),
            ),
          ),
        ])
        result.programs.push(...programs.rows)
        result.schedules.push(...schedules.rows)
        result.truncated ||= programs.more || schedules.more
      }
      return result
    },
    staleTime: 2 * MINUTE,
  })

export interface FitRequest {
  /** Ranking eligibility depends on the account's verified certificates. */
  learnerId: string | null
  code: string
  /** The learner's goal from Find my pathway, if any: in the request body only. */
  goal: string | null
  /** A place the learner searched for, never their own location: the API keeps an audit of every ranking. */
  place: Point | null
  mode: DeliveryMode | null
  scholarship: boolean
}

export interface ProgramFit {
  /** Unconfirmed services have reasons but no recommendation score. */
  score?: number
  explanation: string[]
}

/** How well a qualification's programs fit the learner, by program id, with why. */
export const fitQuery = ({ learnerId, code, goal, place, mode, scholarship }: FitRequest) =>
  queryOptions<Map<number, ProgramFit>, ApiError>({
    queryKey: ['training', 'fit', learnerId, code, goal, place, mode, scholarship],
    queryFn: async ({ signal }) => {
      const ranking = await unwrap(
        api.POST('/api/v1/recommendations/training', {
          body: {
            qualification_code: code,
            goal: goal || null,
            preferred_delivery_mode: mode,
            needs_scholarship: scholarship,
            require_confirmed_availability: true,
            limit: 50,
            // Rounded to about 10 km, as the ranking audit keeps it.
            ...(place
              ? {
                  near_lat: Math.round(place.latitude * 10) / 10,
                  near_lon: Math.round(place.longitude * 10) / 10,
                }
              : {}),
          },
          signal,
        }),
      )
      const fits = new Map<number, ProgramFit>()
      for (const item of ranking.results) {
        fits.set(item.program.id, { score: item.score, explanation: item.explanation })
      }
      for (const item of ranking.requires_verification ?? []) {
        fits.set(item.program.id, { explanation: item.reasons })
      }
      return fits
    },
    // Service evidence and learner eligibility can change during a visit.
    staleTime: MINUTE,
    gcTime: 30 * MINUTE,
  })

const point = ({ latitude, longitude }: Point) => `${latitude},${longitude}`

/**
 * Routes from the learner's approximate location to a center, for each travel mode the router has, then a flight
 * estimate for a long trip. Kept for the visit, so the router is asked once per trip; modes it couldn't route come
 * back in missing_modes, and asking again (refetch) retries them.
 */
export const directionsQuery = (origin: Point, destination: Point) =>
  queryOptions<Directions, ApiError>({
    queryKey: ['training', 'routes', point(origin), point(destination)],
    queryFn: ({ signal }) =>
      unwrap(
        api.GET('/api/v1/routes', {
          params: { query: { origin: point(origin), destination: point(destination) } },
          signal,
        }),
      ),
    staleTime: Infinity,
    gcTime: 30 * MINUTE,
    retry: false,
  })

/** This deployment's settings: the map key, and whether directions are on. */
export const clientConfigQuery = queryOptions<ClientConfig, ApiError>({
  queryKey: ['client-config'],
  queryFn: ({ signal }) => unwrap(api.GET('/api/v1/client-config', { signal })),
  staleTime: Infinity,
})

/** Applies for an assessment schedule. The center reviews the application. */
export function applyForAssessment(scheduleId: number, requestId: string): Promise<Application> {
  return unwrap(
    api.POST('/api/v1/me/assessment-applications', {
      body: { schedule_id: scheduleId, request_id: requestId },
    }),
  )
}
