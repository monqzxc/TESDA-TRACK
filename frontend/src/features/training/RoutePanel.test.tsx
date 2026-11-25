import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, expect, it } from 'vitest'
import { renderWithQuery } from '../../test/query.tsx'
import { server } from '../../test/server.ts'
import { RoutePanel } from './CenterDetail.tsx'
import { useTrainingStore } from './state.ts'

const from = { latitude: 14.5995, longitude: 120.9842 }
const to = { latitude: 14.5983, longitude: 120.9808 }
const explanation =
  'Road route, without traffic. Its starting point is rounded to about 1 km for privacy, so distance and time may differ from the straight-line estimate in the list and map popup.'

beforeEach(() => {
  useTrainingStore.setState({ travelMode: 'car' })
  server.use(
    http.get('*/api/v1/routes', () =>
      HttpResponse.json({
        routing_enabled: true,
        missing_modes: [],
        routes: [
          {
            mode: 'car',
            distance_km: 0.4,
            duration_min: 1,
            path: [
              [14.6, 120.98],
              [14.5983, 120.9808],
            ],
            start: [14.6, 120.98],
            end: [14.5983, 120.9808],
          },
        ],
      }),
    ),
  )
})

it('explains why a road route can differ from the Career Map list and popup', async () => {
  renderWithQuery(<RoutePanel from={from} to={to} explainEstimate />)
  expect(await screen.findByText('0.4 km · about 1 min by car')).toBeInTheDocument()
  expect(screen.getByText(explanation)).toBeInTheDocument()
})

it('keeps the existing route wording for callers without a list estimate', async () => {
  renderWithQuery(<RoutePanel from={from} to={to} />)
  expect(await screen.findByText('0.4 km · about 1 min by car')).toBeInTheDocument()
  expect(screen.getByText('From your approximate location, without traffic.')).toBeInTheDocument()
  expect(screen.queryByText(explanation)).not.toBeInTheDocument()
})

it('does not claim a road route was found when routing fails', async () => {
  server.use(
    http.get('*/api/v1/routes', () =>
      HttpResponse.json({ detail: 'Router unavailable' }, { status: 503 }),
    ),
  )
  renderWithQuery(<RoutePanel from={from} to={to} explainEstimate />)
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  expect(screen.queryByText(explanation)).not.toBeInTheDocument()
})
