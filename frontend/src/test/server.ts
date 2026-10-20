import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

// Tests add their own handlers with server.use(...). These answer the reference data a page reads beside its main
// request, empty, so a test about something else that passes through Training & Assessment (or Reports, as an
// administrator) needn't serve it; after each test, server.resetHandlers() goes back to them.
const referenceData = [
  http.get('*/api/v1/regions', () => HttpResponse.json([])),
  http.get('*/api/v1/client-config', () =>
    HttpResponse.json({ carto_key: '', routing_enabled: false, skills_bridge_enabled: false }),
  ),
  http.get('*/api/v1/training-providers', () => HttpResponse.json([])),
  http.get('*/api/v1/assessment-centers', () => HttpResponse.json([])),
  http.get('*/api/v1/training-programs', () => HttpResponse.json([])),
  http.get('*/api/v1/assessment-schedules', () => HttpResponse.json([])),
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
