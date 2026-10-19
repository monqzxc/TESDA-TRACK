import { useQuery } from '@tanstack/react-query'
import { useId, useState, type ReactNode } from 'react'
import { Button } from 'react-aria-components'
import { useSearchParams } from 'react-router'
import type { Qualification } from '../../api/queries.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { Icon } from '../../components/Icon.tsx'
import { PageHero } from '../../components/PageHero.tsx'
import { throwWithoutData } from '../../components/QueryBoundary.tsx'
import { WithCatalog } from '../../components/WithCatalog.tsx'
import { en } from '../../copy/en.ts'
import { cssVars, cx } from '../../lib/style.ts'
import buttons from '../../styles/buttons.module.css'
import utilities from '../../styles/utilities.module.css'
import { AccountGate } from '../account/AccountGate.tsx'
import {
  activeDemand,
  demandQuery,
  funnelQuery,
  isBackwards,
  overviewQuery,
  readDate,
  skillGapsQuery,
  supplyQuery,
  type Funnel,
  type Period,
  type QualificationDemand,
  type RegionSupply,
} from './api.ts'
import { QualificationField } from './QualificationField.tsx'
import styles from './ReportsPage.module.css'

const copy = en.reports

/** The address's names for the period and the skill-gap qualification. */
const PARAMS = { from: 'from', to: 'to', qualification: 'qualification' } as const

/**
 * Reports, at /reports, for administrators (classic/app.py show_reports): figures for a period, the learner
 * journey, demand by qualification, skill gaps for one qualification, and supply by region. Counts and averages
 * only. Anyone else gets a "not available" message instead of the page (the API refuses their requests in any case).
 */
export default function ReportsPage() {
  const { isAdmin, isSignedIn } = useAuth()
  if (!isAdmin) {
    const gate = en.account.reports
    return (
      <AccountGate
        page="reports"
        icon="info"
        heading={gate.heading}
        body={isSignedIn ? gate.body : gate.signedOut}
        action={isSignedIn ? undefined : gate.action}
      />
    )
  }
  const page = en.pages.reports
  return (
    <>
      <PageHero
        heading={page.heading}
        title={copy.hero.title}
        accent={copy.hero.accent}
        lead={page.lead}
        art="chart"
      />
      <WithCatalog>{(catalog) => <Reports catalog={catalog} />}</WithCatalog>
    </>
  )
}

function Reports({ catalog }: { catalog: Qualification[] }) {
  const [params, setParams] = useSearchParams()
  const period: Period = {
    from: readDate(params.get(PARAMS.from)),
    to: readDate(params.get(PARAMS.to)),
  }
  const codes = new Set(catalog.map((qualification) => qualification.code))
  const chosen = params.get(PARAMS.qualification)

  const update = (changes: Partial<Record<keyof typeof PARAMS, string | null>>) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [name, value] of Object.entries(changes)) {
          const key = PARAMS[name as keyof typeof PARAMS]
          if (value) next.set(key, value)
          else next.delete(key)
        }
        return next
      },
      { replace: true, preventScrollReset: true },
    )

  return (
    <div className={styles.sections}>
      <PeriodFields period={period} onChange={update} />
      {/* A backwards period is refused before any request, as the API would refuse it. */}
      {!isBackwards(period) && (
        <ReportSections
          period={period}
          catalog={catalog}
          chosen={chosen && codes.has(chosen) ? chosen : null}
          onChoose={(code) => update({ qualification: code })}
        />
      )}
    </div>
  )
}

function PeriodFields({
  period,
  onChange,
}: {
  period: Period
  onChange: (changes: { from?: string | null; to?: string | null }) => void
}) {
  const fromId = useId()
  const toId = useId()
  const helpId = useId()
  const errorId = useId()
  const backwards = isBackwards(period)
  const describedBy = cx(helpId, backwards && errorId)
  return (
    <fieldset className={styles.period}>
      <legend className={styles.legend}>{copy.period.legend}</legend>
      <div className={styles.dates}>
        <DateField
          id={fromId}
          label={copy.period.from}
          value={period.from}
          max={period.to}
          describedBy={describedBy}
          onChange={(from) => onChange({ from })}
        />
        <DateField
          id={toId}
          label={copy.period.to}
          value={period.to}
          min={period.from}
          invalid={backwards}
          describedBy={describedBy}
          onChange={(to) => onChange({ to })}
        />
        {(period.from || period.to) && (
          <Button
            className={cx(buttons.button, styles.clear)}
            onPress={() => onChange({ from: null, to: null })}
          >
            <Icon name="filterOff" />
            {copy.period.clear}
          </Button>
        )}
      </div>
      <p id={helpId} className={styles.help}>
        {copy.period.help}
      </p>
      {/* Words as well as color say what's wrong (US-13). */}
      <p id={errorId} role="alert" className={styles.error}>
        {backwards ? copy.period.order : ''}
      </p>
    </fieldset>
  )
}

