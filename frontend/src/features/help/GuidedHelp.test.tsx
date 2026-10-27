import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderApp, serveCatalog } from '../../test/app.tsx'

const { startTour, destroy, isActive } = vi.hoisted(() => ({
  startTour: vi.fn(),
  destroy: vi.fn(),
  isActive: vi.fn(() => true),
}))

vi.mock('./startTour.ts', () => ({ startTour }))

beforeEach(() => {
  vi.clearAllMocks()
  startTour.mockReturnValue({ destroy, isActive })
})

describe('guided page help', () => {
  it('starts only when requested and destroys the tour when the page changes', async () => {
    serveCatalog()
    const { router, unmount } = renderApp('/find')
    const trigger = await screen.findByRole('button', { name: 'Help: tour this page' })
    expect(startTour).not.toHaveBeenCalled()

    await userEvent.click(trigger)
    await waitFor(() => expect(startTour).toHaveBeenCalledWith('finderGoal', expect.any(Function)))
    // A second request while the tour is active does not create competing overlays.
    await userEvent.click(trigger)
    expect(startTour).toHaveBeenCalledTimes(1)

    await act(() => router.navigate('/progress'))
    expect(destroy).toHaveBeenCalledTimes(1)
    unmount()
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('returns focus to Help after closing and lets the learner replay the tour', async () => {
    renderApp('/progress')
    const trigger = await screen.findByRole('button', { name: 'Help: tour this page' })
    await userEvent.click(trigger)
    await waitFor(() => expect(startTour).toHaveBeenCalledTimes(1))

    trigger.blur()
    await act(async () => startTour.mock.calls[0][1]())
    expect(trigger).toHaveFocus()

    await userEvent.click(trigger)
    await waitFor(() => expect(startTour).toHaveBeenCalledTimes(2))
  })

  it('explains a loading failure and allows another attempt', async () => {
    startTour.mockImplementationOnce(() => {
      throw new Error('Help chunk unavailable')
    })
    renderApp('/progress')
    const trigger = await screen.findByRole('button', { name: 'Help: tour this page' })
    await userEvent.click(trigger)

    expect(await screen.findByText(/We couldn.t load the guide/)).toBeVisible()
    expect(trigger).not.toHaveAttribute('aria-busy')
    await userEvent.click(trigger)
    await waitFor(() => expect(startTour).toHaveBeenCalledTimes(2))
  })

  it('leaves an open modal in charge of focus', async () => {
    renderApp('/progress')
    const trigger = await screen.findByRole('button', { name: 'Help: tour this page' })
    const modal = document.createElement('div')
    modal.setAttribute('aria-modal', 'true')
    document.body.append(modal)
    try {
      fireEvent.click(trigger)
      await waitFor(() => expect(trigger).not.toHaveAttribute('aria-busy'))
      expect(startTour).not.toHaveBeenCalled()
    } finally {
      modal.remove()
    }
  })

  it('stops an active tour when a delayed modal opens and preserves that modal focus', async () => {
    renderApp('/progress')
    const trigger = await screen.findByRole('button', { name: 'Help: tour this page' })
    await userEvent.click(trigger)
    await waitFor(() => expect(startTour).toHaveBeenCalledTimes(1))

    const modal = document.createElement('div')
    // React Aria's real dialogs use a role and focus scope without aria-modal.
    modal.setAttribute('role', 'dialog')
    const action = document.createElement('button')
    action.textContent = 'I understand'
    modal.append(action)
    try {
      document.body.append(modal)
      action.focus()
      await waitFor(() => expect(destroy).toHaveBeenCalledTimes(1))
      await act(async () => startTour.mock.calls[0][1]())
      expect(action).toHaveFocus()
    } finally {
      modal.remove()
    }
  })
})
