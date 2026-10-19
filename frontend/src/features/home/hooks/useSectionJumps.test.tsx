import { act, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type UseSectionJumps = (typeof import('./useSectionJumps.ts'))['useSectionJumps']

// jsdom has no scrollIntoView: this records which elements it's called on.
const scrollIntoView = vi.fn()

/**
 * The hook in a stand-in for Home at /, with a section, and another page at /other. Each test loads the hook afresh,
 * so Home's first showing is the first in the document, as on a page load.
 */
async function openAt(path: string) {
  vi.resetModules()
  const { useSectionJumps } = await import('./useSectionJumps.ts')
  const Home = () => <Page useSectionJumps={useSectionJumps} />
  const router = createMemoryRouter(
    [
      { path: '/', Component: Home },
      { path: '/other', Component: () => <h1>Other</h1> },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return router
}

function Page({ useSectionJumps }: { useSectionJumps: UseSectionJumps }) {
  const { ref, laidOut } = useSectionJumps<HTMLDivElement>()
  return (
    <div ref={ref} data-testid="home" data-laid-out={laidOut || undefined}>
      <section id="catalog" />
    </div>
  )
}

const home = () => screen.getByTestId('home')
const jumpedTo = () => scrollIntoView.mock.contexts

beforeEach(() => {
  scrollIntoView.mockClear()
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  })
})

afterEach(() => {
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
})

describe("Home's first showing in a document", () => {
  it('lays out its sections only as they come near the window', async () => {
    await openAt('/')

    expect(home()).not.toHaveAttribute('data-laid-out')
    expect(jumpedTo()).toEqual([])
  })

  it('lays out the whole page, then scrolls to the section an address names', async () => {
    await openAt('/#catalog')

    expect(home()).toHaveAttribute('data-laid-out')
    expect(jumpedTo()).toEqual([document.getElementById('catalog')])
  })

  it.each([
    ['no section', '/#nowhere'],
    ["something that can't be decoded", '/#%E0%A4%A'],
  ])('leaves the page as it is when the hash names %s', async (_, path) => {
    await openAt(path)

    expect(home()).not.toHaveAttribute('data-laid-out')
    expect(jumpedTo()).toEqual([])
  })

  it('jumps the first time a link names a section, then leaves jumps to ScrollRestoration', async () => {
    const router = await openAt('/')

    await act(() => router.navigate('#catalog'))
    await act(() => router.navigate('/'))
    await act(() => router.navigate('#catalog'))

    expect(home()).toHaveAttribute('data-laid-out')
    expect(jumpedTo()).toHaveLength(1)
  })
})

describe('a later showing', () => {
  it('is laid out from the start, and leaves Back to ScrollRestoration', async () => {
    const router = await openAt('/')
    await act(() => router.navigate('#catalog'))
    scrollIntoView.mockClear()
    await act(() => router.navigate('/other'))
    expect(screen.queryByTestId('home')).toBeNull()

    // Back to the section's entry: ScrollRestoration brings back where the page was.
    await act(() => router.navigate(-1))

    expect(home()).toHaveAttribute('data-laid-out')
    expect(jumpedTo()).toEqual([])
  })

  it('is laid out from the start after a page load elsewhere, too', async () => {
    const router = await openAt('/other')

    await act(() => router.navigate('/'))
    await act(() => router.navigate('/other'))
    await act(() => router.navigate('/#catalog'))

    expect(home()).toHaveAttribute('data-laid-out')
    expect(jumpedTo()).toEqual([])
  })
})
