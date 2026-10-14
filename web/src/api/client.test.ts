import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../test/server.ts'
import { api, onSignInRequired } from './client.ts'

describe('api', () => {
  it('sends X-Requested-With on every request, to the same origin', async () => {
    const seen: Request[] = []
    server.use(
      http.all('*/api/v1/*', ({ request }) => {
        seen.push(request.clone())
        return HttpResponse.json([])
      }),
    )

    await api.GET('/api/v1/regions')
    await api.POST('/api/v1/me/goals', { body: { title: 'Become an electrician' } })

    expect(seen.map((request) => request.headers.get('X-Requested-With'))).toEqual([
      'XMLHttpRequest',
      'XMLHttpRequest',
    ])
    expect(new URL(seen[0].url).origin).toBe(window.location.origin)
    expect(seen[0].credentials).toBe('same-origin')
  })
})

describe('onSignInRequired', () => {
  it('hears every 401 except a refused sign-in, until it unsubscribes', async () => {
    server.use(
      http.get('*/api/v1/me/goals', () =>
        HttpResponse.json(
          { detail: 'Your session has expired. Please sign in again.' },
          { status: 401 },
        ),
      ),
      http.get('*/api/v1/regions', () => HttpResponse.json([])),
      http.post('*/api/v1/auth/session', () =>
        HttpResponse.json({ detail: 'Incorrect email or password.' }, { status: 401 }),
      ),
    )
    const listener = vi.fn()
    const unsubscribe = onSignInRequired(listener)

    await api.GET('/api/v1/regions')
    await api.POST('/api/v1/auth/session', {
      body: { username: 'maria@example.com', password: 'wrong', scope: '' },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    expect(listener).not.toHaveBeenCalled()

    await api.GET('/api/v1/me/goals')
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    await api.GET('/api/v1/me/goals')
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
