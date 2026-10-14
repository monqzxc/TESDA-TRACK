/**
 * Downloads a lazily loaded part of the app ahead of need, e.g. on hover. A failure says nothing here: it's shown if
 * the learner opens that part, by the error boundary around it (LoadBoundary).
 */
export function prefetch(load: () => Promise<unknown>): void {
  load().catch(() => undefined)
}
