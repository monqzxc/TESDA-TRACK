import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

declare global {
  interface Window {
    tspHostMessages: { type: string; nonce?: string; version: number }[]
    TspTrackerHost?: { postMessage(message: string): void }
    TspTracker?: { receive(json: string): void }
  }
}

const learner = {
  id: '6f1c2a52-8b7e-4d3a-9c51-2f0e7a1b3c4d',
  full_name: 'Ana Santos',
  email: null,
  role: 'learner',
  permissions: [],
  created_at: '2026-11-05T00:00:00Z',
}

for (const firstVisit of [false, true]) {
  test(`TSP mobile bridge signs in ${firstVisit ? 'after consent' : 'a linked learner'}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.addInitScript(() => {
      window.tspHostMessages = []
      window.TspTrackerHost = {
        postMessage(json) {
          const message = JSON.parse(json)
          window.tspHostMessages.push(message)
          if (message.type === 'tsp.tracker.ready') {
            window.TspTracker?.receive(
              JSON.stringify({
                type: 'tsp.tracker.handoff',
                version: 1,
                code: 'one-time-test-code',
                state: message.nonce,
              }),
            )
          }
        },
      }
    })
    await page.route('**/api/v1/client-config', (route) =>
      route.fulfill({
        json: {
          carto_key: '',
          routing_enabled: false,
          skills_bridge_enabled: false,
          tsp_sign_in: true,
        },
      }),
    )
    await page.route('**/api/v1/auth/session', (route) => route.fulfill({ status: 204 }))
    await page.route('**/api/v1/me', (route) => route.fulfill({ json: learner }))
    const codes: unknown[] = []
    const consents: unknown[] = []
    await page.route('**/api/v1/auth/tsp/session', async (route) => {
      expect(route.request().headers()['x-requested-with']).toBe('XMLHttpRequest')
      codes.push(route.request().postDataJSON())
      await route.fulfill(
        firstVisit
          ? {
              status: 202,
              json: {
                consent_required: true,
                pending_id: 'pending-test',
                summary: { name: learner.full_name, keeps: ['skills', 'location'] },
              },
            }
          : { json: { learner, expires_in: 28800 } },
      )
    })
    await page.route('**/api/v1/auth/tsp/consent', async (route) => {
      consents.push(route.request().postDataJSON())
      await route.fulfill({ json: { learner, expires_in: 28800 } })
    })

    await page.goto('/tsp/webview')
    if (firstVisit) {
      await expect(
        page.getByRole('heading', { name: 'Save your Skill Passport details in TESDA-TRACK?' }),
      ).toBeVisible()
      expect(
        await page.evaluate(() =>
          window.tspHostMessages.some((m) => m.type === 'tsp.tracker.signed_in'),
        ),
      ).toBe(false)
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
      await page.screenshot({ path: test.info().outputPath('consent.png'), fullPage: true })
      await page.getByRole('button', { name: 'Agree and continue' }).click()
    }
    await expect
      .poll(() => page.evaluate(() => window.tspHostMessages.map((m) => m.type)))
      .toContain('tsp.tracker.signed_in')
    await expect(page.getByRole('heading', { name: 'Find your TESDA qualification' })).toBeVisible()
    expect(codes).toEqual([{ code: 'one-time-test-code' }])
    expect(consents).toEqual(firstVisit ? [{ pending_id: 'pending-test', accept: true }] : [])
    expect(page.url()).not.toContain('one-time-test-code')
  })
}
