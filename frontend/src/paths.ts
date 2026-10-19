// Every page's address, for routes.tsx and the links that open them. Each is relative to the app's base (/beta/
// during the parallel run): the router adds it. Learner input (goals, locations) never goes into an address.
export const paths = {
  home: '/',
  finder: '/find',
  finderMatches: '/find/matches',
  finderReadiness: '/find/readiness',
  finderPathway: '/find/pathway',
  qualifications: '/qualifications',
  training: '/training',
  progress: '/progress',
  skills: '/skills',
  reports: '/reports',
  signIn: '/sign-in',
  privacy: '/privacy',
} as const
