import type { Region } from '../../api/queries.ts'
import type { CenterKind } from '../training/address.ts'
import { distanceKm, type Center, type Point } from '../training/centers.ts'
import type { Match } from '../finder/api.ts'

// The map-first finder's rules, as plain functions: the plan's nearest-first policy (Task 6) worked out in the
// browser from the data the API already serves. The values are provisional until the Product Owner signs off.

/** Within this distance a center counts as near. */
export const NEAR_KM = 25
/** Beyond this distance no travel time is shown. */
export const FAR_KM = 100
const SPEED_KMH = 30
const DETOUR_FACTOR = 1.4
/** A match scoring this or more is a strong match. */
const STRONG_SCORE = 60
/** At most this many qualifications are shown. */
export const MAX_QUALIFICATIONS = 5

export type Strength = 'strong' | 'good'

/** Minutes by car estimated from straight-line distance, or null when the center is too far to say. */
export function estimateMinutes(km: number | null): number | null {
  if (km === null || km > FAR_KM) return null
  return Math.max(1, Math.round(((km * DETOUR_FACTOR) / SPEED_KMH) * 60))
}

export function strength(match: Pick<Match, 'score'>): Strength {
  return match.score >= STRONG_SCORE ? 'strong' : 'good'
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

/** Whether a center lists the qualification: a program for a training center, a schedule for an assessment center. */
export function offers(center: Center, code: string): boolean {
  return center.kind === 'training'
    ? center.programs.some((program) => program.qualification.code === code)
    : center.schedules.some((schedule) => schedule.qualification.code === code)
}

/** Whether one of the center's programs for the qualification says a scholarship is available. */
export function hasScholarship(center: Center, code: string): boolean {
  return center.programs.some(
    (program) => program.qualification.code === code && program.scholarship_available,
  )
}

export interface QualificationCard {
  match: Match
  strength: Strength
  /** Nearest first, unmapped last; by name without a starting point. */
  centers: Center[]
  /** Centers within NEAR_KM. */
  near: number
}

/** For one kind, a card per matched qualification that some center of that kind lists. */
export function cardsFor(kind: CenterKind, matches: readonly Match[], centers: readonly Center[]) {
  const cards: QualificationCard[] = []
  for (const match of matches) {
    const code = match.qualification.code
    const listed = centers.filter((center) => center.kind === kind && offers(center, code))
    if (!listed.length) continue
    cards.push({
      match,
      strength: strength(match),
      centers: listed,
      near: listed.filter((center) => center.distanceKm !== null && center.distanceKm <= NEAR_KM)
        .length,
    })
  }
  return cards
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
