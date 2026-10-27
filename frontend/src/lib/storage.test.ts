import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readAppFile } from '../test/files.ts'
import { mockColorScheme } from '../test/matchMedia.ts'
import { readItem, THEME_KEY, writeItem } from './storage.ts'

const themeInit = readAppFile('public/theme-init.js')

function runThemeInit() {
  // The same file index.html loads before the first paint.
  new Function(themeInit)()
  return document.documentElement.dataset.theme
}

beforeEach(() => {
  localStorage.clear()
  delete document.documentElement.dataset.theme
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('storage', () => {
  it('reads back what it wrote', () => {
    writeItem(THEME_KEY, 'dark')
    expect(readItem(THEME_KEY)).toBe('dark')
  })

  it('treats storage that throws as empty', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    expect(() => writeItem(THEME_KEY, 'dark')).not.toThrow()
    expect(readItem(THEME_KEY)).toBeNull()
  })
})

describe('public/theme-init.js', () => {
  it('uses the same storage key as the app', () => {
    expect(themeInit).toContain(`'${THEME_KEY}'`)
  })

  it('applies a saved choice over the device setting', () => {
    mockColorScheme(true)
    localStorage.setItem(THEME_KEY, 'light')
    expect(runThemeInit()).toBe('light')
    expect(document.documentElement.style.colorScheme).toBe('light')
  })

  it('follows the device for System, or when nothing is saved', () => {
    mockColorScheme(true)
    expect(runThemeInit()).toBe('dark')
    localStorage.setItem(THEME_KEY, 'system')
    expect(runThemeInit()).toBe('dark')
    mockColorScheme(false)
    expect(runThemeInit()).toBe('light')
  })

  it('still sets a theme when storage throws', () => {
    mockColorScheme(true)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(runThemeInit()).toBe('dark')
  })
})
