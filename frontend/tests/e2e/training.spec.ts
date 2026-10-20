import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// Training & Assessment (US-07, US-08, US-09): the map and the list, in both themes, on a phone and a desktop, with
// axe; the list without the map, with the keyboard; a pin's popup; directions from a shared location; and applying.
// The API and the map tiles are answered here.

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
const REGIONS = [
  {
    code: 'NCR',
    name: 'National Capital Region',
    center_city: 'Manila',
    latitude: 14.5995,
    longitude: 120.9842,
  },
  {
    code: 'VII',
    name: 'Central Visayas',
    center_city: 'Cebu City',
    latitude: 10.3157,
    longitude: 123.8854,
  },
]
const site = (
  id: number,
  name: string,
  region: string,
  city: string,
  latitude: number,
  longitude: number,
) => ({
  id,
  name,
  region_code: region,
  province: null,
  city,
  address: `${id} Example Street, ${city}`,
  latitude,
  longitude,
  contact_email: `center${id}@example.com`,
  contact_phone: '+63 2 0000 0000',
  website: null,
  is_active: true,
})
const summary = (s: ReturnType<typeof site>) => ({
  id: s.id,
  name: s.name,
  region_code: s.region_code,
  city: s.city,
  latitude: s.latitude,
  longitude: s.longitude,
})
const MANILA = site(1, 'Manila Welding Institute', 'NCR', 'Manila', 14.5995, 120.9842)
const CEBU = site(2, 'Cebu Skills Center', 'VII', 'Cebu City', 10.3157, 123.8854)
const MANILA_AC = site(1, 'Manila Assessment Center', 'NCR', 'Manila', 14.6, 120.98)
const qualification = { code: 'SMAW-NCII', name: CATALOG[0].name, sector: CATALOG[0].sector }
const SERVICE_EVIDENCE = {
  verification: {
    status: 'verified',
    source_name: 'Test registry',
    source_reference: 'test-service',
    reviewed_at: '2020-01-01T00:00:00Z',
    review_due_at: '2101-01-01T00:00:00Z',
    requirements_reviewed: true,
    requirements: [],
  },
  availability: {
    status: 'available',
    source_reference: 'test-intake',
    checked_at: '2020-01-01T00:00:00Z',
    valid_until: '2101-01-01T00:00:00Z',
  },
}
const program = (id: number, provider: ReturnType<typeof site>) => ({
  ...SERVICE_EVIDENCE,
  id,
  title: `Shielded Metal Arc Welding (SMAW) NC II · Batch ${id}`,
  description: null,
  qualification,
  provider: summary(provider),
  delivery_mode: 'institution_based',
  duration_hours: 268,
  cost: null,
  scholarship_available: true,
  start_date: '2099-11-02',
  end_date: null,
  slots: 25,
  is_active: true,
})
const SCHEDULE = {
  ...SERVICE_EVIDENCE,
  id: 21,
  qualification,
  center: summary(MANILA_AC),
  scheduled_at: '2099-12-01T01:00:00Z',
  slots: 15,
  seats_left: 4,
  fee: '750.00',
  status: 'open',
}
// A transparent 1x1 PNG, for every map tile.
const TILE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

async function serveTraining(page: Page) {
  await page.route(
    /^https:\/\/[a-d]\.(tile\.openstreetmap\.org|basemaps\.cartocdn\.com)\//,
    (route) => route.fulfill({ body: TILE, contentType: 'image/png' }),
  )
  const json = (url: string, body: unknown) =>
    page.route(url, (route) => route.fulfill({ json: body }))
  await json('**/api/v1/qualifications', CATALOG)
  await json('**/api/v1/regions', REGIONS)
  await json('**/api/v1/client-config', {
    carto_key: '',
    routing_enabled: true,
    skills_bridge_enabled: true,
  })
  await json('**/api/v1/training-providers', [MANILA, CEBU])
  await json('**/api/v1/assessment-centers', [MANILA_AC])
  await json('**/api/v1/training-programs?*', [program(11, MANILA), program(12, CEBU)])
  await json('**/api/v1/assessment-schedules?*', [SCHEDULE])
  await json('**/api/v1/routes?*', {
    routing_enabled: true,
    routes: [
      {
        mode: 'car',
        path: [
          [14.555, 121.024],
          [14.58, 121.0],
          [14.5995, 120.9842],
        ],
        start: [14.555, 121.024],
        end: [14.5995, 120.9842],
        distance_km: 10.3,
        duration_min: 14,
      },
    ],
    missing_modes: [],
  })
}

