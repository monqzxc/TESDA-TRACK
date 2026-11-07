import { api } from '../../api/client.ts'
import { unwrap } from '../../api/errors.ts'

export interface MarketIndicator {
  mapping_id: number
  occurrence_key: string
  occupation_key: string
  occupation_title: string
  sector: string | null
  relationship_scope: string | null
  scope_cautions: string | null
  qualification_code: string
  qualification_name: string
  classification: 'in_demand' | 'hard_to_fill' | 'observed_posting'
  geographic_scope: 'national' | 'regional' | 'local'
  region_code: string | null
  coverage_label: string
  period_label: string
  publisher: string
  source_title: string
  source_url: string
  source_reference: string
  dataset_key: string
  observed_on?: string | null
  posted_on?: string | null
}
export interface MappingReview {
  id: number
  mapping_key: string
  proposal: 'high_confidence' | 'needs_review' | 'rejected'
  decision: 'pending' | 'approved' | 'rejected'
  occupation_title: string
  occurrence_key: string
  original_record_id: string
  sector: string | null
  classification: string
  coverage: string
  region_code: string | null
  period_label: string
  evidence_class: string
  source_url: string
  source_title: string
  source_reference: string
  qualification_code: string
  qualification_name: string
  review_reason: string
  competencies: string[]
  evidence_tier: string
  training_regulation_url: string
  training_regulation_reference: string
  cautions: string | null
  dataset_id: number
  dataset_key: string
  dataset_status: string
  decision_note: string | null
  history: {
    id: number
    actor_id: string | null
    at: string
    previous: string
    decision: string
    note: string
  }[]
}
export interface ReviewFilters {
  status?: MappingReview['decision']
  confidence?: MappingReview['proposal']
  classification?: 'in_demand' | 'hard_to_fill' | 'observed_posting' | 'cross_cutting'
  search: string
  offset: number
}
export interface MarketDataset {
  id: number
  key: string
  title: string
  status: 'active' | 'retired'
  evidence_class: string
  period_label: string
  geographic_scope: string
  region_code: string | null
  record_count: number
  validation: { mappings?: number; metadata?: Record<string, unknown> }
}
export async function marketIndicators(code: string, region: string | null, signal?: AbortSignal) {
  return (await unwrap(
    api.GET('/api/v1/labor-market/indicators', {
      params: { query: { qualification_code: code, ...(region ? { region_code: region } : {}) } },
      signal,
    }),
  )) as unknown as { items: MarketIndicator[]; postings?: MarketIndicator[] }
}
export async function mappingReviews(filters: ReviewFilters, signal?: AbortSignal) {
  return (await unwrap(
    api.GET('/api/v1/admin/labor-market/mappings', {
      params: { query: { ...filters, limit: 20 } },
      signal,
    }),
  )) as unknown as { items: MappingReview[]; total: number }
}
export async function reviewMapping(
  mapping: MappingReview,
  decision: MappingReview['decision'],
  note: string,
) {
  return unwrap(
    api.POST('/api/v1/admin/labor-market/mappings/{mapping_id}/review', {
      params: { path: { mapping_id: mapping.id } },
      body: { decision, expected_decision: mapping.decision, note },
    }),
  )
}
export async function marketDatasets(signal?: AbortSignal) {
  return (await unwrap(
    api.GET('/api/v1/admin/labor-market/datasets', { signal }),
  )) as unknown as MarketDataset[]
}
export async function setMarketDatasetStatus(
  id: number,
  status: 'active' | 'retired',
  note: string,
) {
  return unwrap(
    api.POST('/api/v1/admin/labor-market/datasets/{dataset_id}/status', {
      params: { path: { dataset_id: id } },
      body: { status, note },
    }),
  )
}
export function saveCareerSelection(journeyKey: string, title: string, qualificationCode: string) {
  return unwrap(
    api.PUT('/api/v1/me/goals/career-selection/{journey_key}', {
      params: { path: { journey_key: journeyKey } },
      body: { title, target_qualification_code: qualificationCode },
    }),
  )
}
