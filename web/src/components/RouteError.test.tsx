import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reloadPage } from '../lib/reload.ts'
import { renderApp, serveCatalog } from '../test/app.tsx'

vi.mock('../lib/reload.ts', () => ({ reloadPage: vi.fn() }))

// The Library's chunk fails to download, as it does offline or after a release replaces the old files.
vi.mock('../features/library/LibraryPage.tsx', () =>
  Promise.reject(new TypeError('Failed to fetch dynamically imported module')),
)

// Training fails as it shows: a bug.
vi.mock('../features/training/TrainingPage.tsx', () => ({
  default: function TrainingPage() {
    throw new Error('Cannot read properties of undefined')
  },
}))

beforeEach(() => {
  vi.mocked(reloadPage).mockClear()
  // React and React Router log the errors they catch.
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

const HEADING = "We can't load TESDA Track right now"

describe('RouteError', () => {
  it.each([
    ['a page that fails to download', '/qualifications'],
    ['a page that fails to show', '/training'],
  ])('takes the place of %s, inside the layout, and Try again reloads', async (_, path) => {
    const user = userEvent.setup()
    serveCatalog()

    renderApp(path)

    expect(await screen.findByRole('heading', { level: 1, name: HEADING })).toBeInTheDocument()
    // The error's own text isn't for learners.
    expect(screen.queryByText(/Failed to fetch|Cannot read/)).not.toBeInTheDocument()
    // The sidebar still works.
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(reloadPage).toHaveBeenCalledOnce()
  })

  it('takes focus when the learner navigates to the page that fails', async () => {
    const user = userEvent.setup()
    serveCatalog()
    renderApp('/skills')
    await screen.findByRole('heading', { level: 1, name: 'Skills Explorer' })
    const sidebar = screen.getByRole('navigation', { name: 'Main' })

    await user.click(within(sidebar).getByRole('link', { name: 'Qualifications Library' }))

    const heading = await screen.findByRole('heading', { level: 1, name: HEADING })
    await waitFor(() => expect(heading).toHaveFocus())
  })

  it('leaves the other pages working', async () => {
    serveCatalog()
    const { router } = renderApp('/training')
    await screen.findByRole('heading', { level: 1, name: HEADING })

    await router.navigate('/progress')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'My Progress' }),
    ).toBeInTheDocument()
  })
})
