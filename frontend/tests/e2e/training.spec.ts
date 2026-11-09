import { AxeBuilder } from '@axe-core/playwright'
import { devices, expect, test, type Page } from '@playwright/test'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { learnerAccounts, NO_LEARNER_ACCOUNTS } from './accounts.ts'
import { MAPTILER_KEY, serveVectorTiles, type VectorTileOptions } from './mapTiles.ts'

// Training & Assessment (US-07, US-08, US-09): the map and the list, in both themes, on a phone and a desktop, with
// axe; the list without the map, with the keyboard; a pin's popup; directions from a shared location; and applying.
// The map is drawn by MapLibre from vector tiles (docs/center-map.md), with Leaflet as its fallback: both are checked.
// The API and the map tiles are answered here (mapTiles.ts cuts real vector tiles from a little made-up data).

declare global {
  interface Window {
    /** Development builds put the MapLibre map here (CenterMapLibre.tsx). */
    __trackCenterMap?: MapLibreMap
  }
}

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

type Engine = 'maplibre' | 'leaflet'

/**
 * The API and the map's tiles. With MapLibre (the default) the deployment has a MapTiler key; with Leaflet it has
 * none, which is what keeps a deployment on Leaflet. `config` overrides the deployment's other settings. Returns the
 * MapTiler paths the map asked for.
 */
async function serveTraining(
  page: Page,
  {
    engine = 'maplibre',
    config = {},
    tiles = {},
  }: { engine?: Engine; config?: Record<string, unknown>; tiles?: VectorTileOptions } = {},
) {
  await page.route(
    /^https:\/\/([a-d]\.)?(tile\.openstreetmap\.org|basemaps\.cartocdn\.com)\//,
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
    tsp_sign_in: false,
    tsp_suggestions: false,
    map_engine: 'maplibre',
    maptiler_key: engine === 'maplibre' ? MAPTILER_KEY : '',
    map_tiles_url: '',
    map_3d: true,
    ...config,
  })
  // With a query when the page asks only for the learner's area. Like the listings, these ignore the radius: the
  // page applies its own.
  await json('**/api/v1/training-providers*', [MANILA, CEBU])
  await json('**/api/v1/assessment-centers*', [MANILA_AC])
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
  return serveVectorTiles(page, tiles)
}

/** Routes by car and on foot, from Makati to the Manila Welding Institute. */
async function serveRoutes(page: Page) {
  const leg = (mode: string, via: number[], distance_km: number, duration_min: number) => ({
    mode,
    path: [[14.555, 121.024], via, [14.5995, 120.9842]],
    start: [14.555, 121.024],
    end: [14.5995, 120.9842],
    distance_km,
    duration_min,
  })
  await page.route('**/api/v1/routes?*', (route) =>
    route.fulfill({
      json: {
        routing_enabled: true,
        routes: [leg('car', [14.58, 121.0], 10.3, 14), leg('foot', [14.57, 121.01], 9.6, 122)],
        missing_modes: [],
      },
    }),
  )
}

/** The MapLibre map, drawn, its tiles loaded, and still. */
async function mapSettled(page: Page) {
  await expect(page.locator('.center-map[data-engine="maplibre"] .maplibregl-canvas')).toBeVisible()
  await page.waitForFunction(() => {
    const map = window.__trackCenterMap
    return Boolean(map?.loaded() && !map.isMoving())
  })
}

/** Reads the MapLibre map, as the page has it. */
const readMap = <T>(page: Page, read: (map: MapLibreMap) => T) =>
  page.evaluate(
    ([source]) => new Function('map', `return (${source})(map)`)(window.__trackCenterMap),
    [read.toString()] as const,
  ) as Promise<T>

