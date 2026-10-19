import { useRouteError } from 'react-router'
import { reloadPage } from '../lib/reload.ts'
import { ServiceUnavailable } from './ServiceUnavailable.tsx'

/**
 * A route's errorElement: a page that failed to download (its chunk) or to show. It takes the page's place, inside
 * the layout, so the navigation still works. Try again reloads the app. The error's own text is never shown: it
 * isn't written for learners.
 */
export function RouteError() {
  const error = useRouteError()
  return <ServiceUnavailable error={error} headingLevel={1} onRetry={reloadPage} />
}

/** The root route's errorElement, for a failure in a layout itself: the same state on a page of its own. */
export function RootError() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto max-w-[760px] px-4 py-12 focus:outline-none">
      <RouteError />
    </main>
  )
}
