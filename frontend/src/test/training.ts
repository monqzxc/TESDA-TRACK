import { http, HttpResponse } from 'msw'
import type { Region } from '../api/queries.ts'
import type { AssessmentSite, Program, Provider, Schedule } from '../features/training/centers.ts'
import { server } from './server.ts'

// Training & Assessment's routes, answered as the API does, for its tests.

export const REGIONS: Region[] = [
  {
    code: 'NCR',
    name: 'National Capital Region',
    center_city: 'Manila',
    latitude: 14.5995,
    longitude: 120.9842,
  },
  {
    code: 'VII',
    name: 'Central Visayas',
    center_city: 'Cebu City',
    latitude: 10.3157,
    longitude: 123.8854,
  },
]

function site(
  id: number,
  name: string,
  region: string,
  city: string,
  latitude: number | null,
  longitude: number | null,
  province: string | null = null,
): Provider {
  return {
    id,
    name,
    region_code: region,
    province,
    city,
    address: `${id} Example Street, ${city}`,
    latitude,
    longitude,
    contact_email: `center${id}@example.com`,
    contact_phone: '+63 2 0000 0000',
    website: 'https://example.com',
    is_active: true,
  }
}

const summaryOf = ({
  id,
  name,
  region_code,
  city,
  latitude,
  longitude,
}: Provider | AssessmentSite) => ({
  id,
  name,
  region_code,
  city,
  latitude,
  longitude,
})

export const manilaInstitute = site(
  1,
  'Manila Welding Institute',
  'NCR',
  'Manila',
  14.5995,
  120.9842,
)
export const cebuCenter = site(
  2,
  'Cebu Skills Center',
  'VII',
  'Cebu City',
  10.3157,
  123.8854,
  'Cebu',
)
/** A provider with no coordinates on file: listed, but never given a distance or directions (US-08). */
export const mobileUnit = site(3, 'Mobile Training Unit', 'NCR', 'Quezon City', null, null)
export const manilaAssessment = site(
  1,
  'Manila Assessment Center',
  'NCR',
  'Manila',
  14.6,
  120.98,
) as AssessmentSite

export const weldingProgram: Program = {
  verification: {
    status: 'verified',
    source_name: 'Test registry',
    source_reference: 'test-record-11',
    reviewed_at: '2020-01-01T00:00:00Z',
    review_due_at: '2101-01-01T00:00:00Z',
    is_synthetic: false,
    requirements_reviewed: true,
    requirements: [],
  },
  availability: {
    status: 'available',
    source_reference: 'test-intake-11',
    checked_at: '2020-01-01T00:00:00Z',
    valid_until: '2101-01-01T00:00:00Z',
  },
  id: 11,
  title: 'Shielded Metal Arc Welding (SMAW) NC II · Evening batch',
  description: 'Weld plates and pipes in an industry workshop.',
  qualification: {
    code: 'SMAW-NCII',
    name: 'Shielded Metal Arc Welding (SMAW) NC II',
    sector: 'Metals and Engineering',
  },
  provider: summaryOf(manilaInstitute),
  delivery_mode: 'institution_based',
  duration_hours: 268,
  cost: null,
  scholarship_available: true,
  start_date: '2099-11-02',
  end_date: '2100-01-30',
  slots: 25,
  is_active: true,
}

export const cookeryProgram: Program = {
  ...weldingProgram,
  id: 12,
  title: 'Cookery NC II',
  description: null,
  qualification: { code: 'CKY-NCII', name: 'Cookery NC II', sector: 'Tourism' },
  provider: summaryOf(cebuCenter),
  cost: '0.00',
  scholarship_available: false,
  start_date: null,
  end_date: null,
}

export const mobileProgram: Program = {
  ...cookeryProgram,
  id: 13,
  title: 'Cookery NC II · Mobile',
  provider: summaryOf(mobileUnit),
}

export const weldingAssessment: Schedule = {
  verification: weldingProgram.verification,
  availability: weldingProgram.availability,
  id: 21,
  qualification: weldingProgram.qualification,
  center: summaryOf(manilaAssessment),
  scheduled_at: '2099-12-01T01:00:00Z',
  slots: 15,
  seats_left: 4,
  fee: '750.00',
  status: 'open',
}

