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
import { cardFrame, muted } from './styles.ts'
import { ownsSession, useSaveJourney } from './useJourneySession.ts'
import { createWriteRequestIds, isCurrentLearner, requireCurrentLearner } from './writeRequests.ts'

/** The small labels over each row: "Need an idea? ...", "Or tell us in your own words". */
const rowLabel = 'm-0 text-12 font-bold tracking-[0.08em] text-ink uppercase'

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
    <section
      className={cx(
        cardFrame,
        'flex flex-col gap-4 rounded-18 p-[1.4rem] shadow-[0_3px_16px_rgb(var(--track-shadow-rgb)/0.02)] max-xs:rounded-14 max-xs:p-[1.1rem]',
      )}
      aria-labelledby={headingId}
    >
      <div className="flex items-center gap-[1.1rem] max-xs:items-start max-xs:gap-[0.8rem]">
        <span className="grid size-16 shrink-0 place-items-center rounded-16 bg-tint text-blue max-xs:size-12 max-xs:rounded-12">
          <Icon name="target" size={34} />
        </span>
        <div>
          <p className="m-0 text-11 leading-[1.6] font-bold tracking-[0.1em] text-muted uppercase">
            {en.finder.steps.count(1, 4)} · {en.finder.steps.names[0]}
          </p>
          <h2
            id={headingId}
            className="mt-[0.15rem] mb-[0.3rem] text-[1.6rem] leading-[1.2] text-navy max-xs:text-[1.3rem]"
          >
            {copy.heading}
          </h2>
          <p className="m-0 text-15 leading-[1.5] text-muted">{copy.lead}</p>
        </div>
      </div>

      <p className={rowLabel}>{copy.examplesLabel}</p>
      <ul className={choices} data-tour="goal-examples">
        {copy.examples.map((example) => (
          <li key={example.label}>
            <Button className={button({ variant: 'pill' })} onPress={() => fillGoal(example.goal)}>
              {example.label}
            </Button>
          </li>
        ))}
      </ul>

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
          <Label
            className={cx(
              rowLabel,
              "flex items-center gap-[0.9rem] after:h-px after:flex-1 after:bg-border after:content-['']",
            )}
          >
            {copy.ownWords}
          </Label>
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
              <Button className={button({ variant: 'chip' })} onPress={() => fillGoal(sample.goal)}>
                <Icon name="search" />
                {sample.label}
              </Button>
            </li>
          ))}
        </ul>

        <Button
          data-tour="goal-submit"
          type="submit"
          className={cx(button({ variant: 'primary', wide: true, height: 48 }), 'mt-1')}
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
        <div className="flex min-w-0 items-center gap-[0.9rem] rounded-14 border border-panel-border bg-panel px-4 py-[0.85rem] max-xs:flex-wrap">
          <span className="grid size-11 shrink-0 place-items-center rounded-12 bg-tint text-blue">
            <Icon name="document" size={24} />
          </span>
          <div className="min-w-0 flex-1">
            <strong className="text-14 font-[650] text-navy">{copy.last}</strong>
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
