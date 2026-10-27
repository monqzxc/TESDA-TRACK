import type { QueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api/errors.ts'
import { sessionKey, type Learner } from '../../auth/session.ts'

/** Keep a failed write's receipt until that payload succeeds or the learner changes it. */
export function createWriteRequestIds() {
  const pending = new Map<string, { key: string; id: string }>()
  return {
    for(operation: string, learnerId: string, payload: unknown): string {
      const key = JSON.stringify([learnerId, payload])
      let request = pending.get(operation)
      if (request?.key !== key) {
        request = { key, id: crypto.randomUUID() }
        pending.set(operation, request)
      }
      return request.id
    },
    complete(operation: string, id: string) {
      if (pending.get(operation)?.id === id) pending.delete(operation)
    },
  }
}

export type WriteRequestIds = ReturnType<typeof createWriteRequestIds>

export function isCurrentLearner(client: QueryClient, learnerId: string | null): boolean {
  return (client.getQueryData<Learner | null>(sessionKey)?.id ?? null) === learnerId
}

/** A retry belonging to an earlier account must never write using the browser's new cookie. */
export function requireCurrentLearner(client: QueryClient, learnerId: string | null): void {
  if (!isCurrentLearner(client, learnerId)) {
    throw new ApiError({
      message:
        'Your account changed. Review this journey and save it again from your current account.',
    })
  }
}
