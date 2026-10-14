import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './server.ts'

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }))
// jsdom doesn't scroll. React Router's ScrollRestoration calls this on every navigation.
window.scrollTo = () => {}
afterEach(() => {
  cleanup()
  server.resetHandlers()
})
afterAll(() => server.close())
