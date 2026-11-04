import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp, serveCatalog } from '../../test/app.tsx'

const sections = [
  ['/tsp/webview/qualifications', 'Qualifications Library', 'Qualifications'],
  ['/tsp/webview/training', 'Training & Assessment', 'Centers'],
  ['/tsp/webview/skills', 'Skills Explorer', 'Skills'],
] as const

describe('TSP webview sections', () => {
  it.each(sections)('%s stays in the compact webview shell', async (path, heading, current) => {
    serveCatalog()
    renderApp(path)

    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', {
      name: 'TSP webview sections',
    })
    for (const [destination, label] of [['/tsp/webview', 'Find my path'], ...sections.map(([destination, , label]) => [destination, label])]) {
      expect(within(nav).getByRole('link', { name: label })).toHaveAttribute('href', destination)
    }
    expect(within(nav).getByRole('link', { name: current })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
  })
})
