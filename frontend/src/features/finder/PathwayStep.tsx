import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { Button } from 'react-aria-components'
import { Link, useLocation, useNavigate } from 'react-router'
import type { Qualification } from '../../api/queries.ts'
import { ApiError } from '../../api/errors.ts'
import { failureMessage } from '../../auth/fields.tsx'
import { useAuth, useRequireAccount } from '../../auth/useAuth.ts'
import { Icon } from '../../components/Icon.tsx'
import { DataProvenance } from '../../components/DataProvenance.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'
import { button } from '../../styles/buttons.ts'
import { pathwaysQuery, progressKeys, setPathwayStatus, type Enrollment } from '../progress/api.ts'
import { shortName, trainingAddress } from '../training/address.ts'
import { curatedPathwaysQuery, followPathway, type Asked, type CuratedPathway } from './api.ts'
import { FinalCareerOptions } from './FinalCareerOptions.tsx'
import type { Match } from './api.ts'
import { FeedbackPrompt } from './FeedbackPrompt.tsx'
import { PathwayDetails, usePathwayReport } from './PathwayReport.tsx'
import { VERDICTS, verdictFor } from './rules.ts'
import { useFinderStore, type Answers, type Profile, type SubmittedCheck } from './store.ts'
import { card, cardHeading, muted, notice } from './styles.ts'

interface PathwayStepProps {
  qualification: Qualification
  catalog?: readonly Qualification[]
  matches?: readonly Match[]
  /** For administrators' diagnostics. */
  profile: Profile
  /** What the matches were asked with, for the learner's feedback. */
  asked: Asked
}

/**
 * Your pathway (classic/app.py show_recommendation): the readiness result's verdict, which picks training or the NC
 * assessment, with its score, the next action and the button to the centers that fit; under it, in tabs, the
 * personalized report with the curated pathway for that route; and whether the learner is satisfied with it all.
 */
export function PathwayStep({
  qualification,
  profile,
  asked,
  catalog = [],
  matches = [],
}: PathwayStepProps) {
  const inTsp = useLocation().pathname.startsWith(paths.tspWebview)
  const en = useCopy()
  const copy = en.finder.pathway

  const check = useFinderStore((state) => state.checks[qualification.code])
  const answers = useFinderStore((state) => state.answers[qualification.code])
  const headingId = useId()

  if (!check) {
    return (
      <section
        aria-labelledby={headingId}
        className={cx(card, 'flex flex-col items-start gap-[0.6rem]')}
      >
        <h3 id={headingId} className={cardHeading}>
          {copy.pending.heading}
        </h3>
        <p className={muted}>{copy.pending.body(qualification.name)}</p>
        <Link
          to={inTsp ? paths.tspReadiness : paths.finderReadiness}
          className={button({ variant: 'primary' })}
        >
          <Icon name="arrowLeft" />
          {copy.pending.action}
        </Link>
      </section>
    )
  }
  return (
    <Result
      qualification={qualification}
      check={check}
      answers={answers}
      profile={profile}
      asked={asked}
      catalog={catalog}
      matches={matches}
    />
  )
}

/** The verdict first, a screen's worth on its own; the report's parts under it, in rows. */
function Result({
  qualification,
  check,
  answers,
  profile,
  asked,
  catalog = [],
  matches = [],
}: PathwayStepProps & { check: SubmittedCheck; answers: Answers | undefined }) {
  const report = usePathwayReport(qualification, check, asked)
  return (
    <>
      <Verdict
        qualification={qualification}
        check={check}
        changed={!sameAnswers(answers, check.answers)}
        nextAction={report.data?.final.next_action}
      />
      <FinalCareerOptions qualification={qualification} catalog={catalog} matches={matches} />
      <PathwayDetails
        qualification={qualification}
        check={check}
        report={report}
        pathway={
          <CuratedPathway
            code={qualification.code}
            route={VERDICTS[verdictFor(check.result)].route}
          />
        }
      />
      <FeedbackPrompt code={qualification.code} check={check} asked={asked} />
      <Diagnostics profile={profile} check={check} />
    </>
  )
}

