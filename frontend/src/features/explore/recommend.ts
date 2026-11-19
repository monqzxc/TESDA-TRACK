import type { Center } from '../training/centers.ts'
import { estimateMinutes, hasScholarship, NEAR_KM, offers, roadMinutes } from './explore.ts'
import type { Outlook } from './outlookApi.ts'

// ---------------------------------------------------------------------------------------------------------------
// The ranked list beside the map (US: "Recommended centers with reasons"). Within the learner's range, the centers
// offering the qualification in focus are ranked by estimated travel time; an open scholarship, strong demand in the
// center's region, or (signed in) a Skill Passport that shows the learner may be ready for assessment shortens the
// time a center is ranked by, so it moves above a center with a similar trip but none of these. The weights are
// provisional until the Product Owner signs them off.
// ---------------------------------------------------------------------------------------------------------------

/** A center with an open scholarship for the qualification ranks as if its trip were this much shorter. */
export const SCHOLARSHIP_WEIGHT = 0.8
/** A center in a region where demand for the qualification is high. */
export const DEMAND_WEIGHT = 0.9
/** An assessment center, for a signed-in learner whose Skill Passport suggests they may be ready. */
export const READY_WEIGHT = 0.85
/** How many centers the ranked list shows. */
export const MAX_RANKED = 5
/** Outside the learner's range, the nearest few are still listed, nearest first, with no boosts. */
const MAX_OUTSIDE = 3
/** A region's share of the posting records at this many times an even share counts as high demand (the API's). */
const HIGH_DEMAND_RATIO = 1.5

/** The main reason a ranked center is where it is, in the order the list prefers to say it. */
export type RankReason =
  /** The learner's Skill Passport suggests they may be ready: an assessment center to get certified at. */
  | 'ready'
  /** The shortest trip of those listed. */
  | 'nearest'
  /** Moved up for an open scholarship. */
  | 'scholarship'
  /** Moved up for strong demand in its region. */
  | 'demand'
  /** Within range, with none of the above. */
  | 'inRange'
  /** Nothing is within range: one of the nearest outside it. */
  | 'outside'

export interface RankedCenter {
  center: Center
  /** Estimated minutes by car, as the trip line shows them; null when too far to say. */
  minutes: number | null
  scholarship: boolean
  /** Demand for the qualification is high in the center's region. */
  demand: boolean
  /** An assessment center the learner may be ready for (signed in, from their Skill Passport). */
  ready: boolean
  reason: RankReason
}

/**
 * The regions where demand for the qualification is high: their share of the posting records is HIGH_DEMAND_RATIO
 * times an even share or more, and the region has enough records to say so.
 */
export function highDemandRegions(outlook: Pick<Outlook, 'areas'> | undefined): Set<string> {
  const areas = outlook?.areas ?? []
  return new Set(
    areas
      .filter(
        (area) =>
          !area.limited &&
          area.demand_share !== null &&
          area.demand_share * areas.length >= HIGH_DEMAND_RATIO,
      )
      .map((area) => area.region_code),
  )
}

/**
 * The centers in `supply` ranked for the learner, best first, with the main reason for each. Only measured centers
 * are ranked: without a location or typed place there is nothing to rank by.
 */
export function rankCenters({
  supply,
  code,
  rangeKm = NEAR_KM,
  demandRegions = new Set(),
  ready = false,
  limit = MAX_RANKED,
}: {
  supply: readonly Center[]
  code: string
  rangeKm?: number
  demandRegions?: ReadonlySet<string>
  /** The learner's Skill Passport suggests they may be ready for assessment in this qualification. */
  ready?: boolean
  limit?: number
}): RankedCenter[] {
  const measured = supply.filter((center) => center.distanceKm !== null)
  const near = measured.filter((center) => (center.distanceKm as number) <= rangeKm)
  const describe = (center: Center) => ({
    center,
    minutes: estimateMinutes(center.distanceKm),
    scholarship: center.kind === 'training' && hasScholarship(center, code),
    demand: center.regionCode !== null && demandRegions.has(center.regionCode),
    ready: ready && center.kind === 'assessment',
  })
  // Uncapped, so even centers too far for a shown time still rank by trip.
  const road = (center: Center) => roadMinutes(center.distanceKm as number)
  const tieBreak = (a: Center, b: Center) =>
    (a.distanceKm as number) - (b.distanceKm as number) || a.name.localeCompare(b.name)

  if (!near.length) {
    return [...measured]
      .sort((a, b) => road(a) - road(b) || tieBreak(a, b))
      .slice(0, Math.min(limit, MAX_OUTSIDE))
      .map((center) => ({ ...describe(center), reason: 'outside' as const }))
  }

  const scored = near.map((center) => {
    const item = describe(center)
    const weight =
      (item.scholarship ? SCHOLARSHIP_WEIGHT : 1) *
      (item.demand ? DEMAND_WEIGHT : 1) *
      (item.ready ? READY_WEIGHT : 1)
    return { item, trip: road(center), score: road(center) * weight }
  })
  const fastest = Math.min(...scored.map(({ trip }) => trip))
  return scored
    .sort((a, b) => a.score - b.score || tieBreak(a.item.center, b.item.center))
    .slice(0, limit)
    .map(({ item, trip }) => {
      const reason: RankReason = item.ready
        ? 'ready'
        : trip === fastest
          ? 'nearest'
          : item.scholarship
            ? 'scholarship'
            : item.demand
              ? 'demand'
              : 'inRange'
      return { ...item, reason }
    })
}

