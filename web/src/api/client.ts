import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from './schema.d.ts'

// The typed API client. Paths in the schema already start with /api/v1, and the API is on the same
// origin (Caddy in production, Vite's proxy in development), so the base is the page's own origin.

/** The backend refuses writes signed in by cookie without this header, which other sites can't send. */
const requestedWith: Middleware = {
  onRequest({ request }) {
    request.headers.set('X-Requested-With', 'XMLHttpRequest')
    return request
  },
}

export const api = createClient<paths>({
  baseUrl: globalThis.location.origin,
  credentials: 'same-origin',
  // Look fetch up on every call rather than once, so test servers that replace it (MSW) see requests.
  fetch: (request) => globalThis.fetch(request),
})

api.use(requestedWith)
