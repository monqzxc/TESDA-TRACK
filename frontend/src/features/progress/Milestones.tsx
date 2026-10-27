import { useId } from 'react'
import { ProgressBar } from 'react-aria-components'
import { Icon, type IconName } from '../../components/Icon.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cssVars, cx } from '../../lib/style.ts'
import type { Certification, Enrollment, Goal, ReadinessCheck } from './api.ts'
import { ui } from './styles.ts'

interface Milestone {
  id: string
  icon: IconName
  title: string
  description: string
  current: number
  target: number
}

/** Badges are calculated from the learner's saved records; they are not separate profile claims. */
export function Milestones({
  enrollments,
  checks,
  goals,
  certifications,
}: {
  enrollments: readonly Enrollment[]
  checks: readonly ReadinessCheck[]
  goals: readonly Goal[]
  certifications: readonly Certification[]
}) {
  const copy = useCopy().progress.milestones
  const headingId = useId()
  const savedQualifications = new Set([
    ...enrollments.map((enrollment) => enrollment.pathway.qualification.code),
    ...goals.flatMap((goal) => (goal.target_qualification ? [goal.target_qualification.code] : [])),
  ])
  const completedSteps = enrollments.reduce(
    (total, enrollment) =>
      total + enrollment.steps.filter((step) => step.status === 'completed').length,
    0,
  )
  const completedPathways = enrollments.filter(
    (enrollment) => enrollment.status === 'completed' || enrollment.completed_at !== null,
  ).length
  const achievedGoals = goals.filter((goal) => goal.status === 'achieved').length

  const milestones: Milestone[] = [
    {
      id: 'qualifications',
      icon: 'learn',
      title: copy.badges.qualifications.title,
      description: copy.badges.qualifications.description,
      current: savedQualifications.size,
      target: 3,
    },
    {
      id: 'steps',
      icon: 'checklist',
      title: copy.badges.steps.title,
      description: copy.badges.steps.description,
      current: completedSteps,
      target: 5,
    },
    {
      id: 'pathway',
      icon: 'route',
      title: copy.badges.pathway.title,
      description: copy.badges.pathway.description,
      current: completedPathways,
      target: 1,
    },
    {
      id: 'readiness',
      icon: 'growth',
      title: copy.badges.readiness.title,
      description: copy.badges.readiness.description,
      current: checks.length,
      target: 3,
    },
    {
      id: 'goal',
      icon: 'target',
      title: copy.badges.goal.title,
      description: copy.badges.goal.description,
      current: achievedGoals,
      target: 1,
    },
    {
      id: 'certificate',
      icon: 'award',
      title: copy.badges.certificate.title,
      description: copy.badges.certificate.description,
      current: certifications.length,
      target: 1,
    },
  ]
  const earned = milestones.filter((milestone) => milestone.current >= milestone.target).length

  return (
    <section data-tour="progress-milestones" aria-labelledby={headingId}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id={headingId} className="m-0 text-24 text-navy">
            {copy.heading}
          </h2>
          <p className="mt-1 mb-0 text-15 text-muted">{copy.lead}</p>
        </div>
        <p className="m-0 rounded-full bg-tint px-3 py-2 text-14 font-semibold text-blue">
          {copy.earned(earned, milestones.length)}
        </p>
      </div>
      <div className="grid grid-cols-2 items-stretch gap-4 max-md:grid-cols-1">
        {milestones.map((milestone) => {
          const isEarned = milestone.current >= milestone.target
          const progress = Math.min(milestone.current, milestone.target)
          const percent = (progress / milestone.target) * 100
          return (
            <article
              key={milestone.id}
              aria-labelledby={`${headingId}-${milestone.id}`}
              className={cx(
                'flex min-w-0 gap-4 rounded-16 border bg-surface p-5',
                isEarned ? 'border-good-bg' : 'border-border',
              )}
            >
              <span
                className={cx(
                  'grid size-12 shrink-0 place-items-center rounded-full',
                  isEarned ? 'bg-good-bg text-good-ink' : 'bg-chip text-muted',
                )}
                aria-hidden="true"
              >
                <Icon name={milestone.icon} size={24} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3
                    id={`${headingId}-${milestone.id}`}
                    className="m-0 text-18 leading-snug text-navy"
                  >
                    {milestone.title}
                  </h3>
                  <span
                    className={cx(
                      'rounded-full px-2.5 py-1 text-12 font-semibold',
                      isEarned ? 'bg-good-bg text-good-ink' : 'bg-chip text-muted',
                    )}
                  >
                    {isEarned ? copy.earnedLabel : copy.inProgress}
                  </span>
                </div>
                <p className={cx(ui.muted, 'mt-2')}>{milestone.description}</p>
                <div className="mt-3 flex items-center justify-between gap-3 text-13 text-muted">
                  <span>{copy.count(progress, milestone.target)}</span>
                  <ProgressBar
                    value={progress}
                    maxValue={milestone.target}
                    aria-label={`${milestone.title}: ${copy.count(progress, milestone.target)}`}
                    className="w-28 shrink-0"
                  >
                    <span
                      className="block h-2 overflow-hidden rounded-full bg-bar"
                      aria-hidden="true"
                    >
                      <i
                        className="block h-full rounded-full bg-blue"
                        style={cssVars(
                          { '--progress': percent },
                          { width: 'calc(var(--progress) * 1%)' },
                        )}
                      />
                    </span>
                  </ProgressBar>
                </div>
              </div>
            </article>
          )
        })}
      </div>
      <p className="mt-4 mb-0 rounded-12 border border-border bg-surface px-4 py-3 text-13 leading-relaxed text-muted">
        {copy.certificateNote}
      </p>
    </section>
  )
}
