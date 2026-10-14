import { useQuery } from '@tanstack/react-query'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Component, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { qualificationsQuery } from '../api/queries.ts'
import { renderApp } from '../test/app.tsx'
import { bookkeeping } from '../test/fixtures.ts'
import { renderWithQuery } from '../test/query.tsx'
import { server } from '../test/server.ts'
import { QueryBoundary, throwWithoutData } from './QueryBoundary.tsx'

const UNREACHABLE = "We can't reach the TESDA-TRACK service right now. Please try again shortly."

/** The catalog fails the first `failures` times, then answers. */
function catalogThatFails(failures: number) {
  const calls = { count: 0 }
  server.use(
    http.get('*/api/v1/qualifications', () => {
      calls.count++
      return calls.count <= failures ? HttpResponse.error() : HttpResponse.json([bookkeeping])
    }),
  )
  return calls
}

describe('QueryBoundary', () => {
  it("shows the service state in a page when the API can't be reached, and Try again asks again", async () => {
    const user = userEvent.setup()
    const calls = catalogThatFails(1)

    renderApp('/qualifications')

    expect(
      await screen.findByRole('heading', { name: "We can't load TESDA Track right now" }),
    ).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(UNREACHABLE)
    // The page keeps its heading and the sidebar.
    expect(
      screen.getByRole('heading', { level: 1, name: 'Qualifications Library' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(calls.count).toBe(1)

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText(/^Soon you can explore qualifications/)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(calls.count).toBe(2)
  })

  it('shows the state again when Try again fails too', async () => {
    const user = userEvent.setup()
    const calls = catalogThatFails(2)
    renderApp('/training')
    await screen.findByRole('button', { name: 'Try again' })

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(calls.count).toBe(2))
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(UNREACHABLE)
  })

  it("shows the API's own message when it refuses the request", async () => {
    server.use(
      http.get('*/api/v1/qualifications', () =>
        HttpResponse.json({ detail: 'Too many requests. Please wait a moment.' }, { status: 429 }),
      ),
    )

    renderApp('/skills')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many requests. Please wait a moment.',
    )
  })

  it('passes any other error on to the boundary above it', () => {
    // React logs the errors it catches.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    function Broken(): ReactNode {
      throw new Error('a bug')
    }

    renderWithQuery(
      <Outer>
        <QueryBoundary>
          <Broken />
        </QueryBoundary>
      </Outer>,
    )

    expect(screen.getByText('Caught above: a bug')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('keeps data on screen when a refresh fails', async () => {
    server.use(http.get('*/api/v1/qualifications', () => HttpResponse.error()))
    function Catalog() {
      const catalog = useQuery({ ...qualificationsQuery, throwOnError: throwWithoutData })
      return <p>{catalog.data?.length ?? 'none'} in the catalog</p>
    }
    const { client } = renderWithQuery(
      <QueryBoundary>
        <Catalog />
      </QueryBoundary>,
    )
    client.setQueryData(qualificationsQuery.queryKey, [bookkeeping])
    expect(await screen.findByText('1 in the catalog')).toBeInTheDocument()

    await client.refetchQueries({ queryKey: qualificationsQuery.queryKey })

    expect(screen.getByText('1 in the catalog')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })
})

class Outer extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    return this.state.error ? <p>Caught above: {this.state.error.message}</p> : this.props.children
  }
}
