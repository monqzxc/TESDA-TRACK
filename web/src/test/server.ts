import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

// Tests add their own handlers with server.use(...). These answer the reference data a page reads beside its main
// request, empty, so a test about something else that passes through Training & Assessment needn't serve it; after
// each test, server.resetHandlers() goes back to them.
const referenceData = [
  http.get('*/api/v1/regions', () => HttpResponse.json([])),
  http.get('*/api/v1/client-config', () =>
    HttpResponse.json({ carto_key: '', routing_enabled: false, skills_bridge_enabled: false }),
  ),
  http.get('*/api/v1/training-providers', () => HttpResponse.json([])),
  http.get('*/api/v1/assessment-centers', () => HttpResponse.json([])),
  http.get('*/api/v1/training-programs', () => HttpResponse.json([])),
  http.get('*/api/v1/assessment-schedules', () => HttpResponse.json([])),
]

export const server = setupServer(...referenceData)
