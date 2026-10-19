import { waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { bookkeeping, electrical, ncr } from '../test/fixtures.ts'
import { renderHookWithQuery } from '../test/query.tsx'
import { server } from '../test/server.ts'
import { ApiError } from './errors.ts'
import { qualificationsQuery, regionsQuery, useQualifications, useRegions } from './queries.ts'
import type { Qualification } from './queries.ts'

const UNREACHABLE = "We can't reach the TESDA-TRACK service right now. Please try again shortly."

describe('useQualifications', () => {
  it('returns the typed catalog from the API', async () => {
    server.use(
      http.get('*/api/v1/qualifications', () => HttpResponse.json([bookkeeping, electrical])),
    )

    const { result } = renderHookWithQuery(() => useQualifications())

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expectTypeOf(result.current.data).toEqualTypeOf<Qualification[] | undefined>()
    expect(result.current.data).toEqual([bookkeeping, electrical])
    expect(result.current.data?.[0].competencies[0].name).toBe('Journalize transactions')
  })

  it('gives the service message when the API cannot be reached', async () => {
    server.use(http.get('*/api/v1/qualifications', () => HttpResponse.error()))

    const { result } = renderHookWithQuery(() => useQualifications())

    await waitFor(() => expect(result.current.isError).toBe(true))
    expectTypeOf(result.current.error).toEqualTypeOf<ApiError | null>()
    expect(result.current.error).toBeInstanceOf(ApiError)
    expect(result.current.error).toMatchObject({
      message: UNREACHABLE,
      unavailable: true,
      status: undefined,
    })
  })

  it("gives the API's message when it refuses the request", async () => {
    server.use(
      http.get('*/api/v1/qualifications', () =>
        HttpResponse.json(
          { detail: 'Too many requests. Please wait a moment.' },
          {
            status: 429,
            headers: { 'Retry-After': '30' },
          },
        ),
      ),
    )

    const { result } = renderHookWithQuery(() => useQualifications())

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({
      message: 'Too many requests. Please wait a moment.',
      status: 429,
      retryAfter: 30,
      unavailable: false,
    })
  })

  it('gives the service message, not the detail, for a server error', async () => {
    server.use(
      http.get('*/api/v1/qualifications', () =>
        HttpResponse.json(
          { detail: 'Something went wrong on our side. Please try again.' },
          { status: 500 },
        ),
      ),
    )

    const { result } = renderHookWithQuery(() => useQualifications())

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({
      message: UNREACHABLE,
      status: 500,
      unavailable: true,
    })
  })

  it('keeps the catalog for 5 minutes', () => {
    expect(qualificationsQuery.staleTime).toBe(5 * 60_000)
  })
})

describe('useRegions', () => {
  it('returns the typed regions from the API', async () => {
    server.use(http.get('*/api/v1/regions', () => HttpResponse.json([ncr])))

    const { result } = renderHookWithQuery(() => useRegions())

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0].center_city).toBe('Manila')
  })

  it('keeps regions for an hour', () => {
    expect(regionsQuery.staleTime).toBe(60 * 60_000)
  })
})
