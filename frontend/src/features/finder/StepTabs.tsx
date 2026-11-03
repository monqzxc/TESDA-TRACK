import { Link } from 'react-router'
import { Icon } from '../../components/Icon.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { STEP_PATHS } from './steps.ts'

// One tab per step, as a progress bar in four parts: each step's bar fills as the learner reaches it, the current
// one in blue and the finished ones in ink, with the step's name under its bar. Phones have two tabs a row.

type State = 'current' | 'done' | 'open' | 'locked'

const barColors: Record<State, string> = {
  current: 'bg-blue',
  done: 'bg-navy',
  open: 'bg-bar',
  locked: 'bg-bar',
}

const labelColors: Record<State, string> = {
  current: 'font-bold text-navy',
  done: 'font-semibold text-navy',
  open: 'font-semibold text-muted hovered:text-navy',
  // A step that opens once there's a goal.
  locked: 'cursor-not-allowed font-semibold text-muted',
}

const link =
  'flex min-h-14 flex-col justify-start gap-2 rounded-10 px-2 pt-2 pb-[0.6rem] no-underline transition-colors duration-150 ease-[ease] max-xs:min-h-12'

interface StepTabsProps {
  /** The step on screen, from 0 (Your goal) to 3 (Your pathway). */
  current: number
  /** There's a submitted goal, so every step can be opened. Until then only Your goal can. */
  unlocked: boolean
}

/**
 * One tab per step (classic/app.py show_step_bar): its bar and its name. Finished steps are ticked. Each is a link
 * to its step's address; without a goal, the later ones aren't. The bar stays in view while a step scrolls under
 * it (not on phones, where the app's own bar does).
 */
export function StepTabs({ current, unlocked }: StepTabsProps) {
  const en = useCopy()
  const copy = en.finder.steps

  return (
    <nav
      data-tour="finder-steps"
      aria-label={copy.label}
      className="mt-4 rounded-14 border border-border bg-surface p-1 md:sticky md:top-3 md:z-15"
    >
      <ol className="m-0 grid list-none grid-cols-4 gap-1 p-0 max-xs:grid-cols-2">
        {copy.names.map((name, step) => {
          const done = unlocked && step < current
          const isCurrent = step === current
          const opens = step === 0 || unlocked
          const state: State = isCurrent ? 'current' : done ? 'done' : opens ? 'open' : 'locked'
          const body = (
            <>
              <span
                className={cx('block h-1 rounded-full transition-colors', barColors[state])}
                aria-hidden="true"
              />
              <span
                className={cx(
                  'flex min-w-0 items-center gap-[0.35rem] text-15 leading-[1.3] max-xs:text-14',
                  labelColors[state],
                )}
              >
                {done && <Icon name="tick" size="1rem" className="flex-none text-navy" />}
                <span className="min-w-0">
                  {name}
                  {done && <span className="sr-only"> ({copy.done})</span>}
                </span>
              </span>
            </>
          )
          return (
            <li key={name} className="min-w-0">
              {opens ? (
                <Link
                  to={STEP_PATHS[step]}
                  className={cx(link, 'hovered:bg-soft', labelColors[state])}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  {body}
                </Link>
              ) : (
                // A step that opens once there's a goal: read as a link that can't be used yet.
                <span role="link" aria-disabled="true" className={cx(link, labelColors[state])}>
                  {body}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
