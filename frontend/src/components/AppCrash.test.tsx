import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { reloadPage } from '../lib/reload.ts'
import { readAppFile } from '../test/files.ts'
import { AppCrash } from './AppCrash.tsx'

vi.mock('../lib/reload.ts', () => ({ reloadPage: vi.fn() }))

function Broken(): never {
  throw new Error('a provider failed')
}

describe('AppCrash', () => {
  it('shows its children while nothing fails', () => {
    render(
      <AppCrash>
        <p>The app</p>
      </AppCrash>,
    )
    expect(screen.getByText('The app')).toBeInTheDocument()
  })

  it('shows a message, not an empty page, when the app fails outside the routes, and Try again reloads', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()
    render(
      <AppCrash>
        <Broken />
      </AppCrash>,
    )

    expect(
      screen.getByRole('heading', { level: 1, name: "We can't load TESDA Track right now" }),
    ).toBeInTheDocument()
    expect(screen.queryByText('a provider failed')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(reloadPage).toHaveBeenCalledOnce()
  })
})

describe('index.html', () => {
  it("has a message in #root for when the app can't start, styled by a file of its own", () => {
    const html = readAppFile('index.html')
    expect(html).toMatch(/<div id="root">\s*<!--[\s\S]*?-->\s*<main class="app-fallback app-fallback-delayed">/)
    expect(html).toContain('TESDA Track is taking a while to load')
    expect(html).toContain('<link rel="stylesheet" href="/app-fallback.css" />')
    expect(readAppFile('public/app-fallback.css')).toContain('.app-fallback-delayed')
  })
})
