import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { components } from '../../api/schema.d.ts'
import { renderWithQuery } from '../../test/query.tsx'
import { server } from '../../test/server.ts'
import { ServiceAccessComparison } from './ServiceAccessComparison.tsx'
import type { Center } from './centers.ts'
import { useTrainingStore } from './state.ts'

type RequestBody = components['schemas']['ServiceAccessRequest']
type ResponseBody = components['schemas']['ServiceAccessComparison']

function center(id: string, name: string): Center {
  return {
    id,
    name,
    kind: id.startsWith('assessment') ? 'assessment' : 'training',
    regionCode: 'NCR',
    region: 'National Capital Region',
    province: null,
    city: 'Manila',
    address: null,
    latitude: 14.6,
    longitude: 120.98,
    email: null,
    phone: null,
    website: null,
    programs: [],
    schedules: [],
    distanceKm: null,
  }
}
const centers = [
  center('training-1', 'Slower training site'),
  center('assessment-2', 'Faster assessment site'),
  center('training-3', 'Unresolved training site'),
]
const props = {
  qualificationCode: 'CSS-NC-II',
  centers,
  selectedId: 'assessment-2',
  routingEnabled: true,
  onChoose: vi.fn(),
}

function response(): ResponseBody {
  return {
    qualification_code: 'CSS-NC-II',
    mode: 'car',
    maximum_minutes: 45,
    checked_at: '2026-11-10T10:00:00+08:00',
    routing_enabled: true,
    origin_precision_decimals: 2,
    method: 'OSRM road network',
    network_version: null,
    results: [
      {
        kind: 'training',
        site_id: 1,
        name: 'Slower training site',
        status: 'modeled_route',
        duration_min: 52,
        distance_km: 20,
        within_budget: false,
        explanation: 'Modeled car route without traffic.',
      },
      {
        kind: 'training',
        site_id: 3,
        name: 'Unresolved training site',
        status: 'location_unknown',
        duration_min: null,
        within_budget: null,
        explanation: 'The center coordinates are unknown.',
      },
      {
        kind: 'assessment',
        site_id: 2,
        name: 'Faster assessment site',
        status: 'modeled_route',
        duration_min: 22,
        distance_km: 24,
        within_budget: true,
        explanation: 'Modeled car route without traffic.',
      },
    ],
    limitations: ['No public transport schedules.'],
  }
}

beforeEach(() => {
  props.onChoose.mockReset()
  useTrainingStore.setState({
    useLocation: true,
    location: { latitude: 14.55, longitude: 121.02 },
    travelMode: 'car',
    locating: false,
    placeText: '',
    locationError: null,
  })
})

async function openAndCompare() {
  await userEvent.click(screen.getByText('Compare road access'))
  await userEvent.click(screen.getByRole('button', { name: 'Compare travel times' }))
  await screen.findByRole('heading', { name: 'Faster assessment site' })
}

