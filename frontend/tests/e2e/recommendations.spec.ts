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

async function serveRecommendations(page: Page) {
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
        map_engine: 'maplibre',
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
