import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// The app shell: every address in both themes, on a phone and on a desktop, with axe; the keyboard; Back; and
// the states for an unreachable API and a page that fails to download.

const PAGES = [
  { path: '/', heading: 'Every career has a track. Find yours.' },
  { path: '/find', heading: 'Find my pathway', step: 'Your goal' },
  { path: '/find/matches', heading: 'Find my pathway', step: 'Your match' },
  { path: '/find/readiness', heading: 'Find my pathway', step: 'Readiness check' },
  { path: '/find/pathway', heading: 'Find my pathway', step: 'Your pathway' },
  { path: '/qualifications', heading: 'Qualifications Library' },
  { path: '/training', heading: 'Training & Assessment' },
  { path: '/progress', heading: 'My Progress' },
  { path: '/skills', heading: 'Skills Explorer' },
  { path: '/reports', heading: 'Reports' },
  { path: '/sign-in', heading: 'Sign in' },
  { path: '/no-such-page', heading: 'Page not found' },
]

const SIZES = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1280, height: 800 },
}

const UNAVAILABLE = "We can't load TESDA Track right now"

/** Answers the catalog request every page but Home makes, so the tests don't need the backend. */
async function serveCatalog(page: Page) {
  await page.route('**/api/v1/qualifications', (route) => route.fulfill({ json: [] }))
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
}

for (const colorScheme of ['light', 'dark'] as const) {
  for (const [size, viewport] of Object.entries(SIZES)) {
    test.describe(`${colorScheme} theme, ${size}`, () => {
      test.use({ colorScheme, viewport })

      for (const { path, heading, step } of PAGES) {
        test(`${path} shows its page and passes axe`, async ({ page }) => {
          await serveCatalog(page)
          await page.goto(path)

          await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
          if (step) await expect(page.getByRole('heading', { level: 2, name: step })).toBeVisible()
          await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme)
          // Settled: the catalog is in, on the pages that wait for it. (Home needs no catalog, and its readiness
          // example announces its score in a status of its own.)
          if (path !== '/') await expect(page.getByRole('status')).toHaveCount(0)

          // Home has the landing page's top bar; every other page has the sidebar, behind Menu on a phone.
          const phone = size === 'phone'
          if (path === '/') {
            await expect(
              page.getByRole('banner').getByRole('link', { name: 'Find my path' }),
            ).toBeVisible()
            await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible({
              visible: !phone,
            })
            await expect(page.getByRole('button', { name: 'Menu' })).toHaveCount(0)
          } else {
            await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible({
              visible: !phone,
            })
            await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible({ visible: phone })
          }
          // Nothing runs off the side of the screen.
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          )
          expect(overflow).toBeLessThanOrEqual(0)

          await expectAccessible(page)
        })
      }

      if (size === 'phone') {
        test('the menu opens over the page, passes axe, and Escape closes it', async ({ page }) => {
          await serveCatalog(page)
          await page.goto('/training')
          const menu = page.getByRole('button', { name: 'Menu' })

          await menu.click()

          const dialog = page.getByRole('dialog', { name: 'Menu' })
          await expect(dialog).toBeVisible()
          await expect(dialog.getByRole('link', { name: 'Training & Assessment' })).toHaveAttribute(
            'aria-current',
            'page',
          )
          // Settled: mid-animation the drawer's colors are half faded in, and axe would measure those.
          await expect(page.locator('[data-entering]')).toHaveCount(0)
          await expectAccessible(page)

          await page.keyboard.press('Escape')

          await expect(dialog).toBeHidden()
          await expect(menu).toBeFocused()
        })
      }
    })
  }
}

test.describe('on a phone', () => {
  test.use({ viewport: SIZES.phone })

  test("the menu closes on the chosen page, with focus on that page's heading", async ({
    page,
  }) => {
    await serveCatalog(page)
    await page.goto('/qualifications')

    await page.getByRole('button', { name: 'Menu' }).click()
    await page.getByRole('dialog').getByRole('link', { name: 'Skills Explorer' }).click()

    await expect(page).toHaveURL('/skills')
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.getByRole('heading', { level: 1, name: 'Skills Explorer' })).toBeFocused()
  })
})

