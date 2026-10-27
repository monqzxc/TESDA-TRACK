import { describe, expect, it } from 'vitest'
import { safeNextPath } from './nextPath.ts'

describe('safeNextPath', () => {
  it.each([
    ['/progress', '/progress'],
    ['/find/matches', '/find/matches'],
    [
      '/qualifications?q=welding&sector=Construction',
      '/qualifications?q=welding&sector=Construction',
    ],
    ['/training?region=NCR#map', '/training?region=NCR#map'],
    ['/', '/'],
  ])('keeps the app path %s', (next, expected) => {
    expect(safeNextPath(next)).toBe(expected)
  })

  it.each([
    // Another site, written every way a browser would still follow.
    '//evil.com',
    '//evil.com/progress',
    'https://evil.com',
    'https://evil.com/progress',
    'http:evil.com',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    '/\\evil.com',
    '\\\\evil.com',
    '/\t/evil.com',
    '/\n/evil.com',
    '/.//evil.com',
    ' /progress',
    'progress',
    'evil.com',
    // Nothing, or the sign-in page itself.
    '',
    null,
    undefined,
    '/sign-in',
    '/sign-in?next=/progress',
  ])('sends %j home', (next) => {
    expect(safeNextPath(next)).toBe('/')
  })
})
