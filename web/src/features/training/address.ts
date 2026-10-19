import type { components } from '../../api/schema.d.ts'
import { paths } from '../../paths.ts'

// Training & Assessment's address: its filters are in the query, so a search can be shared and Back returns to it
// (the plan's "Pages and addresses"). A learner's location never is, nor a place they typed: those stay in the page.
// Other pages open it already filtered, as the finder does after a readiness check (frontend/app.py open_training).

export type CenterKind = 'training' | 'assessment'
export type DeliveryMode = Exclude<
  components['schemas']['TrainingProgramPublic']['delivery_mode'],
  'unknown'
>
export type SortOrder = 'nearest' | 'soonest' | 'name'

export const KINDS: readonly CenterKind[] = ['training', 'assessment']
export const DELIVERY_MODES: readonly DeliveryMode[] = [
  'institution_based',
  'enterprise_based',
  'community_based',
  'online',
]
export const WINDOWS = [30, 90] as const
export type Window = (typeof WINDOWS)[number]
export const SORTS: readonly SortOrder[] = ['nearest', 'soonest', 'name']

/** The query parameter for each filter. */
export const TRAINING_PARAMS = {
  kind: 'type',
  region: 'region',
  province: 'province',
  qualification: 'qualification',
  mode: 'mode',
  within: 'within',
  scholarship: 'scholarship',
  search: 'q',
  sort: 'sort',
  center: 'center',
} as const

export interface TrainingFilters {
  /** Training centers, assessment centers, or both (empty). */
  kinds: CenterKind[]
  region: string | null
  province: string | null
  /** Qualification codes. */
  qualifications: string[]
  mode: DeliveryMode | null
  within: Window | null
  scholarship: boolean
  /** Words in the search box. */
  search: string
  sort: SortOrder
  /** The center shown in full, e.g. "training-12". */
  center: string | null
}

export const NO_FILTERS: TrainingFilters = {
  kinds: [],
  region: null,
  province: null,
  qualifications: [],
  mode: null,
  within: null,
  scholarship: false,
  search: '',
  sort: 'nearest',
  center: null,
}

const oneOf = <T extends string | number>(options: readonly T[], value: unknown): T | null =>
  options.find((option) => String(option) === value) ?? null

/** The filters in an address. Anything unknown reads as "any". */
export function readTrainingAddress(query: URLSearchParams): TrainingFilters {
  const p = TRAINING_PARAMS
  const unique = (values: string[]) => [...new Set(values.filter(Boolean))]
  return {
    kinds: unique(query.getAll(p.kind)).filter((kind): kind is CenterKind =>
      KINDS.includes(kind as CenterKind),
    ),
    region: query.get(p.region) || null,
    province: query.get(p.province) || null,
    qualifications: unique(query.getAll(p.qualification)),
    mode: oneOf(DELIVERY_MODES, query.get(p.mode)),
    within: oneOf(WINDOWS, query.get(p.within)),
    scholarship: query.get(p.scholarship) === '1',
    search: query.get(p.search) ?? '',
    sort: oneOf(SORTS, query.get(p.sort)) ?? 'nearest',
    center: query.get(p.center) || null,
  }
}

/** The query for some filters; ones left at "any" aren't written. */
export function writeTrainingAddress(filters: Partial<TrainingFilters>): URLSearchParams {
  const p = TRAINING_PARAMS
  const query = new URLSearchParams()
  // Both kinds is the same as neither.
  if (filters.kinds && filters.kinds.length === 1) query.append(p.kind, filters.kinds[0])
  if (filters.region) query.set(p.region, filters.region)
  if (filters.province) query.set(p.province, filters.province)
  for (const code of filters.qualifications ?? []) query.append(p.qualification, code)
  if (filters.mode) query.set(p.mode, filters.mode)
  if (filters.within) query.set(p.within, String(filters.within))
  if (filters.scholarship) query.set(p.scholarship, '1')
  if (filters.search?.trim()) query.set(p.search, filters.search.trim())
  if (filters.sort && filters.sort !== 'nearest') query.set(p.sort, filters.sort)
  if (filters.center) query.set(p.center, filters.center)
  return query
}

export interface TrainingLink {
  kinds?: readonly CenterKind[]
  qualifications?: readonly string[]
  /** Words in the search box, where the learner can see and change them. */
  search?: string
}

/** Training & Assessment, showing the centers that fit. */
export function trainingAddress({ kinds = [], qualifications = [], search }: TrainingLink): string {
  const query = writeTrainingAddress({
    kinds: [...kinds],
    qualifications: [...qualifications],
    search,
  }).toString()
  return query ? `${paths.training}?${query}` : paths.training
}

const LEVEL = /\s*(\([^)]*\)|\bNC\s+[IV]+\b)/gi

/**
 * A qualification without its level or abbreviation, for one-line summaries and the search box
 * ("Shielded Metal Arc Welding (SMAW) NC II" is "Shielded Metal Arc Welding").
 */
export function shortName(name: string): string {
  return name.replace(LEVEL, '').trim() || name
}
