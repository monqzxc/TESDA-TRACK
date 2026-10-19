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
import { button } from '../../styles/buttons.ts'
import { applyForAssessment, type Application } from './api.ts'
import { friendlyDay, placeLabel, type Center, type Program, type Schedule } from './centers.ts'
import { localTime, programCost, programFacts, scheduleFee } from './format.ts'

const copy = en.training

/** Listings shown under a center before View all (classic/training_view.py PREVIEW). */
const PREVIEW = 2

// A center's programs or assessments, after classic/training_view.py's listing cards, and their dialogs.
const card = 'flex gap-[0.8rem] rounded-14 border border-border bg-surface p-3'
const photo = 'size-19 flex-none rounded-10 object-cover'
const body = 'flex min-w-0 flex-1 flex-col items-start gap-[0.3rem]'
const cardTitle = 'm-0 font-text text-15 font-bold tracking-normal wrap-anywhere text-navy'
const muted = 'm-0 text-13 leading-[1.5] text-muted'
const factLine = 'm-0 text-13 leading-[1.5] text-ink'
const badges = 'm-0 flex flex-wrap gap-[0.35rem]'
const badge =
  'inline-flex items-center gap-[0.3rem] rounded-full px-[0.6rem] py-[0.2rem] text-12 font-[650]'
const fitBadge = cx(badge, 'bg-tint text-blue')
const scholarshipBadge = cx(badge, 'bg-good-bg text-good-ink')
const factList = cx(
  'mt-0 mb-[0.9rem] grid gap-[0.45rem]',
  '[&_div]:grid [&_div]:grid-cols-[9rem_minmax(0,1fr)] [&_div]:gap-3 max-xs:[&_div]:grid-cols-1 max-xs:[&_div]:gap-[0.1rem]',
  '[&_dd]:m-0 [&_dd]:text-15 [&_dd]:font-semibold [&_dd]:wrap-anywhere [&_dd]:text-navy [&_dt]:text-14 [&_dt]:text-muted',
)
const description = 'mt-0 mb-[0.9rem] text-15 leading-[1.6] text-ink'

