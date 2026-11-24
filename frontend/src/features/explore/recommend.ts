import { addDays, philippineDay, type Center, type Schedule } from '../training/centers.ts'
import { estimateMinutes, hasScholarship, NEAR_KM, offers, roadMinutes } from './explore.ts'
import type { Outlook } from './outlookApi.ts'

// ---------------------------------------------------------------------------------------------------------------
// The ranked list beside the map (US: "Recommended centers with reasons"). Within the learner's range, training
// centers offering the qualification in focus are ranked by estimated travel time; an open scholarship or strong
// demand in the center's region shortens the time a center is ranked by, so it moves above a center with a similar
// trip but neither.
//
// Training centers, once the server's service scores arrive (POST /recommendations/training, sent WITHOUT the
// learner's location), rank by the same weighted score as everywhere else in TESDA-TRACK: the server scores what
// doesn't depend on where the learner is (verification, an assessment nearby, schedule, demand, goal, preferences),
// and the browser adds proximity with the server's own weight and formula, so the location never leaves it. A
// program the server leaves out (an expired authority, an unmet prerequisite) is not ranked.
//
// Assessment centers rank by distance first, then by a weighted score (assessmentScore): every center that lists
// the qualification goes into a distance band (ASSESSMENT_BANDS_KM; distance, never province or region borders), a
// nearer band always comes first, and inside a band the score decides. The score is worked out here, in the browser,
// so the location never leaves it. A Skill Passport that suggests the learner may be ready puts assessment centers
// first in the merged list, without reordering them among themselves.
// ---------------------------------------------------------------------------------------------------------------

/** A center with an open scholarship for the qualification ranks as if its trip were this much shorter (training). */
export const SCHOLARSHIP_WEIGHT = 0.8
/** A training center in a region where demand for the qualification is high. */
export const DEMAND_WEIGHT = 0.9
/** How many centers the ranked list shows. */
export const MAX_RANKED = 5
/**
 * Outside the learner's range, the nearest few are still listed: training centers when no center is in range, and
 * assessment centers in the farthest band (beyond 60 km and the range).
 */
const MAX_OUTSIDE = 3
/** A region's share of the posting records at this many times an even share counts as high demand (the API's). */
const HIGH_DEMAND_RATIO = 1.5

/**
 * The assessment distance bands' upper limits, in km: very near, the learner's range (NEAR_KM until they choose; the
 * middle limit is always replaced by their range), and 60 km. Farther than all of them, only the nearest 3 are listed.
 * A range of 10 km or less merges the first two bands; one over 60 km leaves the third empty.
 */
export const ASSESSMENT_BANDS_KM = [10, NEAR_KM, 60] as const

/** 1 very near, 2 within the learner's range, 3 within 60 km, 4 farther. */
export type AssessmentBand = 1 | 2 | 3 | 4

/** The band a center this far away falls in, for a learner whose range is `rangeKm`. */
export function assessmentBand(km: number, rangeKm: number): AssessmentBand {
  const [veryNear, , within] = ASSESSMENT_BANDS_KM
  return km <= veryNear ? 1 : km <= rangeKm ? 2 : km <= within ? 3 : 4
}

/**
 * How much each component of an assessment center's score counts, adding up to 1. The same idea as the server's
 * training weights (RankingWeights in backend/tesda_track/config.py): each component is 0..1 and the score is
 * renormalized over the ones that apply. Proximity counts for less than in training: the bands already sort by
 * distance.
 */
export const ASSESSMENT_WEIGHTS = {
  schedule: 0.4,
  verification: 0.25,
  proximity: 0.15,
  demand: 0.15,
  fee: 0.05,
} as const

export type AssessmentComponent = keyof typeof ASSESSMENT_WEIGHTS

/** An open schedule this many days away or sooner counts in full. */
const SOON_DAYS = 60

/**
 * Where an assessment center stands on schedules for the qualification, from its open schedules only: seats within
 * 60 days, seats later, accredited by the registry with no open schedule, every open schedule full, or none at all.
 */
