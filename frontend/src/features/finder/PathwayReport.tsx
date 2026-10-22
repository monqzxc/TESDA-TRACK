import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useId, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useRegions, type Qualification } from '../../api/queries.ts'
import { useAuth } from '../../auth/useAuth.ts'
import { CheckboxRow } from '../../components/CheckboxRow.tsx'
import { Icon, type IconName } from '../../components/Icon.tsx'
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
import { card, kicker, muted, status } from './styles.ts'

type Advice = Report['skills_to_improve'][number]
type Option = Report['training_to_consider'][number]
type Provider = Report['providers'][number]
type Topic = Report['reasoning'][number]['topic']
type ConsiderTopic = Report['considerations'][number]['topic']

/** Skills shown before the rest fold away: a learner new to a trade can have a dozen or more. */
const FIRST_SKILLS = 4
const ANY = 'any'

const h3 = 'm-0 text-[1.2rem] leading-[1.3] text-navy'
const h4 = 'm-0 flex items-center gap-2 font-text text-16 tracking-normal text-navy'
const list = 'm-0 pl-[1.3rem] text-[0.9rem] leading-[1.55] text-ink'
const box = 'rounded-12 border border-border px-[0.95rem] py-3'

const TOPIC_ICONS: Record<Topic, IconName> = {
  strengths: 'award',
  skill_gaps: 'target',
  career_goal: 'briefcase',
  assessment_readiness: 'checklist',
  employment: 'growth',
}

const CONSIDER_ICONS: Record<ConsiderTopic, IconName> = {
  providers: 'pin',
  verification: 'info',
  distance: 'distance',
  cost_and_schedule: 'clock',
  scholarship: 'award',
  eligibility: 'clipboard',
  equipment: 'wrench',
  jobs: 'briefcase',
  alternatives: 'compass',
  missing_information: 'info',
}

interface PathwayReportProps {
  qualification: Qualification
  check: SubmittedCheck
  /** What the matches were asked with: the API works the report out again from it, as it does for feedback. */
  asked: { query: string; profile: Profile }
}

/**
 * The personalized report under the verdict: the ways forward, the units to work on and why, what else to weigh with
 * the options TESDA-TRACK lists, the next steps, and a summary. The API writes every sentence from the learner's own
 * answers, the catalog and the rankings; a section with nothing to say isn't shown.
 */
