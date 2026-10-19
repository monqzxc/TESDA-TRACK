import { en } from '../copy/en.ts'
import { cssVars, cx } from '../lib/style.ts'

/** A score out of 100 as a ring (classic/presentation.py score_ring). Screen readers hear its label. */
export function ScoreRing({ score, label }: { score: number; label: string }) {
  const shown = Math.round(Math.min(Math.max(score, 0), 100))
  return (
    <div
      className={cx(
        'grid aspect-square w-27 flex-none place-items-center rounded-full [--ring-hole:var(--track-panel)]',
        'bg-[image:radial-gradient(closest-side,var(--ring-hole)_80%,transparent_81%),conic-gradient(var(--track-blue)_calc(var(--score)*1%),var(--track-bar)_0)]',
      )}
      style={cssVars({ '--score': shown })}
      role="img"
      aria-label={label}
    >
      <span
        className="font-display text-[1.65rem] font-[750] tracking-[-0.03em] text-navy"
        aria-hidden="true"
      >
        {shown}%
      </span>
    </div>
  )
}

export interface SkillBar {
  label: string
  count: number
  total: number
  tone: 'blue' | 'violet'
}

/** Labelled bars, e.g. 5 of 8 relevant skills (skill_bars). In a narrow space each bar drops under its label. */
export function SkillBars({ bars, className }: { bars: readonly SkillBar[]; className?: string }) {
  return (
    <ul className={cx('@container m-0 grid list-none gap-[0.55rem] p-0', className)}>
      {bars.map((bar) => (
        <li
          key={bar.label}
          className="grid grid-cols-[8.5rem_minmax(3rem,1fr)_2.75rem] items-center gap-3 text-14 text-ink @max-[401px]:grid-cols-[minmax(0,1fr)_auto] @max-[401px]:gap-y-1"
        >
          <span>{bar.label}</span>
          <span
            className="h-2 overflow-hidden rounded-full bg-bar @max-[401px]:col-span-full @max-[401px]:row-start-2"
            aria-hidden="true"
          >
            <i
              className={cx(
                'block h-full rounded-[inherit]',
                bar.tone === 'violet' ? 'bg-violet-bar' : 'bg-blue',
              )}
              style={{ width: `${bar.total ? (100 * bar.count) / bar.total : 0}%` }}
            />
          </span>
          <b className="text-right font-[650] text-navy">
            <span aria-hidden="true">
              {bar.count}/{bar.total}
            </span>
            <span className="sr-only">{en.countOf(bar.count, bar.total)}</span>
          </b>
        </li>
      ))}
    </ul>
  )
}
