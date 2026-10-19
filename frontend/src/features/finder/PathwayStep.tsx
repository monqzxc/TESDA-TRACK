import { useMutation, useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { Button } from 'react-aria-components'
import { Link, useNavigate } from 'react-router'
import type { Qualification } from '../../api/queries.ts'
import { ApiError } from '../../api/errors.ts'
import { failureMessage } from '../../auth/fields.tsx'
import { useAuth, useRequireAccount } from '../../auth/useAuth.ts'
import { Icon } from '../../components/Icon.tsx'
import { SkillBars } from '../../components/Meters.tsx'
import { en } from '../../copy/en.ts'
import { cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'
import { button } from '../../styles/buttons.ts'
import { shortName, trainingAddress } from '../training/address.ts'
import { curatedPathwaysQuery, followPathway, type CuratedPathway } from './api.ts'
import { VERDICTS, verdictFor } from './rules.ts'
import { useFinderStore, type Answers, type Profile, type SubmittedCheck } from './store.ts'
import { card, kicker, muted, notice } from './styles.ts'

const copy = en.finder.pathway

// The strengths and gaps under the verdict.
const listHeading = 'mt-1 mb-[0.4rem] font-text text-15 tracking-normal text-navy'
const list = 'm-0 pl-[1.3rem] text-[0.9rem] leading-[1.55] text-ink'

interface PathwayStepProps {
  qualification: Qualification
  /** For administrators' diagnostics. */
  profile: Profile
}

/**
 * Your pathway (classic/app.py show_recommendation): the readiness result's verdict, which picks training or the NC
 * assessment, its button to the centers that fit, the strengths and gaps, and the curated pathway for that route.
 */
export function PathwayStep({ qualification, profile }: PathwayStepProps) {
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
    <>
      <Verdict
        qualification={qualification}
        check={check}
        changed={!sameAnswers(answers, check.answers)}
      />
      <p className={cx(muted, '-mt-1')}>{copy.disclaimer}</p>
      <CuratedPathway code={qualification.code} route={VERDICTS[verdictFor(check.result)].route} />
      <Diagnostics profile={profile} check={check} />
    </>
  )
}

function Verdict({
  qualification,
  check,
  changed,
}: {
  qualification: Qualification
  check: SubmittedCheck
  changed: boolean
}) {
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
    <section aria-labelledby={headingId} className={cx(card, 'flex flex-col gap-[0.6rem]')}>
      <p className={kicker}>{copy.kicker}</p>
      <h3 id={headingId} className="m-0 text-24 leading-[1.25] text-navy">
        {copy.verdicts[verdict].headline}
      </h3>
      <p className="m-0 text-15 text-muted">{copy.for(qualification.name)}</p>

      <div className="mt-[0.4rem] grid grid-cols-[minmax(0,1fr)_minmax(0,3fr)] gap-4 max-sm:grid-cols-1">
        {/* After Streamlit's metric: a label over a big figure. */}
        <div className="flex flex-col gap-[0.2rem]">
          <span className="text-14 text-ink">{copy.score}</span>
          <strong className="font-display text-[2.25rem] leading-[1.1] font-bold text-navy">
            {score}%
          </strong>
        </div>
        <div>
          <p className="mt-0 mb-[0.4rem] text-15 leading-[1.55] font-bold text-navy">
            {result.level}
          </p>
          <p className="mt-0 mb-[0.4rem] text-15 leading-[1.55] text-ink">
            {result.recommendation}
          </p>
        </div>
      </div>
      {total > 0 && (
        <SkillBars
          className="mt-1 mb-[0.4rem] max-w-[720px]"
          bars={[
            { label: copy.strengths, count: result.strengths.length, total, tone: 'blue' },
            { label: copy.improve, count: result.skill_gaps.length, total, tone: 'violet' },
          ]}
        />
      )}

      <Button className={cx(button({ variant: 'primary' }), 'self-start')} onPress={openCenters}>
        {copy.verdicts[verdict].action}
        <Icon name="arrowRight" />
      </Button>

      {/* The lists can run to dozens, so they fold away, open when there are gaps to work on. */}
      <details
        className="group rounded-12 border border-border"
        open={result.skill_gaps.length > 0}
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-[0.6rem] px-[0.85rem] py-2 text-15 font-semibold text-navy [&::-webkit-details-marker]:hidden">
          <Icon name="checklist" className="flex-none text-[1.2rem] text-blue" />
          {copy.details(result.strengths.length, result.skill_gaps.length)}
          <Icon
            name="chevron"
            className="ml-auto flex-none text-muted transition-transform duration-200 ease-[ease] group-open:rotate-180"
          />
        </summary>
        <div className="grid grid-cols-2 gap-4 px-[0.95rem] pb-[0.85rem] max-sm:grid-cols-1">
          <div>
            <h4 className={listHeading}>{copy.strengths}</h4>
            {result.strengths.length ? (
              <ul className={cx(list, "[list-style:'✓__']")}>
                {result.strengths.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            ) : (
              <p className={muted}>{copy.noStrengths}</p>
            )}
          </div>
          <div>
            <h4 className={listHeading}>{copy.improve}</h4>
            {result.skill_gaps.length ? (
              <ul className={list}>
                {result.skill_gaps.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            ) : (
              <p className={muted}>{copy.noGaps}</p>
            )}
          </div>
        </div>
      </details>
      {changed ? (
        <p className={notice('warning')}>{copy.changed}</p>
      ) : (
        <p className={muted}>{copy.basedOn}</p>
      )}
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
  return <PathwayCard pathway={pathway} />
}

function PathwayCard({ pathway }: { pathway: CuratedPathway }) {
  const requireAccount = useRequireAccount()
  const headingId = useId()
  const [outcome, setOutcome] = useState<{
    tone: 'success' | 'info' | 'error'
    message: string
  } | null>(null)
  const follow = useMutation({
    mutationFn: () => followPathway(pathway.id),
    onSuccess: () => setOutcome({ tone: 'success', message: copy.followed }),
    onError: (failure) =>
      setOutcome(
        failure instanceof ApiError && failure.status === 409
          ? { tone: 'info', message: copy.already }
          : { tone: 'error', message: failureMessage(failure) },
      ),
  })

  return (
    <section aria-labelledby={headingId} className={card}>
      <p className={kicker}>{copy.yourPathway}</p>
      <h3 id={headingId} className="mt-1 mb-[0.3rem] text-[1.15rem] text-navy">
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
      {/* Following needs an account: signed out, it opens sign-in and carries on afterwards (US-02). */}
      <Button
        className={button()}
        isPending={follow.isPending}
        onPress={() => {
          setOutcome(null)
          requireAccount(() => follow.mutate())
        }}
      >
        <Icon name="bookmark" />
        {follow.isPending ? copy.following : copy.follow}
      </Button>
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
