import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// My Progress (US-09, US-10, US-11) for a signed-in learner with records, in both themes, on a phone and a desktop,
// with axe; ticking a step and withdrawing an application with the keyboard. The API is answered here.

const SIZES = {
  phone: { width: 375, height: 812 },
  landscape: { width: 812, height: 375 },
  desktop: { width: 1280, height: 800 },
}
// Must match SESSION_HINT_KEY in src/auth/session.ts.
const SESSION_HINT_KEY = 'tesda-track.signed-in'
const LEARNER = {
  id: '6f1c2a52-8b7e-4d3a-9c51-2f0e7a1b3c4d',
  email: 'maria@example.com',
  full_name: 'Maria Santos',
  role: 'learner',
  created_at: '2026-10-01T08:00:00Z',
}
const welding = {
  code: 'SMAW-NCII',
  name: 'Shielded Metal Arc Welding (SMAW) NC II',
  sector: 'Metals',
}
const steps = [
  {
    id: 1,
    position: 1,
    kind: 'self_check',
    title: 'Complete the readiness check',
    description: '',
    status: 'completed',
  },
  {
    id: 2,
    position: 2,
    kind: 'training',
    title: 'Take focused training',
    description: '',
    status: 'not_started',
  },
]
const ENROLLMENT = {
  id: 'enrollment-1',
  pathway: {
    id: 7,
    qualification: welding,
    route: 'SKILL_GAP_CHECK',
    title: 'Close your skill gaps',
    description: '',
    steps: [],
  },
  status: 'active',
  completion_percent: 50,
  steps,
  completed_at: null,
  created_at: '2026-10-02T00:00:00Z',
  updated_at: '2026-10-02T00:00:00Z',
}
const APPLICATION = {
  id: 'application-1',
  schedule: {
    id: 21,
    qualification: welding,
    center: {
      id: 1,
      name: 'Manila Assessment Center',
      region_code: 'NCR',
      city: 'Manila',
      latitude: 14.6,
      longitude: 120.98,
    },
    scheduled_at: '2099-12-01T01:00:00Z',
    slots: 15,
    seats_left: 4,
    fee: '750.00',
    status: 'open',
  },
  status: 'pending',
  result: null,
  reviewer_note: null,
  created_at: '2026-10-03T00:00:00Z',
  updated_at: '2026-10-03T00:00:00Z',
}
const check = (id: string, at: string, score: number) => ({
  id,
  qualification: welding,
  score,
  level: score >= 50 ? 'Moderate readiness' : 'Low readiness',
  strengths: [],
  skill_gaps: [],
  recommendation: '',
  answers: { 1: 'confident' },
  recommendation_session_id: null,
  created_at: at,
})

async function serveLearner(page: Page) {
  await page.addInitScript((key) => window.localStorage.setItem(key, 'signed-in'), SESSION_HINT_KEY)
  const json = (url: string, body: unknown) =>
    page.route(url, (route) => route.fulfill({ json: body }))
  await json('**/api/v1/qualifications', [
    { ...welding, possible_jobs: ['Welder'], competencies: [] },
  ])
  await json('**/api/v1/me', LEARNER)
  await json('**/api/v1/me/recommendations?*', [])
  await json('**/api/v1/me/readiness-checks', [
    check('c-1', '2026-10-01T02:00:00Z', 35),
    check('c-2', '2026-10-09T02:00:00Z', 76),
  ])
  await json('**/api/v1/me/goals', [])
  await json('**/api/v1/me/certifications', [])
  await page.route('**/api/v1/me/pathways', (route) => route.fulfill({ json: [ENROLLMENT] }))
  await page.route('**/api/v1/me/pathways/*/steps/*', (route) =>
    route.fulfill({
      json: {
        ...ENROLLMENT,
        status: 'completed',
        completion_percent: 100,
        steps: steps.map((step) => ({ ...step, status: 'completed' })),
      },
    }),
  )
  await page.route('**/api/v1/me/assessment-applications', (route) =>
    route.fulfill({ json: [APPLICATION] }),
  )
  await page.route('**/api/v1/me/assessment-applications/*/withdraw', (route) =>
    route.fulfill({ json: { ...APPLICATION, status: 'withdrawn' } }),
  )
}

async function expectSettledAndAccessible(page: Page) {
  await expect(page.getByRole('status')).toHaveCount(0)
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)))
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
  const results = await new AxeBuilder({ page }).exclude('[data-live-announcer]').analyze()
  expect(
    results.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map((node) => node.html) })),
  ).toEqual([])
}

