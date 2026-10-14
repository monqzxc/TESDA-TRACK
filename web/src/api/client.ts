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

type Listener = () => void
const signInRequiredListeners = new Set<Listener>()

// The sign-in routes answer 401 for a wrong email or password. That isn't a session ending.
const SIGN_IN_PATHS: ReadonlySet<string> = new Set(['/api/v1/auth/session', '/api/v1/auth/token'])

/** Tells the listeners about every 401: the request needed a sign-in the browser doesn't have (any more). */
const sessionWatch: Middleware = {
  onResponse({ response, schemaPath }) {
    if (response.status !== 401 || SIGN_IN_PATHS.has(schemaPath)) return undefined
    for (const listener of signInRequiredListeners) listener()
    return undefined
  },
}

/**
 * Calls `listener` whenever the API refuses a request because it needs a valid sign-in (401), so an expired session
 * is noticed in one place (the AuthProvider), whichever request finds it. Returns a function that unsubscribes.
 */
export function onSignInRequired(listener: Listener): () => void {
  signInRequiredListeners.add(listener)
  return () => {
    signInRequiredListeners.delete(listener)
  }
}

export const api = createClient<paths>({
  baseUrl: globalThis.location.origin,
  credentials: 'same-origin',
  // Look fetch up on every call rather than once, so test servers that replace it (MSW) see requests.
  fetch: (request) => globalThis.fetch(request),
})

api.use(requestedWith, sessionWatch)
