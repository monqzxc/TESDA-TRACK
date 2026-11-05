import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectBridge, newNonce, type Bridge } from './bridge.ts'

interface Sent {
  type: string
  version: number
  nonce?: string
  reason?: string
  code?: string
}

let sent: Sent[]
let bridge: Bridge | null

function fakeHost(search = '') {
  sent = []
  const win = window as Window
  win.TspTrackerHost = { postMessage: (json: string) => sent.push(JSON.parse(json) as Sent) }
  window.history.replaceState(null, '', `/tsp/webview${search}`)
  return win
}

/** What TSP's app does: call the page's receive function with a JSON string. */
function receive(message: unknown) {
  window.TspTracker?.receive(typeof message === 'string' ? message : JSON.stringify(message))
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  bridge?.close()
  bridge = null
  delete (window as Window).TspTrackerHost
  vi.useRealTimers()
})

describe('TSP WebView bridge', () => {
  it('returns null without the TspTrackerHost channel', () => {
    delete (window as Window).TspTrackerHost
    expect(connectBridge(window)).toBeNull()
  })

  it('returns null for host=web', () => {
    expect(connectBridge(fakeHost('?host=web'))).toBeNull()
  })

  it('installs TspTracker.receive before sending ready', () => {
    const win = fakeHost()
    const host = win.TspTrackerHost!
    host.postMessage = (json: string) => {
      expect(typeof window.TspTracker?.receive).toBe('function')
      sent.push(JSON.parse(json) as Sent)
    }
    bridge = connectBridge(win)
    void bridge!.requestCode('initial')
    expect(sent).toEqual([
      { type: 'tsp.tracker.ready', version: 1, nonce: expect.any(String), reason: 'initial' },
    ])
  })

  it('nonce is 43 base64url characters', () => {
    const nonces = new Set(Array.from({ length: 20 }, newNonce))
    expect(nonces.size).toBe(20)
    for (const nonce of nonces) expect(nonce).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('resolves with the code for the matching nonce', async () => {
    bridge = connectBridge(fakeHost())
    const result = bridge!.requestCode('initial')
    receive({ type: 'tsp.tracker.handoff', version: 1, code: 'one-time', state: sent[0].nonce })
    await expect(result).resolves.toEqual({ code: 'one-time' })
  })

  it('accepts each nonce once', async () => {
    bridge = connectBridge(fakeHost())
    const first = bridge!.requestCode('initial')
    const handoff = { type: 'tsp.tracker.handoff', version: 1, code: 'one-time', state: sent[0].nonce }
    receive(handoff)
    await expect(first).resolves.toEqual({ code: 'one-time' })
    const second = bridge!.requestCode('retry')
    receive(handoff) // replayed: the old nonce is spent
    vi.advanceTimersByTime(10_000)
    await expect(second).resolves.toEqual({ timeout: true })
  })

  it('ignores a handoff for an unknown nonce', async () => {
    bridge = connectBridge(fakeHost())
    const result = bridge!.requestCode('initial')
    receive({ type: 'tsp.tracker.handoff', version: 1, code: 'one-time', state: newNonce() })
    vi.advanceTimersByTime(10_000)
    await expect(result).resolves.toEqual({ timeout: true })
  })

  it('ignores a late handoff', async () => {
    bridge = connectBridge(fakeHost())
    const result = bridge!.requestCode('initial')
    const nonce = sent[0].nonce
    vi.advanceTimersByTime(10_000)
    await expect(result).resolves.toEqual({ timeout: true })
    const next = bridge!.requestCode('retry')
    receive({ type: 'tsp.tracker.handoff', version: 1, code: 'late', state: nonce })
    receive({ type: 'tsp.tracker.handoff', version: 1, code: 'fresh', state: sent[1].nonce })
    await expect(next).resolves.toEqual({ code: 'fresh' })
  })

  it('ignores malformed JSON and other versions', async () => {
    bridge = connectBridge(fakeHost())
    const result = bridge!.requestCode('initial')
    receive('{not json')
    receive({ type: 'tsp.tracker.handoff', version: 2, code: 'v2', state: sent[0].nonce })
    receive({ type: 'tsp.tracker.handoff', version: '1', code: 'string', state: sent[0].nonce })
    receive({ type: 'tsp.tracker.handoff', version: 1, code: '', state: sent[0].nonce })
    receive({ type: 'tsp.tracker.handoff', version: 1, code: 'ok', state: sent[0].nonce })
    await expect(result).resolves.toEqual({ code: 'ok' })
  })

  it('handoff_failed resolves failed', async () => {
    bridge = connectBridge(fakeHost())
    const result = bridge!.requestCode('initial')
    receive({ type: 'tsp.tracker.handoff_failed', version: 1, state: sent[0].nonce, reason: 'not_signed_in' })
    await expect(result).resolves.toEqual({ failed: 'not_signed_in' })
  })

  it('logout calls the handler', () => {
    bridge = connectBridge(fakeHost())
    const onLogout = vi.fn()
    const stop = bridge!.onLogout(onLogout)
    receive({ type: 'tsp.tracker.logout', version: 1 })
    expect(onLogout).toHaveBeenCalledTimes(1)
    stop()
    receive({ type: 'tsp.tracker.logout', version: 1 })
    expect(onLogout).toHaveBeenCalledTimes(1)
  })

  it('signedIn and error post the right messages', () => {
    bridge = connectBridge(fakeHost())
    bridge!.signedIn()
    bridge!.error('client_rejected')
    expect(sent).toEqual([
      { type: 'tsp.tracker.signed_in', version: 1 },
      { type: 'tsp.tracker.error', version: 1, code: 'client_rejected' },
    ])
  })

  it('close removes TspTracker and settles what is pending', async () => {
    bridge = connectBridge(fakeHost())
    const result = bridge!.requestCode('initial')
    bridge!.close()
    expect(window.TspTracker).toBeUndefined()
    await expect(result).resolves.toEqual({ timeout: true })
  })
})
