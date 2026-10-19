import { Link } from 'react-router'
import { en } from '../../copy/en.ts'
import { cssVars, cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'
import { CATALOG, DRIFTING_QUALIFICATIONS } from './data.ts'
import { Glyph } from './Glyph.tsx'
import { useCountUp } from './hooks/useCountUp.ts'
import { useReducedMotion } from './hooks/useReducedMotion.ts'
import { useReveal } from './hooks/useReveal.ts'
import { Reveal, revealClasses, useRevealed } from './Reveal.tsx'
import { homeButton, ui } from './styles.ts'

const copy = en.home.catalog

const format = (n: number) => n.toLocaleString('en-US')

/** A figure that counts up once `start` is true, slower the bigger it is. */
function useFigure(target: number, start: boolean): string {
  return format(useCountUp(target, { start, duration: 1400 + Math.min(target, 1000), power: 4 }))
}

/** A fact: its figure counts up on screen, and screen readers hear the figure itself. */
function Fact({ figure, text, start }: { figure: number; text: string; start: boolean }) {
  const shown = useFigure(figure, start)
  return (
    <li className="bg-home-surface px-4 py-[1.1rem]">
      <b
        aria-hidden="true"
        className="block font-display text-home-xl leading-none font-extrabold text-home-ink tabular-nums"
      >
        {shown}
      </b>
      <span className="sr-only">{format(figure)} </span>
      <span className="mt-[0.35rem] block text-[0.82rem] leading-[1.35] text-home-muted">
        {text}
      </span>
    </li>
  )
}

const MOST_AT_A_LEVEL = Math.max(...CATALOG.levels.map((level) => level.count))

/** Qualifications by NC level: bars that grow in turn once they're in view. */
function LevelBars() {
  const shown = useRevealed()
  return (
    <ul className="mt-[0.9rem] grid max-w-[46rem] list-none gap-[0.55rem] p-0">
      {CATALOG.levels.map((level, i) => (
        <li
          key={level.name}
          className="grid grid-cols-[3.6rem_minmax(0,1fr)_2.6rem] items-center gap-[0.8rem]"
        >
          <span className="text-[0.92rem] font-bold text-home-ink">{level.name}</span>
          <i
            aria-hidden="true"
            className={cx(
              'block h-3.5 w-[calc(var(--share)*100%)] origin-left rounded-full bg-(--c)',
              'in-data-motion:transition-[scale] in-data-motion:delay-[calc(var(--i,0)*90ms_+_200ms)] in-data-motion:duration-1000 in-data-motion:ease-home',
              !shown && 'in-data-motion:scale-x-0',
            )}
            style={cssVars({
              '--share': level.count / MOST_AT_A_LEVEL,
              '--i': i,
              '--c': level.color,
            })}
          />
          <b className="text-right font-display text-[1.05rem] leading-none font-extrabold text-home-ink tabular-nums">
            {level.count}
          </b>
        </li>
      ))}
    </ul>
  )
}

/**
 * The qualifications library's figures, its NC levels, and some of its names drifting by (after
 * classic/landing.css).
 */
export function Catalog() {
  const { ref: totalRef, isIn: totalIn } = useReveal<HTMLDivElement>()
  const { ref: factsRef, isIn: factsIn } = useReveal<HTMLUListElement>()
  const qualifications = useFigure(CATALOG.qualifications, totalIn)
  // Still, the rows scroll sideways instead, so the keyboard needs to reach them.
  const reduced = useReducedMotion()

  return (
    <section id="catalog" aria-labelledby="catalog-title" className={ui.section}>
      <div className={ui.wrap}>
        <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] items-end gap-[clamp(2rem,6vw,5rem)] max-lg:grid-cols-1">
          <div
            ref={totalRef}
            data-reveal="below"
            data-in={totalIn || undefined}
            className={revealClasses('below')}
          >
            <div className={ui.eyebrow}>{copy.eyebrow}</div>
            <h2 id="catalog-title" className="sr-only">
              {copy.heading(CATALOG.qualifications)}
            </h2>
            <div
              className="font-display text-[length:clamp(5rem,3rem_+_11vw,11rem)] leading-[0.85] font-extrabold tracking-[-0.05em] text-home-ink tabular-nums [font-variation-settings:'opsz'_96]"
              aria-hidden="true"
            >
              {qualifications}
            </div>
            <p className="mt-[0.9rem] max-w-[26rem] text-home-lg font-semibold text-home-ink">
              {copy.lead}
            </p>
          </div>
          <ul
            ref={factsRef}
            data-reveal="below"
            data-in={factsIn || undefined}
            style={cssVars({ '--i': 1 })}
            className={cx(
              revealClasses('below'),
              'm-0 grid list-none grid-cols-3 gap-px overflow-hidden rounded-18 bg-home-border p-0 shadow-[0_0_0_1px_var(--home-border)] max-xs:grid-cols-1',
            )}
          >
            {copy.facts.map((text, i) => (
              <Fact key={text} figure={CATALOG.facts[i]} text={text} start={factsIn} />
            ))}
          </ul>
        </div>

        <Reveal order={1} className="mt-10">
          <div className={ui.cardLabel}>
            <span>{copy.levels}</span>
          </div>
          <LevelBars />
          <p className="mt-[0.6rem] text-[0.8rem] text-home-muted">{copy.levelsNote}</p>
          <div className={ui.sectionCta}>
            <Link to={paths.qualifications} className={homeButton('outline')}>
              {copy.cta}
              <Glyph name="arrow" />
            </Link>
          </div>
        </Reveal>
      </div>

      {/* Two rows of names drifting in opposite directions, faded at the edges; hovering pauses them. Each row
          runs twice, so it loops without a seam; screen readers hear each name once. Still, each name shows once,
          in rows that scroll sideways. */}
      <Reveal
        order={2}
        className={cx(
          'group/drift mt-[clamp(2.5rem,5vw,4rem)] grid gap-[0.7rem] overflow-hidden',
          '[mask-image:linear-gradient(90deg,transparent,#000000_8%,#000000_92%,transparent)] [-webkit-mask-image:linear-gradient(90deg,transparent,#000000_8%,#000000_92%,transparent)]',
          'motion-reduce:overflow-x-auto motion-reduce:[mask-image:none] motion-reduce:pb-[0.4rem] motion-reduce:[-webkit-mask-image:none]',
        )}
        role="group"
        aria-label={copy.drifting}
        tabIndex={reduced ? 0 : undefined}
      >
        {DRIFTING_QUALIFICATIONS.map((row, r) => (
          <ul
            key={r}
            className={cx(
              'm-0 flex w-max animate-drift list-none gap-[0.7rem] p-0 group-hovered/drift:[animation-play-state:paused] motion-reduce:animate-none motion-reduce:px-home-gutter',
              r === 1 && '[animation-direction:reverse] [animation-duration:85s]',
            )}
          >
            {[...row, ...row].map(([name, sector], i) => (
              <li
                key={i}
                aria-hidden={i >= row.length || undefined}
                className="rounded-12 bg-home-surface px-4 py-[0.65rem] font-semibold whitespace-nowrap text-home-ink shadow-[0_0_0_1px_var(--home-border)] motion-reduce:aria-hidden:hidden"
              >
                {name} <small className="ml-1 font-medium text-home-muted">{sector}</small>
              </li>
            ))}
          </ul>
        ))}
      </Reveal>
    </section>
  )
}
