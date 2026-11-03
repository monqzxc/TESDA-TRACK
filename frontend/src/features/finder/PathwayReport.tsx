import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useId, type ReactNode } from 'react'
import { Tab, TabList, TabPanel, Tabs } from 'react-aria-components'
import { Link } from 'react-router'
import { useRegions, type Qualification } from '../../api/queries.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { CheckboxRow } from '../../components/CheckboxRow.tsx'
import { DataProvenance } from '../../components/DataProvenance.tsx'
import { Icon } from '../../components/Icon.tsx'
import { SelectField } from '../../components/SelectField.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { button } from '../../styles/buttons.ts'
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
type Option = Report['training_to_consider'][number]
type Provider = Report['providers'][number]
type ReportResult = UseQueryResult<Report>

/** Skills shown in each group before the rest fold away: a learner new to a trade can have a dozen or more. */
const FIRST_SKILLS = 5
const ANY = 'any'
const ACTIONS = ['learn', 'practice', 'demonstrate'] as const

/** A heading inside a tab: the tab names the panel, so these stay small. */
const subheading = 'm-0 flex items-center gap-2 text-16 leading-[1.35] font-bold text-navy'
const list = 'm-0 pl-[1.3rem] text-14 leading-[1.55] text-ink'
const panel = 'min-w-0 rounded-14 bg-panel p-4'

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

type Section = 'plan' | 'skills' | 'options' | 'why'

interface PathwayDetailsProps {
  qualification: Qualification
  check: SubmittedCheck
  report: ReportResult
  /** The curated pathway for the verdict's route, beside the next steps. */
  pathway: ReactNode
}

/**
 * Everything under the verdict, one part at a time so the page stays a screen tall: the next steps with the curated
 * pathway, the skills to work on, where to train or be assessed, and why. A part with nothing to say isn't shown.
 */
