import { QueryErrorResetBoundary } from '@tanstack/react-query'
import { Component, type ReactNode } from 'react'
import { ApiError } from '../api/errors.ts'
import { ServiceUnavailable } from './ServiceUnavailable.tsx'

/**
 * Shows the service-unavailable state in place of its children when a request they need fails, and Try again
 * asks for it again. Queries inside opt in with `throwOnError: throwWithoutData` (or use suspense):
 *
 *     <QueryBoundary>
 *       <Catalog />   // useQuery({ ...qualificationsQuery, throwOnError: throwWithoutData })
 *     </QueryBoundary>
 *
 * Only failed requests (ApiError) stop here. Any other error is a bug, and goes on to the route's error boundary.
 */
export function QueryBoundary({ children }: { children: ReactNode }) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => <ApiErrorBoundary onReset={reset}>{children}</ApiErrorBoundary>}
    </QueryErrorResetBoundary>
  )
}

/**
 * For useQuery's throwOnError: send a failure to the nearest QueryBoundary when there's nothing to show. With data
 * already on screen, a failed refresh keeps it.
 */
export function throwWithoutData(_error: unknown, query: { state: { data: unknown } }): boolean {
  return query.state.data === undefined
}

type BoundaryProps = { onReset: () => void; children: ReactNode }
type BoundaryState = { failed: boolean; error: unknown }

class ApiErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false, error: undefined }

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { failed: true, error }
  }

  retry = () => {
    // Lets the failed queries fetch again when the children mount, rather than throw their old error.
    this.props.onReset()
    this.setState({ failed: false, error: undefined })
  }

  render() {
    const { failed, error } = this.state
    if (!failed) return this.props.children
    // Not a failed request: thrown on to the route's error boundary.
    if (!(error instanceof ApiError)) throw error
    return <ServiceUnavailable error={error} onRetry={this.retry} />
  }
}
