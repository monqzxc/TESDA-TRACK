import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'
import { Button, ProgressBar } from 'react-aria-components'
import { Link, useNavigate } from 'react-router'
import { Icon } from '../../components/Icon.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cssVars, cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'
import { button } from '../../styles/buttons.ts'
import { useFinderStore } from '../finder/store.ts'
import { progressKeys, setGoalStatus, setPathwayStatus, type Enrollment, type Goal } from './api.ts'
import { goToSection, pathwayHeadingId } from './ContinueCard.tsx'

interface SavedQualification {
  qualification: NonNullable<Goal['target_qualification']>
  enrollments: Enrollment[]
  goals: Goal[]
  savedAt: string
}

/** Explicit qualification goals and saved pathways share one collection, grouped by catalog code. */
export function QualificationGoals({
  enrollments,
  goals,
  onViewPathway,
}: {
  enrollments: readonly Enrollment[]
  goals: readonly Goal[]
  onViewPathway?: (enrollmentId: string) => void
}) {
  const en = useCopy()
  const copy = en.progress.qualifications
  const navigate = useNavigate()
  const headingId = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const queryClient = useQueryClient()
  const [removed, setRemoved] = useState(false)
  const saved = enrollments
    .filter((enrollment) => enrollment.status !== 'withdrawn')
    .toSorted(
      (a, b) =>
        Number(a.status === 'completed') - Number(b.status === 'completed') ||
        b.created_at.localeCompare(a.created_at),
    )
  const byQualification = new Map<string, SavedQualification>()
  for (const enrollment of saved) {
    const qualification = enrollment.pathway.qualification
    const group = byQualification.get(qualification.code) ?? {
      qualification,
      enrollments: [],
      goals: [],
      savedAt: enrollment.created_at,
    }
    group.enrollments.push(enrollment)
    if (enrollment.created_at > group.savedAt) group.savedAt = enrollment.created_at
    byQualification.set(qualification.code, group)
  }
  for (const goal of goals) {
    if (goal.status === 'archived' || !goal.target_qualification) continue
    const qualification = goal.target_qualification
    const group = byQualification.get(qualification.code) ?? {
      qualification,
      enrollments: [],
      goals: [],
      savedAt: goal.created_at,
    }
    group.goals.push(goal)
    if (goal.created_at > group.savedAt) group.savedAt = goal.created_at
    byQualification.set(qualification.code, group)
  }
  const qualifications = [...byQualification.values()].sort((a, b) =>
    b.savedAt.localeCompare(a.savedAt),
  )
  const remove = useMutation({
    mutationFn: async (group: SavedQualification) => {
      const results = await Promise.allSettled([
        ...group.enrollments.map(async (enrollment) => {
          const updated = await setPathwayStatus(enrollment.id, 'withdrawn')
          queryClient.setQueryData<Enrollment[]>(progressKeys.pathways, (current) =>
            current?.map((item) => (item.id === updated.id ? updated : item)),
          )
        }),
        ...group.goals.map(async (goal) => {
          const updated = await setGoalStatus(goal.id, 'archived')
          queryClient.setQueryData<Goal[]>(progressKeys.goals, (current) =>
            current?.map((item) => (item.id === updated.id ? updated : item)),
          )
        }),
      ])
      if (results.some((result) => result.status === 'rejected')) throw new Error('Removal failed')
    },
    onSuccess: () => {
      setRemoved(true)
      heading.current?.focus()
    },
  })

  return (
    <section data-tour="progress-qualifications" aria-labelledby={headingId}>
      {/* The heading, its count and Add on one row: the count is the collection's size, not a block of its own. */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2
            id={headingId}
            ref={heading}
            tabIndex={-1}
            className="m-0 scroll-mt-24 text-20 leading-[1.3] text-navy focus:outline-none"
          >
            {copy.heading}
          </h2>
          <p className="mt-1 mb-0 text-15 text-muted">
            <span className="font-semibold text-navy tabular-nums">
              {copy.saved(qualifications.length)}
            </span>
            <span aria-hidden="true"> · </span>
            {copy.lead}
          </p>
        </div>
        <Link to={paths.qualifications} className={button()}>
          <Icon name="plus" />
          {copy.add}
        </Link>
      </div>
      <div aria-live="polite">
        {removed && <p className="mb-3 text-14 text-good-ink">{copy.removed}</p>}
      </div>
      <div className="grid grid-cols-2 items-stretch gap-4 max-lg:grid-cols-1">
        {qualifications.length === 0 ? (
          <div className="col-span-full flex flex-col items-start gap-2 rounded-16 border border-dashed border-dash bg-empty px-6 py-5">
            <h3 className="m-0 text-18 text-navy">{copy.emptyHeading}</h3>
            <p className="m-0 max-w-[60ch] text-15 leading-relaxed text-muted">{copy.empty}</p>
          </div>
        ) : (
          qualifications.map((group, index) => (
            <QualificationCard
              key={group.qualification.code}
              group={group}
              wide={
                qualifications.length === 1 ||
                (qualifications.length > 1 &&
                  qualifications.length % 2 === 1 &&
                  index === qualifications.length - 1)
              }
              disabled={remove.isPending}
              removing={
                remove.isPending &&
                remove.variables?.qualification.code === group.qualification.code
              }
              failed={
                remove.isError && remove.variables?.qualification.code === group.qualification.code
              }
              onExplore={() => {
                useFinderStore
                  .getState()
                  .startWithGoal(en.library.exploreGoal(group.qualification.name))
                void navigate(paths.finder)
              }}
              onViewPathway={onViewPathway ?? ((id) => goToSection(pathwayHeadingId(id)))}
              onRemove={() => {
                setRemoved(false)
                remove.mutate(group)
              }}
            />
          ))
        )}
      </div>
    </section>
  )
}

function QualificationCard({
  group,
  wide,
  disabled,
  removing,
  failed,
  onRemove,
  onExplore,
  onViewPathway,
}: {
  group: SavedQualification
  wide: boolean
  disabled: boolean
  removing: boolean
  failed: boolean
  onRemove: () => void
  onExplore: () => void
  onViewPathway: (enrollmentId: string) => void
}) {
  const copy = useCopy().progress.qualifications
  const headingId = useId()
  const { qualification } = group
  const enrollment = group.enrollments[0]
  const otherPathways = group.enrollments.slice(1)
  const done = enrollment?.steps.filter((step) => step.status === 'completed').length ?? 0
  const next = enrollment?.steps.find((step) => step.status !== 'completed')
  const percent = enrollment
    ? Math.round(Math.min(100, Math.max(0, enrollment.completion_percent)))
    : null
  const completed = enrollment?.status === 'completed'
  const goalAchieved = !enrollment && group.goals.every((goal) => goal.status === 'achieved')

  return (
    <article
      aria-labelledby={headingId}
      className={cx(
        'flex min-w-0 flex-col gap-5 rounded-16 border border-border bg-surface p-6 max-xs:p-4',
        wide && 'col-span-full',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-[1_1_14rem]">
          <h3 id={headingId} className="m-0 text-20 leading-snug wrap-anywhere text-navy">
            {qualification.name}
          </h3>
          <p className="mt-1 mb-0 text-14 text-muted">
            {qualification.sector} · {qualification.code}
          </p>
          <p className="mt-[0.15rem] mb-0 text-14 text-ink">
            {enrollment?.pathway.title ?? copy.noPathway}
          </p>
        </div>
        <span
          className={cx(
            'flex-none rounded-full px-[0.6rem] py-[0.15rem] text-12 font-semibold whitespace-nowrap',
            completed || goalAchieved ? 'bg-good-bg text-good-ink' : 'bg-chip text-ink',
          )}
        >
          {enrollment
            ? completed
              ? copy.completed
              : copy.active
            : goalAchieved
              ? copy.goalAchieved
              : copy.savedGoal}
        </span>
      </div>
      {enrollment && percent !== null && (
        <div>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-14">
            <span className="text-muted">{copy.checklist}</span>
            <strong className="font-display text-24 leading-none font-semibold text-navy tabular-nums">
              {percent}%
            </strong>
          </div>
          <ProgressBar value={percent} aria-label={`${qualification.name}: ${copy.checklist}`}>
            <span className="block h-1.5 overflow-hidden rounded-full bg-bar" aria-hidden="true">
              <i
                className="block h-full w-[calc(var(--score)*1%)] rounded-full bg-blue"
                style={cssVars({ '--score': percent })}
              />
            </span>
          </ProgressBar>
          <p className="mt-2 mb-0 text-13 text-muted">
            {copy.steps(done, enrollment.steps.length)} · {copy.checklistHelp}
          </p>
        </div>
      )}
      {/* Label over value, a rule between: the next step, then training records (not connected yet). */}
      <dl className="m-0 divide-y divide-rule border-y border-rule text-14">
        <div className="py-3">
          <dt className="text-13 text-muted">{copy.next}</dt>
          <dd className="mt-[0.15rem] mb-0 ml-0 leading-relaxed font-semibold text-navy">
            {enrollment
              ? (next?.title ?? (enrollment.steps.length ? copy.allDone : copy.noSteps))
              : copy.choosePathway}
          </dd>
        </div>
        <div className="py-3">
          <dt className="text-13 text-muted">{copy.training}</dt>
          <dd className="mt-[0.15rem] mb-0 ml-0 leading-relaxed text-ink">
            <span>{copy.bsrsPending}</span>
            <span className="block text-13 text-muted">{copy.bsrsHelp}</span>
          </dd>
        </div>
      </dl>
      {otherPathways.length > 0 && (
        <div>
          <p className="mt-0 mb-1 text-12 font-semibold text-muted">{copy.otherPathways}</p>
          <ul className="m-0 list-none p-0">
            {otherPathways.map((pathway) => (
              <li key={pathway.id}>
                <Button
                  className={cx(button({ variant: 'tertiary', height: 44 }), 'text-left')}
                  onPress={() => onViewPathway(pathway.id)}
                >
                  {pathway.pathway.title} · {pathway.completion_percent}%
                  <Icon name="arrowRight" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        <Button
          className={button({ height: 44 })}
          onPress={() => (enrollment ? onViewPathway(enrollment.id) : onExplore())}
        >
          {enrollment ? copy.view : copy.explore}
          <Icon name="arrowRight" />
        </Button>
        <Button
          className={button({ variant: 'tertiary', height: 44 })}
          aria-label={`${copy.remove}: ${qualification.name}`}
          isPending={removing}
          isDisabled={disabled}
          onPress={onRemove}
        >
          {removing ? copy.removing : copy.remove}
        </Button>
      </div>
      {failed && (
        <p role="alert" className="m-0 text-14 text-warn-ink">
          {copy.removeFailed}
        </p>
      )}
    </article>
  )
}
