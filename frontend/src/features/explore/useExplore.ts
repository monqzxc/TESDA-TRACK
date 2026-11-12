import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { create } from 'zustand'
import { regionsQuery } from '../../api/queries.ts'
import type { MatchResult } from '../finder/api.ts'
import { clientConfigQuery, listingsQuery, sitesQuery } from '../training/api.ts'
import {
  buildCenters,
  findPlace,
  philippineDay,
  sortCenters,
  withDistances,
} from '../training/centers.ts'
import { useTrainingStore } from '../training/state.ts'
import type { Reference } from '../training/useCenters.ts'
import { MAX_QUALIFICATIONS } from './explore.ts'

// The page's state and data. What the learner typed and what came back stay in memory only: never in the address,
// never in storage, so a reload starts again. The location switch and a typed place are Training & Assessment's own
// (useTrainingStore), so the two pages share them during a visit.

export interface Search {
  query: string
  result: MatchResult
  /** Opened from the library for one qualification, not read from words: there's no match strength to show. */
  chosen?: boolean
}

interface ExploreState {
  /** The box's text. */
  draft: string
  /** The search on screen. */
  search: Search | null
  setDraft: (draft: string) => void
  setSearch: (search: Search | null) => void
}

export const useExploreStore = create<ExploreState>()((set) => ({
  draft: '',
  search: null,
  setDraft: (draft) => set({ draft }),
  setSearch: (search) => set({ search }),
}))

/**
 * Every site with the listings the page needs, measured from the learner's location or a typed place, nearest
 * first: with a search, the matched qualifications' programs and schedules; without one, every listing (so the
 * nearest centers can say how many qualifications they offer).
 */
export function useExplore() {
  const search = useExploreStore((state) => state.search)
  const location = useTrainingStore((state) => (state.useLocation ? state.location : null))
  const locating = useTrainingStore(
    (state) => state.useLocation && state.locating && !state.location,
  )
  const placeText = useTrainingStore((state) => state.placeText)

  const matches = useMemo(
    () => (search?.result.matches ?? []).slice(0, MAX_QUALIFICATIONS),
    [search],
  )
  const codes = useMemo(() => matches.map((match) => match.qualification.code), [matches])

  const regions = useQuery(regionsQuery)
  const config = useQuery(clientConfigQuery)
  const sites = useQuery(sitesQuery(null))
  const listings = useQuery({
    ...listingsQuery(codes, null),
    // A search that matched nothing has no listings to ask for.
    enabled: !search || codes.length > 0,
    placeholderData: keepPreviousData,
  })

  const regionMap = useMemo(
    () => new Map((regions.data ?? []).map((region) => [region.code, region])),
    [regions.data],
  )
  const everything = useMemo(
    () =>
      sites.data && regions.data
        ? buildCenters(
            sites.data.providers,
            sites.data.assessmentSites,
            listings.data?.programs ?? [],
            listings.data?.schedules ?? [],
            regionMap,
          )
        : null,
    [sites.data, regions.data, listings.data, regionMap],
  )

  const place = useMemo(
    () => (everything && placeText.trim() ? findPlace(placeText, everything, regionMap) : null),
    [everything, placeText, regionMap],
  )
  const reference: Reference | null = useMemo(
    () =>
      location
        ? { ...location, label: 'you', mine: true }
        : place
          ? { ...place, mine: false }
          : null,
    [location, place],
  )

  const today = philippineDay(new Date())
  const centers = useMemo(
    () =>
      everything
        ? sortCenters(withDistances(everything, reference), reference ? 'nearest' : 'name', today)
        : [],
    [everything, reference, today],
  )

  return {
    search,
    matches,
    centers,
    reference,
    location,
    locating,
    placeText,
    placeNotFound: Boolean(everything && placeText.trim() && !place),
    regions: regions.data ?? [],
    config: config.data,
    today,
    loading: !everything && !(sites.isError || regions.isError),
    /** The matched qualifications' listings are still coming. */
    listingsLoading: listings.isFetching && (listings.isPlaceholderData || !listings.data),
    failed: sites.isError || regions.isError || listings.isError,
    retry: () => {
      if (sites.isError) void sites.refetch()
      if (regions.isError) void regions.refetch()
      if (listings.isError) void listings.refetch()
    },
  }
}

export type Explore = ReturnType<typeof useExplore>
