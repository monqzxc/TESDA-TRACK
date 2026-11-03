import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { Button } from 'react-aria-components'
import { Link, useNavigate } from 'react-router'
import type { Qualification } from '../../api/queries.ts'
import { ApiError } from '../../api/errors.ts'
import { failureMessage } from '../../auth/fields.tsx'
import { useAuth, useRequireAccount } from '../../auth/useAuth.ts'
import { Icon } from '../../components/Icon.tsx'
import { DataProvenance } from '../../components/DataProvenance.tsx'
import { SkillBars } from '../../components/Meters.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'
import { button } from '../../styles/buttons.ts'
import { pathwaysQuery, progressKeys, setPathwayStatus, type Enrollment } from '../progress/api.ts'
import { shortName, trainingAddress } from '../training/address.ts'
import { curatedPathwaysQuery, followPathway, type CuratedPathway } from './api.ts'
import { FeedbackPrompt } from './FeedbackPrompt.tsx'
import { PathwayDetails, usePathwayReport } from './PathwayReport.tsx'
import { VERDICTS, verdictFor } from './rules.ts'
import { useFinderStore, type Answers, type Profile, type SubmittedCheck } from './store.ts'
import { card, kicker, muted, notice } from './styles.ts'

interface PathwayStepProps {
  qualification: Qualification
  /** For administrators' diagnostics. */
  profile: Profile
  /** What the matches were asked with, for the learner's feedback. */
  asked: { query: string; profile: Profile }
}

/**
 * Your pathway (classic/app.py show_recommendation): the readiness result's verdict, which picks training or the NC
 * assessment, with its score, the next action and the button to the centers that fit; under it, in tabs, the
 * personalized report with the curated pathway for that route; and whether the learner is satisfied with it all.
 */
export function PathwayStep({ qualification, profile, asked }: PathwayStepProps) {
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
        <h3 id={headingId} className="m-0 text-[1.3rem] text-navy">
          {copy.pending.heading}
        </h3>
        <p className={muted}>{copy.pending.body(qualification.name)}</p>
        <Link to={paths.finderReadiness} className={button({ variant: 'primary' })}>
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
    />
  )
}

/** The verdict first, a screen's worth on its own; the report's parts under it, a tab at a time. */
function Result({
  qualification,
  check,
  answers,
  profile,
  asked,
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
      }),
    )

  return (
    <section
      data-tour="pathway-result"
      aria-labelledby={headingId}
      className={cx(
        card,
        '@container grid gap-x-8 gap-y-5 py-6 @min-[720px]:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]',
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

      {/* After Streamlit's metric: a label over a big figure, the level beside it, then the bars. */}
      <div className="flex min-w-0 flex-col gap-3 self-start rounded-14 bg-panel p-4">
        <div className="flex items-end justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-14 text-ink">{copy.score}</span>
            <strong className="font-display text-[2.5rem] leading-[1.05] font-bold tracking-[-0.03em] text-navy">
              {score}%
            </strong>
          </div>
          <span className="pb-1 text-right text-15 leading-[1.35] font-bold text-navy">
            {result.level}
          </span>
        </div>
        {total > 0 && (
          <SkillBars
            bars={[
              { label: copy.strengths, count: result.strengths.length, total, tone: 'blue' },
              { label: copy.improve, count: result.skill_gaps.length, total, tone: 'violet' },
            ]}
          />
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

/** A curated pathway to follow. Embedded, it sits in a panel inside the pathway's tabs, without its own card. */
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
  const { isSignedIn } = useAuth()
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

  return (
    <section
      data-tour="curated-pathway"
      aria-labelledby={headingId}
      className={embedded ? 'min-w-0 rounded-14 bg-panel p-4' : card}
    >
      {!embedded && <p className={kicker}>{copy.yourPathway}</p>}
      <h3
        id={headingId}
        className={cx(
          'mb-[0.3rem] text-navy',
          embedded ? 'mt-0 text-16 font-bold' : 'mt-1 text-[1.15rem]',
        )}
      >
        {pathway.title}
      </h3>
      {pathway.description && <p className={muted}>{pathway.description}</p>}
      {/* The steps as a timeline: a line runs from each number down to the next. */}
      <ol className="mt-[0.8rem] mb-[0.6rem] grid list-none p-0">
        {pathway.steps.map((step) => (
          <li
            key={step.id}
            className="relative m-0 flex items-start gap-[0.85rem] pb-[0.9rem] not-last:before:absolute not-last:before:top-[34px] not-last:before:bottom-0.5 not-last:before:left-[15px] not-last:before:w-0.5 not-last:before:bg-line not-last:before:content-['']"
          >
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-full bg-tint text-14 font-bold text-blue"
            >
              {step.position}
            </span>
            <p className="mt-[0.3rem] mb-0 text-15 leading-[1.5] text-navy">{step.title}</p>
          </li>
        ))}
      </ol>
      <div
        className={cx(
          'flex flex-col items-start gap-3',
          embedded ? 'mt-1' : 'mt-2 border-t border-border pt-4',
        )}
      >
        <p className={muted}>{copy.cart.hint}</p>
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
      </div>
      <div aria-live="polite">
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
              'mt-3',
            )}
          >
            {outcome.message}
          </p>
        )}
      </div>
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
