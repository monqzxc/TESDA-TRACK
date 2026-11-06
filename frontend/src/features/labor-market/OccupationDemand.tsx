import type { MarketIndicator } from './api.ts'

/** Compact demand labels; full forecast provenance stays in the API and admin review. */
export function OccupationDemand({ evidence }: { evidence: readonly MarketIndicator[] }) {
  const visible = evidence.filter((item) => item.classification !== 'hard_to_fill')
  if (!visible.length) return null
  const groups = new Map<string, MarketIndicator[]>()
  for (const item of visible) {
    const key = JSON.stringify([
      item.classification,
      item.coverage_label,
      item.period_label,
      item.qualification_code,
    ])
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return (
    <div className="mt-2 flex flex-wrap gap-2" data-tour="occupation-demand">
      {[...groups.entries()].map(([key, items]) => {
        const item = items[0]
        return (
          <span
            key={key}
            className="inline-flex max-w-full rounded-full border border-border bg-tint px-3 py-1 text-12 leading-relaxed font-bold text-blue"
          >
            {item.classification === 'in_demand'
              ? 'In demand'
              : `Posting observed ${item.observed_on ?? item.period_label}`}{' '}
            · {item.coverage_label}
          </span>
        )
      })}
    </div>
  )
}
