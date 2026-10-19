import { useId, useState } from 'react'
import { SelectField } from '../../components/SelectField.tsx'
import { en } from '../../copy/en.ts'
import { cssVars } from '../../lib/style.ts'
import utilities from '../../styles/utilities.module.css'
import type { ReadinessCheck } from './api.ts'
import { checkedQualifications, checksFor, compareChecks } from './journey.ts'
import styles from './ProgressPage.module.css'

const copy = en.progress.readiness

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
    <section aria-labelledby={headingId} className={styles.card}>
      <h2 id={headingId} className={styles.sectionHeading}>
        {copy.heading}
      </h2>
      <p className={styles.muted}>{copy.lead}</p>
      {checks.length === 0 ? (
        <p className={styles.empty}>{copy.empty}</p>
      ) : (
        <>
          {qualifications.length > 1 && (
            <SelectField
              className={styles.picker}
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
          <div className={styles.tableBox}>
            <table className={styles.table}>
              <caption
                className={qualifications.length > 1 ? utilities.visuallyHidden : styles.caption}
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
                      <span className={styles.scoreCell}>
                        <span className={styles.bar} aria-hidden="true">
                          <i style={cssVars({ '--score': Math.round(check.score) })} />
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
            <p className={styles.muted}>{copy.single}</p>
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
    <div className={styles.compare}>
      <div className={styles.compareFields}>
        <SelectField label={copy.compareFrom} options={options} value={from.id} onChange={onFrom} />
        <SelectField label={copy.compareTo} options={options} value={to.id} onChange={onTo} />
      </div>
      <p className={styles.change} aria-live="polite">
        {copy.change(friendlyDate(earlier.created_at), friendlyDate(later.created_at), points)}
      </p>
      {!sameQuestions && <p className={styles.note}>{copy.differs}</p>}
    </div>
  )
}
