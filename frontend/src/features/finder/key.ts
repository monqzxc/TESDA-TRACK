// The finder's storage key, on its own so the AuthProvider can clear the finder's work on sign-out without
// downloading the finder's store (store.ts), which isn't part of the first download.

/** Where the finder keeps the learner's work, in sessionStorage. */
export const FINDER_KEY = 'tesda-track.finder'
