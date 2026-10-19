import { useMutation } from '@tanstack/react-query'
import { useId, useRef, useState, type FormEvent } from 'react'
import { Button, FieldError, Label, Text, TextArea, TextField } from 'react-aria-components'
import { useNavigate } from 'react-router'
import { failureMessage } from '../../auth/fields.tsx'
import { useAuth, useRequireAccount } from '../../auth/useAuth.ts'
import { Icon } from '../../components/Icon.tsx'
import { en } from '../../copy/en.ts'
import { cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'
import buttons from '../../styles/buttons.module.css'
import utilities from '../../styles/utilities.module.css'
import { analyzeGoal } from './api.ts'
import { GOAL_MAX_LENGTH, useFinderStore } from './store.ts'
import { ownsSession, useSaveJourney } from './useJourneySession.ts'
import shared from './finder.module.css'
import styles from './GoalStep.module.css'

const copy = en.finder.goal

/**
 * Your goal (frontend/app.py show_goal): examples that fill the goal box without sending it, the box itself, and
 * "Get recommendation". A new goal starts a new journey (US-01). Signed in, the goal starts a saved
 * recommendation session.
 */
export function GoalStep() {
  const goal = useFinderStore((state) => state.goal)
  const setGoal = useFinderStore((state) => state.setGoal)
  const journey = useFinderStore((state) => state.journey)
  const selected = useFinderStore((state) => state.selected)
  const begin = useFinderStore((state) => state.begin)
  const { learner, isSignedIn } = useAuth()
  const requireAccount = useRequireAccount()
  const { save, pending: saving } = useSaveJourney()
  const navigate = useNavigate()
  const field = useRef<HTMLTextAreaElement>(null)
  const [error, setError] = useState<string | null>(null)
  const headingId = useId()

  const analyze = useMutation({
    mutationFn: ({ query, signedIn }: { query: string; signedIn: boolean }) =>
      analyzeGoal(query, signedIn),
    onSuccess: ({ profile, sessionId }, { query }) => {
      begin({ query, profile, sessionId, sessionOwner: sessionId ? (learner?.id ?? null) : null })
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
    analyze.mutate({ query, signedIn: isSignedIn })
  }

  const fillGoal = (text: string) => {
    setGoal(text)
    setError(null)
  }

  return (
    <section className={cx(shared.card, styles.panel)} aria-labelledby={headingId}>
      <div className={styles.heading}>
        <span className={styles.headingIcon}>
          <Icon name="target" size={34} />
        </span>
        <div>
          <p className={styles.count}>
            {en.finder.steps.count(1, 4)} · {en.finder.steps.names[0]}
          </p>
          <h2 id={headingId}>{copy.heading}</h2>
          <p className={styles.lead}>{copy.lead}</p>
        </div>
      </div>

      <p className={styles.label}>{copy.examplesLabel}</p>
      <ul className={styles.examples}>
        {copy.examples.map((example) => (
          <li key={example.label}>
            <Button
              className={cx(buttons.button, buttons.pill)}
              onPress={() => fillGoal(example.goal)}
            >
              {example.label}
            </Button>
          </li>
        ))}
      </ul>

      {/* No Enter-to-send: the sample goals sit between the box and its button, as in the Streamlit app. */}
      <form className={styles.form} onSubmit={submit} noValidate>
        <TextField
          className={styles.field}
          value={goal}
          onChange={fillGoal}
          maxLength={GOAL_MAX_LENGTH}
          isRequired
          isInvalid={error !== null}
          validationBehavior="aria"
        >
          <Label className={cx(styles.label, styles.rule)}>{copy.ownWords}</Label>
          <TextArea ref={field} className={styles.textarea} placeholder={copy.placeholder} />
          <div className={styles.under}>
            <FieldError className={styles.error}>{error}</FieldError>
            <Text slot="description" className={styles.counter}>
              <span aria-hidden="true">{`${goal.length}/${GOAL_MAX_LENGTH}`}</span>
              <span className={utilities.visuallyHidden}>
                {en.home.closing.countLabel(goal.length, GOAL_MAX_LENGTH)}
              </span>
            </Text>
          </div>
        </TextField>

        <p className={styles.samplesLabel}>{copy.samplesLabel}</p>
        <ul className={styles.samples}>
          {copy.samples.map((sample) => (
            <li key={sample.label}>
              <Button
                className={cx(buttons.button, buttons.chip)}
                onPress={() => fillGoal(sample.goal)}
              >
                <Icon name="search" />
                {sample.label}
              </Button>
            </li>
          ))}
        </ul>

        <Button
          type="submit"
          className={cx(buttons.button, buttons.primary, buttons.wide, styles.submit)}
          isPending={analyze.isPending}
        >
          {analyze.isPending ? copy.pending : copy.submit}
          <Icon name="arrowRight" />
        </Button>
      </form>

      {/* Signed in, a goal is saved as it's sent. A goal sent before signing in can be saved now (US-02). */}
      {journey && !ownsSession(learner, journey.sessionOwner) ? (
        <Button
          className={cx(buttons.button, buttons.tertiary, styles.save)}
          isPending={saving}
          onPress={() => requireAccount(() => void save(selected))}
        >
          <Icon name="bookmark" />
          {isSignedIn ? en.finder.summary.save : copy.signInToSave}
        </Button>
      ) : (
        isSignedIn && <p className={shared.muted}>{copy.saved}</p>
      )}

      {journey && (
        <div className={styles.last}>
          <span className={styles.lastIcon}>
            <Icon name="document" size={24} />
          </span>
          <div className={styles.lastText}>
            <strong>{copy.last}</strong>
            <p>{journey.query}</p>
          </div>
          <Button className={buttons.button} onPress={() => fillGoal(journey.query)}>
            <Icon name="refresh" />
            {copy.useAgain}
          </Button>
        </div>
      )}
    </section>
  )
}
