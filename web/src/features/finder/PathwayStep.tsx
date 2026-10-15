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
import buttons from '../../styles/buttons.module.css'
import { shortName, trainingAddress } from '../training/address.ts'
import { curatedPathwaysQuery, followPathway, type CuratedPathway } from './api.ts'
import { VERDICTS, verdictFor } from './rules.ts'
import { useFinderStore, type Answers, type Profile, type SubmittedCheck } from './store.ts'
import shared from './finder.module.css'
import styles from './PathwayStep.module.css'

const copy = en.finder.pathway

interface PathwayStepProps {
  qualification: Qualification
  /** For administrators' diagnostics. */
  profile: Profile
}

/**
 * Your pathway (frontend/app.py show_recommendation): the readiness result's verdict, which picks training or the NC
 * assessment, its button to the centers that fit, the strengths and gaps, and the curated pathway for that route.
 */
export function PathwayStep({ qualification, profile }: PathwayStepProps) {
  const check = useFinderStore((state) => state.checks[qualification.code])
  const answers = useFinderStore((state) => state.answers[qualification.code])
  const headingId = useId()

  if (!check) {
    return (
      <section aria-labelledby={headingId} className={cx(shared.card, styles.pending)}>
        <h3 id={headingId}>{copy.pending.heading}</h3>
        <p className={shared.muted}>{copy.pending.body(qualification.name)}</p>
        <Link to={paths.finderReadiness} className={cx(buttons.button, buttons.primary)}>
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
      <p className={cx(shared.muted, styles.disclaimer)}>{copy.disclaimer}</p>
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
    <section aria-labelledby={headingId} className={cx(shared.card, styles.verdict)}>
      <p className={shared.kicker}>{copy.kicker}</p>
      <h3 id={headingId} className={styles.headline}>
        {copy.verdicts[verdict].headline}
      </h3>
      <p className={styles.for}>{copy.for(qualification.name)}</p>

      <div className={styles.score}>
        <div className={styles.metric}>
          <span>{copy.score}</span>
          <strong>{score}%</strong>
        </div>
        <div className={styles.guidance}>
          <p className={styles.level}>{result.level}</p>
          <p>{result.recommendation}</p>
        </div>
      </div>
      {total > 0 && (
        <SkillBars
          className={styles.bars}
          bars={[
            { label: copy.strengths, count: result.strengths.length, total, tone: 'blue' },
            { label: copy.improve, count: result.skill_gaps.length, total, tone: 'violet' },
          ]}
        />
      )}

      <Button className={cx(buttons.button, buttons.primary, styles.action)} onPress={openCenters}>
        {copy.verdicts[verdict].action}
        <Icon name="arrowRight" />
      </Button>

      {/* The lists can run to dozens, so they fold away, open when there are gaps to work on. */}
      <details className={styles.details} open={result.skill_gaps.length > 0}>
        <summary>
          <Icon name="checklist" className={styles.detailsIcon} />
          {copy.details(result.strengths.length, result.skill_gaps.length)}
          <Icon name="chevron" className={styles.chevron} />
        </summary>
        <div className={styles.lists}>
          <div>
            <h4>{copy.strengths}</h4>
            {result.strengths.length ? (
              <ul className={styles.strengths}>
                {result.strengths.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            ) : (
              <p className={shared.muted}>{copy.noStrengths}</p>
            )}
          </div>
          <div>
            <h4>{copy.improve}</h4>
            {result.skill_gaps.length ? (
              <ul className={styles.gaps}>
                {result.skill_gaps.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            ) : (
              <p className={shared.muted}>{copy.noGaps}</p>
            )}
          </div>
        </div>
      </details>
      {changed ? (
        <p className={cx(shared.notice, shared.warning)}>{copy.changed}</p>
      ) : (
        <p className={shared.muted}>{copy.basedOn}</p>
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
    <section aria-labelledby={headingId} className={shared.card}>
      <p className={shared.kicker}>{copy.yourPathway}</p>
      <h3 id={headingId} className={styles.pathwayTitle}>
        {pathway.title}
      </h3>
      {pathway.description && <p className={shared.muted}>{pathway.description}</p>}
      <ol className={styles.steps}>
        {pathway.steps.map((step) => (
          <li key={step.id}>
            <span aria-hidden="true">{step.position}</span>
            <p>{step.title}</p>
          </li>
        ))}
      </ol>
      {/* Following needs an account: signed out, it opens sign-in and carries on afterwards (US-02). */}
      <Button
        className={buttons.button}
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
              shared.notice,
              styles.outcome,
              outcome.tone === 'success' && shared.success,
              outcome.tone === 'error' && shared.warning,
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
    <details className={styles.diagnostics}>
      <summary>
        <Icon name="document" />
        {copy.diagnostics}
      </summary>
      <pre>{JSON.stringify({ profile, readiness: check.result, route }, null, 2)}</pre>
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
