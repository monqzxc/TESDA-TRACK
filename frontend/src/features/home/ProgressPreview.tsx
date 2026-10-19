import { useEffect, useState, type ReactElement } from 'react'
import { Link } from 'react-router'
import { Icon } from '../../components/Icon.tsx'
import { en } from '../../copy/en.ts'
import { cx } from '../../lib/style.ts'
import { paths } from '../../paths.ts'
import { PLAN_QUALIFICATION, type OnePerEntry } from './data.ts'
import { Glyph } from './Glyph.tsx'
import { useReducedMotion } from './hooks/useReducedMotion.ts'
import { useReveal } from './hooks/useReveal.ts'
import electrical from './img/electrical.jpg'
import { Reveal, revealClasses } from './Reveal.tsx'
import { homeButton, ui } from './styles.ts'

const copy = en.home.progress

const KEEPS_ICONS = [
  <Icon key="checklist" name="checklist" />,
  <Icon key="award" name="award" />,
  <Glyph key="shield" name="shield" />,
] satisfies OnePerEntry<typeof copy.keeps, ReactElement>

/** The example plan's steps 1 and 2 are done and step 3 is next. */
const DONE = 2

type StepState = 'done' | 'next' | 'to-do'

// A step's mark on the line: done steps get a tick and the next one a ring.
const MARKS: Record<StepState, string> = {
  done: 'bg-home-teal shadow-none after:scale-100',
  next: 'bg-home-surface shadow-[inset_0_0_0_2px_var(--home-signal),0_0_0_5px_color-mix(in_srgb,var(--home-signal)_22%,transparent)] after:scale-0',
  'to-do': 'bg-home-surface shadow-[inset_0_0_0_2px_var(--home-border)] after:scale-0',
}

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

/** "My progress" (after classic/landing.css): an example plan whose steps tick off, and what an account keeps. */
export function ProgressPreview() {
  const { ref: planRef, isIn: planIn } = useReveal<HTMLDivElement>()
  const ticked = usePlanProgress(planIn, copy.plan.length)

  return (
    <section id="progress" aria-labelledby="progress-title" className={cx(ui.section, 'pt-0')}>
      <div
        className={cx(
          ui.wrap,
          'grid grid-cols-2 items-center gap-[clamp(2rem,6vw,5rem)] max-lg:grid-cols-1',
        )}
      >
        <div
          ref={planRef}
          data-reveal="left"
          data-in={planIn || undefined}
          className={cx(revealClasses('left'), ui.card, 'relative')}
        >
          <div className="flex items-center gap-[0.9rem]">
            <img
              src={electrical}
              alt=""
              width={56}
              height={56}
              loading="lazy"
              decoding="async"
              className="size-14 rounded-14 object-cover"
            />
            <div>
              <strong className="block font-display text-[1.1rem] leading-[1.2] font-bold text-home-ink">
                {copy.planTitle}
              </strong>{' '}
              <small className="text-[0.82rem] text-home-muted">{PLAN_QUALIFICATION}</small>
            </div>
          </div>
          {/* The steps, on a line. */}
          <ol className="relative mt-[1.3rem] mb-0 grid list-none gap-4 p-0 before:absolute before:top-3.5 before:bottom-3.5 before:left-[13px] before:w-0.5 before:bg-home-border before:content-['']">
            {copy.plan.map((step, i) => {
              const state: StepState =
                i < ticked && i < DONE ? 'done' : i < ticked && i === DONE ? 'next' : 'to-do'
              return (
                <li
                  key={step.title}
                  data-state={state}
                  className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-[0.9rem]"
                >
                  <i
                    aria-hidden="true"
                    className={cx(
                      'relative size-7 rounded-full [transition:background_0.4s,box-shadow_0.4s]',
                      "after:absolute after:top-1.5 after:left-[9px] after:h-3 after:w-[7px] after:rotate-45 after:border-0 after:border-r-[2.5px] after:border-b-[2.5px] after:border-solid after:border-white after:content-[''] after:[transition:scale_0.35s_var(--ease-home)_0.1s]",
                      MARKS[state],
                    )}
                  />
                  <div>
                    <strong className="block leading-[1.3] font-bold text-home-ink">
                      {step.title}
                    </strong>{' '}
                    <small className="mt-[0.15rem] block text-[0.85rem] leading-[1.4] text-home-muted">
                      {step.text}
                    </small>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
        <div>
          <Reveal className={ui.sectionHead}>
            <div className={ui.eyebrow}>{copy.eyebrow}</div>
            <h2 id="progress-title" className={ui.sectionTitle}>
              {copy.heading}
            </h2>
            <p className={ui.sectionLead}>{copy.lead}</p>
          </Reveal>
          {/* What an account keeps. */}
          <ul className="mt-[1.8rem] mb-0 grid list-none gap-4 p-0">
            {copy.keeps.map((keep, i) => (
              <Reveal
                as="li"
                key={keep.title}
                order={i + 1}
                className="grid grid-cols-[40px_minmax(0,1fr)] items-start gap-[0.9rem] [&_svg]:size-10 [&_svg]:rounded-12 [&_svg]:bg-home-blue-soft [&_svg]:stroke-2 [&_svg]:p-[9px] [&_svg]:text-home-blue"
              >
                {KEEPS_ICONS[i]}
                <div>
                  <strong className="block text-home-ink">{keep.title}</strong>{' '}
                  <span className="text-[0.95rem]">{keep.text}</span>
                </div>
              </Reveal>
            ))}
          </ul>
          <Reveal order={4} className={ui.sectionCta}>
            <Link to={paths.progress} className={homeButton('outline')}>
              {copy.cta}
              <Glyph name="arrow" />
            </Link>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
