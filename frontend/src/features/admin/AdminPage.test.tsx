import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, expect, it } from 'vitest'
import { admin, maria, rememberSignIn, serveAccountApi } from '../../test/account.tsx'
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

const PERMISSIONS = [
  { key: 'reports:read', description: 'Read aggregate demand and matching reports' },
  { key: 'training:manage', description: 'Create and edit training providers and programs' },
  { key: 'users:manage', description: 'Assign account roles and edit roles and permissions' },
]
const builtIn = (key: string, label: string, permissions: string[]) => ({
  key,
  label,
  description: null,
  permissions,
  is_system: true,
  created_at: '2026-01-01T00:00:00Z',
})

function serveRoles(roles: unknown[], assignments: Record<string, number> = {}) {
  server.use(
    http.get('*/api/v1/admin/permissions', () => HttpResponse.json(PERMISSIONS)),
    http.get('*/api/v1/admin/roles/assignments', () => HttpResponse.json(assignments)),
    http.get('*/api/v1/admin/roles', () => HttpResponse.json(roles)),
    http.get('*/api/v1/admin/users', () => HttpResponse.json([])),
  )
}

it('creates a role from the permissions the backend offers', async () => {
  const user = userEvent.setup()
  let submitted: unknown
  rememberSignIn()
  serveAccountApi({ learner: admin, signedIn: true })
  serveCatalog()
  serveRoles([builtIn('learner', 'Learner', [])])
  server.use(
    http.post('*/api/v1/admin/roles', async ({ request }) => {
      submitted = await request.json()
      return HttpResponse.json({ key: 'auditor' }, { status: 201 })
    }),
  )

  renderApp('/admin?section=rbac')
  expect(await screen.findByRole('heading', { name: 'Roles and permissions' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'New role' }))
  await user.type(screen.getByLabelText('Role name'), 'Auditor')
  await user.type(screen.getByLabelText('Key'), 'auditor')
  await user.type(screen.getByLabelText('What this role is for (optional)'), 'Reads reports.')
  const choices = screen.getByRole('group', { name: 'Permissions' })
  await user.click(within(choices).getByRole('checkbox', { name: /^reports:read/ }))
  await user.click(screen.getByRole('button', { name: 'Create role' }))

  await waitFor(() =>
    expect(submitted).toEqual({
      key: 'auditor',
      label: 'Auditor',
      description: 'Reads reports.',
      permissions: ['reports:read'],
    }),
  )
})

it('grants a permission by sending the role its whole new permission list', async () => {
  const user = userEvent.setup()
  let submitted: unknown
  rememberSignIn()
  serveAccountApi({ learner: admin, signedIn: true })
  serveCatalog()
  serveRoles(
    [
      { ...builtIn('auditor', 'Auditor', ['reports:read']), is_system: false },
      builtIn('admin', 'Administrator', PERMISSIONS.map((item) => item.key)),
    ],
    { auditor: 3 },
  )
  server.use(
    http.patch('*/api/v1/admin/roles/auditor', async ({ request }) => {
      submitted = await request.json()
      return HttpResponse.json({ key: 'auditor' })
    }),
  )

  renderApp('/admin?section=rbac')
  const auditor = (await screen.findByRole('rowheader', { name: /Auditor/ })).closest('tr')!
  expect(within(auditor).getByText('3')).toBeInTheDocument()
  const granted = within(auditor).getByRole('checkbox', {
    name: 'Auditor: Read aggregate demand and matching reports',
  })
  expect(granted).toBeChecked()
  await user.click(
    within(auditor).getByRole('checkbox', {
      name: 'Auditor: Create and edit training providers and programs',
    }),
  )
  await waitFor(() =>
    expect(submitted).toEqual({ permissions: ['reports:read', 'training:manage'] }),
  )
})

