import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// Skills Explorer: a lookup's results, an occupation's details and a qualification's delivery map, in both themes,
// on a phone and a desktop, with axe; the whole journey with the keyboard; and a pin opening Training & Assessment.
// The API, Skills Bridge's answers and the map tiles are answered here.

const SIZES = {
  phone: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
}

const CATALOG = [
  {
    code: 'SMAW-NCII',
    name: 'Shielded Metal Arc Welding (SMAW) NC II',
    sector: 'Metals and Engineering',
    possible_jobs: ['Welder'],
    competencies: [],
  },
]
const site = (id: number, name: string, city: string, latitude: number, longitude: number) => ({
  id,
  name,
  region_code: 'NCR',
  province: null,
  city,
  address: `${id} Example Street, ${city}`,
  latitude,
  longitude,
  contact_email: null,
  contact_phone: null,
  website: null,
  is_active: true,
})
const MANILA = site(1, 'Manila Welding Institute', 'Manila', 14.5995, 120.9842)
const QUEZON = site(2, 'Quezon City Assessment Center', 'Quezon City', 14.676, 121.0437)
const summary = (s: ReturnType<typeof site>) => ({
  id: s.id,
  name: s.name,
  region_code: s.region_code,
  city: s.city,
  latitude: s.latitude,
  longitude: s.longitude,
})
const qualification = { code: 'SMAW-NCII', name: CATALOG[0].name, sector: CATALOG[0].sector }
const PROGRAM = {
  id: 11,
  title: 'Shielded Metal Arc Welding (SMAW) NC II · Evening batch',
  description: null,
  qualification,
  provider: summary(MANILA),
  delivery_mode: 'institution_based',
  duration_hours: 268,
  cost: null,
  scholarship_available: true,
  start_date: '2099-11-02',
  end_date: null,
  slots: 25,
  is_active: true,
}
const SCHEDULE = {
  id: 21,
  qualification,
  center: summary(QUEZON),
  scheduled_at: '2099-12-01T01:00:00Z',
  slots: 15,
  seats_left: 4,
  fee: '750.00',
  status: 'open',
}

const EXPLORATION = {
  source: 'Skills Bridge',
  source_url: 'https://skills-bridge.ph',
  retrieved_at: '2026-10-15T02:30:00Z',
  searched: true,
  reason: null,
  terms: ['welder', 'teamwork'],
  occupation_terms: ['welder'],
  skill_terms: ['teamwork'],
  unmatched: [],
  resolution: [
    { term: 'welder', strength: 'strong', matched_occupations: 3 },
    { term: 'teamwork', strength: 'moderate', matched_skills: 12 },
  ],
  occupations: [
    {
      occupation_id: 101,
      title: 'Welder',
      sector: 'Manufacturing',
      score: 0.92,
      terms_matched: ['welder'],
      match_kind: 'occupation',
    },
    {
      occupation_id: 102,
      title: 'Fabricator',
      sector: null,
      score: 0.41,
      terms_matched: ['teamwork'],
      open_posts: 3,
      match_kind: 'skill',
    },
  ],
  qualifications: [
    {
      code: 'SMAW-NCII',
      title: 'Shielded Metal Arc Welding (SMAW) NC II',
      level_label: 'NC II',
      status: 'promulgated',
      terms_matched: ['teamwork'],
      skill_share: 0.18,
      evidence: [{ term: 'teamwork', skills: ['Work in a team environment'] }],
    },
  ],
}
const WELDER = {
  source: 'Skills Bridge',
  source_url: 'https://skills-bridge.ph',
  retrieved_at: '2026-10-15T02:31:00Z',
  data: {
    profile: {
      occupation: { occupation_id: 101, title: 'Welder', sector: 'Manufacturing' },
      standards: [
        {
          code: 'SMAW-NCII',
          title: 'Shielded Metal Arc Welding (SMAW) NC II',
          level_label: 'NC II',
          status: 'promulgated',
        },
      ],
    },
    skills: [
      { skill_id: 1, name: 'Read welding symbols', type: 'technical_skill' },
      { skill_id: 2, name: 'Teamwork', type: 'soft_skill' },
    ],
    benchmarks: [
      {
        title: 'Welders and flame cutters',
        status: 'confirmed',
        source: 'ISCO-08',
        standard: '7212',
        sample_skills: ['Welding'],
      },
    ],
    warnings: [],
  },
}

// A transparent 1x1 PNG, for every map tile.
const TILE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

async function serveSkills(page: Page) {
  await page.route(
    /^https:\/\/[a-d]\.(tile\.openstreetmap\.org|basemaps\.cartocdn\.com)\//,
    (route) => route.fulfill({ body: TILE, contentType: 'image/png' }),
  )
  const json = (url: string, body: unknown) =>
    page.route(url, (route) => route.fulfill({ json: body }))
  await json('**/api/v1/qualifications', CATALOG)
  await json('**/api/v1/regions', [
    {
      code: 'NCR',
      name: 'National Capital Region',
      center_city: 'Manila',
      latitude: 14.5995,
      longitude: 120.9842,
    },
  ])
  await json('**/api/v1/client-config', {
    carto_key: '',
    routing_enabled: false,
    skills_bridge_enabled: true,
  })
  await json('**/api/v1/training-providers', [MANILA])
  await json('**/api/v1/assessment-centers', [QUEZON])
  await json('**/api/v1/training-programs?*', [PROGRAM])
  await json('**/api/v1/assessment-schedules?*', [SCHEDULE])
  // Training & Assessment ranks programs for a chosen qualification, once a pin opens it there.
  await json('**/api/v1/recommendations/training', {
    weights: { semantic: 0.5, proximity: 0.2, assessment: 0.15, schedule: 0.1, preference: 0.05 },
    semantic_used: false,
    audit_id: null,
    results: [],
  })
  await json('**/api/v1/skills-bridge/explore', EXPLORATION)
  await json('**/api/v1/skills-bridge/occupations/101', WELDER)
}

