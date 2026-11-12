import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithQuery } from '../../test/query.tsx'
import { server } from '../../test/server.ts'
import type { CenterMapProps } from '../training/CenterMapTypes.ts'
import { useTrainingStore } from '../training/state.ts'
import ExplorePage from './ExplorePage.tsx'
import { useDemandStore, useExploreStore } from './useExplore.ts'

vi.mock('../training/CenterMap.tsx', () => ({
  default: (props: CenterMapProps) => (
    <div data-testid="map">
      {props.demandAreas?.map((area) => (
        <button key={area.region_code} onClick={() => props.onDemandArea?.(area.region_code)}>
          {area.name} regional marker
        </button>
      ))}
    </div>
  ),
}))
vi.mock('../labor-market/QualificationEvidence.tsx', () => ({
  QualificationEvidence: ({
    qualificationCode,
    regionCode,
  }: {
    qualificationCode: string
    regionCode: string | null
  }) => (
    <p>
      Evidence for {qualificationCode} in {regionCode ?? 'all regions'}
    </p>
  ),
}))

const requests: URL[] = []
const regions = [
  { code: 'NCR', name: 'Metro Manila', latitude: 14.6, longitude: 121, center_city: 'Manila' },
  { code: 'IV-A', name: 'CALABARZON', latitude: 14.2, longitude: 121.2, center_city: 'Calamba' },
]
const jobs = {
  items: [
    {
      title: 'WELDER',
      posting_count: 3,
      employer_count: 2,
      localities: ['MAKATI CITY, NCR'],
      region_codes: ['NCR'],
    },
  ],
  total: 1,
  posting_count: 3,
  employer_count: 2,
  limit: 20,
  offset: 0,
  region_code: null,
  locality: null,
  localities: ['MAKATI CITY, NCR'],
  areas: [{ ...regions[0], region_code: 'NCR', posting_count: 3, titles: ['WELDER'] }],
  snapshot_dates: ['2026-11-04'],
  posted_between: ['2026-10-05', '2026-11-04'],
  source_url: 'https://philjobnet.gov.ph/job-vacancies/',
  limitations: [],
}

beforeEach(() => {
  requests.length = 0
  useExploreStore.setState({ search: null, draft: '' })
  useDemandStore.setState({
    region: undefined,
    scope: undefined,
    locality: null,
    code: null,
    offset: 0,
  })
  useTrainingStore.setState({
    useLocation: false,
    location: null,
    locating: false,
    placeText: '',
    locationError: null,
    routeTo: null,
  })
  server.use(
    http.get('*/api/v1/regions', () => HttpResponse.json(regions)),
    http.get('*/api/v1/qualifications', () =>
      HttpResponse.json([
        {
          code: 'SMAW-NC-II',
          name: 'Welding NC II',
          sector: 'Engineering',
          possible_jobs: [],
          competencies: [],
        },
      ]),
    ),
    http.get('*/api/v1/labor-market/jobs', ({ request }) => {
      requests.push(new URL(request.url))
      return HttpResponse.json(jobs)
    }),
    http.get('*/api/v1/labor-market/qualifications', ({ request }) => {
      requests.push(new URL(request.url))
      return HttpResponse.json({
        items: [
          {
            qualification_code: 'SMAW-NC-II',
            qualification_name: 'Welding NC II',
            observed_posting_count: 3,
            observation_dates: ['2026-11-04'],
            forecast_support: [
              {
                geography: { label: 'Philippines — National' },
                period_label: '2025–2026',
              },
            ],
          },
        ],
        total: 1,
        offset: 0,
        limit: 20,
      })
    }),
  )
})

const open = (path = '/explore?type=demand') =>
  renderWithQuery(
    <MemoryRouter initialEntries={[path]}>
      <ExplorePage />
    </MemoryRouter>,
  )

