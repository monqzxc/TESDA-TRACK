import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Button } from 'react-aria-components'
import { button } from '../../styles/buttons.ts'
import { toolTitle } from './McpToolSelector.tsx'
import {
  ACTIVITY_PAGE_SIZE,
  mcpActivityQuery,
  mcpClientsQuery,
  mcpToolsQuery,
  mcpUsageQuery,
  type McpActivityFilters,
  type McpActivityItem,
} from './api.ts'

const card = 'min-w-0 rounded-18 border border-border bg-surface p-5 max-xs:p-4'
const field =
  'mt-1 min-h-11 w-full rounded-10 border border-border bg-surface px-3 py-2 text-14 text-navy'
const outcomes = {
  ok: 'Successful',
  tool_error: 'Tool error',
  denied_token: 'Token denied',
  denied_scope: 'Access denied',
  rate_limited: 'Rate limited',
  invalid_request: 'Invalid request',
  server_error: 'Server error',
} as const
const outcomeLabel = (value: string) => outcomes[value as keyof typeof outcomes] ?? value
const timestamp = (value: string) =>
  new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Asia/Manila',
  }).format(new Date(value))

export function McpActivity() {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<McpActivityFilters>({})
  const [filters, setFilters] = useState<McpActivityFilters>({})
  const [page, setPage] = useState(0)
  const [validation, setValidation] = useState('')
  const clients = useQuery(mcpClientsQuery)
  const tools = useQuery(mcpToolsQuery)
  const usage = useQuery(mcpUsageQuery(filters.date_from, filters.date_to))
  const activity = useQuery(mcpActivityQuery(filters, page))
  const selectedClients = (usage.data?.clients ?? []).filter(
    (c) => !filters.client_id || c.client_id === filters.client_id,
  )
  const toolRows = selectedClients.flatMap((c) =>
    c.tools
      .filter((t) => !filters.tool || t.tool === filters.tool)
      .map((t) => ({ ...t, client: c.name, clientId: c.client_id })),
  )
  const total = filters.tool
    ? toolRows.reduce((n, t) => n + t.calls, 0)
    : selectedClients.reduce((n, c) => n + c.calls, 0)
  const ok = filters.tool
    ? toolRows.reduce((n, t) => n + t.ok, 0)
    : selectedClients.reduce((n, c) => n + (c.by_outcome.ok ?? 0), 0)
  const limited = filters.tool
    ? toolRows.reduce((n, t) => n + t.rate_limited, 0)
    : selectedClients.reduce((n, c) => n + (c.by_outcome.rate_limited ?? 0), 0)
  const unexpected = filters.tool
    ? toolRows.reduce((n, t) => n + (t.expected ? 0 : t.calls), 0)
    : selectedClients.reduce((n, c) => n + c.unexpected_tool_calls, 0)
  const toolNames = [
    ...new Set([
      ...Object.keys(tools.data ?? {}),
      ...(usage.data?.clients ?? []).flatMap((c) => c.tools.map((t) => t.tool)),
    ]),
  ].sort()
  const set = (key: keyof McpActivityFilters, value: string) =>
    setDraft((current) => ({ ...current, [key]: value || undefined }))
  function apply(event: FormEvent) {
    event.preventDefault()
    if (draft.date_from && draft.date_to && draft.date_from > draft.date_to) {
      setValidation('End date must be on or after the start date.')
      return
    }
    setValidation('')
    setFilters({ ...draft })
    setPage(0)
  }

  return (
    <div className="grid gap-5">
      <section className={card} aria-labelledby="mcp-activity-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="mcp-activity-title" className="text-20 font-bold text-navy">
              MCP Activity
            </h2>
            <p className="mt-1 text-14 text-muted">
              See which partners call your tools and the input metadata retained for each request.
            </p>
          </div>
          <Button
            className={button({ variant: 'secondary', height: 44 })}
            isDisabled={activity.isFetching || usage.isFetching}
            onPress={() => {
              setPage(0)
              void queryClient.invalidateQueries({ queryKey: ['admin', 'mcp'] })
            }}
          >
            Refresh activity
          </Button>
        </div>
        <form aria-label="Filter MCP activity" onSubmit={apply} className="mt-5 grid gap-4">
          <div className="grid grid-cols-2 gap-3 max-[600px]:grid-cols-1">
            <label className="text-13 font-semibold text-navy">
              Partner client
              <select
                className={field}
                value={draft.client_id ?? ''}
                onChange={(e) => set('client_id', e.target.value)}
              >
                <option value="">All clients</option>
                {clients.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.is_active ? '' : ' (revoked)'}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-13 font-semibold text-navy">
              Tool
              <select
                className={field}
                value={draft.tool ?? ''}
                onChange={(e) => set('tool', e.target.value)}
              >
                <option value="">All tools and protocol requests</option>
                {toolNames.map((t) => (
                  <option key={t} value={t}>
                    {toolTitle(t)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3 max-[600px]:grid-cols-1">
            <label className="text-13 font-semibold text-navy">
              Start date (Philippine time)
              <input
                type="date"
                className={field}
                value={draft.date_from ?? ''}
                onChange={(e) => set('date_from', e.target.value)}
              />
            </label>
            <label className="text-13 font-semibold text-navy">
              End date (Philippine time)
              <input
                type="date"
                className={field}
                value={draft.date_to ?? ''}
                onChange={(e) => set('date_to', e.target.value)}
              />
            </label>
            <label className="text-13 font-semibold text-navy">
              Recent-call outcome
              <select
                className={field}
                value={draft.outcome ?? ''}
                onChange={(e) => set('outcome', e.target.value)}
              >
                <option value="">All outcomes</option>
                {Object.entries(outcomes).map(([value, title]) => (
                  <option key={value} value={value}>
                    {title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {validation && (
            <p role="alert" className="text-14 text-navy">
              {validation}
            </p>
          )}
          {(clients.isError || tools.isError) && (
            <p role="alert" className="text-14 text-muted">
              Some filter choices could not load. Refresh activity to retry.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className={button({ variant: 'primary', height: 44 })}>
              Apply filters
            </Button>
            <Button
              className={button({ variant: 'tertiary', height: 44 })}
              onPress={() => {
                setDraft({})
                setFilters({})
                setPage(0)
                setValidation('')
              }}
            >
              Clear filters
            </Button>
          </div>
        </form>
      </section>

      <section className={card} aria-labelledby="usage-title">
        <h2 id="usage-title" className="text-18 font-bold text-navy">
          Usage summary
        </h2>
        <p className="mt-1 text-13 text-muted">
          Applied client, tool and date filters. Outcome filtering only affects recent calls. Totals
          include archived daily counts.
        </p>
        {usage.isPending ? (
          <p role="status" className="mt-4 text-muted">
            Loading usage…
          </p>
        ) : usage.isError ? (
          <p role="alert" className="mt-4 text-navy">
            Usage could not load. {usage.error.message} Use Refresh activity to retry.
          </p>
        ) : (
          <>
            <dl className="mt-4 grid grid-cols-4 gap-3 max-[800px]:grid-cols-2">
              {[
                ['Client requests', total],
                ['Not successful', total - ok],
                ['Rate limited', limited],
                ['Undeclared tool calls', unexpected],
              ].map(([title, value]) => (
                <div key={title} className="rounded-12 border border-border bg-soft p-4">
                  <dt className="text-13 text-muted">{title}</dt>
                  <dd className="mt-1 text-24 font-bold text-navy">
                    {Number(value).toLocaleString()}
                  </dd>
                </div>
              ))}
            </dl>
            {!filters.client_id && !filters.tool && (
              <p className="mt-3 text-13 text-muted">
                Unattributed authentication denials:{' '}
                {usage.data.unattributed_denials.toLocaleString()} (separate from client requests).
              </p>
            )}
            <p className="mt-3 text-13 text-muted">
              Undeclared means outside the partner’s current expected-tool selection, not
              necessarily blocked. Latency percentiles use retained successful and tool-error calls
              only.
            </p>
            {toolRows.length === 0 ? (
              <p className="mt-4 text-14 text-muted">No tool usage in this selection.</p>
            ) : (
              // Keyboard users need to focus this region to scroll its wide table.
              /* eslint-disable jsx-a11y/no-noninteractive-tabindex */
              <div
                className="mt-4 overflow-x-auto rounded-12 border border-border focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus"
                role="region"
                aria-label="Tool usage"
                tabIndex={0}
              >
                <table className="w-full text-left text-13 text-navy">
                  <caption className="sr-only">
                    Per-client tool usage and latency in milliseconds
                  </caption>
                  <thead className="bg-soft text-muted">
                    <tr>
                      {[
                        'Client / tool',
                        'Calls',
                        'Successful',
                        'Rate limited',
                        'p50 / p95 latency',
                      ].map((h) => (
                        <th key={h} scope="col" className="px-3 py-3 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {toolRows.map((t) => (
                      <tr key={`${t.clientId}:${t.tool}`} className="border-t border-rule">
                        <td className="px-3 py-3">
                          <span className="block font-semibold">{t.client}</span>
                          <code>{t.tool}</code>
                          {!t.expected && <span className="block text-muted">Undeclared tool</span>}
                        </td>
                        <td className="px-3 py-3">{t.calls}</td>
                        <td className="px-3 py-3">{t.ok}</td>
                        <td className="px-3 py-3">{t.rate_limited}</td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {t.p50_ms === null ? '—' : `${t.p50_ms} ms`} /{' '}
                          {t.p95_ms === null ? '—' : `${t.p95_ms} ms`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              /* eslint-enable jsx-a11y/no-noninteractive-tabindex */
            )}
          </>
        )}
      </section>

      <section className={card} aria-labelledby="recent-calls-title">
        <h2 id="recent-calls-title" className="text-18 font-bold text-navy">
          Recent calls
        </h2>
        <p className="mt-1 text-13 text-muted">
          Newest first · Philippine time (UTC+8).{' '}
          {activity.data
            ? `Detailed logs are retained for ${activity.data.retention_days} days before folding into daily totals.`
            : 'Only retained detailed logs appear here.'}
        </p>
        <p className="mt-2 rounded-10 bg-soft p-3 text-13 text-muted">
          Privacy: input names and validated codes are shown, not full payloads. Raw goals,
          coordinates, secrets and response bodies are not displayed. Older calls may appear in
          totals without details.
        </p>
        {activity.isPending ? (
          <p role="status" className="mt-4 text-muted">
            Loading recent calls…
          </p>
        ) : activity.isError ? (
          <p role="alert" className="mt-4 text-navy">
            Recent calls could not load. {activity.error.message} Use Refresh activity to retry.
          </p>
        ) : activity.data.items.length === 0 ? (
          <p className="mt-4 text-14 text-muted">No retained calls match these filters.</p>
        ) : (
          <div className="mt-4 grid gap-3">
            {activity.data.items.map((call) => (
              <CallDetails key={call.id} call={call} />
            ))}
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p aria-live="polite" className="text-13 text-muted">
            Page {page + 1}
            {activity.data?.items.length
              ? ` · Records ${page * ACTIVITY_PAGE_SIZE + 1}–${page * ACTIVITY_PAGE_SIZE + activity.data.items.length}`
              : ''}
          </p>
          <div className="flex gap-2">
            <Button
              className={button({ variant: 'secondary', height: 44 })}
              isDisabled={page === 0 || activity.isFetching}
              onPress={() => setPage((p) => p - 1)}
            >
              Previous calls
            </Button>
            <Button
              className={button({ variant: 'secondary', height: 44 })}
              isDisabled={!activity.data?.has_more || activity.isFetching || activity.isError}
              onPress={() => setPage((p) => p + 1)}
            >
              Next calls
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}

function CallDetails({ call }: { call: McpActivityItem }) {
  return (
    <details className="rounded-12 border border-border p-3 text-14 text-navy">
      <summary className="min-h-11 cursor-pointer rounded-6 break-words focus-visible:outline-3 focus-visible:outline-focus">
        <span className="font-semibold">
          {call.client_name ?? 'Unattributed client'} ·{' '}
          {call.tool ? toolTitle(call.tool) : call.method}
        </span>
        <span className="mt-1 block pl-4 text-13 text-muted">
          {timestamp(call.called_at)} · {outcomeLabel(call.outcome)} · {call.latency_ms} ms
          {call.occurrences > 1 ? ` · ${call.occurrences} grouped denials` : ''}
        </span>
        <span className="mt-1 block pl-4 text-12 text-muted">View retained input metadata</span>
      </summary>
      <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-rule pt-3 max-[600px]:grid-cols-1">
        {[
          ['Request', `${call.method}${call.tool ? ` · ${call.tool}` : ''}`],
          ['Client ID', call.client_id ?? 'Unavailable'],
          [
            'Input fields sent',
            call.inputs_sent.length ? call.inputs_sent.join(', ') : 'No input fields retained',
          ],
          ['Qualification code', call.qualification_code ?? 'Not retained'],
          ['Region code', call.region_code ?? 'Not retained'],
          ['Page offset', call.page_offset ?? 'Not retained'],
          ['Result count', call.result_count ?? 'Unavailable'],
          ['Error code', call.error_code ?? 'None'],
          ['Protocol version', call.protocol_version ?? 'Unavailable'],
          [
            'Expected tool',
            call.expected === null
              ? 'Not applicable'
              : call.expected
                ? 'Yes (current declaration)'
                : 'No (current declaration)',
          ],
        ].map(([title, value]) => (
          <div key={title}>
            <dt className="text-12 text-muted">{title}</dt>
            <dd className="mt-1 break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  )
}
