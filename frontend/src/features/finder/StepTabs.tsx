import { Link } from 'react-router'
import { Icon, type IconName } from '../../components/Icon.tsx'
import { useCopy } from '../../i18n/copy.ts'
import { cx } from '../../lib/style.ts'
import { STEP_PATHS } from './steps.ts'

/** Each step's icon (for the Streamlit tabs' track_changes, search, bar_chart and add_location_alt). */
const ICONS: readonly IconName[] = ['target', 'search', 'bars', 'pin']

// After classic/styles.css's .st-key-finder_steps: one tab per step, as chevrons that point on to the next. The
// current step is navy, finished ones green. The bar is a size container: a narrow bar (a small window, or a laptop
// beside the sidebar) drops the hints and tightens each tab so a long name wraps instead of being cut off; narrower
// still, but not yet a phone's two rows, only the current step keeps its name on screen (the rest keep their icon or
// tick, and screen readers still hear their names). Phones have two tabs a row, so no chevrons: they would point at
// nothing. The container rules that phones replace are kept to wider screens (xs:), so the two never compete.

/** --notch: how far each chevron's point reaches into the next tab. --inset: the space before each tab's icon. */
const tabs =
  'm-0 flex list-none p-0 [--inset:1.1rem] [--notch:18px] @max-[881px]:[--inset:0.7rem] @max-[881px]:[--notch:14px] max-xs:flex-wrap max-xs:gap-[0.35rem]'

// Each tab's outline: the first has no notch and the last no point; their outer corners follow the bar's.
const shape = {
  first:
    'rounded-[13px_0_0_13px] pr-[calc(var(--notch)_+_0.5rem)] pl-(--inset) [clip-path:polygon(0_0,calc(100%_-_var(--notch))_0,100%_50%,calc(100%_-_var(--notch))_100%,0_100%)] xs:@max-[881px]:pr-[calc(var(--notch)_+_0.25rem)]',
  middle:
    'pr-[calc(var(--notch)_+_0.5rem)] pl-[calc(var(--notch)_+_var(--inset))] [clip-path:polygon(0_0,calc(100%_-_var(--notch))_0,100%_50%,calc(100%_-_var(--notch))_100%,0_100%,var(--notch)_50%)] xs:@max-[881px]:pr-[calc(var(--notch)_+_0.25rem)]',
  last: 'rounded-[0_13px_13px_0] pr-(--inset) pl-[calc(var(--notch)_+_var(--inset))] [clip-path:polygon(0_0,100%_0,100%_100%,0_100%,var(--notch)_50%)]',
}

// The clip hides the usual outline, so a focused tab glows along its own edges instead.
const link =
  'flex min-h-16.5 items-center gap-[0.9rem] py-[0.55rem] no-underline transition-[background] duration-200 ease-[ease] focus-visible:outline-none @max-[881px]:gap-[0.6rem] ' +
  'max-xs:min-h-12 max-xs:rounded-12 max-xs:px-[0.6rem] max-xs:py-[0.4rem] max-xs:[clip-path:none]'

type State = 'current' | 'done' | 'open' | 'locked'

const linkColors: Record<State, string> = {
  current: 'bg-step-current text-white motion-safe:animate-tab-in',
  done: 'bg-done text-navy hovered:bg-done-hover',
  open: 'bg-step text-navy hovered:bg-step-hover',
  // A step that opens once there's a goal.
  locked: 'cursor-not-allowed bg-step text-navy opacity-55',
}

const iconColors: Record<State, string> = {
  current: 'bg-[#ffffff1f] text-white',
  done: 'bg-surface text-teal motion-safe:animate-tick',
  open: 'bg-surface text-blue',
  locked: 'bg-surface text-blue',
}

interface StepTabsProps {
  /** The step on screen, from 0 (Your goal) to 3 (Your pathway). */
  current: number
  /** There's a submitted goal, so every step can be opened. Until then only Your goal can. */
  unlocked: boolean
}

/**
 * One tab per step, as chevrons pointing on to the next (classic/app.py show_step_bar): the icon, the name and a
 * hint. Finished steps are ticked. Each is a link to its step's address; without a goal, the later ones aren't. The
 * bar stays in view while a step scrolls under it (not on phones, where the app's own bar does).
 */
export function StepTabs({ current, unlocked }: StepTabsProps) {
  const en = useCopy()
  const copy = en.finder.steps

  const last = copy.names.length - 1
  return (
    <nav
      data-tour="finder-steps"
      aria-label={copy.label}
      className="@container mt-[0.85rem] rounded-18 border border-border bg-surface p-[0.4rem] shadow-[0_8px_22px_-16px_rgb(var(--track-shadow-rgb)/0.25)] max-xs:p-[0.35rem] md:sticky md:top-3 md:z-15"
    >
      <ol className={tabs}>
        {copy.names.map((name, step) => {
          const done = unlocked && step < current
          const isCurrent = step === current
          const opens = step === 0 || unlocked
          const state: State = isCurrent ? 'current' : done ? 'done' : opens ? 'open' : 'locked'
          const linkClass = cx(
            link,
            step === 0 ? shape.first : step === last ? shape.last : shape.middle,
            linkColors[state],
          )
          const body = (
            <>
              <span
                className={cx(
                  'grid size-11 flex-none place-items-center rounded-full max-xs:size-8 xs:@max-[881px]:size-8.5',
                  iconColors[state],
                )}
              >
                <Icon name={done ? 'tick' : ICONS[step]} size="1.35rem" />
              </span>
              <span
                className={cx('flex min-w-0 flex-col', !isCurrent && 'xs:@max-[601px]:sr-only')}
              >
                <span className="text-15 leading-[1.3] font-[650] max-xs:text-13">
                  {name}
                  {done && <span className="sr-only"> ({copy.done})</span>}
                </span>
                {/* In dark, the current tab's hint token (#dbe6ff on #2f6fe0) is 3.6:1, under the 4.5:1 small
                    text needs; white is 4.6:1. */}
                <span
                  className={cx(
                    'mt-[0.15rem] text-13 @max-[881px]:hidden',
                    isCurrent ? 'text-step-current-hint dark:text-white' : 'text-muted',
                  )}
                >
                  {copy.hints[step]}
                </span>
              </span>
            </>
          )
          return (
            // Each tab after the first tucks its notch round the point before it, leaving a thin white seam. A box
            // shadow would be clipped away with the corners, so the current tab's shadow follows its chevron.
            <li
              key={name}
              className={cx(
                'relative min-w-0 flex-[1_1_0] max-xs:flex-[1_1_calc(50%_-_0.5rem)]',
                step > 0 && 'ml-[calc(5px_-_var(--notch))] max-xs:ml-0',
                isCurrent
                  ? 'z-1 drop-shadow-[0_6px_7px_rgb(var(--track-shadow-rgb)/0.22)]'
                  : 'xs:@max-[601px]:flex-none',
                'has-[a:focus-visible]:z-2 has-[a:focus-visible]:[filter:drop-shadow(0_0_1px_var(--track-focus))_drop-shadow(0_0_1px_var(--track-focus))_drop-shadow(0_0_1px_var(--track-focus))]',
              )}
            >
              {opens ? (
                <Link
                  to={STEP_PATHS[step]}
                  className={linkClass}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  {body}
                </Link>
              ) : (
                // A step that opens once there's a goal: read as a link that can't be used yet.
                <span role="link" aria-disabled="true" className={linkClass}>
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
