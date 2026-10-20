import type { ComponentType } from 'react'
import type { RouteObject } from 'react-router'
import { AppLayout, HomeLayout, Root } from './components/Layout.tsx'
import { RootError, RouteError } from './components/RouteError.tsx'
import type { PageKey, RouteHandle } from './lib/navigation.ts'
import { paths } from './paths.ts'

// Every address in the app (the plan's "Pages and addresses"). Each page is its own chunk, downloaded the first
// time it's opened; its handle names its copy in en.pages, which gives the document title.

type PageModule = { default: ComponentType }

// While the first page's chunk downloads, the layout shows with nothing in it yet.
function PageFallback() {
  return null
}

function page(key: PageKey, load: () => Promise<PageModule>) {
  return {
    handle: { page: key } satisfies RouteHandle,
    HydrateFallback: PageFallback,
    lazy: async () => ({ Component: (await load()).default }),
  }
}

const finder = () => import('./features/finder/FinderPage.tsx')

// A design check, at /dev/tokens, left out of production builds.
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: '/dev/tokens',
        HydrateFallback: PageFallback,
        lazy: async () => ({
          Component: (await import('./features/dev/TokensPage.tsx')).default,
        }),
      },
    ]
  : []

export const routes: RouteObject[] = [
  {
    Component: Root,
    // A layout that fails takes the whole page with it.
    ErrorBoundary: RootError,
    children: [
      {
        Component: HomeLayout,
        children: [
          {
            ErrorBoundary: RouteError,
            children: [
              { index: true, ...page('home', () => import('./features/home/HomePage.tsx')) },
            ],
          },
        ],
      },
      {
        Component: AppLayout,
        children: [
          {
            // A page that fails to download or show is replaced by the error state, with the sidebar still there.
            ErrorBoundary: RouteError,
            children: [
              {
                path: paths.finder,
                children: [
                  { index: true, ...page('finderGoal', finder) },
                  { path: paths.finderMatches, ...page('finderMatches', finder) },
                  { path: paths.finderReadiness, ...page('finderReadiness', finder) },
                  { path: paths.finderPathway, ...page('finderPathway', finder) },
                ],
              },
              {
                path: paths.qualifications,
                ...page('qualifications', () => import('./features/library/LibraryPage.tsx')),
              },
              {
                path: paths.training,
                ...page('training', () => import('./features/training/TrainingPage.tsx')),
              },
              {
                path: paths.progress,
                ...page('progress', () => import('./features/progress/ProgressPage.tsx')),
              },
              {
                path: paths.skills,
                ...page('skills', () => import('./features/skills/SkillsPage.tsx')),
              },
              {
                path: paths.reports,
                ...page('reports', () => import('./features/reports/ReportsPage.tsx')),
              },
              {
                path: paths.admin,
                ...page('admin', () => import('./features/admin/AdminPage.tsx')),
              },
              {
                path: paths.signIn,
                ...page('signIn', () => import('./features/account/SignInPage.tsx')),
              },
              {
                path: paths.privacy,
                ...page('privacy', () => import('./features/privacy/PrivacyPage.tsx')),
              },
              {
                path: '*',
                ...page('notFound', () => import('./features/not-found/NotFoundPage.tsx')),
              },
            ],
          },
        ],
      },
      ...devRoutes,
    ],
  },
]

/** The router's basename: the app's base without its trailing slash ("/" in development, "/beta" in Task 18). */
export function basename(base: string = import.meta.env.BASE_URL): string {
  return base.replace(/\/+$/, '') || '/'
}
