import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp, serveCatalog } from '../../test/app.tsx'

const sections = [
  ['/tsp/webview', 'Find your TESDA pathway', 'Pathways'],
  ['/tsp/webview/qualifications', 'Qualifications Library', 'Qualification Library'],
  ['/tsp/webview/training', 'Training & Assessment', 'Training & Assessment'],
  ['/tsp/webview/skills', 'Skills Explorer', 'Skill Explorer'],
] as const

describe('TSP webview sections', () => {
  it.each(sections)('%s stays in the compact webview shell', async (path, heading, current) => {
    serveCatalog()
    renderApp(path)

    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument()
    const nav = screen.getByRole('navigation', {
      name: 'TSP webview sections',
    })
    for (const [destination, , label] of sections) {
      expect(within(nav).getByRole('link', { name: label })).toHaveAttribute('href', destination)
    }
    expect(within(nav).getByRole('link', { name: current })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument()
  })
})
