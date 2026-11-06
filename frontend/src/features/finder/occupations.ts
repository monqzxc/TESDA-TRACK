import type { Qualification } from '../../api/queries.ts'
import type { DemandPreference } from './demandIntent.ts'

interface ApprovedOccupation {
  occupation_title: string
  occupation_key: string
  classification: 'in_demand' | 'hard_to_fill' | 'observed_posting'
}

/** Ordinary discovery retains catalog jobs; explicit demand requests use approved evidence only. */
export function finalOccupations(
  qualification: Qualification,
  catalog: readonly Qualification[],
  evidence: readonly ApprovedOccupation[],
  preference: DemandPreference | null,
): Occupation[] {
  const available = catalog.some((item) => item.code === qualification.code)
    ? catalog
    : [qualification, ...catalog]
  const inDemand = new Set(
    evidence
      .filter((item) => item.classification === 'in_demand')
      .map((item) => jobKey(item.occupation_title)),
  )
  const excluded = new Set(
    evidence
      .filter(
        (item) =>
          item.classification === 'hard_to_fill' && !inDemand.has(jobKey(item.occupation_title)),
      )
      .map((item) => jobKey(item.occupation_title)),
  )
  const approved = evidence.filter(
    (item) =>
      item.classification !== 'hard_to_fill' &&
      !excluded.has(jobKey(item.occupation_title)) &&
      (!preference ||
        ((preference === 'in_demand' || preference === 'either') &&
          item.classification === 'in_demand')),
  )
  const found = preference
    ? []
    : relatedOccupations([qualification.code], [], jobIndex(available), available)
  for (const item of approved) {
    const key = jobKey(item.occupation_title)
    if (!found.some((job) => job.key === key))
      found.push({ key, title: item.occupation_title, qualifications: [qualification] })
  }
  const supported = new Set(approved.map((item) => jobKey(item.occupation_title)))
  return found
    .filter((job) => !excluded.has(job.key))
    .sort((a, b) => Number(supported.has(b.key)) - Number(supported.has(a.key)))
}

// Related occupations for a skill or job search (US-20): the jobs that the matched qualifications lead to, as the
// catalog lists them (possible_jobs, from TESDA's Training Regulations), and for each job every qualification that
// lists it. Nothing is made up: a title is shown as the catalog spells it.

/** Up to this many occupations, from the matches' jobs. */
export const OCCUPATION_LIMIT = 12
/** The core skills shown for each qualification under an occupation. */
export const SKILL_LIMIT = 4

export interface Occupation {
  /** The job title as the catalog first spells it. */
  title: string
  /** The title compared case- and space-insensitively, so "Welder" and "welder " are one occupation. */
  key: string
  /** Every qualification that lists the job: the matches first, in their order, then the rest by name. */
  qualifications: Qualification[]
}

export const jobKey = (title: string) => title.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en')

/** Every job in the catalog, with the qualifications that list it. */
export function jobIndex(
  catalog: readonly Qualification[],
): Map<string, { title: string; qualifications: Qualification[] }> {
  const index = new Map<string, { title: string; qualifications: Qualification[] }>()
  for (const qualification of catalog) {
    for (const job of qualification.possible_jobs) {
      const key = jobKey(job)
      if (!key) continue
      const entry = index.get(key) ?? { title: job.trim(), qualifications: [] }
      if (!entry.qualifications.includes(qualification)) entry.qualifications.push(qualification)
      index.set(key, entry)
    }
  }
  return index
}

const words = (text: string) =>
  jobKey(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)

/** Whether a job title contains all the words of one of the learner's terms ("welder" in "Structural Welder"). */
function namesTerm(title: string, terms: readonly string[]): boolean {
  const titleWords = new Set(words(title))
  return terms.some((term) => {
    const termWords = words(term)
    return termWords.length > 0 && termWords.every((word) => titleWords.has(word))
  })
}

/**
 * The occupations for a skills search's matches, by the qualifications' codes in match order. A job named by the
 * learner's terms comes first; otherwise the jobs keep the order of the matches that list them.
 */
export function relatedOccupations(
  matchedCodes: readonly string[],
  terms: readonly string[],
  index: ReturnType<typeof jobIndex>,
  catalog: readonly Qualification[],
): Occupation[] {
  const byCode = new Map(catalog.map((qualification) => [qualification.code, qualification]))
  const rank = (qualification: Qualification) => {
    const place = matchedCodes.indexOf(qualification.code)
    return place === -1 ? matchedCodes.length : place
  }
  const found: Occupation[] = []
  const seen = new Set<string>()
  for (const code of matchedCodes) {
    for (const job of byCode.get(code)?.possible_jobs ?? []) {
      const key = jobKey(job)
      const entry = index.get(key)
      if (!entry || seen.has(key)) continue
      seen.add(key)
      const qualifications = [...entry.qualifications].sort(
        (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name),
      )
      found.push({ title: entry.title, key, qualifications })
    }
  }
  const named = found.filter((occupation) => namesTerm(occupation.title, terms))
  const rest = found.filter((occupation) => !named.includes(occupation))
  return [...named, ...rest].slice(0, OCCUPATION_LIMIT)
}

/** A qualification's core competencies, in their order: the skills an occupation's qualification teaches. */
export function coreSkills(qualification: Qualification, limit = SKILL_LIMIT): string[] {
  return qualification.competencies
    .filter((competency) => competency.category.toLowerCase() === 'core')
    .sort((a, b) => a.position - b.position)
    .slice(0, limit)
    .map((competency) => competency.name)
}
