import type { Center } from '../training/centers.ts'
import { NEAR_KM, offers } from './explore.ts'
import type { Outlook } from './outlookApi.ts'

// Which centers the page recommends for the qualification in focus, worked out in the browser: the learner's
// location never leaves it. Nearest first, as everywhere on this page; a learner open to relocating also sees a
// center in each region where recorded demand is strongest against supply.

/** Why a center is recommended. */
export type Reason =
  /** Within NEAR_KM of the learner. */
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
 * The nearest training center and the nearest assessment center among `supply` (measured from the learner's
 * location or typed place; none without one), then, for a learner open to relocating, a center in each of the
 * outlook's alternative regions: a training center where there is one.
 */
export function recommend({
  supply,
  homeRegion,
  relocate,
  alternatives,
}: {
  supply: readonly Center[]
  homeRegion: string | null
  relocate: boolean
  alternatives: readonly string[]
}): Recommendations {
  const measured = supply.filter((center) => center.distanceKm !== null).sort(byDistance)
  const nearest = (kind: Center['kind']): Recommendation | null => {
    const center = measured.find((candidate) => candidate.kind === kind)
    if (!center) return null
    const reason: Reason =
      (center.distanceKm as number) <= NEAR_KM
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
      const there = supply
        .filter((center) => center.regionCode === region && !taken.has(center.id))
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