const sentenceBox = (page: Page) =>
  page.getByRole('textbox', { name: 'What skills or roles are you exploring?' })
const smawCard = (page: Page) =>
  page.getByRole('article', { name: 'Shielded Metal Arc Welding (SMAW) NC II' }).first()

async function expectAccessible(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
  // Let color transitions finish first: axe reads a button that's still fading to its pressed colors partway through,
  // and fails its contrast. On a phone the occupation's button is off screen when pressed, and is still fading here.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation instanceof CSSTransition)
        .map((transition) => transition.finished.catch(() => undefined)),
    ),
  )
  const results = await new AxeBuilder({ page }).exclude('[data-live-announcer]').analyze()
  expect(
    results.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map((node) => node.html) })),
  ).toEqual([])
}

for (const colorScheme of ['light', 'dark'] as const) {
  for (const [size, viewport] of Object.entries(SIZES)) {
    test(`${colorScheme} theme, ${size}: results, details and the delivery map, passing axe`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ colorScheme })
      await serveSkills(page)
      await page.goto('/skills')

      await sentenceBox(page).fill('I want to be a welder, good at teamwork')
      await page.getByRole('button', { name: /Find career matches/ }).click()
      await expect(
        page.getByRole('heading', { level: 2, name: 'Occupations to explore' }),
      ).toBeVisible()
      await page.getByText('How your skills were understood').click()
      await smawCard(page).getByText('See matching skills').click()
      await smawCard(page).getByText('Find TESDA training & assessment options').click()
      await smawCard(page)
        .getByRole('button', { name: /Show available sites/ })
        .click()
      await expect(smawCard(page).getByText('2 sites with listings')).toBeVisible()
      await expect(page.locator('.leaflet-marker-icon').first()).toBeAttached()
      await expectAccessible(page)

      await page.getByRole('button', { name: 'Explore skills & qualifications: Welder' }).click()
      await expect(page.getByRole('heading', { level: 2, name: 'Welder' })).toBeFocused()
      await page
        .getByRole('group', { name: 'Skills I already have' })
        .getByText('Teamwork', { exact: true })
        .click()
      await expect(page.getByText('1 self-reported strength · 1 skill remaining')).toBeVisible()
      await expectAccessible(page)
    })
  }
}

test.describe('on a desktop', () => {
  test.use({ viewport: SIZES.desktop })

  test('the whole journey works with the keyboard', async ({ page }) => {
    await serveSkills(page)
    await page.goto('/skills')

    await sentenceBox(page).focus()
    await page.keyboard.type('welder, teamwork')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: /Find career matches/ })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('status')).toHaveText(
      '2 occupations and 1 linked qualification found.',
    )

    // Tab moves on from the button into the results.
    await page.keyboard.press('Tab')
    await expect(page.getByText('How your skills were understood')).toBeFocused()
    await page.keyboard.press('Tab')
    const explore = page.getByRole('button', { name: 'Explore skills & qualifications: Welder' })
    await expect(explore).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { level: 2, name: 'Welder' })).toBeFocused()
    await expect(explore).toHaveAttribute('aria-pressed', 'true')

    const teamwork = page.getByRole('checkbox', { name: 'Teamwork' })
    await teamwork.focus()
    await page.keyboard.press('Space')
    await expect(teamwork).toBeChecked()
    await expect(
      page.getByRole('table', { name: 'Skills to explore' }).getByText('Teamwork'),
    ).toHaveCount(0)
  })

  test('a pin’s View details opens the center in Training & Assessment', async ({ page }) => {
    await serveSkills(page)
    await page.goto('/skills')
    await sentenceBox(page).fill('teamwork')
    await page.getByRole('button', { name: /Find career matches/ }).click()
    await smawCard(page).getByText('Find TESDA training & assessment options').click()
    await smawCard(page)
      .getByRole('button', { name: /Show available sites/ })
      .click()

    await page.getByRole('button', { name: 'Manila Welding Institute, training center' }).click()
    await page.locator('.leaflet-popup').getByRole('button', { name: 'View details' }).click()

    await expect(page).toHaveURL('/training?qualification=SMAW-NCII&center=training-1')
    await expect(
      page.getByRole('heading', { level: 3, name: 'Manila Welding Institute' }).first(),
    ).toBeVisible()
  })

  test('says so when Skills Bridge can’t answer, and keeps the rest in view', async ({ page }) => {
    await serveSkills(page)
    await page.route('**/api/v1/skills-bridge/explore', (route) =>
      route.fulfill({
        status: 503,
        json: { detail: 'Skills Bridge is unavailable right now. Please try again shortly.' },
      }),
    )
    await page.goto('/skills')

    await sentenceBox(page).fill('welder')
    await page.getByRole('button', { name: /Find career matches/ }).click()

    await expect(page.getByRole('alert')).toContainText('Skills Bridge is unavailable right now.')
    await expect(
      page.getByRole('heading', { level: 2, name: 'Start with what you know' }),
    ).toBeVisible()
    await expectAccessible(page)
  })
})
