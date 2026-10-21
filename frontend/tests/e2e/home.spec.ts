import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// Home, the landing page: every section in both themes, on a phone and a desktop, with axe; the scroll reveal and
// the road, with motion and without; the goal box, which opens the finder at /find and nothing more; and Home with
// the API down.

const SIZES = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1280, height: 800 },
}

const HEADING = 'Every career has a track. Find yours.'
const SECTIONS = [
  'Four stops between a goal and a certificate.',
  'Training and assessment near you.',
  '319 qualifications',
  'Save your path. Tick off each step.',
  'What would you like to achieve?',
]

// Must match FINDER_KEY in src/features/finder/store.ts.
const FINDER_KEY = 'tesda-track.finder'

/** Answers the catalog request the finder makes, once the goal box opens it. */
async function serveCatalog(page: Page) {
  await page.route('**/api/v1/qualifications', (route) => route.fulfill({ json: [] }))
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
}

async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

/** Waits for the page to paint twice, so scroll watchers (IntersectionObserver, scroll events) have caught up. */
async function settle(page: Page) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
}

/** Scrolls down the page a little at a time, as a reader does, to the end. */
async function scrollThrough(page: Page) {
  const { height, step } = await page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    step: Math.round(window.innerHeight / 2),
  }))
  for (let y = step; y < height + step; y += step) {
    await page.evaluate((top) => window.scrollTo(0, top), y)
    await settle(page)
  }
}

const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY))
const sectionLink = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name })

/** How far an element's top is from the bottom of Home's top bar, above or below it: 0 when it sits just below. */
const offBar = (page: Page, selector: string) =>
  page.evaluate((selector) => {
    const bar = document.querySelector('header')!.getBoundingClientRect().bottom
    return Math.round(Math.abs(document.querySelector(selector)!.getBoundingClientRect().top - bar))
  }, selector)

const reveals = (page: Page) => page.locator('[data-reveal]')
const waiting = (page: Page) => page.locator('[data-reveal]:not([data-in])')
const litWaypoints = (page: Page) => page.locator('[data-waypoint][data-lit]')
const goalBox = (page: Page) => page.getByRole('textbox', { name: 'Your goal' })
const submit = (page: Page) => page.getByRole('button', { name: 'Find my path' })

for (const colorScheme of ['light', 'dark'] as const) {
  for (const [size, viewport] of Object.entries(SIZES)) {
    test.describe(`${colorScheme} theme, ${size}`, () => {
      // Still, so axe sees every section at once, at its final colors.
      test.use({ colorScheme, viewport, reducedMotion: 'reduce' })

      test('shows every section, fits the screen, and passes axe', async ({ page }) => {
        await page.goto('/')

        await expect(page.getByRole('heading', { level: 1, name: HEADING })).toBeVisible()
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
        for (const name of SECTIONS) {
          await expect(page.getByRole('heading', { level: 2, name })).toBeAttached()
        }
        await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme)
        // The footer is the page's contentinfo landmark, outside the main region.
        await expect(page.getByRole('contentinfo')).toContainText('TESDA Track is a pilot.')
        await expect(page.getByRole('main').locator('footer')).toHaveCount(0)
        await expectNoSidewaysScroll(page)
        // At the top, the bar is see-through over the hero.
        await expect(page.getByRole('banner')).not.toHaveAttribute('data-scrolled')
        await expectAccessible(page)

        // Further down, the bar is solid over the sections.
        await page.getByRole('heading', { level: 2, name: SECTIONS[3] }).scrollIntoViewIfNeeded()
        await expect(page.getByRole('banner')).toHaveAttribute('data-scrolled')
        await expectNoSidewaysScroll(page)
        await expectAccessible(page)
      })
    })
  }
}

