import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// The privacy notice on a first visit, and the links to the policy. Every other test opens as a browser that has
// seen the notice (playwright.config.ts); these start without it.

test.use({ storageState: { cookies: [], origins: [] } })

const NOTICE = 'Your privacy on TESDA Track'

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`BUG-07: the privacy draft explains TSP profile use at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    // A returning learner who saw the previous version must see the revised notice too.
    await page.addInitScript(() => localStorage.setItem('tesda-track.privacy-notice', '2026-11-17'))
    await page.goto('/')
    const notice = page.getByRole('dialog', { name: NOTICE })
    await expect(
      notice.getByText('Placeholder — pending legal approval.', { exact: true }),
    ).toBeVisible()
    await expect(notice).toContainText('email and profile (skills, licenses and home area)')
    await notice.getByRole('button', { name: 'I understand', exact: true }).scrollIntoViewIfNeeded()
    await expect(notice.getByRole('button', { name: 'I understand', exact: true })).toBeInViewport()
    // Show the notice header and draft label in the evidence.
    await notice.getByRole('heading', { name: NOTICE }).scrollIntoViewIfNeeded()
    await page.screenshot({
      path: test.info().outputPath('privacy-placeholder-popup.png'),
      animations: 'disabled',
    })
    expect(
      (await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations,
    ).toEqual([])
    await notice.getByRole('link', { name: 'Read the privacy policy', exact: true }).click()
    await expect(page).toHaveURL(/\/privacy$/)
    await expect(
      page.getByText('Placeholder — pending legal approval.', { exact: true }),
    ).toBeVisible()
    await expect(page.getByRole('region', { name: 'In short', exact: true })).toContainText(
      'email and profile (skills, licenses and home area)',
    )
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await page.screenshot({
      path: test.info().outputPath('privacy-placeholder-page.png'),
      animations: 'disabled',
    })
  })
}

test('BUG-07: Filipino notice includes the draft label and profile details', async ({ page }) => {
  await page.goto('/')
  const notice = page.getByRole('dialog')
  await notice.getByRole('combobox', { name: 'Language / Wika' }).selectOption('tl')
  await expect(notice).toContainText('Placeholder — naghihintay ng legal na pag-apruba.')
  await expect(notice).toContainText(
    'email at profile (mga kasanayan, lisensya at lugar ng tirahan)',
  )
})

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
    page.getByRole('heading', { level: 1, name: 'Your next TESDA step, on a map near you.' }),
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

// [Bug][Web] Privacy link (QA BUG-08): the footer link sat under the floating Help button, and the Career Map's only
// link was inside its folded results panel; the sidebar menu now links to the policy on every screen.
test.describe('the privacy link on every screen', () => {
  test.use({
    viewport: { width: 1280, height: 600 },
    storageState: {
      cookies: [],
      origins: [
        {
          origin: `http://localhost:${process.env.E2E_PORT ?? 5173}`,
          localStorage: [
            { name: 'tesda-track.privacy-notice', value: '2026-11-24' },
            { name: 'track.explore.locationAsked', value: 'no' },
          ],
        },
      ],
    },
  })

  for (const path of ['/find', '/qualifications']) {
    test(`the footer link on ${path} is not under the Help button`, async ({ page }) => {
      await page.goto(path)
      const link = page.getByRole('contentinfo').getByRole('link', { name: 'Privacy policy' })
      await link.scrollIntoViewIfNeeded()
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      await expect(page.getByRole('button', { name: 'Help: tour this page' })).toBeVisible()
      // A click lands on whatever is on top: before the fix, the Help button took it.
      await link.click({ timeout: 3000 })
      await expect(page).toHaveURL(/\/privacy$/)
    })
  }

  for (const viewport of [
    { width: 1280, height: 600 },
    { width: 390, height: 844 },
  ]) {
    test(`the menu links to the policy, from the Career Map with its panel folded (${viewport.width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await page.goto('/explore')
      await page.getByRole('button', { name: 'Menu' }).first().click()
      await page
        .getByRole('dialog')
        .getByRole('link', { name: 'Privacy policy' })
        .click({ timeout: 3000 })
      await expect(page).toHaveURL(/\/privacy$/)
      await expect(page.getByRole('dialog')).toHaveCount(0)
    })
  }
})