export type ScheduleState = 'open' | 'later' | 'accredited' | 'full' | 'none'

const SCHEDULE_VALUE: Record<ScheduleState, number> = {
  open: 1,
  later: 0.7,
  accredited: 0.3,
  full: 0,
  none: 0,
}

/** Why an assessment center ranks where it does. */
export interface AssessmentWhy {
  band: AssessmentBand
  schedule: ScheduleState
  /** The component that adds the most to its score; schedule when none adds anything. */
  strongest: AssessmentComponent
  /** Each applicable component's value, 0..1; a component left out isn't here. */
  components: Partial<Record<AssessmentComponent, number>>
}

/** The main reason a ranked center is where it is, in the order the list prefers to say it. */
export type RankReason =
  /** The shortest trip of those listed. */
  | 'nearest'
  /** Moved up for an open scholarship. */
  | 'scholarship'
  /** Moved up for strong demand in its region. */
  | 'demand'
  /** Within range, with none of the above. */
  | 'inRange'
  /** An assessment center ranked by its distance band, then its score: `assessment` says why. */
  | 'assessment'
  /** A training center ranked by the server's service score: `why` holds its reasons. */
  | 'service'
  /** A training center whose service the server can't confirm yet: `why` says what needs checking. */
  | 'unconfirmed'
  /** No center is within range: a training center among the nearest outside it. */
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
  /** With reason service or assessment: the combined score, 0..100. */
  score?: number
  /** With reason assessment: its band, schedule and strongest component. */
  assessment?: AssessmentWhy
  /** With reason service or unconfirmed: the server's reasons, in its words. */
  why?: string[]
}

/** The server's scores for one qualification's programs, from a ranking asked for without a location. */
export interface ServiceScores {
  /** Configured weights by component, adding up to 1 (the server's ranking_weights). */
  weights: Readonly<Record<string, number>>
  byProgram: ReadonlyMap<
    number,
    {
      components: Readonly<Record<string, number | null>>
      status: Readonly<Record<string, string>>
      explanation: readonly string[]
    }
  >
  /** Programs the server lists as requiring verification, with why. */
  unconfirmed: ReadonlyMap<number, readonly string[]>
}

/** The server's proximity_radius_km: proximity is 1 at the learner and 0 this far away. */
export const PROXIMITY_RADIUS_KM = 100

/**
 * One program's score as the server computes it, with proximity added here: each component the server measured
 * or tried to (not "not_applicable"), plus proximity, weighted and renormalized over those it counted.
 */
export function serviceScore(
  entry: NonNullable<ReturnType<ServiceScores['byProgram']['get']>>,
  weights: ServiceScores['weights'],
  distanceKm: number | null,
): number {
  let total = 0
  let counted = 0
  for (const [name, weight] of Object.entries(weights)) {
    if (name === 'proximity') {
      if (distanceKm === null) continue
      total += weight * Math.max(0, 1 - distanceKm / PROXIMITY_RADIUS_KM)
      counted += weight
      continue
    }
    if ((entry.status[name] ?? 'not_applicable') === 'not_applicable') continue
    total += weight * (entry.components[name] ?? 0)
    counted += weight
  }
  return counted ? Math.round((100 * total) / counted) : 0
}

