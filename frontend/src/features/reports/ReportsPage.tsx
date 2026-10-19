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
import { button } from '../../styles/buttons.ts'
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

const copy = en.reports

/** The address's names for the period and the skill-gap qualification. */
const PARAMS = { from: 'from', to: 'to', qualification: 'qualification' } as const

// Reports, after classic/app.py show_reports: the period, the figures as bordered metrics, then each report on a card
// with its table.
const muted = 'mt-2 mb-0 text-14 leading-[1.55] text-muted'
const leadText = 'mt-0 mb-[0.6rem] text-14 leading-[1.55] text-muted'
const empty =
  'mt-1 mb-0 rounded-12 border border-dashed border-dash bg-empty px-4 py-[0.85rem] text-14 text-muted'

/** A table's box, which scrolls sideways on a narrow screen and takes focus so the keyboard can scroll it. */
const tableBox =
  'mt-[0.4rem] overflow-x-auto rounded-8 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus'

// The tables' cells. Figures line up on the right, in figures of one width.
const headBase =
  'border-b border-border px-[0.6rem] py-2 font-semibold whitespace-nowrap text-muted'
const head = cx(headBase, 'text-left')
const headNumber = cx(headBase, 'text-right tabular-nums')
const rowHead = 'border-b border-rule px-[0.6rem] py-[0.55rem] text-left font-semibold text-navy'
const cell = 'border-b border-rule px-[0.6rem] py-[0.55rem] text-left text-navy'
const cellNumber = 'border-b border-rule px-[0.6rem] py-[0.55rem] text-right tabular-nums text-navy'

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
    <div className="flex flex-col gap-4">
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
    <fieldset className="m-0 rounded-18 border-0 bg-surface px-5 py-[1.1rem]">
      <legend className="float-left mb-[0.6rem] w-full p-0 text-16 font-[650] text-navy">
        {copy.period.legend}
      </legend>
      <div className="clear-both flex flex-wrap items-end gap-x-4 gap-y-3">
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
          <Button className={button()} onPress={() => onChange({ from: null, to: null })}>
            <Icon name="filterOff" />
            {copy.period.clear}
          </Button>
        )}
      </div>
      <p id={helpId} className="mt-[0.6rem] mb-0 text-13 leading-[1.45] text-muted">
        {copy.period.help}
      </p>
      {/* Words as well as color say what's wrong (US-13). */}
      <p
        id={errorId}
        role="alert"
        className="mt-2 mb-0 text-14 font-semibold text-warn-ink empty:m-0"
      >
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
    <div className="flex max-w-[18rem] flex-[1_1_12rem] flex-col gap-[0.35rem] max-sm:max-w-none">
      <label htmlFor={id} className="text-14 font-semibold text-navy">
        {label}
      </label>
      <input
        id={id}
        type="date"
        className={cx(
          'min-h-11 rounded-12 border bg-surface px-3 py-[0.45rem] text-15 text-navy',
          invalid ? 'border-warn-ink' : 'border-hover-border focus:border-blue hovered:border-blue',
        )}
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
      <p role="status" className={muted}>
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
      <p className="m-0 text-14 text-ink" role="status">
        {showing(period)} {updating ? copy.updating : ''}
      </p>
      <div
        className={cx(
          'flex flex-col gap-4',
          updating && 'opacity-60 transition-opacity duration-200 ease-[ease]',
        )}
        aria-busy={updating}
      >
        <section aria-label={stats.label}>
          <dl className="m-0 grid grid-cols-3 gap-4 max-xl:grid-cols-2 max-xl:gap-3">
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
    <div className="rounded-14 border border-border bg-surface px-5 py-[1.1rem] max-sm:px-4 max-sm:py-[0.9rem]">
      <dt className="text-14 text-ink">{label}</dt>
      <dd className="mt-[0.2rem] mb-0 ml-0 flex flex-col gap-[0.2rem]">
        <span className="font-display text-[2rem] leading-[1.15] font-bold text-navy max-sm:text-[1.6rem]">
          {value}
        </span>
        {help && <span className="m-0 text-12 leading-[1.45] text-muted">{help}</span>}
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
    <section
      aria-labelledby={headingId}
      className="min-w-0 rounded-16 border border-border bg-surface px-5 py-[1.15rem]"
    >
      <h2 id={headingId} className="mt-0 mb-1 text-[1.3rem] text-navy">
        {heading}
      </h2>
      {lead && <p className={leadText}>{lead}</p>}
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
      <p className="mt-1 mb-[0.4rem] text-14 font-[650] text-navy" aria-hidden="true">
        {caption}
      </p>
      {/* A scrolling box needs focus for the keyboard to reach what's off to the side (axe's
          scrollable-region-focusable). */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div className={tableBox} tabIndex={0} role="region" aria-labelledby={captionId}>
        <table className="w-full border-collapse text-14">
          <caption id={captionId} className="sr-only">
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
    <span className="flex min-w-36 items-center gap-[0.6rem]">
      <span
        className="block h-2.5 max-w-96 flex-[1_1_8rem] overflow-hidden rounded-full bg-bar"
        aria-hidden="true"
      >
        <i
          className="block h-full w-[calc(var(--share)*1%)] rounded-[inherit] bg-blue"
          style={cssVars({ '--share': Math.round(Math.min(Math.max(share, 0), 1) * 100) })}
        />
      </span>
      <span className="min-w-14 flex-none tabular-nums">{children}</span>
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
        <p className={empty}>{journey.empty}</p>
      ) : (
        <Table caption={journey.caption}>
          <thead>
            <tr>
              <th scope="col" className={head}>
                {journey.stage}
              </th>
              <th scope="col" className={cx(head, 'w-[70%]')}>
                {journey.learners}
              </th>
            </tr>
          </thead>
          <tbody>
            {STAGES.map((stage) => (
              <tr key={stage}>
                <th scope="row" className={rowHead}>
                  {journey.stages[stage]}
                </th>
                <td className={cell}>
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
        <p className={empty}>{demand.empty}</p>
      ) : (
        <>
          <Table caption={demand.caption}>
            <thead>
              <tr>
                <th scope="col" className={head}>
                  {demand.qualification}
                </th>
                <th scope="col" className={headNumber}>
                  {demand.topMatch}
                </th>
                <th scope="col" className={headNumber}>
                  {demand.chosen}
                </th>
                <th scope="col" className={headNumber}>
                  {demand.checks}
                </th>
                <th scope="col" className={head}>
                  {demand.average}
                </th>
                <th scope="col" className={headNumber}>
                  {demand.applications}
                </th>
                <th scope="col" className={headNumber}>
                  {demand.competent}
                </th>
                <th scope="col" className={headNumber}>
                  {demand.certified}
                </th>
              </tr>
            </thead>
            <tbody>
              {active.map((row) => (
                <tr key={row.qualification.code}>
                  <th scope="row" className={cx(rowHead, 'min-w-56 max-sm:min-w-40')}>
                    {row.qualification.name}
                  </th>
                  <td className={cellNumber}>{count(row.top_match)}</td>
                  <td className={cellNumber}>{count(row.chosen)}</td>
                  <td className={cellNumber}>{count(row.readiness_checks)}</td>
                  <td className={cell}>
                    {row.average_readiness === null ? (
                      copy.none
                    ) : (
                      <Bar share={row.average_readiness / 100}>
                        {percent(row.average_readiness)}
                      </Bar>
                    )}
                  </td>
                  <td className={cellNumber}>{count(row.assessment_applications)}</td>
                  <td className={cellNumber}>{count(row.competent)}</td>
                  <td className={cellNumber}>{count(row.certified)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          {quiet > 0 && <p className={muted}>{demand.quiet(quiet)}</p>}
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
        <p className={empty}>{gaps.noCatalog}</p>
      ) : (
        <>
          <div className="mt-2 mb-3 max-w-[32rem]">
            <QualificationField
              label={gaps.qualification}
              catalog={catalog}
              value={code}
              onChange={onChoose}
            />
          </div>
          <p className={leadText}>{gaps.lead}</p>
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
      <p role="status" className={muted}>
        {gaps.loading}
      </p>
    )
  }
  const rows = query.data
  if (!rows.some((row) => row.answers > 0)) return <p className={empty}>{gaps.empty}</p>
  return (
    <Table caption={gaps.caption(name)}>
      <thead>
        <tr>
          <th scope="col" className={head}>
            {gaps.competency}
          </th>
          <th scope="col" className={headNumber}>
            {gaps.answers}
          </th>
          <th scope="col" className={headNumber}>
            {gaps.gapRate}
          </th>
        </tr>
      </thead>
      <tbody>
        {[...rows]
          .sort((a, b) => a.position - b.position)
          .map((row) => (
            <tr key={row.competency_id}>
              <th scope="row" className={cx(rowHead, 'min-w-56 max-sm:min-w-40')}>
                {row.position}. {row.name}
              </th>
              <td className={cellNumber}>{count(row.answers)}</td>
              <td className={cellNumber}>
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
        <p className={empty}>{supply.empty}</p>
      ) : (
        <Table caption={supply.caption}>
          <thead>
            <tr>
              <th scope="col" className={head}>
                {supply.region}
              </th>
              <th scope="col" className={headNumber}>
                {supply.providers}
              </th>
              <th scope="col" className={headNumber}>
                {supply.programs}
              </th>
              <th scope="col" className={headNumber}>
                {supply.assessments}
              </th>
              <th scope="col" className={headNumber}>
                {supply.seats}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.region_code}>
                <th scope="row" className={cx(rowHead, 'min-w-56 max-sm:min-w-40')}>
                  {row.region}
                </th>
                <td className={cellNumber}>{count(row.training_providers)}</td>
                <td className={cellNumber}>{count(row.training_programs)}</td>
                <td className={cellNumber}>{count(row.upcoming_assessments)}</td>
                <td className={cellNumber}>{count(row.open_seats)}</td>
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
