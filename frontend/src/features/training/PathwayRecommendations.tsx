import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Button, Input, Label, TextField } from 'react-aria-components'
import type { Qualification, Region } from '../../api/queries.ts'
import { failureMessage } from '../../auth/fields.tsx'
import { SelectField } from '../../components/SelectField.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { button } from '../../styles/buttons.ts'
import type { MatchResult } from '../finder/api.ts'
import { useFinderStore } from '../finder/store.ts'
import { QualificationEvidence } from '../labor-market/QualificationEvidence.tsx'
import { areaQualificationsQuery, matchPathway } from './recommendationApi.ts'

interface Props {
  catalog: readonly Qualification[]
  regions: readonly Region[]
  regionCode: string | null
  selectedCode: string | null
  onArea: (regionCode: string | null) => void
  onChoose: (code: string, goal: string | null) => void
  onGoalEdit?: () => void
}

/** A compact addition to the existing map workspace; learner input remains transient. */
export function PathwayRecommendations({
  catalog,
  regions,
  regionCode,
  selectedCode,
  onArea,
  onChoose,
  onGoalEdit,
}: Props) {
  const copy = useCopy().centerRecommendations
  const finderGoal = useFinderStore((state) => state.journey?.query ?? '')
  const [goal, setGoal] = useState(finderGoal)
  const [result, setResult] = useState<MatchResult | null>(null)
  const [submittedGoal, setSubmittedGoal] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [requestRegion, setRequestRegion] = useState(regionCode)
  const [error, setError] = useState<string | null>(null)
  const [areaOpen, setAreaOpen] = useState(false)
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const [page, setPage] = useState({ region: regionCode, offset: 0 })
  const offset = page.region === regionCode ? page.offset : 0
  const request = useRef<AbortController | null>(null)
  const headingId = useId()
  const errorId = useId()
  const area = useQuery({ ...areaQualificationsQuery(regionCode, offset), enabled: areaOpen })
  const selected = catalog.find((qualification) => qualification.code === selectedCode)
  const currentRequest = requestRegion === regionCode
  const pendingCurrent = pending && currentRequest
  const [seenRegion, setSeenRegion] = useState(regionCode)
  if (seenRegion !== regionCode) {
    setSeenRegion(regionCode)
    setRequestRegion(regionCode)
    setResult(null)
    setSubmittedGoal(null)
    setPending(false)
    setError(null)
  }

  // A demand-discovery request is region-specific. Never retain its response after changing area.
  useEffect(() => {
    return () => request.current?.abort()
  }, [regionCode])

  const invalidate = () => {
    request.current?.abort()
    setPending(false)
    setResult(null)
    setSubmittedGoal(null)
    setError(null)
    onGoalEdit?.()
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setRequestRegion(regionCode)
    const query = goal.trim()
    if (!query) {
      setError(copy.emptyGoal)
      return
    }
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    controller.signal.addEventListener('abort', () => setPending(false), { once: true })
    setRequestRegion(regionCode)
    setPending(true)
    setError(null)
    setResult(null)
    try {
      const matches = await matchPathway(query, regionCode, controller.signal)
      if (!controller.signal.aborted) {
        setResult(matches)
        setSubmittedGoal(query)
      }
    } catch (failure) {
      if (!controller.signal.aborted) setError(failureMessage(failure))
    } finally {
      if (!controller.signal.aborted) setPending(false)
    }
  }

  const choose = (code: string, matchedGoal: string | null) => {
    setEvidenceOpen(true)
    onChoose(code, matchedGoal)
  }

  return (
    <section
      aria-labelledby={headingId}
      className="mb-4 rounded-16 border border-border bg-surface p-4 max-sm:p-3"
    >
      <h2 id={headingId} className="m-0 text-18 text-navy">
        {copy.heading}
      </h2>
      <p className="mt-1 mb-4 text-14 leading-[1.5] text-muted">{copy.intro}</p>
      <form onSubmit={(event) => void submit(event)} className="flex flex-wrap items-end gap-3">
        <TextField
          value={goal}
          onChange={(value) => {
            invalidate()
            setGoal(value)
          }}
          maxLength={1000}
          className="flex min-w-0 flex-[2_1_280px] flex-col gap-1"
          aria-describedby={error ? errorId : undefined}
        >
          <Label className="text-14 font-semibold text-navy">{copy.goal}</Label>
          <Input
            className="min-h-11 w-full rounded-12 border border-hover-border bg-surface px-3 py-2 text-16 text-navy placeholder:text-muted data-focused:border-blue"
            placeholder={copy.placeholder}
          />
        </TextField>
        <SelectField
          label={copy.area}
          value={regionCode ?? 'all'}
          options={[
            { id: 'all', label: copy.allAreas },
            ...regions.map((region) => ({ id: region.code, label: region.name })),
          ]}
          onChange={(value) => {
            invalidate()
            onArea(value === 'all' ? null : value)
          }}
          className="min-w-0 flex-[1_1_220px]"
        />
        <Button type="submit" className={button({ variant: 'primary' })} isPending={pendingCurrent}>
          {pendingCurrent ? copy.matching : copy.match}
        </Button>
      </form>
      {error && currentRequest && (
        <p id={errorId} role="alert" className="mb-0 text-14 text-warn-ink">
          {error}
        </p>
      )}
      {pendingCurrent && (
        <p role="status" className="mb-0 text-14 text-muted">
          {copy.matching}
        </p>
      )}
      {result && currentRequest && (
        <div className="mt-4 border-0 border-t border-rule pt-4" aria-live="polite">
          <h3 className="m-0 text-16 text-navy">{copy.matched}</h3>
          {!result.matches.length ? (
            <p className="text-14 text-muted">{copy.noMatch}</p>
          ) : (
            <ul className="m-0 list-none p-0">
              {result.matches.map((match) => (
                <li
                  key={match.qualification.code}
                  className="flex flex-wrap items-start justify-between gap-3 border-0 border-b border-rule py-3 last:border-b-0"
                >
                  <div className="min-w-0 flex-[1_1_320px]">
                    <h4 className="m-0 text-16 wrap-anywhere text-navy">
                      {match.qualification.name}
                    </h4>
                    <p className="my-1 text-14 leading-[1.5] text-ink">{match.reason}</p>
                    <p className="m-0 text-13 text-muted">
                      {match.basis === 'demand_evidence'
                        ? copy.demandLinked
                        : match.components
                          ? copy.semantic
                          : copy.rules}
                    </p>
                  </div>
                  <Button
                    className={button({ variant: 'secondary', height: 36 })}
                    onPress={() => choose(match.qualification.code, submittedGoal)}
                  >
                    {selectedCode === match.qualification.code ? copy.selected : copy.choose}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="mb-0 text-13 text-muted">{copy.matchLimit}</p>
        </div>
      )}
      <details
        className="mt-4 border-0 border-t border-rule pt-3"
        onToggle={(event) => setAreaOpen(event.currentTarget.open)}
      >
        <summary className="cursor-pointer text-15 font-semibold text-blue">
          {copy.areaHeading}
        </summary>
        {areaOpen && (
          <div className="mt-3">
            <p className="my-2 text-14 text-muted">{copy.areaIntro}</p>
            <p className="my-2 text-13 text-muted">{copy.areaHelp}</p>
            {area.isPending && (
              <p role="status" className="text-14 text-muted">
                {copy.areaLoading}
              </p>
            )}
            {area.isError && (
              <div role="alert">
                <p className="text-14 text-warn-ink">{failureMessage(area.error)}</p>
                <Button
                  className={button({ variant: 'tertiary' })}
                  onPress={() => void area.refetch()}
                >
                  {copy.retry}
                </Button>
              </div>
            )}
            {area.data && (
              <>
                {area.data.items.length === 0 && (
                  <p className="text-14 text-muted">{copy.areaEmpty}</p>
                )}
                <ul className="m-0 list-none p-0">
                  {area.data.items.map((item) => (
                    <li
                      key={item.qualification_code}
                      className="flex flex-wrap items-center justify-between gap-3 border-0 border-b border-rule py-3 last:border-b-0"
                    >
                      <div className="min-w-0 flex-[1_1_320px]">
                        <h4 className="m-0 text-15 wrap-anywhere text-navy">
                          {item.qualification_name}
                        </h4>
                        {regionCode && !item.has_selected_area_evidence && (
                          <p className="my-1 text-13 text-muted">{copy.nationalContext}</p>
                        )}
                        <p className="my-1 text-14 text-ink">
                          {item.observed_posting_count == null
                            ? copy.noPosting
                            : copy.postingCount(item.observed_posting_count)}{' '}
                          · {item.observation_geography.label}
                        </p>
                        {(item.observation_dates ?? []).length > 0 && (
                          <p className="my-1 text-13 text-muted">
                            {copy.snapshots((item.observation_dates ?? []).join(', '))}
                          </p>
                        )}
                        {(item.forecast_support ?? []).map((forecast) => (
                          <p key={forecast.mapping_id} className="my-1 text-13 text-muted">
                            {forecast.occupation_title} ·{' '}
                            {forecast.classification === 'in_demand'
                              ? 'In-demand forecast'
                              : 'Hard-to-fill forecast'}{' '}
                            · {forecast.geography.label} · {forecast.period_label}
                          </p>
                        ))}
                      </div>
                      <Button
                        className={button({ variant: 'secondary', height: 36 })}
                        onPress={() => choose(item.qualification_code, null)}
                      >
                        {copy.choose}
                      </Button>
                    </li>
                  ))}
                </ul>
                <p className="text-13 text-muted">{copy.countsNote}</p>
                <div className="flex flex-wrap gap-3">
                  <Button
                    className={button({ variant: 'tertiary' })}
                    isDisabled={offset === 0}
                    onPress={() =>
                      setPage({ region: regionCode, offset: Math.max(0, offset - 20) })
                    }
                  >
                    {copy.previous}
                  </Button>
                  <Button
                    className={button({ variant: 'tertiary' })}
                    isDisabled={offset + area.data.items.length >= area.data.total}
                    onPress={() => setPage({ region: regionCode, offset: offset + 20 })}
                  >
                    {copy.next}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </details>
      {selected && (
        <details
          open={evidenceOpen}
          onToggle={(event) => setEvidenceOpen(event.currentTarget.open)}
          className="mt-3 border-0 border-t border-rule pt-3"
        >
          <summary className="cursor-pointer text-15 font-semibold text-blue">
            {copy.evidence}: {selected.name}
          </summary>
          {evidenceOpen && (
            <div className="mt-3">
              <QualificationEvidence qualificationCode={selected.code} regionCode={regionCode} />
            </div>
          )}
        </details>
      )}
    </section>
  )
}
