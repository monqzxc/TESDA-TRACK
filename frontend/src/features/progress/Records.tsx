import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { Button, ProgressBar } from 'react-aria-components'
import { Link, useNavigate } from 'react-router'
import { failureMessage } from '../../auth/fields.tsx'
import { useAuth } from '../../auth/useAuth.ts'
import { CheckboxRow } from '../../components/CheckboxRow.tsx'
import { Icon } from '../../components/Icon.tsx'
import { ModalDialog } from '../../components/ModalDialog.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cssVars, cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'
import { button } from '../../styles/buttons.ts'
import { localTime } from '../training/format.ts'
import {
  progressKeys,
  setStepStatus,
  withdrawApplication,
  type Application,
  type Enrollment,
  type RecommendationSession,
} from './api.ts'
import { pathwayHeadingId, SECTION_IDS } from './ContinueCard.tsx'
import { sessionQualification } from './journey.ts'
import { friendlyDate } from './ReadinessHistory.tsx'
import { resumeSession } from './resume.ts'
import { ui } from './styles.ts'

/** The learner's saved recommendations, newest first, each reopening in Find my pathway (US-10). */
export function RecommendationHistory({
  sessions,
  catalog,
}: {
  sessions: readonly RecommendationSession[]
  catalog: ReadonlySet<string>
}) {
  const en = useCopy()
  const copy = en.progress

  const { learner } = useAuth()
  const navigate = useNavigate()
  const headingId = useId()
  const history = sessions
    .filter((session) => typeof session.query === 'string' && session.query.trim().length > 0)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

  // History belongs to inputs the learner has actually submitted, so there is no empty panel to display.
  if (history.length === 0) return null

  return (
    <section data-tour="progress-history" aria-labelledby={headingId} className={ui.card}>
      <h2 id={headingId} className={ui.sectionHeading}>
        {copy.history.heading}
      </h2>
      <ul className={ui.records}>
        {history.map((session) => {
          const qualification = sessionQualification(session)
          const route = session.pathway?.recommendation
          const details = [
            ...(qualification ? [qualification.name] : []),
            ...(route ? [copy.history.routes[route]] : []),
          ]
          const missing = qualification !== null && !catalog.has(qualification.code)
          return (
            <li key={session.id} className={ui.record}>
              <div className={ui.recordBody}>
                <p className="m-0 text-12 text-muted">{friendlyDate(session.created_at)}</p>
                {/* The goal as the learner typed it, as text. */}
                <p className={ui.recordTitle}>{session.query}</p>
                <p className={ui.muted}>{details.join(' · ') || copy.history.noQualification}</p>
                {missing && (
                  <p className={ui.note}>
                    {copy.continue.unavailable}{' '}
                    <Link to={paths.qualifications}>{en.finder.matches.viewAll}</Link>
                  </p>
                )}
              </div>
              <Button
                className={button({ variant: 'tertiary' })}
                aria-label={`${copy.history.open}: ${session.query}`}
                onPress={() => {
                  if (!learner) return
                  resumeSession(session, learner.id)
                  void navigate(paths.finderMatches)
                }}
              >
                {copy.history.open}
                <Icon name="arrowRight" />
              </Button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** The pathways the learner follows, each step ticked off as they go. Completed ones stay, as achievements. */
export function Pathways({ enrollments }: { enrollments: readonly Enrollment[] }) {
  const en = useCopy()
  const copy = en.progress

  const shown = enrollments.filter((enrollment) => enrollment.status !== 'withdrawn')
  return (
    <section aria-labelledby={SECTION_IDS.pathways} className={ui.card}>
      <h2 id={SECTION_IDS.pathways} tabIndex={-1} className={ui.sectionHeading}>
        {copy.pathways.heading}
      </h2>
      {shown.length === 0 ? (
        <p className={ui.empty}>{copy.pathways.empty}</p>
      ) : (
        <ul className={ui.records}>
          {shown.map((enrollment) => (
            <li key={enrollment.id}>
              <PathwayCard enrollment={enrollment} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function PathwayCard({ enrollment }: { enrollment: Enrollment }) {
  const en = useCopy()
  const copy = en.progress

  const queryClient = useQueryClient()
  const headingId = pathwayHeadingId(enrollment.id)
  const update = useMutation({
    mutationFn: ({ stepId, done }: { stepId: number; done: boolean }) =>
      setStepStatus(enrollment.id, stepId, done ? 'completed' : 'not_started'),
    // The API's answer has the new completion and status: it replaces this pathway's record.
    onSuccess: (updated) =>
      queryClient.setQueryData<Enrollment[]>(progressKeys.pathways, (current) =>
        current?.map((item) => (item.id === updated.id ? updated : item)),
      ),
  })
  const completed = enrollment.status === 'completed'
  return (
    <article
      aria-labelledby={headingId}
      className="flex flex-col items-stretch gap-[0.35rem] rounded-12 border border-border px-[0.95rem] py-[0.85rem]"
    >
      <h3
        id={headingId}
        tabIndex={-1}
        className={cx(ui.recordTitle, 'scroll-mt-4 focus:outline-none max-md:scroll-mt-24')}
      >
        {enrollment.pathway.title}
        {completed && (
          <span className="inline-flex items-center gap-[0.3rem] rounded-full bg-good-bg px-[0.55rem] py-[0.15rem] text-12 font-[650] text-good-ink">
            <Icon name="award" />
            {copy.pathways.completed}
          </span>
        )}
      </h3>
      <p className={ui.muted}>
        {enrollment.pathway.qualification.name} ·{' '}
        {copy.pathways.complete(enrollment.completion_percent)}
      </p>
      <ProgressBar
        value={enrollment.completion_percent}
        aria-label={copy.pathways.complete(enrollment.completion_percent)}
      >
        <span className={cx(ui.bar, 'w-full')} aria-hidden="true">
          <i className={ui.barFill} style={cssVars({ '--score': enrollment.completion_percent })} />
        </span>
      </ProgressBar>
      <ul className="mt-[0.3rem] mb-0 flex list-none flex-col gap-[0.2rem] p-0">
        {enrollment.steps.map((step) => (
          <li key={step.id}>
            <CheckboxRow
              isSelected={step.status === 'completed'}
              isDisabled={update.isPending}
              onChange={(done) => update.mutate({ stepId: step.id, done })}
            >
              {step.position}. {step.title}
            </CheckboxRow>
          </li>
        ))}
      </ul>
      {update.isError && (
        <p role="alert" className={ui.note}>
          {copy.pathways.failed}
        </p>
      )}
    </article>
  )
}

const STATUS_TONES: Record<Application['status'], string> = {
  pending: 'bg-warn-bg text-warn-ink',
  approved: 'bg-good-bg text-good-ink',
  rejected: 'bg-warn-bg text-warn-ink',
  withdrawn: 'bg-chip text-ink',
  completed: 'bg-tint text-blue',
}

/** The learner's assessment applications, with their status and a withdrawal they confirm (US-09). */
export function Applications({ applications }: { applications: readonly Application[] }) {
  const en = useCopy()
  const copy = en.progress

  const [withdrawing, setWithdrawing] = useState<Application | null>(null)
  const [withdrawn, setWithdrawn] = useState(false)
  return (
    <section aria-labelledby={SECTION_IDS.applications} className={ui.card}>
      <h2 id={SECTION_IDS.applications} tabIndex={-1} className={ui.sectionHeading}>
        {copy.applications.heading}
      </h2>
      <div aria-live="polite">
        {withdrawn && (
          <p className="mt-0 mb-[0.6rem] rounded-10 bg-good-bg px-3 py-[0.55rem] text-14 font-semibold text-good-ink">
            {copy.applications.withdrawn}
          </p>
        )}
      </div>
      {applications.length === 0 ? (
        <p className={ui.empty}>{copy.applications.empty}</p>
      ) : (
        <ul className={ui.records}>
          {applications.map((application) => {
            const { schedule, status, result } = application
            return (
              <li
                key={application.id}
                className="flex flex-col items-start gap-[0.35rem] rounded-12 border border-border px-[0.95rem] py-[0.85rem]"
              >
                <span
                  className={cx(
                    'rounded-full px-[0.6rem] py-[0.15rem] text-12 font-[650]',
                    STATUS_TONES[status],
                  )}
                >
                  {en.training.apply.statuses[status]}
                </span>
                <p className={ui.recordTitle}>
                  {schedule.qualification.name} · {localTime(schedule.scheduled_at)}
                </p>
                <p className={ui.muted}>
                  {[
                    schedule.center.name,
                    ...(result ? [copy.applications.results[result]] : []),
                  ].join(' · ')}
                </p>
                {application.reviewer_note && (
                  <p className={ui.note}>{application.reviewer_note}</p>
                )}
                {(status === 'pending' || status === 'approved') && (
                  <Button
                    className={cx(button({ height: 38 }), 'mt-[0.2rem]')}
                    onPress={() => {
                      setWithdrawn(false)
                      setWithdrawing(application)
                    }}
                  >
                    {copy.applications.withdraw}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {withdrawing && (
        <WithdrawDialog
          application={withdrawing}
          onClose={() => setWithdrawing(null)}
          onWithdrawn={() => {
            setWithdrawing(null)
            setWithdrawn(true)
          }}
        />
      )}
    </section>
  )
}

/** Asks the learner to confirm the specific application, then withdraws it and shows its actual status. */
function WithdrawDialog({
  application,
  onClose,
  onWithdrawn,
}: {
  application: Application
  onClose: () => void
  onWithdrawn: () => void
}) {
  const en = useCopy()
  const copy = en.progress

  const queryClient = useQueryClient()
  const withdraw = useMutation({
    mutationFn: () => withdrawApplication(application.id),
    onSuccess: (updated) => {
      queryClient.setQueryData<Application[]>(progressKeys.applications, (current) =>
        current?.map((item) => (item.id === updated.id ? updated : item)),
      )
      // Seats changed.
      void queryClient.invalidateQueries({ queryKey: ['training', 'listings'] })
      onWithdrawn()
    },
  })
  const { schedule } = application
  return (
    <ModalDialog
      isOpen
      onOpenChange={(isOpen) => !isOpen && onClose()}
      title={copy.applications.confirmHeading}
      closeLabel={en.account.close}
      isPending={withdraw.isPending}
      role="alertdialog"
    >
      <p className={ui.recordTitle}>
        {schedule.qualification.name} · {localTime(schedule.scheduled_at)}
      </p>
      <p className={ui.muted}>{schedule.center.name}</p>
      <p className="mt-[0.6rem] mb-4 text-15 leading-[1.6] text-ink">
        {copy.applications.confirmBody}
      </p>
      {withdraw.isError && (
        <p role="alert" className={ui.note}>
          {failureMessage(withdraw.error)}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-[0.6rem]">
        <Button slot="close" className={button()} isDisabled={withdraw.isPending}>
          {copy.applications.keep}
        </Button>
        <Button
          className={button({ variant: 'primary' })}
          isPending={withdraw.isPending}
          onPress={() => withdraw.mutate()}
        >
          {withdraw.isPending ? copy.applications.withdrawing : copy.applications.confirm}
        </Button>
      </div>
    </ModalDialog>
  )
}
