// Every page's address, for routes.tsx and the links that open them. Each is relative to the app's base (/beta/
// during the parallel run): the router adds it. The TSP launch route accepts learner hints in its query, then
// removes them from the address before continuing through the finder.
export const paths = {
  home: '/',
  finder: '/find',
  finderMatches: '/find/matches',
  finderReadiness: '/find/readiness',
  finderPathway: '/find/pathway',
  tspWebview: '/tsp/webview',
  qualifications: '/qualifications',
  training: '/training',
  progress: '/progress',
  skills: '/skills',
  reports: '/reports',
  admin: '/admin',
  profile: '/profile',
  signIn: '/sign-in',
  privacy: '/privacy',
} as const
