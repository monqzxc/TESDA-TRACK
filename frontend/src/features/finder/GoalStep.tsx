import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useRef, useState, type FormEvent } from 'react'
import { Button, FieldError, Label, Text, TextArea, TextField } from 'react-aria-components'
import { useNavigate } from 'react-router'
import { failureMessage } from '../../auth/fields.tsx'
import { useAuth, useRequireAccount } from '../../auth/useAuth.ts'
import { Icon } from '../../components/Icon.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'
import { button } from '../../styles/buttons.ts'
import { analyzeGoal } from './api.ts'
import { GOAL_MAX_LENGTH, useFinderStore } from './store.ts'
import { card, muted } from './styles.ts'
import { ownsSession, useSaveJourney } from './useJourneySession.ts'
import { createWriteRequestIds, isCurrentLearner, requireCurrentLearner } from './writeRequests.ts'

/** The labels over each row: "Need an idea? ...", "Or tell us in your own words". */
const rowLabel = 'm-0 text-14 leading-[1.4] font-semibold text-navy'

const choices = 'm-0 flex list-none flex-wrap gap-2 p-0'

/**
 * Your goal (classic/app.py show_goal): examples that fill the goal box without sending it, the box itself, and
 * "Get recommendation". A new goal starts a new journey (US-01). Signed in, the goal starts a saved
 * recommendation session.
 */
