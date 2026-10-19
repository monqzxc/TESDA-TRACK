import type { Qualification } from '../api/queries.ts'
import type { IconName } from '../components/Icon.tsx'
import { en } from '../copy/en.ts'

// Facts about a qualification drawn from its catalog record, as the Streamlit app shows them (frontend/app.py:
// qualification_tags, qualification_blurb, competency_parts; frontend/portal/journey.py: filter_qualifications).

export type Competency = Qualification['competencies'][number]

const NC_LEVEL = /\bNC\s+(IV|III|II|I)\b/
export const NC_LEVELS = ['I', 'II', 'III', 'IV'] as const
export type NcLevel = (typeof NC_LEVELS)[number]

/** The NC level in a qualification's name ("Cookery NC II" is II), or null when it has none. */
export function ncLevel(name: string): NcLevel | null {
  const match = NC_LEVEL.exec(name)
  return match ? (match[1] as NcLevel) : null
}

/** The order competencies are rated in: Basic, then Common, then Core. Any other category comes after. */
export const CATEGORY_ORDER = ['Basic', 'Common', 'Core'] as const

export interface CompetencyGroup {
  category: string
  competencies: Competency[]
}

/** Competencies grouped Basic, Common, Core, then any other category (by name), each in position order. */
export function competencyGroups(competencies: readonly Competency[]): CompetencyGroup[] {
  const groups = new Map<string, Competency[]>()
  for (const competency of [...competencies].sort((a, b) => a.position - b.position)) {
    const group = groups.get(competency.category)
    if (group) group.push(competency)
    else groups.set(competency.category, [competency])
  }
  const known: string[] = CATEGORY_ORDER.filter((category) => groups.has(category))
  const others = [...groups.keys()].filter((category) => !known.includes(category)).sort()
  return [...known, ...others].map((category) => ({
    category,
    competencies: groups.get(category) ?? [],
  }))
}

export interface QualificationTag {
  text: string
  /** A ticked tag (the NC level) is drawn green, like a verified mark. */
  icon?: Extract<IconName, 'check' | 'route'>
}

/** The names in the catalog, folded for comparison, for qualificationTags' next level up. */
export function catalogNames(qualifications: readonly Qualification[]): ReadonlySet<string> {
  return new Set(qualifications.map((qualification) => fold(qualification.name)))
}

/**
 * Chips for a card: the NC level, the number of competencies and careers, and the next NC level up when the
 * catalog has one ("Cookery NC II" leads to "Cookery NC III").
 */
export function qualificationTags(
  qualification: Qualification,
  names: ReadonlySet<string>,
): QualificationTag[] {
  const copy = en.qualification.tags
  const tags: QualificationTag[] = []
  const match = NC_LEVEL.exec(qualification.name)
  const level = match ? (match[1] as NcLevel) : null
  if (level) tags.push({ icon: 'check', text: copy.level(level) })
  const competencies = qualification.competencies.length
  if (competencies) tags.push({ text: copy.competencies(competencies) })
  const careers = qualification.possible_jobs.length
  if (careers) tags.push({ text: copy.careers(careers) })
  if (match && level) {
    const base = qualification.name.slice(0, match.index)
    const higher = NC_LEVELS.slice(NC_LEVELS.indexOf(level) + 1).find((numeral) =>
      names.has(fold(`${base}NC ${numeral}`)),
    )
    if (higher) tags.push({ icon: 'route', text: copy.higher(higher) })
  }
  return tags
}

/** A sentence or two about a qualification: the jobs it leads to and what it covers. */
export function qualificationBlurb(qualification: Qualification): string {
  const copy = en.qualification.blurb
  const jobs = qualification.possible_jobs.slice(0, 3)
  const competencies = qualification.competencies.length
  const core = qualification.competencies.filter(
    (competency) => competency.category === 'Core',
  ).length
  const sentences: string[] = []
  if (jobs.length) sentences.push(copy.jobs(jobs))
  if (competencies) sentences.push(copy.covers(competencies, core))
  return sentences.join(' ')
}

/** Every sector in the catalog, in alphabetical order. */
export function sectorsOf(qualifications: readonly Qualification[]): string[] {
  return [...new Set(qualifications.map((qualification) => qualification.sector))].sort((a, b) =>
    a.localeCompare(b),
  )
}

export interface CatalogFilter {
  /** Words to look for in the name, code, sector or jobs. Blank matches everything. */
  query?: string
  /** One sector, or undefined for all. */
  sector?: string
}

/** The qualifications that match a search, in catalog order. */
export function filterQualifications(
  qualifications: readonly Qualification[],
  { query = '', sector }: CatalogFilter,
): Qualification[] {
  const needle = fold(query.trim())
  return qualifications.filter(
    (qualification) =>
      (sector === undefined || qualification.sector === sector) &&
      fold(
        [
          qualification.name,
          qualification.code,
          qualification.sector,
          ...qualification.possible_jobs,
        ].join(' '),
      ).includes(needle),
  )
}

/** Text folded for comparison, like Python's casefold for the catalog's Latin text. */
function fold(text: string): string {
  return text.toLocaleLowerCase('en-US')
}
