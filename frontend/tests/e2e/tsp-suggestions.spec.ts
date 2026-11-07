import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// "Suggested for you" in TSP's WebView, in a real browser: how it lays out and looks, which the unit tests (jsdom)
// can't see. Folded, it is one row above the goal box, which stays on a phone's first screen; opened, its buttons
// look like what they do.

const PHONE = { width: 390, height: 844 }

const qualification = (code: string, name: string) => ({
  code,
  name,
  sector: 'Metals and Engineering',
})
const SUGGESTIONS = [
  {
    qualification: qualification('SMAW-NCII', 'Shielded Metal Arc Welding (SMAW) NC II'),
    score: 71,
    reason: 'From your TSP profile: welding',
  },
  {
    qualification: qualification('MF-NCII', 'Metal Fabrication NC II'),
    score: 64,
    reason: 'From your TSP profile: metal fabrication',
  },
  {
    qualification: qualification('GTAW-NCII', 'Gas Tungsten Arc Welding (GTAW) NC II'),
    score: 58,
    reason: 'From your TSP profile: welding',
  },
]

async function serveSuggestions(page: Page) {
  await page.route('**/api/v1/client-config', (route) =>
    route.fulfill({
      json: {
        carto_key: '',
        routing_enabled: false,
        skills_bridge_enabled: false,
        tsp_sign_in: false,
        tsp_suggestions: true,
      },
    }),
  )
  await page.route('**/api/v1/qualifications', (route) => route.fulfill({ json: [] }))
  await page.route('**/api/v1/analysis/suggestions', (route) =>
    route.fulfill({
      json: {
        profile: (route.request().postDataJSON() as { profile: unknown }).profile,
        suggestions: SUGGESTIONS,
        basis: ['Skills on your TSP profile: welding, metal fabrication'],
      },
    }),
  )
}

test('suggestions fold into one row above the goal box, and open into rows to choose from', async ({
  page,
}) => {
  await page.setViewportSize(PHONE)
  await serveSuggestions(page)
  await page.goto('/tsp/webview?skills=welding,metal%20fabrication&experience_years=2')

  const toggle = page.getByRole('button', { name: 'Suggested for you' })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  const summary = page.getByText('3 qualifications based on your TSP profile')
  await expect(summary).toBeVisible()
  await expect(page.getByRole('button', { name: 'See my pathway' })).toHaveCount(0)

  // Folded, the goal box and its button are on the first screen.
  const findMyMatch = page.getByRole('button', { name: 'Find my match' })
  const button = await findMyMatch.boundingBox()
  expect(button!.y + button!.height).toBeLessThan(PHONE.height)
  // The example jobs stay small pills: the section's styles don't reach them.
  const chips = await page.locator('[aria-label="Suggested jobs"]').evaluate((row) => ({
    row: row.getBoundingClientRect().width,
    widest: Math.max(...[...row.children].map((chip) => chip.getBoundingClientRect().width)),
  }))
  expect(chips.widest).toBeLessThan(chips.row / 2)

  // The whole row opens the section, the line under the heading included.
  const line = await summary.boundingBox()
  await page.mouse.click(line!.x + 20, line!.y + line!.height / 2)
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('heading', { level: 3 })).toHaveText(
    SUGGESTIONS.map((suggestion) => suggestion.qualification.name),
  )
  await expect(page.getByRole('link', { name: 'Find centers' })).toHaveCount(3)

  // Choosing a suggestion is the main action, styled as the page's other main button.
  const background = (locator: ReturnType<Page['getByRole']>) =>
    locator.evaluate((element) => getComputedStyle(element).backgroundColor)
  expect(await background(page.getByRole('button', { name: 'See my pathway' }).first())).toBe(
    await background(findMyMatch),
  )
  expect((await new AxeBuilder({ page }).include('.tsp-suggested').analyze()).violations).toEqual(
    [],
  )
  await page.screenshot({ path: test.info().outputPath('suggestions-open.png'), fullPage: true })

  // And the keyboard folds it again.
  await toggle.focus()
  await page.keyboard.press('Enter')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('button', { name: 'See my pathway' })).toHaveCount(0)
})
