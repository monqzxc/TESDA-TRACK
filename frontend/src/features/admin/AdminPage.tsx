import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react'
import { Button } from 'react-aria-components'
import { Link, useSearchParams } from 'react-router'
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
import {
  adminUsersQuery,
  assignRole,
  createMcpClient,
  mcpClientsQuery,
  mcpToolsQuery,
  revokeMcpClient,
  rolesQuery,
  rotateMcpSecret,
  USER_PAGE_SIZE,
  type AdminRole,
  type AdminUser,
  type McpClient,
  type McpCredentials,
} from './api.ts'
import {
  feedbackQuery,
  demandQuery,
  matchingQuery,
  overviewQuery,
  readDate,
  type Period,
} from '../reports/api.ts'

type Section = 'overview' | 'learners' | 'rbac' | 'mcp' | 'recommendations' | 'feedback'
const SECTIONS: readonly { id: Section; label: string; icon: IconName }[] = [
  { id: 'overview', label: 'Overview', icon: 'bars' },
  { id: 'learners', label: 'Users', icon: 'person' },
  { id: 'rbac', label: 'Roles & Permissions', icon: 'person' },
  { id: 'mcp', label: 'MCP partners', icon: 'network' },
  { id: 'recommendations', label: 'Recommendation', icon: 'compass' },
  { id: 'feedback', label: 'Feedback', icon: 'growth' },
]
const ROLES: readonly AdminRole[] = [
  'learner',
  'trainer',
  'assessor',
  'verifier',
  'analyst',
  'admin',
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
  const { isAdmin, isSignedIn } = useAuth()
  const [params, setParams] = useSearchParams()
  const requested = params.get('section') as Section | null
  const section = SECTIONS.some((item) => item.id === requested) ? requested! : 'overview'

  if (!isAdmin) {
    return (
      <AccountGate
        page="admin"
        icon="info"
        heading="Admin management is not available"
        body={
          isSignedIn
            ? 'This workspace is only available to administrator accounts.'
            : 'Sign in with an administrator account to open this workspace.'
        }
        action={isSignedIn ? undefined : 'Sign in'}
      />
    )
  }

  const page = en.pages.admin
  return (
    <>
      <PageHero
        heading={page.heading}
        title="Run the pilot"
        accent="from one secure workspace."
        lead={page.lead}
        art="network"
      />
      <nav aria-label="Admin sections" className="mb-4 overflow-x-auto pb-1">
        <div className="flex min-w-max gap-2">
          {SECTIONS.map((item) => (
            <Button
              key={item.id}
              className={button({ variant: section === item.id ? 'primary' : 'secondary' })}
              aria-pressed={section === item.id}
              onPress={() =>
                setParams(item.id === 'overview' ? {} : { section: item.id }, { replace: true })
              }
            >
              <Icon name={item.icon} />
              {item.label}
            </Button>
          ))}
        </div>
      </nav>
      {section === 'overview' && <Overview />}
      {section === 'learners' && <Learners />}
      {section === 'rbac' && <RbacManagement />}
      {section === 'mcp' && <McpPartners />}
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
                        disabled={roleMutation.isPending || user.id === currentAdmin?.id}
                        onChange={(event) =>
                          roleMutation.mutate({
                            id: user.id,
                            role: event.target.value as AdminRole,
                          })
                        }
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {role}
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
      {roleMutation.isError && <InlineError error={roleMutation.error} />}
    </section>
  )
}

