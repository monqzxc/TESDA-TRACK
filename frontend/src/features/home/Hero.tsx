import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { en } from '../../copy/en.ts'
import { paths } from '../../paths.ts'
import { CATALOG, REGIONS } from './data.ts'
import { Glyph } from './Glyph.tsx'
import { GoalConsole } from './GoalConsole.tsx'
import { useReveal } from './hooks/useReveal.ts'
import welding from './img/welding.jpg'
import weldingSmall from './img/welding-600.jpg'
import { Reveal } from './Reveal.tsx'
import { cssVars, cx } from '../../lib/style.ts'
import shared from './shared.module.css'
import styles from './Hero.module.css'

const copy = en.home.hero

/** One line of the h1, which rises into place when the hero first shows. */
function Line({ order, children }: { order: number; children: ReactNode }) {
  return (
    <span className={styles.line}>
      <span className={styles.lineText} style={cssVars({ '--i': order })}>
        {children}
      </span>
    </span>
  )
}

/**
 * The navy band at the top, under Home's see-through top bar: the h1 across the width, then the ways in beside the
 * console's example. It carries data-home-hero, which tells the top bar there's a hero to see through to.
 */
export function Hero() {
  const { ref, isIn } = useReveal<HTMLElement>()
  const [first, second, last] = copy.title
  return (
    <section
      ref={ref}
      data-in={isIn || undefined}
      data-home-hero=""
      className={styles.hero}
      aria-labelledby="hero-title"
    >
      <div className={styles.photo} aria-hidden="true">
        {/* On phones the photo is a faint backdrop, so a smaller copy does. */}
        <picture>
          <source media="(max-width: 900px)" srcSet={weldingSmall} width={600} height={600} />
          <img
            src={welding}
            alt=""
            width={1100}
            height={1100}
            fetchPriority="high"
            decoding="async"
          />
        </picture>
      </div>
      <div className={cx(shared.wrap, styles.grid)}>
        {/* Focus comes here after a navigation to Home (lib/navigation.ts). Two lines on wide screens, the first
            breaking between its halves on narrow ones; the spaces read them as one sentence: "Every career has a
            track. Find yours." */}
        <h1 id="hero-title" tabIndex={-1} className={styles.title}>
          <Line order={0}>
            <span className={styles.keep}>{first}</span> <span className={styles.keep}>{second}</span>
          </Line>{' '}
          <Line order={1}>{last}</Line>
        </h1>
        <div className={styles.text}>
          <Reveal as="p" order={2} className={styles.lead}>
            {copy.lead}
          </Reveal>
          <Reveal order={3} className={styles.actions}>
            <Link to={paths.finder} className={cx(shared.btn, shared.signal)}>
              {copy.findMyPath}
              <Glyph name="arrow" />
            </Link>
            <Link to={paths.qualifications} className={cx(shared.btn, shared.ghost)}>
              {copy.browse(CATALOG.qualifications)}
            </Link>
          </Reveal>
          {/* Three short notes, read as sentences. */}
          <Reveal as="ul" order={4} className={styles.notes}>
            {copy.notes(REGIONS.length).map((note) => (
              <li key={note}>{note}</li>
            ))}
          </Reveal>
        </div>
        <GoalConsole />
      </div>
    </section>
  )
}
