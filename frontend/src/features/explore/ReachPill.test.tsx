import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { ReachPill } from './Panels.tsx'
import { useExploreStore } from './useExplore.ts'

beforeEach(() => {
  sessionStorage.clear()
  useExploreStore.getState().reset()
})

describe('the distance pill', () => {
  it('shows the current reach', () => {
    render(<ReachPill />)
    expect(screen.getByRole('button', { name: 'How far can you go? Near me · 10 km' })).toBeInTheDocument()
  })

  it('shows the learner’s own km', () => {
    useExploreStore.getState().setRange(35)
    render(<ReachPill />)
    expect(
      screen.getByRole('button', { name: 'How far can you go? Travel farther · 35 km' }),
    ).toBeInTheDocument()
  })

  it('choosing Travel farther updates the label and closes', async () => {
    const user = userEvent.setup()
    render(<ReachPill />)
    await user.click(screen.getByRole('button', { name: /^How far can you go\?/ }))
    const picker = await screen.findByRole('dialog', { name: 'How far can you go?' })
    await user.click(
      Array.from(picker.querySelectorAll('button')).find((b) => b.textContent?.startsWith('Travel farther'))!,
    )
    expect(useExploreStore.getState()).toMatchObject({ rangeKm: 50, relocate: false })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(
      screen.getByRole('button', { name: 'How far can you go? Travel farther · 50 km' }),
    ).toBeInTheDocument()
  })

  it('relocate reads any distance', async () => {
    useExploreStore.getState().setReach('relocate')
    render(<ReachPill />)
    expect(
      screen.getByRole('button', { name: 'How far can you go? Relocate · Any distance' }),
    ).toBeInTheDocument()
  })
})
