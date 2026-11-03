import { cx } from '../lib/style.ts'

export interface Provenance {
  status?: 'verified' | 'incomplete' | 'example'
  source_name?: string | null
  source_reference?: string | null
  source_url?: string | null
  source_updated_on?: string | null
  reviewed_at?: string | null
  record_updated_at?: string | null
}

/** Only ordinary web links are navigable; private workbook references remain plain text. */
export function sourceLink(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : undefined
  } catch {
    return undefined
  }
}

const labels = {
  verified: 'Verified data',
  incomplete: 'Incomplete data',
  example: 'Example data',
}

/** The status's dot: green when verified, amber when something is missing, grey for an example. */
const dots = {
  verified: 'bg-good-ink',
  incomplete: 'bg-warn-ink',
  example: 'bg-muted',
}

function DateValue({ value }: { value?: string | null }) {
  if (!value || !Number.isFinite(Date.parse(value))) return <>Not recorded</>
  return <time dateTime={value}>{value.slice(0, 10)}</time>
}

/** What a status asks of the learner, for a list to say once above its cards (ProvenanceNotice). */
export const statusAdvice = {
  example: 'For demonstration. Confirm real services with the center before applying.',
  incomplete:
    'Some source or review information is missing. Confirm details before relying on them.',
}

/**
 * Record provenance is distinct from a program's current authorization or available places. The status leads, as a
 * dot and a word; the source and its dates follow as one quiet line of facts, so a card's own content stays first.
 * `compact` keeps only the status. Without `advice`, the card leaves out what its status asks of the learner, as a
 * list says it once above its cards (ProvenanceNotice).
 */
export function DataProvenance({
  value,
  compact = false,
  advice = true,
}: {
  value?: Provenance | null
  compact?: boolean
  advice?: boolean
}) {
  const status = value?.status ?? 'incomplete'
  const href = sourceLink(value?.source_url)
  return (
    <div className="grid min-w-0 gap-0.5 text-13 leading-[1.5] wrap-anywhere text-muted">
      <p className="m-0">
        <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
          <i className={cx('size-2 flex-none rounded-full', dots[status])} aria-hidden="true" />
          <span>{labels[status]}</span>
        </span>
        {!compact && advice && status !== 'verified' && <span> · {statusAdvice[status]}</span>}
      </p>
      {!compact && (
        // Each fact wraps as a whole.
        <p className="m-0 flex flex-wrap gap-x-3">
          <span>
            Source:{' '}
            {href ? (
              <a
                className="text-blue underline underline-offset-2"
                href={href}
                target="_blank"
                rel="noreferrer"
              >
                {value?.source_name || 'Source record'}
              </a>
            ) : (
              value?.source_name || 'Not recorded'
            )}
            {!href && ' (public source link not recorded)'}
          </span>
          {value?.source_reference && <span>Reference: {value.source_reference}</span>}
          <span>
            Source updated: <DateValue value={value?.source_updated_on} />
          </span>
          <span>
            Reviewed: <DateValue value={value?.reviewed_at} />
          </span>
          {value?.record_updated_at && (
            <span>
              Record updated: <DateValue value={value.record_updated_at} />
            </span>
          )}
        </p>
      )}
    </div>
  )
}

/**
 * What the unverified records in a list ask of the learner, said once above the list rather than on every card: one
 * line for each status among them.
 */
export function ProvenanceNotice({
  values,
}: {
  values: readonly (Provenance | null | undefined)[]
}) {
  const statuses = new Set(values.map((value) => value?.status ?? 'incomplete'))
  const shown = (['incomplete', 'example'] as const).filter((status) => statuses.has(status))
  if (!shown.length) return null
  return (
    <div className="mb-3 grid gap-0.5 text-13 leading-[1.5] text-muted">
      {shown.map((status) => (
        <p key={status} className="m-0 flex items-baseline gap-1.5">
          <i
            className={cx('size-2 flex-none translate-y-[-1px] rounded-full', dots[status])}
            aria-hidden="true"
          />
          {/* The dot is the cards' own, so the line reads as theirs without naming them again. */}
          <span>{statusAdvice[status]}</span>
        </p>
      ))}
    </div>
  )
}