// Which centers the page recommends for the qualification in focus, worked out in the browser: the learner's
// location never leaves it. Nearest first, as everywhere on this page; a learner open to relocating also sees a
// center in each region where recorded demand is strongest against supply.

/** Why a center is recommended. */
export type Reason =
  /** Within the learner's range (NEAR_KM until they choose). */
  | 'near'
  /** The nearest, farther than that but in the learner's own region. */
  | 'region'
  /** The nearest, though it is in another region. */
  | 'elsewhere'
  /** In a region where demand is stronger, for a learner open to moving. */
  | 'relocation'

export interface Recommendation {
  center: Center
  reason: Reason
}

export interface Recommendations {
  training: Recommendation | null
  assessment: Recommendation | null
  /** At most one center for each of the first regions the outlook names. */
  relocation: Recommendation[]
}

export const NO_RECOMMENDATIONS: Recommendations = {
  training: null,
  assessment: null,
  relocation: [],
}
const MAX_RELOCATION = 2

/**
 * The centers that list the qualification: the sites the outlook counts as supply (the registry accredits
 * assessment centers that publish no schedule), and any the page's own listings add, such as example sites.
 */
export function supplyCenters(
  centers: readonly Center[],
  code: string,
  outlook: Pick<Outlook, 'training_site_ids' | 'assessment_site_ids'> | undefined,
): Center[] {
  const counted = new Set([
    ...(outlook?.training_site_ids ?? []).map((id) => `training-${id}`),
    ...(outlook?.assessment_site_ids ?? []).map((id) => `assessment-${id}`),
  ])
  return centers.filter((center) => counted.has(center.id) || offers(center, code))
}

const byDistance = (a: Center, b: Center) =>
  (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || a.name.localeCompare(b.name)

/**
 * The best-ranked training center and assessment center among `supply` (measured from the learner's location or
 * typed place; none without one): the nearest, unless a similar trip has an open scholarship or more demand. Then, for a learner open to relocating, a center in each of the
 * outlook's alternative regions: a training center where there is one.
 */
export function recommend({
  supply,
  homeRegion,
  relocate,
  alternatives,
  nearKm = NEAR_KM,
  code = '',
  demandRegions,
  ready = false,
}: {
  supply: readonly Center[]
  homeRegion: string | null
  relocate: boolean
  alternatives: readonly string[]
  /** How far the learner can go. */
  nearKm?: number
  /** The qualification in focus, for its scholarships. */
  code?: string
  demandRegions?: ReadonlySet<string>
  ready?: boolean
}): Recommendations {
  // Each kind's pick is the top of its own ranking (rankCenters), so the brief, the map's stars and the ranked
  // list beside the map agree.
  const nearest = (kind: Center['kind']): Recommendation | null => {
    const center = rankCenters({
      supply: supply.filter((candidate) => candidate.kind === kind),
      code,
      rangeKm: nearKm,
      demandRegions,
      ready,
      limit: 1,
    })[0]?.center
    if (!center) return null
    const reason: Reason =
      (center.distanceKm as number) <= nearKm
        ? 'near'
        : homeRegion && center.regionCode === homeRegion
          ? 'region'
          : 'elsewhere'
    return { center, reason }
  }
  const training = nearest('training')
  const assessment = nearest('assessment')
  const taken = new Set([training?.center.id, assessment?.center.id])
  const relocation: Recommendation[] = []
  if (relocate) {
    for (const region of alternatives) {
      if (relocation.length === MAX_RELOCATION) break
      if (region === homeRegion) continue
      // A center without coordinates is left out of recommendations until its location is fixed (US-0014).
      const there = supply
        .filter(
          (center) =>
            center.regionCode === region &&
            !taken.has(center.id) &&
            center.latitude !== null &&
            center.longitude !== null,
        )
        .sort(
          (a, b) =>
            Number(b.kind === 'training') - Number(a.kind === 'training') || byDistance(a, b),
        )
      if (there[0]) relocation.push({ center: there[0], reason: 'relocation' })
    }
  }
  return { training, assessment, relocation }
}

/** Every recommended center's id, for the map's stars and the list's tags. */
export function recommendedIds(recommendations: Recommendations): string[] {
  return [
    recommendations.training,
    recommendations.assessment,
    ...recommendations.relocation,
  ].flatMap((item) => (item ? [item.center.id] : []))
}
