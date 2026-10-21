import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const CATALOG = [
  {
    code: 'SMAW-NCII',
    name: 'Shielded Metal Arc Welding (SMAW) NC II',
    sector: 'Metals and Engineering',
    possible_jobs: ['Welder'],
    competencies: [],
  },
]

const help = (page: Page) => page.getByRole('button', { name: 'Help: tour this page', exact: true })
const popover = (page: Page) => page.locator('.driver-popover')
const title = (page: Page) => page.locator('.driver-popover-title')

async function serveCatalog(page: Page) {
  await page.route('**/api/v1/qualifications', (route) => route.fulfill({ json: CATALOG }))
}

async function startTour(page: Page) {
  await help(page).click()
  await expect(popover(page)).toBeVisible()
  await expect(title(page)).toHaveText('Your guide to this page')
}

async function finishTour(page: Page) {
  // A bounded loop accommodates context-specific steps without depending on their count.
  for (let step = 0; step < 20; step++) {
    const done = popover(page).getByRole('button', { name: 'Done', exact: true })
    if (await done.isVisible()) {
      await expect(title(page)).toHaveText('Help is always here')
      await done.click()
      await expect(popover(page)).toHaveCount(0)
      return
    }
    await popover(page).getByRole('button', { name: 'Next', exact: true }).click()
  }
  throw new Error('The guided tour did not reach its final step')
}

test('help starts on demand, supports Back and Escape, restores focus, and replays', async ({
  page,
}, testInfo) => {
  await serveCatalog(page)
  await page.goto('/find')
  const goal = page.locator('[data-tour="goal-input"]')
  await expect(goal).toBeVisible()
  await goal.fill('I want to become a welder.')
  await expect(popover(page)).toHaveCount(0)

  await startTour(page)
  await expect(popover(page)).toHaveCSS('opacity', '1')
  await page.screenshot({ path: testInfo.outputPath('help-desktop.png') })
  await expect(page.locator('.driver-popover-progress-text')).toContainText('1')
  await expect(popover(page).getByRole('button', { name: 'Close tour' })).toBeVisible()
  await popover(page).getByRole('button', { name: 'Next', exact: true }).click()
  await expect(title(page)).not.toHaveText('Your guide to this page')
  await popover(page).getByRole('button', { name: 'Back', exact: true }).click()
  await expect(title(page)).toHaveText('Your guide to this page')

  await page.keyboard.press('Escape')
  await expect(popover(page)).toHaveCount(0)
  await expect(help(page)).toBeFocused()
  await expect(goal).toHaveValue('I want to become a welder.')
  await expect(page).toHaveURL('/find')

  await startTour(page)
  await popover(page).getByRole('button', { name: 'Close tour' }).click()
  await expect(popover(page)).toHaveCount(0)
  await expect(help(page)).toBeFocused()
})

test('the signed-out progress tour finishes and can be replayed without signing in', async ({
  page,
}) => {
  await page.goto('/progress')
  await expect(page.locator('[data-tour="account-gate"]')).toBeVisible()
  await startTour(page)
  await finishTour(page)
  await expect(help(page)).toBeFocused()
  await expect(page).toHaveURL('/progress')
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await startTour(page)
  await page.keyboard.press('Escape')
  await expect(popover(page)).toHaveCount(0)
})

test('browser Back closes the tour when the page changes', async ({ page }) => {
  await serveCatalog(page)
  await page.goto('/progress')
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Find my pathway' })
    .click()
  await expect(page.locator('[data-tour="goal-input"]')).toBeVisible()
  await startTour(page)

  await page.goBack()

  await expect(page).toHaveURL('/progress')
  await expect(popover(page)).toHaveCount(0)
  await expect(page.locator('.driver-overlay')).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1, name: 'My Progress' })).toBeVisible()
})