describe('Explore labor demand', () => {
  it('uses the first matched qualification and resets a stale job filter for a new search', async () => {
    useDemandStore.setState({ code: 'OLD-CODE' })
    useExploreStore.getState().setSearch({
      query: 'I can weld',
      result: {
        profile: { intent: 'assessment_recommendation' },
        matches: [
          {
            qualification: { code: 'SMAW-NC-II', name: 'Welding NC II', sector: 'Engineering' },
            score: 90,
            reason: 'Matched welding',
          },
        ],
      },
    })
    open()
    await screen.findByRole('heading', { name: 'WELDER' })
    expect(requests.at(-1)?.searchParams.get('qualification_code')).toBe('SMAW-NC-II')
    expect(screen.getByText('Qualification: Welding NC II')).toBeVisible()
  })

  it('opens and shows jobs and regional markers from the chip without a search or location', async () => {
    open('/explore')
    expect(requests).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'In demand jobs' }))
    expect(await screen.findByRole('heading', { name: 'WELDER' })).toBeVisible()
    expect(screen.getByText(/Snapshot: 2026-11-04/)).toBeVisible()
    expect(
      await screen.findByRole('button', { name: 'Metro Manila regional marker' }),
    ).toBeVisible()
    expect(screen.getByText(/not live openings or worker headcounts/)).toBeVisible()
  })

  it('refetches with explicit region, locality and reviewed qualification filters', async () => {
    open()
    await screen.findByRole('heading', { name: 'WELDER' })
    fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'NCR' } })
    await waitFor(() => expect(requests.at(-1)?.searchParams.get('region_code')).toBe('NCR'))
    fireEvent.change(screen.getByLabelText('City or municipality in the snapshot'), {
      target: { value: 'MAKATI CITY, NCR' },
    })
    await waitFor(() =>
      expect(requests.at(-1)?.searchParams.get('locality')).toBe('MAKATI CITY, NCR'),
    )
    fireEvent.change(screen.getByLabelText('Filter by qualification'), {
      target: { value: 'SMAW-NC-II' },
    })
    await waitFor(() =>
      expect(requests.at(-1)?.searchParams.get('qualification_code')).toBe('SMAW-NC-II'),
    )
    expect(requests.at(-1)?.searchParams.has('locality')).toBe(false)
  })

  it('discovers qualifications with national scope retained and opens their supply comparison', async () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: /^Qualifications$/ }))
    expect(await screen.findByRole('heading', { name: 'Welding NC II' })).toBeVisible()
    expect(screen.getByText('Forecast support: Philippines — National · 2025–2026')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Compare supply and demand' }))
    expect(await screen.findByText('Evidence for SMAW-NC-II in all regions')).toBeVisible()
    fireEvent.change(screen.getByLabelText('Region'), { target: { value: 'IV-A' } })
    expect(await screen.findByText('Evidence for SMAW-NC-II in IV-A')).toBeVisible()
  })

  it('starts qualification discovery on the first page when a region is selected on the map', async () => {
    server.use(
      http.get('*/api/v1/labor-market/qualifications', ({ request }) => {
        const url = new URL(request.url)
        requests.push(url)
        return HttpResponse.json({
          items: [
            {
              qualification_code: 'SMAW-NC-II',
              qualification_name: 'Welding NC II',
              observed_posting_count: 3,
            },
          ],
          total: url.searchParams.has('region_code') ? 1 : 41,
          limit: 20,
          offset: Number(url.searchParams.get('offset')),
        })
      }),
    )
    open()
    fireEvent.click(screen.getByRole('button', { name: /^Qualifications$/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }))
    await waitFor(() =>
      expect(
        requests
          .filter((url) => url.pathname.endsWith('/qualifications'))
          .at(-1)
          ?.searchParams.get('offset'),
      ).toBe('20'),
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }))
    await waitFor(() =>
      expect(
        requests
          .filter((url) => url.pathname.endsWith('/qualifications'))
          .at(-1)
          ?.searchParams.get('offset'),
      ).toBe('40'),
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Metro Manila regional marker' }))
    await waitFor(() => {
      const request = requests.filter((url) => url.pathname.endsWith('/qualifications')).at(-1)!
      expect(request.searchParams.get('region_code')).toBe('NCR')
      expect(request.searchParams.get('offset')).toBe('0')
    })
    expect(await screen.findByRole('heading', { name: 'Welding NC II' })).toBeVisible()
  })

  it('clears a stale city and page when the automatic starting area changes', async () => {
    server.use(
      http.get('*/api/v1/labor-market/jobs', ({ request }) => {
        requests.push(new URL(request.url))
        return HttpResponse.json({ ...jobs, total: 41 })
      }),
    )
    useTrainingStore.setState({ placeText: 'Manila' })
    open()
    fireEvent.change(await screen.findByLabelText('City or municipality in the snapshot'), {
      target: { value: 'MAKATI CITY, NCR' },
    })
    await waitFor(() =>
      expect(requests.at(-1)?.searchParams.get('locality')).toBe('MAKATI CITY, NCR'),
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }))
    await waitFor(() => expect(requests.at(-1)?.searchParams.get('offset')).toBe('20'))
    act(() => useTrainingStore.setState({ placeText: 'Calamba' }))
    await waitFor(() => {
      const request = requests.at(-1)!
      expect(request.searchParams.get('region_code')).toBe('IV-A')
      expect(request.searchParams.has('locality')).toBe(false)
      expect(request.searchParams.get('offset')).toBe('0')
    })
  })

  it('shows an honest empty state and recovers from an API failure', async () => {
    server.use(http.get('*/api/v1/labor-market/jobs', () => HttpResponse.json({}, { status: 503 })))
    open()
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded')
    server.use(
      http.get('*/api/v1/labor-market/jobs', () =>
        HttpResponse.json({ ...jobs, items: [], areas: [], total: 0, posting_count: 0 }),
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText(/Missing evidence does not mean low demand/)).toBeVisible()
  })
})
