import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { rememberSignIn, renderWithAuth, serveAccountApi } from '../../test/account.tsx'
import { server } from '../../test/server.ts'
import { useSavedCenters, type SavedCenter } from './savedCenters.ts'

const CENTER = 'training-3'

/** A center's bookmark, as the map's popup and the center card draw it. */
function Bookmark({ qualificationCode }: { qualificationCode: string | null }) {
  const { saved, toggleSaved } = useSavedCenters(qualificationCode)
  return (
    <button type="button" aria-pressed={saved.includes(CENTER)} onClick={() => toggleSaved(CENTER)}>
      Save this center
    </button>
  )
}

/** The saved-centers API for a signed-in learner, holding what they save; every write is recorded. */
function serveSavedCenters() {
  const writes: { method: string; path: string; body: unknown }[] = []
  let saved: SavedCenter[] = []
  server.use(
    http.get('*/api/v1/me/saved-centers', () => HttpResponse.json(saved)),
    http.put('*/api/v1/me/saved-centers/:id', async ({ request, params }) => {
      const body = (await request.json()) as { qualification_code?: string }
      writes.push({ method: 'PUT', path: new URL(request.url).pathname, body })
      saved = [{ center_id: String(params.id) } as SavedCenter]
      return HttpResponse.json(saved[0])
    }),
    http.delete('*/api/v1/me/saved-centers/:id', ({ request }) => {
      writes.push({ method: 'DELETE', path: new URL(request.url).pathname, body: undefined })
      saved = []
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return writes
}

const bookmark = () => screen.getByRole('button', { name: 'Save this center' })

describe('saving a center', () => {
  it('keeps it with the account, with the qualification in view, and can unsave it', async () => {
    rememberSignIn()
    serveAccountApi({ signedIn: true })
    const writes = serveSavedCenters()
    const user = userEvent.setup()
    renderWithAuth(
      <MemoryRouter>
        <Bookmark qualificationCode="SMAW-NC-II" />
      </MemoryRouter>,
    )

    await user.click(bookmark())
    await waitFor(() => expect(bookmark()).toHaveAttribute('aria-pressed', 'true'))
    expect(await screen.findByText('Center saved. You’ll find it in My Progress.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'View saved centers' })).toBeVisible()

    await user.click(bookmark())
    await waitFor(() => expect(bookmark()).toHaveAttribute('aria-pressed', 'false'))
    expect(writes).toEqual([
      {
        method: 'PUT',
        path: `/api/v1/me/saved-centers/${CENTER}`,
        body: { qualification_code: 'SMAW-NC-II' },
      },
      { method: 'DELETE', path: `/api/v1/me/saved-centers/${CENTER}`, body: undefined },
    ])
  })

  it('without a qualification in view, keeps whichever the center was saved with', async () => {
    rememberSignIn()
    serveAccountApi({ signedIn: true })
    const writes = serveSavedCenters()
    const user = userEvent.setup()
    renderWithAuth(
      <MemoryRouter>
        <Bookmark qualificationCode={null} />
      </MemoryRouter>,
    )

    await user.click(bookmark())
    await waitFor(() => expect(bookmark()).toHaveAttribute('aria-pressed', 'true'))
    expect(writes[0].body).toEqual({})
  })

  it('asks a guest to sign in first, and saves nothing until they do', async () => {
    serveAccountApi({ signedIn: false })
    const writes = serveSavedCenters()
    const user = userEvent.setup()
    renderWithAuth(
      <MemoryRouter>
        <Bookmark qualificationCode="SMAW-NC-II" />
      </MemoryRouter>,
    )

    await user.click(bookmark())
    expect(await screen.findByRole('dialog')).toBeVisible()
    // The dialog is modal: the page behind it is hidden from assistive technology meanwhile.
    expect(screen.getByText('Save this center')).toHaveAttribute('aria-pressed', 'false')
    expect(writes).toEqual([])
  })
})