it('locks the administrator role and offers no delete for built-in roles', async () => {
  rememberSignIn()
  serveAccountApi({ learner: admin, signedIn: true })
  serveCatalog()
  serveRoles([
    builtIn('admin', 'Administrator', PERMISSIONS.map((item) => item.key)),
    builtIn('trainer', 'Trainer', ['training:manage']),
    { ...builtIn('auditor', 'Auditor', ['reports:read']), is_system: false },
  ])

  renderApp('/admin?section=rbac')
  const administrator = (await screen.findByRole('rowheader', { name: /Administrator/ })).closest(
    'tr',
  )!
  for (const box of within(administrator).getAllByRole('checkbox')) {
    expect(box).toBeChecked()
    expect(box).toBeDisabled()
  }
  expect(within(administrator).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()

  const trainer = (await screen.findByRole('rowheader', { name: /Trainer/ })).closest('tr')!
  expect(within(trainer).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  expect(within(trainer).getByRole('checkbox', { name: /Trainer: Create and edit/ })).toBeEnabled()

  const auditor = (await screen.findByRole('rowheader', { name: /Auditor/ })).closest('tr')!
  expect(within(auditor).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
})

it('offers every composed role when assigning one to an account', async () => {
  rememberSignIn()
  serveAccountApi({ learner: admin, signedIn: true })
  serveCatalog()
  serveRoles([
    builtIn('learner', 'Learner', []),
    { ...builtIn('auditor', 'Auditor', ['reports:read']), is_system: false },
  ])
  server.use(
    http.get('*/api/v1/admin/users', () =>
      HttpResponse.json([
        {
          ...admin,
          id: '00000000-0000-4000-8000-000000000001',
          full_name: 'Maria Santos',
          email: 'maria@example.com',
          role: 'learner',
          permissions: [],
        },
      ]),
    ),
  )

  renderApp('/admin?section=learners')
  const select = await screen.findByLabelText('Role for Maria Santos')
  await waitFor(() => expect(select).toBeEnabled())
  expect(
    within(select).getAllByRole('option').map((option) => option.textContent),
  ).toEqual(['Learner', 'Auditor'])
})

const coordinator = {
  ...admin,
  role: 'regional_coordinator',
  permissions: ['reports:read'],
}

it('offers only the admin sections the account has permission for', async () => {
  rememberSignIn()
  serveAccountApi({ learner: coordinator, signedIn: true })
  serveCatalog()

  renderApp('/admin')
  const tabs = await screen.findByRole('navigation', { name: 'Admin sections' })
  expect(within(tabs).getByRole('button', { name: /Overview/ })).toBeInTheDocument()
  expect(within(tabs).getByRole('button', { name: /Recommendation/ })).toBeInTheDocument()
  expect(within(tabs).getByRole('button', { name: /Feedback/ })).toBeInTheDocument()
  // reports:read does not reach accounts, roles or partner credentials.
  expect(within(tabs).queryByRole('button', { name: /Users/ })).not.toBeInTheDocument()
  expect(within(tabs).queryByRole('button', { name: /Roles & Permissions/ })).not.toBeInTheDocument()
  expect(within(tabs).queryByRole('button', { name: /MCP partners/ })).not.toBeInTheDocument()
})

it('falls back to a permitted section when the link names one the account cannot open', async () => {
  rememberSignIn()
  serveAccountApi({ learner: coordinator, signedIn: true })
  serveCatalog()

  renderApp('/admin?section=rbac')
  // Not a dead end, and not the roles editor either.
  expect(await screen.findByRole('button', { name: /Overview/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  expect(screen.queryByRole('heading', { name: 'Roles and permissions' })).not.toBeInTheDocument()
})

it('turns away an account with no staff permissions', async () => {
  rememberSignIn()
  serveAccountApi({ learner: maria, signedIn: true })
  serveCatalog()

  renderApp('/admin?section=rbac')
  expect(
    await screen.findByRole('heading', { name: 'Admin management is not available' }),
  ).toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: 'Admin sections' })).not.toBeInTheDocument()
})
