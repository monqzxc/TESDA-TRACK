import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { KIND_DOTS } from './CenterDetail.tsx'
import type { DemandMapArea } from './CenterMapTypes.ts'
import { BALANCE_MARKS, DEMAND_COLORS, NO_DEMAND_COLOR } from './demandMap.ts'

/** The gold of a recommended center's star, on the pins and here. */
export const RECOMMENDED_COLOR = '#f5a524'

/**
 * What the shaded regions say. With one qualification in focus (`outlook`) the map also carries each region's
 * balance mark and that qualification's centers, so the legend names those too and drops the longer note.
 */
export function DemandLegend({
  areas,
  dates = [],
  outlook = false,
  recommended = false,
}: {
  areas: readonly DemandMapArea[]
  dates?: readonly string[]
  outlook?: boolean
  /** Some pin on the map is starred. */
  recommended?: boolean
}) {
  const en = useCopy()
  const copy = en.explore.demand
  const key = en.explore.outlook.legend
  // A region listed for its centers alone has no postings to compare.
  const counts = areas.map((area) => area.posting_count).filter((count) => count > 0)
  const marks = [
    ['more_demand', key.ahead],
    ['balanced', key.balanced],
    ['more_supply', key.saturated],
  ] as const
  const records = (
    <p className="m-0 flex items-center gap-1.5 text-12 text-muted">
      <span className="rounded-sm size-2.5" style={{ backgroundColor: NO_DEMAND_COLOR }} />
      {copy.mapNoRecords}
    </p>
  )
  const sources = (
    <>
      {dates.length > 0 && (
        <p className="m-0 text-12 leading-[1.4] text-muted">{copy.snapshot(dates.join(', '))}</p>
      )}
      <a
        href="https://github.com/faeldon/philippines-json-maps"
        target="_blank"
        rel="noreferrer"
        className="text-11 text-blue"
      >
        {copy.mapBoundaryCredit}
      </a>
    </>
  )
  return (
    <div className="grid w-[230px] max-w-full gap-1.5" aria-label={copy.mapLegend}>
      <div className="flex items-center justify-between gap-3 text-12 font-semibold">
        <span>{copy.mapLegend}</span>
        {counts.length > 0 && (
          <span className="shrink-0 tabular-nums">
            {Math.min(...counts).toLocaleString()}–{Math.max(...counts).toLocaleString()}
          </span>
        )}
      </div>
      <div className="grid grid-cols-4 gap-0.5" aria-hidden="true">
        {DEMAND_COLORS.map((color) => (
          <span key={color} className="rounded-sm h-1.5" style={{ backgroundColor: color }} />
        ))}
      </div>
      <div className={cx('flex justify-between text-12 text-muted', outlook && 'max-sm:hidden')}>
        <span>{copy.mapFewer}</span>
        <span>{copy.mapMore}</span>
      </div>
      {outlook ? (
        <>
          <p
            className="demand-balance-key m-0 flex flex-wrap gap-x-2.5 gap-y-0.5 text-12 text-navy"
            title={key.oneSided}
          >
            <span className="sr-only">{key.balance}: </span>
            {marks.map(([balance, label]) => (
              <span key={balance} className="inline-flex items-center gap-1">
                <i data-tone={BALANCE_MARKS[balance]?.tone} aria-hidden="true">
                  {BALANCE_MARKS[balance]?.glyph}
                </i>
                {label}
              </span>
            ))}
          </p>
          {/* The rest folds away: with the pins and the brief on it too, the map has little room to spare. */}
          <details className="text-12 text-navy">
            <summary className="w-fit cursor-pointer font-semibold text-blue">{key.more}</summary>
            <div className="grid gap-1.5 pt-1.5">
              <p className="m-0 flex flex-wrap gap-x-2.5 gap-y-0.5">
                {(['training', 'assessment'] as const).map((kind) => (
                  <span key={kind} className="inline-flex items-center gap-1">
                    <i
                      className={cx('size-2.5 rounded-full', KIND_DOTS[kind])}
                      aria-hidden="true"
                    />
                    {key[kind]}
                  </span>
                ))}
                {recommended && (
                  <span className="inline-flex items-center gap-1">
                    <i
                      className="text-[13px] leading-none not-italic"
                      style={{ color: RECOMMENDED_COLOR }}
                      aria-hidden="true"
                    >
                      ★
                    </i>
                    {key.recommended}
                  </span>
                )}
              </p>
              <p className="m-0 text-muted">{key.oneSided}</p>
              {records}
              {sources}
            </div>
          </details>
        </>
      ) : (
        <>
          <p className="m-0 text-12 leading-[1.4] text-muted max-sm:hidden">{copy.mapScope}</p>
          {records}
          {sources}
        </>
      )}
    </div>
  )
}