export function GoalStep() {
  const en = useCopy()
  const copy = en.finder.goal

  const goal = useFinderStore((state) => state.goal)
  const setGoal = useFinderStore((state) => state.setGoal)
  const journey = useFinderStore((state) => state.journey)
  const selected = useFinderStore((state) => state.selected)
  const begin = useFinderStore((state) => state.begin)
  const { learner, isSignedIn, offersAccounts } = useAuth()
  const requireAccount = useRequireAccount()
  const { save, pending: saving } = useSaveJourney()
  const navigate = useNavigate()
  const field = useRef<HTMLTextAreaElement>(null)
  const [error, setError] = useState<string | null>(null)
  const headingId = useId()
  const queryClient = useQueryClient()
  const requests = useRef(createWriteRequestIds())

  const analyze = useMutation({
    mutationFn: ({
      query,
      ownerId,
      requestId,
    }: {
      query: string
      ownerId: string | null
      requestId: string | null
    }) => {
      requireCurrentLearner(queryClient, ownerId)
      return analyzeGoal(query, requestId)
    },
    onSuccess: ({ profile, sessionId }, { query, ownerId, requestId }) => {
      if (requestId) requests.current.complete('goal', requestId)
      if (!isCurrentLearner(queryClient, ownerId)) return
      begin({ query, profile, sessionId, sessionOwner: sessionId ? ownerId : null })
      void navigate(paths.finderMatches)
    },
    onError: (failure) => setError(failureMessage(failure)),
  })

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const query = goal.trim()
    if (!query) {
      // The instruction shows beside the box, and focus goes back to it, so it's read out (US-01).
      setError(copy.empty)
      field.current?.focus()
      return
    }
    setError(null)
    const ownerId = learner?.id ?? null
    const requestId = ownerId ? requests.current.for('goal', ownerId, { query }) : null
    analyze.mutate({ query, ownerId, requestId })
  }

  const fillGoal = (text: string) => {
    setGoal(text)
    setError(null)
  }

  // After classic/styles.css's .st-key-finder_panel: the step's heading, its two rows of ideas and the last goal, as
  // one card.
  return (
    <section className={cx(card, 'flex flex-col gap-5 py-6')} aria-labelledby={headingId}>
      <div>
        <h2
          id={headingId}
          className="m-0 text-24 leading-[1.25] font-bold tracking-[-0.015em] text-navy max-xs:text-20"
        >
          {copy.heading}
        </h2>
        <p className="mt-[0.35rem] mb-0 max-w-[62ch] text-15 leading-[1.5] text-muted">
          {copy.lead}
        </p>
      </div>

      <div className="flex flex-col gap-[0.6rem]">
        <p className={rowLabel}>{copy.examplesLabel}</p>
        <ul className={choices} data-tour="goal-examples">
          {copy.examples.map((example) => (
            <li key={example.label}>
              <Button
                className={button({ variant: 'secondary', text: 14 })}
                onPress={() => fillGoal(example.goal)}
              >
                {example.label}
              </Button>
            </li>
          ))}
        </ul>
      </div>

      {/* No Enter-to-send: the sample goals sit between the box and its button, as in the Streamlit app. */}
      <form className="flex flex-col gap-3" onSubmit={submit} noValidate>
        <TextField
          className="flex flex-col gap-[0.6rem]"
          value={goal}
          onChange={fillGoal}
          maxLength={GOAL_MAX_LENGTH}
          isRequired
          isInvalid={error !== null}
          validationBehavior="aria"
        >
          <Label className={rowLabel}>{copy.ownWords}</Label>
          <TextArea
            data-tour="goal-input"
            ref={field}
            className="min-h-[110px] w-full resize-y rounded-12 border border-hover-border bg-surface px-[0.9rem] py-3 text-16 leading-[1.5] text-navy placeholder:text-muted placeholder:opacity-100 data-focused:border-blue data-hovered:border-blue data-invalid:border-warn-ink"
            placeholder={copy.placeholder}
          />
          <div className="-mt-1 flex justify-between gap-4">
            {/* Words as well as color say what's wrong (US-13). */}
            <FieldError className="text-14 font-semibold text-warn-ink">{error}</FieldError>
            <Text slot="description" className="ml-auto text-13 text-muted">
              <span aria-hidden="true">{`${goal.length}/${GOAL_MAX_LENGTH}`}</span>
              <span className="sr-only">
                {en.home.closing.countLabel(goal.length, GOAL_MAX_LENGTH)}
              </span>
            </Text>
          </div>
        </TextField>

        <p className="m-0 text-14 text-muted">{copy.samplesLabel}</p>
        {/* On phones, one swipeable row of sample goals instead of six stacked rows; the cut-off last one shows
            there's more. */}
        <ul
          className={cx(
            choices,
            'max-xs:mx-[-1.1rem] max-xs:[scrollbar-width:none] max-xs:flex-nowrap max-xs:overflow-x-auto max-xs:px-[1.1rem] max-xs:[&::-webkit-scrollbar]:hidden max-xs:[&>li]:shrink-0',
          )}
        >
          {copy.samples.map((sample) => (
            <li key={sample.label}>
              <Button
                className={button({ variant: 'chip', height: 36, text: 13 })}
                onPress={() => fillGoal(sample.goal)}
              >
                {sample.label}
              </Button>
            </li>
          ))}
        </ul>

        <Button
          data-tour="goal-submit"
          type="submit"
          className={cx(
            button({ variant: 'primary', height: 48 }),
            'mt-2 self-start max-xs:self-stretch',
          )}
          isPending={analyze.isPending}
        >
          {analyze.isPending ? copy.pending : copy.submit}
          <Icon name="arrowRight" />
        </Button>
      </form>

      {/* Signed in, a goal is saved as it's sent. A goal sent before signing in can be saved now (US-02). */}
      {journey && offersAccounts && !ownsSession(learner, journey.sessionOwner) ? (
        <Button
          className={cx(button({ variant: 'tertiary' }), 'self-start')}
          isPending={saving}
          onPress={() => requireAccount(() => void save(selected))}
        >
          <Icon name="bookmark" />
          {isSignedIn ? en.finder.summary.save : copy.signInToSave}
        </Button>
      ) : (
        isSignedIn && <p className={muted}>{copy.saved}</p>
      )}

      {journey && (
        <div className="flex min-w-0 items-center gap-4 rounded-12 bg-panel px-4 py-3 max-xs:flex-wrap">
          <div className="min-w-0 flex-1">
            <strong className="text-13 font-semibold text-muted">{copy.last}</strong>
            <p className="mt-[0.1rem] mb-0 text-15 leading-[1.5] wrap-anywhere text-ink">
              {journey.query}
            </p>
          </div>
          <Button className={button()} onPress={() => fillGoal(journey.query)}>
            <Icon name="refresh" />
            {copy.useAgain}
          </Button>
        </div>
      )}
    </section>
  )
}
