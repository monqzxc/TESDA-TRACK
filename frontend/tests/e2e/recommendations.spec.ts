import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  EvidenceMeasure,
  QualificationEvidenceResponse,
} from '../../src/features/labor-market/evidenceApi.ts'
import { MAPTILER_KEY, serveVectorTiles } from './mapTiles.ts'

// Every API response and map tile is an isolated E2E fixture. No learner records or source reviews are written.
const OUTPUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../output/verification')
const GOAL = 'I repair computers and want related work near Manila.'
const REASON = 'Your computer-repair experience relates to the servicing competencies.'
const CSS = {
  code: 'CSS-NC-II',
  name: 'Computer Systems Servicing NC II',
  sector: 'Information and Communication Technology',
  possible_jobs: ['Computer technician'],
  competencies: [],
}
const WELDING = {
  code: 'MMAW-NC-II',
  name: 'Manual Metal Arc Welding NC II',
  sector: 'Metals and Engineering',
  possible_jobs: ['Welder'],
  competencies: [],
}
const REGIONS = [
  {
    code: 'NCR',
    name: 'National Capital Region',
    center_city: 'Manila',
    latitude: 14.5995,
    longitude: 120.9842,
  },
  {
    code: 'IV-A',
    name: 'CALABARZON',
    center_city: 'Calamba',
    latitude: 14.2117,
    longitude: 121.1653,
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
  address: `${id} Isolated Fixture Street, ${city}`,
  latitude,
  longitude,
  contact_email: `site${id}@example.invalid`,
  contact_phone: null,
  website: null,
  is_active: true,
})
const COMPUTER_SITE = site(
  11,
  'Example Computer Training Center',
  'NCR',
  'Manila',
  14.5995,
  120.9842,
)
const CEBU_SITE = site(21, 'Example Cebu Computer Center', 'VII', 'Cebu City', 10.3157, 123.8854)
const WELDING_SITE = site(12, 'Example Welding Center', 'NCR', 'Manila', 14.61, 120.99)
const ASSESSMENT_SITE = site(
  31,
  'Example Computer Assessment Center',
  'NCR',
  'Manila',
  14.61,
  120.99,
)
const SERVICE = {
  verification: {
    status: 'verified',
    source_name: 'Isolated E2E authority fixture',
    source_reference: 'test-only-service-record',
    reviewed_at: '2020-01-01T00:00:00Z',
    review_due_at: '2101-01-01T00:00:00Z',
    requirements_reviewed: true,
    requirements: [],
  },
  availability: {
    status: 'available',
    source_reference: 'isolated-e2e-intake',
    checked_at: '2020-01-01T00:00:00Z',
    valid_until: '2101-01-01T00:00:00Z',
  },
}
const program = (id: number, provider: ReturnType<typeof site>, qualification = CSS) => ({
  ...SERVICE,
  id,
  title: `${qualification.name} · Isolated E2E batch`,
  qualification,
  provider,
  description: null,
  delivery_mode: 'institution_based',
  duration_hours: 280,
  cost: null,
  scholarship_available: true,
  start_date: '2099-11-02',
  end_date: null,
  slots: 20,
  is_active: true,
})
const PROGRAMS = [
  program(101, COMPUTER_SITE),
  program(102, CEBU_SITE),
  program(103, WELDING_SITE, WELDING),
]
const SCHEDULE = {
  ...SERVICE,
  id: 201,
  qualification: CSS,
  center: ASSESSMENT_SITE,
  scheduled_at: '2099-12-01T01:00:00Z',
  slots: 12,
  seats_left: 4,
  fee: '750.00',
  status: 'open',
}
const PROFILE = {
  career_goal: 'Computer technician',
  existing_skills: ['computer repair'],
  intent: 'training_recommendation',
}

function measure(name: string, value: number | null, unit: string): EvidenceMeasure {
  return {
    name,
    value,
    unit,
    evidence_kind: 'observed',
    geography: {
      scope: 'regional',
      region_code: 'IV-A',
      label: 'CALABARZON · isolated test evidence',
    },
    reference_period: 'Snapshot 4 November 2026',
    observed_on: '2026-11-04',
    sources: ['Isolated E2E fixture; no production source claim'],
    method_version: 'e2e-fixture-v1',
    known_record_count: value === null ? 0 : 2,
    eligible_record_count: 2,
    unknown_count: value === null ? 2 : 0,
    coverage: value === null ? 0 : 1,
    statement:
      value === null
        ? 'Current capacity is unknown in this test fixture.'
        : 'Dated isolated test observations.',
    limitations: [],
  }
}

function evidence(region: string | null): QualificationEvidenceResponse {
  return {
    context: {
      qualification_code: CSS.code,
      region_code: region,
      evaluated_at: '2026-11-10T10:00:00+08:00',
      method_versions: {},
    },
    forecast_support: [],
    observed_postings: {
      postings: measure('postings', 11, 'posting records'),
      employers: measure('employers', 2, 'employers'),
      by_qualification: { [CSS.code]: 11 },
      overlap_count: 0,
      repeated_captures: 0,
      suspected_duplicate_groups: 0,
      unallocated_count: 0,
      snapshot_dates: ['2026-11-04'],
      posted_between: ['2026-10-05', '2026-11-04'],
      dataset_keys: ['isolated-e2e-postings@1'],
      fingerprint: 'isolated-test-data',
    },
    supply: {
      registered_training_sites: measure('sites', 2, 'sites'),
      registered_training_programs: measure('programs', 2, 'program records'),
      confirmed_training_offerings: measure('offerings', 2, 'offerings'),
      published_training_slots: measure('slots', 40, 'published slots'),
      remaining_training_seats: measure('remaining', null, 'seats'),
      confirmed_assessment_schedules: measure('assessments', 1, 'schedules'),
      confirmed_assessment_sites: measure('assessment-sites', 1, 'sites'),
      remaining_assessment_seats: measure('remaining-assessment', 4, 'seats'),
      completeness: {},
    },
    limitations: ['Test-only regional observations do not establish municipal demand.'],
  }
}