test('a delayed first-visit notice closes the tour and keeps its dialog usable', async ({
  page,
}) => {
  await serveCatalog(page)
  await page.addInitScript(() => localStorage.removeItem('tesda-track.privacy-notice'))
  let releaseNotice = () => {}
  const noticeReady = new Promise<void>((resolve) => {
    releaseNotice = resolve
  })
  await page.route('**/features/privacy/PrivacyNotice.tsx*', async (route) => {
    await noticeReady
    await route.continue()
  })

  try {
    await page.goto('/find', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('[data-tour="goal-input"]')).toBeVisible()
    await startTour(page)
    releaseNotice()

    const dialog = page.getByRole('dialog', { name: 'Your privacy on TESDA Track' })
    await expect(dialog).toBeVisible()
    await expect(popover(page)).toHaveCount(0)
    await expect(page.locator('.driver-overlay')).toHaveCount(0)
    await expect
      .poll(() => dialog.evaluate((element) => element.contains(document.activeElement)))
      .toBe(true)
    await expect(dialog).toContainText('I understand')
    await dialog.getByRole('button', { name: 'I understand', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await startTour(page)
    await page.keyboard.press('Escape')
    await expect(popover(page)).toHaveCount(0)
    await expect(help(page)).toBeFocused()
  } finally {
    releaseNotice()
  }
})

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} theme on a phone`, () => {
    test.use({ viewport: { width: 390, height: 844 }, colorScheme, reducedMotion: 'reduce' })

    test('the tour fits, highlights visible controls, and passes axe', async ({
      page,
    }, testInfo) => {
      await serveCatalog(page)
      await page.goto('/find')
      await expect(page.locator('[data-tour="goal-input"]')).toBeVisible()
      await startTour(page)
      await page.screenshot({ path: testInfo.outputPath(`help-phone-${colorScheme}.png`) })

      const results = await new AxeBuilder({ page }).analyze()
      expect(results.violations).toEqual([])

      for (let step = 0; step < 20; step++) {
        await expect(popover(page)).toBeInViewport()
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          ),
        ).toBeLessThanOrEqual(0)
        // Driver's dummy element represents an unanchored introduction; real targets must be visible.
        const active = page.locator('.driver-active-element:not(#driver-dummy-element)')
        if (await active.count()) await expect(active).toBeVisible()

        const done = popover(page).getByRole('button', { name: 'Done', exact: true })
        if (await done.isVisible()) {
          await done.click()
          await expect(popover(page)).toHaveCount(0)
          await expect(help(page)).toBeFocused()
          return
        }
        await popover(page).getByRole('button', { name: 'Next', exact: true }).click()
      }
      throw new Error('The phone tour did not finish')
    })
  })
}

test.describe('other main pages', () => {
  test.use({ reducedMotion: 'reduce' })

  test('Home explains getting started without making API requests', async ({ page }) => {
    const apiRequests: string[] = []
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url())
    })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await startTour(page)
    await finishTour(page)
    await expect(page).toHaveURL('/')
    expect(apiRequests).toEqual([])
  })

  test('qualifications tour includes the catalog controls and finishes', async ({ page }) => {
    await serveCatalog(page)
    await page.goto('/qualifications')
    await expect(page.locator('[data-tour="qualification-card"]').first()).toBeVisible()
    await startTour(page)
    await finishTour(page)
    await expect(page).toHaveURL('/qualifications')
    await expect(help(page)).toBeFocused()
  })

  test('training tour works with no listings and the map hidden', async ({ page }) => {
    await serveCatalog(page)
    const json = (url: string, body: unknown) =>
      page.route(url, (route) => route.fulfill({ json: body }))
    await json('**/api/v1/regions', [])
    await json('**/api/v1/client-config', {
      carto_key: '',
      routing_enabled: false,
      skills_bridge_enabled: true,
    })
    await json('**/api/v1/training-providers', [])
    await json('**/api/v1/assessment-centers', [])
    await json('**/api/v1/training-programs?*', [])
    await json('**/api/v1/assessment-schedules?*', [])
    await page.addInitScript(() => localStorage.setItem('tesda-track.training-map', 'hidden'))
    await page.goto('/training')
    await expect(page.locator('[data-tour="training-map-toggle"]')).toBeVisible()
    await startTour(page)
    await finishTour(page)
    await expect(page).toHaveURL('/training')
    await expect(help(page)).toBeFocused()
  })
})
