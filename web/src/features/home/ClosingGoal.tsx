import { useRef, useState, type FormEvent } from 'react'
import { FieldError, Label, Text, TextArea, TextField } from 'react-aria-components'
import { useNavigate } from 'react-router'
import { en } from '../../copy/en.ts'
import { paths } from '../../paths.ts'
import utilities from '../../styles/utilities.module.css'
import { GOAL_MAX_LENGTH, useFinderStore } from '../finder/store.ts'
import { Glyph } from './Glyph.tsx'
import { Reveal } from './Reveal.tsx'
import { cx } from '../../lib/style.ts'
import shared from './shared.module.css'
import styles from './ClosingGoal.module.css'

const copy = en.home.closing

/**
 * The goal box at the end of the page. Submitting opens Find my path with the goal in the finder's store (session
 * storage), never in the address, where the learner can change it before getting matches.
 */
export function ClosingGoal() {
  const navigate = useNavigate()
  const startWithGoal = useFinderStore((state) => state.startWithGoal)
  const [goal, setGoal] = useState('')
  const [error, setError] = useState<string | null>(null)
  const field = useRef<HTMLTextAreaElement>(null)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!goal.trim()) {
      // The instruction shows beside the box, and focus goes back to it, so it's read out (US-01).
      setError(copy.empty)
      field.current?.focus()
      return
    }
    startWithGoal(goal)
    void navigate(paths.finder)
  }

  return (
    <section
      id="start"
      aria-labelledby="start-title"
      className={cx(shared.band, shared.section, styles.closing)}
    >
      <div className={cx(shared.wrap, styles.inner)}>
        <Reveal>
          <div className={shared.eyebrow}>{copy.eyebrow}</div>
          <h2 id="start-title">{copy.heading}</h2>
          <p>{copy.lead}</p>
        </Reveal>
        <Reveal order={1}>
          <form className={styles.form} onSubmit={submit} noValidate>
            <TextField
              className={styles.field}
              value={goal}
              onChange={(value) => {
                setGoal(value)
                setError(null)
              }}
              maxLength={GOAL_MAX_LENGTH}
              isRequired
              isInvalid={error !== null}
              validationBehavior="aria"
            >
              <Label className={styles.label}>{copy.label}</Label>
              <TextArea ref={field} className={styles.textarea} placeholder={copy.placeholder} />
              <div className={styles.under}>
                <FieldError className={styles.error}>{error}</FieldError>
                <Text slot="description" className={styles.count}>
                  <span aria-hidden="true">{copy.count(goal.length, GOAL_MAX_LENGTH)}</span>
                  <span className={utilities.visuallyHidden}>
                    {copy.countLabel(goal.length, GOAL_MAX_LENGTH)}
                  </span>
                </Text>
              </div>
            </TextField>
            <button type="submit" className={cx(shared.btn, shared.signal, styles.submit)}>
              {copy.submit}
              <Glyph name="arrow" />
            </button>
            <p className={styles.note}>{copy.note}</p>
          </form>
        </Reveal>
      </div>
    </section>
  )
}
