import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { THEME_KEY } from '../lib/storage.ts'
import { mockColorScheme } from '../test/matchMedia.ts'
import { ThemeProvider, useTheme } from './ThemeProvider.tsx'

function renderTheme() {
  return renderHook(useTheme, { wrapper: ThemeProvider })
}

const html = document.documentElement

beforeEach(() => {
  localStorage.clear()
  delete html.dataset.theme
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('ThemeProvider', () => {
  it('starts on System and follows the device', () => {
    mockColorScheme(true)
    const { result } = renderTheme()
    expect(result.current.choice).toBe('system')
    expect(result.current.resolved).toBe('dark')
    expect(html.dataset.theme).toBe('dark')
    expect(html.style.colorScheme).toBe('dark')
  })

  it('uses the saved choice', () => {
    mockColorScheme(true)
    localStorage.setItem(THEME_KEY, 'light')
    const { result } = renderTheme()
    expect(result.current.choice).toBe('light')
    expect(html.dataset.theme).toBe('light')
  })

  it('ignores a saved value it does not know', () => {
    mockColorScheme(false)
    localStorage.setItem(THEME_KEY, 'sepia')
    const { result } = renderTheme()
    expect(result.current.choice).toBe('system')
    expect(html.dataset.theme).toBe('light')
  })

  it('follows the device live while on System, and stops when a theme is picked', () => {
    const device = mockColorScheme(false)
    const { result } = renderTheme()
    expect(html.dataset.theme).toBe('light')

    act(() => device.setDark(true))
    expect(result.current.resolved).toBe('dark')
    expect(html.dataset.theme).toBe('dark')

    act(() => result.current.setChoice('light'))
    act(() => device.setDark(false))
    act(() => device.setDark(true))
    expect(html.dataset.theme).toBe('light')
  })

  it('saves the choice', () => {
    mockColorScheme(false)
    const { result } = renderTheme()
    act(() => result.current.setChoice('dark'))
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
    expect(html.dataset.theme).toBe('dark')
    act(() => result.current.setChoice('system'))
    expect(localStorage.getItem(THEME_KEY)).toBe('system')
    expect(html.dataset.theme).toBe('light')
  })

  it('still works when storage throws', () => {
    mockColorScheme(false)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    const { result } = renderTheme()
    expect(result.current.choice).toBe('system')
    act(() => result.current.setChoice('dark'))
    expect(result.current.choice).toBe('dark')
    expect(html.dataset.theme).toBe('dark')
  })

  it('treats a browser without matchMedia as light', () => {
    vi.stubGlobal('matchMedia', undefined)
    const { result } = renderTheme()
    expect(result.current.resolved).toBe('light')
  })

  it('stops listening to the device when unmounted', () => {
    const device = mockColorScheme(false)
    const { unmount } = renderTheme()
    expect(device.listenerCount()).toBeGreaterThan(0)
    unmount()
    expect(device.listenerCount()).toBe(0)
  })
})
