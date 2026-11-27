import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// Home, the location-first landing page (Trello: "[UI/UX] Landing page redesign"): every section in both themes, on
// a phone and a desktop, with axe; Get started's two ways in; the goal box, which opens the Career Map; and Home with
// the API down.

const SIZES = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1280, height: 800 },
}

const HEADING = 'Your next TESDA step, on a map near you.'
const SECTIONS = [
  'One map for your next step.',
  'Four steps. One map.',
  'Free, local, in your words.',
  'Ready for your next step?',
]

for (const [size, viewport] of Object.entries(SIZES)) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`Home on a ${size}, ${colorScheme}: every section, no horizontal scroll, and no axe violations`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ colorScheme })
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
  const menu = page.getByRole('menu')
  await expect(menu.getByRole('menuitem')).toHaveCount(2)
  await expect(menu.getByRole('menuitem', { name: /Sign in with TSP/ })).toBeVisible()
  await menu.getByRole('menuitem', { name: /Continue as guest/ }).click()
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
  await page.getByRole('button', { name: 'Find my path' }).first().click()
  await expect(page.getByRole('textbox', { name: 'What can you do?' })).toHaveAttribute(
    'aria-invalid',
    'true',
  )
  await page.getByRole('textbox', { name: 'What can you do?' }).fill('marunong ako magluto')
  await page.getByRole('button', { name: 'Find my path' }).first().click()
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
