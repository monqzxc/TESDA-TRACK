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

/** One input; the API resolves and preserves the concrete strategy for the entire journey. */
export function GoalStep() {
  const en = useCopy()
  const copy = en.finder.unified
  const goal = useFinderStore((state) => state.goal)
  const skills = useFinderStore((state) => state.skills)
  const searchMode = useFinderStore((state) => state.searchMode)
  const setGoal = useFinderStore((state) => state.setGoal)
  const setSearchMode = useFinderStore((state) => state.setSearchMode)
  const journey = useFinderStore((state) => state.journey)
  const selected = useFinderStore((state) => state.selected)
  const begin = useFinderStore((state) => state.begin)
  // Keep both legacy drafts intact; editing the unified field promotes its text to the goal draft.
  const draft = searchMode === 'skills' ? skills : goal
  const fill = (text: string) => {
    setGoal(text)
    setSearchMode('goal')
    setError(null)
  }
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
      return analyzeGoal(query, requestId, {
        beforeSave: () => requireCurrentLearner(queryClient, ownerId),
      })
    },
    onSuccess: ({ profile, sessionId, mode }, { query, ownerId, requestId }) => {
      if (requestId) requests.current.complete('goal', requestId)
      if (!isCurrentLearner(queryClient, ownerId)) return
      begin({ query, profile, sessionId, sessionOwner: sessionId ? ownerId : null, mode })
      void navigate(paths.finderMatches)
    },
    onError: (failure) => setError(failureMessage(failure)),
  })
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const query = draft.trim()
    if (!query) {
      setError(copy.empty)
      field.current?.focus()
      return
    }
    setError(null)
    const ownerId = learner?.id ?? null
    const requestId = ownerId ? requests.current.for('goal', ownerId, { query }) : null
    analyze.mutate({ query, ownerId, requestId })
  }
  return (
    <section
      className={cx(card, 'relative flex flex-col gap-6 overflow-hidden py-7 sm:py-9')}
      aria-labelledby={headingId}
    >
      <div className="flex flex-col gap-3">
        <p className="m-0 text-12 font-bold tracking-[0.14em] text-blue">{copy.eyebrow}</p>
        <h2
          id={headingId}
          className="text-32 m-0 max-w-[24ch] leading-[1.15] font-bold tracking-[-0.025em] text-navy max-xs:text-24"
        >
          {copy.heading}
        </h2>
        <p className="m-0 max-w-[65ch] text-16 leading-[1.65] text-muted">{copy.lead}</p>
      </div>
      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <TextField
          className="flex flex-col gap-2"
          value={draft}
          onChange={fill}
          maxLength={GOAL_MAX_LENGTH}
          isRequired
          isInvalid={error !== null}
          validationBehavior="aria"
        >
          <Label className="text-15 font-semibold text-navy">{copy.label}</Label>
          <TextArea
            data-tour="goal-input"
            ref={field}
            rows={4}
            className="min-h-[136px] w-full resize-y rounded-14 border border-hover-border bg-surface px-4 py-4 text-16 leading-[1.6] text-navy placeholder:text-muted data-focused:border-blue data-focused:outline-2 data-focused:outline-focus data-invalid:border-warn-ink"
            placeholder={copy.placeholder}
          />
          <div className="flex flex-wrap items-start justify-between gap-2">
            <Text slot="description" className="text-13 leading-[1.5] text-muted">
              {copy.help}
            </Text>
            <span
              className="text-13 text-muted"
              aria-label={en.home.closing.countLabel(draft.length, GOAL_MAX_LENGTH)}
            >
              {draft.length}/{GOAL_MAX_LENGTH}
            </span>
          </div>
          <FieldError className="text-14 font-semibold text-warn-ink">{error}</FieldError>
        </TextField>
        <div>
          <p className="mt-0 mb-2 text-13 font-semibold text-muted">{copy.ideas}</p>
          <ul data-tour="goal-examples" className="m-0 flex list-none flex-wrap gap-2 p-0">
            {copy.examples.map((example) => (
              <li key={example} className="max-w-full">
                <Button
                  className={cx(
                    button({ variant: 'chip', text: 13 }),
                    'h-auto min-h-10 max-w-full py-2 text-left whitespace-normal',
                  )}
                  onPress={() => fill(example)}
                >
                  {example}
                </Button>
              </li>
            ))}
          </ul>
        </div>
        <Button
          data-tour="goal-submit"
          type="submit"
          className={cx(
            button({ variant: 'primary', height: 48 }),
            'mt-2 self-start max-xs:w-full',
          )}
          isPending={analyze.isPending}
        >
          {analyze.isPending ? en.finder.goal.pending : copy.submit}
          <Icon name="arrowRight" />
        </Button>
      </form>
      {journey &&
        journey.mode !== 'skills' &&
        offersAccounts &&
        !ownsSession(learner, journey.sessionOwner) && (
          <Button
            className={cx(button({ variant: 'tertiary' }), 'self-start')}
            isPending={saving}
            onPress={() => requireAccount(() => void save(selected))}
          >
            <Icon name="bookmark" />
            {isSignedIn ? en.finder.summary.save : en.finder.goal.signInToSave}
          </Button>
        )}
      {journey?.sessionId && <p className={muted}>{copy.saved}</p>}
      {journey && (
        <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-12 bg-panel p-4">
          <div className="min-w-0 flex-1">
            <strong className="text-13 text-muted">{copy.last}</strong>
            <p className="mt-1 mb-0 text-15 wrap-anywhere text-ink">{journey.query}</p>
          </div>
          <Button className={button()} onPress={() => fill(journey.query)}>
            <Icon name="refresh" />
            {en.finder.goal.useAgain}
          </Button>
        </div>
      )}
    </section>
  )
}
