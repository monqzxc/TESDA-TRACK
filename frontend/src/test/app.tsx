import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
// From react-router itself, not react-router/dom as in App.tsx: under Vitest the two entry points load separate
// copies of the router's context.
import { createMemoryRouter, RouterProvider } from 'react-router'
import { AuthProvider } from '../auth/AuthProvider.tsx'
import { routes } from '../routes.tsx'
import { ThemeProvider } from '../theme/ThemeProvider.tsx'
import { bookkeeping, electrical } from './fixtures.ts'
import { createTestQueryClient } from './query.tsx'
import { server } from './server.ts'

/** The whole app at an address: the real routes and layouts, in memory, with a fresh query client. */
export function renderApp(path: string, client: QueryClient = createTestQueryClient()) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const view = render(
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>,
  )
  return { router, client, ...view }
}

/** Answers the catalog request that every page but Home makes, and counts the requests. */
export function serveCatalog() {
  const calls = { count: 0 }
  server.use(
    http.get('*/api/v1/qualifications', () => {
      calls.count++
      return HttpResponse.json([bookkeeping, electrical])
    }),
  )
  return calls
}
