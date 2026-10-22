import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/Icon.tsx'
import { getCopy, useCopy } from '../../i18n/copy.ts'
import { CONSOLE_MATCHES } from './data.ts'
import { useCountUp } from './hooks/useCountUp.ts'
import { usePaused } from './hooks/usePaused.ts'
import { useReducedMotion } from './hooks/useReducedMotion.ts'
import { useReveal } from './hooks/useReveal.ts'
import { cssVars, cx } from '../../lib/style.ts'
import { revealClasses } from './Reveal.tsx'

// Examples keep their original goal language; only the surrounding interface is translated.
const EXAMPLE_GOALS = getCopy('en').home.console.examples.map(({ goal }) => goal)
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
const STILL: Scene = { shown: 0, typed: EXAMPLE_GOALS[0], phase: 'shown' }
/** A keystroke's pause: a little uneven, as a person types. */
const keystroke = () => 38 + Math.random() * 40

/** How long a scene stays, and the one after it: landing.js's cycle, a step at a time. */
function nextScene(scene: Scene): { stay: number; next: Scene } {
  const following = (scene.shown + 1) % EXAMPLE_GOALS.length
  const goal = EXAMPLE_GOALS[following]
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
 * (usePaused). With reduced motion it shows the first goal and its match, still. It's a piece of Find my path
 * itself (data-ui), a light card in both themes (after classic/landing.css), so its colors are its own. It sits on
 * the navy as a flat surface: no shadow, no gradient.
 */
export function GoalConsole() {
  const en = useCopy()
  const copy = en.home.console
  const EXAMPLES = copy.examples.map((example, i) => ({ ...example, ...CONSOLE_MATCHES[i] }))

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
      className={cx(revealClasses('zoom'), 'relative rounded-20 bg-white p-5 text-[#102a56]')}
      role="group"
      aria-label={copy.label}
      data-ui=""
    >
      <div className="flex items-center justify-between gap-4 text-13 text-[#52647e]">
        <b className="font-text text-14 leading-none font-bold text-[#102a56]">{copy.goal}</b>
        <span className="rounded-full bg-[#eef3fb] px-[0.65rem] py-[0.3rem] font-semibold">
          {copy.example}
        </span>
      </div>
      <div
        className={cx(
          'mt-[0.8rem] flex min-h-[58px] items-center gap-[0.65rem] rounded-14 px-4 py-[0.9rem] text-[1.05rem] font-semibold [&_svg]:size-5 [&_svg]:flex-none [&_svg]:stroke-2 [&_svg]:text-[#175cd3]',
          typing
            ? 'bg-white shadow-[inset_0_0_0_2px_#175cd3]'
            : 'bg-[#f4f7fd] shadow-[inset_0_0_0_1.5px_#d4def0]',
        )}
      >
        <Icon name="target" />
        <span className="min-w-0 wrap-anywhere">
          {view.typed}
          {/* Still, with the typing, while the console holds still (data-paused). */}
          <span
            className="ml-0.5 inline-block h-[1.15em] w-0.5 animate-blink bg-[#175cd3] align-[-0.2em] in-data-paused:[animation-play-state:paused] motion-reduce:animate-none"
            aria-hidden="true"
          />
        </span>
      </div>
      <div className="mt-2 min-h-[1.3em] text-13 text-[#52647e]">
        {hidden ? '' : example.language}
      </div>
      <div
        className={cx(
          'mt-[0.9rem] grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-[0.9rem] rounded-16 bg-[#eef3fb] p-4 transition-[opacity,translate] duration-450 ease-home',
          hidden && 'translate-y-2.5 opacity-0',
        )}
      >
        <div
          className="grid size-13 place-items-center rounded-14 bg-[var(--a,#33507a)] text-white [&_svg]:size-7 [&_svg]:stroke-[1.8]"
          style={cssVars({ '--a': example.color })}
        >
          <Icon name={example.icon} />
        </div>
        <div>
          {/* Darker than the app's teal: 4.5:1 and more on the match's panel. */}
          <div className="text-13 font-bold text-[#0b6b62]">{copy.topMatch}</div>
          <div className="mt-[0.15rem] font-display text-[1.05rem] leading-[1.25] font-bold text-[#102a56]">
            {example.name}
          </div>
          <div className="mt-[0.2rem] text-13 text-[#52647e]">{example.detail}</div>
        </div>
        {/* The score: a ring drawn to its value, which counts up as the match appears. */}
        <div className="relative grid size-16 place-items-center">
          <svg
            viewBox="0 0 64 64"
            aria-hidden="true"
            focusable="false"
            className="absolute inset-0 size-full -rotate-90 fill-none stroke-7"
          >
            <circle className="stroke-[#d7e3f7]" cx="32" cy="32" r="28" />
            <circle
              className="stroke-[#175cd3] [stroke-dasharray:calc(var(--v,0)*1px)_100px]"
              cx="32"
              cy="32"
              r="28"
              pathLength={100}
              style={cssVars({ '--v': score })}
            />
          </svg>
          <span className="relative font-display text-[0.95rem] leading-none font-extrabold tabular-nums">
            {score}%
          </span>
          <small className="absolute top-full mt-1 text-[0.6875rem] whitespace-nowrap text-[#52647e]">
            {copy.goalMatch}
          </small>
        </div>
      </div>
      <div className="mt-[0.9rem] flex min-h-[30px] flex-wrap gap-[0.4rem]">
        {!hidden &&
          example.jobs.map((job) => (
            <span
              key={job}
              className="rounded-full bg-[#eef3fb] px-[0.7rem] py-[0.35rem] text-13 font-semibold text-[#24466f]"
            >
              {job}
            </span>
          ))}
      </div>
      {/* Find my path's four stops, the first two lit once the match shows. */}
      <div
        className="mt-[1.1rem] flex gap-[0.4rem] text-13 font-semibold text-[#52647e]"
        aria-hidden="true"
      >
        {copy.steps.map((step, i) => {
          const on = i === 0 || (i === 1 && !hidden)
          return (
            <span
              key={step}
              className={cx('flex flex-1 items-center gap-[0.4rem]', on && 'text-[#102a56]')}
            >
              <i
                className={cx(
                  'size-2 rounded-full transition-[background] duration-300 ease-[ease]',
                  on ? 'bg-[#e8a800]' : 'bg-[#d4def0]',
                )}
              />
              {step}
            </span>
          )
        })}
      </div>
    </div>
  )
}
