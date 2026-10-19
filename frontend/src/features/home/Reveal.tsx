import { createContext, useContext, type HTMLAttributes } from 'react'
import { cssVars, cx } from '../../lib/style.ts'
import { useReveal } from './hooks/useReveal.ts'

export type RevealFrom = 'below' | 'left' | 'right' | 'zoom'

// Where each part waits, off stage, until it scrolls into view.
const OFF_STAGE: Record<RevealFrom, string> = {
  below: 'in-data-motion:not-data-in:translate-y-8',
  left: 'in-data-motion:not-data-in:-translate-x-10',
  right: 'in-data-motion:not-data-in:translate-x-10',
  zoom: 'in-data-motion:not-data-in:translate-y-5 in-data-motion:not-data-in:scale-94',
}

/**
 * The scroll reveal's classes, for an element with data-reveal and data-in (useReveal). Content shows by default:
 * HomePage adds data-motion only when motion is welcome and scrolling can be watched, and then the element waits off
 * stage until it has data-in. --i staggers a group: each step waits a little longer.
 */
export function revealClasses(from: RevealFrom = 'below'): string {
  return cx(
    'in-data-motion:transition-[opacity,translate,scale] in-data-motion:delay-[calc(var(--i,0)*110ms)] in-data-motion:duration-900 in-data-motion:ease-home',
    'in-data-motion:not-data-in:opacity-0',
    OFF_STAGE[from],
  )!
}

const RevealedContext = createContext(true)

/** Whether the nearest Reveal around this has come into view, for parts that move in after it. */
export function useRevealed(): boolean {
  return useContext(RevealedContext)
}

type RevealProps = HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'p' | 'ul' | 'li'
  /** Where it comes in from: below (the default), the left or right, or growing into place. */
  from?: RevealFrom
  /** Its place in a group that comes in together: each step waits a little longer. */
  order?: number
}

/** Content that waits off stage until it scrolls into view, then comes in. With reduced motion it's simply there. */
export function Reveal({
  as: Tag = 'div',
  from = 'below',
  order,
  style,
  className,
  ...rest
}: RevealProps) {
  const { ref, isIn } = useReveal<HTMLElement>()
  return (
    <RevealedContext.Provider value={isIn}>
      <Tag
        ref={ref}
        data-reveal={from}
        data-in={isIn || undefined}
        style={order ? cssVars({ '--i': order }, style) : style}
        className={cx(revealClasses(from), className)}
        {...rest}
      />
    </RevealedContext.Provider>
  )
}