/** Each renderer's own parts, for the checks both run. */
const RENDERERS = {
  maplibre: {
    ready: mapSettled,
    popup: '.maplibregl-popup',
    routeLabels: '.center-map-hit',
    attribution: '.maplibregl-ctrl-attrib',
  },
  leaflet: {
    ready: (page: Page) => expect(page.locator('.leaflet-container')).toBeVisible(),
    popup: '.leaflet-popup',
    routeLabels: '.leaflet-tooltip',
    attribution: '.leaflet-control-attribution',
  },
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

/** The search radius drawn around the learner's location, `km` across, or none. */
async function expectRadius(page: Page, km: number | null) {
  const map = page.locator('.center-map')
  if (km === null) await expect(map).not.toHaveAttribute('data-radius-km')
  else await expect(map).toHaveAttribute('data-radius-km', String(km))
  await mapSettled(page)
  const drawn = await readMap(
    page,
    (map) => map.queryRenderedFeatures({ layers: ['center-radius-fill'] }).length,
  )
  if (km === null) expect(drawn).toBe(0)
  else expect(drawn).toBeGreaterThan(0)
}

test('the map and results fill the available height as the window resizes', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 })
  await serveTraining(page)
  await page.goto('/training')
  await expect(page.locator('.center-map')).toBeVisible()

  const expectFilledWorkspace = async () => {
    await expect
      .poll(() =>
        page.evaluate(() => {
          const map = document.querySelector<HTMLElement>('.center-map')!
          // What MapLibre draws on: its canvas, sized to the map.
          const tiles = map.querySelector<HTMLElement>('.maplibregl-canvas')!
          const results = document.querySelector<HTMLElement>('[data-tour="training-results"]')!
          const main = document.querySelector<HTMLElement>('main')!
          const mapBounds = map.getBoundingClientRect()
          const resultsBounds = results.getBoundingClientRect()
          const bottom = innerHeight - parseFloat(getComputedStyle(main).paddingBottom)
          return Math.max(
            Math.abs(mapBounds.bottom - bottom),
            Math.abs(resultsBounds.bottom - bottom),
            Math.abs(mapBounds.height - resultsBounds.height),
            Math.abs(tiles.clientHeight - map.clientHeight),
            Math.abs(tiles.clientWidth - map.clientWidth),
          )
        }),
      )
      .toBeLessThanOrEqual(2)
  }

  for (const viewport of [
    { width: 1920, height: 900 },
    { width: 1920, height: 1200 },
    { width: 1600, height: 700 },
  ]) {
    await page.setViewportSize(viewport)
    await expectFilledWorkspace()
  }

  const results = resultsRegion(page)
  const scroll = await results.evaluate((element) => {
    element.scrollTop = element.scrollHeight
    return { top: element.scrollTop, height: element.clientHeight, content: element.scrollHeight }
  })
  expect(scroll.content).toBeGreaterThan(scroll.height)
  expect(scroll.top).toBeGreaterThan(0)
  await expect(results.getByRole('button', { name: /^View details:/ }).last()).toBeInViewport()

  await page.getByRole('button', { name: 'Hide map' }).click()
  await expect(page.locator('.center-map')).toHaveCount(0)
  await expect
    .poll(() => results.evaluate((element) => element.scrollHeight - element.clientHeight))
    .toBeLessThanOrEqual(1)
  await page.getByRole('button', { name: 'Show map' }).click()
  await expect(page.locator('.center-map')).toBeVisible()
  await expectFilledWorkspace()
})

test('narrow and phone screens keep the results below the map in the page flow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await serveTraining(page)
  await page.goto('/training')
  await expect(page.locator('.center-map')).toBeVisible()
  await page.getByRole('button', { name: 'Show filters' }).click()

  for (const viewport of [
    { width: 375, height: 812 },
    { width: 812, height: 375 },
    { width: 1366, height: 768 },
  ]) {
    await page.setViewportSize(viewport)
    await expect
      .poll(() =>
        page.evaluate(() => {
          const map = document.querySelector<HTMLElement>('.center-map')!.getBoundingClientRect()
          const results = document.querySelector<HTMLElement>('[data-tour="training-results"]')!
          return {
            stacked: results.getBoundingClientRect().top >= map.bottom,
            usableMapHeight: map.height > 300,
            horizontalOverflow:
              document.documentElement.scrollWidth - document.documentElement.clientWidth,
            resultsOverflow: results.scrollHeight - results.clientHeight,
          }
        }),
      )
      .toEqual({ stacked: true, usableMapHeight: true, horizontalOverflow: 0, resultsOverflow: 0 })
  }
})

