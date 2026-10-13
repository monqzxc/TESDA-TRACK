import { en } from '../copy/en.ts'

// Turns failed requests into messages a learner can read, the same ones frontend/api_client.py shows.

export interface ApiErrorInit {
  message: string
  /** The HTTP status, or undefined when the service couldn't be reached at all. */
  status?: number
  /** Seconds to wait before trying again, from a Retry-After header. */
  retryAfter?: number
  /** The service is down or unreachable (api_client.py's ApiUnavailableError), not refusing this request. */
  unavailable?: boolean
  cause?: unknown
}

/** A request that failed. `message` is safe to show to the learner. */
export class ApiError extends Error {
  readonly status?: number
  readonly retryAfter?: number
  readonly unavailable: boolean

  constructor({ message, status, retryAfter, unavailable = false, cause }: ApiErrorInit) {
    super(message, { cause })
    this.name = 'ApiError'
    this.status = status
    this.retryAfter = retryAfter
    this.unavailable = unavailable
  }
}

export interface UnwrapOptions {
  /**
   * Show the API's own message for a 503. The Skills Bridge routes send curated provider errors this way;
   * other server errors stay generic.
   */
  detailOn503?: boolean
}

/** The learner-facing message in an error body: FastAPI's `detail`, as a string or validation errors. */
export function detailMessage(body: unknown): string {
  const detail = isRecord(body) ? body.detail : undefined
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    // FastAPI validation errors: [{ loc, msg, type }, ...]
    const messages = detail
      .filter(isRecord)
      .map((item) => (typeof item.msg === 'string' ? item.msg : ''))
    return messages.join(' ') || en.service.checkInput
  }
  return en.service.requestFailed
}

/** Seconds from a Retry-After header, which holds either seconds or an HTTP date. */
export function parseRetryAfter(
  value: string | null,
  now: number = Date.now(),
): number | undefined {
  if (!value) return undefined
  if (/^\d+$/.test(value.trim())) return Number(value.trim())
  const date = Date.parse(value)
  return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - now) / 1000))
}

/** The error for a response that isn't ok, given its parsed body. */
export function errorFromResponse(
  response: Response,
  body: unknown,
  options: UnwrapOptions = {},
): ApiError {
  const { status } = response
  const retryAfter = parseRetryAfter(response.headers.get('Retry-After'))
  if (status >= 500 && !(options.detailOn503 && status === 503)) {
    return new ApiError({ message: en.service.unreachable, status, retryAfter, unavailable: true })
  }
  return new ApiError({ message: detailMessage(body), status, retryAfter })
}

/** The error for a request that never got a response. */
export function networkError(cause: unknown): ApiError {
  return new ApiError({ message: en.service.unreachable, unavailable: true, cause })
}

// DOMException isn't an Error subclass in every environment, so this goes by name.
function isAbort(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError'
  )
}

interface Outcome {
  data?: unknown
  error?: unknown
  response: Response
}

/**
 * The data of an openapi-fetch call, or an ApiError with the learner-facing message.
 *
 *     const qualifications = await unwrap(api.GET('/api/v1/qualifications', { signal }))
 *
 * Cancelled requests are rethrown as they are, so TanStack Query can tell them from failures.
 */
export async function unwrap<T extends Outcome>(
  pending: Promise<T>,
  options: UnwrapOptions = {},
): Promise<Exclude<T['data'], undefined>> {
  let outcome: T
  try {
    outcome = await pending
  } catch (error) {
    if (isAbort(error)) throw error
    throw networkError(error)
  }
  if (!outcome.response.ok) throw errorFromResponse(outcome.response, outcome.error, options)
  return outcome.data as Exclude<T['data'], undefined>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
