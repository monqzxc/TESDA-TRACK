import { Link } from 'react-router'
import { Icon, type IconName } from '../../components/Icon.tsx'
import { en } from '../../copy/en.ts'
import { cx } from '../../lib/style.ts'
import utilities from '../../styles/utilities.module.css'
import { STEP_PATHS } from './steps.ts'
import styles from './StepTabs.module.css'

const copy = en.finder.steps

/** Each step's icon (for the Streamlit tabs' track_changes, search, bar_chart and add_location_alt). */
const ICONS: readonly IconName[] = ['target', 'search', 'bars', 'pin']

interface StepTabsProps {
  /** The step on screen, from 0 (Your goal) to 3 (Your pathway). */
  current: number
  /** There's a submitted goal, so every step can be opened. Until then only Your goal can. */
  unlocked: boolean
}

/**
 * One tab per step, as chevrons pointing on to the next (frontend/app.py show_step_bar): the icon, the name and a
 * hint. Finished steps are ticked. Each is a link to its step's address; without a goal, the later ones aren't.
 */
export function StepTabs({ current, unlocked }: StepTabsProps) {
  return (
    <nav aria-label={copy.label} className={styles.bar}>
      <ol className={styles.tabs}>
        {copy.names.map((name, step) => {
          const done = unlocked && step < current
          const state = step === current ? styles.current : done ? styles.done : undefined
          const body = (
            <>
              <span className={styles.icon}>
                <Icon name={done ? 'tick' : ICONS[step]} size="1.35rem" />
              </span>
              <span className={styles.text}>
                <span className={styles.name}>
                  {name}
                  {done && <span className={utilities.visuallyHidden}> ({copy.done})</span>}
                </span>
                <span className={styles.hint}>{copy.hints[step]}</span>
              </span>
            </>
          )
          return (
            <li key={name} className={cx(styles.tab, state)}>
              {step === 0 || unlocked ? (
                <Link
                  to={STEP_PATHS[step]}
                  className={styles.link}
                  aria-current={step === current ? 'step' : undefined}
                >
                  {body}
                </Link>
              ) : (
                // A step that opens once there's a goal: read as a link that can't be used yet.
                <span role="link" aria-disabled="true" className={cx(styles.link, styles.locked)}>
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
