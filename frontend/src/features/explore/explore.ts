import type { Region } from '../../api/queries.ts'
import type { CenterKind } from '../training/address.ts'
import { distanceKm, type Center, type Point } from '../training/centers.ts'
import type { Match } from '../finder/api.ts'

// The map-first finder's rules, as plain functions: the plan's nearest-first policy (Task 6) worked out in the
// browser from the data the API already serves. The values are provisional until the Product Owner signs off.

/** Within this distance a center counts as near, until the learner says how far they can go. */
export const NEAR_KM = 25
/** The choices for "How far can you go?". */
export const RANGES_KM = [5, 10, 25, 50, 100] as const
/**
 * Beyond this distance no travel time is shown: a trip that long is likely to need a ferry or a flight, which a
 * straight-line estimate by car can't say. (Makati to Baguio, 211 km, is a drive; to Cebu, 570 km, is not.)
 */
export const FAR_KM = 400
/** Speed by car for the first part of a trip, in town. */
const SPEED_KMH = 30
/** Road distance that is in town, at SPEED_KMH; the rest is on highways. */
const TOWN_ROAD_KM = 35
const HIGHWAY_SPEED_KMH = 60
const DETOUR_FACTOR = 1.4
/** A match scoring this or more is a strong match. */
const STRONG_SCORE = 60
/** A match scoring this or less is a weaker match, shown with a warning. */
const WEAK_SCORE = 35
/** At most this many qualifications are shown. */
export const MAX_QUALIFICATIONS = 5

export type Strength = 'strong' | 'good' | 'weak'

/**
 * Minutes by car estimated from straight-line distance, or null when the center is too far to say. The first
 * TOWN_ROAD_KM of road are driven in town, the rest on highways.
 */
export function estimateMinutes(km: number | null): number | null {
  if (km === null || km > FAR_KM) return null
  const road = km * DETOUR_FACTOR
  const town = Math.min(road, TOWN_ROAD_KM)
  const hours = town / SPEED_KMH + (road - town) / HIGHWAY_SPEED_KMH
  return Math.max(1, Math.round(hours * 60))
}

export function strength(match: Pick<Match, 'score'>): Strength {
  if (match.score >= STRONG_SCORE) return 'strong'
  return match.score > WEAK_SCORE ? 'good' : 'weak'
}

/** One decimal place, as the trip line shows it. */
export const roundKm = (km: number) => Math.round(km * 10) / 10

// Phrases that say the learner wants to learn something new, so training comes first (the plan's learn_phrases).
const LEARN =
  /\b(gusto kong matuto|gustong matuto|matuto|mag-?aral|gusto kong maging|want to learn|want to become|learn how|how to|wants? to be)\b/i

/** Which group a search shows first: training for someone who wants to learn, otherwise assessment. */
export function firstKind(query: string): CenterKind {
  return LEARN.test(query) ? 'training' : 'assessment'
}

/**
 * Whether a center lists the qualification: a program for a training center; for an assessment center, a schedule or
 * the registry's accreditation to assess it (US-0012: accredited centers are listed even without a date).
 */
export function offers(center: Center, code: string): boolean {
  return center.kind === 'training'
    ? center.programs.some((program) => program.qualification.code === code)
    : center.accredited.includes(code) ||
        center.schedules.some((schedule) => schedule.qualification.code === code)
}

/** Whether one of the center's programs for the qualification has a scholarship open today (US-0019). */
export function hasScholarship(center: Center, code: string): boolean {
  return center.programs.some(
    (program) => program.qualification.code === code && program.scholarship_open,
  )
}

/** Whether an open scholarship it shows for the qualification is the December 2 demo's sample data. */
export function hasSampleScholarship(center: Center, code: string): boolean {
  return center.programs.some(
    (program) =>
      program.qualification.code === code &&
      program.scholarship_open &&
      program.scholarship_is_sample,
  )
}

export interface QualificationCard {
  match: Match
  strength: Strength
  /** Nearest first, unmapped last; by name without a starting point. */
  centers: Center[]
  /** Centers within the learner's range. */
  near: number
}

const within = (center: Center, rangeKm: number) =>
  center.distanceKm !== null && center.distanceKm <= rangeKm

/**
 * The centers to list for the learner's range: those within it, or, when none is, all of them unchanged (the
 * nearest is then shown with a note that it's out of range). Order is kept.
 */
export function inRangeOr<T extends Center>(centers: readonly T[], rangeKm: number): T[] {
  const near = centers.filter((center) => within(center, rangeKm))
  return near.length ? near : [...centers]
}

/** For one kind, a card per matched qualification that some center of that kind lists. */
export function cardsFor(
  kind: CenterKind,
  matches: readonly Match[],
  centers: readonly Center[],
  rangeKm: number = NEAR_KM,
) {
  const cards: QualificationCard[] = []
  for (const match of matches) {
    const code = match.qualification.code
    const listed = centers.filter((center) => center.kind === kind && offers(center, code))
    if (!listed.length) continue
    cards.push({
      match,
      strength: strength(match),
      centers: listed,
      near: listed.filter((center) => within(center, rangeKm)).length,
    })
  }
  return cards
}

/** Whether a center of some kind lists a matched qualification, but none of that kind within range. */
export function anyOutOfRange(
  matches: readonly Match[],
  centers: readonly Center[],
  rangeKm: number,
): boolean {
  return (['training', 'assessment'] as const).some((kind) =>
    cardsFor(kind, matches, centers, rangeKm).some(
      (card) => card.near === 0 && card.centers.some((center) => center.distanceKm !== null),
    ),
  )
}