/** A training center's best program for the qualification: scored, unconfirmed, or left out by the server. */
function serviceOf(center: Center, code: string, scores: ServiceScores) {
  let best: { score: number; why: readonly string[] } | null = null
  let unconfirmed: readonly string[] | null = null
  for (const program of center.programs) {
    if (program.qualification.code !== code) continue
    const entry = scores.byProgram.get(program.id)
    if (entry) {
      const score = serviceScore(entry, scores.weights, center.distanceKm)
      if (!best || score > best.score) best = { score, why: entry.explanation }
    } else if (!unconfirmed) {
      unconfirmed = scores.unconfirmed.get(program.id) ?? null
    }
  }
  return best
    ? { kind: 'scored' as const, ...best }
    : unconfirmed
      ? { kind: 'unconfirmed' as const, why: unconfirmed }
      : null
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
 * Each region's posting records for the qualification against its busiest region's, 0..1: the training rule's demand
 * component (RegionalDemand in backend/tesda_track/services/ranking.py). Empty when there are no records, so demand
 * is left out of the score rather than counted as zero.
 */
export function regionalDemand(outlook: Pick<Outlook, 'areas'> | undefined): Map<string, number> {
  const areas = outlook?.areas ?? []
  const busiest = Math.max(0, ...areas.map((area) => area.posting_count))
  if (!busiest) return new Map()
  return new Map(areas.map((area) => [area.region_code, area.posting_count / busiest]))
}

/** Verified and available counts in full; unavailable or expired not at all; anything not yet reviewed, half. */
function verificationValue(schedule: Schedule): number {
  const verification = schedule.verification?.status ?? 'unknown'
  const availability = schedule.availability?.status ?? 'unknown'
  if (
    verification === 'unavailable' ||
    verification === 'expired' ||
    availability === 'unavailable'
  )
    return 0
  return verification === 'verified' && availability === 'available' ? 1 : 0.5
}

/** A published fee as a number, or null when there is none. */
function feeOf(schedule: Schedule | null): number | null {
  if (!schedule?.fee) return null
  const fee = Number(schedule.fee)
  return Number.isFinite(fee) ? fee : null
}

/**
 * An assessment center's schedules for the qualification, from its open ones not yet past: its schedule state and
 * its best open schedule (seats within 60 days first, then seats later, then the soonest), or null without one.
 */
function assessmentSchedule(center: Center, code: string, today: string) {
  const soon = addDays(today, SOON_DAYS)
  const open = center.schedules
    .filter(
      (schedule) =>
        schedule.status === 'open' &&
        schedule.qualification.code === code &&
        philippineDay(schedule.scheduled_at) >= today,
    )
    .map((schedule) => {
      const day = philippineDay(schedule.scheduled_at)
      const rank = schedule.seats_left > 0 ? (day <= soon ? 0 : 1) : 2
      return { schedule, day, rank }
    })
    .sort((a, b) => a.rank - b.rank || a.day.localeCompare(b.day))
  const best = open[0]
  const state: ScheduleState = !best
    ? center.accredited.includes(code)
      ? 'accredited'
      : 'none'
    : best.rank === 0
      ? 'open'
      : best.rank === 1
        ? 'later'
        : 'full'
  return { state, best: best?.schedule ?? null }
}

/**
 * An assessment center's score, 0..100, from its components, weighted by ASSESSMENT_WEIGHTS and renormalized over
 * those that apply, with the component that adds the most.
 */
export function assessmentScore(components: Partial<Record<AssessmentComponent, number>>): {
  score: number
  strongest: AssessmentComponent
} {
  let total = 0
  let counted = 0
  let strongest: AssessmentComponent = 'schedule'
  let most = 0
  for (const [name, weight] of Object.entries(ASSESSMENT_WEIGHTS) as [
    AssessmentComponent,
    number,
  ][]) {
    const value = components[name]
    if (value === undefined) continue
    total += weight * value
    counted += weight
    // Only a fully verified schedule is a reason to name; half (not yet reviewed) is not a strength.
    const adds = name === 'verification' && value < 1 ? 0 : weight * value
    if (adds > most) {
      most = adds
      strongest = name
    }
  }
  return { score: counted ? Math.round((100 * total) / counted) : 0, strongest }
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
  regionDemand = new Map(),
  ready = false,
  limit = MAX_RANKED,
  scores,
  today = philippineDay(new Date()),
}: {
  supply: readonly Center[]
  code: string
  rangeKm?: number
  /** Regions where demand is high: training centers there move up, and every center there is tagged. */
  demandRegions?: ReadonlySet<string>
  /** Each region's demand for the qualification, 0..1 (regionalDemand): an assessment center's demand component. */
  regionDemand?: ReadonlyMap<string, number>
  /** The learner's Skill Passport suggests they may be ready for assessment in this qualification. */
  ready?: boolean
  limit?: number
  /** The server's service scores for the qualification's programs; without them, training ranks by trip. */
  scores?: ServiceScores
  /** Today in the Philippines, as an ISO day: open schedules before it are over. */
  today?: string
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

  const assessment = byBand(measured.filter((center) => center.kind === 'assessment'))
  const nearTraining = near.filter((center) => center.kind === 'training')
  let training: RankedCenter[]
  if (!near.length) {
    // Nothing of either kind in range: the nearest few training centers outside it, nearest first, with no boosts.
    training = measured
      .filter((center) => center.kind === 'training')
      .sort((a, b) => road(a) - road(b) || tieBreak(a, b))
      .slice(0, Math.min(limit, MAX_OUTSIDE))
      .map((center) => ({ ...describe(center), reason: 'outside' as const }))
  } else if (scores) {
    const scored: RankedCenter[] = []
    const unconfirmed: RankedCenter[] = []
    for (const center of nearTraining) {
      const service = serviceOf(center, code, scores)
      if (!service) continue // the server left every program here out: not ranked
      const item = { ...describe(center), why: [...service.why] }
      if (service.kind === 'scored')
        scored.push({ ...item, reason: 'service', score: service.score })
      else unconfirmed.push({ ...item, reason: 'unconfirmed' })
    }
    scored.sort((a, b) => (b.score as number) - (a.score as number) || tieBreak(a.center, b.center))
    unconfirmed.sort((a, b) => tieBreak(a.center, b.center))
    training = [...scored, ...unconfirmed]
  } else {
    training = byTrip(nearTraining)
  }

  // Two rankings on different scales: take turns, the kind the learner's next step points to first.
  const first = ready ? assessment : training
  const second = ready ? training : assessment
  const merged: RankedCenter[] = []
  for (let i = 0; merged.length < limit && (i < first.length || i < second.length); i++) {
    if (first[i]) merged.push(first[i] as RankedCenter)
    if (second[i] && merged.length < limit) merged.push(second[i] as RankedCenter)
  }
  return merged

  function byTrip(candidates: readonly Center[]): RankedCenter[] {
    if (!candidates.length) return []
    const scored = candidates.map((center) => {
      const item = describe(center)
      const weight = (item.scholarship ? SCHOLARSHIP_WEIGHT : 1) * (item.demand ? DEMAND_WEIGHT : 1)
      return { item, trip: road(center), score: road(center) * weight }
    })
    const fastest = Math.min(...scored.map(({ trip }) => trip))
    return scored
      .sort((a, b) => a.score - b.score || tieBreak(a.item.center, b.item.center))
      .slice(0, limit)
      .map(({ item, trip }) => {
        const reason: RankReason =
          trip === fastest
            ? 'nearest'
            : item.scholarship
              ? 'scholarship'
              : item.demand
                ? 'demand'
                : 'inRange'
        return { ...item, reason }
      })
  }

  /**
   * Assessment centers by distance band, nearest band first, then by score inside each band. A center whose open
   * schedules are all full comes last in its band, whatever its other components; ties go to the shorter distance,
   * then the name.
   */
  function byBand(candidates: readonly Center[]): RankedCenter[] {
    const bands = new Map<AssessmentBand, Center[]>()
    for (const center of candidates) {
      const band = assessmentBand(center.distanceKm as number, rangeKm)
      bands.set(band, [...(bands.get(band) ?? []), center])
    }
    const ranked: RankedCenter[] = []
    for (const band of [1, 2, 3, 4] as const) {
      let members = bands.get(band) ?? []
      if (band === 4) members = [...members].sort(tieBreak).slice(0, MAX_OUTSIDE)
      const rows = members.map((center) => ({ center, ...assessmentSchedule(center, code, today) }))
      // The fee compares the band's centers: 1 for the lowest, 0 for the highest.
      const fees = rows.flatMap(({ best }) => feeOf(best) ?? [])
      const lowest = Math.min(...fees)
      const highest = Math.max(...fees)
      const items = rows.map(({ center, state, best }) => {
        const components: Partial<Record<AssessmentComponent, number>> = {
          schedule: SCHEDULE_VALUE[state],
          proximity: Math.max(0, 1 - (center.distanceKm as number) / PROXIMITY_RADIUS_KM),
        }
        if (best) components.verification = verificationValue(best)
        if (regionDemand.size) components.demand = regionDemand.get(center.regionCode ?? '') ?? 0
        const fee = feeOf(best)
        if (fee !== null)
          components.fee = highest > lowest ? (highest - fee) / (highest - lowest) : 1
        const { score, strongest } = assessmentScore(components)
        return {
          ...describe(center),
          reason: 'assessment' as const,
          score,
          assessment: { band, schedule: state, strongest, components },
        }
      })
      items.sort(
        (a, b) =>
          Number(a.assessment.schedule === 'full') - Number(b.assessment.schedule === 'full') ||
          b.score - a.score ||
          tieBreak(a.center, b.center),
      )
      ranked.push(...items)
    }
    return ranked.slice(0, limit)
  }
}

/**
 * US-0011: one combined list, independent of center type. Keep eligibility and service metadata from each kind's
 * ranking, but never compare their incompatible service scores or alternate the two lists. The existing bounded
 * scholarship/demand discounts allow a similar trip to move up; outside the chosen range there are no discounts.
 */
export function rankCombinedCenters(options: Parameters<typeof rankCenters>[0]): RankedCenter[] {
  const candidates = rankCenters({ ...options, limit: options.supply.length })
  const trip = (item: RankedCenter) => roadMinutes(item.center.distanceKm as number)
  const byTrip = (a: RankedCenter, b: RankedCenter) =>
    trip(a) - trip(b) ||
    (a.center.distanceKm as number) - (b.center.distanceKm as number) ||
    a.center.name.localeCompare(b.center.name) ||
    a.center.id.localeCompare(b.center.id)
  const baseline = [...candidates].sort(byTrip)
  const position = new Map(baseline.map((item, index) => [item.center.id, index]))
  const range = options.rangeKm ?? NEAR_KM
  const adjustedTrip = (item: RankedCenter) =>
    trip(item) *
    ((item.center.distanceKm as number) > range
      ? 1
      : (item.scholarship ? SCHOLARSHIP_WEIGHT : 1) * (item.demand ? DEMAND_WEIGHT : 1))
  return [...candidates]
    .sort((a, b) => adjustedTrip(a) - adjustedTrip(b) || byTrip(a, b))
    .slice(0, options.limit ?? MAX_RANKED)
    .map((item, index) => ({
      ...item,
      reason:
        (item.center.distanceKm as number) > range
          ? 'outside'
          : index < (position.get(item.center.id) ?? index)
            ? item.scholarship
              ? 'scholarship'
              : 'demand'
            : item.center.id === baseline[0]?.center.id
              ? 'nearest'
              : 'inRange',
    }))
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
 * typed place; none without one): the top of each kind's ranking (rankCenters): for training, the nearest unless a
 * similar trip has an open scholarship or more demand, or the server's score; for assessment, the best-scored center
 * in the nearest distance band. Then, for a learner open to relocating, a center in each of the outlook's alternative
 * regions: a training center where there is one.
 */
export function recommend({
  supply,
  homeRegion,
  relocate,
  alternatives,
  nearKm = NEAR_KM,
  code = '',
  demandRegions,
  regionDemand,
  ready = false,
  scores,
  today,
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
  regionDemand?: ReadonlyMap<string, number>
  ready?: boolean
  scores?: ServiceScores
  today?: string
}): Recommendations {
  // Each kind's pick is the top of its own ranking (rankCenters), so the brief, the map's stars and the ranked
  // list beside the map agree.
  const nearest = (kind: Center['kind']): Recommendation | null => {
    const center = rankCenters({
      supply: supply.filter((candidate) => candidate.kind === kind),
      code,
      rangeKm: nearKm,
      demandRegions,
      regionDemand,
      ready,
      limit: 1,
      scores,
      today,
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
