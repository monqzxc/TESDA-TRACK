import { queryOptions, useQuery } from '@tanstack/react-query'
import { api } from './client.ts'
import type { ApiError } from './errors.ts'
import { unwrap } from './errors.ts'
import type { components } from './schema.d.ts'

// Query keys and hooks for public data. Cache times follow the Streamlit app's st.cache_data TTLs
// (frontend/app.py: load_qualifications 5 minutes, load_regions 1 hour).

export type Qualification = components['schemas']['QualificationPublic']
export type Region = components['schemas']['RegionPublic']

const MINUTE = 60_000

export const queryKeys = {
  qualifications: ['qualifications'] as const,
  regions: ['regions'] as const,
}

export const qualificationsQuery = queryOptions<Qualification[], ApiError>({
  queryKey: queryKeys.qualifications,
  queryFn: ({ signal }) => unwrap(api.GET('/api/v1/qualifications', { signal })),
  staleTime: 5 * MINUTE,
  gcTime: 5 * MINUTE,
})

export const regionsQuery = queryOptions<Region[], ApiError>({
  queryKey: queryKeys.regions,
  queryFn: ({ signal }) => unwrap(api.GET('/api/v1/regions', { signal })),
  staleTime: 60 * MINUTE,
  gcTime: 60 * MINUTE,
})

/** The whole catalog. The API takes no filters; pages filter it in the browser, as Streamlit does. */
export function useQualifications() {
  return useQuery(qualificationsQuery)
}

export function useRegions() {
  return useQuery(regionsQuery)
}
