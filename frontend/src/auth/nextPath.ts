import { paths } from '../paths.ts'

// Where /sign-in sends the learner afterwards: ?next=, when it's one of the app's own addresses. Anything else goes
// home, so a link can't use the sign-in page to send a learner to another site (an open redirect).

// Any origin: only used to see whether `next` stays on it.
const PROBE_ORIGIN = 'https://app.invalid'

/** Backslashes and control characters, which browsers drop or read as "/" ("/\evil.com" is "//evil.com"). */
function hasUnsafeCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (character === '\\' || code < 0x20 || code === 0x7f) return true
  }
  return false
}

/**
 * The address in `next` (its path, query and hash) if it's an internal app path, otherwise Home. It must start with
 * a single "/", hold no scheme, backslash or control character, and still be on the app's own origin once a
 * browser has read it.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || hasUnsafeCharacter(next)) {
    return paths.home
  }
  let url: URL
  try {
    url = new URL(next, PROBE_ORIGIN)
  } catch {
    return paths.home
  }
  // Dot segments can still make a "//" path ("/.//evil.com"), which reads as another site.
  if (url.origin !== PROBE_ORIGIN || url.pathname.startsWith('//')) return paths.home
  // Back to the sign-in page would go round in a circle.
  if (url.pathname === paths.signIn) return paths.home
  return `${url.pathname}${url.search}${url.hash}`
}
