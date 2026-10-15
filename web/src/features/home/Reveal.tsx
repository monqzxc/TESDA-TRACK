import type { HTMLAttributes } from 'react'
import { cssVars } from '../../lib/style.ts'
import { useReveal } from './hooks/useReveal.ts'

type RevealProps = HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'p' | 'ul' | 'li'
  /** Where it comes in from: below (the default), the left or right, or growing into place. */
  from?: 'below' | 'left' | 'right' | 'zoom'
  /** Its place in a group that comes in together: each step waits a little longer. */
  order?: number
}

/**
 * Content that waits off stage until it scrolls into view, then comes in (see HomePage.module.css). With reduced
 * motion it's simply there.
 */
export function Reveal({ as: Tag = 'div', from = 'below', order, style, ...rest }: RevealProps) {
  const { ref, isIn } = useReveal<HTMLElement>()
  return (
    <Tag
      ref={ref}
      data-reveal={from}
      data-in={isIn || undefined}
      style={order ? cssVars({ '--i': order }, style) : style}
      {...rest}
    />
  )
}