async function expectSettledAndAccessible(page: Page) {
  await expect(page.getByRole('status')).toHaveCount(0)
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
  // React Aria's live announcer holds what it just read out for a few seconds after a choice in a list.
  const results = await new AxeBuilder({ page }).exclude('[data-live-announcer]').analyze()
  expect(
    results.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map((node) => node.html) })),
  ).toEqual([])
}

const resultsRegion = (page: Page) => page.getByRole('region', { name: /^All results/ })

for (const colorScheme of ['light', 'dark'] as const) {
  for (const [size, viewport] of Object.entries(SIZES)) {
    test(`${colorScheme} theme, ${size}: the map and the list, passing axe`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ colorScheme })
      await serveTraining(page)
      await page.goto('/training')

      await expect(page.getByRole('heading', { level: 2, name: 'All results (3)' })).toBeVisible()
      await expect(
        page.locator('.leaflet-marker-icon, .leaflet-marker-pane > *').first(),
      ).toBeAttached()
      await expectSettledAndAccessible(page)
    })
  }
}

test.describe('on a desktop', () => {
  test.use({ viewport: SIZES.desktop })

  test('a pin’s popup shows the center, and View details opens it in the list', async ({
    page,
  }) => {
    await serveTraining(page)
    await page.goto('/training?type=training')
    await expect(page.getByRole('heading', { level: 2, name: 'All results (2)' })).toBeVisible()

    await page.getByRole('button', { name: 'Cebu Skills Center, training center' }).click()
    const popup = page.locator('.leaflet-popup')
    await expect(popup.getByText('Cebu Skills Center')).toBeVisible()
    await popup.getByRole('button', { name: 'View details' }).click()

    await expect(
      resultsRegion(page).getByRole('heading', { level: 3, name: 'Cebu Skills Center' }),
    ).toBeFocused()
    await expect(page).toHaveURL(/center=training-2/)
  })

  test('draws the route from a shared location', async ({ page, context }) => {
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 14.5547, longitude: 121.0244 })
    await serveTraining(page)
    await page.goto('/training?type=training')

    await page.getByText('Use my location', { exact: true }).click()
    await expect(page.getByText('Approximate distances from your location')).toBeVisible()
    await resultsRegion(page).getByRole('button', { name: 'Get directions' }).click()

    await expect(page.getByText('10.3 km · about 14 min by car')).toBeVisible()
    await expect(
      page.locator('.leaflet-tooltip').getByRole('button', { name: /14 min · 10.3 km/ }),
    ).toBeVisible()
    await expect(page.locator('.leaflet-control-attribution')).toContainText('Route by OSRM')
  })

  test('works without the map: hidden, it isn’t downloaded, and every center opens with the keyboard (US-08)', async ({
    page,
  }) => {
    await serveTraining(page)
    await page.goto('/training')
    await page.getByRole('button', { name: 'Hide map' }).click()
    await expect(page.locator('.leaflet-container')).toHaveCount(0)

    await page.reload()
    await expect(page.getByRole('heading', { level: 2, name: 'All results (3)' })).toBeVisible()
    await expect(page.locator('.leaflet-container')).toHaveCount(0)

    const open = resultsRegion(page).getByRole('button', {
      name: 'View details: Manila Welding Institute',
    })
    await open.focus()
    await page.keyboard.press('Enter')
    await expect(
      resultsRegion(page).getByRole('heading', { level: 3, name: 'Manila Welding Institute' }),
    ).toBeFocused()
    await expectSettledAndAccessible(page)
  })

  test('applying asks a guest to sign in first', async ({ page }) => {
    await serveTraining(page)
    await page.goto('/training?type=assessment')

    await page.getByRole('button', { name: 'Apply' }).click()

    await expect(page.getByRole('dialog', { name: 'Sign in' })).toBeVisible()
  })
})
