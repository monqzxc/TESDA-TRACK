import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// Must match THEME_KEY in src/lib/storage.ts and public/theme-init.js.
const THEME_KEY = 'tesda-track.theme'

type ThemeWrite = { value: string | undefined; bodyExists: boolean; appMounted: boolean }

declare global {
  interface Window {
    themeWrites: ThemeWrite[]
  }
}

// Records every write to data-theme on <html>, from before any of the page's scripts run. A write made before
// <body> exists happens before the first paint.
async function recordThemeWrites(page: Page) {
  await page.addInitScript(() => {
    // Init scripts run before <html> exists, so this watches the whole document for it.
    window.themeWrites = []
    new MutationObserver(() => {
      window.themeWrites.push({
        value: document.documentElement.dataset.theme,
        bodyExists: document.body !== null,
        appMounted: (document.getElementById('root')?.childElementCount ?? 0) > 0,
      })
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-theme'] })
  })
}

async function expectNoFlash(page: Page, theme: 'light' | 'dark') {
  const writes = await page.evaluate(() => window.themeWrites)
  expect(writes.length).toBeGreaterThan(0)
  // The first write comes from theme-init.js, in <head>: before <body> and the app.
  expect(writes[0]).toEqual({ value: theme, bodyExists: false, appMounted: false })
  // The app never shows another theme on the way.
  expect(writes.map((write) => write.value)).toEqual(writes.map(() => theme))
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`follows a ${colorScheme} device with no flash, and passes axe`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    await recordThemeWrites(page)
    await page.goto('/dev/tokens')

    await expect(page.getByRole('heading', { level: 1, name: 'Design tokens' })).toBeVisible()
    await expect(page.getByRole('radio', { name: 'System' })).toBeChecked()
    await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme)
    await expectNoFlash(page, colorScheme)
    await expectAccessible(page)
  })
}

for (const [saved, device] of [
  ['dark', 'light'],
  ['light', 'dark'],
] as const) {
  test(`uses a saved ${saved} choice on a ${device} device with no flash, and passes axe`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: device })
    await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [
      THEME_KEY,
      saved,
    ] as const)
    await recordThemeWrites(page)
    await page.goto('/dev/tokens')

    await expect(
      page.getByRole('radio', { name: saved === 'dark' ? 'Dark' : 'Light' }),
    ).toBeChecked()
    await expectNoFlash(page, saved)
    await expectAccessible(page)
  })
}

test('keeps a theme picked with the keyboard across a reload, with no flash', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await recordThemeWrites(page)
  await page.goto('/dev/tokens')

  await page.getByRole('radio', { name: 'System' }).focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  // The page's colors follow.
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(await background()).toBe('rgb(11, 22, 48)')

  await page.reload()
  await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked()
  await expectNoFlash(page, 'dark')
  expect(await background()).toBe('rgb(11, 22, 48)')

  // Back to System: the device's light theme.
  await page.getByRole('radio', { name: 'Dark' }).focus()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(await background()).toBe('rgb(245, 247, 251)')
})

test('System follows the device while the page is open', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/dev/tokens')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('shows every icon', async ({ page }) => {
  await page.goto('/dev/tokens')
  // 36 named in the gallery, and again in the light and dark previews.
  await expect(page.getByRole('region', { name: 'Icons' }).getByRole('listitem')).toHaveCount(36)
  for (const theme of ['Light', 'Dark']) {
    const preview = page.getByRole('region', { name: theme, exact: true })
    await expect(preview.locator('svg')).toHaveCount(36)
  }
})
