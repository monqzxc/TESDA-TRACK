import { Icon, type IconName } from '../../components/Icon.tsx'
import { useCopy } from '../../i18n/copy.ts'
import type {
  Application,
  Certification,
  Enrollment,
  Goal,
  ReadinessCheck,
  RecommendationSession,
} from './api.ts'
import { friendlyDate } from './ReadinessHistory.tsx'
import { ui } from './styles.ts'

interface ActivityEntry {
  id: string
  at: string
  icon: IconName
  label: string
  detail: string
}

/** A compact timeline built from the dates already attached to the learner's records. */
export function Activity({
  sessions,
  checks,
  enrollments,
  applications,
  goals,
  certifications,
}: {
  sessions: readonly RecommendationSession[]
  checks: readonly ReadinessCheck[]
  enrollments: readonly Enrollment[]
  applications: readonly Application[]
  goals: readonly Goal[]
  certifications: readonly Certification[]
}) {
  const copy = useCopy().progress.activity
  const entries: ActivityEntry[] = [
    ...sessions
      .filter((session) => session.query.trim().length > 0)
      .map((session) => ({
        id: `recommendation-${session.id}`,
        at: session.created_at,
        icon: 'lightbulb' as const,
        label: copy.types.recommendation,
        detail: session.query,
      })),
    ...checks.map((check) => ({
      id: `readiness-${check.id}`,
      at: check.created_at,
      icon: 'checklist' as const,
      label: copy.types.readiness,
      detail: check.qualification.name,
    })),
    ...enrollments.flatMap((enrollment) => [
      {
        id: `pathway-${enrollment.id}`,
        at: enrollment.created_at,
        icon: 'route' as const,
        label: copy.types.pathway,
        detail: enrollment.pathway.title,
      },
      ...(enrollment.updated_at > enrollment.created_at
        ? [
            {
              id: `pathway-update-${enrollment.id}`,
              at: enrollment.updated_at,
              icon: 'route' as const,
              label: copy.types.pathwayUpdated,
              detail: enrollment.pathway.title,
            },
          ]
        : []),
    ]),
    ...applications.flatMap((application) => [
      {
        id: `application-${application.id}`,
        at: application.created_at,
        icon: 'clipboard' as const,
        label: copy.types.application,
        detail: application.schedule.qualification.name,
      },
      ...(application.updated_at > application.created_at
        ? [
            {
              id: `application-update-${application.id}`,
              at: application.updated_at,
              icon: 'clipboard' as const,
              label: copy.types.applicationUpdated,
              detail: application.schedule.qualification.name,
            },
          ]
        : []),
    ]),
    ...goals.flatMap((goal) => [
      {
        id: `goal-${goal.id}`,
        at: goal.created_at,
        icon: 'target' as const,
        label: copy.types.goal,
        detail: goal.title,
      },
      ...(goal.updated_at > goal.created_at
        ? [
            {
              id: `goal-update-${goal.id}`,
              at: goal.updated_at,
              icon: 'target' as const,
              label: copy.types.goalUpdated,
              detail: goal.title,
            },
          ]
        : []),
    ]),
    ...certifications.map((certification) => ({
      id: `certification-${certification.id}`,
      at: certification.created_at,
      icon: 'award' as const,
      label: copy.types.certification,
      detail: certification.title,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 12)

  return (
    <section data-tour="profile-activity" aria-labelledby="progress-activity-heading" className={ui.card}>
      <h2 id="progress-activity-heading" className={ui.sectionHeading}>
        {copy.heading}
      </h2>
      <p className={ui.muted}>{copy.lead}</p>
      {entries.length === 0 ? (
        <p className={ui.empty}>{copy.empty}</p>
      ) : (
        <ol className="mt-4 mb-0 flex list-none flex-col p-0">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex gap-3 border-b border-rule py-3 last:border-b-0"
            >
              <span
                className="grid size-9 shrink-0 place-items-center rounded-full bg-tint text-blue"
                aria-hidden="true"
              >
                <Icon name={entry.icon} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="m-0 text-14 font-semibold text-navy">{entry.label}</p>
                <p className="mt-1 mb-0 text-14 wrap-anywhere text-ink">{entry.detail}</p>
              </div>
              <time
                className="shrink-0 text-12 text-muted max-sm:self-start"
                dateTime={entry.at}
              >
                {friendlyDate(entry.at)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
