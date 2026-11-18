import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './errors.ts'

const MAX_RETRIES = 2

/** Retry only when the service may come back: a refused request (4xx) fails the same way again. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (globalThis.navigator?.onLine === false) return false
  if (error instanceof ApiError && error.status !== undefined && error.status < 500) return false
  return failureCount < MAX_RETRIES
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      // Let offline requests reach the error state instead of staying paused.
      queries: { networkMode: 'always', retry: shouldRetry, refetchOnWindowFocus: false },
      // Retrying a write is a learner action, even if the connection comes back.
      mutations: { networkMode: 'always', retry: false },
    },
  })
}
