import { useState, type ReactNode } from 'react'
import { en } from '../../copy/en.ts'
import { cssVars, cx } from '../../lib/style.ts'
import { HOTEL_MATCHES } from './data.ts'
import { useRoute } from './hooks/useRoute.ts'
import { ReadinessDemo } from './ReadinessDemo.tsx'
import {
  readinessLevel,
  readinessScore,
  STARTING_ANSWERS,
  type ReadinessLevel,
} from './readiness.ts'
import { Reveal, useRevealed } from './Reveal.tsx'
import { ui } from './styles.ts'

const copy = en.home.how

/** Text with { quote } parts shown as quotations. */
function Quoted({ parts }: { parts: readonly (string | { quote: string })[] }) {
  return parts.map((part, i) =>
    typeof part === 'string' ? (
      part
    ) : (
      <q key={i} className="font-semibold text-home-ink [quotes:'“'_'”']">
        {part.quote}
      </q>
    ),
  )
}

/** Stop 1: goals as learners write them. */
function GoalCloud() {
  return (
    <div className={ui.card}>
      <div className={ui.cardLabel}>
        <span>{copy.goal.card}</span>
      </div>
      <ul className="mt-4 flex list-none flex-wrap gap-[0.55rem] p-0">
        {copy.goal.goals.map((goal, i) => (
          <li
            key={goal.text}
            className={cx(
              'rounded-full px-[0.95rem] py-[0.55rem] text-[0.95rem] font-semibold text-home-ink',
              'filipino' in goal
                ? 'bg-home-signal-soft'
                : i % 3 === 0
                  ? 'bg-home-blue-soft'
                  : 'bg-home-panel',
            )}
          >
            {goal.text}
            {'filipino' in goal && (
              <>
                {' '}
                <small className="ml-1 text-[0.7rem] font-bold text-home-muted">
                  {copy.goal.filipino}
                </small>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Stop 2: an example goal's matches, best first. The bars fill once their card is in view. */
function MatchList() {
  const shown = useRevealed()
  return (
    <div className={ui.card}>
      <div className={ui.cardLabel}>
        <span>{copy.match.card}</span>
        <span>{copy.match.example}</span>
      </div>
      <ul className="mt-4 grid list-none gap-[0.7rem] p-0">
        {HOTEL_MATCHES.map((match, i) => (
          <li
            key={match.name}
            className={cx(
              'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-[0.3rem] rounded-14 px-[0.95rem] py-[0.8rem]',
              i === 0 ? 'bg-home-blue-soft' : 'bg-home-panel',
            )}
          >
            <strong className="font-display text-16 leading-[1.25] text-home-ink">
              {match.name}
            </strong>{' '}
            <span className="col-start-2 row-span-2 row-start-1 font-display text-[1.1rem] leading-none font-extrabold text-home-ink tabular-nums">
              {match.score}%
            </span>{' '}
            <small className="col-start-1 text-[0.8rem] text-home-muted">{match.detail}</small>
            <span
              className="col-span-full h-1.5 overflow-hidden rounded-full bg-home-border"
              aria-hidden="true"
            >
              <i
                className={cx(
                  'block h-full w-[calc(var(--w)*1%)] origin-left rounded-[inherit] bg-home-blue transition-[scale] delay-200 duration-1100 ease-home',
                  !shown && 'in-data-motion:scale-x-0',
                )}
                style={cssVars({ '--w': match.score })}
              />
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-[0.9rem] text-[0.85rem] text-home-muted">{copy.match.note}</p>
    </div>
  )
}

const LEVELS: readonly ReadinessLevel[] = ['high', 'moderate', 'low']

/** Stop 4: the three routes, with the one the readiness check picks marked as current. */
function RouteChoice({ level }: { level: ReadinessLevel }) {
  return (
    <div className={ui.card}>
      <div className={ui.cardLabel}>
        <span>{copy.pathway.card}</span>
      </div>
      <ul className="mt-4 grid list-none gap-[0.7rem] p-0">
        {LEVELS.map((option) => {
          const route = copy.pathway.routes[option]
          const picked = option === level
          return (
            <li
              key={option}
              className={cx(
                'relative grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-[0.9rem] gap-y-[0.2rem] rounded-16 px-4 py-[0.95rem] [transition:background_0.35s,box-shadow_0.35s,translate_0.35s_var(--ease-home)]',
                picked
                  ? 'translate-x-1.5 bg-home-surface shadow-[0_0_0_2px_var(--home-blue),var(--home-shadow)]'
                  : 'bg-home-panel',
              )}
              aria-current={picked || undefined}
            >
              <span
                className={cx(
                  'row-span-2 row-start-1 mt-[0.3rem] size-3.5 rounded-full [transition:background_0.3s,box-shadow_0.3s]',
                  picked
                    ? 'bg-home-signal shadow-[0_0_0_4px_color-mix(in_srgb,var(--home-signal)_30%,transparent)]'
                    : 'shadow-[inset_0_0_0_3px_var(--home-border)]',
                )}
              />
              <strong className="pr-[5.5rem] font-display text-[1.02rem] leading-[1.25] text-home-ink">
                {route.title}
              </strong>{' '}
              <em
                className={cx(
                  'absolute top-[0.9rem] right-4 text-[0.7rem] font-bold tracking-[0.08em] uppercase not-italic',
                  picked ? 'text-home-blue' : 'text-home-muted',
                )}
              >
                {route.band}
              </em>{' '}
              <small className="text-[0.82rem] text-home-muted">{route.text}</small>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// The road's three strokes: the bed, the blue part hooks/useRoute.ts draws as the page scrolls, and its dashes.
const roadPath = 'fill-none [stroke-linecap:round] [stroke-linejoin:round]'

/**
 * "How it works" (after classic/landing.css): Find my path's four stops along one winding road, which draws itself
 * as the page scrolls (hooks/useRoute.ts). Each stop has its text, its waypoint on the road and its card; every
 * other stop swaps sides on wide screens, and on narrow ones the road runs down the left and each card sits under
 * its text.
 */
export function Track() {
  const { trackRef, roadRef, geometry, lit } = useRoute()
  const [answers, setAnswers] = useState(STARTING_ANSWERS)
  const level = readinessLevel(readinessScore(answers))

  const stops: { copy: { step: string; heading: string }; body: ReactNode; visual: ReactNode }[] = [
    { copy: copy.goal, body: <Quoted parts={copy.goal.body} />, visual: <GoalCloud /> },
    { copy: copy.match, body: copy.match.body, visual: <MatchList /> },
    {
      copy: copy.readiness,
      body: copy.readiness.body,
      visual: (
        <ReadinessDemo
          answers={answers}
          onChange={(unit, answer) =>
            setAnswers((current) => current.map((old, i) => (i === unit ? answer : old)))
          }
        />
      ),
    },
    { copy: copy.pathway, body: copy.pathway.body, visual: <RouteChoice level={level} /> },
  ]

  return (
    <section id="how" aria-labelledby="how-title" className={ui.section}>
      <div className={ui.wrap}>
        <Reveal className={ui.sectionHead}>
          <div className={ui.eyebrow}>{copy.eyebrow}</div>
          <h2 id="how-title" className={ui.sectionTitle}>
            {copy.heading}
          </h2>
          <p className={ui.sectionLead}>{copy.lead}</p>
        </Reveal>

        <div
          ref={trackRef}
          className="relative mt-[clamp(3rem,6vw,5rem)] grid gap-[clamp(4rem,9vw,7.5rem)]"
        >
          {/* The road covers the track, under the stops. */}
          <svg
            className="pointer-events-none absolute inset-0 z-0 size-full overflow-visible"
            viewBox={geometry ? `0 0 ${geometry.width} ${geometry.height}` : undefined}
            aria-hidden="true"
            focusable="false"
          >
            <path
              className={cx(roadPath, 'stroke-home-border stroke-16 max-lg:stroke-12')}
              d={geometry?.d}
            />
            <path
              ref={roadRef}
              className={cx(roadPath, 'stroke-home-route stroke-16 max-lg:stroke-12')}
              d={geometry?.d}
            />
            <path
              className={cx(
                roadPath,
                'stroke-home-page stroke-2 opacity-90 [stroke-dasharray:10_14] max-lg:stroke-[1.5]',
              )}
              d={geometry?.d}
            />
          </svg>

          {stops.map((stop, i) => {
            // Even stops have their text on the right.
            const flip = i % 2 === 1
            return (
              <article
                key={stop.copy.step}
                className="relative z-1 grid grid-cols-[minmax(0,1fr)_128px_minmax(0,1fr)] items-center max-lg:grid-cols-[44px_minmax(0,1fr)] max-lg:gap-y-[1.4rem]"
              >
                <span
                  className={cx(
                    'col-start-2 row-start-1 size-7.5 justify-self-center rounded-full bg-home-surface shadow-[0_0_0_5px_var(--home-page),inset_0_0_0_3px_var(--home-border)] transition-[background,box-shadow] duration-400 ease-[ease]',
                    'data-lit:bg-home-signal data-lit:shadow-[0_0_0_5px_var(--home-page),0_0_0_11px_color-mix(in_srgb,var(--home-signal)_28%,transparent)]',
                    'max-lg:col-start-1 max-lg:mt-[0.1rem] max-lg:-ml-0.5 max-lg:size-6 max-lg:self-start max-lg:justify-self-start',
                  )}
                  data-waypoint=""
                  data-lit={i < lit || undefined}
                  aria-hidden="true"
                />
                <Reveal
                  from={flip ? 'right' : 'left'}
                  className={cx(
                    'max-w-[30rem] text-left max-lg:col-start-2 max-lg:row-start-1 max-lg:justify-self-start',
                    flip ? 'col-start-3 justify-self-start' : 'col-start-1 justify-self-end',
                  )}
                >
                  <div className="inline-flex items-center gap-[0.6rem] font-text text-home-xs leading-none font-bold tracking-[0.12em] text-home-muted uppercase">
                    <b className="grid size-7.5 place-items-center rounded-9 bg-home-blue-soft font-display text-[0.95rem] leading-none font-extrabold tracking-normal text-home-blue">
                      {i + 1}
                    </b>{' '}
                    {stop.copy.step}
                  </div>
                  <h3 className="mt-[0.9rem] text-home-xl leading-[1.1] font-[750] tracking-[-0.015em]">
                    {stop.copy.heading}
                  </h3>
                  <p className="mt-[0.8rem] max-w-[30rem]">{stop.body}</p>
                </Reveal>
                <Reveal
                  from={flip ? 'left' : 'right'}
                  order={1}
                  className={cx(
                    'max-lg:col-start-2 max-lg:row-start-2',
                    flip ? 'col-start-1 row-start-1' : 'col-start-3',
                  )}
                >
                  {stop.visual}
                </Reveal>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
