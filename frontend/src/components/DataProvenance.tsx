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

function DateValue({ value }: { value?: string | null }) {
  if (!value || !Number.isFinite(Date.parse(value))) return <>Not recorded</>
  return <time dateTime={value}>{value.slice(0, 10)}</time>
}

/** Record provenance is distinct from a program's current authorization or available places. */
export function DataProvenance({
  value,
  compact = false,
}: {
  value?: Provenance | null
  compact?: boolean
}) {
  const status = value?.status ?? 'incomplete'
  const href = sourceLink(value?.source_url)
  return (
    <div className="grid min-w-0 gap-1 text-13 leading-[1.5] wrap-anywhere text-ink">
      <span
        className={cx(
          'w-fit rounded-full border border-border px-2 py-0.5 text-12 font-bold',
          status === 'verified' ? 'bg-good-bg text-good-ink' : 'bg-soft text-ink',
        )}
      >
        {labels[status]}
      </span>
      {!compact && (
        <>
          {status === 'example' && (
            <p className="m-0">
              For demonstration. Confirm real services with the center before applying.
            </p>
          )}
          {status === 'incomplete' && (
            <p className="m-0">
              Some source or review information is missing. Confirm details before relying on them.
            </p>
          )}
          <p className="m-0">
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
          </p>
          {value?.source_reference && <p className="m-0">Reference: {value.source_reference}</p>}
          <p className="m-0">
            Source updated: <DateValue value={value?.source_updated_on} />
          </p>
          <p className="m-0">
            Reviewed: <DateValue value={value?.reviewed_at} />
          </p>
          {value?.record_updated_at && (
            <p className="m-0 text-muted">
              Record updated: <DateValue value={value.record_updated_at} />
            </p>
          )}
        </>
      )}
    </div>
  )
}