describe('explicit service access comparison', () => {
  it('posts only on submit, compares one qualification from the shared approximate origin and orders by road time', async () => {
    const requests: { body: RequestBody; url: string }[] = []
    server.use(
      http.post('*/api/v1/recommendations/service-access', async ({ request }) => {
        requests.push({ body: (await request.json()) as RequestBody, url: request.url })
        return HttpResponse.json(response())
      }),
    )
    renderWithQuery(<ServiceAccessComparison {...props} />)
    await userEvent.click(screen.getByText('Compare road access'))
    expect(requests).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Compare travel times' }))
    await screen.findByRole('heading', { name: 'Faster assessment site' })
    expect(requests).toHaveLength(1)
    expect(requests[0].body).toEqual({
      qualification_code: 'CSS-NC-II',
      origin: { latitude: 14.55, longitude: 121.02 },
      mode: 'car',
      maximum_minutes: 45,
      candidates: [
        { kind: 'assessment', site_id: 2 },
        { kind: 'training', site_id: 1 },
        { kind: 'training', site_id: 3 },
      ],
    })
    expect(new URL(requests[0].url).search).toBe('')
    const rows = screen.getAllByRole('listitem')
    expect(rows.map((row) => within(row).getByRole('heading').textContent)).toEqual([
      'Faster assessment site',
      'Slower training site',
      'Unresolved training site',
    ])
    expect(rows[0]).toHaveTextContent('22 min · Within your preferred time')
    expect(rows[1]).toHaveTextContent('52 min · Over your preferred time')
    expect(rows[2]).toHaveTextContent('Center location needs confirmation')
    expect(rows[2]).not.toHaveTextContent(/Within your preferred time|\d+ min/)
    await userEvent.click(within(rows[0]).getByRole('button', { name: 'Show center' }))
    expect(props.onChoose).toHaveBeenCalledWith('assessment-2')
  })

  it('hides old road results after a mode, origin or qualification change until explicitly compared again', async () => {
    let requests = 0
    server.use(
      http.post('*/api/v1/recommendations/service-access', () => {
        requests += 1
        return HttpResponse.json(response())
      }),
    )
    const view = renderWithQuery(<ServiceAccessComparison {...props} />)
    await openAndCompare()
    act(() => useTrainingStore.getState().setTravelMode('bike'))
    expect(
      screen.queryByRole('heading', { name: 'Faster assessment site' }),
    ).not.toBeInTheDocument()
    expect(requests).toBe(1)
    act(() => useTrainingStore.getState().setTravelMode('car'))
    expect(
      screen.queryByRole('heading', { name: 'Faster assessment site' }),
    ).not.toBeInTheDocument()
    act(() => useTrainingStore.getState().setTravelMode('bike'))
    await userEvent.click(screen.getByRole('button', { name: 'Compare travel times' }))
    await screen.findByRole('heading', { name: 'Faster assessment site' })
    act(() => useTrainingStore.setState({ location: { latitude: 14.56, longitude: 121.03 } }))
    expect(
      screen.queryByRole('heading', { name: 'Faster assessment site' }),
    ).not.toBeInTheDocument()
    expect(requests).toBe(2)
    await userEvent.click(screen.getByRole('button', { name: 'Compare travel times' }))
    await screen.findByRole('heading', { name: 'Faster assessment site' })
    view.rerender(<ServiceAccessComparison {...props} qualificationCode="EIM-NCII" />)
    expect(
      screen.queryByRole('heading', { name: 'Faster assessment site' }),
    ).not.toBeInTheDocument()
    expect(requests).toBe(3)
  })

  it('does not route from an area search or region centroid without a shared origin', async () => {
    let requests = 0
    server.use(
      http.post('*/api/v1/recommendations/service-access', () => {
        requests += 1
        return HttpResponse.json(response())
      }),
    )
    useTrainingStore.setState({
      useLocation: false,
      location: null,
      placeText: 'National Capital Region',
    })
    renderWithQuery(<ServiceAccessComparison {...props} />)
    await userEvent.click(screen.getByText('Compare road access'))
    expect(
      screen.getByText(
        'Share your approximate location to compare road access. Searched areas are browsing references.',
      ),
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Compare travel times' })).not.toBeInTheDocument()
    expect(requests).toBe(0)
  })

  it('uses a supported road mode and synchronizes the map when the prior selection was a flight', async () => {
    const requests: RequestBody[] = []
    server.use(
      http.post('*/api/v1/recommendations/service-access', async ({ request }) => {
        requests.push((await request.json()) as RequestBody)
        return HttpResponse.json(response())
      }),
    )
    useTrainingStore.setState({ travelMode: 'plane' })
    renderWithQuery(<ServiceAccessComparison {...props} />)
    await openAndCompare()
    expect(requests).toHaveLength(1)
    expect(requests[0].mode).toBe('car')
    expect(useTrainingStore.getState().travelMode).toBe('car')
  })

  it('aborts an old access request when the origin changes and ignores its delayed result', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let oldSignal: AbortSignal | null = null
    server.use(
      http.post('*/api/v1/recommendations/service-access', async ({ request }) => {
        oldSignal = request.signal
        await gate
        return HttpResponse.json(response())
      }),
    )
    renderWithQuery(<ServiceAccessComparison {...props} />)
    await userEvent.click(screen.getByText('Compare road access'))
    await userEvent.click(screen.getByRole('button', { name: 'Compare travel times' }))
    await waitFor(() => expect(oldSignal).not.toBeNull())
    act(() => useTrainingStore.setState({ location: { latitude: 14.56, longitude: 121.03 } }))
    await waitFor(() => expect(oldSignal?.aborted).toBe(true))
    await act(async () => {
      release()
      await gate
    })
    expect(
      screen.queryByRole('heading', { name: 'Faster assessment site' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
