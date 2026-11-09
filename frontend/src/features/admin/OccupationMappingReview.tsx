import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from 'react-aria-components'
import { useAuth } from '../../auth/useAuth.ts'
import { button } from '../../styles/buttons.ts'
import {
  mappingReviews,
  marketDatasets,
  reviewMapping,
  setMarketDatasetStatus,
  type MappingReview,
  type ReviewFilters,
} from '../labor-market/api.ts'

const field = 'min-h-11 w-full rounded-10 border border-border bg-surface p-2 text-14 text-navy'
const card = 'min-w-0 rounded-16 border border-border bg-surface p-4 text-ink'
export function OccupationMappingReview() {
  const { can } = useAuth()
  const [filters, setFilters] = useState<ReviewFilters>({
    status: 'pending',
    search: '',
    offset: 0,
  })
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [datasetNote, setDatasetNote] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const client = useQueryClient()
  const permitted = can('labor-market:review')
  const reviews = useQuery({
    queryKey: ['admin', 'labor-market', 'review', filters],
    queryFn: ({ signal }) => mappingReviews(filters, signal),
    enabled: permitted,
  })
  const datasets = useQuery({
    queryKey: ['admin', 'labor-market', 'datasets'],
    queryFn: ({ signal }) => marketDatasets(signal),
    enabled: permitted,
  })
  // Review data follows the existing account-cache boundary and is cleared on sign-out.
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['admin', 'labor-market'] }),
      client.invalidateQueries({ queryKey: ['labor-market', 'indicators'] }),
    ])
  const mutation = useMutation({
    mutationFn: ({
      mapping,
      decision,
    }: {
      mapping: MappingReview
      decision: MappingReview['decision']
    }) => reviewMapping(mapping, decision, notes[mapping.id] ?? ''),
    onSuccess: (_data, { mapping, decision }) => {
      setAnnouncement(`${mapping.occupation_title}: ${decision}. Decision recorded.`)
      void refresh()
    },
  })
  const versionMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'active' | 'retired' }) =>
      setMarketDatasetStatus(id, status, datasetNote),
    onSuccess: () => {
      setAnnouncement('Dataset status updated. Mapping decisions were preserved.')
      void refresh()
    },
  })
  if (!permitted)
    return (
      <p role="alert">An authorized staff account is required to review occupation mappings.</p>
    )
  const update = (patch: Partial<ReviewFilters>) =>
    setFilters((current) => ({ ...current, ...patch, offset: 0 }))
  return (
    <div className="grid min-w-0 gap-4">
      <section className={card}>
        <h2 className="text-22 mt-0 font-bold text-navy">Occupation Mapping Review</h2>
        <p>
          Proposals are not approvals. Only explicitly approved, high-confidence mappings from
          active forecast periods can produce public demand indicators. Read the occupation scope
          and both sources before deciding.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-14">
            Search occupation
            <input
              className={field}
              value={filters.search}
              onChange={(e) => update({ search: e.target.value })}
            />
          </label>
          <label className="text-14">
            Review status
            <select
              className={field}
              value={filters.status ?? ''}
              onChange={(e) =>
                update({ status: (e.target.value as ReviewFilters['status']) || undefined })
              }
            >
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
          <label className="text-14">
            Proposal confidence
            <select
              className={field}
              value={filters.confidence ?? ''}
              onChange={(e) =>
                update({ confidence: (e.target.value as ReviewFilters['confidence']) || undefined })
              }
            >
              <option value="">All confidence levels</option>
              <option value="high_confidence">High confidence</option>
              <option value="needs_review">Needs manual review</option>
              <option value="rejected">Rejected proposal</option>
            </select>
          </label>
          <label className="text-14">
            Evidence classification
            <select
              className={field}
              value={filters.classification ?? ''}
              onChange={(e) =>
                update({
                  classification: (e.target.value as ReviewFilters['classification']) || undefined,
                })
              }
            >
              <option value="">All classifications</option>
              <option value="in_demand">In demand</option>
              <option value="hard_to_fill">Hard to fill</option>
              <option value="observed_posting">Observed posting</option>
              <option value="cross_cutting">Cross-cutting / historical</option>
            </select>
          </label>
        </div>
      </section>
      <p role="status" aria-live="polite" className="m-0 text-14 text-navy">
        {announcement ||
          (reviews.isPending
            ? 'Loading proposals…'
            : `${reviews.data?.total ?? 0} matching proposals`)}
      </p>
      {(reviews.error || mutation.error || versionMutation.error || datasets.error) && (
        <p role="alert" className={card}>
          {(reviews.error ?? mutation.error ?? versionMutation.error ?? datasets.error)?.message}
        </p>
      )}
      {reviews.data?.items.map((mapping, index) => (
        <details key={mapping.id} open={index === 0} className={card} data-mapping-id={mapping.id}>
          <summary className="cursor-pointer text-16 font-semibold wrap-anywhere text-navy">
            {mapping.occupation_title} — {mapping.qualification_name}
          </summary>
          <div className="mt-4 grid gap-3 text-14 leading-relaxed wrap-anywhere">
            <p className="m-0">
              <strong>Status:</strong> {mapping.decision} · <strong>Proposal:</strong>{' '}
              {mapping.proposal.replaceAll('_', ' ')} ·{' '}
              {mapping.classification.replaceAll('_', ' ')}
            </p>
            <p className="m-0">
              {mapping.coverage === 'national' ? 'Philippines — National' : mapping.region_code} ·{' '}
              {mapping.period_label} · {mapping.evidence_class.replaceAll('_', ' ')} · Dataset{' '}
              {mapping.dataset_status}
            </p>
            <p className="m-0">
              <strong>Sector:</strong> {mapping.sector || 'Not specified'}
              <br />
              <strong>Occurrence:</strong> {mapping.occurrence_key}
              <br />
              <strong>Original source ID:</strong> {mapping.original_record_id}
            </p>
            <p className="m-0">
              <strong>Research assessment:</strong> {mapping.review_reason}
            </p>
            <p className="m-0">
              <strong>Evidence tier:</strong> {mapping.evidence_tier.replaceAll('_', ' ')}
            </p>
            <a
              href={mapping.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue underline"
            >
              {mapping.source_title}
            </a>
            <p className="m-0">{mapping.source_reference}</p>
            <a
              href={mapping.training_regulation_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue underline"
            >
              TESDA Training Regulations — {mapping.qualification_name}
            </a>
            <p className="m-0">{mapping.training_regulation_reference}</p>
            <details>
              <summary className="cursor-pointer text-navy">
                Relevant qualification competencies
              </summary>
              <ul className="pl-5">
                {mapping.competencies.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </details>
            {mapping.cautions && (
              <p className="m-0">
                <strong>Scope cautions:</strong> {mapping.cautions}
              </p>
            )}
            <label>
              Review note (required)
              <textarea
                className={`${field} mt-1 min-h-24`}
                maxLength={4000}
                value={notes[mapping.id] ?? ''}
                onChange={(e) => setNotes((n) => ({ ...n, [mapping.id]: e.target.value }))}
              />
            </label>
            {mapping.proposal !== 'high_confidence' && (
              <p className="m-0">
                Approval is unavailable. This proposal requires new evidence review and a new
                dataset version before it can become eligible.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                className={button({ variant: 'primary', text: 14 })}
                isDisabled={
                  mutation.isPending ||
                  (notes[mapping.id]?.trim().length ?? 0) < 5 ||
                  mapping.proposal !== 'high_confidence' ||
                  mapping.decision === 'approved'
                }
                onPress={() => mutation.mutate({ mapping, decision: 'approved' })}
              >
                Approve mapping
              </Button>
              <Button
                className={button({ variant: 'secondary', text: 14 })}
                isDisabled={
                  mutation.isPending ||
                  (notes[mapping.id]?.trim().length ?? 0) < 5 ||
                  mapping.decision === 'rejected'
                }
                onPress={() => mutation.mutate({ mapping, decision: 'rejected' })}
              >
                Reject mapping
              </Button>
              <Button
                className={button({ variant: 'tertiary', text: 14 })}
                isDisabled={
                  mutation.isPending ||
                  (notes[mapping.id]?.trim().length ?? 0) < 5 ||
                  mapping.decision === 'pending'
                }
                onPress={() => mutation.mutate({ mapping, decision: 'pending' })}
              >
                Return to pending
              </Button>
            </div>
            <details>
              <summary className="cursor-pointer text-navy">
                Decision history ({mapping.history.length})
              </summary>
              {mapping.history.length === 0 ? (
                <p>
                  No administrator decision recorded. Imported proposal assessment is shown above.
                </p>
              ) : (
                <ol className="pl-5">
                  {mapping.history.map((h) => (
                    <li key={h.id}>
                      {new Date(h.at).toLocaleString()} — {h.previous} → {h.decision}
                      <br />
                      {h.note}
                      <br />
                      Reviewer ID: {h.actor_id ?? 'Deleted account'}
                    </li>
                  ))}
                </ol>
              )}
            </details>
          </div>
        </details>
      ))}
      {reviews.data?.total === 0 && <p className={card}>No mappings match these filters.</p>}
      <nav className="flex flex-wrap items-center gap-3" aria-label="Mapping pages">
        <Button
          className={button({ variant: 'secondary' })}
          isDisabled={filters.offset === 0 || reviews.isFetching}
          onPress={() => setFilters((f) => ({ ...f, offset: Math.max(0, f.offset - 20) }))}
        >
          Previous mappings
        </Button>
        <span className="text-14 text-navy">Page {Math.floor(filters.offset / 20) + 1}</span>
        <Button
          className={button({ variant: 'secondary' })}
          isDisabled={filters.offset + 20 >= (reviews.data?.total ?? 0) || reviews.isFetching}
          onPress={() => setFilters((f) => ({ ...f, offset: f.offset + 20 }))}
        >
          Next mappings
        </Button>
      </nav>
      <details className={card}>
        <summary className="cursor-pointer text-17 font-bold text-navy">
          Dataset versions and rollback
        </summary>
        <p>
          Activating a version retires other versions of that source. Existing review decisions are
          preserved; approvals are never copied to a new version. Retiring a version immediately
          removes its public indicators.
        </p>
        <label className="block text-14">
          Dataset action note
          <textarea
            className={`${field} mt-1 min-h-20`}
            value={datasetNote}
            maxLength={4000}
            onChange={(e) => setDatasetNote(e.target.value)}
          />
        </label>
        <ul className="grid list-none gap-3 p-0">
          {datasets.data?.map((d) => (
            <li key={d.id} className="rounded-10 border border-border p-3 text-14">
              <strong className="wrap-anywhere">{d.key}</strong>
              <p>
                {d.evidence_class} · {d.geographic_scope} · {d.period_label} · {d.record_count}{' '}
                source records · {d.status}
              </p>
              <Button
                className={button({ variant: 'secondary', text: 14 })}
                isDisabled={versionMutation.isPending || datasetNote.trim().length < 5}
                onPress={() =>
                  versionMutation.mutate({
                    id: d.id,
                    status: d.status === 'active' ? 'retired' : 'active',
                  })
                }
              >
                {d.status === 'active' ? 'Retire version' : 'Activate version'}
              </Button>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
