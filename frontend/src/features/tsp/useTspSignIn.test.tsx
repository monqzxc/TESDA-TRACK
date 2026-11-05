import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { maria } from '../../test/account.tsx'
import { renderApp } from '../../test/app.tsx'
import { server } from '../../test/server.ts'
import { useFinderStore } from '../finder/store.ts'

type Message = { type: string; version: number; nonce?: string; code?: string; reason?: string }

const ana = { ...maria, email: null, full_name: 'Ana Santos' }
const signedIn = () => HttpResponse.json({ learner: ana, expires_in: 28800 })
const consentRequired = () =>
  HttpResponse.json(
    {
      consent_required: true,
      pending_id: 'pending-1',
      summary: { name: 'Ana Santos', keeps: ['skills', 'location'] },
    },
    { status: 202 },
  )
const refused = (code: string, status: number) => () =>
  HttpResponse.json({ detail: 'Refused.', code }, { status })

let sent: Message[]
let order: string[]

const readies = () => sent.filter((message) => message.type === 'tsp.tracker.ready')
const types = () => sent.map((message) => message.type)

/** TSP's app: a channel the page posts to, and calls into the page's receive function. */
function installHost() {
  window.TspTrackerHost = {
    postMessage: (json: string) => {
      const message = JSON.parse(json) as Message
      sent.push(message)
      order.push(message.type)
    },
  }
}

function deliver(message: Record<string, unknown>) {
  window.TspTracker?.receive(JSON.stringify({ version: 1, ...message }))
}

async function answerReady(index: number, code = 'one-time-code') {
  await waitFor(() => expect(readies().length).toBeGreaterThan(index))
  deliver({ type: 'tsp.tracker.handoff', code, state: readies()[index].nonce })
}

function serveTsp({
  session = signedIn,
  consent = signedIn,
  enabled = true,
}: {
  session?: () => Response
  consent?: () => Response
  enabled?: boolean
} = {}) {
  const calls = { session: 0, consent: [] as unknown[] }
  server.use(
    http.get('*/api/v1/client-config', () =>
      HttpResponse.json({
        carto_key: '',
        routing_enabled: false,
        skills_bridge_enabled: false,
        tsp_sign_in: enabled,
      }),
    ),
    http.delete('*/api/v1/auth/session', () => {
      order.push('end-session')
      return new HttpResponse(null, { status: 204 })
    }),
    http.post('*/api/v1/auth/tsp/session', () => {
      calls.session += 1
      return session()
    }),
    http.post('*/api/v1/auth/tsp/consent', async ({ request }) => {
      calls.consent.push(await request.json())
      return consent()
    }),
  )
  return calls
}

beforeEach(() => {
  sent = []
  order = []
  useFinderStore.getState().reset()
  window.sessionStorage.clear()
})

afterEach(() => {
  delete window.TspTrackerHost
  delete window.TspTracker
  vi.useRealTimers()
})

