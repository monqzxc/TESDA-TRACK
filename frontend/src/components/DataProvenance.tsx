import { cx } from '../lib/style.ts'
import { InfoPopover } from './InfoPopover.tsx'

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
  sample: 'Sample data',
}

/** The status's dot: green when verified, amber when something is missing. */
const dots = {
  verified: 'bg-good-ink',
  incomplete: 'bg-warn-ink',
  sample: 'bg-warn-ink',
}

/** Marks the December 2 demo's sample centers (backend: center_listing.SAMPLE_REFERENCE). */
const SAMPLE_REFERENCE =
  "US-0017 AC8: sample centers while TESDA's approval of the official lists is pending"

/**
 * The demo's sample set says so (US-0017 AC8). Other example records are shown like any other unverified record.
 */
const shownStatus = (value?: Provenance | null) =>
  value?.status === 'verified'
    ? 'verified'
    : value?.status === 'example' && value.source_reference === SAMPLE_REFERENCE
      ? 'sample'
      : 'incomplete'

const isDate = (value?: string | null): value is string =>
  !!value && Number.isFinite(Date.parse(value))

function DateValue({ value }: { value?: string | null }) {
  if (!isDate(value)) return <>Not recorded</>
  return <time dateTime={value}>{value.slice(0, 10)}</time>
}

const dateText = (value?: string | null) => (isDate(value) ? value.slice(0, 10) : 'Not recorded')

/** The registry workbook's file name, read as the registry it is. */
const readableSourceName = (value?: string | null) =>
  value?.replace(
    /^Accredited Comp(?:e|en)tency Assessment Center based on (.+) Database\.xlsx$/i,
    'Accredited Competency Assessment Center registry ($1)',
  )

/** What a status asks of the learner, for a list to say once above its cards (ProvenanceNotice). */
export const statusAdvice = {
  incomplete:
    'Some source or review information is missing. Confirm details before relying on them.',
  sample:
    'Sample data for demonstration, not an official TESDA record. Confirm real services with TESDA.',
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
  const status = shownStatus(value)
  const href = sourceLink(value?.source_url)
  const sourceName = readableSourceName(value?.source_name)
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
                {sourceName || 'Source record'}
              </a>
            ) : (
              sourceName || 'Not recorded'
            )}
            {!href && ' (public source link not recorded)'}
          </span>
          {value?.source_reference && status !== 'sample' && (
            <span>Reference: {value.source_reference}</span>
          )}
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
 * A record's source as one quiet line, with its status, reference and dates folded behind an "i" button: for cards
 * (a center's details) where the record's own content should carry the space.
 */
export function FoldedProvenance({ value }: { value?: Provenance | null }) {
  const status = shownStatus(value)
  const href = sourceLink(value?.source_url)
  const sourceName = readableSourceName(value?.source_name)
  const details = [
    status === 'verified' ? labels.verified : `${labels.incomplete}: ${statusAdvice.incomplete}`,
    ...(href ? [] : ['Public source link not recorded.']),
    ...(value?.source_reference ? [`Reference: ${value.source_reference}`] : []),
    `Source updated: ${dateText(value?.source_updated_on)}`,
    `Reviewed: ${dateText(value?.reviewed_at)}`,
    ...(value?.record_updated_at ? [`Record updated: ${dateText(value.record_updated_at)}`] : []),
  ]
  return (
    <div className="flex min-w-0 items-center gap-1 text-13 leading-[1.5] wrap-anywhere text-muted">
      <p className="m-0 min-w-0">
        Source:{' '}
        {href ? (
          <a
            className="text-blue underline underline-offset-2"
            href={href}
            target="_blank"
            rel="noreferrer"
          >
            {sourceName || 'Source record'}
          </a>
        ) : (
          sourceName || 'Not recorded'
        )}
      </p>
      <InfoPopover label="About this record" paragraphs={details} className="-my-1.5" />
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
  const statuses = new Set(values.map(shownStatus))
  const shown = (['sample', 'incomplete'] as const).filter((status) => statuses.has(status))
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
