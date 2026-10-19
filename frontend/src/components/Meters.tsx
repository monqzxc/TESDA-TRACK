import { en } from '../copy/en.ts'
import { cssVars, cx } from '../lib/style.ts'
import utilities from '../styles/utilities.module.css'
import styles from './Meters.module.css'

/** A score out of 100 as a ring (classic/presentation.py score_ring). Screen readers hear its label. */
export function ScoreRing({ score, label }: { score: number; label: string }) {
  const shown = Math.round(Math.min(Math.max(score, 0), 100))
  return (
    <div
      className={styles.ring}
      style={cssVars({ '--score': shown })}
      role="img"
      aria-label={label}
    >
      <span aria-hidden="true">{shown}%</span>
    </div>
  )
}

export interface SkillBar {
  label: string
  count: number
  total: number
  tone: 'blue' | 'violet'
}

/** Labelled bars, e.g. 5 of 8 relevant skills (skill_bars). */
export function SkillBars({ bars, className }: { bars: readonly SkillBar[]; className?: string }) {
  return (
    <ul className={cx(styles.bars, className)}>
      {bars.map((bar) => (
        <li key={bar.label} className={cx(styles.bar, bar.tone === 'violet' && styles.violet)}>
          <span>{bar.label}</span>
          <span className={styles.track} aria-hidden="true">
            <i style={{ width: `${bar.total ? (100 * bar.count) / bar.total : 0}%` }} />
          </span>
          <b>
            <span aria-hidden="true">
              {bar.count}/{bar.total}
            </span>
            <span className={utilities.visuallyHidden}>{en.countOf(bar.count, bar.total)}</span>
          </b>
        </li>
      ))}
    </ul>
  )
}