for (const [size, viewport] of Object.entries(SIZES)) {
  test.describe(`with motion, ${size}`, () => {
    test.use({ viewport, reducedMotion: 'no-preference' })

    test('sections come in as they scroll into view, and the road draws itself', async ({
      page,
    }) => {
      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1, name: HEADING })).toBeVisible()
      await settle(page)

      // The hero is in; what's further down waits, and the road has reached no further than the first stop.
      await expect(page.getByRole('main').locator('[data-motion]')).toHaveCount(1)
      expect(await waiting(page).count()).toBeGreaterThan(10)
      await expect(
        page.getByRole('region', { name: HEADING }).locator('[data-reveal]').first(),
      ).toHaveAttribute('data-in')
      expect(await litWaypoints(page).count()).toBeLessThan(2)

      await scrollThrough(page)

      await expect(waiting(page)).toHaveCount(0)
      await expect(litWaypoints(page)).toHaveCount(4)
      const drawn = page.locator('#how svg path').nth(1)
      await expect(drawn).toHaveCSS('stroke-dashoffset', '0px')
      await expectNoSidewaysScroll(page)
    })
  })
}

test.describe('with reduced motion', () => {
  test.use({ viewport: SIZES.phone, reducedMotion: 'reduce' })

  test('shows every section at once, with the road drawn and nothing moving', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: HEADING })).toBeVisible()

    await expect(page.getByRole('main').locator('[data-motion]')).toHaveCount(0)
    for (const part of await reveals(page).all()) {
      await expect(part).toHaveCSS('opacity', '1')
      await expect(part).toHaveCSS('transform', 'none')
    }
    await expect(litWaypoints(page)).toHaveCount(4)
    await expect(page.locator('#how svg path').nth(1)).toHaveCSS('stroke-dashoffset', '0px')
    // The figures are final, and the drifting names stand still.
    await expect(page.getByText('4,981', { exact: true }).first()).toBeVisible()
    for (const row of await page
      .getByRole('group', { name: /qualifications in the library/ })
      .getByRole('list')
      .all()) {
      await expect(row).toHaveCSS('animation-name', 'none')
    }
    const example = page.getByRole('group', { name: 'Example: a goal matched to a qualification' })
    await expect(example).toContainText('Gusto kong maging welder.')
    await expect(example).toContainText('92%')
  })
})

