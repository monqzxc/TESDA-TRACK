import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../../test/server.ts'
import { QualificationEvidence } from './QualificationEvidence.tsx'
import type { EvidenceMeasure, QualificationEvidenceResponse } from './evidenceApi.ts'

function measure(name: string, overrides: Partial<EvidenceMeasure> = {}): EvidenceMeasure {
  return {
    name,
    value: 0,
    unit: 'records',
    evidence_kind: 'observed',
    geography: { scope: 'regional', region_code: 'IV-A', label: 'CALABARZON' },
    reference_period: null,
    observed_on: '2026-11-10',
    sources: ['Registry workbook · sheet 1'],
    method_version: 'test-v1',
    known_record_count: 0,
    eligible_record_count: 0,
    unknown_count: 0,
    coverage: null,
    statement: 'No records in this extent.',
    limitations: [],
    ...overrides,
  }
}

function evidence(): QualificationEvidenceResponse {
  return {
    context: {
      qualification_code: 'CSS-NC-II',
      region_code: 'IV-A',
      evaluated_at: '2026-11-10T10:00:00+08:00',
      method_versions: {},
    },
    observed_postings: {
      postings: measure('postings', {
        value: 11,
        unit: 'posting records',
        known_record_count: 11,
        eligible_record_count: 11,
        unknown_count: 0,
        coverage: 1,
        statement: '11 retained posting records from a dated snapshot.',
        sources: ['https://philjobnet.gov.ph/job-vacancies/'],
      }),
      employers: measure('employers', {
        value: 2,
        unit: 'employers',
        statement: '2 distinct employers.',
      }),
      by_qualification: { 'CSS-NC-II': 11 },
      overlap_count: 0,
      repeated_captures: 0,
      suspected_duplicate_groups: 0,
      unallocated_count: 0,
      snapshot_dates: ['2026-11-04'],
      posted_between: ['2026-10-05', '2026-11-04'],
      dataset_keys: ['postings@1'],
      fingerprint: 'test',
    },
    forecast_support: [
      {
        occupation_title: 'Computer technician',
        classification: 'in_demand',
        evidence_kind: 'forecast',
        value: null,
        geography: { scope: 'national', label: 'Philippines — National' },
        geography_match: 'broader_scope',
        period_label: '2025–2026',
        publisher: 'DOLE-BLE',
        source_title: 'National forecast',
        source_url: 'https://example.com/forecast',
        source_reference: 'Table 2, page 5',
        dataset_key: 'forecast@1',
        mapping_id: 5,
      },
    ],
    supply: {
      registered_training_sites: measure('sites', {
        value: 5,
        unit: 'sites',
        statement: '5 sites in this extent.',
      }),
      registered_training_programs: measure('programs', { value: 5, unit: 'program records' }),
      confirmed_training_offerings: measure('offerings', {
        value: 0,
        unit: 'offerings',
        known_record_count: 0,
        eligible_record_count: 5,
        unknown_count: 5,
        coverage: 0,
        statement:
          '0 confirmed offerings of 5 registered; 0 of 5 have a current availability check.',
      }),
      published_training_slots: measure('published', {
        value: null,
        unit: 'slots',
        statement: 'Published slots unknown.',
      }),
      remaining_training_seats: measure('training_seats', {
        value: null,
        unit: 'seats',
        statement: 'Remaining training capacity unknown.',
        limitations: ['Remaining training seats are not recorded.'],
      }),
      confirmed_assessment_schedules: measure('schedules', { value: 5, unit: 'schedules' }),
      confirmed_assessment_sites: measure('assessment_sites', { value: 2, unit: 'sites' }),
      remaining_assessment_seats: measure('assessment_seats', {
        value: 30,
        unit: 'seats',
        known_record_count: 2,
        eligible_record_count: 5,
        unknown_count: 3,
        coverage: 0.4,
        statement: '30 reported remaining seats across 2 of 5 schedules; total capacity unknown.',
      }),
      completeness: {},
    },
    limitations: ['Regional labor-market evidence does not establish a local workforce shortage.'],
  }
}

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={client}>
      <QualificationEvidence qualificationCode="CSS-NC-II" regionCode="IV-A" />
    </QueryClientProvider>,
  )
  return { ...view, client }
}