test.describe('on a desktop', () => {
  test.use({ viewport: SIZES.desktop })

  test('Tab reaches Skip to content first, and it skips the sidebar', async ({ page }) => {
    await serveCatalog(page)
    await page.goto('/no-such-page')
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()

    await page.keyboard.press('Tab')

    const skip = page.getByRole('link', { name: 'Skip to content' })
    await expect(skip).toBeFocused()
    await expect(skip).toBeInViewport()

    await page.keyboard.press('Enter')
    await expect(page.getByRole('main')).toBeFocused()
    await page.keyboard.press('Tab')

    // Past the links and the theme switch in the sidebar, to the first link in the page.
    await expect(page.getByRole('link', { name: 'Go to the home page' })).toBeFocused()
    await expect(page).toHaveURL('/no-such-page')
  })

  test("a link moves focus to the new page's heading", async ({ page }) => {
    await serveCatalog(page)
    await page.goto('/qualifications')

    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'My Progress' })
      .click()

    await expect(page.getByRole('heading', { level: 1, name: 'My Progress' })).toBeFocused()
    await expect(page).toHaveTitle('My Progress · TESDA-TRACK')
  })

  test('a new page starts at the top, and Back returns to where the learner was', async ({
    page,
  }) => {
    await serveCatalog(page)
    await page.goto('/qualifications')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Qualifications Library' }),
    ).toBeVisible()
    // The placeholders are short: make every page long enough to scroll.
    await page.addStyleTag({ content: 'main { min-height: 4000px; }' })
    await page.evaluate(() => window.scrollTo(0, 1500))
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(1500)

    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Skills Explorer' })
      .click()

    await expect(page.getByRole('heading', { level: 1, name: 'Skills Explorer' })).toBeVisible()
    expect(await page.evaluate(() => window.scrollY)).toBe(0)

    await page.goBack()

    await expect(
      page.getByRole('heading', { level: 1, name: 'Qualifications Library' }),
    ).toBeVisible()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(1500)
  })

  test('Home works without the API', async ({ page }) => {
    // The API's addresses, not the app's own modules (in development, /src/api/... is code).
    const isApi = (url: URL) => url.pathname.startsWith('/api/')
    const requests: string[] = []
    page.on('request', (request) => {
      if (isApi(new URL(request.url()))) requests.push(request.url())
    })
    await page.route(isApi, (route) => route.abort())

    await page.goto('/')

    await expect(
      page.getByRole('heading', { level: 1, name: 'Every career has a track. Find yours.' }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { level: 2, name: 'What would you like to achieve?' }),
    ).toBeAttached()
    expect(requests).toEqual([])
  })

  test("shows the service state when the API can't be reached, and Try again recovers", async ({
    page,
  }) => {
    let reachable = false
    await page.route('**/api/v1/qualifications', (route) =>
      reachable ? route.fulfill({ json: [] }) : route.abort(),
    )
    await page.goto('/qualifications')

    // The app retries twice, a second and then two apart, before it gives up.
    await expect(page.getByRole('heading', { name: UNAVAILABLE })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('alert')).toHaveText(
      "We can't reach the TESDA-TRACK service right now. Please try again shortly.",
    )
    await expectAccessible(page)

    reachable = true
    await page.getByRole('button', { name: 'Try again' }).click()

    // The catalog came back empty: the Library says so.
    await expect(
      page.getByRole('heading', { name: 'New possibilities are on the way' }),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: UNAVAILABLE })).toHaveCount(0)
  })

  test('a page that fails to download shows the error state, and Try again reloads', async ({
    page,
  }) => {
    await serveCatalog(page)
    await page.goto('/training')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Training & Assessment' }),
    ).toBeVisible()
    // The Library's code can't be downloaded: offline, or replaced by a new release.
    await page.route('**/features/library/**', (route) => route.abort())

    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Qualifications Library' })
      .click()

    const heading = page.getByRole('heading', { level: 1, name: UNAVAILABLE })
    await expect(heading).toBeFocused()
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    await expectAccessible(page)

    await page.unroute('**/features/library/**')
    await page.getByRole('button', { name: 'Try again' }).click()

    await expect(
      page.getByRole('heading', { level: 1, name: 'Qualifications Library' }),
    ).toBeVisible()
    await expect(page).toHaveURL('/qualifications')
  })
})
