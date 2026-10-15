import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/Icon.tsx'
import { en } from '../../copy/en.ts'
import { CONSOLE_MATCHES } from './data.ts'
import { useCountUp } from './hooks/useCountUp.ts'
import { usePaused } from './hooks/usePaused.ts'
import { useReducedMotion } from './hooks/useReducedMotion.ts'
import { useReveal } from './hooks/useReveal.ts'
import { cssVars, cx } from '../../lib/style.ts'
import styles from './GoalConsole.module.css'

const copy = en.home.console

const EXAMPLES = copy.examples.map((example, i) => ({ ...example, ...CONSOLE_MATCHES[i] }))

type Phase = 'shown' | 'erasing' | 'typing' | 'matching'

interface Scene {
  /** The example whose match is on show (or was, while the next goal types). */
  shown: number
  /** The goal box's text, as typed so far. */
  typed: string
  /**
   * shown: the goal and its match are on show. erasing, then typing: the box is lit and the match hidden while
   * the goal makes way for the next one. matching: the next goal is in, and its match is about to show.
   */
  phase: Phase
}

/** The first example, on show. It's all there is with reduced motion. */
const STILL: Scene = { shown: 0, typed: EXAMPLES[0].goal, phase: 'shown' }

/** A keystroke's pause: a little uneven, as a person types. */
const keystroke = () => 38 + Math.random() * 40

/** How long a scene stays, and the one after it: landing.js's cycle, a step at a time. */
function nextScene(scene: Scene): { stay: number; next: Scene } {
  const following = (scene.shown + 1) % EXAMPLES.length
  const goal = EXAMPLES[following].goal
  switch (scene.phase) {
    case 'shown':
      // The first match stays a little less long, as the page opens.
      return { stay: scene === STILL ? 3800 : 4200, next: { ...scene, phase: 'erasing' } }
    case 'erasing':
      return scene.typed
        ? { stay: 18, next: { ...scene, typed: scene.typed.slice(0, -2) } }
        : { stay: 18, next: { ...scene, phase: 'typing' } }
    case 'typing':
      return scene.typed.length < goal.length
        ? { stay: keystroke(), next: { ...scene, typed: goal.slice(0, scene.typed.length + 1) } }
        : { stay: keystroke(), next: { ...scene, phase: 'matching' } }
    case 'matching':
      return { stay: 450, next: { ...scene, shown: following, phase: 'shown' } }
  }
}

/**
 * The hero's example, not a form: a goal types itself into the box, then its top match appears with its score.
 * Once it scrolls into view it moves on to the next goal every few seconds, as landing.js does. It holds still
 * wherever it is while it's out of the window or the tab is hidden, and while the pointer or focus is on it
 * (usePaused). With reduced motion it shows the first goal and its match, still.
 */
export function GoalConsole() {
  const { ref: revealRef, isIn } = useReveal<HTMLDivElement>()
  const box = useRef<HTMLDivElement>(null)
  const ref = useCallback(
    (element: HTMLDivElement | null) => {
      box.current = element
      const unwatch = revealRef(element)
      return () => {
        box.current = null
        unwatch?.()
      }
    },
    [revealRef],
  )
  const paused = usePaused(box)
  const reduced = useReducedMotion()
  const [scene, setScene] = useState<Scene>(STILL)

  // One scene at a time: pausing stops the clock on the scene on show, and the cycle picks up there after.
  useEffect(() => {
    if (reduced || !isIn || paused) return
    const { stay, next } = nextScene(scene)
    const timer = window.setTimeout(() => setScene(next), stay)
    return () => clearTimeout(timer)
  }, [scene, reduced, isIn, paused])

  const view = reduced ? STILL : scene
  const example = EXAMPLES[view.shown]
  const typing = view.phase === 'erasing' || view.phase === 'typing'
  const hidden = view.phase !== 'shown'
  // The ring counts up to each match's score as it appears.
  const score = useCountUp(example.score, { start: !hidden, duration: 900, power: 3 })

  return (
    <div
      ref={ref}
      data-reveal="zoom"
      data-in={isIn || undefined}
      data-paused={paused || undefined}
      style={cssVars({ '--i': 3 })}
      className={styles.console}
      role="group"
      aria-label={copy.label}
    >
      <div className={styles.head}>
        <b>{copy.goal}</b>
        <span className={styles.tag}>{copy.example}</span>
      </div>
      <div className={cx(styles.goalBox, typing && styles.live)}>
        <Icon name="target" />
        <span className={styles.goalText}>
          {view.typed}
          <span className={styles.caret} aria-hidden="true" />
        </span>
      </div>
      <div className={styles.language}>{hidden ? '' : example.language}</div>
      <div className={cx(styles.match, hidden && styles.hidden)}>
        <div
          className={styles.tile}
          style={cssVars({ '--a': example.colors[0], '--b': example.colors[1] })}
        >
          <Icon name={example.icon} />
        </div>
        <div>
          <div className={styles.kicker}>{copy.topMatch}</div>
          <div className={styles.name}>{example.name}</div>
          <div className={styles.detail}>{example.detail}</div>
        </div>
        <div className={styles.ring} style={cssVars({ '--v': score })}>
          <span>{score}%</span>
          <small>{copy.goalMatch}</small>
        </div>
      </div>
      <div className={styles.jobs}>
        {!hidden && example.jobs.map((job) => <span key={job}>{job}</span>)}
      </div>
      <div className={styles.steps} aria-hidden="true">
        {copy.steps.map((step, i) => (
          <span key={step} className={cx((i === 0 || (i === 1 && !hidden)) && styles.on)}>
            <i />
            {step}
          </span>
        ))}
      </div>
    </div>
  )
}