describe('signing in from TSP’s WebView', () => {
  it('stays guest when tsp_sign_in is off or there is no bridge', async () => {
    serveTsp({ enabled: false })
    installHost()
    const first = renderApp('/tsp/webview')
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(sent).toEqual([])
    first.unmount()

    delete window.TspTrackerHost
    serveTsp()
    renderApp('/tsp/webview')
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(order).toEqual([])
  })

  it('ends any session before sending ready', async () => {
    serveTsp()
    installHost()
    renderApp('/tsp/webview')
    await waitFor(() => expect(readies()).toHaveLength(1))
    expect(order.slice(0, 2)).toEqual(['end-session', 'tsp.tracker.ready'])
    expect(readies()[0].reason).toBe('initial')
  })

  it('200 signs in and calls signedIn', async () => {
    const calls = serveTsp()
    installHost()
    renderApp('/tsp/webview')
    await answerReady(0)
    await waitFor(() => expect(types()).toContain('tsp.tracker.signed_in'))
    expect(calls.session).toBe(1)
    expect(screen.queryByText(/without signing in/)).not.toBeInTheDocument()
  })

  it('202 shows consent; accepting signs in', async () => {
    const user = userEvent.setup()
    const calls = serveTsp({ session: consentRequired })
    installHost()
    renderApp('/tsp/webview')
    await answerReady(0)
    expect(
      await screen.findByRole('heading', { name: 'Save your Skill Passport details in TESDA-TRACK?' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Your skills')).toBeInTheDocument()
    expect(screen.getByText('Your province and region')).toBeInTheDocument()
    expect(screen.queryByText('Your education')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Agree and continue' }))
    await waitFor(() => expect(types()).toContain('tsp.tracker.signed_in'))
    expect(calls.consent).toEqual([{ pending_id: 'pending-1', accept: true }])
    expect(screen.queryByRole('heading', { name: /Save your Skill Passport/ })).not.toBeInTheDocument()
  })

  it('declining stays guest', async () => {
    const user = userEvent.setup()
    const calls = serveTsp({
      session: consentRequired,
      consent: () => new HttpResponse(null, { status: 204 }),
    })
    installHost()
    renderApp('/tsp/webview')
    await answerReady(0)
    await user.click(await screen.findByRole('button', { name: 'Not now' }))
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: /Save your Skill Passport/ })).not.toBeInTheDocument(),
    )
    expect(calls.consent).toEqual([{ pending_id: 'pending-1', accept: false }])
    expect(types()).not.toContain('tsp.tracker.signed_in')
    expect(types()).not.toContain('tsp.tracker.error')
  })

  it('handoff_expired retries once, then reports error', async () => {
    serveTsp({ session: refused('handoff_expired', 401) })
    installHost()
    renderApp('/tsp/webview')
    await answerReady(0)
    await answerReady(1)
    await waitFor(() => expect(types()).toContain('tsp.tracker.error'))
    expect(readies().map((ready) => ready.reason)).toEqual(['initial', 'retry'])
    expect(sent.at(-1)).toEqual({ type: 'tsp.tracker.error', version: 1, code: 'handoff_expired' })
    expect(await screen.findByRole('button', { name: 'Sign in again' })).toBeInTheDocument()
  })

  it('client_rejected reports error with no retry button', async () => {
    serveTsp({ session: refused('client_rejected', 503) })
    installHost()
    renderApp('/tsp/webview')
    await answerReady(0)
    expect(await screen.findByText(/without signing in/)).toBeInTheDocument()
    expect(sent.at(-1)).toEqual({ type: 'tsp.tracker.error', version: 1, code: 'client_rejected' })
    expect(readies()).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Sign in again' })).not.toBeInTheDocument()
  })

  it('not_signed_in failure has no retry', async () => {
    serveTsp()
    installHost()
    renderApp('/tsp/webview')
    await waitFor(() => expect(readies()).toHaveLength(1))
    deliver({ type: 'tsp.tracker.handoff_failed', state: readies()[0].nonce, reason: 'not_signed_in' })
    expect(await screen.findByText(/without signing in/)).toBeInTheDocument()
    expect(types()).not.toContain('tsp.tracker.error')
    expect(screen.queryByRole('button', { name: 'Sign in again' })).not.toBeInTheDocument()
  })

  it('timeout reports error and allows retry', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    serveTsp()
    installHost()
    renderApp('/tsp/webview')
    await waitFor(() => expect(readies()).toHaveLength(1))
    vi.advanceTimersByTime(10_000)
    await waitFor(() =>
      expect(sent.at(-1)).toEqual({ type: 'tsp.tracker.error', version: 1, code: 'timeout' }),
    )
    await user.click(await screen.findByRole('button', { name: 'Sign in again' }))
    await waitFor(() => expect(readies()).toHaveLength(2))
    expect(readies()[1].reason).toBe('retry')
  })

  it('logout ends the session and returns to /tsp/webview', async () => {
    serveTsp()
    installHost()
    const { router } = renderApp('/tsp/webview/qualifications')
    await answerReady(0)
    await waitFor(() => expect(types()).toContain('tsp.tracker.signed_in'))
    const ended = order.filter((entry) => entry === 'end-session').length
    deliver({ type: 'tsp.tracker.logout' })
    await waitFor(() => expect(router.state.location.pathname).toBe('/tsp/webview'))
    await waitFor(() =>
      expect(order.filter((entry) => entry === 'end-session').length).toBe(ended + 1),
    )
  })
})
