import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query'
import { useContext, useMemo } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { qualificationsQuery, regionsQuery } from '../../api/queries.ts'
import { AuthContext } from '../../auth/useAuth.ts'
import type { MatchResult } from '../finder/api.ts'
import { sessionStore } from '../../lib/sessionStore.ts'
import {
  ASSESS_FIRST,
  passportQuery,
  qualificationFitQuery,
  type QualificationFit,
} from '../tsp/passport.ts'
import { clientConfigQuery, listingsQuery, sitesQuery } from '../training/api.ts'
import { buildCenters, philippineDay, sortCenters, withDistances } from '../training/centers.ts'
import { gazetteer, resolvePlace } from '../training/places.ts'
import { useTrainingStore } from '../training/state.ts'
import type { Reference } from '../training/useCenters.ts'
import {
  anyKindWithoutCenter,
  anyScholarship,
  anyOutOfRange,
  MAX_QUALIFICATIONS,
  METRO_MANILA,
  NEAR_KM,
  nearestRegion,
} from './explore.ts'
import { EXPLORE_KEY } from './key.ts'
import { areaJobsQuery } from './demandApi.ts'
import { nearbySuggestionsQuery, outlookQuery, outlookSummaryQuery } from './outlookApi.ts'
import { serviceScoresQuery } from './serviceScores.ts'
import {
  highDemandRegions,
  NO_RECOMMENDATIONS,
  rankCenters,
  recommend,
  recommendedIds as idsOf,
  regionalDemand,
  supplyCenters,
} from './recommend.ts'

export const useDemandStore = create<{
  region: string | null | undefined
  locality: string | null
  scope: string | null | undefined
  code: string | null | undefined
  offset: number
  /** Rank the Demand lists by the learner's Skill Passport (when they have one). On until they turn it off. */
  personal: boolean
  setRegion: (region: string | null | undefined) => void
  setLocality: (locality: string | null, scope: string | null) => void
  setCode: (code: string | null | undefined) => void
  setOffset: (offset: number, scope: string | null) => void
  setPersonal: (personal: boolean) => void
}>()((set) => ({
  region: undefined,
  locality: null,
  scope: undefined,
  code: undefined,
  offset: 0,
  personal: true,
  setRegion: (region) => set({ region, locality: null, offset: 0, scope: undefined }),
  setLocality: (locality, scope) => set({ locality, scope, offset: 0 }),
  setCode: (code) => set({ code, locality: null, offset: 0, scope: undefined }),
  setOffset: (offset, scope) =>
    set((state) => ({ offset, scope, locality: state.scope === scope ? state.locality : null })),
  setPersonal: (personal) => set({ personal, offset: 0 }),
}))

// The page's state and data. What the learner typed, what came back and how far they can go are kept in
// sessionStorage, never in the address: a refresh keeps them, as on Find my pathway, and closing the tab clears them.
// The location switch and a typed place are Training & Assessment's own (useTrainingStore), so the two pages share
// them during a visit.

export interface Search {
  query: string
  result: MatchResult
  feedbackScope?: string
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
  /** How far the learner can go, in km: a center within it counts as near. */
  rangeKm: number
  /** The learner picked the range themselves: the map draws it and frames it. */
  rangeChosen: boolean
  /** "How far can you go?" is on screen. */
  askingRange: boolean
  setDraft: (draft: string) => void
  setSearch: (search: Search | null) => void
  setRelocate: (relocate: boolean) => void
  /** Back to "How far can you go?". */
  changeRange: () => void
  setRange: (rangeKm: number) => void
  closeRange: () => void
  /** Clears the goal, results and range, e.g. on sign-out. */
  reset: () => void
}

const EMPTY = {
  draft: '',
  search: null,
  relocate: false,
  rangeKm: NEAR_KM,
  rangeChosen: false,
  askingRange: false,
} satisfies Partial<ExploreState>

export const useExploreStore = create<ExploreState>()(
  persist(
    (set) => ({
      ...EMPTY,
      setDraft: (draft) => set({ draft }),
      setRelocate: (relocate) => set({ relocate }),
      changeRange: () => set({ askingRange: true }),
      setRange: (rangeKm) => set({ rangeKm, rangeChosen: true, askingRange: false }),
      closeRange: () => set({ askingRange: false }),
      setSearch: (search) => {
        set({ search })
        useDemandStore.getState().setCode(undefined)
      },
      reset: () => set(EMPTY),
    }),
    {
      name: EXPLORE_KEY,
      storage: createJSONStorage(() => sessionStore),
      version: 1,
      // "How far can you go?" being open is a moment, not work: a refresh closes it.
      partialize: ({ draft, search, relocate, rangeKm, rangeChosen }) => ({
        draft,
        search,
        relocate,
        rangeKm,
        rangeChosen,
      }),
    },
  ),
)

