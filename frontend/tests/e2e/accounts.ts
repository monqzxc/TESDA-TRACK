// TESDA-TRACK ships guest-only (src/auth/accounts.ts). The dev server Playwright starts reads the same variable, so
// a run with VITE_LEARNER_ACCOUNTS=on tests learner accounts, and one without it tests the guest-only app.
export const learnerAccounts = process.env.VITE_LEARNER_ACCOUNTS === 'on'

export const NO_LEARNER_ACCOUNTS =
  'Learner accounts are off (guest-only); run with VITE_LEARNER_ACCOUNTS=on'
