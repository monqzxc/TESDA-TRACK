import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// The privacy notice on a first visit, and the links to the policy. Every other test opens as a browser that has
// seen the notice (playwright.config.ts); these start without it.

test.use({ storageState: { cookies: [], origins: [] } })

const NOTICE = 'Your privacy on TESDA Track'

for (const colorScheme of ['light', 'dark'] as const) {
  test(`the notice opens on a first visit and passes axe (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    await page.goto('/')

    const notice = page.getByRole('dialog', { name: NOTICE })
    await expect(notice).toBeVisible()
    // Settled: mid-animation its colors are half faded in, and axe would measure those.
    await expect(page.locator('[data-entering]')).toHaveCount(0)
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations).toEqual([])
  })
}

test('"I understand" closes the notice for good', async ({ page }) => {
  await page.goto('/')

  await page
    .getByRole('dialog', { name: NOTICE })
    .getByRole('button', { name: 'I understand' })
    .click()
  await expect(page.getByRole('dialog')).toBeHidden()

  await page.reload()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Every career has a track. Find yours.' }),
  ).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('"Read the privacy policy" opens the policy', async ({ page }) => {
  await page.goto('/')

  await page
    .getByRole('dialog', { name: NOTICE })
    .getByRole('link', { name: 'Read the privacy policy' })
    .click()

  await expect(page).toHaveURL('/privacy')
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeFocused()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test("Home's footer links to the policy, and its contents to each section", async ({ page }) => {
  await page.goto('/')
  await page
    .getByRole('dialog', { name: NOTICE })
    .getByRole('button', { name: 'I understand' })
    .click()

  await page.getByRole('contentinfo').getByRole('link', { name: 'Privacy policy' }).click()
  await expect(page).toHaveURL('/privacy')

  await page
    .getByRole('navigation', { name: 'On this page' })
    .getByRole('link', { name: 'Your rights' })
    .click()
  await expect(page).toHaveURL('/privacy#your-rights')
  await expect(page.getByRole('heading', { level: 2, name: 'Your rights' })).toBeInViewport()
})
