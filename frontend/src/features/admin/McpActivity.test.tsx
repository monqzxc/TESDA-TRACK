import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, expect, it } from 'vitest'
import { admin, maria, rememberSignIn, serveAccountApi } from '../../test/account.tsx'
import { renderApp, serveCatalog } from '../../test/app.tsx'
import { server } from '../../test/server.ts'

afterEach(() => window.localStorage.clear())

const clientId = '00000000-0000-4000-8000-000000000002'
const call = {
  id: 1,
  client_id: clientId,
  client_name: 'Learning portal',
  called_at: '2026-10-21T02:00:00Z',
  method: 'tools/call',
  tool: 'get_regional_supply',
  outcome: 'ok',
  latency_ms: 14,
  error_code: null,
  result_count: 3,
  inputs_sent: ['region_code', 'goal'],
  region_code: 'NCR',
  qualification_code: null,
  page_offset: 0,
  protocol_version: '2026-07-28',
  expected: true,
  occurrences: 1,
}
function setup() {
  rememberSignIn()
  serveAccountApi({ learner: admin, signedIn: true })
  serveCatalog()
  server.use(
    http.get('*/api/v1/admin/mcp/clients', () =>
      HttpResponse.json([
        {
          id: clientId,
          name: 'Learning portal',
          organisation: 'Regional Office',
          contact_email: 'partner@example.com',
          declared_purpose: 'Training referrals',
          expected_tools: ['get_regional_supply'],
          scopes: ['catalog:read'],
          rate_limit_per_minute: 60,
          is_active: true,
          last_token_at: null,
          created_at: '2026-10-20T00:00:00Z',
        },
      ]),
    ),
    http.get('*/api/v1/admin/mcp/tools', () =>
      HttpResponse.json({ get_regional_supply: 'catalog:read' }),
    ),
    http.get('*/api/v1/admin/mcp/usage', () =>
      HttpResponse.json({
        clients: [
          {
            client_id: clientId,
            name: 'Learning portal',
            calls: 8,
            by_outcome: { ok: 5, rate_limited: 2, tool_error: 1 },
            unexpected_tool_calls: 0,
            tools: [
              {
                tool: 'get_regional_supply',
                calls: 7,
                ok: 4,
                tool_error: 1,
                denied_scope: 0,
                rate_limited: 2,
                p50_ms: 14,
                p95_ms: 50,
                expected: true,
              },
            ],
          },
        ],
        unattributed_denials: 3,
      }),
    ),
    http.get('*/api/v1/admin/mcp/activity', () =>
      HttpResponse.json({ items: [call], has_more: false, retention_days: 180 }),
    ),
  )
}

it('opens the MCP section choices below the active button and switches sections', async () => {
  setup()
  const user = userEvent.setup()
  renderApp('/admin?section=mcp-activity')

  const trigger = await screen.findByRole('button', { name: 'MCP: MCP Activity' })
  await user.click(trigger)
  const menu = screen.getByRole('menu', { name: 'MCP: MCP Activity' })
  expect(within(menu).getByText('Partners')).toBeVisible()
  expect(within(menu).getByText('Activities')).toBeVisible()

  await user.click(within(menu).getByText('Partners'))
  expect(await screen.findByRole('heading', { name: 'MCP partner clients' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'MCP: MCP partners' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

it('shows request totals and expandable privacy-safe input metadata', async () => {
  setup()
  const user = userEvent.setup()
  renderApp('/admin?section=mcp-activity')
  const recent = await screen.findByRole('region', { name: 'Recent calls' })
  await user.click(await within(recent).findByText(/Learning portal ·/))
  expect(within(recent).getByText('region_code, goal')).toBeVisible()
  expect(within(recent).getByText('NCR')).toBeVisible()
  expect(within(recent).getByText(/retained for 180 days/)).toBeInTheDocument()
  const summary = screen.getByRole('region', { name: 'Usage summary' })
  expect(within(summary).getByText('Client requests').nextElementSibling).toHaveTextContent('8')
  expect(within(summary).getByText('Not successful').nextElementSibling).toHaveTextContent('3')
  expect(screen.getByRole('button', { name: 'Next calls' })).toBeDisabled()
})

it('paginates, applies filters, resets the page and validates dates', async () => {
  setup()
  const requests: URL[] = []
  server.use(
    http.get('*/api/v1/admin/mcp/activity', ({ request }) => {
      const url = new URL(request.url)
      requests.push(url)
      const offset = Number(url.searchParams.get('offset'))
      return HttpResponse.json({
        items: [{ ...call, id: offset + 1, client_name: `Record ${offset + 1}` }],
        has_more: offset === 0,
        retention_days: 180,
      })
    }),
  )
  const user = userEvent.setup()
  renderApp('/admin?section=mcp-activity')
  await screen.findByText(/Record 1 ·/)
  await user.click(screen.getByRole('button', { name: 'Next calls' }))
  await screen.findByText(/Record 26 ·/)
  expect(requests.at(-1)?.searchParams.get('offset')).toBe('25')
  await user.selectOptions(screen.getByLabelText('Partner client'), clientId)
  await user.selectOptions(screen.getByLabelText('Tool'), 'get_regional_supply')
  await user.selectOptions(screen.getByLabelText('Recent-call outcome'), 'ok')
  await user.type(screen.getByLabelText('Start date (Philippine time)'), '2026-10-22')
  await user.type(screen.getByLabelText('End date (Philippine time)'), '2026-10-21')
  await user.click(screen.getByRole('button', { name: 'Apply filters' }))
  expect(screen.getByRole('alert')).toHaveTextContent('End date must be on or after')
  await user.clear(screen.getByLabelText('Start date (Philippine time)'))
  await user.type(screen.getByLabelText('Start date (Philippine time)'), '2026-10-20')
  await user.click(screen.getByRole('button', { name: 'Apply filters' }))
  await screen.findByText(/Record 1 ·/)
  expect(Object.fromEntries(requests.at(-1)!.searchParams)).toMatchObject({
    offset: '0',
    limit: '25',
    client_id: clientId,
    tool: 'get_regional_supply',
    outcome: 'ok',
    date_from: '2026-10-20',
    date_to: '2026-10-21',
  })
  expect(screen.getByText('Client requests').nextElementSibling).toHaveTextContent('7')
})

it('distinguishes failed loading from an empty log and supports refresh', async () => {
  setup()
  server.use(http.get('*/api/v1/admin/mcp/activity', () => new HttpResponse(null, { status: 500 })))
  const user = userEvent.setup()
  renderApp('/admin?section=mcp-activity')
  expect(await screen.findByRole('alert')).toHaveTextContent('Recent calls could not load')
  expect(screen.queryByText('No retained calls match these filters.')).not.toBeInTheDocument()
  server.use(
    http.get('*/api/v1/admin/mcp/activity', () =>
      HttpResponse.json({ items: [], has_more: false, retention_days: 180 }),
    ),
  )
  await user.click(screen.getByRole('button', { name: 'Refresh activity' }))
  expect(await screen.findByText('No retained calls match these filters.')).toBeInTheDocument()
})

it('hides MCP Activity from staff without mcp:manage permission', async () => {
  setup()
  serveAccountApi({
    learner: { ...maria, role: 'reporter', permissions: ['reports:read'] },
    signedIn: true,
  })
  renderApp('/admin?section=feedback')
  await screen.findByRole('navigation', { name: 'Admin sections' })
  expect(screen.queryByRole('button', { name: 'MCP Activity' })).not.toBeInTheDocument()
})
