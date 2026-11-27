import type { Match } from '../finder/api.ts'
import { type Center, distanceKm, type Point } from '../training/centers.ts'
import { ASSESS_FIRST } from '../tsp/passport.ts'
import type { PersonalFit } from './demandApi.ts'
import { countedCenters, CUSTOM_KM, estimateMinutes, offers, strength } from './explore.ts'
import type { NearbySuggestion, Outlook } from './outlookApi.ts'

// The guided step between a search and the center list (docs/superpowers/specs/2026-11-27-explore-guided-cards-
// design.md): TRACK's pick and three groups of cards, each saying why. Pure rules, so each can be checked alone.

export type GroupId = 'near' | 'demand' | 'consider'

export interface DemandSignal {
  level: 'high' | 'moderate' | 'low' | 'none'
  limited: boolean
  count: number
  /** Modelled demand (ABDD planning), never to be worded as job posts. */
  sample: boolean
  rank: number | null
  rankedOf: number
}

export interface PickCandidate {
  match: Match
  /** Centers for it within the range (every one while relocating). */
  nearCount: number
  /** The nearest center for it with a known distance, in range or not. */
  nearestKm: number | null
  nearestName: string | null
  demand: DemandSignal | null
  fit: boolean
}

export interface Checks {
  near: boolean
  demand: boolean
  fit: boolean
}

export interface Pick {
  candidate: PickCandidate
  checks: Checks
  /** best: all three checks; pick: two. */
  tier: 'best' | 'pick'
}

export interface NearCard {
  match: Match
  nearCount: number
  nearestKm: number | null
  nearestMinutes: number | null
}

export type NearGroup =
  | { kind: 'cards'; cards: NearCard[] }
  | { kind: 'none-in-range'; nearestKm: number; town: string; widenTo: number }
  | { kind: 'no-place' }

export interface DemandRegionCard {
  regionCode: string
  name: string
  count: number
  sample: boolean
  training: number
  assessment: number
  /** From the learner to the region's point, rounded; null without a place. */
  km: number | null
  titles: string[]
  balance: Outlook['areas'][number]['balance']
}

export interface DemandGroup {
  goodNews: { home: string; rankedOf: number } | null
  cards: DemandRegionCard[]
}

export const GROUP_LIMIT = 3
export const PICK_CANDIDATES = 3
/** Fewer records say nothing about demand (MIN_RECORDS in qualification_outlook.py). */
const MIN_RECORDS = 3
const IN_DEMAND = new Set<DemandSignal['level']>(['high', 'moderate'])

export function demandSignal(outlook: Outlook | undefined): DemandSignal | null {
  const home = outlook?.home_demand
  if (!outlook || !home) return null
  return {
    level: home.level,
    limited: home.limited,
    count: home.posting_count,
    sample: outlook.demand_is_sample ?? false,
    rank: home.rank,
    rankedOf: home.ranked_of,
  }
}

// The count is checked too: an older API can still call a handful of records "high" without flagging it limited.
const inDemand = (signal: DemandSignal | null) =>
  signal !== null && IN_DEMAND.has(signal.level) && !signal.limited && signal.count >= MIN_RECORDS

export function fitsYou(
  match: Match,
  fit: PersonalFit | null | undefined,
  signedIn: boolean,
): boolean {
  if (signedIn) return fit != null && (ASSESS_FIRST.has(fit.next_step) || fit.next_step === 'gap_training')
  return strength(match) === 'strong'
}

function nearestOf(centers: readonly Center[]): Center | null {
  let best: Center | null = null
  for (const center of centers) {
    if (center.distanceKm === null) continue
    if (!best || center.distanceKm < (best.distanceKm ?? Infinity)) best = center
  }
  return best
}

export function candidateFor(
  match: Match,
  centers: readonly Center[],
  rangeKm: number,
  relocate: boolean,
  demand: DemandSignal | null,
  fit: boolean,
): PickCandidate {
  const listed = centers.filter((center) => offers(center, match.qualification.code))
  const nearest = nearestOf(listed)
  return {
    match,
    nearCount: relocate ? listed.length : countedCenters(listed, true, rangeKm).length,
    nearestKm: nearest?.distanceKm ?? null,
    nearestName: nearest?.name ?? null,
    demand,
    fit,
  }
}

