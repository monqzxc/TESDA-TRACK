import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, expect, it } from 'vitest'
import { admin, rememberSignIn, serveAccountApi } from '../../test/account.tsx'
import { renderApp, serveCatalog } from '../../test/app.tsx'
import { server } from '../../test/server.ts'

afterEach(() => window.localStorage.clear())

it('paginates learner accounts without skipping the next page', async () => {
  const user = userEvent.setup()
  rememberSignIn()
  serveAccountApi({ learner: admin, signedIn: true })
  serveCatalog()
  const accounts = Array.from({ length: 27 }, (_, index) => ({
    ...admin,
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    full_name: `Account ${index + 1}`,
    email: `account${index + 1}@example.com`,
    role: 'learner',
    permissions: [],
  }))
  server.use(
    http.get('*/api/v1/admin/users', ({ request }) => {
      const url = new URL(request.url)
      const offset = Number(url.searchParams.get('offset'))
      const limit = Number(url.searchParams.get('limit'))
      return HttpResponse.json(accounts.slice(offset, offset + limit))
    }),
  )

  renderApp('/admin?section=learners')
  expect(await screen.findByText('Account 1')).toBeInTheDocument()
  expect(screen.getByText('Account 25')).toBeInTheDocument()
  expect(screen.queryByText('Account 26')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Next' }))
  expect(await screen.findByText('Account 26')).toBeInTheDocument()
  expect(screen.getByText('Account 27')).toBeInTheDocument()
  expect(screen.getByText(/Page 2 · Accounts 26–27/)).toBeInTheDocument()
})

it('derives granted access from selected tools, including tools that share a scope', async () => {
  const user = userEvent.setup()
  let submitted: unknown
  rememberSignIn()
  serveAccountApi({ learner: admin, signedIn: true })
  serveCatalog()
  server.use(
    http.get('*/api/v1/admin/mcp/clients', () => HttpResponse.json([])),
    http.get('*/api/v1/admin/mcp/tools', () =>
      HttpResponse.json({
        get_qualification: 'catalog:read',
        match_qualifications: 'recommend:run',
        check_readiness: 'recommend:run',
        get_qualification_demand: 'reports:read',
      }),
    ),
    http.post('*/api/v1/admin/mcp/clients', async ({ request }) => {
      submitted = await request.json()
      return HttpResponse.json(
        {
          client: { id: 'test-client' },
          client_secret: 'test-only-secret',
        },
        { status: 201 },
      )
    }),
  )

  renderApp('/admin?section=mcp')
  expect(await screen.findByRole('heading', { name: 'MCP partner clients' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Qualification bridge/ })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Add partner' }))
  const tools = screen.getByRole('group', { name: 'Expected tools' })
  const access = screen.getByRole('region', { name: 'Access granted' })
  const create = screen.getByRole('button', { name: 'Create client' })
  const catalog = await within(tools).findByRole('checkbox', { name: 'get_qualification' })
  const matching = within(tools).getByRole('checkbox', { name: 'match_qualifications' })
  const readiness = within(tools).getByRole('checkbox', { name: 'check_readiness' })
  const reports = within(tools).getByRole('checkbox', { name: 'get_qualification_demand' })
  expect(create).toBeDisabled()
  expect(within(access).queryByRole('checkbox')).not.toBeInTheDocument()

  await user.click(matching)
  await user.click(readiness)
  expect(within(access).getAllByRole('listitem')).toHaveLength(1)
  await user.click(matching)
  expect(within(access).getByText('Run recommendations and readiness checks')).toBeInTheDocument()
  await user.click(readiness)
  expect(create).toBeDisabled()
  expect(within(access).queryByRole('list')).not.toBeInTheDocument()

  await user.click(catalog)
  await user.click(reports)
  expect(within(access).getByText('Read aggregate demand reports')).toBeInTheDocument()
  await user.click(reports)
  await user.click(readiness)
  expect(within(access).queryByText('Read aggregate demand reports')).not.toBeInTheDocument()
  await user.type(screen.getByRole('textbox', { name: 'Client name' }), 'Test partner')
  await user.type(screen.getByRole('textbox', { name: 'Organisation' }), 'Test organisation')
  await user.type(screen.getByRole('textbox', { name: 'Declared purpose' }), 'Test recommendations')
  await user.click(create)
  await waitFor(() =>
    expect(submitted).toMatchObject({
      expected_tools: ['get_qualification', 'check_readiness'],
      scopes: ['catalog:read', 'recommend:run'],
    }),
  )
})
