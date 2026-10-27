/**
 * Whether learners can sign in or create an account. TESDA-TRACK is guest-only: a later sign-in comes through TSP
 * (TESDA Skills Passport), not accounts of its own. Staff still sign in at /sign-in, which nothing links to, for
 * Reports and Admin. VITE_LEARNER_ACCOUNTS=on brings learner accounts back (the tests turn them on).
 *
 * Read on each call, so a test can change it with vi.stubEnv.
 */
export function learnerAccounts(): boolean {
  return import.meta.env.VITE_LEARNER_ACCOUNTS === 'on'
}
