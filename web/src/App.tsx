import { lazy, Suspense } from 'react'
import { QualificationsDemo } from './features/demo/QualificationsDemo.tsx'

// Loaded only when asked for, so the page and its copy of tokens.css stay out of the main bundle.
const TokensPage = lazy(() => import('./features/dev/TokensPage.tsx'))

// Replaced by the router and layout in Task 4.
export default function App() {
  if (window.location.pathname === '/dev/tokens') {
    return (
      <Suspense fallback={null}>
        <TokensPage />
      </Suspense>
    )
  }
  return <QualificationsDemo />
}
