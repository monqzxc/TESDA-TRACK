import { useMutation } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import { Button } from 'react-aria-components'
import { failureMessage } from '../../auth/fields.tsx'
import { Icon } from '../../components/Icon.tsx'
import { en } from '../../copy/en.ts'
import { focusIsLost } from '../../lib/focus.ts'
import { cx } from '../../lib/style.ts'
import { button } from '../../styles/buttons.ts'
import { explainFeedback, sendFeedback, type FeedbackReason } from './api.ts'
import { useFinderStore, type GivenFeedback, type Profile, type SubmittedCheck } from './store.ts'
import { notice } from './styles.ts'

const copy = en.finder.pathway.feedback
const REASONS = Object.keys(copy.reasons) as FeedbackReason[]

/** In the corner of the screen, above the page and below the account notice (z-90) and dialogs (z-100). */
const floating =
  'fixed right-4 bottom-4 z-80 shadow-[0_18px_40px_-16px_rgb(var(--track-shadow-rgb)/0.45)]'

const panel =
  'flex w-[22rem] flex-col gap-3 rounded-16 border border-pill-border bg-surface p-4 outline-none max-xs:left-4 max-xs:w-auto'

/** Hide for now, tucked: small, round and filled, so it's still easy to spot. */
const pill =
  'inline-flex min-h-11 animate-notice cursor-pointer items-center gap-2 rounded-full border border-fill bg-fill py-2 pr-[1.1rem] pl-4 text-14 font-[650] text-white hovered:border-fill-hover hovered:bg-fill-hover data-pressed:translate-y-px'

const cornerButton =
  '-my-1 -mr-1 grid size-9 shrink-0 cursor-pointer place-items-center rounded-10 border-0 bg-transparent text-muted hovered:bg-soft hovered:text-navy'

/**
 * Arriving when the pathway first shows (it rises in after the step and rings to be noticed), tucked into a button by
 * Hide for now, open again from that button, or closed.
 */
type Shown = 'arriving' | 'open' | 'tucked' | 'closed'

/** Yes, or No with its reason: nothing is left to ask. */
function finished(given: GivenFeedback | undefined): boolean {
  return !!given && (given.satisfied || !!given.reason)
}

interface FeedbackPromptProps {
  code: string
  check: SubmittedCheck
  /** What the matches were asked with, so the API can work the recommendation out again. */
  asked: { query: string; profile: Profile }
}

/**
 * "Are you satisfied with this recommendation?", floating in the corner of the screen under the recommendation, so
 * the learner sees it without scrolling to the end. Only its box floats: it keeps its place in the page after the
 * pathway, for the keyboard and screen readers. Hide for now tucks it into a small button that brings it back, and an
 * answer already given isn't asked again when the learner comes back to the page.
 *
 * Yes and No carry the same weight, so the buttons don't lean either way. The answer is sent as soon as it's given, so
 * a No counts even if the learner leaves; after a No, one optional reason says which part missed: the match, the
 * readiness result or the pathway.
 */
