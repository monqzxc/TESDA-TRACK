import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'
import { Button, ProgressBar } from 'react-aria-components'
import { Link, useNavigate } from 'react-router'
import { Icon } from '../../components/Icon.tsx'
import { ScoreRing } from '../../components/Meters.tsx'
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            id={headingId}
            ref={heading}
            tabIndex={-1}
            className="m-0 scroll-mt-24 text-24 text-navy focus:outline-none"
          >
            {copy.heading}
          </h2>
          <p className="mt-1 mb-0 text-15 text-muted">{copy.lead}</p>
        </div>
        <Link to={paths.qualifications} className={button()}>
          <Icon name="plus" />
          {copy.add}
        </Link>
      </div>
      <div aria-live="polite">
        {removed && <p className="mb-3 text-14 text-good-ink">{copy.removed}</p>}
      </div>
      <div
        className={cx(
          'grid items-stretch gap-4 max-sm:grid-cols-1',
          qualifications.length < 2 ? 'grid-cols-3 max-lg:grid-cols-2' : 'grid-cols-2',
        )}
      >
        <div
          className={cx(
            'flex min-w-0 gap-6 rounded-18 border border-banner-border bg-(image:--track-banner) p-6 max-sm:gap-4',
            qualifications.length < 2
              ? 'flex-col justify-between'
              : 'col-span-2 flex-row items-center max-sm:col-span-1',
          )}
        >
          <span className="grid size-12 place-items-center rounded-14 bg-surface text-blue">
            <Icon name="bookmark" size={24} />
          </span>
          <div>
            <p className="m-0 text-14 font-semibold text-ink">{copy.overview}</p>
            <p className="mt-2 mb-3 font-display text-[1.75rem] leading-tight font-bold text-navy">
              {copy.saved(qualifications.length)}
            </p>
            <p className="m-0 text-15 leading-relaxed text-ink max-sm:hidden">
              {copy.overviewBody}
            </p>
          </div>
        </div>
        {qualifications.length === 0 ? (
          <div className="flex flex-col items-start justify-center gap-3 rounded-18 border border-dashed border-dash bg-empty p-6 lg:col-span-2">
            <Icon name="target" size={32} className="text-blue" />
            <h3 className="m-0 text-20 text-navy">{copy.emptyHeading}</h3>
            <p className="m-0 max-w-lg text-15 leading-relaxed text-muted">{copy.empty}</p>
          </div>
        ) : (
          qualifications.map((group, index) => (
            <QualificationCard
              key={group.qualification.code}
              group={group}
              featured={index === 0}
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
  featured,
  wide,
  disabled,
  removing,
  failed,
  onRemove,
  onExplore,
  onViewPathway,
}: {
  group: SavedQualification
  featured: boolean
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
        'flex min-w-0 flex-col gap-5 rounded-18 border border-border bg-surface p-5',
        wide && 'lg:col-span-2',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 rounded-full bg-tint px-3 py-1 text-12 font-semibold text-blue">
          <Icon name="learn" />
          {qualification.sector}
        </span>
        <span
          className={cx(
            'rounded-full px-3 py-1 text-12 font-semibold',
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-[1_1_12rem]">
          <p className="mt-0 mb-1 text-12 font-semibold tracking-wide text-muted">
            {qualification.code}
          </p>
          <h3 id={headingId} className="m-0 text-20 leading-snug wrap-anywhere text-navy">
            {qualification.name}
          </h3>
          <p className="mt-2 mb-0 text-14 text-muted">
            {enrollment?.pathway.title ?? copy.noPathway}
          </p>
        </div>
        {featured && percent !== null && (
          <div className="max-sm:hidden">
            <ScoreRing score={percent} label={`${copy.checklist}: ${percent}%`} />
          </div>
        )}
      </div>
      {enrollment && percent !== null && (
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-14">
            <span className="font-semibold text-navy">{copy.checklist}</span>
            <strong className="text-blue">{percent}%</strong>
          </div>
          <ProgressBar value={percent} aria-label={`${qualification.name}: ${copy.checklist}`}>
            <span className="block h-2 overflow-hidden rounded-full bg-bar" aria-hidden="true">
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
      <div className="rounded-12 border border-panel-border bg-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="m-0 flex items-center gap-2 text-14 font-semibold text-navy">
            <Icon name="learn" className="text-blue" />
            {copy.training}
          </p>
          <span className="text-12 font-semibold text-muted">{copy.bsrsPending}</span>
        </div>
        <p className="mt-2 mb-0 text-13 leading-relaxed text-muted">{copy.bsrsHelp}</p>
      </div>
      <div className="mt-auto">
        <p className="mt-0 mb-1 text-12 font-semibold text-muted">{copy.next}</p>
        <p className="m-0 text-14 leading-relaxed text-navy">
          {enrollment
            ? (next?.title ?? (enrollment.steps.length ? copy.allDone : copy.noSteps))
            : copy.choosePathway}
        </p>
      </div>
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
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
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