describe('qualification evidence', () => {
  it('keeps dated observations, broader forecast support and partial capacity separate', async () => {
    server.use(http.get('*/api/v1/labor-market/evidence', () => HttpResponse.json(evidence())))
    setup()
    expect(
      await screen.findByText('11 retained posting records from a dated snapshot.'),
    ).toBeVisible()
    expect(screen.getByText('Snapshot dates: 2026-11-04')).toBeVisible()
    expect(screen.getByText(/In demand · Philippines — National · 2025–2026/)).toBeVisible()
    expect(screen.getByText('Broader-area evidence; not a local observation.')).toBeVisible()
    expect(screen.getByRole('link', { name: 'National forecast' })).toHaveAttribute(
      'href',
      'https://example.com/forecast',
    )
    fireEvent.click(screen.getByText('Training and assessment supply'))
    expect(
      screen.getByText(
        '30 reported remaining seats across 2 of 5 schedules; total capacity unknown.',
      ),
    ).toBeVisible()
    expect(screen.getByText('Evidence known for 2 of 5 records; 3 unknown.')).toBeVisible()
    expect(screen.getByText('Remaining training capacity unknown.')).toBeVisible()
    expect(screen.getByText(/Recorded listings describe the app dataset/)).toBeVisible()
    fireEvent.click(screen.getByText('Evidence sources and limitations'))
    expect(
      screen.getByRole('link', { name: 'https://philjobnet.gov.ph/job-vacancies/' }),
    ).toHaveAttribute('href', 'https://philjobnet.gov.ph/job-vacancies/')
    expect(screen.getByText('Registry workbook · sheet 1')).toBeVisible()
    expect(screen.getByText('Registry workbook · sheet 1').tagName).toBe('LI')
  })

  it('shows missing demand as unknown while retaining observed zero provision', async () => {
    const data = evidence()
    data.forecast_support = []
    data.observed_postings.postings = measure('postings', {
      value: null,
      unit: 'posting records',
      statement: 'No dated posting observations are available.',
    })
    data.observed_postings.snapshot_dates = []
    data.supply.registered_training_sites = measure('sites', {
      value: 0,
      unit: 'sites',
      statement: '0 sites in this extent.',
    })
    server.use(http.get('*/api/v1/labor-market/evidence', () => HttpResponse.json(data)))
    setup()
    expect(await screen.findByText('No dated posting observations are available.')).toBeVisible()
    expect(screen.getByText('Observed job postings').parentElement).toHaveTextContent(
      'Unknown posting records',
    )
    expect(
      screen.getByText('No approved current forecast evidence is available for this selection.'),
    ).toBeVisible()
    expect(screen.queryByText('Snapshot dates:')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Training and assessment supply'))
    expect(screen.getByText('0 sites in this extent.')).toBeVisible()
  })

  it('requests fresh area evidence rather than reusing another region’s result', async () => {
    const regions: (string | null)[] = []
    server.use(
      http.get('*/api/v1/labor-market/evidence', ({ request }) => {
        const url = new URL(request.url)
        regions.push(url.searchParams.get('region_code'))
        expect(url.searchParams.get('qualification_code')).toBe('CSS-NC-II')
        const data = evidence()
        if (url.searchParams.get('region_code') === 'III') {
          data.observed_postings.postings.geography.label = 'Central Luzon'
          data.observed_postings.postings.statement = 'Central Luzon observation window.'
        }
        return HttpResponse.json(data)
      }),
    )
    const view = setup()
    await screen.findByText('11 retained posting records from a dated snapshot.')
    view.rerender(
      <QueryClientProvider client={view.client}>
        <QualificationEvidence qualificationCode="CSS-NC-II" regionCode="III" />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('Central Luzon observation window.')).toBeVisible()
    expect(
      screen.queryByText('11 retained posting records from a dated snapshot.'),
    ).not.toBeInTheDocument()
    expect(regions).toEqual(['IV-A', 'III'])
  })

  it('offers a retry when evidence cannot be reached', async () => {
    let requests = 0
    server.use(
      http.get('*/api/v1/labor-market/evidence', () => {
        requests += 1
        return requests === 1
          ? new HttpResponse(null, { status: 503 })
          : HttpResponse.json(evidence())
      }),
    )
    setup()
    expect(await screen.findByRole('alert')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(
      await screen.findByText('11 retained posting records from a dated snapshot.'),
    ).toBeVisible()
    await waitFor(() => expect(requests).toBe(2))
  })

  it('accepts omitted default source and limitation arrays without inventing evidence', async () => {
    const data = evidence()
    delete data.observed_postings.postings.sources
    delete data.observed_postings.postings.limitations
    delete data.supply.remaining_training_seats.limitations
    server.use(http.get('*/api/v1/labor-market/evidence', () => HttpResponse.json(data)))
    setup()
    expect(
      await screen.findByText('11 retained posting records from a dated snapshot.'),
    ).toBeVisible()
    fireEvent.click(screen.getByText('Training and assessment supply'))
    expect(screen.getByText('Remaining training capacity unknown.')).toBeVisible()
    expect(screen.getByText('Recorded training sites')).toBeVisible()
    expect(screen.getByText('Recorded program listings')).toBeVisible()
  })
})
