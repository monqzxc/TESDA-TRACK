import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useId, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { useRegions, type Qualification } from '../../api/queries.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { CheckboxRow } from '../../components/CheckboxRow.tsx'
import { DataProvenance } from '../../components/DataProvenance.tsx'
import { Icon } from '../../components/Icon.tsx'
import { SelectField } from '../../components/SelectField.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { button } from '../../styles/buttons.ts'
import { paths } from '../../paths.ts'
import {
  DELIVERY_MODES,
  shortName,
  trainingAddress,
  type DeliveryMode,
} from '../training/address.ts'
import { friendlyDay, philippineDay } from '../training/centers.ts'
import { peso } from '../training/format.ts'
import { reportQuery, type PathwayReport as Report, type ReportRequest } from './api.ts'
import { RequestFailed } from './RequestFailed.tsx'
import { useFinderStore, type Profile, type SubmittedCheck } from './store.ts'
import { card, muted, status } from './styles.ts'

type Advice = Report['skills_to_improve'][number]
type Provider = Report['providers'][number]
type ReportResult = UseQueryResult<Report>

/** Skills shown before the rest fold away: a learner new to a trade can have a dozen or more. */
const FIRST_SKILLS = 5
/** Options shown here; the rest are a link away, in Training & Assessment. */
const FIRST_PROVIDERS = 3
const ANY = 'any'
const ACTIONS = ['learn', 'practice', 'demonstrate'] as const

const rowHeading = 'm-0 flex items-center gap-2 text-18 leading-[1.3] font-bold text-navy'
const panel = 'min-w-0 rounded-12 bg-panel'
const section = cx(card, 'flex flex-col gap-4')
const smallHeading = 'mt-0 mb-1 text-15 leading-[1.4] font-bold text-navy'
const notes = 'm-0 grid gap-1.5 pl-[1.2rem] text-14 leading-[1.55] text-ink'

/**
 * The personalized report (POST /recommendations/report), asked with the learner's own answers, the goal they typed
 * and where they want to look for options. The API writes every sentence from those, the catalog and the rankings.
 */
export function usePathwayReport(
  qualification: Qualification,
  check: SubmittedCheck,
  asked: { query: string; profile: Profile },
): ReportResult {
  const place = useFinderStore((state) => state.place)
  const { learner } = useAuth()
  const body: ReportRequest = {
    query: asked.query,
    profile: asked.profile,
    qualification_code: qualification.code,
    answers: check.answers,
    region_code: place.region,
    preferred_delivery_mode: place.mode,
    needs_scholarship: place.scholarship,
  }
  // While another place is worked out, the last report stays on screen rather than flashing away.
  return useQuery({
    ...reportQuery(body, learner?.id ?? null),
    placeholderData: keepPreviousData,
  })
}

interface PathwayDetailsProps {
  qualification: Qualification
  check: SubmittedCheck
  report: ReportResult
  /** The curated pathway for the verdict's route, under the next steps. */
  pathway: ReactNode
}

/**
 * Everything under the verdict, in rows: the next steps with the curated pathway; the skills to work on beside why;
 * where to train or be assessed across the page; then where the record comes from. Long lists fold, so the page
 * stays a few screens tall.
 */
export function PathwayDetails({ qualification, check, report, pathway }: PathwayDetailsProps) {
  const data = report.data
  return (
    <>
      <NextSteps report={report} pathway={pathway} />
      <div className="@container">
        <div className={cx('grid min-w-0 items-start gap-4', data && '@min-[860px]:grid-cols-2')}>
          <Skills report={report} check={check} />
          {data && <Reasons report={data} />}
        </div>
      </div>
      <Options report={report} qualification={qualification} />
      {data && (
        <div className="@container">
          <div className="grid min-w-0 gap-x-8 gap-y-3 px-1 @min-[860px]:grid-cols-2">
            <DataProvenance value={qualification.provenance} />
            <p className="m-0 text-13 leading-[1.5] text-muted">{data.disclaimer}</p>
          </div>
        </div>
      )}
    </>
  )
}

/** The report's part once it's here; until then, that it's being prepared, or that it failed with Try again. */
function Ready({
  report,
  children,
}: {
  report: ReportResult
  children: (data: Report) => ReactNode
}) {
  const en = useCopy()
  const copy = en.finder.pathway.report

  if (report.data) return children(report.data)
  if (report.isError) {
    return (
      <div>
        <RequestFailed error={report.error} onRetry={() => void report.refetch()} />
      </div>
    )
  }
  return (
    <p role="status" className={status}>
      {copy.loading}
    </p>
  )
}

