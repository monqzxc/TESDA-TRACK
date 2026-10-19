// What the finder's steps share: cards and their openings, after classic/styles.css.
import { cx } from '../../lib/style.ts'

/** A card's border and surface. Long words in its text break rather than overflow. */
export const cardFrame =
  'min-w-0 border border-border bg-surface [&_h3]:wrap-anywhere [&_h4]:wrap-anywhere [&_p]:wrap-anywhere'

/** A card: its frame, padding and corners. A card with its own padding and corners uses cardFrame instead. */
export const card = cx(
  cardFrame,
  'rounded-16 px-[1.4rem] py-[1.15rem] shadow-card max-xs:rounded-14 max-xs:px-[1.05rem] max-xs:py-4',
)!

/** A step's cards, one under the other. Each step slides in from the side the learner moved towards. */
export const stepBody =
  'mt-[1.1rem] flex flex-col gap-4 motion-safe:data-[direction=back]:animate-enter-back motion-safe:data-[direction=forward]:animate-enter-forward'

export const kicker = 'm-0 text-11 leading-[1.5] font-bold tracking-[0.1em] text-ink uppercase'

export const muted = 'm-0 text-14 leading-[1.6] text-muted'

export const status = 'm-0 text-16 text-muted'

const noticeTones = {
  info: 'bg-soft text-navy',
  warning: 'bg-warn-bg text-warn-ink',
  success: 'bg-good-bg text-good-ink',
}

/** A message about what just happened: a request that failed, or one that went through. */
export function notice(tone: keyof typeof noticeTones = 'info'): string {
  return cx('m-0 rounded-12 px-4 py-3 text-15 font-semibold', noticeTones[tone])!
}

/** Back on the left, the next step on the right, under a rule. */
export const stepNav =
  'mt-3 flex flex-wrap justify-between gap-3 border-t border-border pt-4 [&>:only-child]:ml-auto'

/** A part of a step whose request failed: its message, then Try again. */
export const failed = 'flex flex-col items-start gap-3'
