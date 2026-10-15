import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import { Button, Label, ProgressBar, Radio, RadioGroup } from 'react-aria-components'
import type { Qualification } from '../../api/queries.ts'
import { failureMessage } from '../../auth/fields.tsx'
import { useAuth } from '../../auth/useAuth.ts'
import { Icon } from '../../components/Icon.tsx'
import { en } from '../../copy/en.ts'
import { competencyGroups } from '../../lib/qualifications.ts'
import { cx } from '../../lib/style.ts'
import buttons from '../../styles/buttons.module.css'
import { pathwayQuery, submitReadiness } from './api.ts'
import { CardHeading } from './CardHeading.tsx'
import { useFinderStore, type Answer, type Answers, type Journey, type Profile } from './store.ts'
import { ownsSession } from './useJourneySession.ts'
import shared from './finder.module.css'
import styles from './ReadinessStep.module.css'

const copy = en.finder.readiness
const ANSWERS: readonly Answer[] = ['confident', 'some_experience', 'not_familiar']
const NO_ANSWERS: Answers = {}

interface ReadinessStepProps {
  journey: Journey
  qualification: Qualification
  /** The goal's profile with the learner's answers, for "Why we ask". */
  profile: Profile
  /** The check went through: on to the pathway. */
  onResult: () => void
}

/** Readiness check (frontend/app.py show_why_we_ask and show_readiness). */
export function ReadinessStep({ journey, qualification, profile, onResult }: ReadinessStepProps) {
  return (
    <>
      <WhyWeAsk profile={profile} code={qualification.code} />
      <ReadinessCheck journey={journey} qualification={qualification} onResult={onResult} />
    </>
  )
}

/** The route the learner's experience suggests, and so why their skills matter. Left out if it can't be loaded. */
function WhyWeAsk({ profile, code }: { profile: Profile; code: string }) {
  const pathway = useQuery(pathwayQuery(profile, code))
  const headingId = useId()
  if (!pathway.data) return null
  return (
    <section aria-labelledby={headingId} className={shared.card}>
      <CardHeading icon="lightbulb" id={headingId}>
        {en.finder.why.heading}
      </CardHeading>
      <p className={styles.reason}>{pathway.data.reason}</p>
      <p className={shared.muted}>
        {pathway.data.next_step} {en.finder.why.relevant}
      </p>
    </section>
  )
}

/**
 * The competencies, one group at a time (Basic, Common, then Core; US-06), each rated on three answers. Answers are
 * kept as the learner moves between parts and steps. Signed in, the result is saved to My Progress.
 */