export interface TrainingRequest {
  method: string
  path: string
  search: string
  body: unknown
}

interface TrainingApiOptions {
  routingEnabled?: boolean
  /** The router's answer to a directions request. */
  missingModes?: ('car' | 'bike' | 'foot')[]
  /** The API's answer to an application: 201, or a refusal. */
  applyStatus?: 201 | 409
}

/** The center finder's routes, with every request recorded in `requests`. */
export function serveTrainingApi({
  routingEnabled = true,
  missingModes = [],
  applyStatus = 201,
}: TrainingApiOptions = {}) {
  const state = { requests: [] as TrainingRequest[] }
  const record = async (request: Request) => {
    const url = new URL(request.url)
    const text = request.method === 'GET' ? '' : await request.clone().text()
    state.requests.push({
      method: request.method,
      path: url.pathname,
      search: url.search,
      body: text ? (JSON.parse(text) as unknown) : undefined,
    })
  }
  const programs = [weldingProgram, cookeryProgram, mobileProgram]
  const schedules = [weldingAssessment]
  const byQualification = <T extends { qualification: { code: string } }>(
    request: Request,
    rows: T[],
  ) => {
    const code = new URL(request.url).searchParams.get('qualification_code')
    return code ? rows.filter((row) => row.qualification.code === code) : rows
  }

  server.use(
    http.get('*/api/v1/regions', () => HttpResponse.json(REGIONS)),
    http.get('*/api/v1/client-config', () =>
      HttpResponse.json({
        carto_key: '',
        routing_enabled: routingEnabled,
        skills_bridge_enabled: true,
      }),
    ),
    http.get('*/api/v1/training-providers', () =>
      HttpResponse.json([manilaInstitute, cebuCenter, mobileUnit]),
    ),
    http.get('*/api/v1/assessment-centers', () => HttpResponse.json([manilaAssessment])),
    http.get('*/api/v1/training-programs', async ({ request }) => {
      await record(request)
      return HttpResponse.json(byQualification(request, programs))
    }),
    http.get('*/api/v1/assessment-schedules', async ({ request }) => {
      await record(request)
      return HttpResponse.json(byQualification(request, schedules))
    }),
    http.post('*/api/v1/recommendations/training', async ({ request }) => {
      await record(request)
      return HttpResponse.json({
        weights: {
          semantic: 0.5,
          proximity: 0.2,
          assessment: 0.15,
          schedule: 0.1,
          preference: 0.05,
        },
        semantic_used: true,
        audit_id: 1,
        results: [
          {
            program: weldingProgram,
            score: 82,
            components: {},
            explanation: ['Close to your goal of welding.'],
          },
        ],
      })
    }),
    http.get('*/api/v1/routes', async ({ request }) => {
      await record(request)
      const road = (mode: 'car' | 'bike' | 'foot', minutes: number) => ({
        mode,
        path: [
          [14.55, 121.02],
          [14.6, 120.98],
        ],
        start: [14.55, 121.02],
        end: [14.6, 120.98],
        distance_km: 10.3,
        duration_min: minutes,
      })
      const modes = (['car', 'bike', 'foot'] as const).filter(
        (mode) => !missingModes.includes(mode),
      )
      return HttpResponse.json({
        routing_enabled: routingEnabled,
        routes: modes.map((mode) => road(mode, { car: 14, bike: 36, foot: 106 }[mode])),
        missing_modes: missingModes,
      })
    }),
    http.post('*/api/v1/me/assessment-applications', async ({ request }) => {
      await record(request)
      if (applyStatus === 409) {
        return HttpResponse.json(
          { detail: 'You have already applied for this schedule.' },
          { status: 409 },
        )
      }
      return HttpResponse.json(
        {
          id: '9f1c2a52-8b7e-4d3a-9c51-2f0e7a1b3c4d',
          schedule: weldingAssessment,
          status: 'pending',
          result: null,
          reviewer_note: null,
          created_at: '2026-10-15T01:00:00Z',
          updated_at: '2026-10-15T01:00:00Z',
        },
        { status: 201 },
      )
    }),
  )
  return state
}
