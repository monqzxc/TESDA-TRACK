import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useContext, useMemo } from 'react'
import { create } from 'zustand'
import { regionsQuery } from '../../api/queries.ts'
import { AuthContext } from '../../auth/useAuth.ts'
import type { MatchResult } from '../finder/api.ts'
import { passportQuery } from '../tsp/passport.ts'
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
import { MAX_QUALIFICATIONS, nearestRegion } from './explore.ts'
import { areaJobsQuery } from './demandApi.ts'
import { nearbySuggestionsQuery, outlookQuery, outlookSummaryQuery } from './outlookApi.ts'
import {
  NO_RECOMMENDATIONS,
  recommend,
  recommendedIds as idsOf,
  supplyCenters,
} from './recommend.ts'

export const useDemandStore = create<{
  region: string | null | undefined
  locality: string | null
  scope: string | null | undefined
  code: string | null | undefined
  offset: number
  setRegion: (region: string | null | undefined) => void
  setLocality: (locality: string | null, scope: string | null) => void
  setCode: (code: string | null | undefined) => void
  setOffset: (offset: number, scope: string | null) => void
}>()((set) => ({
  region: undefined,
  locality: null,
  scope: undefined,
  code: undefined,
  offset: 0,
  setRegion: (region) => set({ region, locality: null, offset: 0, scope: undefined }),
  setLocality: (locality, scope) => set({ locality, scope, offset: 0 }),
  setCode: (code) => set({ code, locality: null, offset: 0, scope: undefined }),
  setOffset: (offset, scope) =>
    set((state) => ({ offset, scope, locality: state.scope === scope ? state.locality : null })),
}))

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
  /** The learner would move for work or training: the analysis and the recommended centers look further. */
  relocate: boolean
  setDraft: (draft: string) => void
  setSearch: (search: Search | null) => void
  setRelocate: (relocate: boolean) => void
}

export const useExploreStore = create<ExploreState>()((set) => ({
  draft: '',
  search: null,
  relocate: false,
  setDraft: (draft) => set({ draft }),
  setRelocate: (relocate) => set({ relocate }),
  setSearch: (search) => {
    set({ search })
    useDemandStore.getState().setCode(undefined)
  },
}))

/**
 * Every site with the listings the page needs, measured from the learner's location or a typed place, nearest
 * first: with a search, the matched qualifications' programs and schedules; without one, every listing (so the
 * nearest centers can say how many qualifications they offer). With a qualification in focus (the first match, or
 * one chosen in the demand panel), its supply and demand across the regions and the centers recommended for it.
 */