export function PathwayReport({ qualification, check, asked }: PathwayReportProps) {
  const en = useCopy()
  const copy = en.finder.pathway.report

  const place = useFinderStore((state) => state.place)
  const { learner } = useAuth()
  const headingId = useId()
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
  const report = useQuery({
    ...reportQuery(body, learner?.id ?? null),
    placeholderData: keepPreviousData,
  })
  const data = report.data

  return (
    <>
      <section aria-labelledby={headingId} className={cx(card, 'flex flex-col gap-4')}>
        <div className="flex flex-col gap-1">
          <p className={kicker}>{copy.kicker}</p>
          <h3 id={headingId} className="m-0 text-[1.3rem] leading-[1.25] text-navy">
            {copy.heading}
          </h3>
          <p className={muted}>{copy.lead}</p>
        </div>
        <PlaceFields />
        <div aria-live="polite" className="empty:hidden">
          {data && report.isPlaceholderData && <p className={muted}>{copy.updating}</p>}
        </div>
        {data ? (
          <Recommendations report={data} />
        ) : report.isError ? (
          <RequestFailed error={report.error} onRetry={() => void report.refetch()} />
        ) : (
          <p role="status" className={status}>
            {copy.loading}
          </p>
        )}
      </section>
      {data && (
        <>
          <Reasons report={data} />
          <Considerations report={data} qualification={qualification} />
          <NextSteps report={data} />
          <FinalCard report={data} />
        </>
      )}
    </>
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
      className="m-0 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(12rem,1fr))] items-end gap-3 rounded-12 border border-border px-[0.95rem] pt-1 pb-3"
    >
      <legend className="px-1 text-14 font-semibold text-navy">{copy.place.legend}</legend>
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
        'inline-flex items-center rounded-full px-2 py-[0.1rem] text-12 leading-[1.5] font-semibold',
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

/** A part of a card under its own heading. Only the cards are regions: a dozen landmarks would be noise. */
function Part({ title, icon, children }: { title: string; icon?: IconName; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-[0.6rem]">
      <h4 className={h4}>
        {icon && <Icon name={icon} className="flex-none text-[1.15rem] text-blue" />}
        {title}
      </h4>
      {children}
    </div>
  )
}

/** A. Training to consider, the skills to improve, and the competencies to learn or practice. */
function Recommendations({ report }: { report: Report }) {
  const en = useCopy()
  const copy = en.finder.pathway.report

  const recommended = report.training_to_consider.filter((option) => option.recommended)
  const others = report.training_to_consider.filter((option) => !option.recommended)
  return (
    <>
      {report.training_to_consider.length > 0 && (
        <Part title={copy.training} icon="route">
          <ul className="m-0 grid list-none gap-3 p-0">
            {recommended.map((option) => (
              <OptionItem key={option.kind} option={option} />
            ))}
          </ul>
          {others.length > 0 && (
            <>
              <p className="m-0 text-14 font-semibold text-ink">{copy.alsoConsider}</p>
              <ul className="m-0 grid list-none gap-3 p-0">
                {others.map((option) => (
                  <OptionItem key={option.kind} option={option} />
                ))}
              </ul>
            </>
          )}
        </Part>
      )}
      <Part title={copy.improve} icon="target">
        {report.skills_to_improve.length ? (
          <SkillList items={report.skills_to_improve} />
        ) : (
          <p className={muted}>{copy.noGaps}</p>
        )}
      </Part>
      {report.competencies_to_learn_or_practice.length > 0 && (
        <Part title={copy.learn} icon="checklist">
          <LearnList items={report.competencies_to_learn_or_practice} />
        </Part>
      )}
    </>
  )
}

function OptionItem({ option }: { option: Option }) {
  const en = useCopy()
  const copy = en.finder.pathway.report

  return (
    <li className={cx(box, option.recommended && 'border-blue bg-tint')}>
      {option.recommended && <Tag tone="info">{copy.recommended}</Tag>}
      <p className="mt-1 mb-1 text-15 font-semibold text-navy">{option.title}</p>
      <ul className={list}>
        {option.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </li>
  )
}

function SkillList({ items }: { items: Advice[] }) {
  const en = useCopy()
  const copy = en.finder.pathway.report

  const first = items.slice(0, FIRST_SKILLS)
  const rest = items.slice(FIRST_SKILLS)
  return (
    <>
      <ul className="m-0 grid list-none gap-3 p-0">
        {first.map((item) => (
          <SkillItem key={item.competency_id} item={item} />
        ))}
      </ul>
      {rest.length > 0 && (
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-15 font-semibold text-blue [&::-webkit-details-marker]:hidden">
            {copy.moreSkills(rest.length)}
            <Icon
              name="chevron"
              className="transition-transform duration-200 ease-[ease] group-open:rotate-180"
            />
          </summary>
          <ul className="m-0 mt-2 grid list-none gap-3 p-0">
            {rest.map((item) => (
              <SkillItem key={item.competency_id} item={item} />
            ))}
          </ul>
        </details>
      )}
    </>
  )
}

function SkillItem({ item }: { item: Advice }) {
  const en = useCopy()
  const copy = en.finder.pathway.report

  return (
    <li className={box}>
      <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-15 font-semibold text-navy">{item.name}</span>
        <Tag tone={PRIORITY_TONES[item.priority]}>{copy.priority[item.priority]}</Tag>
        <Tag>{copy.status[item.status]}</Tag>
      </p>
      <p className="mt-1 mb-0 text-14 leading-[1.55] text-ink">{item.why_it_matters}</p>
      <p className="mt-1 mb-0 text-14 leading-[1.55] text-muted">{item.relevance}</p>
      <details className="mt-1">
        <summary className="inline-flex min-h-11 cursor-pointer items-center text-14 font-semibold text-blue">
          {copy.how}
        </summary>
        <ul className={list}>
          {item.activities.map((activity) => (
            <li key={activity}>{activity}</li>
          ))}
        </ul>
      </details>
    </li>
  )
}

/** Grouped by what to do: learn, practice, then be ready to show. */
function LearnList({ items }: { items: Advice[] }) {
  const en = useCopy()
  const copy = en.finder.pathway.report

  const groups = (['learn', 'practice', 'demonstrate'] as const)
    .map((action) => [action, items.filter((item) => item.action === action)] as const)
    .filter(([, group]) => group.length > 0)
  return (
    <div className="flex flex-col gap-3">
      {groups.map(([action, group]) => (
        <div key={action}>
          <h5 className="mt-0 mb-1 text-14 font-bold text-navy">
            {copy.actions[action]} ({group.length})
          </h5>
          <ul className="m-0 grid list-none gap-2 p-0">
            {group.map((item) => (
              <li key={item.competency_id} className={box}>
                <p className="m-0 text-15 text-navy">{item.what_to_do}</p>
                <p className="mt-1 mb-0">
                  <Tag tone={item.must_learn ? 'warning' : 'neutral'}>{copy.basis[item.basis]}</Tag>
                </p>
                <details className="mt-1">
                  <summary className="inline-flex min-h-11 cursor-pointer items-center text-14 font-semibold text-blue">
                    {copy.evidence}
                  </summary>
                  <ul className={cx(list, 'text-muted')}>
                    {item.evidence.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

/** B. Why we recommend these: each part of the learner's data and what it means. */
function Reasons({ report }: { report: Report }) {
  const en = useCopy()
  const copy = en.finder.pathway.report

  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className={cx(card, 'flex flex-col gap-4')}>
      <h3 id={headingId} className={h3}>
        {copy.why}
      </h3>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 max-sm:grid-cols-1">
        {report.reasoning.map((reason) => (
          <Part
            key={reason.topic}
            title={copy.topics[reason.topic]}
            icon={TOPIC_ICONS[reason.topic]}
          >
            <p className="m-0 text-15 leading-[1.55] text-ink">{reason.summary}</p>
            {reason.points.length > 0 && (
              <ul className={list}>
                {reason.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            )}
          </Part>
        ))}
      </div>
    </section>
  )
}

/** C. Other things to consider, with the options the rankings found. */
function Considerations({
  report,
  qualification,
}: {
  report: Report
  qualification: Qualification
}) {
  const en = useCopy()
  const copy = en.finder.pathway.report

  const headingId = useId()
  const today = philippineDay(new Date())
  return (
    <section aria-labelledby={headingId} className={cx(card, 'flex flex-col gap-4')}>
      <h3 id={headingId} className={h3}>
        {copy.consider}
      </h3>
      <ul className="m-0 grid list-none gap-3 p-0">
        {report.considerations.map((item) => (
          <li key={item.topic} className="flex items-start gap-[0.7rem]">
            <Icon
              name={CONSIDER_ICONS[item.topic]}
              className="mt-[0.2rem] flex-none text-[1.15rem] text-blue"
            />
            <div className="min-w-0">
              <p className="m-0 text-15 leading-[1.55] text-ink">{item.text}</p>
              {!!item.items?.length && (
                <ul className={cx(list, 'mt-1')}>
                  {item.items.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ul>
      <Part title={copy.options} icon="pin">
        {report.providers.length ? (
          <ul className="m-0 grid list-none gap-3 p-0">
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
      </Part>
    </section>
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
    <li className={box}>
      <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Tag tone="info">{copy.kinds[provider.kind]}</Tag>
        <span className="text-15 font-semibold text-navy">{provider.name}</span>
        <Tag tone={STATUS_TONES[provider.status]}>{copy.statuses[provider.status]}</Tag>
      </p>
      {provider.title && <p className="mt-1 mb-0 text-14 text-ink">{provider.title}</p>}
      <p className="mt-1 mb-0 text-14 text-muted">{facts.join(' · ')}</p>
      {provider.notes.length > 0 && (
        <ul className={cx(list, 'mt-1 text-14 text-muted')}>
          {provider.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </li>
  )
}

/** D. Your next steps, in order: numbered as the curated pathway's steps are. */
function NextSteps({ report }: { report: Report }) {
  const en = useCopy()
  const copy = en.finder.pathway.report

  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className={card}>
      <h3 id={headingId} className={h3}>
        {copy.steps}
      </h3>
      <ol className="mt-[0.8rem] mb-0 grid list-none p-0">
        {report.next_steps.map((step) => (
          <li
            key={step.position}
            className="relative m-0 flex items-start gap-[0.85rem] pb-[0.9rem] not-last:before:absolute not-last:before:top-[34px] not-last:before:bottom-0.5 not-last:before:left-[15px] not-last:before:w-0.5 not-last:before:bg-line not-last:before:content-['']"
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
    </section>
  )
}

/** E. The summary, the next action, and what the report can't promise. */
function FinalCard({ report }: { report: Report }) {
  const en = useCopy()
  const copy = en.finder.pathway.report

  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className={cx(card, 'flex flex-col gap-3 border-blue')}>
      <h3 id={headingId} className={h3}>
        {copy.final}
      </h3>
      <p className="m-0 text-16 leading-[1.6] text-navy">{report.final.summary}</p>
      {report.final.next_action && (
        <p className="m-0 text-15 leading-[1.55] text-ink">
          <strong>{copy.nextAction}:</strong> {report.final.next_action}
        </p>
      )}
      <p className={muted}>{report.disclaimer}</p>
    </section>
  )
}
