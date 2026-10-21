import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { exampleRecommendationAnalytics } from '../../src/test/recommendationAnalytics.ts'

// Reports for an administrator: every report in both themes, on a phone and a desktop, with axe; a period and a
// qualification chosen with the keyboard; and a backwards period refused before any request. The API is answered
// here.

const SIZES = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1280, height: 800 },
}
// Must match SESSION_HINT_KEY in src/auth/session.ts.
const SESSION_HINT_KEY = 'tesda-track.signed-in'
const ADMIN = {
  id: '0b9d7e1f-3c2a-4b5d-8e6f-7a1b2c3d4e5f',
  email: 'admin@example.com',
  full_name: 'Ana Reyes',
  role: 'admin',
  permissions: [
    'assessments:manage',
    'integrations:manage',
    'mcp:manage',
    'pathways:manage',
    'reports:read',
    'training:manage',
    'users:manage',
    'verifications:manage',
  ],
  created_at: '2026-10-01T08:00:00Z',
}
const CATALOG = [
  ['SMAW-NCII', 'Shielded Metal Arc Welding (SMAW) NC II', 'Metals and Engineering'],
  ['CKY-NCII', 'Cookery NC II', 'Tourism'],
  ['BKP-NCIII', 'Bookkeeping NC III', 'Business and management'],
].map(([code, name, sector]) => ({ code, name, sector, possible_jobs: [], competencies: [] }))
const demandRow = (index: number, checks: number, average: number | null) => ({
  qualification: {
    code: CATALOG[index].code,
    name: CATALOG[index].name,
    sector: CATALOG[index].sector,
  },
  top_match: checks * 2,
  chosen: checks,
  readiness_checks: checks,
  average_readiness: average,
  assessment_applications: 1,
  competent: 0,
  certified: 0,
})

interface Served {
  reports: string[]
}

async function serveReports(page: Page): Promise<Served> {
  const served: Served = { reports: [] }
  await page.addInitScript((key) => window.localStorage.setItem(key, 'signed-in'), SESSION_HINT_KEY)
  const json = (url: string, body: unknown) =>
    page.route(url, (route) => route.fulfill({ json: body }))
  const report = (name: string, body: (url: URL) => unknown) =>
    page.route(new RegExp(`/api/v1/admin/reports/${name}(\\?|$)`), (route) => {
      const url = new URL(route.request().url())
      served.reports.push(`${name}${url.search}`)
      return route.fulfill({ json: body(url) })
    })
  await json('**/api/v1/qualifications', CATALOG)
  await json('**/api/v1/me', ADMIN)
  await report('overview', () => ({
    learners: 1250,
    recommendation_sessions: 310,
    semantic_analyses: 200,
    readiness_checks: 96,
    average_readiness: 61.2,
    training_rankings: 40,
    assessment_applications: { pending: 3 },
    certifications: { total: 9, verified: 7 },
  }))
  await report('funnel', () => ({
    registered: 1250,
    saved_a_recommendation: 310,
    checked_readiness: 80,
    applied_for_assessment: 12,
    certified: 7,
  }))
  await report('qualification-demand', () => [
    demandRow(0, 30, 67.5),
    demandRow(1, 12, 48),
    demandRow(2, 0, null),
  ])
  await report('recommendation-analytics', () => exampleRecommendationAnalytics)
  await report('matching', () => ({ requests: 45, no_match: 3, no_match_rate: 3 / 45, days: [] }))
  await report('skill-gaps', (url) =>
    [
      'Prepare tools and equipment',
      'Apply safety practices',
      'Perform the core work of the qualification to industry standard',
    ].map((name, index) => ({
      competency_id: index + 1,
      position: index + 1,
      name: `${name} (${url.searchParams.get('qualification_code')})`,
      answers: 10,
      confident: 6 - index,
      some_experience: 2,
      not_familiar: 2 + index,
      gap_rate: (4 + index) / 10,
    })),
  )
  await report('supply', () =>
    ['National Capital Region', 'Bangsamoro Autonomous Region in Muslim Mindanao'].map(
      (region, index) => ({
        region_code: `R${index}`,
        region,
        training_providers: 12,
        training_programs: 30,
        upcoming_assessments: 5,
        open_seats: 40,
      }),
    ),
  )
  await report('feedback', () => ({
    answers: 42,
    satisfied: 31,
    by_place: {
      top_match: { answers: 30, satisfied: 26 },
      other_match: { answers: 7, satisfied: 3 },
      own_choice: { answers: 5, satisfied: 2 },
    },
    reasons: { wrong_qualification: 6, readiness_off: 2, pathway_not_helpful: 1, none: 2 },
    by_model: [{ model: 'intfloat/multilingual-e5-small', answers: 42, satisfied: 31 }],
    by_qualification: [
      { qualification: demandRow(0, 0, null).qualification, answers: 30, satisfied: 24 },
      { qualification: demandRow(1, 0, null).qualification, answers: 12, satisfied: 7 },
    ],
  }))
  return served
}

