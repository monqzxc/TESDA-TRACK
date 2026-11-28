import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { en } from '../../src/copy/en.ts'

// Home, the location-first landing page (Trello: "[UI/UX] Landing page redesign"): every section in both themes, on
// a phone and a desktop, with axe; Get started's two ways in; the goal box, which opens the Career Map; and Home with
// the API down.

const SIZES = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1280, height: 800 },
}

const HEADING = en.pages.home.heading
const copy = en.landingPage
const SECTIONS = [copy.about.title, copy.howItWorks.title, copy.perks.title, copy.closing.title]

for (const [size, viewport] of Object.entries(SIZES)) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`Home on a ${size}, ${colorScheme}: every section, no horizontal scroll, and no axe violations`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1, name: HEADING })).toBeVisible()
      for (const name of SECTIONS) {
        await expect(page.getByRole('heading', { level: 2, name })).toBeAttached()
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        viewport.width,
      )
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
      await page.screenshot({
        path: test.info().outputPath(`home-${size}-${colorScheme}.png`),
        fullPage: true,
      })
    })
  }
}

test('Get started offers Sign in with TSP and Continue as guest, which opens the Career Map', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('banner').getByRole('button', { name: 'Get started' }).click()
  const menu = page.getByRole('dialog', { name: copy.getStarted })
  await expect(menu.getByRole('button')).toHaveCount(3)
  await expect(menu.getByRole('button', { name: /Sign in with TSP/ })).toBeVisible()
  await menu.getByRole('button', { name: /Continue as guest/ }).click()
  await expect(page).toHaveURL(/\/explore$/)
})

test('the goal box opens the Career Map, never /find, and keeps the goal out of the address', async ({
  page,
}) => {
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => route.fulfill({ status: 503, json: { detail: 'down' } }),
  )
  await page.goto('/')
  await page.getByRole('button', { name: copy.hero.submit }).first().click()
  await expect(page.getByRole('textbox', { name: 'What can you do?' })).toHaveAttribute(
    'aria-invalid',
    'true',
  )
  await page.getByRole('textbox', { name: 'What can you do?' }).fill('marunong ako magluto')
  await page.getByRole('button', { name: copy.hero.submit }).first().click()
  await expect(page).toHaveURL(/\/explore$/)
})

test('Home shows with the API down', async ({ page }) => {
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    (route) => route.abort(),
  )
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: HEADING })).toBeVisible()
})

test('Get started can be dismissed with Escape and restores focus', async ({ page }) => {
  await page.goto('/')
  const trigger = page.getByRole('banner').getByRole('button', { name: copy.getStarted })
  await trigger.click()
  await expect(page.getByRole('dialog', { name: copy.getStarted })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: copy.getStarted })).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test('the theme button switches the landing page and the preview respects reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' })
  await page.goto('/')
  await page.getByRole('button', { name: en.theme.dark, exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const preview = page.getByTestId('hero-match-preview')
  await expect(preview.getByRole('textbox')).toHaveAttribute('placeholder', copy.hero.previewQuery)
  await expect(preview.getByRole('img')).toBeVisible()
  expect(
    await page.locator('.landing-hero-map').evaluate((e) => getComputedStyle(e).animationName),
  ).toBe('none')
})

test('the demo repeats without a pause button and respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const box = page.getByRole('textbox', { name: copy.hero.label })
  await expect(box).toHaveAttribute('placeholder', copy.hero.previewQuery)
  const lastRow = page
    .getByTestId('hero-match-preview')
    .getByRole('img')
    .locator(':scope > div')
    .last()
  await expect(lastRow).toHaveCSS('opacity', '1')
  await expect
    .poll(() => box.getAttribute('placeholder'), { timeout: 6500 })
    .not.toBe(copy.hero.previewQuery)
  await expect(page.getByRole('button', { name: copy.pauseAnimations, exact: true })).toHaveCount(0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(box).toHaveAttribute('placeholder', copy.hero.previewQuery)
  await expect(page.locator('.landing-hero-map')).toHaveCSS('animation-name', 'none')
})

// UI-only session fixture: verify the wider signed-in controls without creating an account or using credentials.
for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`signed-in navbar keeps navigation and controls separate at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(() =>
      localStorage.setItem('tesda-track.signed-in', 'navbar-layout-test'),
    )
    await page.route('**/api/v1/me', (route) =>
      route.fulfill({
        json: {
          id: '6f1c2a52-8b7e-4d3a-9c51-2f0e7a1b3c4d',
          full_name: 'Manuel Dela Cruz',
          email: 'manuel@example.com',
          role: 'learner',
          created_at: '2026-10-01T08:00:00Z',
        },
      }),
    )
    await page.goto('/')
    const header = page.getByRole('banner')
    await expect(header.getByRole('button', { name: /Manuel/ })).toBeVisible()
    await expect(header.getByRole('button', { name: copy.openMap, exact: true })).toBeVisible()
    for (const width of viewport.width > 1000 ? [1440, 1366, 1282] : [390, 375, 320]) {
      await page.setViewportSize({ width, height: viewport.height })
      const layout = await header.evaluate((element) => {
        const boxes = [...element.querySelector(':scope > div')!.children]
          .map((child) => child.getBoundingClientRect())
          .filter((box) => box.width && box.height)
        let overlap = false
        for (let i = 0; i < boxes.length; i++)
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i],
              b = boxes[j]
            if (
              Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
              Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
            )
              overlap = true
          }
        return { overlap, width: document.documentElement.scrollWidth }
      })
      expect(layout.overlap).toBe(false)
      expect(layout.width).toBeLessThanOrEqual(width)
    }
    await header.getByRole('button', { name: /Language/ }).click()
    await expect(page.getByRole('option')).toHaveCount(9)
    await page.keyboard.press('Escape')
    await header.getByRole('button', { name: /Manuel/ }).click()
    await expect(page.getByRole('menu')).toBeVisible()
    await page.keyboard.press('Escape')
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  })
}