for (const colorScheme of ['light', 'dark'] as const) {
  for (const [size, viewport] of Object.entries(SIZES)) {
    test(`${colorScheme} theme, ${size}: the learner’s records, passing axe`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ colorScheme })
      await serveLearner(page)
      await page.goto('/progress')

      await expect(
        page.getByRole('heading', { level: 2, name: 'Continue your journey' }),
      ).toBeVisible()
      const sections = page.getByRole('navigation', { name: 'My Progress sections' })
      await expect(
        sections.getByRole('button', { name: 'Qualifications', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true')
      await expect(sections.getByRole('button', { name: 'History', exact: true })).toHaveCount(0)
      const collection = page.getByRole('region', { name: 'My qualification goals' })
      await expect(collection.getByText('1 qualification saved')).toBeVisible()
      await expect(collection.getByText('BSRS not connected')).toBeVisible()
      await expect(collection.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
      await expect(page.getByRole('region', { name: 'Recommendation history' })).toHaveCount(0)
      await expect(page.getByRole('region', { name: 'My pathways' })).toHaveCount(0)
      await expect(page.getByRole('region', { name: 'Readiness over time' })).toHaveCount(0)
      const navigationOverflow = await sections.evaluate(
        (element) => element.scrollWidth - element.clientWidth,
      )
      expect(navigationOverflow).toBeLessThanOrEqual(0)
      await expectSettledAndAccessible(page)
      await collection.screenshot({ path: testInfo.outputPath('qualification-collection.png') })
      await page.screenshot({ path: testInfo.outputPath('progress-sections.png'), fullPage: true })
      await sections.getByRole('button', { name: 'Readiness', exact: true }).click()
      await expect(page.getByText('Up 41 points from Oct 1, 2026 to Oct 9, 2026.')).toBeVisible()
      await expect(collection).toHaveCount(0)
      await expect(
        sections.getByRole('button', { name: 'Readiness', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true')
      expect(new URL(page.url()).searchParams.get('section')).toBe('readiness')
      await expectSettledAndAccessible(page)
    })
  }
}

test.describe('on a desktop', () => {
  test.use({ viewport: SIZES.desktop })

  test('opens a shared section and returns to Qualifications with the keyboard', async ({
    page,
  }) => {
    await serveLearner(page)
    await page.goto('/progress?section=records')
    await expect(page).toHaveURL('/profile?section=records')
    const sections = page.getByRole('navigation', { name: 'Profile sections' })
    await expect(
      sections.getByRole('button', { name: 'Goals & certificates', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('region', { name: 'My goals' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'My certifications' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'My qualification goals' })).toHaveCount(0)
    await page.reload()
    await expect(
      sections.getByRole('button', { name: 'Goals & certificates', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'My Progress' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('region', { name: 'My qualification goals' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'My goals' })).toHaveCount(0)
    await expect(page).toHaveURL('/progress')
    await expectSettledAndAccessible(page)
  })

  test('ticks off a step and withdraws an application, with the keyboard', async ({ page }) => {
    await serveLearner(page)
    await page.goto('/progress')

    await page.getByRole('button', { name: 'Continue your pathway' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { level: 2, name: 'My pathways' })).toBeFocused()
    expect(new URL(page.url()).searchParams.get('section')).toBe('pathways')
    await expect(page.getByRole('region', { name: 'My qualification goals' })).toHaveCount(0)

    await page.getByRole('checkbox', { name: '2. Take focused training' }).focus()
    await page.keyboard.press('Space')
    await expect(page.getByText('Completed', { exact: true })).toBeVisible()

    await page.goto('/profile?section=applications')
    await expect(page.getByRole('region', { name: 'My assessment applications' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'My pathways' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Withdraw', exact: true }).focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('alertdialog', { name: 'Withdraw this application?' })
    await expect(dialog).toBeVisible()
    await expectSettledAndAccessible(page)
    await dialog.getByRole('button', { name: 'Withdraw application' }).focus()
    await page.keyboard.press('Enter')

    await expect(page.getByText('Your application was withdrawn.')).toBeVisible()
    await expect(page.getByText('Withdrawn', { exact: true })).toBeVisible()
  })

  test('groups a qualification’s routes, navigates to its steps, and removes the selection', async ({
    page,
  }, testInfo) => {
    await serveLearner(page)
    const qualification = { code: 'COOKERY-NCII', name: 'Cookery NC II', sector: 'Tourism' }
    const cooking = {
      ...ENROLLMENT,
      id: 'cooking',
      pathway: { ...ENROLLMENT.pathway, id: 12, qualification, title: 'Build your cookery skills' },
      created_at: '2026-10-03T00:00:00Z',
      completion_percent: 0,
      steps: steps.map((step) => ({ ...step, status: 'not_started' })),
    }
    let enrollments = [
      ENROLLMENT,
      {
        ...ENROLLMENT,
        id: 'alternate',
        pathway: { ...ENROLLMENT.pathway, id: 8, title: 'Prepare for assessment' },
      },
      cooking,
    ]
    await page.route('**/api/v1/me/pathways', (route) => route.fulfill({ json: enrollments }))
    await page.route('**/api/v1/me/pathways/*', async (route) => {
      const id = route.request().url().split('/').pop()
      const record = enrollments.find((item) => item.id === id)!
      const updated = { ...record, status: 'withdrawn' }
      enrollments = enrollments.map((item) => (item.id === id ? updated : item))
      await route.fulfill({ json: updated })
    })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/progress')
    const collection = page.getByRole('region', { name: 'My qualification goals' })
    await expect(collection.getByText('2 qualifications saved')).toBeVisible()
    await expect(collection.getByRole('article')).toHaveCount(2)
    await collection.getByRole('button', { name: /Prepare for assessment/ }).click()
    await expect(page.getByRole('heading', { name: 'Prepare for assessment' })).toBeFocused()
    await expect(collection).toHaveCount(0)
    await expect(
      page.getByRole('region', { name: 'My pathways' }).getByRole('article'),
    ).toHaveCount(3)
    await expectSettledAndAccessible(page)
    await page
      .getByRole('navigation', { name: 'My Progress sections' })
      .getByRole('button', { name: 'Qualifications', exact: true })
      .click()
    await collection.screenshot({ path: testInfo.outputPath('qualification-bento.png') })
    await collection.getByRole('button', { name: `Remove: ${welding.name}` }).click()
    await expect(collection.getByText('1 qualification saved')).toBeVisible()
    await expect(collection.getByRole('heading', { name: 'My qualification goals' })).toBeFocused()
    await page
      .getByRole('navigation', { name: 'My Progress sections' })
      .getByRole('button', { name: 'Pathways', exact: true })
      .click()
    await expect(
      page.getByRole('region', { name: 'My pathways' }).getByRole('article'),
    ).toHaveCount(1)
  })
})
