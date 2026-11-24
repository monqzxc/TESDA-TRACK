import type { Qualification } from '../../api/queries.ts'
import type { AreaQualification, AroundArea } from './demandApi.ts'
import { sameProvince } from './explore.ts'

// What the "Around you" card shows, from who is looking and where they are (markdowns/explore-map-first-visit-updates.md,
// section 3, "When it shows"). Kept apart from the card so each row of that table can be checked on its own.

export interface AroundYouInput {
  /** The signed-in learner's id; null for a guest. */
  learnerId: string | null
  /** The shared location's region, and the province of its nearest center, while sharing is on. */
  live: { regionCode: string; regionName: string; province: string | null } | null
  /** The province the Skill Passport gives as home. */
  homeProvince: string | null
  /** A guest's searched qualifications, best match first. */
  searchCodes: readonly string[]
}

/** One area's top jobs and qualifications. */
export interface AreaBlock {
  kind: 'near' | 'province' | 'top'
  area: AroundArea
  /** The region's or province's name, or null for every recorded region (a guest without a location). */
  place: string | null
  /** A province's records are postings only: it never shows a region's forecast. */
  postingsOnly: boolean
  /** Ranked by the Skill Passport: the learner's id, else null. */
  personalFor: string | null
}

export interface AroundYouPlan {
  blocks: AreaBlock[]
  /** "Your skills are in demand in…": the province to leave out, and a guest's searched codes. */
  elsewhere: { exclude: string | null; codes: string[]; personalFor: string | null } | null
  /** A guest without a search is told how to see where else they are in demand. */
  hint: boolean
  /** The collapsed pill names the province, else the region; null is "Top in demand · Philippines". */
  pillPlace: string | null
}

const MAX_CODES = 5

/** Null when there is no card: a signed-in learner with neither a shared location nor a home address. */
export function planAroundYou({
  learnerId,
  live,
  homeProvince,
  searchCodes,
}: AroundYouInput): AroundYouPlan | null {
  if (!learnerId) {
    // A guest always gets a card: the top lists for the location's region, or for the whole country.
    const codes = searchCodes.slice(0, MAX_CODES)
    return {
      blocks: [
        {
          kind: 'top',
          area: { region: live?.regionCode ?? null, province: null },
          place: live?.regionName ?? null,
          postingsOnly: false,
          personalFor: null,
        },
      ],
      elsewhere: codes.length
        ? { exclude: live?.province ?? null, codes, personalFor: null }
        : null,
      hint: codes.length === 0,
      pillPlace: live?.regionName ?? null,
    }
  }
  if (!live && !homeProvince) return null
  const blocks: AreaBlock[] = []
  // A location inside the home province would repeat it: the province block alone, titled "Near you".
  const liveAtHome = Boolean(live && homeProvince && sameProvince(live.province, homeProvince))
  if (live && !liveAtHome) {
    blocks.push({
      kind: 'near',
      area: { region: live.regionCode, province: null },
      place: live.regionName,
      postingsOnly: false,
      personalFor: learnerId,
    })
  }
  if (homeProvince) {
    blocks.push({
      kind: liveAtHome ? 'near' : 'province',
      area: { region: null, province: homeProvince },
      place: homeProvince,
      postingsOnly: true,
      personalFor: learnerId,
    })
  }
  return {
    blocks,
    elsewhere: {
      exclude: homeProvince ?? live?.province ?? null,
      // Ignored by the server once it ranks by the Skill Passport; an account without one is ranked by its search.
      codes: searchCodes.slice(0, MAX_CODES),
      personalFor: learnerId,
    },
    hint: false,
    pillPlace: homeProvince ?? live?.regionName ?? null,
  }
}

/**
 * The area's qualifications, most posting records first. A personalized or province answer is already ranked by
 * the server; a region's comes in name order, so it is ranked here (name order breaks ties).
 */
export function rankQualifications(
  items: readonly AreaQualification[],
  ordering: string,
): AreaQualification[] {
  if (ordering !== 'qualification_name') return [...items]
  return [...items].sort(
    (a, b) => (b.observed_posting_count ?? 0) - (a.observed_posting_count ?? 0),
  )
}

/**
 * The skills most asked for in an area: the core competencies that recur across the qualifications linked to its
 * postings, each weighted by that qualification's posting records. Basic and common competencies (workplace
 * communication, teamwork and the like) are in nearly every qualification, so they would always win: they count
 * only where a qualification lists no core ones.
 */