async function expectAccessible(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
  const results = await new AxeBuilder({ page }).exclude('[data-live-announcer]').analyze()
  expect(
    results.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map((node) => node.html) })),
  ).toEqual([])
}

const gapTable = (page: Page) => page.getByRole('table', { name: /^Self-reported skill gaps for / })

for (const colorScheme of ['light', 'dark'] as const) {
  for (const [size, viewport] of Object.entries(SIZES)) {
    test(`${colorScheme} theme, ${size}: every report, passing axe`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ colorScheme })
      await serveReports(page)
      await page.goto('/reports')

      await expect(page.getByRole('heading', { level: 2, name: 'Learner journey' })).toBeVisible()
      await expect(gapTable(page)).toBeVisible()
      await expect(page.getByText('74% satisfied: 31 of 42 answers.')).toBeVisible()
      await expect(
        page.getByRole('table', {
          name: 'Recommendation improvement priorities by qualification, model and intent',
        }),
      ).toBeVisible()
      await expect(page.getByText('Needs more learners', { exact: true })).toBeVisible()
      for (const name of [
        'Feedback distribution',
        'Feedback by qualification',
        'Learner interest comparison',
      ]) {
        await expect(page.getByRole('figure', { name, exact: true })).toBeVisible()
      }
      await expectAccessible(page)
    })
  }
}

test.describe('on a desktop', () => {
  test.use({ viewport: SIZES.desktop })

  test('recommendation analytics are available in the admin Recommendation tab', async ({
    page,
  }, testInfo) => {
    await serveReports(page)
    await page.goto('/admin?section=recommendations')
    const analytics = page.getByRole('region', { name: 'Recommendation analytics', exact: true })
    await expect(
      analytics.getByRole('table', {
        name: 'Recommendation improvement priorities by qualification, model and intent',
      }),
    ).toBeVisible()
    await expect(analytics.getByText('Needs more learners', { exact: true })).toBeVisible()
    for (const name of [
      'Feedback distribution',
      'Feedback by qualification',
      'Learner interest comparison',
    ]) {
      await expect(analytics.getByRole('figure', { name, exact: true })).toBeVisible()
    }
    await expectAccessible(page)
    await analytics.screenshot({ path: testInfo.outputPath('recommendation-analytics.png') })
  })

  test('a period and a qualification chosen with the keyboard', async ({ page }) => {
    const served = await serveReports(page)
    await page.goto('/reports')
    await expect(gapTable(page)).toHaveAccessibleName(
      'Self-reported skill gaps for Shielded Metal Arc Welding (SMAW) NC II',
    )

    await page.getByLabel('From (optional)').focus()
    await page.keyboard.type('10012026')
    await expect(page).toHaveURL('/reports?from=2026-10-01')
    await expect(page.getByText('Showing activity from Oct 1, 2026.')).toBeVisible()
    await expect.poll(() => served.reports).toContain('overview?date_from=2026-10-01')

    const picker = page.getByRole('combobox', { name: 'Qualification' })
    await picker.focus()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('cook')
    await expect(page.getByRole('option', { name: 'Cookery NC II' })).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL('/reports?from=2026-10-01&qualification=CKY-NCII')
    await expect(picker).toHaveValue('Cookery NC II')
    await expect(gapTable(page)).toHaveAccessibleName('Self-reported skill gaps for Cookery NC II')
    await expect
      .poll(() => served.reports)
      .toContain('skill-gaps?qualification_code=CKY-NCII&date_from=2026-10-01')
  })

  test('refuses an end date before the start without asking the API', async ({ page }) => {
    const served = await serveReports(page)
    await page.goto('/reports?from=2026-10-15')
    await expect(page.getByRole('heading', { level: 2, name: 'Learner journey' })).toBeVisible()
    const before = served.reports.length

    await page.getByLabel('To (optional)').fill('2026-10-01')

    await expect(page.getByRole('alert')).toHaveText(
      'Choose an end date on or after the start date.',
    )
    await expect(page.getByLabel('To (optional)')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByRole('heading', { name: 'Learner journey' })).toHaveCount(0)
    expect(served.reports).toHaveLength(before)
    await expectAccessible(page)

    await page.getByRole('button', { name: 'Clear dates' }).click()
    await expect(page).toHaveURL('/reports')
    await expect(page.getByRole('heading', { level: 2, name: 'Learner journey' })).toBeVisible()
  })
})
