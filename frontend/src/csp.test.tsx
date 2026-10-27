import { render } from '@testing-library/react'
import { createHash } from 'node:crypto'
import { Button } from 'react-aria-components'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readAppFile } from './test/files.ts'

// The Content Security Policy that frontend/Caddyfile sends with the app.
const policy = () => {
  const header = readAppFile('Caddyfile').match(/Content-Security-Policy "([^"]+)"/)
  if (!header) throw new Error('frontend/Caddyfile has no Content-Security-Policy')
  return header[1]
}
const directive = (name: string) =>
  policy()
    .split(';')
    .map((part) => part.trim().split(/\s+/))
    .find(([key]) => key === name)
    ?.slice(1) ?? []

describe('the Content Security Policy', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('allows the one style element React Aria adds, by its hash', () => {
    // React Aria adds it everywhere but in tests.
    vi.stubEnv('NODE_ENV', 'production')
    render(<Button>Press</Button>)
    const style = document.getElementById('react-aria-pressable-style')
    expect(style).not.toBeNull()

    // After a React Aria upgrade changes it, put the new hash in frontend/Caddyfile.
    const hash = createHash('sha256')
      .update(style?.textContent ?? '')
      .digest('base64')
    expect(directive('style-src')).toContain(`'sha256-${hash}'`)
  })

  it('runs only the site’s own scripts, and index.html has none inline', () => {
    expect(directive('script-src')).toEqual(["'self'"])
    expect(readAppFile('index.html')).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/)
  })
})
