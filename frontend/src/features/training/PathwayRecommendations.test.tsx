import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { components } from '../../api/schema.d.ts'
import { bookkeeping, electrical } from '../../test/fixtures.ts'
import { renderWithQuery } from '../../test/query.tsx'
import { server } from '../../test/server.ts'
import { REGIONS } from '../../test/training.ts'
import { useFinderStore } from '../finder/store.ts'
import { PathwayRecommendations } from './PathwayRecommendations.tsx'

// The evidence panel's rendering and network contract have their own integration tests.
vi.mock('../labor-market/QualificationEvidence.tsx', () => ({
  QualificationEvidence: ({
    qualificationCode,
    regionCode,
  }: {
    qualificationCode: string
    regionCode: string | null
  }) => (
    <section aria-label="Selected qualification evidence">
      Evidence for {qualificationCode} in {regionCode ?? 'all areas'}
    </section>
  ),
}))

const profile = {
  career_goal: 'Record keeping',
  existing_skills: [],
  intent: 'training_recommendation' as const,
}
const matches = {
  profile,
  matches: [
    {
      qualification: bookkeeping,
      score: 75,
      reason: 'Related to your business-record experience.',
      components: { keyword: 0.7, semantic: 0.8 },
    },
  ],
}
const props = {
  catalog: [bookkeeping, electrical],
  regions: REGIONS,
  regionCode: 'NCR',
  selectedCode: null,
  onArea: vi.fn(),
  onChoose: vi.fn(),
}

function directory(region: string): components['schemas']['AreaQualifications'] {
  return {
    items: [
      {
        qualification_code: electrical.code,
        qualification_name: electrical.name,
        observed_posting_count: null,
        posting_unit: 'distinct posting records',
        observation_dates: [],
        observation_geography: {
          scope: 'regional',
          region_code: region,
          label: `Evidence region ${region}`,
        },
        forecast_support: [],
        has_selected_area_evidence: false,
      },
    ],
    total: 1,
    limit: 20,
    offset: 0,
    region_code: region,
    evaluated_at: '2026-11-10T10:00:00+08:00',
    observed_since: '2026-10-11',
    observed_through: '2026-11-10',
    ordering: 'qualification_name',
    method_version: 'area-qualifications-v1',
  }
}

beforeEach(() => {
  useFinderStore.getState().reset()
  props.onArea.mockReset()
  props.onChoose.mockReset()
})

