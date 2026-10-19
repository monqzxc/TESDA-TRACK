import { queryOptions } from '@tanstack/react-query'
import { api } from '../api/client.ts'
import { ApiError, unwrap } from '../api/errors.ts'
import type { components } from '../api/schema.d.ts'
import { readItem, removeItem } from '../lib/storage.ts'

// The browser's sign-in: an HttpOnly session cookie that the API sets (POST /api/v1/auth/session) and clears
// (DELETE /api/v1/auth/session). Scripts can't read the cookie, so the app learns who is signed in from GET /api/v1/me.

export type Learner = components['schemas']['LearnerPublic']

export interface Registration {
  fullName: string
  email: string
  password: string
  privacyConsent: boolean
}

/** Who is signed in: the learner, or null when nobody is. */
export const sessionKey = ['session'] as const

/**
 * Queries that hold data belonging to the signed-in account start with one of these keys: the learner's own
 * records under ['me', ...] and administrator data under ['admin', ...]. Signing out, a new sign-in and an expired
 * session remove them all, so nothing from one account is left for the next person on a shared computer.
 */
export const accountQueryKeys = [['me'], ['admin']] as const

/**
 * Set while this browser may hold a session cookie: from a sign-in until a sign-out or a refused cookie. Without it
 * the app doesn't ask the API who is signed in, so Home works without the API and signed-out visits make no
 * account requests. Each sign-in writes a new random value (newSessionHint), so other tabs see every change to the
 * cookie they share (AuthProvider). It says nothing about who signed in.
 */
export const SESSION_HINT_KEY = 'tesda-track.signed-in'

/** A value for SESSION_HINT_KEY that no earlier sign-in wrote: random, and nothing about the learner. */
export function newSessionHint(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

export const sessionQuery = queryOptions<Learner | null, ApiError>({
  queryKey: sessionKey,
  queryFn: async ({ signal }) => {
    const hint = readItem(SESSION_HINT_KEY)
    try {
      return await unwrap(api.GET('/api/v1/me', { signal }))
    } catch (error) {
      // No cookie, or one the API no longer accepts: signed out, which isn't a failure. Later visits needn't ask,
      // unless another tab signed in while this was asking: its hint stays.
      if (error instanceof ApiError && error.status === 401) {
        if (readItem(SESSION_HINT_KEY) === hint) removeItem(SESSION_HINT_KEY)
        return null
      }
      throw error
    }
  },
  // Changed by signing in and out, not by time passing. An ended session shows as a 401 on the next request.
  staleTime: Infinity,
  gcTime: Infinity,
})

/** Signs in with the same form fields as /auth/token. The API sets the session cookie on the response. */
export async function requestSignIn(email: string, password: string): Promise<Learner> {
  const session = await unwrap(
    api.POST('/api/v1/auth/session', {
      body: { username: email, password, scope: '' },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }),
  )
  return session.learner
}

/** The account was created, but signing in straight after failed: the learner should sign in, not register again. */
export class SignInAfterRegistrationError extends Error {
  constructor(cause: unknown) {
    super('Account created; signing in failed', { cause })
    this.name = 'SignInAfterRegistrationError'
  }
}

export async function requestRegistration(details: Registration): Promise<Learner> {
  return unwrap(
    api.POST('/api/v1/auth/register', {
      body: {
        full_name: details.fullName,
        email: details.email,
        password: details.password,
        privacy_consent: details.privacyConsent,
      },
    }),
  )
}

/** Clears the session cookie. The API answers the same whether or not the browser was signed in. */
export async function requestSignOut(): Promise<void> {
  await unwrap(api.DELETE('/api/v1/auth/session'))
}

export async function requestAccountDeletion(): Promise<void> {
  await unwrap(api.DELETE('/api/v1/me'))
}

export type AccountExport = components['schemas']['AccountExport']

/**
 * Everything the API keeps about the learner, for Download my data. It's one of the account's queries (['me']) so
 * that signing out, or in as someone else, cancels it like the others. It isn't kept once it's been used.
 */
export const exportQuery = queryOptions<AccountExport, ApiError>({
  queryKey: ['me', 'export'],
  queryFn: ({ signal }) => unwrap(api.GET('/api/v1/me/export', { signal })),
  staleTime: 0,
  gcTime: 0,
})
