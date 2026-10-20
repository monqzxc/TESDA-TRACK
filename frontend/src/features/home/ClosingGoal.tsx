import { useRef, useState, type FormEvent } from 'react'
import { FieldError, Label, Text, TextArea, TextField } from 'react-aria-components'
import { useNavigate } from 'react-router'
import { en } from '../../copy/en.ts'
import { cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'
import { GOAL_MAX_LENGTH, useFinderStore } from '../finder/store.ts'
import { Glyph } from './Glyph.tsx'
import { Reveal } from './Reveal.tsx'
import { homeButton, ui } from './styles.ts'

const copy = en.home.closing

/**
 * The goal box at the end of the page (after classic/landing.css): a navy band with the question, and the box on a
 * step lighter than the band. Submitting opens Find my path
 * with the goal in the finder's store (session storage), never in the address, where the learner can change it
 * before getting matches.
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
    <section id="start" aria-labelledby="start-title" className={cx(ui.band, ui.section)}>
      <div
        className={cx(
          ui.wrap,
          'grid grid-cols-2 items-center gap-[clamp(2rem,5vw,4rem)] max-lg:grid-cols-1',
        )}
      >
        <Reveal>
          <h2
            id="start-title"
            className="text-home-2xl leading-[1.02] font-extrabold tracking-[-0.03em]"
          >
            {copy.heading}
          </h2>
          <p className="mt-5 max-w-[32rem] text-home-lg leading-[1.5]">{copy.lead}</p>
        </Reveal>
        <Reveal order={1}>
          <form
            className="grid gap-4 rounded-[24px] bg-home-band-2 p-[clamp(1.25rem,2.5vw,1.75rem)]"
            onSubmit={submit}
            noValidate
          >
            <TextField
              className="grid gap-[0.8rem]"
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
              <Label className="text-home-lg font-bold text-white">{copy.label}</Label>
              {/* Focused with an error (as after an empty submit, which focuses it): the error's red edge, and
                  the focus ring around it, on the navy band in both themes. */}
              <TextArea
                ref={field}
                className={cx(
                  'min-h-24 w-full resize-y rounded-14 border-0 bg-white px-4 py-[0.9rem] font-text text-home-base leading-[1.45] font-medium text-[#102a56] placeholder:text-[#5d6f8a] focus:outline-none',
                  error !== null
                    ? 'shadow-[inset_0_0_0_2px_#ff8f8f] focus:shadow-[inset_0_0_0_2px_#ff8f8f,0_0_0_3px_#f5b83d]'
                    : 'focus:shadow-[inset_0_0_0_2px_#f5b83d]',
                )}
                placeholder={copy.placeholder}
              />
              {/* Under the box: the instruction when it's empty, and the count on the right. */}
              <div className="mt-[-0.4rem] flex flex-wrap justify-between gap-x-4 gap-y-[0.3rem] text-home-xs">
                <FieldError className="font-semibold text-[#ffc9c9]">{error}</FieldError>
                <Text slot="description" className="ml-auto text-home-band-body tabular-nums">
                  <span aria-hidden="true">{copy.count(goal.length, GOAL_MAX_LENGTH)}</span>
                  <span className="sr-only">{copy.countLabel(goal.length, GOAL_MAX_LENGTH)}</span>
                </Text>
              </div>
            </TextField>
            <button type="submit" className={cx(homeButton('signal'), 'justify-self-start')}>
              {copy.submit}
              <Glyph name="arrow" />
            </button>
            {/* A note under the button, at the size of the page's notes. */}
            <p className="text-home-xs text-home-band-body">{copy.note}</p>
          </form>
        </Reveal>
      </div>
    </section>
  )
}
