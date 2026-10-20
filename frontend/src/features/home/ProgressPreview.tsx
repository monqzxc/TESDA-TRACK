import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { en } from '../../copy/en.ts'
import { paths } from '../../paths.ts'
import { PLAN_QUALIFICATION } from './data.ts'
import { Glyph } from './Glyph.tsx'
import { useReducedMotion } from './hooks/useReducedMotion.ts'
import { useReveal } from './hooks/useReveal.ts'
import electrical from './img/electrical.jpg'
import { Reveal } from './Reveal.tsx'
import { cx } from '../../lib/style.ts'
import shared from './shared.module.css'
import styles from './ProgressPreview.module.css'

const copy = en.home.progress

/** The example plan's steps 1 and 2 are done and step 3 is next. */
const DONE = 2

/**
 * How many of the plan's steps have ticked over: one at a time once the plan is in view, or all at once with
 * reduced motion.
 */
function usePlanProgress(start: boolean, steps: number): number {
  const reduced = useReducedMotion()
  const [ticked, setTicked] = useState(0)
  useEffect(() => {
    if (!start || reduced) return
    const timers = Array.from({ length: steps }, (_, i) =>
      window.setTimeout(() => setTicked((n) => Math.max(n, i + 1)), 500 + i * 450),
    )
    return () => timers.forEach(clearTimeout)
  }, [start, reduced, steps])
  return reduced ? steps : ticked
}

/** "My progress": an example plan whose steps tick off, and what an account keeps. */
export function ProgressPreview() {
  const { ref: planRef, isIn: planIn } = useReveal<HTMLDivElement>()
  const ticked = usePlanProgress(planIn, copy.plan.length)

  return (
    <section
      id="progress"
      aria-labelledby="progress-title"
      className={cx(shared.section, styles.progress)}
    >
      <div className={cx(shared.wrap, styles.grid)}>
        <div
          ref={planRef}
          data-reveal="left"
          data-in={planIn || undefined}
          data-ui=""
          className={cx(shared.card, styles.plan)}
        >
          <div className={styles.planHead}>
            <img src={electrical} alt="" width={56} height={56} loading="lazy" decoding="async" />
            <div>
              <strong>{copy.planTitle}</strong> <small>{PLAN_QUALIFICATION}</small>
            </div>
          </div>
          <ol className={styles.steps}>
            {copy.plan.map((step, i) => (
              <li
                key={step.title}
                className={cx(
                  i < ticked && i < DONE && styles.done,
                  i < ticked && i === DONE && styles.next,
                )}
              >
                <i aria-hidden="true" />
                <div>
                  <strong>{step.title}</strong> <small>{step.text}</small>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <Reveal className={shared.sectionHead}>
            <h2 id="progress-title">{copy.heading}</h2>
            <p>{copy.lead}</p>
          </Reveal>
          <ul className={styles.keeps}>
            {copy.keeps.map((keep, i) => (
              <Reveal as="li" key={keep.title} order={i + 1}>
                <strong>{keep.title}</strong> <span>{keep.text}</span>
              </Reveal>
            ))}
          </ul>
          <Reveal order={4} className={shared.sectionCta}>
            <Link to={paths.progress} className={cx(shared.btn, shared.quiet)}>
              {copy.cta}
              <Glyph name="arrow" />
            </Link>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