function Count({ n }: { n: number }) {
  return (
    <span className="rounded-full bg-chip px-2 text-12 leading-[1.6] font-semibold text-ink tabular-nums">
      {n}
    </span>
  )
}

/** The next steps side by side, in order, with the curated pathway to save under them. */
function NextSteps({ report, pathway }: { report: ReportResult; pathway: ReactNode }) {
  const en = useCopy()
  const copy = en.finder.pathway.report

  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className={section}>
      <h3 id={headingId} className={rowHeading}>
        {copy.steps}
      </h3>
      <Ready report={report}>
        {(data) =>
          data.next_steps.length > 0 && (
            <ol className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(100%,12.5rem),1fr))] gap-3 p-0">
              {data.next_steps.map((step) => (
                <li key={step.position} className={cx(panel, 'flex items-baseline gap-3 p-4')}>
                  <span
                    aria-hidden="true"
                    className="w-4 flex-none text-15 font-semibold text-muted tabular-nums"
                  >
                    {step.position}
                  </span>
                  <div className="min-w-0">
                    <p className="m-0 text-15 leading-[1.4] font-semibold text-navy">
                      {step.title}
                    </p>
                    <p className="m-0 text-14 leading-[1.5] text-ink">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          )
        }
      </Ready>
      {pathway}
    </section>
  )
}

const tones = {
  neutral: 'border border-pill-border bg-pill text-ink',
  info: 'bg-soft text-navy',
  warning: 'bg-warn-bg text-warn-ink',
  success: 'bg-good-bg text-good-ink',
}

function Tag({ tone = 'neutral', children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center rounded-full px-2 py-[0.1rem] text-12 leading-[1.5] font-semibold',
        tones[tone],
      )}
    >
      {children}
    </span>
  )
}

const PRIORITY_TONES = { high: 'warning', medium: 'info', low: 'neutral' } as const
const STATUS_TONES = {
  confirmed: 'success',
  needs_verification: 'warning',
  demonstration: 'neutral',
} as const

/**
 * The skills to improve and the competencies to learn or practice are mostly the same units: the second keeps the
 * essential ones and adds, for a learner going straight to assessment, the core units they'll have to show. Each unit
 * is listed once, what to learn first.
 */
function mergedSkills(report: Report): Advice[] {
  const units = new Map<number, Advice>()
  for (const item of [...report.skills_to_improve, ...report.competencies_to_learn_or_practice]) {
    if (!units.has(item.competency_id)) units.set(item.competency_id, item)
  }
  return ACTIONS.flatMap((action) => [...units.values()].filter((item) => item.action === action))
}