describe('pathway recommendations in the existing training workspace', () => {
  it('submits a private goal only on request and passes the chosen match into evidence', async () => {
    const requests: {
      path: string
      method: string
      query: string | null
      url: string
      region?: string
    }[] = []
    server.use(
      http.post('*/api/v1/analysis/goal', async ({ request }) => {
        const body = (await request.json()) as { query: string }
        requests.push({
          path: new URL(request.url).pathname,
          method: request.method,
          query: body.query,
          url: request.url,
        })
        return HttpResponse.json({ profile, source: 'rules', matching_mode: 'goal' })
      }),
      http.post('*/api/v1/analysis/matches', async ({ request }) => {
        const body = (await request.json()) as { query: string; region_code: string }
        requests.push({
          path: new URL(request.url).pathname,
          method: request.method,
          query: body.query,
          region: body.region_code,
          url: request.url,
        })
        return HttpResponse.json(matches)
      }),
    )
    function Harness() {
      const [selected, setSelected] = useState<string | null>(null)
      return (
        <PathwayRecommendations
          {...props}
          selectedCode={selected}
          onChoose={(code, goal) => {
            props.onChoose(code, goal)
            setSelected(code)
          }}
        />
      )
    }
    renderWithQuery(<Harness />)
    const goal = 'I keep private business records and want related work.'
    fireEvent.change(screen.getByRole('textbox', { name: 'Your goal or skills' }), {
      target: { value: goal },
    })
    expect(requests).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Find qualifications' }))
    expect(await screen.findByText('Related to your business-record experience.')).toBeVisible()
    expect(requests.map((request) => request.path)).toEqual([
      '/api/v1/analysis/goal',
      '/api/v1/analysis/matches',
    ])
    expect(
      requests.every(
        (request) =>
          request.method === 'POST' && request.query === goal && !new URL(request.url).search,
      ),
    ).toBe(true)
    expect(requests[1].region).toBe('NCR')
    expect(window.location.href).not.toContain('private')
    await userEvent.click(screen.getByRole('button', { name: 'Compare centers' }))
    expect(props.onChoose).toHaveBeenCalledWith(bookkeeping.code, goal)
    expect(
      await screen.findByRole('region', { name: 'Selected qualification evidence' }),
    ).toHaveTextContent(`Evidence for ${bookkeeping.code} in NCR`)
  })

  it('removes old matches as soon as a new goal is entered', async () => {
    server.use(
      http.post('*/api/v1/analysis/goal', () => HttpResponse.json({ profile, source: 'rules' })),
      http.post('*/api/v1/analysis/matches', () => HttpResponse.json(matches)),
    )
    renderWithQuery(<PathwayRecommendations {...props} />)
    const input = screen.getByRole('textbox', { name: 'Your goal or skills' })
    fireEvent.change(input, { target: { value: 'I keep business records' } })
    await userEvent.click(screen.getByRole('button', { name: 'Find qualifications' }))
    await screen.findByText('Related to your business-record experience.')
    fireEvent.change(input, { target: { value: 'I want to install wiring' } })
    expect(
      screen.queryByText('Related to your business-record experience.'),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Compare centers' })).not.toBeInTheDocument()
  })

  it('hides a settled regional match after an external area change', async () => {
    server.use(
      http.post('*/api/v1/analysis/goal', () => HttpResponse.json({ profile, source: 'rules' })),
      http.post('*/api/v1/analysis/matches', () => HttpResponse.json(matches)),
    )
    const view = renderWithQuery(<PathwayRecommendations {...props} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Your goal or skills' }), {
      target: { value: 'In-demand work related to my record keeping' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Find qualifications' }))
    await screen.findByText('Related to your business-record experience.')
    view.rerender(<PathwayRecommendations {...props} regionCode="VII" />)
    expect(
      screen.queryByText('Related to your business-record experience.'),
    ).not.toBeInTheDocument()
    view.rerender(<PathwayRecommendations {...props} regionCode="NCR" />)
    expect(
      screen.queryByText('Related to your business-record experience.'),
    ).not.toBeInTheDocument()
  })

  it('aborts an old regional request and does not let its delayed answer populate the new area', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let oldSignal: AbortSignal | null = null
    server.use(
      http.post('*/api/v1/analysis/goal', () => HttpResponse.json({ profile, source: 'rules' })),
      http.post('*/api/v1/analysis/matches', async ({ request }) => {
        oldSignal = request.signal
        await gate
        return HttpResponse.json(matches)
      }),
    )
    const view = renderWithQuery(<PathwayRecommendations {...props} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Your goal or skills' }), {
      target: { value: 'In-demand record keeping work' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Find qualifications' }))
    await waitFor(() => expect(oldSignal).not.toBeNull())
    view.rerender(<PathwayRecommendations {...props} regionCode="VII" />)
    await waitFor(() => expect(oldSignal?.aborted).toBe(true))
    await act(async () => {
      release()
      await gate
    })
    expect(
      screen.queryByText('Related to your business-record experience.'),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Find qualifications' })).toBeEnabled()
  })

  it('requests the expanded area directory for its selected region and preserves unknown posting counts', async () => {
    const requested: (string | null)[] = []
    server.use(
      http.get('*/api/v1/labor-market/qualifications', ({ request }) => {
        const region = new URL(request.url).searchParams.get('region_code')
        requested.push(region)
        return HttpResponse.json(directory(region ?? 'all'))
      }),
    )
    const view = renderWithQuery(<PathwayRecommendations {...props} />)
    expect(requested).toHaveLength(0)
    await userEvent.click(screen.getByText('Explore other qualifications by area'))
    expect(await screen.findByText('Posting count unknown · Evidence region NCR')).toBeVisible()
    expect(screen.queryByText(/^0 observed posting/)).not.toBeInTheDocument()
    view.rerender(<PathwayRecommendations {...props} regionCode="VII" />)
    expect(await screen.findByText('Posting count unknown · Evidence region VII')).toBeVisible()
    expect(
      screen.queryByText('Posting count unknown · Evidence region NCR'),
    ).not.toBeInTheDocument()
    expect(requested).toEqual(['NCR', 'VII'])
  })
})
