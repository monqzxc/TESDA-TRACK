import { describe, expect, it } from 'vitest'
import { en } from '../copy/en.ts'
import { ApiError, detailMessage, errorFromResponse, parseRetryAfter, unwrap } from './errors.ts'

// The same messages frontend/api_client.py shows (_detail and ApiClient._request).

const respond = (status: number, headers: Record<string, string> = {}) =>
  new Response(null, { status, headers })

describe('detailMessage', () => {
  it("shows the API's detail when it is text", () => {
    expect(detailMessage({ detail: 'Incorrect email or password.' })).toBe(
      'Incorrect email or password.',
    )
  })

  it('joins the messages of validation errors', () => {
    const body = {
      detail: [
        { loc: ['body', 'email'], msg: 'value is not a valid email address', type: 'value_error' },
        {
          loc: ['body', 'password'],
          msg: 'String should have at least 10 characters',
          type: 'string_too_short',
        },
      ],
    }
    expect(detailMessage(body)).toBe(
      'value is not a valid email address String should have at least 10 characters',
    )
  })

  it('asks to check the input when validation errors carry no message', () => {
    expect(detailMessage({ detail: [] })).toBe(en.service.checkInput)
    expect(detailMessage({ detail: ['not an object', { loc: [] }] })).toBe(en.service.checkInput)
  })

  it('falls back to a general message when there is no usable detail', () => {
    for (const body of [
      undefined,
      null,
      'Bad Gateway',
      [],
      {},
      { detail: 42 },
      { detail: { code: 1 } },
    ]) {
      expect(detailMessage(body)).toBe('The request could not be completed.')
    }
  })
})

describe('errorFromResponse', () => {
  it("keeps a refused request's status and detail", () => {
    const error = errorFromResponse(respond(404), { detail: 'Qualification not found.' })
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 404,
      message: 'Qualification not found.',
      unavailable: false,
    })
  })

  it('shows the service message for every server error, whatever the detail says', () => {
    for (const status of [500, 502, 503, 504]) {
      expect(errorFromResponse(respond(status), { detail: 'Database down' })).toMatchObject({
        status,
        message: en.service.unreachable,
        unavailable: true,
      })
    }
  })

  it("shows Skills Bridge's curated message for a 503 when asked to", () => {
    const body = { detail: 'Skills Bridge is busy. Please try again in a minute.' }
    expect(errorFromResponse(respond(503), body, { detailOn503: true })).toMatchObject({
      status: 503,
      message: 'Skills Bridge is busy. Please try again in a minute.',
      unavailable: false,
    })
    expect(errorFromResponse(respond(500), body, { detailOn503: true }).message).toBe(
      en.service.unreachable,
    )
  })

  it('reads Retry-After from a rate limit', () => {
    const error = errorFromResponse(respond(429, { 'Retry-After': '17' }), {
      detail: 'Too many lookups. Please wait a moment.',
    })
    expect(error).toMatchObject({
      status: 429,
      retryAfter: 17,
      message: 'Too many lookups. Please wait a moment.',
    })
  })
})

describe('parseRetryAfter', () => {
  it('reads seconds and HTTP dates', () => {
    const now = Date.parse('2026-10-13T00:00:00Z')
    expect(parseRetryAfter('120', now)).toBe(120)
    expect(parseRetryAfter('Tue, 13 Oct 2026 00:01:30 GMT', now)).toBe(90)
    expect(parseRetryAfter('Mon, 12 Oct 2026 00:00:00 GMT', now)).toBe(0)
    expect(parseRetryAfter(null, now)).toBeUndefined()
    expect(parseRetryAfter('soon', now)).toBeUndefined()
  })
})

describe('unwrap', () => {
  it('returns the data of a successful call', async () => {
    await expect(
      unwrap(Promise.resolve({ data: [1, 2], response: respond(200) })),
    ).resolves.toEqual([1, 2])
  })

  it('turns a failed response into an ApiError', async () => {
    const call = Promise.resolve({ error: { detail: 'Not signed in.' }, response: respond(401) })
    await expect(unwrap(call)).rejects.toMatchObject({ status: 401, message: 'Not signed in.' })
  })

  it('turns a network failure into the service message', async () => {
    const error = await unwrap(Promise.reject(new TypeError('Failed to fetch'))).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      message: en.service.unreachable,
      status: undefined,
      unavailable: true,
    })
  })

  it('lets cancelled requests through unchanged', async () => {
    const abort = new DOMException('The operation was aborted.', 'AbortError')
    await expect(unwrap(Promise.reject(abort))).rejects.toBe(abort)
  })
})
