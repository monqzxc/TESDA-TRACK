import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import { Button, Label, ProgressBar, Radio, RadioGroup } from 'react-aria-components'
import type { Qualification } from '../../api/queries.ts'
import { failureMessage } from '../../auth/fields.tsx'
import { useAuth } from '../../auth/useAuth.ts'
import { Icon } from '../../components/Icon.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { competencyGroups } from '../../lib/qualifications.ts'
import { cx } from '../../lib/style.ts'
import { button } from '../../styles/buttons.ts'
import { pathwayQuery, submitReadiness } from './api.ts'
import { CardHeading } from './CardHeading.tsx'
import { useFinderStore, type Answer, type Answers, type Journey, type Profile } from './store.ts'
import { ownsSession } from './useJourneySession.ts'
import { card, muted, notice } from './styles.ts'
import { createWriteRequestIds, isCurrentLearner, requireCurrentLearner } from './writeRequests.ts'

const ANSWERS: readonly Answer[] = ['confident', 'some_experience', 'not_familiar']
const NO_ANSWERS: Answers = {}

/** An answer, drawn as a pill with its own round mark. Phones give each answer a row. */
const answerPill = cx(
  'inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-border bg-surface px-[0.85rem] py-[0.35rem] text-14 text-ink max-xs:flex-[1_1_100%]',
  "before:box-border before:size-4 before:flex-none before:rounded-full before:border-2 before:border-dash before:bg-surface before:content-['']",
  'data-hovered:border-hover-border data-selected:border-fill data-selected:bg-tint data-selected:font-semibold data-selected:text-navy data-selected:before:border-5 data-selected:before:border-fill',
  'data-focus-visible:outline-3 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus',
)

interface ReadinessStepProps {
  journey: Journey
  qualification: Qualification
  /** The goal's profile with the learner's answers, for "Why we ask". */
  profile: Profile
  /** The check went through: on to the pathway. */
  onResult: () => void
}

/** Readiness check (classic/app.py show_why_we_ask and show_readiness). */
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
  const en = useCopy()

  const pathway = useQuery(pathwayQuery(profile, code))
  const headingId = useId()
  if (!pathway.data) return null
  return (
    <section aria-labelledby={headingId} className={card}>
      <CardHeading icon="lightbulb" id={headingId}>
        {en.finder.why.heading}
      </CardHeading>
      <p className="mt-[0.9rem] mb-[0.4rem] text-15 leading-[1.6] text-ink">
        {pathway.data.reason}
      </p>
      <p className={muted}>
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
  const en = useCopy()
  const copy = en.finder.readiness

  const code = qualification.code
  const groups = competencyGroups(qualification.competencies)
  const answers = useFinderStore((state) => state.answers[code]) ?? NO_ANSWERS
  const savedPart = useFinderStore((state) => state.parts[code] ?? 0)
  const answer = useFinderStore((state) => state.answer)
  const setPart = useFinderStore((state) => state.setPart)
  const setCheck = useFinderStore((state) => state.setCheck)
  const { learner } = useAuth()
  const queryClient = useQueryClient()
  const requests = useRef(createWriteRequestIds())
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
      ownerId,
    }: {
      sent: Answers
      saveTo: { sessionId: string | null; requestId: string } | null
      ownerId: string | null
    }) => {
      requireCurrentLearner(queryClient, ownerId)
      return submitReadiness(code, sent, saveTo)
    },
    onSuccess: (result, { sent, saveTo, ownerId }) => {
      if (saveTo) requests.current.complete('readiness', saveTo.requestId)
      if (!isCurrentLearner(queryClient, ownerId)) return
      setCheck(code, { result, answers: sent, saved: saveTo !== null })
      onResult()
    },
    onError: (failure) => setMessage(copy.failed(failureMessage(failure))),
  })

  if (groups.length === 0) {
    return (
      <section aria-labelledby={headingId} className={card}>
        <Heading id={headingId} name={qualification.name} />
        <p className={muted}>{copy.none}</p>
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
    const ownerId = learner?.id ?? null
    const sessionId = ownsSession(learner, journey.sessionOwner) ? journey.sessionId : null
    const sent = { ...answers }
    const saveTo = ownerId
      ? {
          sessionId,
          requestId: requests.current.for('readiness', ownerId, { code, answers: sent, sessionId }),
        }
      : null
    submit.mutate({ sent, saveTo, ownerId })
  }

  return (
    <section aria-labelledby={headingId} className={card}>
      <Heading id={headingId} name={qualification.name} />

      <ProgressBar
        data-tour="readiness-progress"
        className="mt-[1.1rem] mb-1 flex flex-col gap-[0.4rem]"
        value={rated}
        maxValue={total || 1}
      >
        <Label className="text-14 text-ink">{copy.progress(rated, total)}</Label>
        <span className="h-2 overflow-hidden rounded-full bg-bar" aria-hidden="true">
          <i
            className="block h-full rounded-[inherit] bg-blue transition-[width] duration-250 ease-[ease]"
            style={{ width: `${total ? (100 * rated) / total : 0}%` }}
          />
        </span>
      </ProgressBar>

      <div ref={questions} className="mt-4">
        <h4
          ref={partHeading}
          tabIndex={-1}
          className="mt-0 mb-[0.2rem] scroll-mt-28 font-text text-16 font-bold tracking-normal text-navy focus:outline-none"
        >
          {groups.length > 1 ? copy.part(part + 1, groups.length, category) : copy.single(category)}
        </h4>
        <p className={muted}>
          {en.qualification.categoryHelp[category] ?? en.qualification.categoryHelp.other}
        </p>
        <ol className="mt-[0.9rem] mb-0 flex list-none flex-col gap-[0.6rem] p-0">
          {competencies.map((competency, i) => (
            <li key={competency.id} data-unrated={!answers[competency.id] || undefined}>
              <RadioGroup
                data-tour="readiness-question"
                className="flex flex-col gap-2 rounded-12 border border-panel-border bg-panel px-[0.95rem] py-[0.85rem]"
                orientation="horizontal"
                value={answers[competency.id] ?? null}
                onChange={(value) => {
                  answer(code, competency.id, value as Answer)
                  setMessage(null)
                }}
              >
                <Label className="text-15 leading-[1.45] font-semibold text-navy">
                  {first + i}. {competency.name}
                </Label>
                <div className="flex flex-wrap gap-[0.45rem]">
                  {ANSWERS.map((value) => (
                    <Radio key={value} value={value} className={answerPill}>
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
        <p role="alert" className={notice('warning')}>
          {message}
        </p>
      )}

      <div
        data-tour="readiness-actions"
        className="mt-[1.1rem] flex flex-wrap justify-between gap-3 [&>:only-child]:ml-auto"
      >
        {part > 0 && (
          <Button className={button()} onPress={() => goTo(part - 1)}>
            <Icon name="arrowLeft" />
            {copy.previous}
          </Button>
        )}
        {isLast ? (
          <Button
            className={button({ variant: 'primary' })}
            onPress={analyze}
            isPending={submit.isPending}
          >
            {submit.isPending ? copy.analyzing : copy.analyze}
          </Button>
        ) : (
          <Button className={button({ variant: 'primary' })} onPress={() => goTo(part + 1)}>
            {copy.next(groups[part + 1].category)}
            <Icon name="arrowRight" />
          </Button>
        )}
      </div>
    </section>
  )
}

function Heading({ id, name }: { id: string; name: string }) {
  const en = useCopy()
  const copy = en.finder.readiness

  return (
    <CardHeading icon="checklist" id={id} kicker={copy.kicker} description={copy.lead(name)}>
      {copy.heading}
    </CardHeading>
  )
}
