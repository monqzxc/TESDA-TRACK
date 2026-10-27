import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { Nav } from './Nav.tsx'

function renderNav(path: string, isAdmin?: boolean, canManage?: boolean) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Nav isAdmin={isAdmin} canManage={canManage} />
    </MemoryRouter>,
  )
  return screen.getByRole('navigation', { name: 'Main' })
}

const linkNames = (nav: HTMLElement) =>
  within(nav)
    .getAllByRole('link')
    .map((link) => link.textContent)

describe('Nav', () => {
  it('lists the sidebar pages without Home, in order', () => {
    const nav = renderNav('/qualifications')

    expect(linkNames(nav)).toEqual([
      'Find my pathway',
      'Qualifications Library',
      'Training & Assessment',
      'My Progress',
      'Skills Explorer',
    ])
    expect(within(nav).getByRole('link', { name: 'Training & Assessment' })).toHaveAttribute(
      'href',
      '/training',
    )
  })

  it.each([
    ['/find', 'Find my pathway'],
    ['/find/readiness', 'Find my pathway'],
    ['/qualifications', 'Qualifications Library'],
    ['/training', 'Training & Assessment'],
    ['/progress', 'My Progress'],
    ['/skills', 'Skills Explorer'],
  ])('marks %s as the current page', (path, current) => {
    const nav = renderNav(path)

    const marked = within(nav)
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page')
    expect(marked.map((link) => link.textContent)).toEqual([current])
  })

  it('marks nothing on a page that is not in it', () => {
    const nav = renderNav('/sign-in')

    for (const link of within(nav).getAllByRole('link')) {
      expect(link).not.toHaveAttribute('aria-current')
    }
  })

  it('hides Reports unless the learner is an administrator', () => {
    expect(linkNames(renderNav('/qualifications'))).not.toContain('Reports')
  })

  it('shows Reports last for administrators', () => {
    const nav = renderNav('/reports', true)

    expect(linkNames(nav).at(-1)).toBe('Reports')
    expect(within(nav).getByRole('link', { name: 'Reports' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('shows Admin only to full administrators', () => {
    expect(linkNames(renderNav('/reports', true))).not.toContain('Admin management')
    cleanup()
    const nav = renderNav('/admin', true, true)
    expect(linkNames(nav).at(-1)).toBe('Admin')
    expect(within(nav).getByRole('link', { name: 'Admin' })).toHaveAttribute('aria-current', 'page')
  })
})
