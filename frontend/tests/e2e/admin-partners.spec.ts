import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const tools = {
  match_qualifications: 'recommend:run',
  get_qualification: 'catalog:read',
  recommend_route: 'recommend:run',
  check_readiness: 'recommend:run',
  rank_training_programs: 'recommend:run',
  rank_assessment_schedules: 'recommend:run',
  search_training_programs: 'catalog:read',
  get_regional_supply: 'catalog:read',
  get_qualification_demand: 'reports:read',
}

for (const mode of [
  { name: 'desktop-light', theme: 'light', width: 1440, height: 960 },
  { name: 'phone-dark', theme: 'dark', width: 375, height: 812 },
] as const) {
  test(`partner onboarding is accessible and fits ${mode.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: mode.width, height: mode.height })
    await page.emulateMedia({ colorScheme: mode.theme, reducedMotion: 'reduce' })
    await page.addInitScript(() => localStorage.setItem('tesda-track.signed-in', '1'))
    await page.route('**/api/v1/qualifications', (route) => route.fulfill({ json: [] }))
    await page.route('**/api/v1/client-config', (route) =>
      route.fulfill({
        json: { carto_key: '', routing_enabled: false, skills_bridge_enabled: false },
      }),
    )
    await page.route('**/api/v1/me', (route) =>
      route.fulfill({
        json: {
          id: '00000000-0000-4000-8000-000000000001',
          full_name: 'Admin Preview',
          email: 'admin@example.com',
          role: 'admin',
          permissions: ['mcp:manage', 'users:manage', 'reports:read'],
          created_at: '2026-10-01T00:00:00Z',
        },
      }),
    )
    await page.route('**/api/v1/admin/mcp/tools', (route) => route.fulfill({ json: tools }))
    await page.route('**/api/v1/admin/mcp/clients', (route) =>
      route.fulfill({
        json: [
          {
            id: '00000000-0000-4000-8000-000000000002',
            name: 'Regional learning portal',
            organisation: 'Regional Training Office',
            contact_email: 'partner@example.com',
            declared_purpose:
              'Help learners find local training and plan their next qualification.',
            expected_tools: ['match_qualifications', 'get_qualification'],
            scopes: ['catalog:read', 'recommend:run'],
            is_active: true,
            rate_limit_per_minute: 120,
            last_token_at: null,
            created_at: '2026-10-20T00:00:00Z',
          },
        ],
      }),
    )
    await page.goto('/admin?section=mcp')
    await expect(page.getByRole('article', { name: 'Regional learning portal' })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('partners.png'), fullPage: true })
    await page.getByRole('button', { name: 'Add partner' }).click()
    const form = page.getByRole('form', { name: 'Connect a new partner' })
    await expect(form.getByRole('checkbox', { name: 'Match qualifications' })).toBeVisible()
    await form.getByRole('button', { name: 'Select Recommendations' }).click()
    await expect(form.getByRole('checkbox', { name: 'Check assessment readiness' })).toBeChecked()
    await expect(
      form.getByRole('checkbox', { name: 'View qualification details' }),
    ).not.toBeChecked()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await form.screenshot({ path: testInfo.outputPath('onboarding.png') })
    const audit = await new AxeBuilder({ page }).include('main').analyze()
    expect(audit.violations).toEqual([])

    await page.route('**/api/v1/admin/mcp/usage*', (route) =>
      route.fulfill({
        json: {
          clients: [
            {
              client_id: '00000000-0000-4000-8000-000000000002',
              name: 'Regional learning portal',
              calls: 12,
              by_outcome: { ok: 10, rate_limited: 2 },
              unexpected_tool_calls: 0,
              tools: [
                {
                  tool: 'match_qualifications',
                  calls: 12,
                  ok: 10,
                  tool_error: 0,
                  denied_scope: 0,
                  rate_limited: 2,
                  p50_ms: 40,
                  p95_ms: 120,
                  expected: true,
                },
              ],
            },
          ],
          unattributed_denials: 0,
        },
      }),
    )
    await page.route('**/api/v1/admin/mcp/activity*', (route) =>
      route.fulfill({
        json: {
          items: [
            {
              id: 1,
              client_id: '00000000-0000-4000-8000-000000000002',
              client_name: 'Regional learning portal',
              called_at: '2026-10-21T02:00:00Z',
              method: 'tools/call',
              tool: 'match_qualifications',
              outcome: 'ok',
              latency_ms: 40,
              error_code: null,
              result_count: 3,
              inputs_sent: ['goal', 'region_code'],
              region_code: 'NCR',
              qualification_code: null,
              page_offset: null,
              protocol_version: '2026-07-28',
              expected: true,
              occurrences: 1,
            },
          ],
          has_more: false,
          retention_days: 180,
        },
      }),
    )
    await page.getByRole('button', { name: 'MCP: MCP partners' }).click()
    await page.getByRole('menuitemradio', { name: 'Activities' }).click()
    const recent = page.getByRole('region', { name: 'Recent calls' })
    await recent.getByText('Regional learning portal · Match qualifications').click()
    await expect(recent.getByText('goal, region_code')).toBeVisible()
    await expect(recent.getByText('NCR', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next calls' })).toBeDisabled()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('activity.png'), fullPage: true })
    expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([])
  })
}
