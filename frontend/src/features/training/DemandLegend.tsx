import { useCopy } from '../../i18n/copy.ts'
import type { DemandMapArea } from './CenterMapTypes.ts'
import { DEMAND_COLORS, NO_DEMAND_COLOR } from './demandMap.ts'

export function DemandLegend({
  areas,
  dates = [],
}: {
  areas: readonly DemandMapArea[]
  dates?: readonly string[]
}) {
  const copy = useCopy().explore.demand
  const counts = areas.map((area) => area.posting_count)
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
      <div className="flex justify-between text-12 text-muted">
        <span>{copy.mapFewer}</span>
        <span>{copy.mapMore}</span>
      </div>
      <p className="m-0 text-12 leading-[1.4] text-muted max-sm:hidden">{copy.mapScope}</p>
      <p className="m-0 flex items-center gap-1.5 text-12 text-muted">
        <span className="rounded-sm size-2.5" style={{ backgroundColor: NO_DEMAND_COLOR }} />
        {copy.mapNoRecords}
      </p>
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
    </div>
  )
}
