import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { regionsQuery, type Qualification } from '../../api/queries.ts'
import { throwWithoutData } from '../../components/QueryBoundary.tsx'
import { useFinderStore } from '../finder/store.ts'
import { clientConfigQuery, fitQuery, listingsQuery, sitesQuery } from './api.ts'
import {
  buildCenters,
  filterCenters,
  findPlace,
  philippineDay,
  provinces,
  sortCenters,
  withDistances,
  type Center,
  type FoundPlace,
  type Point,
} from './centers.ts'
import { useTrainingFilters, useTrainingStore } from './state.ts'

/** Where distances are measured from: the learner's own location, or a place they typed. */
export interface Reference extends Point {
  label: string
  /** The learner's own location, not a place they typed. */
  mine: boolean
}

/**
 * Everything the page shows, worked out from the address's filters and the page's state, as
 * frontend/training_view.py show_training does: the centers that match, measured from the learner's location (or a
 * place they typed) and sorted; the one shown in full; and how well its programs fit. Each request that the page
 * can't do without goes to the QueryBoundary around it if it fails.
 */
export function useCenters(catalog: readonly Qualification[]) {
  const { filters } = useTrainingFilters()
  const location = useTrainingStore((state) => (state.useLocation ? state.location : null))
  const placeText = useTrainingStore((state) => state.placeText)
  const goal = useFinderStore((state) => state.journey?.query ?? null)

  const regions = useQuery({ ...regionsQuery, throwOnError: throwWithoutData })
  const sites = useQuery({ ...sitesQuery, throwOnError: throwWithoutData })
  const config = useQuery(clientConfigQuery)

  // Only qualifications the catalog has, so an old or mistyped address can't ask for listings of nothing.
  const names = useMemo(
    () => new Map(catalog.map((qualification) => [qualification.code, qualification.name])),
    [catalog],
  )
  const codesKey = filters.qualifications.filter((code) => names.has(code)).join(',')
  const codes = useMemo(() => (codesKey ? codesKey.split(',') : []), [codesKey])
  const listings = useQuery({
    ...listingsQuery(codes),
    throwOnError: throwWithoutData,
    // A new qualification asks again; the last results stay on screen meanwhile.
    placeholderData: keepPreviousData,
  })

  const regionMap = useMemo(
    () => new Map((regions.data ?? []).map((region) => [region.code, region])),
    [regions.data],
  )
  const everything = useMemo(
    () =>
      sites.data && listings.data
        ? buildCenters(
            sites.data.providers,
            sites.data.assessmentSites,
            listings.data.programs,
            listings.data.schedules,
            regionMap,
          )
        : null,
    [sites.data, listings.data, regionMap],
  )

  const today = philippineDay(new Date())
  const region = filters.region && regionMap.has(filters.region) ? filters.region : null
  const provinceOptions = useMemo(
    () => (everything ? provinces(everything, region ?? undefined) : []),
    [everything, region],
  )
  const province =
    filters.province && provinceOptions.includes(filters.province) ? filters.province : null
  const place: FoundPlace | null = useMemo(
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

  const centers: Center[] = useMemo(() => {
    if (!everything) return []
    const matching = filterCenters(
      everything,
      {
        kinds: filters.kinds,
        regionCode: region ?? undefined,
        province: province ?? undefined,
        text: filters.search,
        qualificationCodes: codes,
        deliveryMode: filters.mode ?? undefined,
        withinDays: filters.within ?? undefined,
        scholarship: filters.scholarship,
      },
      today,
    )
    // Nearest first needs somewhere to measure from; without it, by name.
    const order = reference || filters.sort !== 'nearest' ? filters.sort : 'name'
    return sortCenters(withDistances(matching, reference), order, today)
  }, [
    everything,
    filters.kinds,
    region,
    province,
    filters.search,
    codes,
    filters.mode,
    filters.within,
    filters.scholarship,
    filters.sort,
    today,
    reference,
  ])

  const selected = centers.find((center) => center.id === filters.center) ?? null
  // Until a center is selected, the first result is the one shown in full.
  const featured = selected ?? centers[0] ?? null
  const measured = centers.filter((center) => center.distanceKm !== null)
  const nearestId = measured.length
    ? measured.reduce((a, b) => ((b.distanceKm ?? 0) < (a.distanceKm ?? 0) ? b : a)).id
    : null

  // How well the featured center's programs fit, for the qualifications chosen. The learner's own location is never
  // sent: the API keeps an audit of every ranking, and the page promises their location isn't saved.
  const fitCodes =
    featured?.kind === 'training'
      ? [...new Set(featured.programs.map((program) => program.qualification.code))]
          .filter((code) => codes.includes(code))
          .sort()
      : []
  const fits = useQueries({
    queries: fitCodes.map((code) =>
      fitQuery({
        code,
        goal,
        place: location ? null : place,
        mode: filters.mode,
        scholarship: filters.scholarship,
      }),
    ),
    combine: (results) => {
      const merged = new Map<number, { score: number; explanation: string[] }>()
      for (const result of results) for (const [id, fit] of result.data ?? []) merged.set(id, fit)
      return merged
    },
  })

  return {
    loading: everything === null,
    /** Fetching a new qualification's listings, with the last results still on screen. */
    refreshing: listings.isPlaceholderData,
    truncated: listings.data?.truncated ?? false,
    regions: regions.data ?? [],
    names,
    provinceOptions,
    region,
    province,
    codes,
    place,
    reference,
    centers,
    featured,
    selected,
    nearestId,
    fits,
    today,
    config: config.data,
  }
}

export type CenterResults = ReturnType<typeof useCenters>
