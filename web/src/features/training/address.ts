import { paths } from '../../paths.ts'

// Training & Assessment's address: its filters are in the query, so a search can be shared (the plan's "Pages and
// addresses"). A learner's location never is. Other pages open it already filtered, as the finder does after a
// readiness check (frontend/app.py open_training).

export type CenterKind = 'training' | 'assessment'

export interface TrainingLink {
  /** Training centers, assessment centers, or both (none given). */
  kinds?: readonly CenterKind[]
  /** Qualification codes. */
  qualifications?: readonly string[]
  /** Words in the search box, where the learner can see and change them. */
  search?: string
}

/** The query parameters for each filter. */
export const TRAINING_PARAMS = {
  kind: 'type',
  qualification: 'qualification',
  search: 'q',
} as const

/** Training & Assessment, showing the centers that fit. */
export function trainingAddress({ kinds = [], qualifications = [], search }: TrainingLink): string {
  const query = new URLSearchParams()
  for (const kind of kinds) query.append(TRAINING_PARAMS.kind, kind)
  for (const code of qualifications) query.append(TRAINING_PARAMS.qualification, code)
  if (search?.trim()) query.set(TRAINING_PARAMS.search, search.trim())
  const text = query.toString()
  return text ? `${paths.training}?${text}` : paths.training
}

const LEVEL = /\s*(\([^)]*\)|\bNC\s+[IV]+\b)/gi

/**
 * A qualification without its level or abbreviation, for one-line summaries and the search box
 * ("Shielded Metal Arc Welding (SMAW) NC II" is "Shielded Metal Arc Welding").
 */
export function shortName(name: string): string {
  return name.replace(LEVEL, '').trim() || name
}