async function serveRecommendations(page: Page, mapEngine: 'leaflet' | 'maplibre' = 'maplibre') {
  const seen = {
    goal: [] as Record<string, unknown>[],
    matches: [] as Record<string, unknown>[],
    access: [] as Record<string, unknown>[],
    evidence: [] as URL[],
    area: [] as URL[],
    urls: [] as string[],
  }
  await serveVectorTiles(page)
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    seen.urls.push(url.href)
    const json = (body: unknown, status = 200) => route.fulfill({ json: body, status })
    if (path === '/api/v1/qualifications') return json([CSS, WELDING])
    if (path === '/api/v1/regions') return json(REGIONS)
    if (path === '/api/v1/client-config')
      return json({
        carto_key: '',
        routing_enabled: true,
        skills_bridge_enabled: false,
        tsp_sign_in: false,
        tsp_suggestions: false,
        map_engine: mapEngine,
        maptiler_key: MAPTILER_KEY,
        map_tiles_url: '',
        map_3d: true,
      })
    if (path === '/api/v1/training-providers') return json([COMPUTER_SITE, CEBU_SITE, WELDING_SITE])
    if (path === '/api/v1/assessment-centers') return json([ASSESSMENT_SITE])
    if (path === '/api/v1/training-programs') {
      const code = url.searchParams.get('qualification_code')
      return json(PROGRAMS.filter((item) => !code || item.qualification.code === code))
    }
    if (path === '/api/v1/assessment-schedules') {
      const code = url.searchParams.get('qualification_code')
      return json(!code || code === CSS.code ? [SCHEDULE] : [])
    }
    if (path === '/api/v1/analysis/goal') {
      expect(request.method()).toBe('POST')
      seen.goal.push(request.postDataJSON())
      return json({ profile: PROFILE, source: 'rules', matching_mode: 'goal' })
    }
    if (path === '/api/v1/analysis/matches') {
      expect(request.method()).toBe('POST')
      seen.matches.push(request.postDataJSON())
      return json({
        profile: PROFILE,
        matches: [
          {
            qualification: CSS,
            score: 82,
            reason: REASON,
            components: { keyword: 0.7, semantic: 0.8 },
          },
        ],
      })
    }
    if (path === '/api/v1/labor-market/evidence') {
      seen.evidence.push(url)
      return json(evidence(url.searchParams.get('region_code')))
    }
    if (path === '/api/v1/labor-market/qualifications') {
      seen.area.push(url)
      return json({
        items: [CSS, WELDING].map((qualification, index) => ({
          qualification_code: qualification.code,
          qualification_name: qualification.name,
          observed_posting_count: index ? 24 : 11,
          posting_unit: 'distinct posting records',
          observation_dates: ['2026-11-04'],
          observation_geography: {
            scope: 'regional',
            region_code: 'IV-A',
            label: 'CALABARZON · isolated test evidence',
          },
          forecast_support: [],
          has_selected_area_evidence: true,
        })),
        total: 2,
        limit: 20,
        offset: 0,
        region_code: url.searchParams.get('region_code'),
        evaluated_at: '2026-11-10T10:00:00+08:00',
        observed_since: '2026-10-11',
        observed_through: '2026-11-10',
        ordering: 'qualification_name',
        method_version: 'area-qualifications-v1',
      })
    }
    if (path === '/api/v1/recommendations/training') {
      return json({
        policy_version: 'verified-services-v2',
        requires_verification: [],
        weights: {},
        effective_weights: {},
        semantic_used: false,
        results: [],
        audit_id: 1,
      })
    }
    if (path === '/api/v1/recommendations/service-access') {
      expect(request.method()).toBe('POST')
      const body = request.postDataJSON()
      seen.access.push(body)
      return json({
        qualification_code: body.qualification_code,
        mode: body.mode,
        maximum_minutes: body.maximum_minutes,
        checked_at: '2026-11-10T10:00:00+08:00',
        routing_enabled: true,
        origin_precision_decimals: 2,
        method: 'OSRM road network',
        network_version: null,
        limitations: ['Isolated test road model; no traffic.'],
        results: body.candidates.map((candidate: { kind: string; site_id: number }) => ({
          ...candidate,
          name: candidate.kind === 'training' ? COMPUTER_SITE.name : ASSESSMENT_SITE.name,
          status: 'modeled_route',
          duration_min: candidate.kind === 'training' ? 22 : 35,
          distance_km: candidate.kind === 'training' ? 10.3 : 12,
          within_budget: true,
          origin_snap_distance_km: 0.03,
          destination_snap_distance_km: 0.02,
          explanation:
            'Modeled road travel in the selected mode, without traffic or unverified endpoint connections.',
        })),
      })
    }
    if (path === '/api/v1/routes')
      return json({
        routing_enabled: true,
        missing_modes: [],
        routes: [
          {
            mode: 'car',
            path: [
              [14.55, 121.02],
              [14.58, 121.0],
              [14.5995, 120.9842],
            ],
            start: [14.55, 121.02],
            end: [14.5995, 120.9842],
            distance_km: 10.3,
            duration_min: 22,
          },
        ],
      })
    // Account/session probes remain read-only and anonymous; every unexpected mutation is blocked by this fixture.
    if (request.method() !== 'GET') return json({ detail: 'Unexpected test mutation' }, 400)
    return json({ detail: 'Not signed in' }, 401)
  })
  return seen
}

