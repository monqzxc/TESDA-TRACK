import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './server.ts'

// Pages are downloaded when they're first opened (routes.tsx). In a full parallel run, the first test to open a
// page waits for its code to be transformed, which can take several seconds on a busy machine or a CI runner,
// well past findBy*'s default second. vite.config.ts gives each test room for it (testTimeout).
configure({ asyncUtilTimeout: 10_000 })

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
// jsdom doesn't scroll. React Router's ScrollRestoration calls this on every navigation, and pages bring their
// results into view with scrollIntoView.
window.scrollTo = () => {}
Element.prototype.scrollIntoView = () => {}
afterEach(() => {
  cleanup()
  server.resetHandlers()
})
afterAll(() => server.close())