function RbacManagement() {
  const roles = useQuery(rolesQuery)
  const permissions = [...new Set(Object.values(roles.data ?? {}).flat())].sort()
  return (
    <section className={card} aria-labelledby="rbac-heading">
      <h2 id="rbac-heading" className="text-20 text-navy">
        Role-based access control
      </h2>
      <p className="text-14 text-muted">
        Review the permissions granted to each fixed application role. Assign roles in Learners &
        roles; permission definitions are maintained in the backend, not edited per account.
      </p>
      {roles.isError ? (
        <InlineError error={roles.error} onRetry={() => void roles.refetch()} />
      ) : (
        <>
          {/* Keyboard users can scroll the wide permission matrix. */}
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
          <div className={tableBox} role="region" aria-labelledby="rbac-heading" tabIndex={0}>
            <table className="w-full min-w-180 border-collapse">
              <caption className="sr-only">Permissions granted to each role</caption>
              <thead>
                <tr>
                  <th className={th}>Role</th>
                  {permissions.map((permission) => (
                    <th key={permission} className={th} scope="col">
                      {permission}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROLES.map((role) => (
                  <tr key={role}>
                    <th className={td} scope="row">
                      {role}
                    </th>
                    {permissions.map((permission) => (
                      <td
                        className={td}
                        key={permission}
                        aria-label={`${role}: ${permission} ${roles.data?.[role]?.includes(permission) ? 'granted' : 'not granted'}`}
                      >
                        {roles.data?.[role]?.includes(permission) ? '✓' : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {roles.isLoading && <p className="text-14 text-muted">Loading permissions…</p>}
        </>
      )}
    </section>
  )
}

function McpPartners() {
  const queryClient = useQueryClient()
  const clients = useQuery(mcpClientsQuery)
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
              Issue scoped credentials, rotate secrets and revoke access.
            </p>
          </div>
          <Button
            className={button({ variant: 'primary' })}
            onPress={() => setShowForm((value) => !value)}
          >
            <Icon name={showForm ? 'close' : 'network'} />
            {showForm ? 'Close form' : 'Add partner'}
          </Button>
        </div>
        {showForm && (
          <McpClientForm
            onCreated={(result) => {
              setCredentials(result)
              setShowForm(false)
              void refresh()
            }}
          />
        )}
        {clients.isError ? (
          <InlineError error={clients.error} onRetry={() => void clients.refetch()} />
        ) : (
          <div className="grid gap-3">
            {(clients.data ?? []).map((client) => (
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
    <form className="mb-5 rounded-14 border border-border bg-soft p-4" onSubmit={submit}>
      <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
        <Field name="name" labelText="Client name" required />
        <Field name="organisation" labelText="Organisation" required />
        <Field name="contact_email" labelText="Contact email" type="email" />
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
      <fieldset className="mt-4 border-0 p-0">
        <legend className={label}>Expected tools</legend>
        <p className="mt-0 text-13 text-muted">
          Select the tools this partner plans to use. Required access is added automatically.
        </p>
        {tools.isLoading && <p className="text-13 text-muted">Loading available tools…</p>}
        {tools.isError && <InlineError error={tools.error} onRetry={() => void tools.refetch()} />}
        <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
          {Object.entries(tools.data ?? {}).map(([tool, scope]) => (
            <div
              key={tool}
              className="flex min-h-11 items-center gap-2 rounded-10 border border-border bg-surface px-3 py-2 text-13"
            >
              <input
                id={`expected-tool-${tool}`}
                type="checkbox"
                aria-label={tool}
                checked={expectedTools.includes(tool)}
                onChange={(event) =>
                  setExpectedTools((current) =>
                    event.target.checked
                      ? [...current, tool]
                      : current.filter((item) => item !== tool),
                  )
                }
              />
              <label htmlFor={`expected-tool-${tool}`}>
                <strong className="block text-navy">{tool}</strong>
                <span className="text-muted">{accessLabel(scope)}</span>
              </label>
            </div>
          ))}
        </div>
      </fieldset>
      <section
        className="mt-4 rounded-10 border border-border bg-surface p-3"
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
            Access applies to all tools in each listed category. Expected tools record the partner’s
            planned usage; they do not restrict access to individual tools.
          </p>
        )}
      </section>
      <Button
        type="submit"
        className={cx(button({ variant: 'primary' }), 'mt-4')}
        isDisabled={!canCreate}
      >
        {create.isPending ? 'Creating…' : 'Create client'}
      </Button>
      {create.isError && <InlineError error={create.error} />}
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
    <article className="rounded-14 border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="mb-0 text-17 text-navy">{client.name}</h3>
            <Status active={client.is_active} />
          </div>
          <p className="mt-1 mb-0 text-14 text-muted">
            {client.organisation} · {client.declared_purpose}
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
      <dl className="mt-3 grid grid-cols-3 gap-3 text-13 max-md:grid-cols-1">
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
          <dd className="m-0 font-mono break-all">{credentials.client.id}</dd>
        </div>
        <div>
          <dt className="font-semibold">Client secret</dt>
          <dd className="m-0 rounded-10 border border-border bg-surface p-3 font-mono break-all select-all">
            {credentials.client_secret}
          </dd>
        </div>
      </dl>
    </section>
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
