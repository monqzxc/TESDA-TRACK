import { QueryClient } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../../test/server.ts'
import { weldingProgram } from '../../test/training.ts'
import { fitQuery } from './api.ts'

describe('program fit evidence', () => {
  it('refreshes after a minute and never reuses another learner’s eligibility', async () => {
    let requests = 0
    server.use(
      http.post('*/api/v1/recommendations/training', () => {
        requests += 1
        return HttpResponse.json({
          results: [],
          requires_verification: [
            { program: weldingProgram, reasons: ['Certificate requires verification'] },
          ],
        })
      }),
    )
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const now = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    const options = { code: 'SMAW-NCII', goal: null, place: null, mode: null, scholarship: false }
    try {
      const fit = await client.fetchQuery(fitQuery({ ...options, learnerId: null }))
      expect(fit.get(weldingProgram.id)).toEqual({
        explanation: ['Certificate requires verification'],
      })
      await client.fetchQuery(fitQuery({ ...options, learnerId: null }))
      expect(requests).toBe(1)
      await client.fetchQuery(fitQuery({ ...options, learnerId: 'learner-1' }))
      expect(requests).toBe(2)
      clock.mockReturnValue(now + 60_001)
      await client.fetchQuery(fitQuery({ ...options, learnerId: 'learner-1' }))
      expect(requests).toBe(3)
    } finally {
      clock.mockRestore()
      client.clear()
    }
  })
})
