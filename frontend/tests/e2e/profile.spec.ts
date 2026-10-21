import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'

const LEARNER = {
  id: '6f1c2a52-8b7e-4d3a-9c51-2f0e7a1b3c4d',
  email: 'maria@example.com',
  full_name: 'Maria Santos',
  role: 'learner',
  permissions: [],
  created_at: '2026-10-01T08:00:00Z',
}

const SIZES = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1280, height: 800 },
}

async function serveAccount(page: Page, signedIn = true) {
  await page.route('**/api/v1/qualifications', (route) => route.fulfill({ json: [] }))
  await page.route('**/api/v1/me', (route) =>
    signedIn
      ? route.fulfill({ json: LEARNER })
      : route.fulfill({ status: 401, json: { detail: 'Sign in to continue.' } }),
  )
  if (signedIn) {
    await page.addInitScript(() => localStorage.setItem('tesda-track.signed-in', '1'))
  }
}

async function openAccountMenu(page: Page, phone: boolean): Promise<Locator> {
  let area = page.getByRole('banner')
  if (phone) {
    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    area = page.getByRole('dialog', { name: 'Menu', exact: true })
  }
  await area.getByRole('button', { name: `Your account: ${LEARNER.full_name}` }).click()
  return page.getByRole('menu')
}

async function expectProfile(page: Page) {
  await expect(page).toHaveURL('/profile')
  await expect(page).toHaveTitle('My Profile · TESDA-TRACK')
  const heading = page.getByRole('heading', { name: 'My Profile', level: 1 })
  await expect(heading).toBeVisible()
  await expect(heading).toBeFocused()
  await expect(page.getByRole('dialog', { name: 'Menu', exact: true })).toBeHidden()
  await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).toBeHidden()

  const main = page.getByRole('main')
  await expect(main.getByText(LEARNER.full_name, { exact: true }).first()).toBeVisible()
  await expect(main.getByText(LEARNER.email, { exact: true }).first()).toBeVisible()
  await expect(main.getByText(/^Learner(?: account)?$/).first()).toBeVisible()
  await expect(main.locator('time')).toHaveAttribute('datetime', LEARNER.created_at)
  await expect(main.locator('time')).toContainText('2026')

  await page.mouse.move(0, 0)
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== 'running'),
  )
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  )
  const accessibility = await new AxeBuilder({ page }).analyze()
  expect(accessibility.violations).toEqual([])
}

for (const colorScheme of ['light', 'dark'] as const) {
  for (const [size, viewport] of Object.entries(SIZES)) {
    const phone = size === 'phone'

    test.describe(`profile, ${colorScheme} theme, ${size}`, () => {
      test.use({ colorScheme, viewport })

      test('opens the signed-in profile from navigation', async ({ page }) => {
        await serveAccount(page)
        await page.goto('/qualifications')
        await expect(
          page.getByRole('heading', { name: 'Qualifications Library', level: 1 }),
        ).toBeVisible()
        const menu = await openAccountMenu(page, phone)
        await menu.getByRole('menuitem', { name: 'My Profile', exact: true }).click()

        await expectProfile(page)
        if (colorScheme === 'light') {
          await page.screenshot({ path: `test-results/profile-${size}.png`, fullPage: true })
        }
      })

      test('opens the profile from Settings', async ({ page }) => {
        await serveAccount(page)
        await page.goto('/qualifications')
        await expect(
          page.getByRole('heading', { name: 'Qualifications Library', level: 1 }),
        ).toBeVisible()
        const menu = await openAccountMenu(page, phone)
        await menu.getByRole('menuitem', { name: 'Settings', exact: true }).click()
        const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
        await expect(settings.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible()
        await expect(settings.getByText(LEARNER.full_name, { exact: true })).toBeVisible()
        await settings.getByRole('link', { name: 'View profile', exact: true }).click()

        await expectProfile(page)
      })
    })
  }
}

test('a signed-out profile visit asks for sign-in without showing account details', async ({
  page,
}) => {
  await serveAccount(page, false)
  await page.goto('/profile')

  await expect(page).toHaveTitle('My Profile · TESDA-TRACK')
  await expect(page.getByRole('heading', { name: 'My Profile', level: 1 })).toBeVisible()
  await expect(page.getByText(LEARNER.full_name, { exact: true })).toBeHidden()
  await expect(page.getByText(LEARNER.email, { exact: true })).toBeHidden()
  await page.getByRole('button', { name: 'Sign in or create an account', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Sign in', exact: true })).toBeVisible()
})