export function topSkills(
  items: readonly AreaQualification[],
  catalog: readonly Qualification[],
  count = 3,
): string[] {
  const byCode = new Map(catalog.map((qualification) => [qualification.code, qualification]))
  const weights = new Map<string, { name: string; weight: number; first: number }>()
  let order = 0
  for (const item of items) {
    const postings = item.observed_posting_count ?? 0
    const qualification = byCode.get(item.qualification_code)
    if (!postings || !qualification) continue
    const core = qualification.competencies.filter(
      (competency) => competency.category.toLowerCase() === 'core',
    )
    const counted = core.length ? core : qualification.competencies
    for (const name of new Set(counted.map((competency) => competency.name.trim()))) {
      if (!name) continue
      const key = name.toLowerCase()
      const entry = weights.get(key) ?? { name, weight: 0, first: order++ }
      entry.weight += postings
      weights.set(key, entry)
    }
  }
  return [...weights.values()]
    .sort((a, b) => b.weight - a.weight || a.first - b.first)
    .slice(0, count)
    .map((entry) => entry.name)
}

/** The latest of the snapshot dates, as "Nov 4, 2026"; null without one. */
export function latestDate(dates: readonly string[]): string | null {
  const latest = [...dates].sort().at(-1)
  if (!latest) return null
  const parsed = new Date(`${latest}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return latest
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(parsed)
}

/** A region's short name for a title: "Region IV-A (CALABARZON)" is "CALABARZON", the capital region "NCR". */
export function shortRegion(region: { code: string; name: string }): string {
  if (region.code === 'NCR') return 'NCR'
  return /\(([^)]+)\)/.exec(region.name)?.[1]?.trim() || region.name
}

// The card's detail dialogs (AroundYouDetail.tsx): what a skill, a qualification or a job links to, read from the
// qualification catalog and the centers the page has loaded. No new request: the catalog lists each qualification's
// competencies and possible jobs, and each center its programs.

/** Lower case, letters and digits only, single spaces: "SERVICE CREW (FAST FOOD)" and "Service crew" compare. */
export function plainTitle(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Whether a posting title is one of a qualification's possible jobs: the same words, or one holding the other as
 * whole words ("Service Crew" and "Fast Food Service Crew"). A single short word is too loose to hold another.
 */
export function sameJob(posting: string, possible: string): boolean {
  const a = plainTitle(posting)
  const b = plainTitle(possible)
  if (!a || !b) return false
  if (a === b) return true
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  if (short.length < 4) return false
  return ` ${long} `.includes(` ${short} `)
}

/** The catalog's qualifications that list the skill among their competencies, core ones first. */
export function qualificationsTeaching(
  skill: string,
  catalog: readonly Qualification[],
): Qualification[] {
  const key = skill.trim().toLowerCase()
  const listing = (qualification: Qualification) =>
    qualification.competencies.find((competency) => competency.name.trim().toLowerCase() === key)
  return catalog
    .map((qualification) => ({ qualification, competency: listing(qualification) }))
    .filter((entry) => entry.competency)
    .sort(
      (a, b) =>
        Number(b.competency!.category.toLowerCase() === 'core') -
        Number(a.competency!.category.toLowerCase() === 'core'),
    )
    .map((entry) => entry.qualification)
}

/**
 * The qualifications that lead to a job: the one the server linked the title to (personalized answers), then those
 * whose possible jobs name it.
 */
export function qualificationsForJob(
  title: string,
  catalog: readonly Qualification[],
  linked: string | null = null,
): Qualification[] {
  const found = new Map<string, Qualification>()
  if (linked) {
    const key = linked.trim().toLowerCase()
    const match = catalog.find((qualification) => qualification.name.trim().toLowerCase() === key)
    if (match) found.set(match.code, match)
  }
  for (const qualification of catalog) {
    if (qualification.possible_jobs.some((job) => sameJob(title, job)))
      found.set(qualification.code, qualification)
  }
  return [...found.values()]
}

/** A qualification's core competencies, or all of them where it lists no core ones. */
export function coreSkills(qualification: Qualification): string[] {
  const core = qualification.competencies.filter(
    (competency) => competency.category.toLowerCase() === 'core',
  )
  return (core.length ? core : qualification.competencies)
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((competency) => competency.name.trim())
    .filter(Boolean)
}