export function checksFor(candidate: PickCandidate): Checks {
  return { near: candidate.nearCount > 0, demand: inDemand(candidate.demand), fit: candidate.fit }
}

const trueCount = (checks: Checks) => Number(checks.near) + Number(checks.demand) + Number(checks.fit)

export function choosePick(candidates: readonly PickCandidate[]): Pick | null {
  const scored = candidates
    .map((candidate) => ({ candidate, checks: checksFor(candidate) }))
    .filter(({ checks }) => trueCount(checks) >= 2)
  scored.sort(
    (a, b) =>
      trueCount(b.checks) - trueCount(a.checks) ||
      b.candidate.match.score - a.candidate.match.score ||
      (b.candidate.demand?.count ?? 0) - (a.candidate.demand?.count ?? 0) ||
      (a.candidate.nearestKm ?? Infinity) - (b.candidate.nearestKm ?? Infinity),
  )
  const top = scored[0]
  if (!top) return null
  return { ...top, tier: trueCount(top.checks) === 3 ? 'best' : 'pick' }
}

export function widenKm(km: number): number {
  return Math.min(CUSTOM_KM.max, Math.ceil(km / 10) * 10)
}

export function nearGroup(
  matches: readonly Match[],
  centers: readonly Center[],
  rangeKm: number,
  hasPlace: boolean,
  exclude: ReadonlySet<string>,
): NearGroup {
  if (!hasPlace) return { kind: 'no-place' }
  const cards: NearCard[] = []
  // A match left out because it's shown elsewhere (the pick) still means something is in range.
  let shownElsewhere = false
  for (const match of [...matches].sort((a, b) => b.score - a.score)) {
    const listed = centers.filter((center) => offers(center, match.qualification.code))
    const near = countedCenters(listed, true, rangeKm)
    if (!near.length) continue
    if (exclude.has(match.qualification.code)) {
      shownElsewhere = true
      continue
    }
    const nearest = nearestOf(near)
    cards.push({
      match,
      nearCount: near.length,
      nearestKm: nearest?.distanceKm ?? null,
      nearestMinutes: estimateMinutes(nearest?.distanceKm ?? null),
    })
  }
  if (cards.length || shownElsewhere) return { kind: 'cards', cards: cards.slice(0, GROUP_LIMIT) }
  const nearest = nearestOf(
    centers.filter((center) => matches.some((match) => offers(center, match.qualification.code))),
  )
  if (!nearest || nearest.distanceKm === null) return { kind: 'cards', cards: [] }
  return {
    kind: 'none-in-range',
    nearestKm: nearest.distanceKm,
    town: nearest.city ?? nearest.province ?? nearest.region,
    widenTo: widenKm(nearest.distanceKm),
  }
}

export function demandGroup(outlook: Outlook | undefined, reference: Point | null): DemandGroup {
  if (!outlook) return { goodNews: null, cards: [] }
  const sample = outlook.demand_is_sample ?? false
  const cards = outlook.areas
    .filter((area) => area.region_code !== outlook.home_region_code && area.posting_count >= MIN_RECORDS)
    .sort((a, b) => b.posting_count - a.posting_count)
    .slice(0, GROUP_LIMIT)
    .map((area) => ({
      regionCode: area.region_code,
      name: area.name,
      count: area.posting_count,
      sample,
      training: area.training_sites,
      assessment: area.assessment_sites,
      km: reference ? Math.round(distanceKm(reference, area)) : null,
      titles: area.titles,
      balance: area.balance,
    }))
  const signal = demandSignal(outlook)
  const goodNews =
    reference && signal && signal.rank === 1 && inDemand(signal) && outlook.home_demand
      ? { home: outlook.home_demand.name, rankedOf: signal.rankedOf }
      : null
  return { goodNews, cards }
}

export function considerGroup(
  suggestions: readonly NearbySuggestion[],
  exclude: ReadonlySet<string>,
): NearbySuggestion[] {
  return suggestions.filter((item) => !exclude.has(item.qualification.code)).slice(0, GROUP_LIMIT)
}

export function groupOrder(relocate: boolean): GroupId[] {
  return relocate ? ['demand', 'near', 'consider'] : ['near', 'demand', 'consider']
}
