import { Link } from 'react-router'
import { en } from '../../copy/en.ts'
import { paths } from '../../paths.ts'
import utilities from '../../styles/utilities.module.css'
import { CATALOG, DRIFTING_QUALIFICATIONS } from './data.ts'
import { Glyph } from './Glyph.tsx'
import { useCountUp } from './hooks/useCountUp.ts'
import { useReducedMotion } from './hooks/useReducedMotion.ts'
import { useReveal } from './hooks/useReveal.ts'
import { Reveal } from './Reveal.tsx'
import { cssVars, cx } from '../../lib/style.ts'
import shared from './shared.module.css'
import styles from './Catalog.module.css'

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
    <li>
      <b aria-hidden="true">{shown}</b>
      <span className={utilities.visuallyHidden}>{format(figure)} </span>
      <span className={styles.factText}>{text}</span>
    </li>
  )
}

const MOST_AT_A_LEVEL = Math.max(...CATALOG.levels.map((level) => level.count))

/** The qualifications library's figures, its NC levels, and some of its names drifting by. */
export function Catalog() {
  const { ref: totalRef, isIn: totalIn } = useReveal<HTMLDivElement>()
  const { ref: factsRef, isIn: factsIn } = useReveal<HTMLUListElement>()
  const qualifications = useFigure(CATALOG.qualifications, totalIn)
  // Still, the rows scroll sideways instead, so the keyboard needs to reach them.
  const reduced = useReducedMotion()

  return (
    <section id="catalog" aria-labelledby="catalog-title" className={shared.section}>
      <div className={shared.wrap}>
        <div className={styles.top}>
          <div ref={totalRef} data-reveal="below" data-in={totalIn || undefined}>
            <div className={shared.eyebrow}>{copy.eyebrow}</div>
            <h2 id="catalog-title" className={utilities.visuallyHidden}>
              {copy.heading(CATALOG.qualifications)}
            </h2>
            <div className={styles.bigNumber} aria-hidden="true">
              {qualifications}
            </div>
            <p className={styles.bigNumberText}>{copy.lead}</p>
          </div>
          <ul
            ref={factsRef}
            data-reveal="below"
            data-in={factsIn || undefined}
            style={cssVars({ '--i': 1 })}
            className={styles.facts}
          >
            {copy.facts.map((text, i) => (
              <Fact key={text} figure={CATALOG.facts[i]} text={text} start={factsIn} />
            ))}
          </ul>
        </div>

        <Reveal order={1} className={styles.levels}>
          <div className={shared.cardLabel}>
            <span>{copy.levels}</span>
          </div>
          <ul className={styles.levelBars}>
            {CATALOG.levels.map((level, i) => (
              <li key={level.name} className={styles.level}>
                <span>{level.name}</span>
                <i
                  aria-hidden="true"
                  style={cssVars({
                    '--share': level.count / MOST_AT_A_LEVEL,
                    '--i': i,
                    '--c': level.color,
                  })}
                />
                <b>{level.count}</b>
              </li>
            ))}
          </ul>
          <p className={styles.levelsNote}>{copy.levelsNote}</p>
          <div className={shared.sectionCta}>
            <Link to={paths.qualifications} className={cx(shared.btn, shared.outline)}>
              {copy.cta}
              <Glyph name="arrow" />
            </Link>
          </div>
        </Reveal>
      </div>

      {/* Each row runs twice, so it loops without a seam; screen readers hear each name once. */}
      <Reveal
        order={2}
        className={styles.drift}
        role="group"
        aria-label={copy.drifting}
        tabIndex={reduced ? 0 : undefined}
      >
        {DRIFTING_QUALIFICATIONS.map((row, r) => (
          <ul key={r} className={styles.row}>
            {[...row, ...row].map(([name, sector], i) => (
              <li key={i} aria-hidden={i >= row.length || undefined}>
                {name} <small>{sector}</small>
              </li>
            ))}
          </ul>
        ))}
      </Reveal>
    </section>
  )
}
