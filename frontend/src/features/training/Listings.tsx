import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { Button } from 'react-aria-components'
import { Link } from 'react-router'
import { failureMessage } from '../../auth/fields.tsx'
import { useRequireAccount } from '../../auth/useAuth.ts'
import { Icon } from '../../components/Icon.tsx'
import { ModalDialog } from '../../components/ModalDialog.tsx'
import { tradePhoto } from '../../components/QualificationMedia.tsx'
import centerPhoto from '../../components/img/center-thumb.jpg'
import { en } from '../../copy/en.ts'
import { cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'
import buttons from '../../styles/buttons.module.css'
import { applyForAssessment, type Application, type ProgramFit } from './api.ts'
import { friendlyDay, placeLabel, type Center, type Program, type Schedule } from './centers.ts'
import { deliveryLabel, localTime, programCost, programFacts, scheduleFee } from './format.ts'
import { canReviewApplication, evidenceMessages } from './evidence.ts'
import styles from './Listings.module.css'

const copy = en.training

/** Listings shown under a center before View all (classic/training_view.py PREVIEW). */
const PREVIEW = 2

export type Fits = ReadonlyMap<number, ProgramFit>

function ServiceEvidence({ service }: { service: Program | Schedule }) {
  return evidenceMessages(service).map((message) => (
    <p key={message} className={styles.muted}>
      {message}
    </p>
  ))
}

/** The trade's photo when the listing is for one, the center's otherwise. Decoration: the text names it. */
function listingPhoto(listing: Program | Schedule): string {
  const text = `${'title' in listing ? listing.title : ''} ${listing.qualification.name}`
  return tradePhoto(text, 'thumb') ?? centerPhoto
}

/** A center's training programs, soonest first, two until View all. */
export function Programs({ center, fits, today }: { center: Center; fits: Fits; today: string }) {
  const [all, setAll] = useState(false)
  const [open, setOpen] = useState<Program | null>(null)
  const headingId = useId()
  const programs = [...center.programs].sort(
    (a, b) =>
      (a.start_date ?? '9999').localeCompare(b.start_date ?? '9999') ||
      a.title.localeCompare(b.title),
  )
  return (
    <section aria-labelledby={headingId} className={styles.listings}>
      <ListingsHead
        id={headingId}
        title={copy.programs.heading(programs.length)}
        count={programs.length}
        all={all}
        onToggle={() => setAll(!all)}
      />
      {programs.length === 0 && <p className={styles.muted}>{copy.programs.none}</p>}
      <ul className={styles.cards}>
        {(all ? programs : programs.slice(0, PREVIEW)).map((program) => (
          <li key={program.id}>
            <ProgramCard
              program={program}
              fit={fits.get(program.id)}
              today={today}
              onOpen={() => setOpen(program)}
            />
          </li>
        ))}
      </ul>
      {open && (
        <ProgramDialog
          program={open}
          center={center}
          fit={fits.get(open.id)}
          today={today}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  )
}

function ListingsHead({
  id,
  title,
  count,
  all,
  onToggle,
}: {
  id: string
  title: string
  count: number
  all: boolean
  onToggle: () => void
}) {
  return (
    <div className={styles.head}>
      <h3 id={id}>{title}</h3>
      {count > PREVIEW && (
        <Button className={cx(buttons.button, buttons.tertiary)} onPress={onToggle}>
          {all ? copy.programs.fewer : copy.programs.viewAll}
        </Button>
      )}
    </div>
  )
}

function ProgramCard({
  program,
  fit,
  today,
  onOpen,
}: {
  program: Program
  fit?: ProgramFit
  today: string
  onOpen: () => void
}) {
  const headingId = useId()
  const qualification = program.qualification.name
  return (
    <article className={styles.card} aria-labelledby={headingId}>
      <img className={styles.photo} src={listingPhoto(program)} alt="" loading="lazy" />
      <div className={styles.body}>
        <h4 id={headingId}>{program.title}</h4>
        {!program.title
          .toLocaleLowerCase('en-US')
          .includes(qualification.toLocaleLowerCase('en-US')) && (
          <p className={styles.muted}>{qualification}</p>
        )}
        <p className={styles.facts}>{programFacts(program, today).join(' • ')}</p>
        <ServiceEvidence service={program} />
        {(fit || program.scholarship_available) && (
          <p className={styles.badges}>
            {fit?.score !== undefined && (
              <span className={styles.fit}>
                <Icon name="sparkle" />
                {copy.programs.fit(fit.score)}
              </span>
            )}
            {program.scholarship_available && (
              <span className={styles.scholarship}>
                <Icon name="check" />
                {copy.programs.scholarship}
              </span>
            )}
          </p>
        )}
        {fit && fit.explanation.length > 0 && (
          <details className={styles.why}>
            <summary>
              <Icon name="info" />
              {fit.score === undefined ? 'Service verification' : copy.programs.why}
            </summary>
            <ul>
              {fit.explanation.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <p className={styles.muted}>{copy.programs.whyNote}</p>
          </details>
        )}
        <Button className={cx(buttons.button, buttons.tertiary, styles.open)} onPress={onOpen}>
          {copy.programs.details}
          <Icon name="arrowRight" />
        </Button>
      </div>
    </article>
  )
}

/** A program in full (classic/training_view.py _program_dialog). */
function ProgramDialog({
  program,
  center,
  fit,
  today,
  onClose,
}: {
  program: Program
  center: Center
  fit?: ProgramFit
  today: string
  onClose: () => void
}) {
  const facts = copy.program
  const rows: [string, string | null][] = [
    [facts.where, `${center.name}, ${placeLabel(center)}`],
    [facts.how, deliveryLabel(program.delivery_mode)],
    [facts.duration, program.duration_hours ? copy.programs.hours(program.duration_hours) : null],
    [
      facts.starts,
      program.start_date ? friendlyDay(program.start_date, today) : copy.programs.flexibleStart,
    ],
    [facts.ends, program.end_date ? friendlyDay(program.end_date, today) : null],
    [facts.cost, programCost(program)],
    [facts.slots, program.slots ? facts.learners(program.slots) : null],
  ]
  return (
    <ModalDialog
      isOpen
      onOpenChange={(isOpen) => !isOpen && onClose()}
      title={program.title}
      closeLabel={facts.close}
      wide
    >
      <div className={styles.dialogTop}>
        <img className={styles.dialogPhoto} src={listingPhoto(program)} alt="" />
        <div>
          <p className={styles.muted}>
            {program.qualification.name}
            {program.qualification.sector ? ` · ${program.qualification.sector}` : ''}
          </p>
          <p className={styles.badges}>
            {fit?.score !== undefined && (
              <span className={styles.fit}>{copy.programs.fit(fit.score)}</span>
            )}
            {program.scholarship_available && (
              <span className={styles.scholarship}>{copy.programs.scholarship}</span>
            )}
          </p>
        </div>
      </div>
      <dl className={styles.factList}>
        {rows
          .filter((row): row is [string, string] => row[1] !== null)
          .map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>
      {program.description && <p className={styles.description}>{program.description}</p>}
      <ServiceEvidence service={program} />
      {fit && fit.explanation.length > 0 && (
        <>
          <h3 className={styles.subheading}>
            {fit.score === undefined ? 'Service verification' : copy.programs.why}
          </h3>
          <ul className={styles.reasons}>
            {fit.explanation.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </>
      )}
      <p className={styles.muted}>{facts.confirm}</p>
    </ModalDialog>
  )
}

/** A center's upcoming assessments, soonest first, two until View all, each with Apply. */
export function Schedules({ center }: { center: Center }) {
  const [all, setAll] = useState(false)
  const [reviewing, setReviewing] = useState<Schedule | null>(null)
  const requireAccount = useRequireAccount()
  const headingId = useId()
  const schedules = [...center.schedules].sort((a, b) =>
    a.scheduled_at.localeCompare(b.scheduled_at),
  )
  return (
    <section aria-labelledby={headingId} className={styles.listings}>
      <ListingsHead
        id={headingId}
        title={copy.schedules.heading(schedules.length)}
        count={schedules.length}
        all={all}
        onToggle={() => setAll(!all)}
      />
      {schedules.length === 0 ? (
        <p className={styles.muted}>{copy.schedules.none}</p>
      ) : (
        <p className={styles.muted}>{copy.schedules.timezone}</p>
      )}
      <ul className={styles.cards}>
        {(all ? schedules : schedules.slice(0, PREVIEW)).map((schedule) => (
          <li key={schedule.id}>
            <ScheduleCard
              schedule={schedule}
              // A guest signs in first, then reviews the application: nothing is sent without them (US-09).
              onApply={() => requireAccount(() => setReviewing(schedule))}
            />
          </li>
        ))}
      </ul>
      {reviewing && (
        <ApplyDialog schedule={reviewing} center={center} onClose={() => setReviewing(null)} />
      )}
    </section>
  )
}

function ScheduleCard({ schedule, onApply }: { schedule: Schedule; onApply: () => void }) {
  const headingId = useId()
  const open = schedule.seats_left > 0
  return (
    <article className={styles.card} aria-labelledby={headingId}>
      <img className={styles.photo} src={listingPhoto(schedule)} alt="" loading="lazy" />
      <div className={styles.body}>
        <h4 id={headingId}>{localTime(schedule.scheduled_at)}</h4>
        <p className={styles.muted}>{schedule.qualification.name}</p>
        <p className={styles.facts}>
          {copy.schedules.seats(schedule.seats_left, schedule.slots)} • {scheduleFee(schedule)}
        </p>
        <ServiceEvidence service={schedule} />
        {open ? (
          <Button
            className={cx(buttons.button, buttons.primary, styles.apply)}
            onPress={onApply}
            isDisabled={!canReviewApplication(schedule)}
          >
            {copy.schedules.apply}
          </Button>
        ) : (
          <span className={styles.full}>{copy.schedules.full}</span>
        )}
      </div>
    </article>
  )
}

/**
 * Reviewing an assessment application before it's sent (US-09): what it's for, where and when, its fee, and that
 * the center reviews it. Sent once; the receipt shows the application's reference and status.
 */
function ApplyDialog({
  schedule,
  center,
  onClose,
}: {
  schedule: Schedule
  center: Center
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const facts = copy.apply
  // Keep the receipt key across uncertain responses and retries within this review.
  const [requestId] = useState(() => crypto.randomUUID())
  const apply = useMutation({
    mutationFn: () => applyForAssessment(schedule.id, requestId),
    // Seats changed, and My Progress has a new application.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['training', 'listings'] })
      void queryClient.invalidateQueries({ queryKey: ['me', 'applications'] })
    },
  })
  const sent: Application | undefined = apply.data
  const error = apply.error
  return (
    <ModalDialog
      isOpen
      onOpenChange={(isOpen) => !isOpen && onClose()}
      title={sent ? facts.sent : facts.heading}
      closeLabel={facts.close}
      isPending={apply.isPending}
    >
      <dl className={styles.factList}>
        <div>
          <dt>{facts.qualification}</dt>
          <dd>{schedule.qualification.name}</dd>
        </div>
        <div>
          <dt>{facts.center}</dt>
          <dd>
            {center.name}, {placeLabel(center)}
          </dd>
        </div>
        <div>
          <dt>{facts.when}</dt>
          <dd>
            {localTime(schedule.scheduled_at)}, {facts.philippineTime}
          </dd>
        </div>
        <div>
          <dt>{facts.fee}</dt>
          <dd>{scheduleFee(schedule)}</dd>
        </div>
      </dl>
      {sent ? (
        <div role="status" className={styles.receipt}>
          <p>{facts.receipt(sent.id.slice(0, 8).toUpperCase(), facts.statuses[sent.status])}</p>
          <Link to={paths.progress} className={cx(buttons.button, buttons.primary)}>
            {facts.toProgress}
            <Icon name="arrowRight" />
          </Link>
        </div>
      ) : (
        <>
          <p className={styles.description}>{facts.review}</p>
          <ServiceEvidence service={schedule} />
          {error && (
            <p role="alert" className={styles.error}>
              {/* Full, or already applied: the API says which (409, 422). */}
              {failureMessage(error)}
            </p>
          )}
          <div className={styles.actions}>
            <Button slot="close" className={buttons.button} isDisabled={apply.isPending}>
              {facts.cancel}
            </Button>
            <Button
              className={cx(buttons.button, buttons.primary)}
              isPending={apply.isPending}
              isDisabled={!canReviewApplication(schedule)}
              onPress={() => apply.mutate()}
            >
              {apply.isPending ? facts.pending : facts.submit}
            </Button>
          </div>
        </>
      )}
    </ModalDialog>
  )
}
