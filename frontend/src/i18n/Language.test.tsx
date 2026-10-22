import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFinderStore } from '../features/finder/store.ts'
import { renderApp, serveCatalog } from '../test/app.tsx'
import { getCopy, setLanguage } from './copy.ts'
import { LANGUAGE_KEY, languages } from './languages.ts'
import { LanguageProvider } from './LanguageProvider.tsx'
import { LanguageSelector } from './LanguageSelector.tsx'

beforeEach(() => {
  setLanguage('en')
  serveCatalog()
})

afterEach(() => {
  act(() => setLanguage('en'))
  localStorage.removeItem(LANGUAGE_KEY)
  useFinderStore.getState().reset()
  vi.restoreAllMocks()
})

describe('language selection', () => {
  it('lets a first-time visitor choose a language before accepting the privacy notice', async () => {
    const user = userEvent.setup()
    renderApp('/find', undefined, { firstVisit: true })
    const notice = await screen.findByRole('dialog', { name: 'Your privacy on TESDA Track' })
    await user.selectOptions(within(notice).getByRole('combobox', { name: 'Language / Wika' }), 'tl')
    expect(notice).not.toHaveAccessibleName('Your privacy on TESDA Track')
    expect(within(notice).getByRole('combobox')).toHaveValue('tl')
  })

  it('updates the actual learner page, navigation and title without clearing a typed goal', async () => {
    const user = userEvent.setup()
    renderApp('/find')
    const goal = await screen.findByRole('textbox', { name: 'Or tell us in your own words' })
    await user.click(goal)
    await user.paste('I want to repair computers {1}')
    const selector = screen.getByRole('combobox', { name: 'Language / Wika' })
    await user.selectOptions(selector, 'tl')
    expect(
      await screen.findByRole('link', { name: 'Hanapin ang aking landas' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Aklatan ng mga Kwalipikasyon' })).toBeInTheDocument()
    expect(goal).toHaveValue('I want to repair computers {1}')
    expect(localStorage.getItem(LANGUAGE_KEY)).toBe('tl')
    await waitFor(() => expect(document.title).not.toContain('Your goal'))

    await user.selectOptions(selector, 'pam')
    expect(await screen.findByRole('link', { name: 'Alapan ing dalan ku' })).toBeInTheDocument()
    expect(goal).toHaveValue('I want to repair computers {1}')
    await user.selectOptions(selector, 'en')
    expect(screen.getByRole('link', { name: 'Find my pathway' })).toBeInTheDocument()
    expect(goal).toHaveValue('I want to repair computers {1}')
  })

  it('offers every agreed language and updates document language and both mounted selectors', async () => {
    const user = userEvent.setup()
    render(
      <LanguageProvider>
        <LanguageSelector />
        <LanguageSelector header />
      </LanguageProvider>,
    )
    const [first, second] = screen.getAllByRole('combobox', { name: 'Language / Wika' })
    expect(first.querySelectorAll('option')).toHaveLength(9)
    for (const { code } of languages) {
      await user.selectOptions(first, code)
      expect(second).toHaveValue(code)
      expect(document.documentElement.lang).toBe(code)
      if (code !== 'en') expect(getCopy().nav.finder).not.toBe('Find my pathway')
    }
  })

  it('synchronizes another tab and rejects unknown saved language values', () => {
    render(<LanguageSelector />)
    act(() =>
      window.dispatchEvent(new StorageEvent('storage', { key: LANGUAGE_KEY, newValue: 'ceb' })),
    )
    expect(screen.getByRole('combobox')).toHaveValue('ceb')
    act(() =>
      window.dispatchEvent(new StorageEvent('storage', { key: LANGUAGE_KEY, newValue: 'unknown' })),
    )
    expect(screen.getByRole('combobox')).toHaveValue('en')
  })

  it('still switches when browser storage is unavailable', async () => {
    const user = userEvent.setup()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Blocked')
    })
    render(<LanguageSelector />)
    await user.selectOptions(screen.getByRole('combobox'), 'pam')
    expect(screen.getByRole('combobox')).toHaveValue('pam')
    expect(getCopy().nav.finder).toBe('Alapan ing dalan ku')
  })
})