export type Fits = ReadonlyMap<number, { score: number; explanation: string[] }>

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
    <section aria-labelledby={headingId} className="mt-4 flex flex-col gap-2">
      <ListingsHead
        id={headingId}
        title={copy.programs.heading(programs.length)}
        count={programs.length}
        all={all}
        onToggle={() => setAll(!all)}
      />
      {programs.length === 0 && <p className={muted}>{copy.programs.none}</p>}
      <ul className="m-0 flex list-none flex-col gap-[0.6rem] p-0">
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
    <div className="flex items-center justify-between gap-2">
      <h3 id={id} className="m-0 text-[1.05rem] text-navy">
        {title}
      </h3>
      {count > PREVIEW && (
        <Button className={button({ variant: 'tertiary' })} onPress={onToggle}>
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
  fit?: { score: number; explanation: string[] }
  today: string
  onOpen: () => void
}) {
  const headingId = useId()
  const qualification = program.qualification.name
  return (
    <article className={card} aria-labelledby={headingId}>
      <img className={photo} src={listingPhoto(program)} alt="" loading="lazy" />
      <div className={body}>
        <h4 id={headingId} className={cardTitle}>
          {program.title}
        </h4>
        {!program.title
          .toLocaleLowerCase('en-US')
          .includes(qualification.toLocaleLowerCase('en-US')) && (
          <p className={muted}>{qualification}</p>
        )}
        <p className={factLine}>{programFacts(program, today).join(' • ')}</p>
        {(fit || program.scholarship_available) && (
          <p className={badges}>
            {fit && (
              <span className={fitBadge}>
                <Icon name="sparkle" />
                {copy.programs.fit(fit.score)}
              </span>
            )}
            {program.scholarship_available && (
              <span className={scholarshipBadge}>
                <Icon name="check" />
                {copy.programs.scholarship}
              </span>
            )}
          </p>
        )}
        {fit && fit.explanation.length > 0 && (
          <details>
            <summary className="inline-flex cursor-pointer items-center gap-[0.35rem] text-13 font-semibold text-blue">
              <Icon name="info" />
              {copy.programs.why}
            </summary>
            <ul className="my-[0.4rem] pl-[1.1rem] text-13 text-ink">
              {fit.explanation.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <p className={muted}>{copy.programs.whyNote}</p>
          </details>
        )}
        <Button
          className={cx(button({ variant: 'tertiary', height: 36, text: 14 }), '-ml-2')}
          onPress={onOpen}
        >
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
  fit?: { score: number; explanation: string[] }
  today: string
  onClose: () => void
}) {
  const facts = copy.program
  const rows: [string, string | null][] = [
    [facts.where, `${center.name}, ${placeLabel(center)}`],
    [facts.how, copy.delivery[program.delivery_mode]],
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
      <div className="mb-[0.8rem] flex items-center gap-4">
        <img
          className="size-27.5 flex-none rounded-12 object-cover"
          src={listingPhoto(program)}
          alt=""
        />
        <div>
          <p className={muted}>
            {program.qualification.name}
            {program.qualification.sector ? ` · ${program.qualification.sector}` : ''}
          </p>
          <p className={badges}>
            {fit && <span className={fitBadge}>{copy.programs.fit(fit.score)}</span>}
            {program.scholarship_available && (
              <span className={scholarshipBadge}>{copy.programs.scholarship}</span>
            )}
          </p>
        </div>
      </div>
      <dl className={factList}>
        {rows
          .filter((row): row is [string, string] => row[1] !== null)
          .map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>
      {program.description && <p className={description}>{program.description}</p>}
      {fit && fit.explanation.length > 0 && (
        <>
          <h3 className="mt-0 mb-[0.3rem] font-text text-15 tracking-normal text-navy">
            {copy.programs.why}
          </h3>
          <ul className="mt-0 mb-[0.9rem] pl-[1.2rem] text-[0.9rem] text-ink">
            {fit.explanation.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </>
      )}
      <p className={muted}>{facts.confirm}</p>
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
    <section aria-labelledby={headingId} className="mt-4 flex flex-col gap-2">
      <ListingsHead
        id={headingId}
        title={copy.schedules.heading(schedules.length)}
        count={schedules.length}
        all={all}
        onToggle={() => setAll(!all)}
      />
      {schedules.length === 0 ? (
        <p className={muted}>{copy.schedules.none}</p>
      ) : (
        <p className={muted}>{copy.schedules.timezone}</p>
      )}
      <ul className="m-0 flex list-none flex-col gap-[0.6rem] p-0">
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
    <article className={card} aria-labelledby={headingId}>
      <img className={photo} src={listingPhoto(schedule)} alt="" loading="lazy" />
      <div className={body}>
        <h4 id={headingId} className={cardTitle}>
          {localTime(schedule.scheduled_at)}
        </h4>
        <p className={muted}>{schedule.qualification.name}</p>
        <p className={factLine}>
          {copy.schedules.seats(schedule.seats_left, schedule.slots)} • {scheduleFee(schedule)}
        </p>
        {open ? (
          <Button
            className={cx(button({ variant: 'primary', height: 38, snug: true }), 'mt-[0.2rem]')}
            onPress={onApply}
          >
            {copy.schedules.apply}
          </Button>
        ) : (
          <span className="rounded-full bg-warn-bg px-[0.6rem] py-[0.2rem] text-12 font-[650] text-warn-ink">
            {copy.schedules.full}
          </span>
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
  const apply = useMutation({
    mutationFn: () => applyForAssessment(schedule.id),
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
      <dl className={factList}>
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
        <div
          role="status"
          className="flex flex-col items-start gap-[0.8rem] rounded-12 bg-good-bg px-4 py-[0.9rem] font-semibold text-good-ink [&_p]:m-0"
        >
          <p>{facts.receipt(sent.id.slice(0, 8).toUpperCase(), facts.statuses[sent.status])}</p>
          <Link to={paths.progress} className={button({ variant: 'primary' })}>
            {facts.toProgress}
            <Icon name="arrowRight" />
          </Link>
        </div>
      ) : (
        <>
          <p className={description}>{facts.review}</p>
          {error && (
            <p
              role="alert"
              className="mt-0 mb-[0.9rem] rounded-12 bg-warn-bg px-[0.9rem] py-[0.7rem] text-15 font-semibold text-warn-ink"
            >
              {/* Full, or already applied: the API says which (409, 422). */}
              {failureMessage(error)}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-[0.6rem]">
            <Button slot="close" className={button()} isDisabled={apply.isPending}>
              {facts.cancel}
            </Button>
            <Button
              className={button({ variant: 'primary' })}
              isPending={apply.isPending}
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
