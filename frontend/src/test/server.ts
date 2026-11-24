import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { emptyRecommendationAnalytics } from './recommendationAnalytics.ts'

// Tests add their own handlers with server.use(...). These answer the reference data a page reads beside its main
// request, empty, so a test about something else that passes through Training & Assessment (or Reports, as an
// administrator) needn't serve it; after each test, server.resetHandlers() goes back to them.
const referenceData = [
  http.get('*/api/v1/regions', () => HttpResponse.json([])),
  http.get('*/api/v1/client-config', () =>
    HttpResponse.json({ carto_key: '', routing_enabled: false, skills_bridge_enabled: false }),
  ),
  // Nothing else in demand nearby unless a test says so.
  http.post('*/api/v1/labor-market/suggestions', () =>
    HttpResponse.json({
      region_code: 'NCR',
      region_name: 'National Capital Region',
      suggestions: [],
      method_version: 'nearby-suggestions-v1',
      limitations: [],
    }),
  ),
  // The Career Map's "Around you" card: no postings anywhere unless a test says so.
  http.get('*/api/v1/labor-market/jobs', () =>
    HttpResponse.json({
      items: [],
      total: 0,
      posting_count: 0,
      employer_count: 0,
      limit: 3,
      offset: 0,
      region_code: null,
      locality: null,
      localities: [],
      areas: [],
      snapshot_dates: [],
      posted_between: [],
      ordering: 'posting_count',
      personalized: false,
      source_url: 'https://philjobnet.gov.ph/job-vacancies/',
      limitations: [],
    }),
  ),
  http.get('*/api/v1/labor-market/qualifications', () =>
    HttpResponse.json({
      items: [],
      total: 0,
      limit: 100,
      offset: 0,
      region_code: null,
      evaluated_at: '2026-11-24T00:00:00+08:00',
      observed_since: '2026-01-01',
      observed_through: '2026-11-24',
      ordering: 'qualification_name',
      personalized: false,
      method_version: 'area-qualifications-v1',
      limitations: [],
    }),
  ),
  http.get('*/api/v1/labor-market/elsewhere', () =>
    HttpResponse.json({
      items: [],
      exclude_province: null,
      personalized: false,
      ordering: 'posting_count',
      min_postings: 3,
      snapshot_dates: [],
      source_url: 'https://philjobnet.gov.ph/job-vacancies/',
      method_version: 'elsewhere-demand-v1',
      limitations: [],
    }),
  ),
  // No Skill Passport is linked unless a test says so.
  http.get('*/api/v1/auth/tsp/profile', () =>
    HttpResponse.json(
      { detail: "This account isn't linked to a Skill Passport." },
      { status: 404 },
    ),
  ),
  // A signed-in learner has saved no centers unless a test says so.
  http.get('*/api/v1/me/saved-centers', () => HttpResponse.json([])),
  http.get('*/api/v1/training-providers', () => HttpResponse.json([])),
  http.get('*/api/v1/assessment-centers', () => HttpResponse.json([])),
  http.get('*/api/v1/training-programs', () => HttpResponse.json([])),
  http.get('*/api/v1/assessment-schedules', () => HttpResponse.json([])),
  http.get('*/api/v1/labor-market/indicators', () =>
    HttpResponse.json({ items: [], postings: [] }),
  ),
  http.get('*/api/v1/admin/reports/overview', () =>
    HttpResponse.json({
      learners: 0,
      recommendation_sessions: 0,
      semantic_analyses: 0,
      readiness_checks: 0,
      average_readiness: null,
      training_rankings: 0,
      assessment_applications: {},
      certifications: { total: 0, verified: 0 },
    }),
  ),
  http.get('*/api/v1/admin/reports/funnel', () =>
    HttpResponse.json({
      registered: 0,
      saved_a_recommendation: 0,
      checked_readiness: 0,
      applied_for_assessment: 0,
      certified: 0,
    }),
  ),
  http.get('*/api/v1/admin/reports/qualification-demand', () => HttpResponse.json([])),
  http.get('*/api/v1/admin/reports/recommendation-analytics', () =>
    HttpResponse.json(emptyRecommendationAnalytics),
  ),
  http.get('*/api/v1/admin/reports/skill-gaps', () => HttpResponse.json([])),
  http.get('*/api/v1/admin/reports/supply', () => HttpResponse.json([])),
  http.get('*/api/v1/admin/reports/feedback', () =>
    HttpResponse.json({
      answers: 0,
      satisfied: 0,
      by_place: {
        top_match: { answers: 0, satisfied: 0 },
        other_match: { answers: 0, satisfied: 0 },
        own_choice: { answers: 0, satisfied: 0 },
      },
      reasons: { wrong_qualification: 0, readiness_off: 0, pathway_not_helpful: 0, none: 0 },
      by_model: [],
      by_qualification: [],
    }),
  ),
]

export const server = setupServer(...referenceData)