/**
 * A date box. It keeps what is typed to itself until it is a whole date (or empty), so a year typed digit by digit
 * doesn't report on the year 2, and a new date from outside (Clear dates) replaces it.
 */
function DateField({
  id,
  label,
  value,
  min = null,
  max = null,
  invalid = false,
  describedBy,
  onChange,
}: {
  id: string
  label: string
  value: string | null
  min?: string | null
  max?: string | null
  invalid?: boolean
  describedBy: string | undefined
  onChange: (date: string | null) => void
}) {
  const [draft, setDraft] = useState(value ?? '')
  const [shown, setShown] = useState(value)
  if (value !== shown) {
    setShown(value)
    setDraft(value ?? '')
  }
  return (
    <div className={styles.dateField}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        id={id}
        type="date"
        className={styles.date}
        value={draft}
        min={min ?? undefined}
        max={max ?? undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(event) => {
          const typed = event.target.value
          setDraft(typed)
          const date = readDate(typed)
          if (date !== null || typed === '') {
            setShown(date)
            onChange(date)
          }
        }}
      />
    </div>
  )
}

function ReportSections({
  period,
  catalog,
  chosen,
  onChoose,
}: {
  period: Period
  catalog: Qualification[]
  chosen: string | null
  onChoose: (code: string) => void
}) {
  const overview = useQuery({ ...overviewQuery(period), throwOnError: throwWithoutData })
  const funnel = useQuery({ ...funnelQuery(period), throwOnError: throwWithoutData })
  const demand = useQuery({ ...demandQuery(period), throwOnError: throwWithoutData })
  const supply = useQuery({ ...supplyQuery, throwOnError: throwWithoutData })

  if (!overview.data || !funnel.data || !demand.data || !supply.data) {
    return (
      <p role="status" className={styles.muted}>
        {copy.loading}
      </p>
    )
  }
  const updating =
    overview.isPlaceholderData || funnel.isPlaceholderData || demand.isPlaceholderData
  const stats = copy.stats
  const average = overview.data.average_readiness
  const seats = supply.data.reduce((sum, region) => sum + region.open_seats, 0)
  // The skill gaps open on the qualification checked most in the period, until the administrator picks one.
  const busiest = [...demand.data].sort((a, b) => b.readiness_checks - a.readiness_checks)[0]
  const code =
    chosen ?? (busiest?.readiness_checks ? busiest.qualification.code : (catalog[0]?.code ?? null))

  return (
    <>
      <p className={styles.showing} role="status">
        {showing(period)} {updating ? copy.updating : ''}
      </p>
      <div className={cx(styles.sections, updating && styles.updating)} aria-busy={updating}>
        <section aria-label={stats.label}>
          <dl className={styles.stats}>
            <Stat label={stats.learners} value={count(overview.data.learners)} />
            <Stat label={stats.sessions} value={count(overview.data.recommendation_sessions)} />
            <Stat label={stats.checks} value={count(overview.data.readiness_checks)} />
            <Stat
              label={stats.average}
              value={average === null ? copy.none : percent(average)}
              help={stats.averageHelp}
            />
            <Stat label={stats.verified} value={count(overview.data.certifications.verified)} />
            <Stat label={stats.seats} value={count(seats)} help={stats.seatsHelp} />
          </dl>
        </section>
        <Journey funnel={funnel.data} />
        <Demand rows={demand.data} />
        <SkillGaps catalog={catalog} code={code} period={period} onChoose={onChoose} />
        <Supply rows={supply.data} />
      </div>
    </>
  )
}

