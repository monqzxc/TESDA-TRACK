import { useState, type ReactNode } from 'react'
import { en } from '../../copy/en.ts'
import { HOTEL_MATCHES } from './data.ts'
import { useRoute } from './hooks/useRoute.ts'
import { ReadinessDemo } from './ReadinessDemo.tsx'
import {
  readinessLevel,
  readinessScore,
  STARTING_ANSWERS,
  type ReadinessLevel,
} from './readiness.ts'
import { Reveal } from './Reveal.tsx'
import { cssVars, cx } from '../../lib/style.ts'
import shared from './shared.module.css'
import styles from './Track.module.css'

const copy = en.home.how

/** Text with { quote } parts shown as quotations. */
function Quoted({ parts }: { parts: readonly (string | { quote: string })[] }) {
  return parts.map((part, i) => (typeof part === 'string' ? part : <q key={i}>{part.quote}</q>))
}

/** Stop 1: goals as learners write them. */
function GoalCloud() {
  return (
    <div className={shared.card} data-ui="">
      <div className={shared.cardLabel}>
        <span>{copy.goal.card}</span>
      </div>
      <ul className={styles.cloud}>
        {copy.goal.goals.map((goal) => (
          <li key={goal.text} className={cx('filipino' in goal && styles.filipino)}>
            {goal.text}
            {'filipino' in goal && (
              <>
                {' '}
                <small>{copy.goal.filipino}</small>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Stop 2: an example goal's matches, best first. */
function MatchList() {
  return (
    <div className={shared.card} data-ui="">
      <div className={shared.cardLabel}>
        <span>{copy.match.card}</span>
        <span>{copy.match.example}</span>
      </div>
      <ul className={styles.matches}>
        {HOTEL_MATCHES.map((match, i) => (
          <li key={match.name} className={cx(styles.match, i === 0 && styles.top)}>
            <strong>{match.name}</strong> <span className={styles.score}>{match.score}%</span>{' '}
            <small>{match.detail}</small>
            <span className={styles.bar} aria-hidden="true">
              <i style={cssVars({ '--w': match.score })} />
            </span>
          </li>
        ))}
      </ul>
      <p className={styles.note}>{copy.match.note}</p>
    </div>
  )
}

const LEVELS: readonly ReadinessLevel[] = ['high', 'moderate', 'low']

/** Stop 4: the three routes, with the one the readiness check picks marked as current. */
function RouteChoice({ level }: { level: ReadinessLevel }) {
  return (
    <div className={shared.card} data-ui="">
      <div className={shared.cardLabel}>
        <span>{copy.pathway.card}</span>
      </div>
      <ul className={styles.routes}>
        {LEVELS.map((option) => {
          const route = copy.pathway.routes[option]
          const picked = option === level
          return (
            <li
              key={option}
              className={cx(styles.route, picked && styles.picked)}
              aria-current={picked || undefined}
            >
              <span className={styles.dot} />
              <strong>{route.title}</strong> <em>{route.band}</em> <small>{route.text}</small>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * "How it works": Find my path's four stops along one winding road, which draws itself as the page scrolls
 * (hooks/useRoute.ts). The road and its lit waypoints show the order, so the stops carry no numbers. Stops
 * alternate sides on wide screens and stack beside the road on narrow ones.
 */
export function Track() {
  const { trackRef, roadRef, geometry, lit } = useRoute()
  const [answers, setAnswers] = useState(STARTING_ANSWERS)
  const level = readinessLevel(readinessScore(answers))

  const stops: { copy: { heading: string }; body: ReactNode; visual: ReactNode }[] = [
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
    <section id="how" aria-labelledby="how-title" className={shared.section}>
      <div className={shared.wrap}>
        <Reveal className={shared.sectionHead}>
          <h2 id="how-title">{copy.heading}</h2>
          <p>{copy.lead}</p>
        </Reveal>

        <div ref={trackRef} className={styles.track}>
          <svg
            className={styles.road}
            viewBox={geometry ? `0 0 ${geometry.width} ${geometry.height}` : undefined}
            aria-hidden="true"
            focusable="false"
          >
            <path className={styles.roadBed} d={geometry?.d} />
            <path ref={roadRef} className={styles.roadDrawn} d={geometry?.d} />
            <path className={styles.roadDash} d={geometry?.d} />
          </svg>

          {stops.map((stop, i) => {
            // Even stops have their text on the right.
            const flip = i % 2 === 1
            return (
              <article key={stop.copy.heading} className={cx(styles.stop, flip && styles.flip)}>
                <span
                  className={styles.waypoint}
                  data-waypoint=""
                  data-lit={i < lit || undefined}
                  aria-hidden="true"
                />
                <Reveal from={flip ? 'right' : 'left'} className={styles.copy}>
                  <h3>{stop.copy.heading}</h3>
                  <p>{stop.body}</p>
                </Reveal>
                <Reveal from={flip ? 'left' : 'right'} order={1} className={styles.visual}>
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
