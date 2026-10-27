import { Link } from 'react-router'
import { useCopy } from '../../i18n/copy.ts'
import { cssVars, cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'
import { CATALOG, DRIFTING_QUALIFICATIONS } from './data.ts'
import { Glyph } from './Glyph.tsx'
import { useCountUp } from './hooks/useCountUp.ts'
import { useReducedMotion } from './hooks/useReducedMotion.ts'
import { useReveal } from './hooks/useReveal.ts'
import { Reveal, revealClasses, useRevealed } from './Reveal.tsx'
import { homeButton, ui } from './styles.ts'

const format = (n: number) => n.toLocaleString('en-US')

/** A figure that counts up once `start` is true, slower the bigger it is. */
function useFigure(target: number, start: boolean): string {
  return format(useCountUp(target, { start, duration: 1400 + Math.min(target, 1000), power: 4 }))
}

/**
 * A fact, one a line: its figure, right-aligned in a column of figures, then what it counts. The figure counts up on
 * screen, and screen readers hear the figure itself.
 */
function Fact({ figure, text, start }: { figure: number; text: string; start: boolean }) {
  const shown = useFigure(figure, start)
  return (
    // Room for "4,981" at the figures' size.
    <li className="grid grid-cols-[calc(var(--text-home-xl)*2.9)_minmax(0,1fr)] items-baseline gap-[1.1rem]">
      <b
        aria-hidden="true"
        className="text-right font-display text-home-xl leading-none font-extrabold tracking-[-0.02em] text-home-ink tabular-nums"
      >
        {shown}
      </b>
      <span className="sr-only">{format(figure)} </span>
      <span className="leading-[1.4] text-home-body">{text}</span>
    </li>
  )
}

const MOST_AT_A_LEVEL = Math.max(...CATALOG.levels.map((level) => level.count))

/** Qualifications by NC level: bars that grow in turn once they're in view. */
function LevelBars() {
  const shown = useRevealed()
  return (
    <ul className="mt-[1.1rem] grid max-w-[46rem] list-none gap-[0.7rem] p-0">
      {CATALOG.levels.map((level, i) => (
        <li
          key={level.name}
          className="grid grid-cols-[4rem_minmax(0,1fr)_2.8rem] items-center gap-4"
        >
          <span className="font-bold text-home-ink tabular-nums">{level.name}</span>
          <i
            aria-hidden="true"
            className={cx(
              'block h-4 w-[calc(var(--share)*100%)] origin-left rounded-full bg-home-blue',
              'in-data-motion:transition-[scale] in-data-motion:delay-[calc(var(--i,0)*90ms_+_200ms)] in-data-motion:duration-1000 in-data-motion:ease-home',
              !shown && 'in-data-motion:scale-x-0',
            )}
            style={cssVars({ '--share': level.count / MOST_AT_A_LEVEL, '--i': i })}
          />
          <b className="text-right font-bold text-home-ink tabular-nums">{level.count}</b>
        </li>
      ))}
    </ul>
  )
}

/**
 * The qualifications library's figures, its NC levels, and some of its names drifting by (after
 * classic/landing.css). The big figure is the section's title; the rest is set as type on the page, with no boxes or
 * rules between the figures.
 */
export function Catalog() {
  const en = useCopy()
  const copy = en.home.catalog

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
            <h2 id="catalog-title" className="sr-only">
              {copy.heading(CATALOG.qualifications)}
            </h2>
            <div
              className="font-display text-[length:clamp(5rem,3rem_+_11vw,11rem)] leading-[0.85] font-extrabold tracking-[-0.05em] text-home-ink tabular-nums [font-variation-settings:'opsz'_96]"
              aria-hidden="true"
            >
              {qualifications}
            </div>
            <p className="mt-[1.1rem] max-w-[26rem] text-home-lg leading-[1.35] font-semibold text-home-ink">
              {copy.lead}
            </p>
          </div>
          <ul
            ref={factsRef}
            data-reveal="below"
            data-in={factsIn || undefined}
            style={cssVars({ '--i': 1 })}
            className={cx(revealClasses('below'), 'm-0 grid list-none gap-4 p-0')}
          >
            {copy.facts.map((text, i) => (
              <Fact key={text} figure={CATALOG.facts[i]} text={text} start={factsIn} />
            ))}
          </ul>
        </div>

        <Reveal order={1} className="mt-[clamp(3rem,6vw,4.5rem)]">
          <h3 className="text-home-lg leading-[1.25] font-bold">{copy.levels}</h3>
          <LevelBars />
          <p className="mt-[0.8rem] text-home-xs text-home-muted">{copy.levelsNote}</p>
          <div className={ui.sectionCta}>
            <Link to={paths.qualifications} className={homeButton('quiet')}>
              {copy.cta}
              <Glyph name="arrow" />
            </Link>
          </div>
        </Reveal>
      </div>

      {/* Two rows of names drifting in opposite directions, edge to edge; hovering pauses them. Each row runs
          twice, so it loops without a seam; screen readers hear each name once. Still, each name shows once, in
          rows that scroll sideways. */}
      <Reveal
        order={2}
        className={cx(
          'group/drift mt-[clamp(3rem,6vw,4.5rem)] grid gap-3 overflow-hidden',
          'motion-reduce:overflow-x-auto motion-reduce:pb-[0.4rem]',
        )}
        role="group"
        aria-label={copy.drifting}
        tabIndex={reduced ? 0 : undefined}
      >
        {DRIFTING_QUALIFICATIONS.map((row, r) => (
          <ul
            key={r}
            className={cx(
              'm-0 flex w-max animate-drift list-none gap-3 p-0 group-hovered/drift:[animation-play-state:paused] motion-reduce:animate-none motion-reduce:px-home-gutter',
              r === 1 && '[animation-direction:reverse] [animation-duration:85s]',
            )}
          >
            {[...row, ...row].map(([name, sector], i) => (
              <li
                key={i}
                aria-hidden={i >= row.length || undefined}
                className="rounded-full bg-home-surface px-[1.2rem] py-3 font-semibold whitespace-nowrap text-home-ink motion-reduce:aria-hidden:hidden"
              >
                {name}{' '}
                <small className="ml-[0.35rem] text-home-xs font-medium text-home-muted">
                  {sector}
                </small>
              </li>
            ))}
          </ul>
        ))}
      </Reveal>
    </section>
  )
}