test.describe('the goal box', () => {
  test.use({ viewport: SIZES.phone })

  test('opens the finder at /find, with the goal kept for it and out of the address', async ({
    page,
  }) => {
    await serveCatalog(page)
    await page.goto('/')
    const goal = 'Gusto kong maging welder sa Cebu'

    await goalBox(page).fill(goal)
    await submit(page).click()

    await expect(page).toHaveURL('/find')
    const { pathname, search, hash } = new URL(page.url())
    expect(`${pathname}${search}${hash}`).toBe('/find')
    await expect(page.getByRole('heading', { level: 1, name: 'Find my pathway' })).toBeVisible()
    await expect(page).toHaveTitle('Your goal · Find my pathway · TESDA-TRACK')
    expect(await page.evaluate((key) => sessionStorage.getItem(key), FINDER_KEY)).toContain(goal)
    expect(await page.evaluate((key) => localStorage.getItem(key), FINDER_KEY)).toBeNull()
  })

  test('works from the keyboard', async ({ page }) => {
    await serveCatalog(page)
    await page.goto('/')

    await goalBox(page).focus()
    await page.keyboard.type('I want to become a chef')
    await page.keyboard.press('Tab')
    await expect(submit(page)).toBeFocused()
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL('/find')
  })

  test('asks for a goal when it is empty, and stays on Home', async ({ page }) => {
    await page.goto('/')

    await submit(page).click()

    await expect(
      page.getByText('Describe your career goal or skills to get started.'),
    ).toBeVisible()
    await expect(goalBox(page)).toBeFocused()
    await expect(goalBox(page)).toHaveAttribute('aria-invalid', 'true')
    await expect(page).toHaveURL('/')
  })

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`shows the focus ring with the error, ${colorScheme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await page.goto('/')

      await submit(page).click()

      await expect(goalBox(page)).toBeFocused()
      await expect(goalBox(page)).toHaveAttribute('aria-invalid', 'true')
      const shadow = await goalBox(page).evaluate((box) => getComputedStyle(box).boxShadow)
      // The error's red edge, and the yellow focus ring around it.
      expect(shadow).toContain('rgb(255, 143, 143)')
      expect(shadow).toContain('rgb(245, 184, 61)')
    })
  }

  test('takes 500 characters at most', async ({ page }) => {
    await page.goto('/')

    await goalBox(page).fill('a'.repeat(520))

    await expect(goalBox(page)).toHaveValue('a'.repeat(500))
    await expect(page.getByText('500/500')).toBeVisible()
  })
})

for (const [size, viewport] of Object.entries(SIZES)) {
  test.describe(`Back to Home, ${size}`, () => {
    test.use({ viewport })

    test('returns to where the learner left the page', async ({ page }) => {
      await serveCatalog(page)
      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1, name: HEADING })).toBeVisible()
      await scrollThrough(page)
      const cta = page.getByRole('link', { name: 'Go to My progress' })
      await cta.scrollIntoViewIfNeeded()
      await settle(page)
      const left = await scrollY(page)
      expect(left).toBeGreaterThan(1000)

      // A click without Playwright's own scrolling first: beside the sticky top bar, it can move the page a little
      // before following the link, and the page returns to where it was then.
      await cta.dispatchEvent('click')
      await expect(page.getByRole('heading', { level: 1, name: 'My Progress' })).toBeVisible()
      await page.goBack()

      await expect(page).toHaveURL('/')
      await expect.poll(() => scrollY(page)).toBe(left)
      await expect(cta).toBeInViewport()
    })
  })
}

test.describe('on a phone', () => {
  test.use({ viewport: SIZES.phone, reducedMotion: 'reduce' })

  test('Shift+Tab never leaves focus under the top bar', async ({ page }) => {
    await page.goto('/')
    await submit(page).focus()

    let steps = 0
    for (;;) {
      await page.keyboard.press('Shift+Tab')
      const focused = await page.evaluate(() => {
        const element = document.activeElement!
        const bar = document.querySelector('header')!
        // A radio button is hidden inside its label, which is what shows.
        const shown = element.closest('label') ?? element
        return {
          name: shown.textContent?.trim().slice(0, 40),
          inBar: bar.contains(element) || element === document.body,
          below: Math.round(shown.getBoundingClientRect().top - bar.getBoundingClientRect().bottom),
        }
      })
      if (focused.inBar) break
      expect(focused.below, focused.name).toBeGreaterThanOrEqual(0)
      steps++
    }
    // It went back through the page (each readiness answer's group is one stop), not straight to the bar.
    expect(steps).toBeGreaterThan(10)
  })

  test('focus in the top bar leaves the page where it is', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: HEADING })).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, 3000))
    await expect.poll(() => scrollY(page)).toBe(3000)

    // As when focus comes back to the bar, after a dialog opened from it closes.
    await page.getByRole('banner').getByRole('link', { name: 'Find my path' }).focus()
    await page.keyboard.press('Shift+Tab')

    expect(await scrollY(page)).toBe(3000)
  })
})

test.describe('on a desktop', () => {
  test.use({ viewport: SIZES.desktop })

  test('Back from a section link returns to where the page was', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: HEADING })).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, 600))
    await expect.poll(() => scrollY(page)).toBe(600)

    await sectionLink(page, 'Qualifications').click()
    await expect(page).toHaveURL('/#catalog')
    await expect.poll(() => offBar(page, '#catalog')).toBeLessThanOrEqual(1)

    await page.goBack()

    await expect(page).toHaveURL('/')
    await expect.poll(() => scrollY(page)).toBe(600)
  })

  test("Back to a section's address returns to where the learner left it", async ({ page }) => {
    await serveCatalog(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: HEADING })).toBeVisible()
    await sectionLink(page, 'Qualifications').click()
    await expect(page).toHaveURL('/#catalog')
    await expect.poll(() => offBar(page, '#catalog')).toBeLessThanOrEqual(1)
    const section = await scrollY(page)
    // Read on, well past the section's top, to the next section's link.
    const cta = page.getByRole('link', { name: 'Go to My progress' })
    await cta.scrollIntoViewIfNeeded()
    await settle(page)
    const left = await scrollY(page)
    expect(left).toBeGreaterThan(section + 400)

    await cta.click()
    await expect(page.getByRole('heading', { level: 1, name: 'My Progress' })).toBeVisible()
    await page.goBack()

    await expect(page).toHaveURL('/#catalog')
    await expect.poll(() => scrollY(page)).toBe(left)
  })

  test("the top bar's links scroll to their sections when Home shows again, too", async ({
    page,
  }) => {
    await serveCatalog(page)
    await page.goto('/qualifications')
    await page.getByRole('link', { name: 'TESDA Track home' }).click()
    await expect(page.getByRole('heading', { level: 1, name: HEADING })).toBeVisible()
    await page.getByRole('link', { name: 'Open the qualifications library' }).click()
    await page.goBack()
    await expect(page.getByRole('heading', { level: 1, name: HEADING })).toBeVisible()

    await sectionLink(page, 'My progress').click()

    await expect(page).toHaveURL('/#progress')
    await expect.poll(() => offBar(page, '#progress')).toBeLessThanOrEqual(1)
  })

  test('a reload opens Home at the top, so its first showing has nowhere to return to', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: HEADING })).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, 3000))
    await expect.poll(() => scrollY(page)).toBe(3000)

    await page.reload()

    await expect(page.getByRole('heading', { level: 1, name: HEADING })).toBeVisible()
    await settle(page)
    expect(await scrollY(page)).toBe(0)
  })

  test("the top bar's links scroll to their sections, below the bar", async ({ page }) => {
    await page.goto('/')
    const sections = page.getByRole('navigation', { name: 'Sections' })

    await sections.getByRole('link', { name: 'Qualifications' }).click()

    const heading = page.locator('#catalog')
    await expect(heading).toBeInViewport()
    const barBottom = await page
      .getByRole('banner')
      .evaluate((bar) => bar.getBoundingClientRect().bottom)
    const sectionTop = await heading.evaluate((section) => section.getBoundingClientRect().top)
    expect(Math.abs(sectionTop - barBottom)).toBeLessThanOrEqual(2)
    await expect(page.getByRole('banner')).toHaveAttribute('data-scrolled')
  })

  test('the readiness example scores answers from the keyboard', async ({ page }) => {
    await page.goto('/')
    const check = page.getByRole('group', { name: 'Barista NC II · core units' })
    await expect(check.getByRole('status')).toHaveText('60% Moderate readiness')

    // The last unit starts at "New to me": arrow back to "Confident".
    const last = check.getByRole('radiogroup').last()
    await last.getByRole('radio', { name: 'New to me' }).focus()
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')

    await expect(last.getByRole('radio', { name: 'Confident' })).toBeChecked()
    await expect(check.getByRole('status')).toHaveText('80% High readiness')
    await expect(page.locator('li[aria-current]')).toContainText('Apply for the NC assessment')
  })

  test('Home works with the API blocked', async ({ page }) => {
    const isApi = (url: URL) => url.pathname.startsWith('/api/')
    const requests: string[] = []
    page.on('request', (request) => {
      if (isApi(new URL(request.url()))) requests.push(request.url())
    })
    await page.route(isApi, (route) => route.abort())

    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: HEADING })).toBeVisible()
    await scrollThrough(page)

    for (const name of SECTIONS) {
      await expect(page.getByRole('heading', { level: 2, name })).toBeAttached()
    }
    await expect(goalBox(page)).toBeVisible()
    expect(requests).toEqual([])
  })
})
