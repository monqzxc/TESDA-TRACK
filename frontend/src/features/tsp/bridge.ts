// The page's side of TSP's Flutter WebView bridge (docs/contracts/tsp-tracker-embed/CONTRACT.md, "Mobile host").
// TSP's app registers a JavaScript channel, window.TspTrackerHost, and answers by calling window.TspTracker.receive
// with a JSON string. This is the only code that knows that transport: the rest of the app asks for a code and
// says how signing in went.

export type ReadyReason = 'initial' | 'reload' | 'session_expired' | 'retry'
export type ErrorCode = 'handoff_expired' | 'unavailable' | 'client_rejected' | 'timeout'
export type CodeResult =
  | { code: string }
  | { failed: 'not_signed_in' | 'unavailable' }
  | { timeout: true }

export interface Bridge {
  /** Sends tsp.tracker.ready with a new nonce and waits for TSP's answer, for at most HANDOFF_TIMEOUT_MS. */
  requestCode(reason: ReadyReason): Promise<CodeResult>
  /** Calls `handler` on tsp.tracker.logout. Returns a function that unsubscribes. */
  onLogout(handler: () => void): () => void
  signedIn(): void
  error(code: ErrorCode): void
  /** Removes window.TspTracker; a code still awaited resolves as a timeout. */
  close(): void
}

declare global {
  interface Window {
    TspTrackerHost?: { postMessage(message: string): void }
    TspTracker?: { receive(json: string): void }
  }
}

export const HANDOFF_TIMEOUT_MS = 10_000
const VERSION = 1
const CODE_MAX_LENGTH = 4096

/** 32 random bytes as base64url without padding: 43 characters, the contract's nonce. */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function parse(json: unknown): Record<string, unknown> | null {
  if (typeof json !== 'string') return null
  try {
    const message: unknown = JSON.parse(json)
    return message && typeof message === 'object' && !Array.isArray(message)
      ? (message as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/**
 * Connects to TSP's app when the page runs inside its WebView, or returns null: a normal browser, a TSP app released
 * before the contract, or the web iframe (host=web), which isn't supported yet. Then the page stays guest-only.
 */
export function connectBridge(win: Window = window, timeoutMs = HANDOFF_TIMEOUT_MS): Bridge | null {
  const host = win.TspTrackerHost
  if (!host || new URLSearchParams(win.location.search).get('host') === 'web') return null

  // Nonces still waiting for TSP's answer. Each settles once: by a handoff, a handoff_failed or its timeout.
  const pending = new Map<string, { settle: (result: CodeResult) => void; timer: ReturnType<typeof setTimeout> }>()
  const logoutHandlers = new Set<() => void>()
  const send = (message: Record<string, unknown>) =>
    host.postMessage(JSON.stringify({ ...message, version: VERSION }))

  const settle = (nonce: string, result: CodeResult) => {
    const waiting = pending.get(nonce)
    if (!waiting) return // unknown, spent or timed out: ignored, as the contract says
    pending.delete(nonce)
    clearTimeout(waiting.timer)
    waiting.settle(result)
  }

  win.TspTracker = {
    receive(json: string) {
      const message = parse(json)
      if (!message || message.version !== VERSION || typeof message.state !== 'string') {
        if (message?.version === VERSION && message.type === 'tsp.tracker.logout') {
          for (const handler of [...logoutHandlers]) handler()
        }
        return
      }
      if (message.type === 'tsp.tracker.handoff') {
        const { code } = message
        if (typeof code === 'string' && code.length > 0 && code.length <= CODE_MAX_LENGTH) {
          settle(message.state, { code })
        }
      } else if (message.type === 'tsp.tracker.handoff_failed') {
        settle(message.state, {
          failed: message.reason === 'not_signed_in' ? 'not_signed_in' : 'unavailable',
        })
      }
    },
  }

  return {
    requestCode(reason) {
      const nonce = newNonce()
      const result = new Promise<CodeResult>((resolve) => {
        const timer = setTimeout(() => settle(nonce, { timeout: true }), timeoutMs)
        pending.set(nonce, { settle: resolve, timer })
      })
      send({ type: 'tsp.tracker.ready', nonce, reason })
      return result
    },
    onLogout(handler) {
      logoutHandlers.add(handler)
      return () => {
        logoutHandlers.delete(handler)
      }
    },
    signedIn: () => send({ type: 'tsp.tracker.signed_in' }),
    error: (code) => send({ type: 'tsp.tracker.error', code }),
    close() {
      if (win.TspTracker) delete win.TspTracker
      for (const nonce of [...pending.keys()]) settle(nonce, { timeout: true })
      logoutHandlers.clear()
    },
  }
}
