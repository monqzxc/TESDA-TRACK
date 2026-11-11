import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from 'react-aria-components'
import { api } from '../../api/client.ts'
import { unwrap } from '../../api/errors.ts'
import type { components } from '../../api/schema.d.ts'
import { failureMessage } from '../../auth/fields.tsx'
import { SelectField } from '../../components/SelectField.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { button } from '../../styles/buttons.ts'
import type { Center } from './centers.ts'
import { travelTime } from './format.ts'
import { useTrainingStore } from './state.ts'

type Comparison = components['schemas']['ServiceAccessComparison']
type RoadMode = NonNullable<components['schemas']['ServiceAccessRequest']['mode']>

interface Props {
  qualificationCode: string | null
  centers: readonly Center[]
  selectedId: string | null
  routingEnabled: boolean
  onChoose: (centerId: string) => void
}

/** An explicitly bounded travel comparison, separate from authority, intake and learner eligibility. */
export function ServiceAccessComparison({
  qualificationCode,
  centers,
  selectedId,
  routingEnabled,
  onChoose,
}: Props) {
  const copy = useCopy().centerRecommendations
  const trainingCopy = useCopy().training
  const location = useTrainingStore((state) => (state.useLocation ? state.location : null))
  const locate = useTrainingStore((state) => state.locate)
  const locating = useTrainingStore((state) => state.locating)
  const travelMode = useTrainingStore((state) => state.travelMode)
  const setTravelMode = useTrainingStore((state) => state.setTravelMode)
  const mode = travelMode === 'plane' ? 'car' : travelMode
  const [budget, setBudget] = useState('45')
  const [open, setOpen] = useState(false)
  const [snapshot, setSnapshot] = useState<{
    key: string
    data?: Comparison
    error?: string
    pending?: boolean
    expired?: boolean
  } | null>(null)
  const controller = useRef<AbortController | null>(null)
  const selected = centers.find((center) => center.id === selectedId)
  const comparisonSites = [
    ...(selected ? [selected] : []),
    ...centers.filter((center) => center.id !== selectedId),
  ].slice(0, 5)
  const candidates = comparisonSites.map((center) => ({
    kind: center.kind,
    site_id: Number(center.id.slice(center.kind.length + 1)),
  }))
  const key = JSON.stringify([qualificationCode, location, mode, budget, candidates])
  const active = snapshot?.key === key ? snapshot : null
  const [seenKey, setSeenKey] = useState(key)
  if (seenKey !== key) {
    setSeenKey(key)
    setSnapshot(null)
  }
  const available = routingEnabled && qualificationCode && location && candidates.length > 0

  useEffect(() => () => controller.current?.abort(), [key])
  useEffect(() => {
    if (!snapshot?.data) return
    const timer = window.setTimeout(
      () =>
        setSnapshot((current) =>
          current === snapshot ? { key: snapshot.key, expired: true } : current,
        ),
      60_000,
    )
    return () => window.clearTimeout(timer)
  }, [snapshot])

  const compare = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!available || !qualificationCode || !location) return
    setTravelMode(mode)
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    setSnapshot({ key, pending: true })
    try {
      const data = await unwrap(
        api.POST('/api/v1/recommendations/service-access', {
          body: {
            qualification_code: qualificationCode,
            origin: location,
            mode,
            maximum_minutes: Number(budget),
            candidates,
          },
          signal: request.signal,
        }),
      )
      if (!request.signal.aborted) setSnapshot({ key, data })
    } catch (failure) {
      if (!request.signal.aborted) setSnapshot({ key, error: failureMessage(failure) })
    }
  }

  const statusText = (status: Comparison['results'][number]['status']) => {
    switch (status) {
      case 'location_unknown':
        return copy.missingCoordinates
      case 'unsupported_mode':
        return copy.unsupportedMode
      case 'no_route_in_network':
        return copy.noRoute
      case 'routing_busy':
        return copy.routeBusy
      default:
        return copy.routerUnavailable
    }
  }
  const ordered = [...(active?.data?.results ?? [])].sort(
    (a, b) =>
      (a.duration_min ?? Infinity) - (b.duration_min ?? Infinity) || a.name.localeCompare(b.name),
  )

  return (
    <details
      className="mb-4 rounded-16 border border-border bg-surface p-4"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer text-16 font-semibold text-blue">
        {copy.accessHeading}
      </summary>
      {open && (
        <div className="mt-3">
          <p className="my-2 text-14 text-muted">{copy.accessIntro}</p>
          {!qualificationCode ? (
            <p className="text-14 text-muted">{copy.accessQualification}</p>
          ) : !routingEnabled ? (
            <p className="text-14 text-muted">{copy.accessDisabled}</p>
          ) : !location ? (
            <div>
              <p className="text-14 text-muted">{copy.accessOrigin}</p>
              <Button
                className={button({ variant: 'secondary' })}
                isPending={locating}
                onPress={() => locate()}
              >
                {copy.shareLocation}
              </Button>
            </div>
          ) : candidates.length === 0 ? (
            <p className="text-14 text-muted">{copy.accessNoCenters}</p>
          ) : (
            <>
              <form
                className="flex flex-wrap items-end gap-3"
                onSubmit={(event) => void compare(event)}
              >
                <SelectField
                  label={copy.accessMode}
                  value={mode}
                  options={[
                    { id: 'car', label: trainingCopy.routes.modes.car },
                    { id: 'bike', label: trainingCopy.routes.modes.bike },
                    { id: 'foot', label: trainingCopy.routes.modes.foot },
                  ]}
                  onChange={(value) => setTravelMode(value as RoadMode)}
                  className="min-w-[160px] flex-1"
                />
                <SelectField
                  label={copy.accessBudget}
                  value={budget}
                  options={[15, 30, 45, 60, 90, 120].map((minutes) => ({
                    id: String(minutes),
                    label: copy.minutes(minutes),
                  }))}
                  onChange={setBudget}
                  className="min-w-[160px] flex-1"
                />
                <Button
                  type="submit"
                  className={button({ variant: 'secondary' })}
                  isPending={active?.pending}
                >
                  {active?.pending ? copy.comparingAccess : copy.compareAccess}
                </Button>
              </form>
              <p className="text-13 text-muted">
                {copy.accessScope(candidates.length, centers.length)}
              </p>
            </>
          )}
          {active?.pending && (
            <p role="status" className="text-14 text-muted">
              {copy.comparingAccess}
            </p>
          )}
          {active?.error && (
            <p role="alert" className="text-14 text-warn-ink">
              {active.error}
            </p>
          )}
          {active?.expired && (
            <p role="status" className="text-14 text-muted">
              {copy.accessExpired}
            </p>
          )}
          {active?.data && (
            <p className="text-13 text-muted">
              {copy.checked(
                new Date(active.data.checked_at).toLocaleString('en-PH', {
                  timeZone: 'Asia/Manila',
                }),
              )}
            </p>
          )}
          {active?.data && (
            <ul className="m-0 list-none p-0" aria-live="polite">
              {ordered.map((site) => (
                <li
                  key={`${site.kind}-${site.site_id}`}
                  className="flex flex-wrap items-center justify-between gap-3 border-0 border-b border-rule py-3 last:border-b-0"
                >
                  <div className="min-w-0 flex-[1_1_280px]">
                    <h3 className="m-0 text-15 wrap-anywhere text-navy">{site.name}</h3>
                    <p className="my-1 text-14 text-ink">
                      {site.kind === 'training'
                        ? trainingCopy.kinds.training
                        : trainingCopy.kinds.assessment}{' '}
                      ·{' '}
                      {site.status === 'modeled_route' && site.duration_min != null
                        ? `${travelTime(site.duration_min)} · ${site.within_budget ? copy.withinBudget : copy.outsideBudget}`
                        : statusText(site.status)}
                    </p>
                    {site.status === 'modeled_route' && (
                      <p className="m-0 text-13 text-muted">{site.explanation}</p>
                    )}
                  </div>
                  <Button
                    className={button({ variant: 'tertiary', height: 36 })}
                    onPress={() => {
                      setTravelMode(active.data!.mode)
                      onChoose(`${site.kind}-${site.site_id}`)
                    }}
                  >
                    {copy.showCenter}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="mb-0 text-13 text-muted">{copy.accessLimit}</p>
        </div>
      )}
    </details>
  )
}