/** A figure with its label, after Streamlit's st.metric. */
function Stat({ label, value, help }: { label: string; value: string; help?: string }) {
  return (
    <div className={styles.stat}>
      <dt>{label}</dt>
      <dd>
        <span className={styles.figure}>{value}</span>
        {help && <span className={styles.help}>{help}</span>}
      </dd>
    </div>
  )
}

/** A report's card: its heading, a line on what it counts, and its table or a note. */
function Report({
  heading,
  lead,
  children,
}: {
  heading: string
  lead?: string
  children: ReactNode
}) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className={styles.card}>
      <h2 id={headingId} className={styles.heading}>
        {heading}
      </h2>
      {lead && <p className={styles.lead}>{lead}</p>}
      {children}
    </section>
  )
}

/**
 * A table that can scroll sideways on a narrow screen. Its caption shows above the box, so it stays in view; the box
 * takes focus, so the keyboard can scroll it too, and is named by the caption.
 */
function Table({ caption, children }: { caption: string; children: ReactNode }) {
  const captionId = useId()
  return (
    <>
      <p className={styles.caption} aria-hidden="true">
        {caption}
      </p>
      {/* A scrolling box needs focus for the keyboard to reach what's off to the side (axe's
          scrollable-region-focusable). */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div className={styles.tableBox} tabIndex={0} role="region" aria-labelledby={captionId}>
        <table className={styles.table}>
          <caption id={captionId} className={utilities.visuallyHidden}>
            {caption}
          </caption>
          {children}
        </table>
      </div>
    </>
  )
}

/** A count with a bar for its share of the largest, as Streamlit's charts and progress columns show it. */
function Bar({ share, children }: { share: number; children: ReactNode }) {
  return (
    <span className={styles.barCell}>
      <span className={styles.bar} aria-hidden="true">
        <i style={cssVars({ '--share': Math.round(Math.min(Math.max(share, 0), 1) * 100) })} />
      </span>
      <span className={styles.barValue}>{children}</span>
    </span>
  )
}

const STAGES = [
  'registered',
  'saved_a_recommendation',
  'checked_readiness',
  'applied_for_assessment',
  'certified',
] as const satisfies readonly (keyof Funnel)[]

function Journey({ funnel }: { funnel: Funnel }) {
  const journey = copy.journey
  const most = Math.max(...STAGES.map((stage) => funnel[stage]))
  return (
    <Report heading={journey.heading} lead={journey.lead}>
      {most === 0 ? (
        <p className={styles.empty}>{journey.empty}</p>
      ) : (
        <Table caption={journey.caption}>
          <thead>
            <tr>
              <th scope="col">{journey.stage}</th>
              <th scope="col" className={styles.wide}>
                {journey.learners}
              </th>
            </tr>
          </thead>
          <tbody>
            {STAGES.map((stage) => (
              <tr key={stage}>
                <th scope="row">{journey.stages[stage]}</th>
                <td>
                  <Bar share={funnel[stage] / most}>{count(funnel[stage])}</Bar>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Report>
  )
}

function Demand({ rows }: { rows: QualificationDemand[] }) {
  const demand = copy.demand
  const active = activeDemand(rows)
  const quiet = rows.length - active.length
  return (
    <Report heading={demand.heading} lead={demand.lead}>
      {active.length === 0 ? (
        <p className={styles.empty}>{demand.empty}</p>
      ) : (
        <>
          <Table caption={demand.caption}>
            <thead>
              <tr>
                <th scope="col">{demand.qualification}</th>
                <th scope="col" className={styles.number}>
                  {demand.topMatch}
                </th>
                <th scope="col" className={styles.number}>
                  {demand.chosen}
                </th>
                <th scope="col" className={styles.number}>
                  {demand.checks}
                </th>
                <th scope="col">{demand.average}</th>
                <th scope="col" className={styles.number}>
                  {demand.applications}
                </th>
                <th scope="col" className={styles.number}>
                  {demand.competent}
                </th>
                <th scope="col" className={styles.number}>
                  {demand.certified}
                </th>
              </tr>
            </thead>
            <tbody>
              {active.map((row) => (
                <tr key={row.qualification.code}>
                  <th scope="row" className={styles.name}>
                    {row.qualification.name}
                  </th>
                  <td className={styles.number}>{count(row.top_match)}</td>
                  <td className={styles.number}>{count(row.chosen)}</td>
                  <td className={styles.number}>{count(row.readiness_checks)}</td>
                  <td>
                    {row.average_readiness === null ? (
                      copy.none
                    ) : (
                      <Bar share={row.average_readiness / 100}>
                        {percent(row.average_readiness)}
                      </Bar>
                    )}
                  </td>
                  <td className={styles.number}>{count(row.assessment_applications)}</td>
                  <td className={styles.number}>{count(row.competent)}</td>
                  <td className={styles.number}>{count(row.certified)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          {quiet > 0 && <p className={styles.muted}>{demand.quiet(quiet)}</p>}
        </>
      )}
    </Report>
  )
}

function SkillGaps({
  catalog,
  code,
  period,
  onChoose,
}: {
  catalog: Qualification[]
  code: string | null
  period: Period
  onChoose: (code: string) => void
}) {
  const gaps = copy.gaps
  return (
    <Report heading={gaps.heading}>
      {code === null ? (
        <p className={styles.empty}>{gaps.noCatalog}</p>
      ) : (
        <>
          <div className={styles.picker}>
            <QualificationField
              label={gaps.qualification}
              catalog={catalog}
              value={code}
              onChange={onChoose}
            />
          </div>
          <p className={styles.lead}>{gaps.lead}</p>
          <GapTable
            code={code}
            name={catalog.find((qualification) => qualification.code === code)?.name ?? code}
            period={period}
          />
        </>
      )}
    </Report>
  )
}

function GapTable({ code, name, period }: { code: string; name: string; period: Period }) {
  const gaps = copy.gaps
  const query = useQuery({ ...skillGapsQuery(code, period), throwOnError: throwWithoutData })
  if (!query.data) {
    return (
      <p role="status" className={styles.muted}>
        {gaps.loading}
      </p>
    )
  }
  const rows = query.data
  if (!rows.some((row) => row.answers > 0)) return <p className={styles.empty}>{gaps.empty}</p>
  return (
    <Table caption={gaps.caption(name)}>
      <thead>
        <tr>
          <th scope="col">{gaps.competency}</th>
          <th scope="col" className={styles.number}>
            {gaps.answers}
          </th>
          <th scope="col" className={styles.number}>
            {gaps.gapRate}
          </th>
        </tr>
      </thead>
      <tbody>
        {[...rows]
          .sort((a, b) => a.position - b.position)
          .map((row) => (
            <tr key={row.competency_id}>
              <th scope="row" className={styles.name}>
                {row.position}. {row.name}
              </th>
              <td className={styles.number}>{count(row.answers)}</td>
              <td className={styles.number}>
                {row.gap_rate === null ? copy.none : `${Math.round(row.gap_rate * 100)}%`}
              </td>
            </tr>
          ))}
      </tbody>
    </Table>
  )
}

function Supply({ rows }: { rows: RegionSupply[] }) {
  const supply = copy.supply
  return (
    <Report heading={supply.heading} lead={supply.lead}>
      {rows.length === 0 ? (
        <p className={styles.empty}>{supply.empty}</p>
      ) : (
        <Table caption={supply.caption}>
          <thead>
            <tr>
              <th scope="col">{supply.region}</th>
              <th scope="col" className={styles.number}>
                {supply.providers}
              </th>
              <th scope="col" className={styles.number}>
                {supply.programs}
              </th>
              <th scope="col" className={styles.number}>
                {supply.assessments}
              </th>
              <th scope="col" className={styles.number}>
                {supply.seats}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.region_code}>
                <th scope="row" className={styles.name}>
                  {row.region}
                </th>
                <td className={styles.number}>{count(row.training_providers)}</td>
                <td className={styles.number}>{count(row.training_programs)}</td>
                <td className={styles.number}>{count(row.upcoming_assessments)}</td>
                <td className={styles.number}>{count(row.open_seats)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Report>
  )
}

const count = (n: number) => n.toLocaleString('en-US')

/** 67.5 as "67.5%": averages keep their one decimal place. */
const percent = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`

/** The period in words, for the line above the figures. */
function showing({ from, to }: Period): string {
  const day = (date: string) =>
    new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  if (from && to) return copy.period.between(day(from), day(to))
  if (from) return copy.period.since(day(from))
  if (to) return copy.period.until(day(to))
  return copy.period.all
}
