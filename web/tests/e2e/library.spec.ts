import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// Qualifications Library (US-04): search and sector in the address, twelve cards a page, a card's competencies,
// and "Explore this pathway" opening the finder with the goal kept out of the address.

const SIZES = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1280, height: 800 },
}

const competencies = [
  { id: 1, position: 1, name: 'Participate in workplace communication', category: 'Basic' },
  { id: 2, position: 2, name: 'Apply safety practices', category: 'Common' },
  { id: 3, position: 3, name: 'Weld carbon steel plates', category: 'Core' },
]

// 13 Tourism qualifications and two welding ones: 15 in all, two pages.
const CATALOG = [
  ...Array.from({ length: 13 }, (_, i) => ({
    code: `TOUR-${i + 1}`,
    name: `Tourism qualification ${i + 1} NC II`,
    sector: 'Tourism',
    possible_jobs: ['Front desk clerk'],
    competencies: [],
  })),
  {
    code: 'SMAW-NCI',
    name: 'Shielded Metal Arc Welding (SMAW) NC I',
    sector: 'Metals and Engineering',
    possible_jobs: ['Welder', 'Fabricator'],
    competencies,
  },
  {
    code: 'SMAW-NCII',
    name: 'Shielded Metal Arc Welding (SMAW) NC II',
    sector: 'Metals and Engineering',
    possible_jobs: ['Welder'],
    competencies,
  },
]

async function serveCatalog(page: Page) {
  await page.route('**/api/v1/qualifications', (route) => route.fulfill({ json: CATALOG }))
}

async function expectAccessible(page: Page) {
  // React Aria's live announcer holds what it just read out for a few seconds after a choice in a list: entries
  // labelled by the chosen option, which has gone with the list. Screen readers have read them by then.
  const results = await new AxeBuilder({ page }).exclude('[data-live-announcer]').analyze()
  expect(results.violations).toEqual([])
}

const cards = (page: Page) => page.getByRole('main').getByRole('article')

for (const colorScheme of ['light', 'dark'] as const) {
  for (const [size, viewport] of Object.entries(SIZES)) {
    test(`${colorScheme} theme, ${size}: a card opens its competencies, and passes axe`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ colorScheme })
      await serveCatalog(page)
      await page.goto('/qualifications')

      await expect(cards(page)).toHaveCount(12)
      const card = page.getByRole('article', {
        name: 'Shielded Metal Arc Welding (SMAW) NC I',
        exact: true,
      })
      await page.getByRole('searchbox', { name: 'Search qualifications or careers' }).fill('SMAW')
      await expect(cards(page)).toHaveCount(2)
      await card.getByText('View 3 sample competencies').click()
      await expect(card.getByRole('heading', { level: 3, name: 'Core skills' })).toBeVisible()

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(0)
      await expectAccessible(page)
    })
  }
}

test.describe('on a desktop', () => {
  test.use({ viewport: SIZES.desktop })

  test('keeps the search and sector in the address, and Back returns to them', async ({ page }) => {
    await serveCatalog(page)
    await page.goto('/qualifications')

    await page.getByRole('button', { name: /Sector/ }).click()
    await page.getByRole('option', { name: 'Metals and Engineering' }).click()
    await expect(cards(page)).toHaveCount(2)
    await expect(page).toHaveURL('/qualifications?sector=Metals+and+Engineering')

    await page.getByRole('searchbox').fill('fabricator')
    await expect(cards(page)).toHaveCount(1)
    await expect(page).toHaveURL('/qualifications?sector=Metals+and+Engineering&q=fabricator')

    // A shared address opens the same search.
    await page.reload()
    await expect(page.getByRole('searchbox')).toHaveValue('fabricator')
    await expect(cards(page)).toHaveCount(1)

    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expect(cards(page)).toHaveCount(12)
    await page.goBack()
    await expect(cards(page)).toHaveCount(1)
  })

  test('pages with the keyboard, and the next page opens at its results', async ({ page }) => {
    await serveCatalog(page)
    await page.goto('/qualifications')

    const next = page.getByRole('navigation', { name: 'Pages' }).getByRole('link', { name: 'Next' })
    await next.focus()
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL('/qualifications?page=2')
    await expect(cards(page)).toHaveCount(3)
    await expect(page.getByText(/Showing 13–15/)).toBeFocused()
    await expect(page.getByText(/Showing 13–15/)).toBeInViewport()
  })

  test('Explore this pathway opens Find my pathway with the goal, not in the address', async ({
    page,
  }) => {
    await serveCatalog(page)
    await page.goto('/qualifications?q=SMAW-NCII')

    await page.getByRole('button', { name: 'Explore this pathway' }).click()

    await expect(page).toHaveURL('/find')
    const saved = await page.evaluate(() => window.sessionStorage.getItem('tesda-track.finder'))
    expect(saved).toContain('I want to pursue Shielded Metal Arc Welding (SMAW) NC II.')
  })
})
