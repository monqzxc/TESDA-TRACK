import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('home page loads and has no accessibility violations', async ({ page }) => {
  // Mock the API so the test doesn't need the backend or a database.
  await page.route('**/api/v1/qualifications', (route) =>
    route.fulfill({
      json: [{ code: 'BKP-NCIII', name: 'Bookkeeping NC III', sector: 'Business and management' }],
    }),
  )

  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: 'TESDA-TRACK' })).toBeVisible()
  await expect(page.getByText('1 qualification in the catalog.')).toBeVisible()

  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