/** The units to work on, a line each, then the strengths. */
function Skills({ report, check }: { report: ReportResult; check: SubmittedCheck }) {
  const en = useCopy()
  const copy = en.finder.pathway

  const headingId = useId()
  const { strengths, skill_gaps } = check.result
  const skills = report.data ? mergedSkills(report.data) : null
  let gaps
  if (skills) {
    gaps = skills.length ? (
      <SkillList items={skills} />
    ) : (
      <p className={muted}>{copy.report.noGaps}</p>
    )
  } else if (report.isError) {
    // Without the report, the unit names from the readiness result.
    gaps = skill_gaps.length ? (
      <ul className="m-0 pl-[1.3rem] text-15 leading-[1.55] text-ink">
        {skill_gaps.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
    ) : (
      <p className={muted}>{copy.noGaps}</p>
    )
  } else {
    gaps = (
      <p role="status" className={status}>
        {copy.report.loading}
      </p>
    )
  }
  const count = skills?.length ?? skill_gaps.length
  return (
    <section data-tour="pathway-skills" aria-labelledby={headingId} className={section}>
      <h3 id={headingId} className={rowHeading}>
        {copy.improve}
        {count > 0 && <Count n={count} />}
      </h3>
      {gaps}
      <p className={cx(panel, 'px-4 py-3 text-14 leading-[1.55] text-ink')}>
        <strong className="text-navy">{copy.strengths}:</strong>{' '}
        {strengths.length ? strengths.join(', ') : copy.noStrengths}
      </p>
    </section>
  )
}

function SkillList({ items }: { items: Advice[] }) {
  const en = useCopy()
  const copy = en.finder.pathway.report

  const first = items.slice(0, FIRST_SKILLS)
  const rest = items.slice(FIRST_SKILLS)
  return (
    <div className="flex flex-col gap-2">
      <ul className="m-0 grid list-none gap-2 p-0">
        {first.map((item) => (
          <SkillItem key={item.competency_id} item={item} />
        ))}
      </ul>
      {rest.length > 0 && (
        <details className="group/more">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 text-14 font-semibold text-blue [&::-webkit-details-marker]:hidden">
            {copy.moreSkills(rest.length)}
            <Icon
              name="chevron"
              className="transition-transform duration-200 ease-[ease] group-open/more:rotate-180"
            />
          </summary>
          <ul className="m-0 mt-1 grid list-none gap-2 p-0">
            {rest.map((item) => (
              <SkillItem key={item.competency_id} item={item} />
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

/** One line per unit: what to do with it and its priority; what to do, why and how open under it. */
function SkillItem({ item }: { item: Advice }) {
  const en = useCopy()
  const copy = en.finder.pathway.report

  return (
    <li className={panel}>
      <details className="group">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-12 px-4 py-2 hovered:bg-soft [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-15 leading-[1.35] font-semibold wrap-anywhere text-navy">
              {item.name}
            </span>
            <span className="text-13 leading-[1.4] text-muted">{copy.actions[item.action]}</span>
          </span>
          <Tag tone={PRIORITY_TONES[item.priority]}>{copy.priority[item.priority]}</Tag>
          <Icon
            name="chevron"
            className="flex-none text-muted transition-transform duration-200 ease-[ease] group-open:rotate-180"
          />
        </summary>
        <div className="flex flex-col gap-2 px-4 pt-1 pb-4 text-14 leading-[1.55] text-ink">
          <p className="m-0 font-semibold text-navy">{item.what_to_do}</p>
          <p className="m-0">{item.why_it_matters}</p>
          <p className="m-0 text-muted">{item.relevance}</p>
          {item.activities.length > 0 && (
            <div>
              <p className="m-0 font-semibold text-navy">{copy.how}</p>
              <ul className="m-0 pl-[1.3rem]">
                {item.activities.map((activity) => (
                  <li key={activity}>{activity}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted">
            <Tag tone={item.must_learn ? 'warning' : 'neutral'}>{copy.basis[item.basis]}</Tag>
            {item.evidence.join(' ')}
          </p>
        </div>
      </details>
    </li>
  )
}

/**
 * Where to train or be assessed, across the page: where to look, the first few options the rankings found, the other
 * ways forward, and what else to weigh.
 */
function Options({
  report,
  qualification,
}: {
  report: ReportResult
  qualification: Qualification
}) {
  const en = useCopy()
  const inTsp = useLocation().pathname.startsWith(paths.tspWebview)
  const copy = en.finder.pathway.report

  const headingId = useId()
  const count = report.data?.providers.length ?? 0
  return (
    <section aria-labelledby={headingId} className={cx(section, '@container')}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h3 id={headingId} className={rowHeading}>
          {en.nav.training}
          {count > 0 && <Count n={count} />}
        </h3>
        <Link
          to={trainingAddress({
            qualifications: [qualification.code],
            search: shortName(qualification.name),
          }).replace(paths.training, inTsp ? paths.tspTraining : paths.training)}
          className={button({ variant: 'tertiary' })}
        >
          {copy.allOptions}
          <Icon name="arrowRight" />
        </Link>
      </div>
      <PlaceFields />
      <div aria-live="polite" className="empty:hidden">
        {report.data && report.isPlaceholderData && <p className={muted}>{copy.updating}</p>}
      </div>
      <Ready report={report}>{(data) => <OptionList report={data} />}</Ready>
    </section>
  )
}

/** They sort and explain the options only, and aren't saved. */
function PlaceFields() {
  const en = useCopy()
  const copy = en.finder.pathway.report

  const place = useFinderStore((state) => state.place)
  const setPlace = useFinderStore((state) => state.setPlace)
  const regions = useRegions().data ?? []
  const helpId = useId()
  return (
    <fieldset
      aria-describedby={helpId}
      className={cx(
        panel,
        'm-0 grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] items-end gap-x-4 gap-y-2 border-0 px-4 py-3',
      )}
    >
      <legend className="sr-only">{copy.place.legend}</legend>
      <SelectField
        label={copy.place.region}
        options={[
          { id: ANY, label: copy.place.anyRegion },
          ...regions.map((region) => ({ id: region.code, label: region.name })),
        ]}
        value={place.region ?? ANY}
        onChange={(code) => setPlace({ region: code === ANY ? null : code })}
      />
      <SelectField
        label={copy.place.mode}
        options={[
          { id: ANY, label: copy.place.anyMode },
          ...DELIVERY_MODES.map((mode) => ({ id: mode, label: en.training.delivery[mode] })),
        ]}
        value={place.mode ?? ANY}
        onChange={(mode) => setPlace({ mode: mode === ANY ? null : (mode as DeliveryMode) })}
      />
      <CheckboxRow
        className="pb-2"
        isSelected={place.scholarship}
        onChange={(scholarship) => setPlace({ scholarship })}
      >
        {copy.place.scholarship}
      </CheckboxRow>
      <p id={helpId} className="col-span-full m-0 text-13 leading-[1.5] text-muted">
        {copy.place.help}
      </p>
    </fieldset>
  )
}

/**
 * The options side by side, then the other ways forward and what else to weigh. The recommended way isn't repeated:
 * it's the verdict at the top of the page.
 */
function OptionList({ report }: { report: Report }) {
  const en = useCopy()
  const copy = en.finder.pathway.report

  const today = philippineDay(new Date())
  const others = report.training_to_consider.filter((option) => !option.recommended)
  return (
    <>
      {report.providers.length ? (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))] gap-3 p-0">
          {report.providers.slice(0, FIRST_PROVIDERS).map((provider) => (
            <ProviderItem
              key={`${provider.kind}-${provider.service_id}`}
              provider={provider}
              today={today}
            />
          ))}
        </ul>
      ) : (
        <p className={muted}>{copy.noOptions}</p>
      )}
      {(others.length > 0 || report.considerations.length > 0) && (
        <div className="grid min-w-0 gap-x-8 gap-y-4 @min-[760px]:grid-cols-2">
          {others.length > 0 && (
            <div className="min-w-0">
              <h4 className={smallHeading}>{copy.alsoConsider}</h4>
              <ul className={notes}>
                {others.map((option) => (
                  <li key={option.kind}>
                    <strong className="font-semibold text-navy">{option.title}.</strong>{' '}
                    {option.reasons.join(' ')}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {report.considerations.length > 0 && (
            <div className="min-w-0">
              <h4 className={smallHeading}>{copy.consider}</h4>
              <ul className={notes}>
                {report.considerations.map((item) => (
                  <li key={item.topic}>
                    {item.text}
                    {!!item.items?.length && (
                      <span className="block text-13 text-muted">{item.items.join(' · ')}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </>
  )
}

function ProviderItem({ provider, today }: { provider: Provider; today: string }) {
  const en = useCopy()
  const copy = en.finder.pathway.report

  const facts: string[] = []
  if (provider.distance_km !== null) facts.push(copy.distance(provider.distance_km))
  if (provider.starts_on) {
    const day = friendlyDay(provider.starts_on, today)
    facts.push(provider.kind === 'training' ? copy.starts(day) : copy.scheduled(day))
  } else {
    facts.push(copy.noDate)
  }
  if (provider.cost !== null && provider.cost !== undefined) {
    facts.push(
      provider.kind === 'training' ? copy.cost(peso(provider.cost)) : copy.fee(peso(provider.cost)),
    )
  }
  if (provider.duration_hours) facts.push(copy.hours(provider.duration_hours))
  if (provider.seats_left !== null && provider.seats_left !== undefined) {
    facts.push(copy.seats(provider.seats_left))
  }
  if (provider.delivery_mode && provider.delivery_mode !== 'unknown') {
    facts.push(en.training.delivery[provider.delivery_mode as DeliveryMode])
  }
  if (provider.scholarship_available) facts.push(copy.scholarship)
  return (
    <li className={cx(panel, 'flex flex-col gap-1 px-4 py-3')}>
      <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-15 font-semibold text-navy">{provider.name}</span>
        <Tag tone="info">{copy.kinds[provider.kind]}</Tag>
        <Tag tone={STATUS_TONES[provider.status]}>{copy.statuses[provider.status]}</Tag>
      </p>
      <p className="m-0 text-14 leading-[1.5] text-ink">
        {[provider.title, ...facts].filter(Boolean).join(' · ')}
      </p>
      {provider.notes.length > 0 && (
        <p className="m-0 text-13 leading-[1.5] text-muted">{provider.notes.join(' ')}</p>
      )}
    </li>
  )
}

/** Each part of the learner's data and what it means. */
function Reasons({ report }: { report: Report }) {
  const en = useCopy()
  const copy = en.finder.pathway.report

  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className={section}>
      <h3 id={headingId} className={rowHeading}>
        {copy.why}
      </h3>
      <div className="flex flex-col gap-4">
        {report.reasoning.map((reason) => (
          <div key={reason.topic} className="min-w-0">
            <h4 className="m-0 text-15 leading-[1.4] font-bold text-navy">
              {copy.topics[reason.topic]}
            </h4>
            <p className="m-0 text-14 leading-[1.55] text-ink">{reason.summary}</p>
            {reason.points.length > 0 && (
              <p className="m-0 text-13 leading-[1.5] text-muted">{reason.points.join(' · ')}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