export function PathwayDetails({ qualification, check, report, pathway }: PathwayDetailsProps) {
  const en = useCopy()
  const copy = en.finder.pathway

  const skills = report.data ? mergedSkills(report.data).length : check.result.skill_gaps.length
  const providers = report.data?.providers.length
  const tabs: { id: Section; label: string; count?: number; tour?: string }[] = [
    { id: 'plan', label: copy.report.steps },
    { id: 'skills', label: copy.improve, count: skills, tour: 'pathway-skills' },
    { id: 'options', label: en.nav.training, count: providers },
    { id: 'why', label: copy.report.why },
  ]
  return (
    <Tabs defaultSelectedKey="plan" className={cx(card, '@container flex flex-col gap-5')}>
      <TabList
        aria-label={copy.yourPathway}
        className="grid grid-cols-4 gap-1 rounded-14 bg-panel p-1 @max-[640px]:grid-cols-2"
      >
        {tabs.map((tab) => (
          <Tab
            key={tab.id}
            id={tab.id}
            data-tour={tab.tour}
            className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-10 px-3 py-2 text-center text-14 leading-[1.3] font-semibold text-ink transition-colors duration-150 ease-[ease] data-selected:bg-surface data-selected:text-navy data-selected:shadow-[0_1px_3px_rgb(var(--track-shadow-rgb)/0.14)] hovered:text-navy"
          >
            {tab.label}
            {!!tab.count && (
              <span className="rounded-full bg-tint px-2 text-12 leading-[1.6] font-bold text-blue">
                {tab.count}
              </span>
            )}
          </Tab>
        ))}
      </TabList>
      <TabPanel id="plan" className="min-w-0">
        <div className="flex flex-wrap items-start gap-5 *:min-w-[min(100%,20rem)] *:flex-1">
          <Ready report={report}>
            {(data) => data.next_steps.length > 0 && <NextSteps report={data} />}
          </Ready>
          {pathway}
        </div>
      </TabPanel>
      <TabPanel id="skills" className="min-w-0">
        <SkillsPanel report={report} check={check} />
      </TabPanel>
      <TabPanel id="options" className="flex min-w-0 flex-col gap-5">
        <PlaceFields />
        <div aria-live="polite" className="empty:hidden">
          {report.data && report.isPlaceholderData && (
            <p className={muted}>{copy.report.updating}</p>
          )}
        </div>
        <Ready report={report}>
          {(data) => <Options report={data} qualification={qualification} />}
        </Ready>
      </TabPanel>
      <TabPanel id="why" className="min-w-0">
        <Ready report={report}>
          {(data) => <Reasons report={data} qualification={qualification} />}
        </Ready>
      </TabPanel>
    </Tabs>
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

/** The next steps, in order. */
function NextSteps({ report }: { report: Report }) {
  return (
    <ol className="m-0 grid list-none p-0">
      {report.next_steps.map((step) => (
        <li
          key={step.position}
          className="relative m-0 flex items-start gap-[0.85rem] pb-4 not-last:before:absolute not-last:before:top-[34px] not-last:before:bottom-1 not-last:before:left-[15px] not-last:before:w-0.5 not-last:before:bg-line not-last:before:content-['']"
        >
          <span
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-tint text-14 font-bold text-blue"
          >
            {step.position}
          </span>
          <div className="mt-[0.3rem] min-w-0">
            <p className="m-0 text-15 leading-[1.5] font-semibold text-navy">{step.title}</p>
            <p className="m-0 text-14 leading-[1.55] text-ink">{step.detail}</p>
          </div>
        </li>
      ))}
    </ol>
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
 * is listed once.
 */
function mergedSkills(report: Report): Advice[] {
  const units = new Map<number, Advice>()
  for (const item of [...report.skills_to_improve, ...report.competencies_to_learn_or_practice]) {
    if (!units.has(item.competency_id)) units.set(item.competency_id, item)
  }
  return [...units.values()]
}

/** The units to work on, grouped by what to do (learn, practice, then be ready to show), and the strengths. */
function SkillsPanel({ report, check }: { report: ReportResult; check: SubmittedCheck }) {
  const en = useCopy()
  const copy = en.finder.pathway

  const { strengths, skill_gaps } = check.result
  let gaps
  if (report.data) {
    const skills = mergedSkills(report.data)
    gaps = skills.length ? (
      ACTIONS.map((action) => [action, skills.filter((item) => item.action === action)] as const)
        .filter(([, group]) => group.length > 0)
        .map(([action, group]) => (
          <div key={action} className="flex flex-col gap-2">
            <h3 className={subheading}>
              {copy.report.actions[action]}
              <Count n={group.length} />
            </h3>
            <SkillList items={group} />
          </div>
        ))
    ) : (
      <p className={muted}>{copy.report.noGaps}</p>
    )
  } else if (report.isError) {
    // Without the report, the unit names from the readiness result.
    gaps = (
      <div className="flex flex-col gap-2">
        <h3 className={subheading}>{copy.improve}</h3>
        {skill_gaps.length ? (
          <ul className={list}>
            {skill_gaps.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        ) : (
          <p className={muted}>{copy.noGaps}</p>
        )}
      </div>
    )
  } else {
    gaps = (
      <p role="status" className={status}>
        {copy.report.loading}
      </p>
    )
  }
  return (
    <div className="grid min-w-0 items-start gap-6 @min-[760px]:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-5">{gaps}</div>
      <div className={cx(panel, 'flex flex-col gap-2')}>
        <h3 className={subheading}>
          {copy.strengths}
          <Count n={strengths.length} />
        </h3>
        {strengths.length ? (
          <ul className={cx(list, "[list-style:'✓__']")}>
            {strengths.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        ) : (
          <p className={muted}>{copy.noStrengths}</p>
        )}
      </div>
    </div>
  )
}

function Count({ n }: { n: number }) {
  return (
    <span className="rounded-full bg-tint px-2 text-12 leading-[1.6] font-bold text-blue">{n}</span>
  )
}

function SkillList({ items }: { items: Advice[] }) {
  const en = useCopy()
  const copy = en.finder.pathway.report

  const first = items.slice(0, FIRST_SKILLS)
  const rest = items.slice(FIRST_SKILLS)
  return (
    <>
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
    </>
  )
}

/** One line per unit, its priority beside it; what to do, why and how open under it. */
function SkillItem({ item }: { item: Advice }) {
  const en = useCopy()
  const copy = en.finder.pathway.report

  return (
    <li className="min-w-0 rounded-12 bg-panel">
      <details className="group">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-12 px-4 py-2 hovered:bg-soft [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1 text-15 leading-[1.4] font-semibold wrap-anywhere text-navy">
            {item.name}
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
              <ul className={list}>
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

/** Where to look for options. They sort and explain the options only, and stay in this tab. */
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
        'm-0 grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] items-end gap-3 border-0',
      )}
    >
      <legend className="col-span-full float-left mb-1 text-15 font-bold text-navy">
        {copy.place.legend}
      </legend>
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
      <p id={helpId} className={cx(muted, 'col-span-full')}>
        {copy.place.help}
      </p>
    </fieldset>
  )
}

/** The ways forward, the providers the rankings found, and what else to weigh. */
function Options({ report, qualification }: { report: Report; qualification: Qualification }) {
  const en = useCopy()
  const copy = en.finder.pathway.report

  const today = philippineDay(new Date())
  const recommended = report.training_to_consider.filter((option) => option.recommended)
  const others = report.training_to_consider.filter((option) => !option.recommended)
  return (
    <>
      {report.training_to_consider.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className={subheading}>{copy.training}</h3>
          <ul className="m-0 grid list-none gap-3 p-0 @min-[640px]:grid-cols-2">
            {[...recommended, ...others].map((option) => (
              <OptionItem key={option.kind} option={option} />
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-col gap-3">
        <h3 className={subheading}>
          {copy.options}
          {report.providers.length > 0 && <Count n={report.providers.length} />}
        </h3>
        {report.providers.length ? (
          <ul className="m-0 grid min-w-0 list-none grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-3 p-0">
            {report.providers.map((provider) => (
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
        <Link
          to={trainingAddress({
            qualifications: [qualification.code],
            search: shortName(qualification.name),
          })}
          className={cx(button(), 'self-start')}
        >
          {copy.allOptions}
          <Icon name="arrowRight" />
        </Link>
      </div>
      {report.considerations.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className={subheading}>{copy.consider}</h3>
          <ul className={cx(list, 'grid gap-2')}>
            {report.considerations.map((item) => (
              <li key={item.topic}>
                {item.text}
                {!!item.items?.length && (
                  <ul className="m-0 mt-1 pl-[1.1rem] text-muted">
                    {item.items.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

function OptionItem({ option }: { option: Option }) {
  const en = useCopy()
  const copy = en.finder.pathway.report

  return (
    <li
      className={cx(
        'flex min-w-0 flex-col gap-1 rounded-12 p-4',
        option.recommended ? 'bg-soft' : 'bg-panel',
      )}
    >
      <p className="m-0 flex flex-wrap items-center gap-2">
        <span className="text-15 font-semibold text-navy">{option.title}</span>
        <Tag tone={option.recommended ? 'success' : 'neutral'}>
          {option.recommended ? copy.recommended : copy.alsoConsider}
        </Tag>
      </p>
      <ul className={list}>
        {option.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </li>
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
    <li className={cx(panel, 'flex flex-col gap-1')}>
      <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Tag tone="info">{copy.kinds[provider.kind]}</Tag>
        <Tag tone={STATUS_TONES[provider.status]}>{copy.statuses[provider.status]}</Tag>
      </p>
      <p className="m-0 text-15 font-semibold text-navy">{provider.name}</p>
      {provider.title && <p className="m-0 text-14 text-ink">{provider.title}</p>}
      <p className="m-0 text-14 leading-[1.55] text-muted">{facts.join(' · ')}</p>
      {provider.notes.length > 0 && (
        <ul className={cx(list, 'text-muted')}>
          {provider.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </li>
  )
}

/** Each part of the learner's data and what it means, then where the qualification's record comes from. */
function Reasons({ report, qualification }: { report: Report; qualification: Qualification }) {
  const en = useCopy()
  const copy = en.finder.pathway.report

  return (
    <div className="flex flex-col gap-6">
      {report.reasoning.length > 0 && (
        <div className="grid min-w-0 gap-x-8 gap-y-5 @min-[640px]:grid-cols-2">
          {report.reasoning.map((reason) => (
            <div key={reason.topic} className="flex min-w-0 flex-col gap-1">
              <h3 className={subheading}>{copy.topics[reason.topic]}</h3>
              <p className="m-0 max-w-[65ch] text-15 leading-[1.55] text-ink">{reason.summary}</p>
              {reason.points.length > 0 && (
                <ul className={cx(list, 'text-muted')}>
                  {reason.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
      <div className={cx(panel, 'flex flex-col gap-3')}>
        <DataProvenance value={qualification.provenance} />
        <p className={muted}>{report.disclaimer}</p>
      </div>
    </div>
  )
}
