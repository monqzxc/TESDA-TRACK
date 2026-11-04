import { useId } from 'react'
import { ProgressBar } from 'react-aria-components'
import { useCopy } from '../../i18n/copy.ts'
import { cssVars, cx } from '../../lib/style.ts'
import type { Certification, Enrollment, Goal, ReadinessCheck } from './api.ts'
import { ui } from './styles.ts'

interface Milestone {
  id: string
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
      title: copy.badges.qualifications.title,
      description: copy.badges.qualifications.description,
      current: savedQualifications.size,
      target: 3,
    },
    {
      id: 'steps',
      title: copy.badges.steps.title,
      description: copy.badges.steps.description,
      current: completedSteps,
      target: 5,
    },
    {
      id: 'pathway',
      title: copy.badges.pathway.title,
      description: copy.badges.pathway.description,
      current: completedPathways,
      target: 1,
    },
    {
      id: 'readiness',
      title: copy.badges.readiness.title,
      description: copy.badges.readiness.description,
      current: checks.length,
      target: 3,
    },
    {
      id: 'goal',
      title: copy.badges.goal.title,
      description: copy.badges.goal.description,
      current: achievedGoals,
      target: 1,
    },
    {
      id: 'certificate',
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
        <div className="min-w-0">
          <h2 id={headingId} className="m-0 text-20 leading-[1.3] text-navy">
            {copy.heading}
          </h2>
          <p className="mt-1 mb-0 text-15 text-muted">{copy.lead}</p>
        </div>
        <p className="m-0 text-15 font-semibold text-navy tabular-nums">
          {copy.earned(earned, milestones.length)}
        </p>
      </div>
      {/* One badge a row, split by rules: what it asks on the left, how far along on the right. Only an earned badge
          carries a mark. */}
      <ul className="m-0 list-none divide-y divide-rule rounded-16 border border-border bg-surface px-6 py-1 max-xs:px-4">
        {milestones.map((milestone) => {
          const isEarned = milestone.current >= milestone.target
          const progress = Math.min(milestone.current, milestone.target)
          const percent = (progress / milestone.target) * 100
          return (
            <li key={milestone.id}>
              <article
                aria-labelledby={`${headingId}-${milestone.id}`}
                className="flex min-w-0 flex-wrap items-center justify-between gap-x-8 gap-y-3 py-4"
              >
                <div className="min-w-0 flex-[1_1_18rem]">
                  <h3
                    id={`${headingId}-${milestone.id}`}
                    className="m-0 flex flex-wrap items-center gap-x-[0.6rem] gap-y-1 text-16 leading-snug text-navy"
                  >
                    {milestone.title}
                    <span
                      className={cx(
                        'flex-none rounded-full px-[0.55rem] py-[0.1rem] text-12 font-semibold',
                        isEarned ? 'bg-good-bg text-good-ink' : 'sr-only',
                      )}
                    >
                      {isEarned ? copy.earnedLabel : copy.inProgress}
                    </span>
                  </h3>
                  <p className={cx(ui.muted, 'mt-1')}>{milestone.description}</p>
                </div>
                <div className="flex w-56 flex-none items-center justify-end gap-3 text-14 max-xs:w-full max-xs:justify-start">
                  <ProgressBar
                    value={progress}
                    maxValue={milestone.target}
                    aria-label={`${milestone.title}: ${copy.count(progress, milestone.target)}`}
                    className="flex-1"
                  >
                    <span
                      className="block h-1.5 overflow-hidden rounded-full bg-bar"
                      aria-hidden="true"
                    >
                      <i
                        className={cx(
                          'block h-full rounded-full',
                          isEarned ? 'bg-navy' : 'bg-blue',
                        )}
                        style={cssVars(
                          { '--progress': percent },
                          { width: 'calc(var(--progress) * 1%)' },
                        )}
                      />
                    </span>
                  </ProgressBar>
                  <span
                    className={cx(
                      'w-12 flex-none text-right tabular-nums',
                      progress === 0 ? 'text-muted' : 'font-semibold text-navy',
                    )}
                  >
                    {copy.count(progress, milestone.target)}
                  </span>
                </div>
              </article>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 mb-0 max-w-[80ch] text-13 leading-relaxed text-muted">
        {copy.certificateNote}
      </p>
    </section>
  )
}
