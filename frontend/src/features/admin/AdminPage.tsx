import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  useMemo,
  useState,
  type FormEvent,
  type InputHTMLAttributes,
  type Key,
  type ReactNode,
} from 'react'
import { Button, Menu, MenuItem, MenuTrigger, Popover } from 'react-aria-components'
import { Link, Navigate, useSearchParams } from 'react-router'
import { ApiError } from '../../api/errors.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { EmptyState } from '../../components/EmptyState.tsx'
import { Icon, type IconName } from '../../components/Icon.tsx'
import { PageHero } from '../../components/PageHero.tsx'
import { en } from '../../copy/en.ts'
import { cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'
import { button } from '../../styles/buttons.ts'
import { AccountGate } from '../account/AccountGate.tsx'
import { McpToolSelector, toolTitle } from './McpToolSelector.tsx'
import { McpActivity } from './McpActivity.tsx'
import {
  adminUsersQuery,
  assignRole,
  createMcpClient,
  createRole,
  deleteRole,
  mcpClientsQuery,
  mcpToolsQuery,
  permissionsQuery,
  revokeMcpClient,
  roleAssignmentsQuery,
  rolesQuery,
  rotateMcpSecret,
  updateRole,
  USER_PAGE_SIZE,
  type AdminRole,
  type AdminUser,
  type McpClient,
  type McpCredentials,
  type Permission,
  type Role,
} from './api.ts'
import {
  feedbackQuery,
  demandQuery,
  matchingQuery,
  overviewQuery,
  readDate,
  type Period,
} from '../reports/api.ts'

type Section = 'overview' | 'learners' | 'rbac' | 'mcp' | 'mcp-activity' | 'recommendations' | 'feedback'
// Each section needs the permission its own endpoints are guarded by, so an account only sees what it can use.
const SECTIONS: readonly { id: Section; label: string; icon: IconName; permission: string }[] = [
  { id: 'overview', label: 'Overview', icon: 'bars', permission: 'reports:read' },
  { id: 'learners', label: 'Users', icon: 'person', permission: 'users:manage' },
  { id: 'rbac', label: 'Roles & Permissions', icon: 'person', permission: 'users:manage' },
  { id: 'mcp', label: 'MCP partners', icon: 'network', permission: 'mcp:manage' },
  { id: 'mcp-activity', label: 'MCP Activity', icon: 'bars', permission: 'mcp:manage' },
  { id: 'recommendations', label: 'Recommendation', icon: 'compass', permission: 'reports:read' },
  { id: 'feedback', label: 'Feedback', icon: 'growth', permission: 'reports:read' },
]
const ACCESS_LABELS: Record<string, string> = {
  'catalog:read': 'Read catalog and service listings',
  'recommend:run': 'Run recommendations and readiness checks',
  'reports:read': 'Read aggregate demand reports',
}
const accessLabel = (scope: string) => ACCESS_LABELS[scope] ?? scope

const card = 'rounded-18 border border-border bg-surface p-5 max-xs:p-4'
const label = 'mb-1 block text-13 font-semibold text-navy'
const field =
  'min-h-11 w-full rounded-10 border border-border bg-surface px-3 py-2 text-15 text-navy placeholder:text-muted hovered:border-hover-border'
const tableBox =
  'overflow-x-auto rounded-12 border border-border focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus'
const th =
  'border-b border-border bg-soft px-3 py-2 text-left text-13 font-semibold whitespace-nowrap text-muted'
const td = 'border-b border-rule px-3 py-3 text-14 text-navy align-top'

export default function AdminPage() {
  const { can, isSignedIn } = useAuth()
  const [params, setParams] = useSearchParams()
  const requested = params.get('section') as Section | null
  const sections = SECTIONS.filter((item) => can(item.permission))
  // A section the account cannot open falls back to the first one it can, so a shared link never dead-ends.
  const section = sections.some((item) => item.id === requested) ? requested! : sections[0]?.id

  if (isSignedIn && !section) return <Navigate to={paths.home} replace />

  if (!section) {
    return (
      <AccountGate
        page="admin"
        icon="info"
        heading="Admin is not available"
        body={
          isSignedIn
            ? 'Your account does not have permission to open this workspace. An administrator can grant it under Roles & Permissions.'
            : 'Sign in with a staff account to open this workspace.'
        }
        action={isSignedIn ? undefined : 'Sign in'}
      />
    )
  }

  const page = en.pages.admin
  const selectSection = (nextSection: Section) =>
    setParams(nextSection === sections[0]?.id ? {} : { section: nextSection }, { replace: true })
  const mcpSections = sections.filter((item) => item.id === 'mcp' || item.id === 'mcp-activity')
  const selectedMcpSection = mcpSections.find((item) => item.id === section)
  return (
    <>
      <PageHero
        heading={page.heading}
        title="Run the pilot"
        accent="from one secure workspace."
        lead={page.lead}
        art="network"
      />
      <nav
        aria-label="Admin sections"
        className="mb-5 rounded-18 border border-border bg-surface p-2"
      >
        <div className="flex flex-wrap gap-2">
          {sections.map((item) => {
            if (item.id === 'mcp-activity') return null

            if (item.id === 'mcp' && mcpSections.length > 1) {
              return (
                <MenuTrigger key={item.id}>
                  <Button
                    className={cx(
                      button({
                        variant: selectedMcpSection ? 'primary' : 'tertiary',
                        text: 14,
                        height: 44,
                      }),
                      'grow',
                    )}
                    aria-label={`MCP: ${selectedMcpSection?.label ?? item.label}`}
                    aria-pressed={Boolean(selectedMcpSection)}
                  >
                    <Icon name={selectedMcpSection?.icon ?? item.icon} />
                    {selectedMcpSection?.label ?? item.label}
                    <Icon name="chevron" className="ml-auto" />
                  </Button>
                  <Popover
                    placement="bottom start"
                    offset={8}
                    className="min-w-(--trigger-width) rounded-14 border border-border bg-surface p-1.5 shadow-popover data-entering:animate-pop"
                  >
                    <Menu
                      aria-label="MCP sections"
                      selectionMode="single"
                      selectedKeys={selectedMcpSection ? [selectedMcpSection.id] : []}
                      onAction={(key: Key) => selectSection(key as Section)}
                      className="outline-none"
                    >
                      {mcpSections.map((mcpSection) => (
                        <MenuItem
                          key={mcpSection.id}
                          id={mcpSection.id}
                          className="flex min-h-11 cursor-pointer items-center gap-2 rounded-10 px-3 py-2 text-14 font-semibold text-navy outline-none data-focused:bg-soft data-hovered:bg-soft data-selected:bg-tint data-selected:text-blue"
                        >
                          <Icon name={mcpSection.icon} />
                          {mcpSection.id === 'mcp' ? 'Partners' : 'Activities'}
                        </MenuItem>
                      ))}
                    </Menu>
                  </Popover>
                </MenuTrigger>
              )
            }

            return (
              <Button
                key={item.id}
                className={cx(
                  button({
                    variant: section === item.id ? 'primary' : 'tertiary',
                    text: 14,
                    height: 44,
                  }),
                  'grow',
                )}
                aria-pressed={section === item.id}
                onPress={() => selectSection(item.id)}
              >
                <Icon name={item.icon} />
                {item.label}
              </Button>
            )
          })}
        </div>
      </nav>
      {section === 'overview' && <Overview />}
      {section === 'learners' && <Learners />}
      {section === 'rbac' && <RbacManagement />}
      {section === 'mcp' && <McpPartners />}
      {section === 'mcp-activity' && <McpActivity />}
      {section === 'recommendations' && <RecommendationManagement />}
      {section === 'feedback' && <FeedbackManagement />}
    </>
  )
}

function Overview() {
  const overview = useQuery(overviewQuery({ from: null, to: null }))
  const clients = useQuery(mcpClientsQuery)
  const activeClients = clients.data?.filter((client) => client.is_active).length
  return (
    <div className="grid gap-4">
      <section
        className="grid grid-cols-3 gap-4 max-[900px]:grid-cols-1"
        aria-label="Admin summary"
      >
        <Metric
          label="Learners"
          value={overview.data?.learners}
          detail="Registered accounts"
          icon="person"
        />
        <Metric
          label="Active MCP partners"
          value={activeClients}
          detail="Issued integrations"
          icon="network"
        />
        <Metric
          label="Recommendation sessions"
          value={overview.data?.recommendation_sessions}
          detail="Pilot activity"
          icon="compass"
        />
      </section>
      <section className={card}>
        <h2 className="text-20 text-navy">Operations</h2>
        <p className="mb-4 text-14 text-muted">
          Continue into the existing operational areas without leaving the administrator workspace.
        </p>
        <div className="grid grid-cols-3 gap-3 max-[900px]:grid-cols-1">
          <Operation
            to={paths.reports}
            icon="growth"
            title="Reports"
            body="Demand, outcomes and pilot activity"
          />
          <Operation
            to={paths.training}
            icon="clipboard"
            title="Delivery network"
            body="Training and assessment supply"
          />
          <Operation
            to={paths.qualifications}
            icon="book"
            title="Catalog"
            body="Qualifications and competencies"
          />
        </div>
      </section>
    </div>
  )
}

function Metric({
  label: text,
  value,
  detail,
  icon,
}: {
  label: string
  value: ReactNode
  detail: string
  icon: IconName
}) {
  return (
    <article className={card}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="grid size-10 place-items-center rounded-12 bg-tint text-blue">
          <Icon name={icon} />
        </span>
        <span className="text-12 font-semibold tracking-[0.08em] text-muted uppercase">{text}</span>
      </div>
      <p className="text-30 mb-1 font-display font-bold text-navy tabular-nums">{value ?? '—'}</p>
      <p className="mb-0 text-13 text-muted">{detail}</p>
    </article>
  )
}

function Operation({
  to,
  icon,
  title,
  body,
}: {
  to: string
  icon: IconName
  title: string
  body: string
}) {
  return (
    <Link
      to={to}
      className="rounded-14 border border-border bg-soft p-4 text-navy no-underline hovered:border-hover-border hovered:bg-tint"
    >
      <Icon name={icon} />
      <strong className="mt-2 block text-15">{title}</strong>
      <span className="mt-1 block text-13 text-muted">{body}</span>
    </Link>
  )
}

function Learners() {
  const queryClient = useQueryClient()
  const { learner: currentAdmin } = useAuth()
  const [page, setPage] = useState(0)
  const users = useQuery(adminUsersQuery(page))
  const roles = useQuery(rolesQuery)
  const [search, setSearch] = useState('')
  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: AdminRole }) => assignRole(id, role),
    onSuccess: (updated) =>
      queryClient.setQueriesData<AdminUser[]>({ queryKey: ['admin', 'users'] }, (current) =>
        current?.map((user) => (user.id === updated.id ? updated : user)),
      ),
  })
  const shown = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    return (users.data ?? [])
      .slice(0, USER_PAGE_SIZE)
      .filter((user) =>
        !term
          ? true
          : `${user.full_name} ${user.email} ${user.role}`.toLocaleLowerCase().includes(term),
      )
  }, [search, users.data])

  return (
    <section className={card} aria-labelledby="learners-heading">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="learners-heading" className="text-20 text-navy">
            Learners and access roles
          </h2>
          <p className="mb-0 text-14 text-muted">
            Review accounts and assign least-privilege operational roles.
          </p>
        </div>
        <label className="w-full max-w-80">
          <span className={label}>Search this page</span>
          <input
            className={field}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name, email or role"
          />
        </label>
      </div>
      {users.isError ? (
        <InlineError error={users.error} onRetry={() => void users.refetch()} />
      ) : (
        <>
          {/* A scrolling table must be focusable so keyboard users can reach columns off screen. */}
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
          <div className={tableBox} role="region" aria-labelledby="learners-heading" tabIndex={0}>
            <table className="w-full min-w-180 border-collapse">
              <caption className="sr-only">Learner accounts and assigned roles</caption>
              <thead>
                <tr>
                  <th className={th}>Account</th>
                  <th className={th}>Joined</th>
                  <th className={th}>Role</th>
                  <th className={th}>Permissions</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((user) => (
                  <tr key={user.id}>
                    <td className={td}>
                      <strong className="block">{user.full_name}</strong>
                      <span className="text-muted">{user.email}</span>
                    </td>
                    <td className={td}>{new Date(user.created_at).toLocaleDateString('en-PH')}</td>
                    <td className={td}>
                      <label className="sr-only" htmlFor={`role-${user.id}`}>
                        Role for {user.full_name}
                      </label>
                      <select
                        id={`role-${user.id}`}
                        className={cx(field, 'min-w-34')}
                        value={user.role}
                        disabled={
                          roleMutation.isPending || user.id === currentAdmin?.id || !roles.isSuccess
                        }
                        onChange={(event) =>
                          roleMutation.mutate({
                            id: user.id,
                            role: event.target.value as AdminRole,
                          })
                        }
                      >
                        {/* While the roles load, keep the account's own role selectable so the value shows. */}
                        {(roles.data ?? [{ key: user.role, label: user.role }]).map((role) => (
                          <option key={role.key} value={role.key}>
                            {role.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={td}>
                      {user.permissions.length
                        ? user.permissions.join(', ')
                        : 'Learner access only'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {!users.isLoading && !users.isError && shown.length === 0 && (
        <p className="mt-4 mb-0 text-14 text-muted">No accounts match on this page.</p>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-14 text-muted">
        <span aria-live="polite">
          Page {page + 1} · Accounts {users.data?.length ? page * USER_PAGE_SIZE + 1 : 0}–
          {page * USER_PAGE_SIZE + Math.min(users.data?.length ?? 0, USER_PAGE_SIZE)}
        </span>
        <div className="flex gap-2">
          <Button
            className={button({ variant: 'secondary', text: 14, snug: true })}
            isDisabled={page === 0 || users.isFetching}
            onPress={() => setPage((current) => current - 1)}
          >
            Previous
          </Button>
          <Button
            className={button({ variant: 'secondary', text: 14, snug: true })}
            isDisabled={users.isFetching || (users.data?.length ?? 0) <= USER_PAGE_SIZE}
            onPress={() => setPage((current) => current + 1)}
          >
            Next
          </Button>
        </div>
      </div>
      {roles.isError && <InlineError error={roles.error} onRetry={() => void roles.refetch()} />}
      {roleMutation.isError && <InlineError error={roleMutation.error} />}
    </section>
  )
}

function RbacManagement() {
  const queryClient = useQueryClient()
  const roles = useQuery(rolesQuery)
  const permissions = useQuery(permissionsQuery)
  const assignments = useQuery(roleAssignmentsQuery)
  const [showForm, setShowForm] = useState(false)
  // Deleting a role frees its key and changes the dropdown in Learners, so refresh accounts as well.
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
    ])
  const scope = useMutation({
    mutationFn: ({ key, next }: { key: string; next: string[] }) =>
      updateRole(key, { permissions: next }),
    onSuccess: () => void refresh(),
  })
  const remove = useMutation({ mutationFn: deleteRole, onSuccess: () => void refresh() })
  const busy = scope.isPending || remove.isPending

  return (
    <div className="grid gap-4">
      <section className={card} aria-labelledby="rbac-heading">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="rbac-heading" className="text-20 text-navy">
              Roles and permissions
            </h2>
            <p className="mb-0 max-w-prose text-14 text-muted">
              Tick what each role may do, or add a role of your own. Permissions themselves are
              defined in the backend, where each one guards a real endpoint, so the list below is
              everything that can be granted. Assign roles to accounts under Users.
            </p>
          </div>
          <Button
            className={button({ variant: 'primary' })}
            onPress={() => setShowForm((value) => !value)}
          >
            <Icon name={showForm ? 'close' : 'person'} />
            {showForm ? 'Close form' : 'New role'}
          </Button>
        </div>
        {showForm && (
          <RoleForm
            permissions={permissions.data ?? []}
            onCreated={() => {
              setShowForm(false)
              void refresh()
            }}
          />
        )}
        {roles.isError || permissions.isError ? (
          <InlineError
            error={roles.error ?? permissions.error}
            onRetry={() => {
              void roles.refetch()
              void permissions.refetch()
            }}
          />
        ) : (
          <>
            {/* Keyboard users can scroll the wide permission matrix. */}
            {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
            <div className={tableBox} role="region" aria-labelledby="rbac-heading" tabIndex={0}>
              <table className="w-full min-w-240 border-collapse">
                <caption className="sr-only">
                  Permissions granted to each role. Tick a box to grant a permission.
                </caption>
                <thead>
                  <tr>
                    <th className={th}>Role</th>
                    <th className={th}>Accounts</th>
                    {(permissions.data ?? []).map((permission) => (
                      <th
                        key={permission.key}
                        className={th}
                        scope="col"
                        title={permission.description}
                      >
                        {permission.key}
                        <span className="sr-only"> — {permission.description}</span>
                      </th>
                    ))}
                    <th className={th}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(roles.data ?? []).map((role) => (
                    <RoleRow
                      key={role.key}
                      role={role}
                      permissions={permissions.data ?? []}
                      held={assignments.data?.[role.key] ?? 0}
                      busy={busy}
                      onToggle={(next) => scope.mutate({ key: role.key, next })}
                      onDelete={() => {
                        if (
                          window.confirm(
                            `Delete the ${role.label} role? Accounts can no longer be assigned to it.`,
                          )
                        )
                          remove.mutate(role.key)
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {(roles.isLoading || permissions.isLoading) && (
              <p className="mt-4 mb-0 text-14 text-muted">Loading roles and permissions…</p>
            )}
            <p className="mt-4 mb-0 text-13 text-muted">
              Built-in roles cannot be deleted, and the administrator role always holds every
              permission so that this page can never lock itself away.
            </p>
          </>
        )}
        {(scope.isError || remove.isError) && <InlineError error={scope.error ?? remove.error} />}
      </section>
    </div>
  )
}

function RoleRow({
  role,
  permissions,
  held,
  busy,
  onToggle,
  onDelete,
}: {
  role: Role
  permissions: Permission[]
  held: number
  busy: boolean
  onToggle: (next: string[]) => void
  onDelete: () => void
}) {
  // The administrator role is deliberately immutable; the API refuses to change it either way.
  const locked = role.key === 'admin'
  return (
    <tr>
      <th className={td} scope="row">
        <span className="block font-semibold">{role.label}</span>
        <span className="text-13 text-muted">{role.key}</span>
        {role.is_system && <span className="block text-13 text-muted">Built-in</span>}
        {role.description && (
          <span className="mt-1 block text-13 text-muted">{role.description}</span>
        )}
      </th>
      <td className={td}>{held}</td>
      {permissions.map((permission) => {
        const granted = role.permissions.includes(permission.key)
        return (
          <td className={td} key={permission.key}>
            <input
              type="checkbox"
              className="size-5 accent-fill"
              checked={granted}
              disabled={locked || busy}
              aria-label={`${role.label}: ${permission.description}`}
              onChange={() =>
                onToggle(
                  granted
                    ? role.permissions.filter((item) => item !== permission.key)
                    : [...role.permissions, permission.key],
                )
              }
            />
          </td>
        )
      })}
      <td className={td}>
        {!role.is_system && (
          <Button
            className={button({ variant: 'secondary', text: 14, snug: true })}
            isDisabled={busy}
            onPress={onDelete}
          >
            Delete
          </Button>
        )}
      </td>
    </tr>
  )
}

function RoleForm({
  permissions,
  onCreated,
}: {
  permissions: Permission[]
  onCreated: () => void
}) {
  const [granted, setGranted] = useState<string[]>([])
  const create = useMutation({
    mutationFn: createRole,
    onSuccess: () => {
      setGranted([])
      onCreated()
    },
  })
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (create.isPending) return
    const form = new FormData(event.currentTarget)
    create.mutate({
      key: String(form.get('key')),
      label: String(form.get('label')),
      description: String(form.get('description')).trim() || null,
      permissions: granted,
    })
  }
  return (
    <form className="mb-5 rounded-14 border border-border bg-soft p-4" onSubmit={submit}>
      <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
        <Field
          name="label"
          labelText="Role name"
          placeholder="Regional Coordinator"
          required
          maxLength={100}
        />
        <Field
          name="key"
          labelText="Key"
          placeholder="regional_coordinator"
          required
          minLength={2}
          maxLength={50}
          pattern="[a-z][a-z0-9_]*"
          title="Lowercase letters, numbers and underscores, starting with a letter."
        />
      </div>
      <p className="mt-2 mb-0 text-13 text-muted">
        The key is stored on every account with this role and cannot be changed later.
      </p>
      <label className="mt-4 block">
        <span className={label}>What this role is for (optional)</span>
        <textarea className={cx(field, 'min-h-20 resize-y')} name="description" maxLength={1000} />
      </label>
      <fieldset className="mt-4 border-0 p-0">
        <legend className={label}>Permissions</legend>
        <p className="mt-0 text-13 text-muted">
          Leave them all unticked for a role with learner access only.
        </p>
        <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
          {permissions.map((permission) => (
            <div
              key={permission.key}
              className="flex min-h-11 items-center gap-2 rounded-10 border border-border bg-surface px-3 py-2 text-13"
            >
              <input
                id={`role-permission-${permission.key}`}
                type="checkbox"
                className="size-5 shrink-0 accent-fill"
                checked={granted.includes(permission.key)}
                onChange={(event) =>
                  setGranted((current) =>
                    event.target.checked
                      ? [...current, permission.key]
                      : current.filter((item) => item !== permission.key),
                  )
                }
              />
              <label htmlFor={`role-permission-${permission.key}`}>
                <span className="block font-semibold text-navy">{permission.key}</span>
                <span className="text-muted">{permission.description}</span>
              </label>
            </div>
          ))}
        </div>
      </fieldset>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          className={button({ variant: 'primary' })}
          type="submit"
          disabled={create.isPending}
        >
          {create.isPending ? 'Creating…' : 'Create role'}
        </button>
      </div>
      {create.isError && <InlineError error={create.error} />}
    </form>
  )
}

function McpPartners() {
  const queryClient = useQueryClient()
  const clients = useQuery(mcpClientsQuery)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [sort, setSort] = useState('newest')
  const [showForm, setShowForm] = useState(false)
  const [credentials, setCredentials] = useState<McpCredentials | null>(null)
  const refresh = () => queryClient.invalidateQueries({ queryKey: mcpClientsQuery.queryKey })
  const rotate = useMutation({
    mutationFn: rotateMcpSecret,
    onSuccess: (result) => {
      setCredentials(result)
      void refresh()
    },
  })
  const revoke = useMutation({ mutationFn: revokeMcpClient, onSuccess: () => void refresh() })
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    return (clients.data ?? [])
      .filter(
        (client) =>
          (status === 'all' || (status === 'active' ? client.is_active : !client.is_active)) &&
          `${client.name} ${client.organisation} ${client.contact_email ?? ''} ${client.id}`
            .toLocaleLowerCase()
            .includes(term),
      )
      .sort((a, b) =>
        sort === 'name' ? a.name.localeCompare(b.name) : b.created_at.localeCompare(a.created_at),
      )
  }, [clients.data, search, status, sort])
  const active = clients.data?.filter((client) => client.is_active).length ?? 0

  return (
    <div className="grid gap-4">
      {credentials && (
        <SecretPanel credentials={credentials} onClose={() => setCredentials(null)} />
      )}
      <section className={card} aria-labelledby="mcp-heading">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="mcp-heading" className="text-20 text-navy">
              MCP partner clients
            </h2>
            <p className="mb-0 text-14 text-muted">
              Connect partner services and manage their access to TESDA tools.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              className={button({ variant: 'secondary', text: 14 })}
              isDisabled={clients.isFetching}
              onPress={() => void clients.refetch()}
            >
              {clients.isFetching ? 'Refreshing…' : 'Refresh'}
            </Button>
            <Button
              className={button({ variant: 'primary' })}
              onPress={() => setShowForm((value) => !value)}
            >
              <Icon name={showForm ? 'close' : 'network'} />
              {showForm ? 'Close form' : 'Add partner'}
            </Button>
          </div>
        </div>
        <dl className="mb-5 grid grid-cols-3 gap-3 max-sm:grid-cols-1" aria-label="Partner summary">
          {[
            ['Total partners', clients.data?.length],
            ['Active access', clients.data ? active : undefined],
            ['Revoked', clients.data ? clients.data.length - active : undefined],
          ].map(([title, value]) => (
            <div key={title} className="rounded-12 border border-border bg-soft px-4 py-3">
              <dt className="text-13 text-muted">{title}</dt>
              <dd className="m-0 mt-1 text-24 font-bold text-navy tabular-nums">{value ?? '—'}</dd>
            </div>
          ))}
        </dl>
        {showForm && (
          <McpClientForm
            onCreated={(result) => {
              setCredentials(result)
              setShowForm(false)
              void refresh()
            }}
          />
        )}
        <div className="mb-4 grid grid-cols-[minmax(0,1fr)_160px_160px] items-end gap-3 max-md:grid-cols-1">
          <label>
            <span className={label}>Search partners</span>
            <input
              type="search"
              className={field}
              placeholder="Name, organisation, email or client ID"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label>
            <span className={label}>Status</span>
            <select
              className={field}
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="all">All partners</option>
              <option value="active">Active</option>
              <option value="revoked">Revoked</option>
            </select>
          </label>
          <label>
            <span className={label}>Sort by</span>
            <select
              className={field}
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="newest">Newest first</option>
              <option value="name">Name A–Z</option>
            </select>
          </label>
        </div>
        {clients.isLoading && (
          <p role="status" className="text-14 text-muted">
            Loading partners…
          </p>
        )}
        {clients.isSuccess && (
          <p className="text-13 text-muted" role="status">
            Showing {filtered.length} of {clients.data.length} partners
          </p>
        )}
        {clients.isError ? (
          <InlineError error={clients.error} onRetry={() => void clients.refetch()} />
        ) : (
          <div className="grid gap-3">
            {filtered.map((client) => (
              <McpClientCard
                key={client.id}
                client={client}
                busy={rotate.isPending || revoke.isPending}
                onRotate={() => {
                  if (
                    window.confirm(
                      `Rotate the secret for ${client.name}? Existing tokens will stop working.`,
                    )
                  )
                    rotate.mutate(client.id)
                }}
                onRevoke={() => {
                  if (
                    window.confirm(
                      `Revoke ${client.name}? The partner will immediately lose access.`,
                    )
                  )
                    revoke.mutate(client.id)
                }}
              />
            ))}
          </div>
        )}
        {!clients.isLoading && !clients.isError && clients.data?.length === 0 && (
          <EmptyState
            icon="network"
            heading="No partner clients yet"
            body="Add the first approved partner to issue scoped MCP credentials."
            headingLevel={3}
          />
        )}
        {clients.isSuccess && clients.data.length > 0 && filtered.length === 0 && (
          <div className="rounded-14 border border-dashed border-border bg-soft p-6 text-center">
            <h3 className="text-17 text-navy">No matching partners</h3>
            <p className="text-14 text-muted">Try a different search or show all statuses.</p>
            <Button
              className={button({ variant: 'secondary', text: 14 })}
              onPress={() => {
                setSearch('')
                setStatus('all')
              }}
            >
              Clear filters
            </Button>
          </div>
        )}
        {(rotate.isError || revoke.isError) && <InlineError error={rotate.error ?? revoke.error} />}
      </section>
    </div>
  )
}

function McpClientForm({ onCreated }: { onCreated: (credentials: McpCredentials) => void }) {
  const [expectedTools, setExpectedTools] = useState<string[]>([])
  const tools = useQuery(mcpToolsQuery)
  const scopes = [
    ...new Set(
      expectedTools.map((tool) => tools.data?.[tool]).filter((scope) => scope !== undefined),
    ),
  ].sort()
  const create = useMutation({ mutationFn: createMcpClient, onSuccess: onCreated })
  const canCreate =
    tools.isSuccess &&
    expectedTools.length > 0 &&
    expectedTools.every((tool) => Boolean(tools.data[tool])) &&
    !create.isPending
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canCreate) return
    const form = new FormData(event.currentTarget)
    create.mutate({
      name: String(form.get('name')),
      organisation: String(form.get('organisation')),
      contact_email: String(form.get('contact_email')).trim() || null,
      declared_purpose: String(form.get('declared_purpose')),
      expected_tools: expectedTools,
      scopes,
      rate_limit_per_minute: Number(form.get('rate_limit_per_minute')),
    })
  }
  return (
    <form
      className="mb-6 overflow-hidden rounded-18 border border-hover-border bg-soft"
      onSubmit={submit}
      aria-labelledby="new-partner-heading"
    >
      <div className="border-b border-border bg-tint px-5 py-4">
        <p className="mb-1 text-12 font-bold tracking-wide text-blue uppercase">
          Partner onboarding
        </p>
        <h3 id="new-partner-heading" className="mb-1 text-20 text-navy">
          Connect a new partner
        </h3>
        <p className="mb-0 text-14 text-muted">
          Add their details, choose tools, then issue credentials.
        </p>
      </div>
      <div className="p-5 max-xs:p-4">
        <fieldset className="m-0 min-w-0 border-0 p-0" disabled={create.isPending}>
          <legend className="mb-3 text-16 font-semibold text-navy">Partner details</legend>
          <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
            <Field
              name="name"
              labelText="Client name"
              required
              maxLength={100}
              placeholder="e.g. Regional learning portal"
            />
            <Field
              name="organisation"
              labelText="Organisation"
              required
              maxLength={200}
              autoComplete="organization"
            />
            <Field
              name="contact_email"
              labelText="Contact email"
              type="email"
              autoComplete="email"
            />
            <Field
              name="rate_limit_per_minute"
              labelText="Calls per minute"
              type="number"
              defaultValue="120"
              min="1"
              max="10000"
              required
            />
          </div>
          <label className="mt-4 block">
            <span className={label}>Declared purpose</span>
            <textarea
              className={cx(field, 'min-h-24 resize-y')}
              name="declared_purpose"
              required
              maxLength={2000}
            />
          </label>
          <p className="mt-2 mb-0 text-13 text-muted">
            Describe how the integration will help learners. Client name, organisation and purpose
            are required.
          </p>
        </fieldset>
        <div className="mt-6 border-t border-border pt-5">
          {tools.isLoading && <p className="text-13 text-muted">Loading available tools…</p>}
          {tools.isError && (
            <InlineError error={tools.error} onRetry={() => void tools.refetch()} />
          )}
          <McpToolSelector
            tools={tools.data ?? {}}
            selected={expectedTools}
            onChange={setExpectedTools}
            disabled={create.isPending || !tools.isSuccess}
          />
        </div>
        <section
          className="mt-5 rounded-14 border border-border bg-surface p-4"
          aria-label="Access granted"
        >
          <h3 className={label}>Access granted automatically</h3>
          <div aria-live="polite">
            {scopes.length ? (
              <ul className="my-2 pl-5 text-14 text-navy">
                {scopes.map((scope) => (
                  <li key={scope}>{accessLabel(scope)}</li>
                ))}
              </ul>
            ) : (
              <p className="mb-0 text-13 text-muted">Select at least one tool to grant access.</p>
            )}
          </div>
          {scopes.length > 0 && (
            <p className="mb-0 text-13 text-muted">
              Access applies to all tools in each listed category. Expected tools record the
              partner’s planned usage; they do not restrict access to individual tools.
            </p>
          )}
        </section>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="mb-0 text-13 text-muted">
            {expectedTools.length} tools selected · {scopes.length} access categories
          </p>
          <Button type="submit" className={button({ variant: 'primary' })} isDisabled={!canCreate}>
            {create.isPending ? 'Creating…' : 'Create client'}
          </Button>
        </div>
        {create.isError && <InlineError error={create.error} />}
      </div>
    </form>
  )
}

function Field({
  labelText,
  ...props
}: { labelText: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label>
      <span className={label}>{labelText}</span>
      <input className={field} {...props} />
    </label>
  )
}

function McpClientCard({
  client,
  busy,
  onRotate,
  onRevoke,
}: {
  client: McpClient
  busy: boolean
  onRotate: () => void
  onRevoke: () => void
}) {
  return (
    <article
      className="min-w-0 rounded-14 border border-border bg-surface p-5"
      aria-label={client.name}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="mb-0 text-18 break-words text-navy">{client.name}</h3>
            <Status active={client.is_active} />
          </div>
          <p className="mt-1 mb-0 text-14 text-muted">{client.organisation}</p>
          <p className="mt-2 mb-0 max-w-2xl text-14 break-words text-muted">
            {client.declared_purpose}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            className={button({ text: 14, snug: true })}
            isDisabled={busy || !client.is_active}
            onPress={onRotate}
          >
            Rotate secret
          </Button>
          <Button
            className={button({ variant: 'tertiary', text: 14, snug: true })}
            isDisabled={busy || !client.is_active}
            onPress={onRevoke}
          >
            Revoke
          </Button>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-4 rounded-12 bg-soft p-4 text-13 max-md:grid-cols-1">
        <div>
          <dt className="font-semibold text-muted">Granted access</dt>
          <dd className="m-0 text-navy">{client.scopes.map(accessLabel).join('; ')}</dd>
        </div>
        <div>
          <dt className="font-semibold text-muted">Rate limit</dt>
          <dd className="m-0 text-navy">{client.rate_limit_per_minute}/minute</dd>
        </div>
        <div>
          <dt className="font-semibold text-muted">Last token</dt>
          <dd className="m-0 text-navy">
            {client.last_token_at
              ? new Date(client.last_token_at).toLocaleString('en-PH')
              : 'Never'}
          </dd>
        </div>
      </dl>
      <details className="mt-4 border-t border-rule pt-2">
        <summary className="min-h-11 cursor-pointer py-3 text-14 font-semibold text-blue">
          Integration details · {client.expected_tools.length} expected tools
        </summary>
        <div className="grid gap-3 pt-2 text-13">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="block font-semibold text-muted">Client ID</span>
              <code className="break-all text-navy">{client.id}</code>
            </div>
            <CopyButton value={client.id} labelText="Copy client ID" />
          </div>
          <p className="mb-0 text-muted">
            Created {new Date(client.created_at).toLocaleDateString('en-PH')}
            {client.contact_email ? ` · Contact: ${client.contact_email}` : ''}
          </p>
          <div className="flex flex-wrap gap-2">
            {client.expected_tools.map((tool) => (
              <span
                key={tool}
                className="rounded-full bg-tint px-3 py-1 text-12 text-blue"
                title={tool}
              >
                {toolTitle(tool)}
              </span>
            ))}
            {client.expected_tools.length === 0 && (
              <span className="text-muted">No expected tools declared.</span>
            )}
          </div>
        </div>
      </details>
    </article>
  )
}

function Status({ active }: { active: boolean }) {
  return (
    <span
      className={cx(
        'rounded-full px-2 py-1 text-11 font-bold uppercase',
        active ? 'bg-tint text-blue' : 'bg-warn-bg text-warn-ink',
      )}
    >
      {active ? 'Active' : 'Revoked'}
    </span>
  )
}

function SecretPanel({
  credentials,
  onClose,
}: {
  credentials: McpCredentials
  onClose: () => void
}) {
  return (
    <section
      className="rounded-18 border border-border bg-warn-bg p-5"
      aria-labelledby="secret-heading"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="secret-heading" className="text-18 text-navy">
            Store this secret now
          </h2>
          <p className="mb-3 text-14 text-warn-ink">
            It is shown once and cannot be recovered. Rotating it invalidates the previous secret
            and access tokens.
          </p>
        </div>
        <Button
          aria-label="Close secret"
          className={button({ variant: 'tertiary', snug: true })}
          onPress={onClose}
        >
          <Icon name="close" />
        </Button>
      </div>
      <dl className="grid gap-2 text-14">
        <div>
          <dt className="font-semibold">Client ID</dt>
          <dd className="m-0 flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono break-all">{credentials.client.id}</span>
            <CopyButton value={credentials.client.id} labelText="Copy client ID" />
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Client secret</dt>
          <dd className="m-0 rounded-10 border border-border bg-surface p-3 font-mono break-all select-all">
            {credentials.client_secret}
          </dd>
          <dd className="m-0 mt-2">
            <CopyButton value={credentials.client_secret} labelText="Copy client secret" />
          </dd>
        </div>
      </dl>
    </section>
  )
}

function CopyButton({ value, labelText }: { value: string; labelText: string }) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        className={button({ variant: 'secondary', text: 13, height: 44, snug: true })}
        isDisabled={busy}
        onPress={async () => {
          setBusy(true)
          setMessage('')
          try {
            await navigator.clipboard.writeText(value)
            setMessage('Copied')
          } catch {
            setMessage('Copy unavailable. Select the text and copy it manually.')
          } finally {
            setBusy(false)
          }
        }}
      >
        <Icon name="clipboard" />
        {labelText}
      </Button>
      <span role="status" className="text-12 text-muted">
        {message}
      </span>
    </div>
  )
}

function usePeriod() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const period: Period = { from: readDate(from), to: readDate(to) }
  return {
    from,
    to,
    setFrom,
    setTo,
    period,
    invalid: Boolean(period.from && period.to && period.to < period.from),
  }
}

function PeriodFilter({ value }: { value: ReturnType<typeof usePeriod> }) {
  return (
    <fieldset className="flex flex-wrap gap-3 rounded-12 border border-border p-3">
      <legend className="px-1 text-13 font-semibold text-navy">Reporting period</legend>
      <label className="text-13 text-navy">
        From
        <input
          type="date"
          className={field}
          value={value.from}
          max={value.to || undefined}
          onChange={(event) => value.setFrom(event.target.value)}
        />
      </label>
      <label className="text-13 text-navy">
        To
        <input
          type="date"
          className={field}
          value={value.to}
          min={value.from || undefined}
          onChange={(event) => value.setTo(event.target.value)}
        />
      </label>
      {value.invalid && (
        <p role="alert" className="w-full text-13 text-warn-ink">
          End date must be on or after start date.
        </p>
      )}
    </fieldset>
  )
}

function RecommendationManagement() {
  const filter = usePeriod()
  const matching = useQuery({ ...matchingQuery(filter.period), enabled: !filter.invalid })
  const demand = useQuery({ ...demandQuery(filter.period), enabled: !filter.invalid })
  const active = (demand.data ?? [])
    .filter((row) => row.top_match || row.chosen || row.readiness_checks)
    .sort((a, b) => b.top_match - a.top_match || b.chosen - a.chosen)
  return (
    <div className="grid gap-4">
      <section className={card} aria-labelledby="recommendation-heading">
        <h2 id="recommendation-heading" className="text-20 text-navy">
          Recommendation management
        </h2>
        <p className="text-14 text-muted">
          Monitor matching quality and qualification demand. Results are aggregate; learner goals
          and recommendations remain private.
        </p>
        <PeriodFilter value={filter} />
        {(matching.isError || demand.isError) && (
          <InlineError
            error={matching.error ?? demand.error}
            onRetry={() => {
              void matching.refetch()
              void demand.refetch()
            }}
          />
        )}
        <div className="mt-4 grid grid-cols-3 gap-3 max-md:grid-cols-1">
          <Metric
            label="Matching requests"
            value={matching.data?.requests}
            detail="Goals submitted"
            icon="compass"
          />
          <Metric
            label="No match"
            value={matching.data?.no_match}
            detail="Requests without a match"
            icon="info"
          />
          <Metric
            label="No-match rate"
            value={
              matching.data?.no_match_rate == null
                ? '—'
                : `${Math.round(matching.data.no_match_rate * 100)}%`
            }
            detail="Share of requests"
            icon="growth"
          />
        </div>
      </section>
      <section className={card} aria-labelledby="demand-heading">
        <h3 id="demand-heading" className="text-18 text-navy">
          Qualification demand
        </h3>
        {active.length ? (
          // Keyboard users can scroll the demand table on narrow screens.
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          <div className={tableBox} role="region" aria-labelledby="demand-heading" tabIndex={0}>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>Qualification</th>
                  <th className={th}>Top matches</th>
                  <th className={th}>Chosen</th>
                  <th className={th}>Readiness checks</th>
                </tr>
              </thead>
              <tbody>
                {active.map((row) => (
                  <tr key={row.qualification.code}>
                    <th className={td} scope="row">
                      {row.qualification.name}
                    </th>
                    <td className={td}>{row.top_match}</td>
                    <td className={td}>{row.chosen}</td>
                    <td className={td}>{row.readiness_checks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-14 text-muted">No qualification activity for this period.</p>
        )}
      </section>
    </div>
  )
}

function FeedbackManagement() {
  const filter = usePeriod()
  const feedback = useQuery({ ...feedbackQuery(filter.period), enabled: !filter.invalid })
  const data = feedback.data
  const dissatisfied = data ? data.answers - data.satisfied : 0
  const reasons = data ? Object.entries(data.reasons) : []
  const places = data ? Object.entries(data.by_place) : []
  return (
    <div className="grid gap-4">
      <section className={card} aria-labelledby="feedback-heading">
        <h2 id="feedback-heading" className="text-20 text-navy">
          Feedback management
        </h2>
        <p className="text-14 text-muted">
          Review anonymous satisfaction signals and reasons to prioritize recommendation
          improvements. Individual feedback is not exposed.
        </p>
        <PeriodFilter value={filter} />
        {feedback.isError && (
          <InlineError error={feedback.error} onRetry={() => void feedback.refetch()} />
        )}
        <div className="mt-4 grid grid-cols-3 gap-3 max-md:grid-cols-1">
          <Metric
            label="Responses"
            value={data?.answers}
            detail="Feedback received"
            icon="person"
          />
          <Metric
            label="Satisfied"
            value={data?.satisfied}
            detail="Positive responses"
            icon="growth"
          />
          <Metric
            label="Satisfaction rate"
            value={data?.answers ? `${Math.round((data.satisfied / data.answers) * 100)}%` : '—'}
            detail="Of responses"
            icon="bars"
          />
        </div>
      </section>
      <section className={card} aria-labelledby="reasons-heading">
        <h3 id="reasons-heading" className="text-18 text-navy">
          Why learners were dissatisfied
        </h3>
        <p className="text-13 text-muted">{dissatisfied} dissatisfied responses in this period.</p>
        {reasons.length ? (
          <ul className="m-0 grid list-none gap-2 p-0">
            {reasons.map(([reason, count]) => (
              <li
                key={reason}
                className="flex justify-between rounded-10 bg-soft px-3 py-2 text-14"
              >
                <span>{reason.replaceAll('_', ' ')}</span>
                <strong>{count}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-14 text-muted">No feedback yet.</p>
        )}
      </section>
      <section className={card} aria-labelledby="feedback-model-heading">
        <h3 id="feedback-model-heading" className="text-18 text-navy">
          By matching model
        </h3>
        {data?.by_model.length ? (
          <ul className="m-0 list-none p-0">
            {data.by_model.map((row) => (
              <li key={row.model ?? 'keyword'} className="border-b border-rule py-2 text-14">
                {row.model ?? 'Keyword matching'} · {row.satisfied}/{row.answers} satisfied
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-14 text-muted">No model feedback yet.</p>
        )}
      </section>
      <section className={card} aria-labelledby="feedback-place-heading">
        <h3 id="feedback-place-heading" className="text-18 text-navy">
          By recommendation position
        </h3>
        {places.length ? (
          <ul className="m-0 list-none p-0">
            {places.map(([place, tally]) => (
              <li key={place} className="border-b border-rule py-2 text-14">
                {place.replaceAll('_', ' ')} · {tally.satisfied}/{tally.answers} satisfied
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-14 text-muted">No position feedback yet.</p>
        )}
      </section>
      <section className={card} aria-labelledby="feedback-qualification-heading">
        <h3 id="feedback-qualification-heading" className="text-18 text-navy">
          By qualification
        </h3>
        {data?.by_qualification.length ? (
          <ul className="m-0 list-none p-0">
            {data.by_qualification.map((row) => (
              <li key={row.qualification.code} className="border-b border-rule py-2 text-14">
                {row.qualification.name} · {row.satisfied}/{row.answers} satisfied
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-14 text-muted">No qualification feedback yet.</p>
        )}
      </section>
    </div>
  )
}

function InlineError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof ApiError ? error.message : 'The request could not be completed.'
  return (
    <div
      role="alert"
      className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-12 bg-warn-bg px-4 py-3 text-14 text-warn-ink"
    >
      <span>{message}</span>
      {onRetry && (
        <Button
          className={button({ variant: 'secondary', text: 14, snug: true })}
          onPress={onRetry}
        >
          Try again
        </Button>
      )}
    </div>
  )
}