export function FeedbackPrompt({ code, check, asked }: FeedbackPromptProps) {
  const given = useFinderStore((state) => state.feedback[code])
  const setFeedback = useFinderStore((state) => state.setFeedback)
  const [shown, setShown] = useState<Shown>(() => (finished(given) ? 'closed' : 'arriving'))
  const [givenBefore] = useState(given)
  const headingId = useId()
  const box = useRef<HTMLElement>(null)
  const thanks = useRef<HTMLParagraphElement>(null)
  const reopen = useRef<HTMLButtonElement>(null)
  const moved = useRef(false)
  const answer = useMutation({
    mutationFn: (satisfied: boolean) =>
      sendFeedback({ ...asked, qualification_code: code, answers: check.answers, satisfied }),
    onSuccess: (feedback) => setFeedback(code, feedback),
  })
  const explain = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: FeedbackReason }) =>
      explainFeedback(id, reason),
    onSuccess: (feedback) => setFeedback(code, feedback),
  })
  const failure = answer.error ?? explain.error

  // The button pressed goes away with the answer, so focus goes to what took its place. Not on the page's first
  // showing, with an answer from before.
  useEffect(() => {
    if (given && given !== givenBefore && focusIsLost()) thanks.current?.focus()
  }, [given, givenBefore])

  // Hide for now, the button that brings the question back, and Close each go away when pressed: focus goes to what
  // replaced them, or back to the page.
  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    if (!focusIsLost()) return
    if (shown === 'tucked') reopen.current?.focus()
    else if (shown === 'open') box.current?.focus()
    else if (shown === 'closed') document.getElementById('main')?.focus({ preventScroll: true })
  }, [shown])

  const show = (next: Shown) => {
    moved.current = true
    setShown(next)
  }

  if (shown === 'closed') return null
  if (shown === 'tucked') {
    return (
      <Button ref={reopen} onPress={() => show('open')} className={cx(floating, pill)}>
        <Icon name="chat" size="1.15rem" />
        {copy.reopen}
      </Button>
    )
  }

  const done = finished(given)
  let body
  if (!given) {
    body = (
      <>
        <p className="m-0 text-13 leading-[1.5] text-muted">{copy.help}</p>
        <div role="group" aria-labelledby={headingId} className="flex gap-2">
          {([true, false] as const).map((satisfied) => (
            <Button
              key={String(satisfied)}
              className={cx(button({ height: 36, text: 14 }), 'flex-1')}
              isPending={answer.isPending && answer.variables === satisfied}
              isDisabled={answer.isPending && answer.variables !== satisfied}
              onPress={() => answer.mutate(satisfied)}
            >
              {satisfied ? copy.yes : copy.no}
            </Button>
          ))}
        </div>
      </>
    )
  } else if (!done) {
    body = (
      <>
        <p ref={thanks} tabIndex={-1} className="m-0 text-14 leading-[1.5] text-ink outline-none">
          {copy.why}
        </p>
        <div role="group" aria-label={copy.reasonsLabel} className="flex flex-col gap-2">
          {REASONS.map((reason) => (
            <Button
              key={reason}
              className={button({ height: 36, text: 13, snug: true, wide: true })}
              isPending={explain.isPending && explain.variables?.reason === reason}
              isDisabled={explain.isPending && explain.variables?.reason !== reason}
              onPress={() => explain.mutate({ id: given.id, reason })}
            >
              {copy.reasons[reason]}
            </Button>
          ))}
        </div>
      </>
    )
  } else {
    body = (
      <p ref={thanks} tabIndex={-1} className="m-0 text-14 leading-[1.5] text-ink outline-none">
        {given.satisfied ? copy.thanks : copy.explained}
      </p>
    )
  }

  return (
    <section
      ref={box}
      tabIndex={-1}
      aria-labelledby={headingId}
      className={cx(floating, panel, shown === 'arriving' ? 'animate-float-in' : 'animate-notice')}
    >
      <div className="flex items-center gap-3">
        <span
          className={cx(
            'grid size-9 shrink-0 place-items-center rounded-full',
            done ? 'bg-good-bg text-good-ink' : 'bg-tint text-blue',
          )}
        >
          <Icon name={done ? 'tick' : 'chat'} size="1.15rem" />
        </span>
        <h3 id={headingId} className="m-0 flex-1 text-15 leading-[1.35] font-bold text-navy">
          {copy.question}
        </h3>
        <Button
          aria-label={done ? copy.close : copy.later}
          onPress={() => show(done ? 'closed' : 'tucked')}
          className={cornerButton}
        >
          <Icon name={done ? 'close' : 'chevron'} size="1.1rem" />
        </Button>
      </div>
      {body}
      {failure && (
        <p role="alert" className={notice('warning')}>
          {failureMessage(failure)}
        </p>
      )}
    </section>
  )
}