test('US-0025: the Career Map keeps the search during a retry on a narrow phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 })
  const seen = await serveRecommendations(page)
  const requests: string[] = []
  let letRetryFinish!: () => void
  const waiting = new Promise<void>((resolve) => {
    letRetryFinish = resolve
  })
  await page.route('**/api/v1/analysis/matches', async (route) => {
    requests.push(route.request().postDataJSON().query)
    if (requests.length === 1) return route.abort('connectionreset')
    await waiting
    return route.fallback()
  })
  await page.goto('/explore')
  const box = page.getByRole('searchbox', { name: 'What can you do?' })
  const search = page.getByRole('button', { name: 'Search', exact: true })
  await box.fill(GOAL)
  expect((await search.boundingBox())?.height).toBeGreaterThanOrEqual(44)
  await search.click()
  const retry = page.getByRole('button', { name: 'Try again', exact: true })
  await expect(retry).toBeVisible()
  await expect(box).toHaveValue(GOAL)
  await retry.click()
  try {
    await expect(search).toHaveAttribute('aria-disabled', 'true')
    await expect.poll(() => requests.length).toBe(2)
    await box.press('Enter')
  } finally {
    letRetryFinish()
  }
  await expect(page.getByRole('heading', { name: CSS.name, exact: true }).first()).toBeVisible()
  expect(requests).toEqual([GOAL, GOAL])
  expect(seen.matches).toHaveLength(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
})

for (const engine of ['leaflet', 'maplibre'] as const) {
  test(`phone: ${engine} keeps all Career Map filters visible and opens one center card`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await serveRecommendations(page, engine)
    await page.goto('/explore')
    await expect(page.locator(`.center-map[data-engine="${engine}"]`)).toBeVisible()
    const filters = page.getByRole('group', { name: 'Show on the map' })
    for (const filter of ['Training centers', 'Assessment centers', 'In demand jobs']) {
      const box = await filters.getByRole('button', { name: filter, exact: true }).boundingBox()
      expect(box).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(375)
    }
    await page.getByRole('searchbox', { name: 'What can you do?' }).fill(GOAL)
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    const center = page.getByRole('button', {
      name: /Example Computer Assessment Center Assessment for/,
    })
    await center.click()
    await expect(
      page.getByRole('heading', { name: ASSESSMENT_SITE.name, exact: true }),
    ).toBeInViewport()
    await expect(page.locator('.leaflet-popup, .maplibregl-popup')).toHaveCount(0)
    await page.getByRole('button', { name: 'Back to results' }).click()
    await expect(center).toBeVisible()
  })
}

