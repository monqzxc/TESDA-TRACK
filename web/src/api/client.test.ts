import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server } from '../test/server.ts'
import { api } from './client.ts'

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