/**
 * Every site with the listings the page needs, measured from the learner's location or a typed place, nearest
 * first: with a search, the matched qualifications' programs and schedules; without one, every listing (so the
 * nearest centers can say how many qualifications they offer). With a qualification in focus (the first match, or
 * one chosen in the demand panel), its supply and demand across the regions and the centers recommended for it.
 */
export function useExplore(
  demandActive = false,
  /** Region, province and scholarship filters (QA: US-0014 AC3), from the address: they narrow the centers shown. */
  filters: { region?: string | null; province?: string | null; scholarship?: boolean } = {},
) {
  const search = useExploreStore((state) => state.search)
  const relocate = useExploreStore((state) => state.relocate)
  const rangeKm = useExploreStore((state) => state.rangeKm)
  const location = useTrainingStore((state) => (state.useLocation ? state.location : null))
  const locating = useTrainingStore(
    (state) => state.useLocation && state.locating && !state.location,
  )
  const placeText = useTrainingStore((state) => state.placeText)
  const placePoint = useTrainingStore((state) => state.placePoint)

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
    () => (everything ? resolvePlace(placeText, gazetteer(), everything, regionMap) : null),
    [everything, placeText, regionMap],
  )
  // The signed-in learner's Skill Passport (US-0004). Optional: the page also renders without an account provider
  // (its tests), and then nobody is signed in.
  const learner = useContext(AuthContext)?.learner ?? null
  const passport = useQuery({ ...passportQuery(learner?.id ?? ''), enabled: learner !== null })
  // Where the Skill Passport says the learner lives: the search location when they haven't shared one or typed a
  // place, without asking. A place typed here replaces it for this visit only; the profile isn't changed.
  const passportData = passport.data
  const homeArea = useMemo(() => {
    if (!passportData || !everything) return null
    // The city first, then the province, then the region: the most precise the catalog's places know. The label
    // says which one is used, so a region's middle is never shown as the learner's city.
    const tries = [
      passportData.municipality,
      passportData.province,
      passportData.region_code,
    ].filter((text): text is string => Boolean(text))
    if (passportData.municipality && passportData.province) {
      tries.unshift(`${passportData.municipality}, ${passportData.province}`)
    }
    return (
      tries.map((text) => resolvePlace(text, gazetteer(), everything, regionMap)).find(Boolean) ??
      null
    )
  }, [passportData, everything, regionMap])
  const reference: (Reference & { fromProfile?: boolean }) | null = useMemo(
    () =>
      location
        ? { ...location, label: 'you', mine: true }
        : placePoint
          ? { ...placePoint, mine: false }
          : place
            ? { ...place, mine: false }
            : homeArea && !placeText.trim()
              ? { ...homeArea, mine: false, fromProfile: true }
              : null,
    [location, placePoint, place, homeArea, placeText],
  )

  const today = philippineDay(new Date())
  // The learner's area (Card 3): from their location or typed place, else where their Skill Passport says they live.
  const locatedRegion = nearestRegion(reference, regions.data ?? [])?.code ?? null
  const profileRegion = passport.data?.region_code ?? null
  const automaticRegion = locatedRegion ?? profileRegion
  // Measured from the Skill Passport's home area (US-0004), the area still comes from the profile.
  const homeSource: 'location' | 'profile' | null = locatedRegion
    ? reference?.fromProfile
      ? 'profile'
      : 'location'
    : profileRegion
      ? 'profile'
      : null
  const demandRegion = demandFilters.region === undefined ? automaticRegion : demandFilters.region
  const demandLocality = demandFilters.scope === demandRegion ? demandFilters.locality : null
  const demandOffset = demandFilters.scope === demandRegion ? demandFilters.offset : 0
  // Ranked by the Skill Passport, quietly: the learner types nothing, and the panel says so and can turn it off.
  const personalFor = learner && passport.data && demandFilters.personal ? learner.id : null
  const jobs = useQuery({
    ...areaJobsQuery(demandRegion, demandLocality, demandCode, demandOffset, personalFor),
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
  const allCenters = useMemo(
    () =>
      everything
        ? sortCenters(withDistances(everything, reference), reference ? 'nearest' : 'name', today)
        : [],
    [everything, reference, today],
  )
  // Where the shared location is (the "Around you" card): its nearest region, and the province of the nearest center
  // that names one. The browser gives a point, not a province; NCR's centers count as one province, Metro Manila.
  const liveRegion = location ? nearestRegion(location, regions.data ?? []) : null
  const liveProvince = useMemo(() => {
    if (!location) return null
    const nearest = allCenters.find(
      (center) => center.distanceKm !== null && (center.province || center.regionCode === 'NCR'),
    )
    return nearest ? (nearest.regionCode === 'NCR' ? METRO_MANILA : nearest.province) : null
  }, [location, allCenters])
  // The region and province filters narrow what the list and the map show. The supply analysis and the
  // recommendations still count every center: a filter changes what is shown, not the evidence.
  const regionFilter = filters.region ?? null
  const provinceFilter = filters.province ?? null
  // Scholarships only: a training center stays when one of its programs listed here has a scholarship open (with a
  // search, the matched qualifications' programs). Assessment centers have no scholarships listed, so they stay.
  const scholarshipOnly = Boolean(filters.scholarship)
  const centers = useMemo(
    () =>
      allCenters.filter(
        (center) =>
          (!regionFilter || center.regionCode === regionFilter) &&
          (!provinceFilter || center.province === provinceFilter) &&
          (!scholarshipOnly || center.kind !== 'training' || anyScholarship(center)),
      ),
    [allCenters, regionFilter, provinceFilter, scholarshipOnly],
  )
  const regionOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const center of allCenters)
      if (center.regionCode) seen.set(center.regionCode, center.region)
    return [...seen]
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [allCenters])
  const provinceOptions = useMemo(
    () =>
      [
        ...new Set(
          allCenters
            .filter((center) => !regionFilter || center.regionCode === regionFilter)
            .flatMap((center) => (center.province ? [center.province] : [])),
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [allCenters, regionFilter],
  )
  /** The centers listing the qualification in focus: where its supply is. */
  // A matched qualification with no center in range, or with no center at all: everything listed within range, to
  // suggest a related one.
  const outOfRange = useMemo(
    () =>
      Boolean(
        search &&
        reference &&
        (anyOutOfRange(matches, centers, rangeKm) ||
          anyKindWithoutCenter(matches, centers, rangeKm)),
      ),
    [search, reference, matches, centers, rangeKm],
  )
  const inRange = useQuery({
    ...listingsQuery(
      [],
      reference
        ? { latitude: reference.latitude, longitude: reference.longitude, radiusKm: rangeKm }
        : null,
    ),
    enabled: outOfRange,
  })
  const catalog = useQuery({ ...qualificationsQuery, enabled: outOfRange })
  const nearbyCenters = useMemo(
    () =>
      outOfRange && inRange.data && sites.data && regions.data
        ? withDistances(
            buildCenters(
              sites.data.providers,
              sites.data.assessmentSites,
              inRange.data.programs,
              inRange.data.schedules,
              regionMap,
            ),
            reference,
          ).filter((center) => center.distanceKm !== null && center.distanceKm <= rangeKm)
        : [],
    [outOfRange, inRange.data, sites.data, regions.data, regionMap, reference, rangeKm],
  )
  const supply = useMemo(
    () => (demandCode ? supplyCenters(allCenters, demandCode, outlook.data) : []),
    [allCenters, demandCode, outlook.data],
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
  // Strong demand moves a center up the ranking; while the outlook loads, the ranking is by trip alone.
  const outlookAreas = outlook.data?.qualification.code === demandCode ? outlook.data : undefined
  const demandRegions = useMemo(() => highDemandRegions(outlookAreas), [outlookAreas])
  // Each region's demand against the busiest: an assessment center's demand component (left out while it loads).
  const regionDemand = useMemo(() => regionalDemand(outlookAreas), [outlookAreas])
  // Signed in, the Skill Passport can say the learner may be ready to be assessed: assessment centers come first in
  // the list and say so. A guest is ranked by their location alone.
  const focusName =
    matches.find((match) => match.qualification.code === demandCode)?.qualification.name ??
    (outlook.data?.qualification.code === demandCode ? outlook.data.qualification.name : null)
  // The server's next step per qualification, from the CORE units on the learner's certificates
  // (GET /auth/tsp/fit). Self-declared skills never make a learner "ready": only assessed units do.
  const fits = useQueries({
    queries: codes.map((code) => ({
      ...qualificationFitQuery(learner?.id ?? '', code),
      enabled: Boolean(learner && passport.data),
    })),
    combine: (results) =>
      new Map<string, QualificationFit | null>(
        results.flatMap((result, i) =>
          result.data === undefined ? [] : [[codes[i] as string, result.data] as const],
        ),
      ),
  })
  const focusFit = demandCode ? (fits.get(demandCode) ?? null) : null
  const ready = Boolean(focusFit && ASSESS_FIRST.has(focusFit.next_step))
  // The server's scores for the training programs, asked for without the learner's location (recommend.ts). While
  // they load, or if they fail, training centers rank by trip as before.
  const serviceScores = useQuery({
    ...serviceScoresQuery(learner?.id ?? '', demandCode ?? '', search?.query.trim() || null),
    enabled: Boolean(demandCode),
    placeholderData: keepPreviousData,
  })
  const scores =
    serviceScores.data && serviceScores.isPlaceholderData === false ? serviceScores.data : undefined
  const ranked = useMemo(
    () =>
      demandCode
        ? rankCenters({
            supply,
            code: demandCode,
            rangeKm,
            demandRegions,
            regionDemand,
            ready,
            scores,
          }).filter(
            (item) => !scholarshipOnly || item.center.kind !== 'training' || item.scholarship,
          )
        : [],
    [demandCode, supply, rangeKm, demandRegions, regionDemand, ready, scores, scholarshipOnly],
  )
  const recommendations = useMemo(
    () =>
      demandCode
        ? recommend({
            supply,
            homeRegion: automaticRegion,
            relocate,
            alternatives: alternatives ?? [],
            nearKm: rangeKm,
            code: demandCode,
            demandRegions,
            regionDemand,
            ready,
            scores,
          })
        : NO_RECOMMENDATIONS,
    [
      demandCode,
      supply,
      automaticRegion,
      relocate,
      alternatives,
      rangeKm,
      demandRegions,
      regionDemand,
      ready,
      scores,
    ],
  )
  const recommendedIds = useMemo(() => idsOf(recommendations), [recommendations])

  return {
    search,
    matches,
    /** The centers shown: every one, narrowed by the region and province filters. */
    centers,
    /** Every center, whatever the filters (the "Around you" card's details look past them). */
    allCenters,
    regionOptions,
    provinceOptions,
    /** The Scholarships filter is on: training centers without an open scholarship are left out. */
    scholarshipOnly,
    reference,
    rangeKm,
    /** Centers within range with everything they list, when a matched qualification has none there. */
    nearbyCenters,
    catalog: catalog.data ?? [],
    location,
    locating,
    placeText,
    placeNotFound: Boolean(everything && placeText.trim() && !place && !placePoint),
    /** The signed-in learner's id, or null for a guest. */
    learnerId: learner?.id ?? null,
    /** The shared location's region and province (that of its nearest center), while sharing is on. */
    liveRegion,
    liveProvince,
    /** The signed-in learner's Skill Passport: null without one, undefined while it loads or when it failed. */
    passport: passport.data,
    passportStatus: (learner === null
      ? 'none'
      : passport.isPending
        ? 'loading'
        : passport.isError
          ? 'failed'
          : passport.data
            ? 'loaded'
            : 'none') as 'none' | 'loading' | 'failed' | 'loaded',
    /** The Skill Passport's home area, when the catalog knows the place: the default search location. */
    homeArea,
    regions: regions.data ?? [],
    config: config.data,
    today,
    jobs,
    /** The learner's id while the Demand lists are ranked by their Skill Passport, else null. */
    personalFor,
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
    /** The centers for the qualification in focus, best first, each with its main reason (the list beside the map). */
    ranked,
    /** The qualification in focus, by name, when it is known. */
    focusName,
    /** Signed in: the next step for each qualification listed, by code, once the server has answered. */
    fits,
    /** The next step for the qualification in focus, when the Skill Passport points to it. */
    focusFit,
    demandLocality,
    demandOffset,
    loading: !everything && !(sites.isError || regions.isError),
    /** The matched qualifications' listings are still coming. */
    listingsLoading: listings.isFetching && (listings.isPlaceholderData || !listings.data),
    centerResultsUnavailable:
      (sites.isError && !sites.data) ||
      (regions.isError && !regions.data) ||
      (listings.isError && !listings.data),
    failed: sites.isError || regions.isError || listings.isError,
    retrying: sites.isFetching || regions.isFetching || listings.isFetching,
    retry: () => {
      if (sites.isError) void sites.refetch()
      if (regions.isError) void regions.refetch()
      if (listings.isError) void listings.refetch()
    },
  }
}

export type Explore = ReturnType<typeof useExplore>
