import type { Match } from '../finder/api.ts'
import type { Center } from '../training/centers.ts'
import type { QualificationFit } from '../tsp/passport.ts'
import { hasScholarship, offers } from './explore.ts'

/** What a matched qualification involves near the learner, and how their Skill Passport fits it. */
export interface QualificationFacts {
  code: string
  name: string
  /** The Skill Passport's fit; null when nothing on it points here; undefined when not known (loading, or no passport). */
  fit: QualificationFit | null | undefined
  /** CORE units the learner's certificates show, of all the qualification's CORE units. */
  coreHave: number | null
  coreTotal: number | null
  /** Training hours the programs list; null when none lists them. */
  hours: { min: number; max: number } | null
  /** Whether a program offers an open scholarship; null when no program is listed. */
  scholarship: boolean | null
  /** Centers within range; null without a reference point to measure from. */
  trainNear: number | null
  assessNear: number | null
  jobs: string[]
}

const MAX_JOBS = 3

/**
 * The facts behind each qualification's short explanation. With a reference point, programs are read from the centers within range; without one,
 * from every center listing the qualification.
 */
export function qualificationFacts({
  matches,
  centers,
  rangeKm,
  hasReference,
  fits,
  catalog,
}: {
  matches: readonly Match[]
  centers: readonly Center[]
  rangeKm: number
  hasReference: boolean
  fits: ReadonlyMap<string, QualificationFit | null>
  catalog: readonly { code: string; possible_jobs?: readonly string[] }[]
}): QualificationFacts[] {
  const near = (center: Center) =>
    !hasReference || (center.distanceKm !== null && center.distanceKm <= rangeKm)
  return matches.map(({ qualification: { code, name } }) => {
    const listing = centers.filter((center) => offers(center, code) && near(center))
    const training = listing.filter((center) => center.kind === 'training')
    const hours = training
      .flatMap((center) => center.programs)
      .filter((program) => program.qualification.code === code)
      .map((program) => program.duration_hours)
      .filter((value): value is number => typeof value === 'number')
    const fit = fits.has(code) ? fits.get(code) : undefined
    const coverage = fit?.coverage
    return {
      code,
      name,
      fit,
      coreHave: coverage ? coverage.covered.length : null,
      coreTotal: coverage ? coverage.covered.length + coverage.missing.length : null,
      hours: hours.length ? { min: Math.min(...hours), max: Math.max(...hours) } : null,
      scholarship: training.length ? training.some((center) => hasScholarship(center, code)) : null,
      trainNear: hasReference ? training.length : null,
      assessNear: hasReference ? listing.length - training.length : null,
      jobs: (catalog.find((item) => item.code === code)?.possible_jobs ?? []).slice(0, MAX_JOBS),
    }
  })
}
