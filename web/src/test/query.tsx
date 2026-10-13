import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, renderHook } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'

/** A fresh client per test, without retries, so failures show at once and no cache leaks between tests. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  })
}

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

export function renderWithQuery(ui: ReactElement, client = createTestQueryClient()) {
  return { client, ...render(ui, { wrapper: wrapperFor(client) }) }
}

export function renderHookWithQuery<Result>(hook: () => Result, client = createTestQueryClient()) {
  return { client, ...renderHook(hook, { wrapper: wrapperFor(client) }) }
}