export function useExplore(demandActive = false) {
  const search = useExploreStore((state) => state.search)
  const relocate = useExploreStore((state) => state.relocate)
  const location = useTrainingStore((state) => (state.useLocation ? state.location : null))
  const locating = useTrainingStore(
    (state) => state.useLocation && state.locating && !state.location,
  )
  const placeText = useTrainingStore((state) => state.placeText)

  const matches = useMemo(
    () => (search?.result.matches ?? []).slice(0, MAX_QUALIFICATIONS),
    [search],
  )
  const demandFilters = useDemandStore()
  const demandCode =
    demandFilters.code === undefined ? (matches[0]?.qualification.code ?? null) : demandFilters.code
  // The qualification in focus may be one the search didn't match: its listings are read with the matches'.
  const codes = useMemo(
    () => [
      ...new Set([
        ...matches.map((match) => match.qualification.code),
        ...(search && demandCode ? [demandCode] : []),
      ]),
    ],
    [matches, search, demandCode],
  )

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
  // The learner's area (Card 3): from their location or typed place, else where their Skill Passport says they live.
  // Optional: the page also renders without an account provider (its tests), and then nobody is signed in.
  const learner = useContext(AuthContext)?.learner ?? null
  const passport = useQuery({ ...passportQuery(learner?.id ?? ''), enabled: learner !== null })
  const locatedRegion = nearestRegion(reference, regions.data ?? [])?.code ?? null
  const profileRegion = passport.data?.region_code ?? null
  const automaticRegion = locatedRegion ?? profileRegion
  const homeSource: 'location' | 'profile' | null = locatedRegion
    ? 'location'
    : profileRegion
      ? 'profile'
      : null
  const demandRegion = demandFilters.region === undefined ? automaticRegion : demandFilters.region
  const demandLocality = demandFilters.scope === demandRegion ? demandFilters.locality : null
  const demandOffset = demandFilters.scope === demandRegion ? demandFilters.offset : 0
  const jobs = useQuery({
    ...areaJobsQuery(demandRegion, demandLocality, demandCode, demandOffset),
    enabled: demandActive,
  })
  // The intensity scale compares all regions. Locality and list pagination do not replace the map's dataset, or
  // briefly remove its selection targets while the list is refreshed. With a qualification in focus the outlook
  // below has its regions' postings, so this is asked only for all recorded jobs.
  const demandMap = useQuery({
    ...areaJobsQuery(null, null, null),
    enabled: demandActive && !demandCode,
  })
  // One qualification's supply and demand. The area analysed is the demand panel's region; the learner's own region
  // and whether they would relocate only change its wording. A change of area keeps the last answer on screen
  // until the new one arrives; a change of qualification doesn't, so one's numbers never sit under another's name.
  const outlook = useQuery({
    ...outlookQuery(demandCode ?? '', demandRegion, automaticRegion, relocate),
    enabled: Boolean(demandCode),
    placeholderData: (previous) =>
      previous?.qualification.code === demandCode ? previous : undefined,
  })
  const summary = useQuery({
    ...outlookSummaryQuery(demandCode ?? '', demandRegion, automaticRegion, relocate),
    enabled: Boolean(demandCode) && outlook.data?.ai_summary_available === true,
  })
  const centers = useMemo(
    () =>
      everything
        ? sortCenters(withDistances(everything, reference), reference ? 'nearest' : 'name', today)
        : [],
    [everything, reference, today],
  )
  /** The centers listing the qualification in focus: where its supply is. */
  const supply = useMemo(
    () => (demandCode ? supplyCenters(centers, demandCode, outlook.data) : []),
    [centers, demandCode, outlook.data],
  )
  // Card 4: what the learner can do already (the search's skills and their Skill Passport) and what they chose or
  // hold, for the other qualifications in demand where they are.
  const fitSkills = useMemo(
    () =>
      [
        ...new Set(
          [...(search?.result.profile.existing_skills ?? []), ...(passport.data?.skills ?? [])]
            .map((skill) => skill.trim())
            .filter(Boolean),
        ),
      ].slice(0, 20),
    [search, passport.data],
  )
  const held = useMemo(
    () =>
      [
        ...new Set([...(demandCode ? [demandCode] : []), ...(passport.data?.qualifications ?? [])]),
      ].slice(0, 20),
    [demandCode, passport.data],
  )
  const nearby = useQuery({
    ...nearbySuggestionsQuery(automaticRegion ?? '', fitSkills, held),
    enabled: Boolean(demandCode && automaticRegion),
    placeholderData: keepPreviousData,
  })
  const alternatives = outlook.data?.alternatives
  const recommendations = useMemo(
    () =>
      demandCode
        ? recommend({
            supply,
            homeRegion: automaticRegion,
            relocate,
            alternatives: alternatives ?? [],
          })
        : NO_RECOMMENDATIONS,
    [demandCode, supply, automaticRegion, relocate, alternatives],
  )
  const recommendedIds = useMemo(() => idsOf(recommendations), [recommendations])

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
    jobs,
    demandMap,
    demandRegion,
    demandCode,
    /** The learner's own region, from their location or typed place, else their Skill Passport. */
    homeRegion: automaticRegion,
    homeSource,
    relocate,
    outlook,
    summary,
    nearby,
    supply,
    recommendations,
    recommendedIds,
    demandLocality,
    demandOffset,
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