for (const width of [1280, 390]) {
  test(`BUG-108: the retired training URL redirects to Career Map at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await serveRecommendations(page, 'leaflet')
    await page.goto('/')
    expect(await page.locator('a[href^="/training"]').count()).toBe(0)
    await page.goto('/training')
    await expect(page).toHaveURL(/\/explore$/)
    await expect(page.getByText(/This is the earlier version of this page/)).toHaveCount(0)
    await page.goto('/')
    await page.goto('/training?qualification=CSS-NC-II&type=training&region=NCR&scholarship=1')
    await expect(page).toHaveURL(/\/explore\?/)
    await page
      .getByRole('dialog', { name: 'Open Location?' })
      .getByRole('button', { name: 'Not now', exact: true })
      .click()
    await expect(page.getByRole('searchbox', { name: 'What can you do?' })).toHaveValue(CSS.name)
    await expect(page.getByRole('combobox', { name: 'Region', exact: true })).toHaveValue('NCR')
    await expect(page.getByRole('switch', { name: 'Scholarships', exact: true })).toBeChecked()
    await expect(
      page.getByRole('heading', { level: 1, name: 'Training & Assessment', exact: true }),
    ).toHaveCount(0)
    await page.screenshot({
      path: test.info().outputPath('training-redirect.png'),
      animations: 'disabled',
    })
    await page.goBack()
    await expect(page).toHaveURL(/\/$/)
  })
}

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`BUG-125: browser Back closes center detail and preserves the search at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    const seen = await serveRecommendations(page, 'leaflet')
    await page.goto('/')
    await page.goto('/explore?region=NCR')
    await page
      .getByRole('dialog', { name: 'Open Location?' })
      .getByRole('button', { name: 'Not now', exact: true })
      .click()
    const goal = page.getByRole('searchbox', { name: 'What can you do?' })
    await goal.fill(GOAL)
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    const place = page.getByRole('combobox', { name: 'Or type a city or province' })
    await place.fill('Manila')
    await place.press('Enter')
    await page.getByRole('button', { name: '5 km', exact: true }).click()
    const result = page.getByRole('button', {
      name: /Example Computer Training Center Training for/,
    })
    await result.click()
    const detail = page.getByRole('heading', { name: COMPUTER_SITE.name, exact: true })
    await expect(detail).toBeVisible()
    const mapUrl = page.url()
    const matches = seen.matches.length
    await page.screenshot({
      path: test.info().outputPath('center-detail.png'),
      animations: 'disabled',
    })

    await page.goBack()
    await expect(page).toHaveURL(mapUrl)
    await expect(detail).toHaveCount(0)
    await expect(result).toBeVisible()
    await expect(goal).toHaveValue(GOAL)
    await expect(place).toHaveValue(/Manila/)
    await expect(page.getByRole('combobox', { name: 'Region', exact: true })).toHaveValue('NCR')
    await expect(page.getByRole('button', { name: '5 km', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(seen.matches).toHaveLength(matches)
    await page.screenshot({ path: test.info().outputPath('back-to-results.png') })

    await page.goForward()
    await expect(detail).toBeVisible()
    await page.reload()
    await page
      .getByRole('dialog', { name: 'Open Location?' })
      .getByRole('button', { name: 'Not now', exact: true })
      .click()
    await expect(detail).toBeVisible()
    await page.getByRole('button', { name: 'Back to results', exact: true }).click()
    await expect(result).toBeVisible()
    await expect(detail).toHaveCount(0)
    await page.goBack()
    await expect(page).toHaveURL(/\/$/)
  })
}

for (const width of [1280, 390]) {
  test(`BUG-120: detail keeps the list estimate and explains road-route differences at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await serveRecommendations(page, 'leaflet')
    await page.goto('/explore?qualification=CSS-NC-II')
    await page
      .getByRole('dialog', { name: 'Open Location?' })
      .getByRole('button', { name: 'Not now' })
      .click()
    const place = page.getByRole('combobox', { name: 'Or type a city or province' })
    await place.fill('Makati')
    await place.press('Enter')
    const result = page.getByRole('button', {
      name: /Example Computer Training Center Training for/,
    })
    await expect(result).toContainText('7.6 km')
    await expect(result).toContainText('21 min')
    await result.screenshot({ path: test.info().outputPath('list-estimate.png') })
    await result.click()
    const card = page
      .locator('article')
      .filter({ has: page.getByRole('heading', { name: COMPUTER_SITE.name, exact: true }) })
    await expect(card).toContainText('7.6 km')
    await expect(card).toContainText('21 min')
    await expect(card).toContainText('Straight-line distance Â· estimated time by car')
    await expect(card).toContainText('10.3 km Â· about 22 min by car')
    await expect(card).toContainText('starting point is rounded to about 1 km for privacy')
    await expect(card).toContainText(
      'may differ from the straight-line estimate in the list and map popup',
    )
    const header = card
      .getByRole('heading', { name: COMPUTER_SITE.name, exact: true })
      .locator('..')
    await header.screenshot({ path: test.info().outputPath('detail-estimate.png') })
    const travel = card.getByText('Travel time', { exact: true }).locator('..')
    await travel.scrollIntoViewIfNeeded()
    await travel.screenshot({
      path: test.info().outputPath('detail-route-explained.png'),
      animations: 'disabled',
    })
    // Desktop opens a popup with the detail; phones show the detail alone to leave room for the map.
    if (width >= 768) {
      const popup = page.locator('.leaflet-popup')
      await expect(popup).toContainText('About 7.6 km away')
      await popup.screenshot({ path: test.info().outputPath('popup-estimate.png') })
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
  })
}

test('BUG-18: Career Map center details show the recorded source and source date', async ({
  page,
}) => {
  await serveRecommendations(page, 'leaflet')
  const source = 'https://example.invalid/tesda-assessment-registry'
  await page.route('**/api/v1/assessment-centers*', (route) =>
    route.fulfill({
      json: [
        {
          ...ASSESSMENT_SITE,
          provenance: {
            status: 'example',
            source_name: 'Sample TESDA assessment registry',
            source_reference: 'DEMO-ASSESS-31',
            source_url: source,
            source_updated_on: '2026-10-21',
            reviewed_at: '2026-11-17T02:00:00Z',
            record_updated_at: '2026-11-18T02:00:00Z',
          },
        },
      ],
    }),
  )
  await page.goto('/explore')
  await page.getByRole('searchbox', { name: 'What can you do?' }).fill(GOAL)
  await page.getByRole('combobox', { name: 'Or type a city or province' }).fill('Manila')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page
    .getByRole('button', { name: /Example Computer Assessment Center Assessment for/ })
    .click()
  const details = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: ASSESSMENT_SITE.name, exact: true }),
  })
  await expect(
    details.getByRole('link', { name: 'Sample TESDA assessment registry' }),
  ).toHaveAttribute('href', source)
  await expect(details.getByText('Reference: DEMO-ASSESS-31')).toBeVisible()
  await expect(details.getByText(/^Source updated:/)).toHaveText('Source updated: 2026-10-21')
  await expect(details.getByText(/^Record updated:/)).toHaveText('Record updated: 2026-11-18')
  await expect(details.getByText('Sample data', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Back to results' }).click()

  await page.getByRole('button', { name: /Example Computer Training Center Training for/ }).click()
  const training = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: COMPUTER_SITE.name, exact: true }),
  })
  await expect(training.getByText(/^Source:/)).toContainText('Not recorded')
  await expect(training.getByText(/^Source updated:/)).toHaveText('Source updated: Not recorded')
})

test.describe('the mobile Career Map sheet', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('closes a center card on a downward swipe and keeps the search', async ({ page }) => {
    await serveRecommendations(page, 'leaflet')
    await page.goto('/explore')
    // Open Location? is already answered by the Playwright setup (playwright.config.ts).
    const search = page.getByRole('searchbox', { name: 'What can you do?' })
    await search.fill(GOAL)
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await page
      .getByRole('button', { name: /Example Computer Assessment Center Assessment for/ })
      .click()
    const handle = page.getByRole('button', { name: 'Close map panel' })
    const sheet = page.locator(`[id="${await handle.getAttribute('aria-controls')}"]`)
    await expect(sheet.locator('> div')).toHaveCSS('overflow-y', 'auto')
    await expect(handle).toBeInViewport()
    const rect = (await handle.boundingBox())!
    const x = Math.round(rect.x + rect.width / 2)
    const y = Math.round(rect.y + rect.height / 2)
    const touch = await page.context().newCDPSession(page)
    const swipe = async (endY: number) => {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x, y: endY }],
      })
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    }

    await swipe(y - 70)
    await expect(handle).toBeVisible()
    await expect(handle).toBeInViewport()
    await swipe(y + 70)
    await expect(sheet).toHaveJSProperty('inert', true)
    await expect(handle).not.toBeInViewport()
    await expect(search).toHaveValue(GOAL)
    await search.tap()
    await expect(
      page.getByRole('heading', { name: ASSESSMENT_SITE.name, exact: true }),
    ).toBeVisible()
    await handle.press('Enter')
    await expect(sheet).toHaveJSProperty('inert', true)
  })
})

async function select(page: Page, label: string, option: string) {
  await page.getByRole('button', { name: new RegExp(label) }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
  await expect(page.getByRole('button', { name: new RegExp(label) })).toContainText(option)
}

for (const [size, viewport] of Object.entries({
  desktop: { width: 1440, height: 1000 },
  phone: { width: 390, height: 844 },
})) {
  test(`${size}: a goal, independent area evidence and explicit road comparison work in the existing map workspace`, async ({
    page,
    context,
  }) => {
    test.setTimeout(60_000)
    await page.setViewportSize(viewport)
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({ latitude: 14.554739, longitude: 121.02448 })
    const seen = await serveRecommendations(page)
    await page.goto('/training?radius=any&region=NCR')
    await page.getByRole('button', { name: 'Qualification recommendations', exact: true }).click()
    const recommendations = page.getByRole('region', {
      name: 'Find a qualification for your goal',
      exact: true,
    })
    await expect(recommendations).toBeVisible()
    await expect(page.locator('.center-map')).toBeVisible()
    const goal = recommendations.getByRole('textbox', { name: 'Your goal or skills' })
    await goal.fill(GOAL)
    await select(page, 'Evidence area', 'CALABARZON')
    expect(seen.goal).toHaveLength(0)
    expect(seen.matches).toHaveLength(0)
    expect(seen.access).toHaveLength(0)
    await recommendations.getByRole('button', { name: 'Find qualifications', exact: true }).click()
    await expect(recommendations.getByText(REASON, { exact: true })).toBeVisible()
    expect(seen.goal).toEqual([{ query: GOAL, interpret_input: true }])
    expect(seen.matches).toHaveLength(1)
    expect(seen.matches[0]).toMatchObject({ query: GOAL, mode: 'goal', region_code: 'IV-A' })
    await expect(
      recommendations.getByText('Semantic matching and catalog rules', { exact: true }),
    ).toBeVisible()
    await recommendations.getByRole('button', { name: 'Compare centers', exact: true }).click()
    await expect(page).toHaveURL(/qualification=CSS-NC-II/)
    await expect(page).toHaveURL(/region=NCR/)
    const selectedEvidence = page.getByRole('region', {
      name: 'Demand and service evidence',
      exact: true,
    })
    await expect(
      selectedEvidence.getByText('CALABARZON · isolated test evidence', { exact: false }).first(),
    ).toBeVisible()
    await expect(
      selectedEvidence.getByRole('heading', { name: 'Observed job postings', exact: true }),
    ).toBeVisible()
    expect(seen.evidence.at(-1)?.searchParams.get('qualification_code')).toBe(CSS.code)
    expect(seen.evidence.at(-1)?.searchParams.get('region_code')).toBe('IV-A')
    await recommendations
      .locator('summary')
      .filter({ hasText: 'Explore other qualifications by area' })
      .click()
    await expect(
      recommendations.getByRole('heading', { name: WELDING.name, exact: true }),
    ).toBeVisible()
    await expect(recommendations.getByText('24 observed postings', { exact: false })).toBeVisible()
    expect(seen.area.at(-1)?.searchParams.get('region_code')).toBe('IV-A')

    // Changing which centers are displayed must not reinterpret the explicitly chosen evidence area.
    const showFilters = page.getByRole('button', { name: 'Show filters', exact: true })
    if (await showFilters.isVisible()) await showFilters.click()
    await select(page, 'Regions$', 'Central Visayas')
    await expect(page).toHaveURL(/region=VII/)
    await expect(page.getByRole('button', { name: /Regions$/ })).toContainText('Central Visayas')
    await expect(page.getByRole('button', { name: /Evidence area/ })).toContainText('CALABARZON')
    expect(seen.evidence.every((url) => url.searchParams.get('region_code') === 'IV-A')).toBe(true)
    expect(seen.area.every((url) => url.searchParams.get('region_code') === 'IV-A')).toBe(true)
    await select(page, 'Regions$', 'National Capital Region')
    await expect(page).toHaveURL(/region=NCR/)
    await expect(page.getByRole('heading', { name: 'All results (2)', exact: true })).toBeVisible()
    await recommendations
      .locator('summary')
      .filter({ hasText: 'Explore other qualifications by area' })
      .click()

    const access = page
      .locator('details')
      .filter({ has: page.locator('summary').filter({ hasText: 'Compare road access' }) })
    await access.locator('summary').click()
    await expect(
      access.getByRole('button', { name: 'Compare travel times', exact: true }),
    ).toBeVisible()
    expect(seen.access).toHaveLength(0)
    await access.getByRole('button', { name: 'Compare travel times', exact: true }).click()
    await expect.poll(() => seen.access.length).toBe(1)
    await expect(access.getByText(/22 min.*Within your preferred time/)).toBeVisible()
    expect(seen.access).toHaveLength(1)
    expect(seen.access[0]).toMatchObject({
      qualification_code: CSS.code,
      mode: 'car',
      maximum_minutes: 45,
      origin: { latitude: 14.55, longitude: 121.02 },
    })
    expect(seen.access[0].candidates).toEqual(
      expect.arrayContaining([
        { kind: 'training', site_id: COMPUTER_SITE.id },
        { kind: 'assessment', site_id: ASSESSMENT_SITE.id },
      ]),
    )
    expect((seen.access[0].candidates as unknown[]).length).toBeLessThanOrEqual(5)
    const selectedRow = access
      .getByRole('listitem')
      .filter({ has: page.getByRole('heading', { name: COMPUTER_SITE.name, exact: true }) })
    await selectedRow.getByRole('button', { name: 'Show center', exact: true }).click()
    await expect(page).toHaveURL(/center=training-11/)
    await expect(
      page
        .getByRole('region', { name: /^All results/ })
        .getByRole('heading', { name: COMPUTER_SITE.name, exact: true }),
    ).toBeVisible()
    await expect(page.locator('.center-map')).toBeVisible()
    await page.waitForFunction(() => {
      const map = window.__trackCenterMap
      return Boolean(map?.loaded() && !map.isMoving())
    })
    expect(seen.urls.every((url) => !decodeURIComponent(url).includes(GOAL))).toBe(true)
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      )
      .toBeLessThanOrEqual(0)
    const accessibility = await new AxeBuilder({ page }).exclude('[data-live-announcer]').analyze()
    expect(
      accessibility.violations.map(({ id, nodes }) => ({
        id,
        nodes: nodes.map((node) => node.html),
      })),
    ).toEqual([])
    // Fixed navigation should be captured at the start of the full-page evidence, not at the selected center.
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
    await mkdir(OUTPUT, { recursive: true })
    await page.screenshot({
      path: resolve(OUTPUT, `recommendations-${size}.png`),
      fullPage: true,
      animations: 'disabled',
    })
  })
}

// US-0004: signed in with TSP as the synthetic Kuya Manuel, the Career Map uses his Skill Passport. The API answers
// are isolated fixtures; the profile is what GET /api/v1/auth/tsp/profile returns for the mock account.
const MANUEL = {
  id: '9a0c1b2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d',
  full_name: 'Manuel Cruz Garcia',
  email: null,
  role: 'learner',
  permissions: [],
  created_at: '2026-11-17T00:00:00Z',
}
const MANUEL_PASSPORT = {
  skills: ['Driving', 'Cooking'],
  experience: ['Jeepney driver'],
  education: ['High School graduate'],
  qualifications: [],
  credentials: [],
  licenses: ["LTO Professional Driver's License"],
  municipality: 'Caloocan City',
  province: 'Metro Manila',
  region_code: 'NCR',
  sample: true,
}
const DRIVING = {
  code: 'DRIVING-NC-II',
  name: 'Driving NC II',
  sector: 'Automotive and Land Transportation',
  possible_jobs: ['Professional driver'],
  competencies: [],
}

test('BUG-15: Kuya Manuel sees matching profile evidence in the assessment group', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await serveRecommendations(page)
  // Registered after the fixture, so these answer first: a signed-in TSP learner and a driving match.
  await page.addInitScript(() => localStorage.setItem('tesda-track.signed-in', 'e2e-session-hint'))
  // The test setup marks Open Location? as answered; this learner has never been asked.
  await page.addInitScript(() => localStorage.removeItem('track.explore.locationAsked'))
  await page.route('**/api/v1/me', (route) => route.fulfill({ json: MANUEL }))
  await page.route('**/api/v1/auth/tsp/profile', (route) =>
    route.fulfill({ json: MANUEL_PASSPORT }),
  )
  const drivingProvider = { ...COMPUTER_SITE, name: 'Example Driving Training Center' }
  const drivingCenter = { ...ASSESSMENT_SITE, name: 'Example Driving Assessment Center' }
  await page.route('**/api/v1/qualifications', (route) =>
    route.fulfill({ json: [CSS, DRIVING, WELDING] }),
  )
  await page.route('**/api/v1/training-providers*', (route) =>
    route.fulfill({ json: [drivingProvider, CEBU_SITE, WELDING_SITE] }),
  )
  await page.route('**/api/v1/assessment-centers*', (route) =>
    route.fulfill({ json: [drivingCenter] }),
  )
  await page.route('**/api/v1/training-programs*', (route) => {
    const code = new URL(route.request().url()).searchParams.get('qualification_code')
    const programs = [program(101, drivingProvider, DRIVING), PROGRAMS[2]]
    return route.fulfill({ json: programs.filter((p) => !code || p.qualification.code === code) })
  })
  await page.route('**/api/v1/assessment-schedules*', (route) => {
    const code = new URL(route.request().url()).searchParams.get('qualification_code')
    return route.fulfill({
      json:
        !code || code === DRIVING.code
          ? [{ ...SCHEDULE, qualification: DRIVING, center: drivingCenter }]
          : [],
    })
  })
  // The fixture answers unknown reads with 401, which would end the session: the outlook isn't under test here.
  await page.route('**/api/v1/labor-market/outlook?*', (route) =>
    route.fulfill({ status: 503, json: { detail: 'Not part of this test' } }),
  )
  await page.route('**/api/v1/analysis/matches', (route) =>
    route.fulfill({
      json: {
        profile: { ...PROFILE, career_goal: 'Professional driver', existing_skills: ['driving'] },
        matches: route.request().postDataJSON().query.includes('weld')
          ? [{ qualification: WELDING, score: 90, reason: 'Matched your words: weld' }]
          : [
              { qualification: CSS, score: 89, reason: 'First fixture match' },
              { qualification: DRIVING, score: 88, reason: 'Matched your words: driving' },
            ],
      },
    }),
  )

  await page.goto('/explore')
  const panel = page.getByRole('region', { name: 'From your TSP profile' })
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('Driving, Cooking')
  await expect(panel).toContainText("LTO Professional Driver's License")
  await expect(panel).toContainText('Caloocan City, Metro Manila')
  await expect(panel).toContainText('Sample data')
  // The home area is the search location without asking: no "Open Location?" question.
  await expect(
    page.getByText('Near National Capital Region, your home area in your TSP profile'),
  ).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Open Location?' })).toHaveCount(0)

  // A typed place replaces it for this visit only; the profile stays as it was.
  // The panel opens from the search box (folded, its body is inert).
  await page.getByRole('searchbox', { name: 'What can you do?' }).click()
  const place = page.getByRole('combobox', { name: 'Or type a city or province' })
  await place.click()
  await place.pressSequentially('Cebu')
  const status = page.getByRole('region', { name: 'What can you do?' }).getByRole('status')
  await expect(status).toHaveText('Near Cebu City')
  await expect(panel).toContainText('Caloocan City, Metro Manila')
  await place.fill('')
  await expect(status).toHaveText(
    'Near National Capital Region, your home area in your TSP profile',
  )

  await place.fill('Manila')
  await page.getByRole('searchbox', { name: 'What can you do?' }).fill('I can drive a car')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  const guidance = page
    .getByRole('region', { name: 'Get certified', exact: true })
    .getByTestId('may-be-ready')
  await expect(guidance.getByText('You may be ready for assessment', { exact: true })).toBeVisible()
  await expect(guidance).toContainText(
    "Driving NC II, your TSP profile lists Driving, LTO Professional Driver's License.",
  )
  await expect(page.getByRole('region', { name: 'Or train first', exact: true })).toContainText(
    drivingProvider.name,
  )
  await expect(page.getByRole('heading', { level: 3 }).first()).toHaveText('Get certified')
  expect((await new AxeBuilder({ page }).include('section').analyze()).violations).toEqual([])
  await page.getByRole('searchbox', { name: 'What can you do?' }).fill('I can weld')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.getByText(WELDING_SITE.name, { exact: true }).first()).toBeVisible()
  await expect(page.getByTestId('may-be-ready')).toHaveCount(0)
})

test('US-0025: when the center list fails, the map does not say no centers match', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await serveRecommendations(page)
  let fail = true
  await page.route('**/api/v1/training-providers*', (route) =>
    fail ? route.abort('internetdisconnected') : route.fallback(),
  )
  await page.goto('/explore')
  await page.getByRole('searchbox', { name: 'What can you do?' }).click()
  const retry = page.getByRole('button', { name: 'Try loading the list again' })
  await expect(retry).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Centers couldn’t be loaded. Try again from the list.')).toBeVisible()
  await expect(page.getByText('No centers match this search yet.')).toHaveCount(0)
  fail = false
  await retry.click()
  await expect(page.getByText('Centers couldn’t be loaded. Try again from the list.')).toHaveCount(
    0,
  )
  await expect(retry).toHaveCount(0)
})

// QA (US-0014 AC3): the Career Map is the only center finder, so it filters by type, region, province and place,
// counts what is shown, and clears everything at once.
test('US-0014: the Career Map filters centers by region and province, counts them and clears all', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await serveRecommendations(page, 'leaflet')
  const inProvince = (s: ReturnType<typeof site>, province: string) => ({ ...s, province })
  await page.route('**/api/v1/training-providers*', (route) =>
    route.fulfill({
      json: [
        inProvince(COMPUTER_SITE, 'Metro Manila'),
        inProvince(CEBU_SITE, 'Cebu'),
        inProvince(WELDING_SITE, 'Metro Manila'),
      ],
    }),
  )
  await page.route('**/api/v1/assessment-centers*', (route) =>
    route.fulfill({ json: [inProvince(ASSESSMENT_SITE, 'Metro Manila')] }),
  )
  await page.goto('/explore')
  // Open Location? is asked on every visit now (LocationPrompt): this test answers it.
  await page
    .getByRole('dialog', { name: 'Open Location?' })
    .getByRole('button', { name: 'Not now' })
    .click()
  await page.getByRole('searchbox', { name: 'What can you do?' }).click()

  const filters = page.getByRole('region', { name: 'Filter centers' })
  const count = filters.getByRole('status')
  const region = filters.getByRole('combobox', { name: 'Region' })
  const province = filters.getByRole('combobox', { name: 'Province' })
  const clear = filters.getByRole('button', { name: 'Clear all' })
  await expect(count).toHaveText('4 centers shown')
  await expect(clear).toBeDisabled()

  await region.selectOption('VII')
  await expect(count).toHaveText('1 center shown')
  await expect(page).toHaveURL(/region=VII/)
  await expect(province.locator('option')).toHaveText(['All provinces', 'Cebu'])

  await region.selectOption('NCR')
  await province.selectOption('Metro Manila')
  await expect(count).toHaveText('3 centers shown')
  await page.screenshot({ path: test.info().outputPath('filtered.png') })
  await page
    .getByRole('group', { name: 'Show on the map' })
    .getByRole('button', { name: 'Assessment centers', exact: true })
    .click()
  await expect(count).toHaveText('1 center shown')

  const place = page.getByRole('combobox', { name: 'Or type a city or province' })
  await place.fill('Manila')
  // QA-2026-11-23-EXP7: with a place the count is of the centers within the range.
  await expect(count).toHaveText('Centers within 25 km: 1')
  await clear.click()
  await expect(count).toHaveText('4 centers shown')
  await expect(region).toHaveValue('')
  await expect(province).toHaveValue('')
  await expect(place).toHaveValue('')
  await expect(page).not.toHaveURL(/region=|province=|type=/)
  await expect(clear).toBeDisabled()
  expect(
    (await new AxeBuilder({ page }).include('section[aria-label="Filter centers"]').analyze())
      .violations,
  ).toEqual([])
  await filters.screenshot({ path: test.info().outputPath('filters.png') })

  // QA-2026-11-23-EXP7: the count and the tabs follow the place and the range, not the national total.
  await place.fill('Manila')
  await expect(count).toHaveText('Centers within 25 km: 3')
  await page.screenshot({ path: test.info().outputPath('count-manila-25.png') })
  await page.getByRole('button', { name: '100 km', exact: true }).click()
  await expect(count).toHaveText('Centers within 100 km: 3')
  await place.fill('Cebu City')
  await page.getByRole('option', { name: 'Cebu City, Cebu' }).click()
  await expect(count).toHaveText('Centers within 100 km: 1')
  await page.getByRole('searchbox', { name: 'What can you do?' }).fill('I can fix computers')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Train, \d+$/ })).toHaveAccessibleName('Train, 1')
  await expect(page.getByRole('button', { name: /^Assess, \d+$/ })).toHaveAccessibleName(
    'Assess, 0',
  )
  await page.screenshot({ path: test.info().outputPath('count-cebu-100.png') })
})

// QA-2026-11-18-E (US-0014 AC5): when no center lists the qualification anywhere, a wider range can't help, so the
// Career Map suggests a related qualification offered within range, the sector in the library and the TESDA office.
test('US-0014: no center anywhere suggests a related qualification and the library instead', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await serveRecommendations(page, 'leaflet')
  const unlisted = {
    code: 'ICT-UNLISTED-NC-III',
    name: 'Unlisted Example Servicing NC III',
    sector: CSS.sector,
    possible_jobs: [],
    competencies: [],
  }
  await page.route('**/api/v1/analysis/matches', (route) =>
    route.fulfill({
      json: {
        profile: PROFILE,
        matches: [{ qualification: unlisted, score: 80, reason: 'Matched your words: unlisted' }],
      },
    }),
  )
  await page.goto('/explore')
  // Open Location? is asked on every visit now (LocationPrompt): this test answers it.
  await page
    .getByRole('dialog', { name: 'Open Location?' })
    .getByRole('button', { name: 'Not now' })
    .click()
  await page.getByRole('searchbox', { name: 'What can you do?' }).fill('unlisted servicing')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.getByRole('textbox', { name: 'Or type a city or province' }).fill('Manila')

  const help = page.getByTestId('no-center-help').first()
  await expect(help).toContainText(
    'No center lists Unlisted Example Servicing NC III yet, anywhere. A wider range won’t help',
  )
  await expect(help).toContainText('A related qualification offered within 25 km')
  await expect(
    help.getByRole('button', { name: /Example Computer (Training|Assessment) Center/ }),
  ).toBeVisible()
  const library = help.getByRole('link', {
    name: 'Browse other Information and Communication Technology qualifications',
  })
  await expect(library).toHaveAttribute(
    'href',
    '/qualifications?sector=Information%20and%20Communication%20Technology',
  )
  await expect(help).toContainText('Ask the TESDA provincial or district office near you')
  expect(
    (await new AxeBuilder({ page }).include('[data-testid="no-center-help"]').analyze()).violations,
  ).toEqual([])
  await page.screenshot({ path: test.info().outputPath('no-center-help.png') })
})