for (const colorScheme of ['light', 'dark'] as const) {
  for (const [size, viewport] of Object.entries(SIZES)) {
    test(`${colorScheme} theme, ${size}: the map and the list, passing axe`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ colorScheme })
      await serveTraining(page)
      await page.goto('/training')

      await expect(page.getByRole('heading', { level: 2, name: 'All results (3)' })).toBeVisible()
      await mapSettled(page)
      // MapLibre draws the pins; a button over each makes it reachable without a mouse.
      await expect(page.locator('.center-map-pin, .center-map-cluster').first()).toBeAttached()
      await expectSettledAndAccessible(page)
    })
  }
}

for (const [size, viewport] of Object.entries(SIZES)) {
  test(`${size}: opens on the learner’s area within 10 km, and the radius can be changed and cleared`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ colorScheme: size === 'phone' ? 'dark' : 'light' })
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 14.5547, longitude: 121.0244 })
    await serveTraining(page)
    const providers = page.waitForRequest(/\/api\/v1\/training-providers\?/)
    await page.goto('/training')

    // Asked for as the page opens: only the learner's area is loaded, a little wider than the page's radius.
    const asked = new URL((await providers).url()).searchParams
    expect([asked.get('near_lat'), asked.get('near_lon'), asked.get('radius_km')]).toEqual([
      '14.55',
      '121.02',
      '11',
    ])
    await expect(page.getByRole('heading', { name: 'All results (2)' })).toBeVisible()
    await expect(page.getByText('Within 10 km of your location', { exact: true })).toBeVisible()
    await expectRadius(page, 10)
    await expect(
      page.getByRole('button', { name: 'Cebu Skills Center, training center' }),
    ).toHaveCount(0)
    await expect(page).not.toHaveURL(/radius=/)
    if (size === 'phone') await page.getByRole('button', { name: 'Show filters' }).click()
    const radius = page.getByRole('button', { name: /Radius near me/ })
    await expect(radius).toContainText('Within 10 km')
    await expectSettledAndAccessible(page)

    await radius.click()
    await page.getByRole('option', { name: 'Within 5 km', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'All results (0)' })).toBeVisible()
    await expect(page).toHaveURL(/radius=5/)
    await expectRadius(page, 5)
    await page.getByRole('button', { name: 'Show all distances' }).click()
    await expect(page.getByRole('heading', { name: 'All results (3)' })).toBeVisible()
    await expectRadius(page, null)
    await expect(page).toHaveURL(/radius=any/)
    await expect(radius).toContainText('All distances')
  })

  test(`${size}: a failed region lookup retains filters and recovers locally`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await serveTraining(page)
    let available = false
    await page.route('**/api/v1/regions', (route) =>
      available ? route.fulfill({ json: REGIONS }) : route.abort(),
    )
    await page.goto('/training?type=training&region=NCR&q=Manila')
    await expect(page.getByRole('alert')).toContainText('Your search and filters are still here', {
      timeout: 15_000,
    })
    await expect(page.getByRole('heading', { name: /^All results/ })).toHaveCount(0)
    await expect(page.getByRole('searchbox', { name: 'Search centers' })).toHaveValue('Manila')
    if (size === 'phone') await page.getByRole('button', { name: 'Show filters' }).click()
    const panel = page.locator('[data-tour="training-filters"]')
    await expect(panel).toBeVisible()
    const layout = await panel.evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      stageHeight: element.parentElement!.parentElement!.getBoundingClientRect().height,
    }))
    expect(layout.height).toBeGreaterThan(100)
    expect(layout.stageHeight).toBeGreaterThanOrEqual(layout.height)
    await page.getByRole('searchbox', { name: 'Search location' }).fill('Cebu City')
    available = true
    await page.getByRole('button', { name: 'Try loading the list again' }).click()
    await expect(page.getByRole('heading', { name: 'All results (1)' })).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByRole('searchbox', { name: 'Search centers' })).toHaveValue('Manila')
    // Opening a failed request's filters again must retain this unsent place draft as well.
    const showFilters = page.getByRole('button', { name: 'Show filters' })
    if (await showFilters.isVisible()) await showFilters.click()
    await expect(page.getByRole('searchbox', { name: 'Search location' })).toHaveValue('Cebu City')
    await expect(page).toHaveURL(/region=NCR/)
  })
}