/**
 * A kind (training or assessment) for which no center lists any of the matches at all (QA-2026-11-18-E, US-0014 AC5):
 * a wider range can't help there, so the page suggests a related qualification and where to look instead.
 */
export function anyKindWithoutCenter(
  matches: readonly Match[],
  centers: readonly Center[],
  rangeKm: number,
) {
  return (
    matches.length > 0 &&
    (['training', 'assessment'] as const).some(
      (kind) => cardsFor(kind, matches, centers, rangeKm).length === 0,
    )
  )
}

export interface Related {
  qualification: { code: string; name: string }
  /** Its nearest center of the card's kind, within range. */
  center: Center
}

/** Every qualification a center lists, by code: its programs, its schedules, and the registry's accreditations. */
function listedAt(center: Center, names: ReadonlyMap<string, { name: string; sector: string }>) {
  const listed = new Map<string, { name: string; sector: string }>()
  for (const listing of [...center.programs, ...center.schedules]) {
    listed.set(listing.qualification.code, listing.qualification)
  }
  for (const code of center.accredited) {
    const known = names.get(code)
    if (known && !listed.has(code)) listed.set(code, known)
  }
  return listed
}

/**
 * For a qualification with no center of `kind` within range: a related one that has, with its nearest such
 * center. Related means another qualification the search matched, best match first, or else one in the same
 * sector. `nearby` are the centers within range with everything they list; `catalog` names and sectors the
 * registry's accreditations, which are codes only.
 */
export function relatedWithin({
  kind,
  match,
  matches,
  nearby,
  catalog,
  rangeKm,
}: {
  kind: CenterKind
  match: Match
  matches: readonly Match[]
  nearby: readonly Center[]
  catalog: readonly { code: string; name: string; sector: string }[]
  rangeKm: number
}): Related | null {
  const own = match.qualification.code
  const names = new Map(catalog.map((item) => [item.code, item]))
  const candidates = nearby
    .filter((center) => center.kind === kind && within(center, rangeKm))
    .sort((a, b) => (a.distanceKm as number) - (b.distanceKm as number))
    .map((center) => ({ center, listed: listedAt(center, names) }))
  for (const other of matches) {
    const code = other.qualification.code
    if (code === own) continue
    const found = candidates.find((candidate) => candidate.listed.has(code))
    if (found) return { qualification: other.qualification, center: found.center }
  }
  const sector = match.qualification.sector
  if (!sector) return null
  for (const { center, listed } of candidates) {
    for (const [code, qualification] of listed) {
      if (code !== own && qualification.sector === sector) {
        return { qualification: { code, name: qualification.name }, center }
      }
    }
  }
  return null
}

/** The region whose center is nearest the point: where demand evidence is looked up. */
export function nearestRegion(point: Point | null, regions: readonly Region[]): Region | null {
  if (!point || !regions.length) return null
  return regions.reduce((best, region) =>
    distanceKm(point, region) < distanceKm(point, best) ? region : best,
  )
}

export interface FindJobsConfig {
  tsp_find_jobs_url?: string
  tsp_find_jobs_skill_param?: string
  tsp_find_jobs_area_param?: string
}

/**
 * TSP Find Jobs for the chosen skill and area (Card 5), or null when the deployment hasn't set the page. A skill or
 * area not chosen is left out, so with neither it is TSP's general Find Jobs page. Values are URL-encoded, and
 * anything already on the configured address is kept.
 */
export function findJobsUrl(
  config: FindJobsConfig | undefined,
  skill: string | null,
  area: string | null,
): string | null {
  const base = config?.tsp_find_jobs_url?.trim()
  if (!base) return null
  let url: URL
  try {
    url = new URL(base)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const params: [string | undefined, string | null][] = [
    [config?.tsp_find_jobs_skill_param || 'skill', skill],
    [config?.tsp_find_jobs_area_param || 'area', area],
  ]
  for (const [name, value] of params) {
    if (name && value?.trim()) url.searchParams.set(name, value.trim())
  }
  return url.href
}

// --- US-0004: the Skill Passport's skills and licenses as evidence for going straight to assessment ---------------

/** Words that name a kind of credential or a level, not a trade: they never count as evidence on their own. */
const NOT_A_TRADE = new Set([
  'license',
  'licence',
  'professional',
  'certificate',
  'certified',
  'services',
  'service',
  'operation',
  'operations',
  'level',
  'national',
  'with',
  'and',
  'the',
])

/** A word's stem, so Driving, Driver and Driver's meet, and Cooking meets Cookery. */
function stem(word: string): string {
  return word.replace(/['’]s$/, '').replace(/(ing|ers|er|ery|ry|s)$/, '')
}

function trades(text: string): Set<string> {
  return new Set(
    text
      .toLocaleLowerCase()
      .split(/[^\p{L}'’]+/u)
      .filter((word) => word.length >= 4 && !NOT_A_TRADE.has(word))
      .map(stem)
      .filter((word) => word.length >= 3),
  )
}

/**
 * The skills and licenses in the learner's Skill Passport that name the qualification's trade ("Driving" and "LTO
 * Professional Driver's License" for Driving NC II), in the passport's order. Any at all mean the learner may be
 * ready for assessment, so assessment centers come first. Self-declared skills suggest a route; they never establish
 * formal assessment eligibility, which the assessment center decides.
 */
export function readinessEvidence(
  passport: { skills: string[]; licenses?: string[] } | null | undefined,
  qualificationName: string,
): string[] {
  if (!passport) return []
  const wanted = trades(qualificationName.replace(/\bNC\s+[IV]+\b/gi, ''))
  return [...passport.skills, ...(passport.licenses ?? [])].filter((label) =>
    [...trades(label)].some((word) => wanted.has(word)),
  )
}
