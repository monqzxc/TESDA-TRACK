import { useId } from 'react'
import { useRegions } from '../../api/queries.ts'
import { demandPreference } from './demandIntent.ts'
import { useFinderStore } from './store.ts'

/** Location is offered only for an explicit demand request, never as a global job filter. */
export function DemandLocation({ query }: { query: string }) {
  return demandPreference(query) ? <RegionChoice /> : null
}

function RegionChoice() {
  const id = useId()
  const regions = useRegions()
  const region = useFinderStore((state) => state.place.region)
  const setPlace = useFinderStore((state) => state.setPlace)
  return (
    <div className="my-3 rounded-12 border border-border bg-surface p-4">
      <label htmlFor={id} className="block text-14 font-semibold text-navy">
        Your region (optional)
      </label>
      <select
        id={id}
        value={region ?? ''}
        onChange={(event) => setPlace({ region: event.target.value || null })}
        className="mt-2 min-h-11 w-full rounded-10 border border-border bg-surface p-2 text-14 text-navy"
      >
        <option value="">Not selected</option>
        {regions.data?.map((item) => (
          <option key={item.code} value={item.code}>
            {item.name}
          </option>
        ))}
      </select>
      <p className="mt-2 mb-0 text-13 text-ink">
        National forecasts remain labeled national when regional evidence is unavailable.
      </p>
    </div>
  )
}