function ReadinessCheck({ journey, qualification, onResult }: Omit<ReadinessStepProps, 'profile'>) {
  const code = qualification.code
  const groups = competencyGroups(qualification.competencies)
  const answers = useFinderStore((state) => state.answers[code]) ?? NO_ANSWERS
  const savedPart = useFinderStore((state) => state.parts[code] ?? 0)
  const answer = useFinderStore((state) => state.answer)
  const setPart = useFinderStore((state) => state.setPart)
  const setCheck = useFinderStore((state) => state.setCheck)
  const { learner, isSignedIn } = useAuth()
  const headingId = useId()
  const partHeading = useRef<HTMLHeadingElement>(null)
  const questions = useRef<HTMLDivElement>(null)
  // Where focus goes after the learner moves: the new part's heading, or the first skill still to rate. Not set on
  // the step's first showing. A new object each time, so pressing Analyze twice moves focus twice.
  const [focusRequest, setFocusRequest] = useState<{ target: 'part' | 'unrated' } | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const part = Math.min(Math.max(savedPart, 0), Math.max(groups.length - 1, 0))
  const total = qualification.competencies.length
  const rated = qualification.competencies.filter((competency) => answers[competency.id]).length

  useEffect(() => {
    const target = focusRequest?.target
    if (target === 'part') {
      partHeading.current?.scrollIntoView({ block: 'start' })
      partHeading.current?.focus({ preventScroll: true })
    } else if (target === 'unrated') {
      // The first skill still to rate, so the keyboard lands where the work is.
      const group = questions.current?.querySelector<HTMLElement>('[data-unrated] input')
      group?.scrollIntoView({ block: 'center' })
      group?.focus({ preventScroll: true })
    }
  }, [focusRequest])

  const submit = useMutation({
    mutationFn: ({
      sent,
      saveTo,
    }: {
      sent: Answers
      saveTo: { sessionId: string | null } | null
    }) => submitReadiness(code, sent, saveTo),
    onSuccess: (result, { sent, saveTo }) => {
      setCheck(code, { result, answers: sent, saved: saveTo !== null })
      onResult()
    },
    onError: (failure) => setMessage(failureMessage(failure)),
  })

  if (groups.length === 0) {
    return (
      <section aria-labelledby={headingId} className={shared.card}>
        <Heading id={headingId} name={qualification.name} />
        <p className={shared.muted}>{copy.none}</p>
      </section>
    )
  }

  const { category, competencies } = groups[part]
  const first = 1 + groups.slice(0, part).reduce((sum, group) => sum + group.competencies.length, 0)
  const isLast = part === groups.length - 1

  const goTo = (next: number) => {
    setFocusRequest({ target: 'part' })
    setMessage(null)
    setPart(code, next)
  }

  const analyze = () => {
    const unratedPart = groups.findIndex((group) =>
      group.competencies.some((competency) => !answers[competency.id]),
    )
    if (unratedPart !== -1) {
      // Nothing is sent until every skill is rated: the learner goes to the first one still to rate.
      setFocusRequest({ target: 'unrated' })
      setPart(code, unratedPart)
      setMessage(copy.unanswered(total - rated, groups[unratedPart].category))
      return
    }
    setMessage(null)
    const saveTo = isSignedIn
      ? { sessionId: ownsSession(learner, journey.sessionOwner) ? journey.sessionId : null }
      : null
    submit.mutate({ sent: { ...answers }, saveTo })
  }

  return (
    <section aria-labelledby={headingId} className={shared.card}>
      <Heading id={headingId} name={qualification.name} />

      <ProgressBar className={styles.progress} value={rated} maxValue={total || 1}>
        <Label className={styles.progressLabel}>{copy.progress(rated, total)}</Label>
        <span className={styles.track} aria-hidden="true">
          <i style={{ width: `${total ? (100 * rated) / total : 0}%` }} />
        </span>
      </ProgressBar>

      <div ref={questions} className={styles.part}>
        <h4 ref={partHeading} tabIndex={-1} className={styles.partHeading}>
          {groups.length > 1 ? copy.part(part + 1, groups.length, category) : copy.single(category)}
        </h4>
        <p className={shared.muted}>
          {en.qualification.categoryHelp[category] ?? en.qualification.categoryHelp.other}
        </p>
        <ol className={styles.questions}>
          {competencies.map((competency, i) => (
            <li key={competency.id} data-unrated={!answers[competency.id] || undefined}>
              <RadioGroup
                className={styles.question}
                orientation="horizontal"
                value={answers[competency.id] ?? null}
                onChange={(value) => {
                  answer(code, competency.id, value as Answer)
                  setMessage(null)
                }}
              >
                <Label className={styles.questionLabel}>
                  {first + i}. {competency.name}
                </Label>
                <div className={styles.options}>
                  {ANSWERS.map((value) => (
                    <Radio key={value} value={value} className={styles.option}>
                      {copy.answers[value]}
                    </Radio>
                  ))}
                </div>
              </RadioGroup>
            </li>
          ))}
        </ol>
      </div>

      {message && (
        <p role="alert" className={cx(shared.notice, shared.warning)}>
          {message}
        </p>
      )}

      <div className={styles.buttons}>
        {part > 0 && (
          <Button className={buttons.button} onPress={() => goTo(part - 1)}>
            <Icon name="arrowLeft" />
            {copy.previous}
          </Button>
        )}
        {isLast ? (
          <Button
            className={cx(buttons.button, buttons.primary)}
            onPress={analyze}
            isPending={submit.isPending}
          >
            {submit.isPending ? copy.analyzing : copy.analyze}
          </Button>
        ) : (
          <Button className={cx(buttons.button, buttons.primary)} onPress={() => goTo(part + 1)}>
            {copy.next(groups[part + 1].category)}
            <Icon name="arrowRight" />
          </Button>
        )}
      </div>
    </section>
  )
}

function Heading({ id, name }: { id: string; name: string }) {
  return (
    <CardHeading icon="checklist" id={id} kicker={copy.kicker} description={copy.lead(name)}>
      {copy.heading}
    </CardHeading>
  )
}
