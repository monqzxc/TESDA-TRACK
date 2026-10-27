import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { useFinderStore } from '../features/finder/store.ts'
import { renderApp, serveCatalog } from '../test/app.tsx'
import { serveFinderApi, welderProfile } from '../test/finder.ts'

afterEach(() => {
  useFinderStore.getState().reset()
  window.sessionStorage.clear()
})

async function openPage(path: string, heading: string) {
  serveCatalog()
  const app = renderApp(path)
  const h1 = await screen.findByRole('heading', { level: 1, name: heading })
  return { ...app, h1 }
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  const button = screen.getByRole('button', { name: 'Menu' })
  expect(button).toHaveAttribute('aria-expanded', 'false')
  await user.click(button)
  const dialog = await screen.findByRole('dialog', { name: 'Menu' })
  return { button, dialog }
}

describe('the phone menu', () => {
  it('opens the sidebar in a dialog, and Escape closes it and returns focus to the button', async () => {
    const user = userEvent.setup()
    await openPage('/qualifications', 'Qualifications Library')

    const { button, dialog } = await openMenu(user)

    expect(dialog).toContainElement(document.activeElement as HTMLElement)
    expect(within(dialog).getByRole('link', { name: 'Qualifications Library' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(dialog).getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(within(dialog).getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('link', { name: 'Privacy policy' })).not.toBeInTheDocument()

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(button).toHaveFocus())
  })

  it('keeps focus inside while it is open', async () => {
    const user = userEvent.setup()
    await openPage('/training', 'Training & Assessment')
    const { dialog } = await openMenu(user)

    // More Tabs than there are things to focus in the menu: focus comes round again, inside it.
    for (let i = 0; i < 15; i++) {
      await user.tab()
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
    }
  })

  it('closes with its close button', async () => {
    const user = userEvent.setup()
    await openPage('/skills', 'Skills Explorer')
    const { button, dialog } = await openMenu(user)

    await user.click(within(dialog).getByRole('button', { name: 'Close menu' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(button).toHaveFocus())
  })

  it('closes when a page is chosen, and focus goes to that page', async () => {
    const user = userEvent.setup()
    await openPage('/qualifications', 'Qualifications Library')
    const { dialog } = await openMenu(user)

    await user.click(within(dialog).getByRole('link', { name: 'Training & Assessment' }))

    const h1 = await screen.findByRole('heading', { level: 1, name: 'Training & Assessment' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(h1).toHaveFocus())
  })

  it('closes when the page already open is chosen', async () => {
    const user = userEvent.setup()
    await openPage('/qualifications', 'Qualifications Library')
    const { button, dialog } = await openMenu(user)

    await user.click(within(dialog).getByRole('link', { name: 'Qualifications Library' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(button).toHaveFocus())
  })
})

describe('Skip to content', () => {
  it.each([
    ['/', 'Every career has a track. Find yours.'],
    ['/qualifications', 'Qualifications Library'],
  ])('is the first Tab stop on %s, and moves focus to the page', async (path, heading) => {
    const user = userEvent.setup()
    await openPage(path, heading)

    await user.tab()
    const skip = screen.getByRole('link', { name: 'Skip to content' })
    expect(skip).toHaveFocus()

    await user.keyboard('{Enter}')

    expect(screen.getByRole('main')).toHaveFocus()
  })
})

describe('focus on navigation', () => {
  it('stays put on the first load', async () => {
    const { h1 } = await openPage('/qualifications', 'Qualifications Library')

    expect(h1).not.toHaveFocus()
    expect(document.body).toHaveFocus()
  })

  it("moves to the new page's heading, and back on Back", async () => {
    const user = userEvent.setup()
    const { router } = await openPage('/qualifications', 'Qualifications Library')
    const sidebar = screen.getByRole('navigation', { name: 'Main' })

    await user.click(within(sidebar).getByRole('link', { name: 'Training & Assessment' }))

    const training = await screen.findByRole('heading', { level: 1, name: 'Training & Assessment' })
    await waitFor(() => expect(training).toHaveFocus())

    await router.navigate(-1)

    const library = await screen.findByRole('heading', { level: 1, name: 'Qualifications Library' })
    await waitFor(() => expect(library).toHaveFocus())
  })

  it('moves between the finder steps', async () => {
    // The later steps need a goal.
    serveFinderApi()
    useFinderStore.getState().begin({
      query: 'I want to be a welder.',
      profile: welderProfile,
      sessionId: null,
      sessionOwner: null,
    })
    const { router } = await openPage('/find', 'Find my pathway')

    await router.navigate('/find/matches')

    expect(await screen.findByRole('heading', { level: 2, name: 'Your match' })).toBeInTheDocument()
    const h1 = screen.getByRole('heading', { level: 1, name: 'Find my pathway' })
    await waitFor(() => expect(h1).toHaveFocus())
  })

  it('stays put when only the query changes', async () => {
    const user = userEvent.setup()
    const { router } = await openPage('/qualifications', 'Qualifications Library')
    const sidebar = screen.getByRole('navigation', { name: 'Main' })
    const link = within(sidebar).getByRole('link', { name: 'Skills Explorer' })
    // Focus something on the page, then change only the query, as a filter will.
    link.focus()

    await router.navigate('/qualifications?sector=Construction')
    await user.keyboard('{Shift}')

    expect(link).toHaveFocus()
  })
})
