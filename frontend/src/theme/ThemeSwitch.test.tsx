import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { THEME_KEY } from '../lib/storage.ts'
import { mockColorScheme } from '../test/matchMedia.ts'
import { ThemeProvider } from './ThemeProvider.tsx'
import { ThemeSwitch } from './ThemeSwitch.tsx'

function renderSwitch() {
  render(
    <ThemeProvider>
      <ThemeSwitch />
    </ThemeProvider>,
  )
}

const html = document.documentElement

beforeEach(() => {
  localStorage.clear()
  delete html.dataset.theme
  mockColorScheme(false)
})
afterEach(() => vi.unstubAllGlobals())

describe('ThemeSwitch', () => {
  it('is a named radio group with System selected by default', () => {
    renderSwitch()
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument()
    expect(screen.getAllByRole('radio').map((radio) => radio.getAttribute('value'))).toEqual([
      'system',
      'light',
      'dark',
    ])
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked()
  })

  it('sets the theme on click', async () => {
    const user = userEvent.setup()
    renderSwitch()
    await user.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked()
    expect(html.dataset.theme).toBe('dark')
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
  })

  it('works with the keyboard', async () => {
    const user = userEvent.setup()
    renderSwitch()

    await user.tab()
    expect(screen.getByRole('radio', { name: 'System' })).toHaveFocus()

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveFocus()
    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked()
    expect(html.dataset.theme).toBe('light')

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked()
    expect(html.dataset.theme).toBe('dark')

    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked()
    expect(html.dataset.theme).toBe('light')
  })

  it('shows the saved choice', () => {
    localStorage.setItem(THEME_KEY, 'dark')
    renderSwitch()
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked()
  })
})