test.describe('on a desktop', () => {
  test.use({ viewport: SIZES.desktop })

  for (const engine of ['maplibre', 'leaflet'] as const) {
    const renderer = RENDERERS[engine]

    test(`${engine}: a pin’s popup shows the center, and View details opens it in the list`, async ({
      page,
    }) => {
      await serveTraining(page, { engine })
      await page.goto('/training?type=training')
      await expect(page.getByRole('heading', { level: 2, name: 'All results (2)' })).toBeVisible()
      await renderer.ready(page)

      await page.getByRole('button', { name: 'Cebu Skills Center, training center' }).click()
      const popup = page.locator(renderer.popup)
      await expect(popup.getByText('Cebu Skills Center')).toBeVisible()
      await popup.getByRole('button', { name: 'View details' }).click()

      await expect(
        resultsRegion(page).getByRole('heading', { level: 3, name: 'Cebu Skills Center' }),
      ).toBeFocused()
      await expect(page).toHaveURL(/center=training-2/)
    })

    test(`${engine}: draws the route from a shared location, and its labels pick the travel mode`, async ({
      page,
      context,
    }) => {
      await context.grantPermissions(['geolocation'])
      await context.setGeolocation({ latitude: 14.5547, longitude: 121.0244 })
      await serveTraining(page, { engine })
      await serveRoutes(page)
      // The page asks for the location as it opens.
      await page.goto('/training?type=training')

      await expect(page.getByText('Approximate distances from your location')).toBeVisible()
      await renderer.ready(page)
      await resultsRegion(page).getByRole('button', { name: 'Get directions' }).click()

      await expect(page.getByText('10.3 km · about 14 min by car')).toBeVisible()
      const labels = page.locator(renderer.routeLabels)
      const car = labels.getByRole('button', { name: /14 min · 10.3 km/ })
      await expect(car).toBeVisible()
      await expect(car).toHaveAttribute('aria-pressed', 'true')
      await expect(page.locator(renderer.attribution)).toContainText('Route by OSRM')

      // The walking route's label on the map picks walking in the list too.
      await labels.getByRole('button', { name: /on foot/ }).click()
      await expect(page.getByRole('radio', { name: /on foot/ })).toBeChecked()
      await expect(page.getByText('9.6 km · about 2 hr 2 min on foot')).toBeVisible()
      await expect(car).toHaveAttribute('aria-pressed', 'false')
    })
  }

  test('works without the map: hidden, it isn’t downloaded, and every center opens with the keyboard (US-08)', async ({
    page,
  }) => {
    await serveTraining(page)
    await page.goto('/training')
    await mapSettled(page)
    await page.getByRole('button', { name: 'Hide map' }).click()
    await expect(page.locator('.center-map')).toHaveCount(0)
    // MapLibre's resources go with it.
    await expect.poll(() => page.evaluate(() => window.__trackCenterMap === undefined)).toBe(true)

    const downloaded: string[] = []
    page.on('request', (request) => downloaded.push(request.url()))
    await page.reload()
    await expect(page.getByRole('heading', { level: 2, name: 'All results (3)' })).toBeVisible()
    await expect(page.locator('.center-map')).toHaveCount(0)
    // Neither renderer, nor any map tile, is downloaded while the map is hidden.
    expect(downloaded.filter((url) => /CenterMap|maplibre|leaflet|maptiler/i.test(url))).toEqual([])

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
    test.skip(!learnerAccounts, NO_LEARNER_ACCOUNTS)
    await serveTraining(page)
    await page.goto('/training?type=assessment')

    await page.getByRole('button', { name: 'Apply' }).click()

    await expect(page.getByRole('dialog', { name: 'Sign in' })).toBeVisible()
  })

  test('offers a guest no Apply: the app is guest-only', async ({ page }) => {
    test.skip(learnerAccounts, 'Learner accounts are on')
    await serveTraining(page)
    await page.goto('/training?type=assessment')

    await expect(page.getByRole('heading', { name: /Upcoming assessments/ }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Apply' })).toHaveCount(0)
  })
})

test.describe('the MapLibre map', () => {
  test.use({ viewport: SIZES.desktop })

  test('draws vector tiles, with its labels in the app’s own font rather than a font server', async ({
    page,
  }) => {
    const asked = await serveTraining(page)
    await page.goto('/training')
    await mapSettled(page)

    expect(asked).toContain('/tiles/v3/tiles.json')
    expect(asked.some((path) => /^\/tiles\/v3\/\d+\/\d+\/\d+\.pbf$/.test(path))).toBe(true)
    expect(asked.filter((path) => path.startsWith('/fonts/'))).toEqual([])
    const style = await readMap(page, (map) => ({
      glyphs: map.getStyle().glyphs,
      fonts: map.getLayoutProperty('label-city', 'text-font'),
    }))
    expect(style).toEqual({ glyphs: undefined, fonts: ['Figtree Bold', 'Figtree'] })
    await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText(
      'OpenStreetMap contributors',
    )
    // MapTiler's logo, which its free plan asks for.
    await expect(page.getByRole('link', { name: 'MapTiler', exact: true })).toBeVisible()
  })

  test('clusters nearby centers, and a cluster opens to the centers in it', async ({ page }) => {
    await serveTraining(page)
    await page.goto('/training')
    await mapSettled(page)
    const zoom = () => readMap(page, (map) => map.getZoom())

    // Manila's two centers are one cluster at the country's scale; Cebu's is a pin of its own.
    const cluster = page.getByRole('button', { name: '2 centers here: zoom in' })
    await expect(cluster).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Cebu Skills Center, training center' }),
    ).toBeVisible()
    const before = await zoom()
    await cluster.click()
    await mapSettled(page)
    await expect(
      page.getByRole('button', { name: 'Manila Welding Institute, training center' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Manila Assessment Center, assessment center' }),
    ).toBeVisible()
    expect(await zoom()).toBeGreaterThan(before + 3)
  })

  test('a pin opens from the keyboard, and Escape closes it, back on the pin', async ({ page }) => {
    await serveTraining(page)
    await page.goto('/training?type=training')
    await mapSettled(page)

    const pin = page.getByRole('button', { name: 'Cebu Skills Center, training center' })
    await pin.focus()
    await page.keyboard.press('Enter')
    const popup = page.locator('.maplibregl-popup')
    await expect(popup.getByText('Cebu Skills Center')).toBeVisible()
    await expect(popup.getByRole('button', { name: 'View details' })).toBeFocused()
    // The center is selected, as a click on its pin selects it.
    await expect(page).toHaveURL(/center=training-2/)

    await page.keyboard.press('Escape')
    await expect(popup).toHaveCount(0)
    await expect(pin).toBeFocused()
  })

  test('3D raises only the buildings with a recorded height, and 2D lays them flat again', async ({
    page,
  }) => {
    await serveTraining(page)
    await page.goto('/training')
    await mapSettled(page)
    const toggle = page.getByRole('button', { name: 'Show buildings in 3D' })
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')

    // Zoomed out, there are no buildings to raise yet, and the map says so rather than showing nothing.
    await toggle.click()
    await expect(page.getByRole('status')).toHaveText('Zoom in to see buildings in 3D.')
    await expect.poll(() => readMap(page, (map) => map.getPitch())).toBeGreaterThan(50)
    await expect(page.locator('.center-map')).toHaveAttribute('data-three-d', 'true')

    // Makati's blocks: half the buildings have a recorded height.
    await page.evaluate(() =>
      window.__trackCenterMap!.jumpTo({ center: [121.022, 14.555], zoom: 16 }),
    )
    await mapSettled(page)
    await expect(page.getByRole('status')).toHaveCount(0)
    const heights = await readMap(page, (map) => ({
      raised: map
        .queryRenderedFeatures({ layers: ['building-3d'] })
        .map((feature) => Number(feature.properties.render_height)),
      flat: map
        .queryRenderedFeatures({ layers: ['building'] })
        .map((feature) => Number(feature.properties.render_height)),
    }))
    expect(heights.raised.length).toBeGreaterThan(0)
    expect(heights.raised.every((height) => height > 5)).toBe(true)
    // OpenMapTiles' 5 m default is never drawn as a height.
    expect(heights.flat.length).toBeGreaterThan(0)
    expect(heights.flat.every((height) => height <= 5)).toBe(true)

    // Kept for this browser, then turned off again: flat and north up.
    await page.reload()
    await mapSettled(page)
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await toggle.click()
    await expect
      .poll(() => readMap(page, (map) => [map.getPitch(), map.getBearing()]))
      .toEqual([0, 0])
    await expect(page.locator('.center-map')).not.toHaveAttribute('data-three-d')
  })

  test('isn’t offered in 3D where the deployment turns it off, or on a low-end device', async ({
    page,
  }) => {
    await serveTraining(page, { config: { map_3d: false } })
    await page.goto('/training')
    await mapSettled(page)
    await expect(page.getByRole('button', { name: 'Zoom in', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Show buildings in 3D' })).toHaveCount(0)

    // A phone with little memory gets a dependable 2D map.
    await page.addInitScript(() =>
      Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 1 }),
    )
    await serveTraining(page)
    await page.reload()
    await mapSettled(page)
    await expect(page.getByRole('button', { name: 'Show buildings in 3D' })).toHaveCount(0)
    expect(await readMap(page, (map) => map.getPixelRatio())).toBeLessThanOrEqual(1.5)
  })

  test('follows the app’s theme without being drawn again from scratch', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await serveTraining(page)
    await page.goto('/training')
    await mapSettled(page)
    const land = () =>
      readMap(page, (map) => map.getPaintProperty('background', 'background-color'))
    expect(await land()).toBe('#13213e')
    const canvas = await page.locator('.maplibregl-canvas').elementHandle()

    // The app's own theme switch, from System to Light.
    await page.getByRole('radio', { name: 'System' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('radio', { name: 'Light' })).toBeChecked()
    await expect.poll(land).toBe('#f2f4f7')
    // The same map, restyled: its canvas wasn't replaced.
    expect(await canvas!.evaluate((element) => element.isConnected)).toBe(true)
  })

  test('a lost drawing context says so, and the map carries on once it’s back', async ({
    page,
  }) => {
    await serveTraining(page)
    await page.goto('/training?type=training')
    await mapSettled(page)

    await page.evaluate(() => {
      const gl = window.__trackCenterMap!.getCanvas().getContext('webgl2')!
      const lose = gl.getExtension('WEBGL_lose_context')!
      Object.assign(window, { restoreContext: () => lose.restoreContext() })
      lose.loseContext()
    })
    await expect(page.getByRole('status')).toHaveText('The map stopped drawing. Restoring it…')
    await page.evaluate(() =>
      (window as unknown as { restoreContext: () => void }).restoreContext(),
    )
    await expect(page.getByRole('status')).toHaveCount(0)
    await mapSettled(page)
    await expect(
      page.getByRole('button', { name: 'Cebu Skills Center, training center' }),
    ).toBeVisible()
    // Still MapLibre: it came back rather than giving way to Leaflet.
    await expect(page.locator('.center-map')).toHaveAttribute('data-engine', 'maplibre')
  })

  test('when the vector tiles are refused, it shows OpenStreetMap’s map instead, once', async ({
    page,
  }) => {
    await serveTraining(page, { tiles: { tileJsonStatus: 403 } })
    await page.goto('/training')
    await expect(page.getByRole('status')).toHaveText(
      'The detailed map could not load, so the OpenStreetMap map is shown instead.',
    )
    await expect
      .poll(() => readMap(page, (map) => Object.keys(map.getStyle().sources)))
      .toContain('osm')
    await expect(page.getByRole('button', { name: '2 centers here: zoom in' })).toBeVisible()
  })
})

test.describe('the Leaflet fallback', () => {
  test.use({ viewport: SIZES.desktop })

  for (const [why, setUp] of [
    ['no vector tiles are set up', (page: Page) => serveTraining(page, { engine: 'leaflet' })],
    [
      'the deployment keeps Leaflet',
      (page: Page) => serveTraining(page, { config: { map_engine: 'leaflet' } }),
    ],
    [
      'the browser has no WebGL 2',
      async (page: Page) => {
        await page.addInitScript(() => {
          const getContext = HTMLCanvasElement.prototype.getContext
          HTMLCanvasElement.prototype.getContext = function (
            this: HTMLCanvasElement,
            type: string,
            ...rest: unknown[]
          ) {
            return type === 'webgl2' ? null : Reflect.apply(getContext, this, [type, ...rest])
          } as typeof getContext
        })
        return serveTraining(page)
      },
    ],
  ] as const) {
    test(`draws the map when ${why}, without downloading MapLibre`, async ({ page }) => {
      const downloaded: string[] = []
      page.on('request', (request) => downloaded.push(request.url()))
      await setUp(page)
      await page.goto('/training')
      await expect(
        page.locator('.center-map[data-engine="leaflet"] .leaflet-container'),
      ).toBeVisible()
      await expect(
        page.getByRole('button', { name: 'Cebu Skills Center, training center' }),
      ).toBeVisible()
      // Only CenterMap.tsx's small check of the browser: not MapLibre, its renderer or its tiles.
      expect(downloaded.filter((url) => /maplibre-gl|CenterMapLibre|maptiler/i.test(url))).toEqual(
        [],
      )
    })
  }
})

test.describe('on a touch screen', () => {
  // A Pixel 7's screen, touch and user agent (its browser type can only be chosen for a whole file).
  const { viewport, userAgent, deviceScaleFactor } = devices['Pixel 7']
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile: true, hasTouch: true })

  test('one finger scrolls the page and two move the map; the controls keep clear of each other', async ({
    page,
  }) => {
    await serveTraining(page)
    await page.goto('/training?type=training')
    await mapSettled(page)
    // MapLibre's two-finger hint is set up, and the page, not the map, takes a one-finger swipe.
    await expect(page.locator('.maplibregl-cooperative-gesture-screen')).toBeAttached()
    expect(
      await page
        .locator('.maplibregl-canvas-container')
        .evaluate((element) => getComputedStyle(element).touchAction),
    ).toBe('pan-x pan-y')

    const boxes = await page.locator('.center-map').evaluate((map) => {
      const box = (element: Element | null) => element?.getBoundingClientRect().toJSON() as DOMRect
      return {
        map: box(map),
        controls: [
          ...map.querySelectorAll(
            ':scope > .absolute:not([role="status"]) button, :scope > .absolute > div[aria-hidden]',
          ),
        ].map(box),
      }
    })
    for (const [i, a] of boxes.controls.entries()) {
      expect(a.left).toBeGreaterThanOrEqual(boxes.map.left)
      expect(a.right).toBeLessThanOrEqual(boxes.map.right)
      for (const b of boxes.controls.slice(i + 1)) {
        const apart =
          a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top
        expect(apart, JSON.stringify([a, b])).toBe(true)
      }
    }

    // A tap opens a pin's popup, which fits the map.
    const pin = page.getByRole('button', { name: 'Cebu Skills Center, training center' })
    await pin.scrollIntoViewIfNeeded()
    await pin.tap()
    const popup = page.locator('.maplibregl-popup')
    await expect(popup.getByText('Cebu Skills Center')).toBeVisible()
    await mapSettled(page)
    const fits = await popup.evaluate((element) => {
      const map = element.closest('.center-map')!.getBoundingClientRect()
      const box = element.getBoundingClientRect()
      return box.left >= map.left && box.right <= map.right && box.top >= map.top
    })
    expect(fits).toBe(true)
  })
})

test('in the TSP webview, the map loads and leaves without touching the address, Back or the session', async ({
  page,
}) => {
  await page.setViewportSize(SIZES.phone)
  await serveTraining(page)
  const sessions: string[] = []
  page.on('request', (request) => {
    if (/\/api\/v1\/(auth|me)\b/.test(new URL(request.url()).pathname)) sessions.push(request.url())
  })
  await page.goto('/tsp/webview')
  await expect(page.getByRole('heading', { name: 'Find your TESDA qualification' })).toBeVisible()
  await page.getByRole('link', { name: /Find a center near you/ }).click()
  await expect(page).toHaveURL(/\/tsp\/webview\/training/)
  await mapSettled(page)
  const before = {
    history: await page.evaluate(() => history.length),
    url: page.url(),
    sessions: sessions.length,
  }

  // Opening a cluster and zooming change neither the address nor Back, and ask nothing of the session.
  await page.getByRole('button', { name: '2 centers here: zoom in' }).click()
  await mapSettled(page)
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await mapSettled(page)
  expect(await page.evaluate(() => history.length)).toBe(before.history)
  expect(page.url()).toBe(before.url)
  expect(sessions.length).toBe(before.sessions)

  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Find your TESDA qualification' })).toBeVisible()
  // The map went with the page: nothing of it is left running.
  await expect.poll(() => page.evaluate(() => window.__trackCenterMap === undefined)).toBe(true)
})