function Verdict({
  qualification,
  check,
  changed,
  nextAction,
}: {
  qualification: Qualification
  check: SubmittedCheck
  changed: boolean
  /** The report's next action, once it's here. */
  nextAction?: string | null
}) {
  const en = useCopy()
  const copy = en.finder.pathway

  const navigate = useNavigate()
  const inTsp = useLocation().pathname.startsWith(paths.tspWebview)
  const headingId = useId()
  const { result } = check
  const verdict = verdictFor(result)
  const { kind } = VERDICTS[verdict]
  const total = qualification.competencies.length
  const score = Math.round(result.score)

  const openCenters = () =>
    void navigate(
      trainingAddress({
        kinds: [kind],
        qualifications: [qualification.code],
        search: shortName(qualification.name),
      }).replace(paths.training, inTsp ? paths.tspTraining : paths.training),
    )

  return (
    <section
      data-tour="pathway-result"
      aria-labelledby={headingId}
      className={cx(
        card,
        '@container grid gap-x-10 gap-y-6 py-6 @min-[720px]:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]',
      )}
    >
      <div className="flex min-w-0 flex-col items-start gap-3">
        <h3
          id={headingId}
          className="m-0 text-[length:clamp(1.5rem,1.2rem_+_1vw,1.9rem)] leading-[1.15] font-bold tracking-[-0.02em] text-balance text-navy"
        >
          {copy.verdicts[verdict].headline}
        </h3>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-15 text-muted">
          <p className="m-0">{copy.for(qualification.name)}</p>
          <DataProvenance value={qualification.provenance} compact />
        </div>
        <p className="m-0 max-w-[60ch] text-16 leading-[1.6] text-ink">
          {result.recommendation}
          {nextAction && (
            <>
              {' '}
              <strong className="text-navy">{copy.report.nextAction}:</strong> {nextAction}
            </>
          )}
        </p>
        <Button
          data-tour="pathway-centers"
          className={cx(button({ variant: 'primary' }), 'mt-1')}
          onPress={openCenters}
        >
          {copy.verdicts[verdict].action}
          <Icon name="arrowRight" />
        </Button>
      </div>

      {/* After Streamlit's metric: a label over the screen's biggest figure, the level under it, then the bars. The
          strengths, the part the learner already has, take the one hue; what's left to improve is ink. */}
      <div className="flex min-w-0 flex-col gap-4 self-start border-border @max-[719px]:border-t @max-[719px]:pt-5 @min-[720px]:border-l @min-[720px]:pl-8">
        <div className="flex flex-col gap-1">
          <span className="text-14 text-muted">{copy.score}</span>
          <strong className="font-display text-[2.5rem] leading-none font-semibold tracking-[-0.03em] text-navy tabular-nums">
            {score}%
          </strong>
          <span className="text-15 leading-[1.35] text-ink">{result.level}</span>
        </div>
        {total > 0 && (
          <ul className="m-0 grid list-none gap-3 p-0">
            {[
              { label: copy.strengths, count: result.strengths.length, fill: 'bg-blue' },
              { label: copy.improve, count: result.skill_gaps.length, fill: 'bg-navy' },
            ].map((bar) => (
              <li key={bar.label} className="grid gap-1 text-14 text-ink">
                <span className="flex justify-between gap-3">
                  {bar.label}
                  <b className="font-semibold text-navy tabular-nums">
                    <span aria-hidden="true">
                      {bar.count}/{total}
                    </span>
                    <span className="sr-only">{en.countOf(bar.count, total)}</span>
                  </b>
                </span>
                <span className="h-1.5 overflow-hidden rounded-full bg-bar" aria-hidden="true">
                  <i
                    className={cx('block h-full rounded-[inherit]', bar.fill)}
                    style={{ width: `${(100 * bar.count) / total}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2 @min-[720px]:col-span-2">
        {changed && <p className={notice('warning')}>{copy.changed}</p>}
        <p className="m-0 text-13 leading-[1.6] text-muted">
          {copy.disclaimer} {!changed && copy.basedOn}
        </p>
      </div>
    </section>
  )
}

/** The curated pathway for the verdict's route, so its steps agree with the recommendation above. */
function CuratedPathway({
  code,
  route,
}: {
  code: string
  route: Parameters<typeof curatedPathwaysQuery>[1]
}) {
  const pathways = useQuery(curatedPathwaysQuery(code, route))
  const pathway = pathways.data?.[0]
  if (!pathway) return null
  return <PathwayCard pathway={pathway} embedded />
}

/**
 * A curated pathway to follow. Embedded, it's a strip under the next steps: its title and steps in a line, and the
 * button to save it beside them.
 */
export function PathwayCard({
  pathway,
  embedded = false,
}: {
  pathway: CuratedPathway
  embedded?: boolean
}) {
  const en = useCopy()
  const copy = en.finder.pathway

  const requireAccount = useRequireAccount()
  const { isSignedIn, offersAccounts } = useAuth()
  const queryClient = useQueryClient()
  const enrollments = useQuery({ ...pathwaysQuery, enabled: isSignedIn })
  const existing = enrollments.data?.find((item) => item.pathway.id === pathway.id)
  const added = isSignedIn && existing !== undefined && existing.status !== 'withdrawn'
  const headingId = useId()
  const [outcome, setOutcome] = useState<{
    tone: 'success' | 'info' | 'error'
    message: string
  } | null>(null)
  const follow = useMutation({
    mutationFn: async () => {
      // Read after sign-in as well: another tab may already have saved this pathway.
      const records = await queryClient.fetchQuery(pathwaysQuery)
      const saved = records.find((item) => item.pathway.id === pathway.id)
      if (saved) {
        return saved.status === 'withdrawn' ? setPathwayStatus(saved.id, 'active') : saved
      }
      return followPathway(pathway.id)
    },
    onSuccess: (enrollment) => {
      queryClient.setQueryData<Enrollment[]>(progressKeys.pathways, (current) => [
        ...(current ?? []).filter((item) => item.id !== enrollment.id),
        enrollment,
      ])
      setOutcome({ tone: 'success', message: copy.followed })
    },
    onError: (failure) => {
      if (failure instanceof ApiError && failure.status === 409) {
        setOutcome({ tone: 'info', message: copy.already })
        void queryClient.invalidateQueries({ queryKey: progressKeys.pathways })
      } else {
        setOutcome({ tone: 'error', message: failureMessage(failure) })
      }
    },
  })

  const save = (
    <div className="flex flex-wrap items-center gap-3">
      {/* Saving needs an account; sign-in carries on with this qualification (US-02). */}
      <Button
        className={button({ variant: added ? 'secondary' : 'primary' })}
        isPending={follow.isPending}
        isDisabled={added || (isSignedIn && enrollments.isPending)}
        onPress={() => {
          setOutcome(null)
          requireAccount(() => follow.mutate())
        }}
      >
        {added && <Icon name="check" />}
        {follow.isPending ? copy.following : added ? copy.cart.added : copy.cart.add}
      </Button>
      {added && (
        <Link to={paths.progress} className={button({ variant: 'tertiary' })}>
          {copy.cart.view}
          <Icon name="arrowRight" />
        </Link>
      )}
    </div>
  )
  const said = (
    <div aria-live="polite" className={cx(embedded && 'basis-full empty:hidden')}>
      {outcome && (
        <p
          className={cx(
            notice(
              outcome.tone === 'success'
                ? 'success'
                : outcome.tone === 'error'
                  ? 'warning'
                  : 'info',
            ),
            !embedded && 'mt-3',
          )}
        >
          {outcome.message}
        </p>
      )}
    </div>
  )

  if (embedded) {
    return (
      <section
        data-tour="curated-pathway"
        aria-labelledby={headingId}
        className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-12 bg-panel px-5 py-4"
      >
        <div className="min-w-[min(100%,18rem)] flex-1">
          <h4 id={headingId} className="m-0 text-16 leading-[1.35] font-bold text-navy">
            {pathway.title}
          </h4>
          {pathway.description && <p className={muted}>{pathway.description}</p>}
          {/* The steps in order, one after the other, each led by its place in the order. */}
          <ol className="m-0 mt-2 flex list-none flex-wrap gap-x-5 gap-y-1 p-0 text-14 text-ink">
            {pathway.steps.map((step) => (
              <li key={step.id} className="flex items-baseline gap-[0.4rem]">
                <span aria-hidden="true" className="text-13 font-semibold text-muted tabular-nums">
                  {step.position}
                </span>
                {step.title}
              </li>
            ))}
          </ol>
        </div>
        {/* Saving a pathway needs an account: a guest sees the steps only. */}
        {offersAccounts && save}
        {said}
      </section>
    )
  }
  return (
    <section data-tour="curated-pathway" aria-labelledby={headingId} className={card}>
      <h3 id={headingId} className="mt-0 mb-[0.3rem] text-18 leading-[1.35] text-navy">
        {pathway.title}
      </h3>
      {pathway.description && <p className={muted}>{pathway.description}</p>}
      {/* The steps in order, a rule between each. */}
      <ol className="mt-3 mb-2 list-none divide-y divide-rule p-0">
        {pathway.steps.map((step) => (
          <li key={step.id} className="m-0 flex items-baseline gap-3 py-[0.55rem]">
            <span
              aria-hidden="true"
              className="w-4 flex-none text-14 font-semibold text-muted tabular-nums"
            >
              {step.position}
            </span>
            <p className="m-0 text-15 leading-[1.5] text-navy">{step.title}</p>
          </li>
        ))}
      </ol>
      {/* Saving a pathway needs an account: a guest sees the steps only. */}
      {offersAccounts && (
        <div className="mt-2 flex flex-col items-start gap-3 border-t border-border pt-4">
          <p className={muted}>{copy.cart.hint}</p>
          {save}
        </div>
      )}
      {said}
    </section>
  )
}

/** What the recommendation was worked out from, for administrators. Shown as text, never as markup. */
function Diagnostics({ profile, check }: { profile: Profile; check: SubmittedCheck }) {
  const en = useCopy()
  const copy = en.finder.pathway

  const { isAdmin } = useAuth()
  if (!isAdmin) return null
  const route = VERDICTS[verdictFor(check.result)].route
  return (
    <details className="rounded-12 border border-border bg-surface px-[0.85rem] py-2">
      <summary className="flex cursor-pointer items-center gap-2 font-semibold text-navy">
        <Icon name="document" />
        {copy.diagnostics}
      </summary>
      <pre className="max-h-96 overflow-auto text-13 wrap-anywhere whitespace-pre-wrap text-ink">
        {JSON.stringify({ profile, readiness: check.result, route }, null, 2)}
      </pre>
    </details>
  )
}

/** Whether the learner's answers are still the ones the result was worked out from. */
function sameAnswers(current: Answers | undefined, sent: Answers): boolean {
  const now = current ?? {}
  const keys = new Set([...Object.keys(now), ...Object.keys(sent)])
  for (const key of keys) if (now[key] !== sent[key]) return false
  return true
}
