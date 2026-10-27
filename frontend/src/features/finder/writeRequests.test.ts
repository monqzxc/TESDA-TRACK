import { describe, expect, it } from 'vitest'
import { sessionKey } from '../../auth/session.ts'
import { admin, maria } from '../../test/account.tsx'
import { createTestQueryClient } from '../../test/query.tsx'
import { createWriteRequestIds, requireCurrentLearner } from './writeRequests.ts'

describe('finder write receipts', () => {
  it('reuses the failed payload receipt, then replaces it for changed answers or learner', () => {
    const requests = createWriteRequestIds()
    const payload = { code: 'SMAW-NC-II', answers: { 1: 'confident' }, sessionId: 'one' }
    const first = requests.for('readiness', maria.id, payload)
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    expect(requests.for('readiness', maria.id, { ...payload })).toBe(first)
    const changed = requests.for('readiness', maria.id, {
      ...payload,
      answers: { 1: 'not_familiar' },
    })
    expect(changed).not.toBe(first)
    expect(requests.for('readiness', admin.id, payload)).not.toBe(first)
    expect(requests.for('readiness', maria.id, payload)).not.toBe(first)
  })

  it('starts a new receipt after success without clearing another operation or a newer attempt', () => {
    const requests = createWriteRequestIds()
    const first = requests.for('goal', maria.id, { query: 'welder' })
    const changed = requests.for('goal', maria.id, { query: 'cook' })
    const readiness = requests.for('readiness', maria.id, { code: 'COOKERY' })
    requests.complete('goal', first)
    expect(requests.for('goal', maria.id, { query: 'cook' })).toBe(changed)
    requests.complete('goal', changed)
    expect(requests.for('goal', maria.id, { query: 'cook' })).not.toBe(changed)
    expect(requests.for('readiness', maria.id, { code: 'COOKERY' })).toBe(readiness)
  })

  it('refuses a retry after signing out or changing to a different account', () => {
    const client = createTestQueryClient()
    client.setQueryData(sessionKey, maria)
    expect(() => requireCurrentLearner(client, maria.id)).not.toThrow()
    client.setQueryData(sessionKey, admin)
    expect(() => requireCurrentLearner(client, maria.id)).toThrow('Your account changed.')
    client.setQueryData(sessionKey, null)
    expect(() => requireCurrentLearner(client, maria.id)).toThrow('Your account changed.')
  })
})
