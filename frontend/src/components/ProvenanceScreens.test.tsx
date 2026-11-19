import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from '../test/app.tsx'
import { server } from '../test/server.ts'
import { manilaInstitute, serveTrainingApi, weldingProgram } from '../test/training.ts'
import { useFinderStore } from '../features/finder/store.ts'
import { useTrainingStore } from '../features/training/state.ts'

vi.mock('../features/training/CenterMap.tsx', () => ({ default: () => null }))

const provenance = {
  status: 'example' as const,
  source_name: 'Pilot source register',
  source_reference: 'Record 10',
  source_url: 'https://example.com/register',
  source_updated_on: '2026-10-01',
  reviewed_at: null,
}
const qualification = {
  code: 'SMAW-NCII',
  name: 'Welding NC II',
  sector: 'Metals and Engineering',
  possible_jobs: ['Welder'],
  competencies: [],
  provenance,
}

beforeEach(() => {
  localStorage.clear()
  useFinderStore.getState().reset()
  useTrainingStore.setState(useTrainingStore.getInitialState())
  server.use(http.get('*/api/v1/qualifications', () => HttpResponse.json([qualification])))
})

describe('source provenance on learner screens', () => {
  it('leaves data-status labels out of the qualifications library', async () => {
    renderApp('/qualifications')
    expect(await screen.findByRole('heading', { name: 'Welding NC II' })).toBeVisible()
    expect(screen.queryByText('Example data')).not.toBeInTheDocument()
    expect(screen.queryByText(/For demonstration/)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Pilot source register' })).not.toBeInTheDocument()
  })

  it('shows center and listing provenance alongside service evidence', async () => {
    serveTrainingApi()
    server.use(
      http.get('*/api/v1/training-providers', () =>
        HttpResponse.json([{ ...manilaInstitute, provenance }]),
      ),
      http.get('*/api/v1/assessment-centers', () => HttpResponse.json([])),
      http.get('*/api/v1/training-programs', () =>
        HttpResponse.json([{ ...weldingProgram, provenance }]),
      ),
      http.get('*/api/v1/assessment-schedules', () => HttpResponse.json([])),
    )
    renderApp('/training')
    expect(
      (await screen.findAllByRole('link', { name: 'Pilot source register' })).length,
    ).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('Incomplete data').length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByText('Example data')).not.toBeInTheDocument()
    expect(screen.getAllByText('2026-10-01').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Service reviewed:').textContent).toContain('2020-01-01')
  })
})
