import { useId, useState } from 'react'
import { SelectField } from '../../components/SelectField.tsx'
import { en } from '../../copy/en.ts'
import { cssVars, cx } from '../../lib/style.ts'
import type { ReadinessCheck } from './api.ts'
import { checkedQualifications, checksFor, compareChecks } from './journey.ts'
import { ui } from './styles.ts'

const copy = en.progress.readiness

const table = cx(
  'w-full border-collapse text-14',
  '[&_th]:border-b [&_th]:border-border [&_th]:px-[0.6rem] [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:text-muted',
  '[&_td]:border-b [&_td]:border-rule [&_td]:px-[0.6rem] [&_td]:py-[0.55rem] [&_td]:text-navy',
)

/** "Oct 15, 2026", in Philippine time. */
export function friendlyDate(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * The learner's readiness checks for one qualification at a time, oldest first, in a table, and the change between
 * two of them (US-11). It's labelled as self-reported, and says when two checks asked about different skills.
 */
export function ReadinessHistory({ checks }: { checks: readonly ReadinessCheck[] }) {
  const headingId = useId()
  const qualifications = checkedQualifications(checks)
  const [chosen, setChosen] = useState<string | null>(null)
  const code = qualifications.some((item) => item.code === chosen)
    ? chosen
    : (qualifications[0]?.code ?? null)
  const name = qualifications.find((item) => item.code === code)?.name ?? ''
  const list = code ? checksFor(checks, code) : []
  const [fromId, setFromId] = useState<string | null>(null)
  const [toId, setToId] = useState<string | null>(null)
  const from = list.find((check) => check.id === fromId) ?? list[0]
  const to = list.find((check) => check.id === toId) ?? list[list.length - 1]
  const options = list.map((check) => ({
    id: check.id,
    label: `${friendlyDate(check.created_at)} · ${Math.round(check.score)}%`,
  }))

  return (
    <section data-tour="progress-readiness" aria-labelledby={headingId} className={ui.card}>
      <h2 id={headingId} className={ui.sectionHeading}>
        {copy.heading}
      </h2>
      <p className={ui.muted}>{copy.lead}</p>
      {checks.length === 0 ? (
        <p className={ui.empty}>{copy.empty}</p>
      ) : (
        <>
          {qualifications.length > 1 && (
            <SelectField
              className="my-3 max-w-[28rem]"
              label={copy.qualification}
              options={qualifications.map((item) => ({ id: item.code, label: item.name }))}
              value={code}
              onChange={(next) => {
                setChosen(next)
                setFromId(null)
                setToId(null)
              }}
            />
          )}
          <div className="mt-[0.6rem] overflow-x-auto">
            <table className={table}>
              <caption
                className={
                  qualifications.length > 1
                    ? 'sr-only'
                    : 'mb-[0.4rem] text-left font-[650] text-navy'
                }
              >
                {name}
              </caption>
              <thead>
                <tr>
                  <th scope="col">{copy.date}</th>
                  <th scope="col">{copy.score}</th>
                  <th scope="col">{copy.level}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((check) => (
                  <tr key={check.id}>
                    <td>{friendlyDate(check.created_at)}</td>
                    <td>
                      <span className="flex items-center gap-[0.6rem]">
                        <span className={ui.bar} aria-hidden="true">
                          <i
                            className={ui.barFill}
                            style={cssVars({ '--score': Math.round(check.score) })}
                          />
                        </span>
                        {Math.round(check.score)}%
                      </span>
                    </td>
                    <td>{check.level}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {list.length < 2 || !from || !to ? (
            <p className={ui.muted}>{copy.single}</p>
          ) : (
            <Comparison options={options} from={from} to={to} onFrom={setFromId} onTo={setToId} />
          )}
        </>
      )}
    </section>
  )
}

function Comparison({
  options,
  from,
  to,
  onFrom,
  onTo,
}: {
  options: { id: string; label: string }[]
  from: ReadinessCheck
  to: ReadinessCheck
  onFrom: (id: string) => void
  onTo: (id: string) => void
}) {
  // The earlier of the two first, whichever way round they were picked.
  const [earlier, later] = from.created_at <= to.created_at ? [from, to] : [to, from]
  const { points, sameQuestions } = compareChecks(earlier, later)
  return (
    <div className="mt-4">
      <div className="grid grid-cols-[repeat(2,minmax(0,16rem))] gap-3 max-sm:grid-cols-1">
        <SelectField label={copy.compareFrom} options={options} value={from.id} onChange={onFrom} />
        <SelectField label={copy.compareTo} options={options} value={to.id} onChange={onTo} />
      </div>
      <p className="mt-3 mb-0 text-15 font-[650] text-navy" aria-live="polite">
        {copy.change(friendlyDate(earlier.created_at), friendlyDate(later.created_at), points)}
      </p>
      {!sameQuestions && <p className={ui.note}>{copy.differs}</p>}
    </div>
  )
}
