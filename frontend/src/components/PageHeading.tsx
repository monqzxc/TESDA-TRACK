import type { ReactNode } from 'react'
import { cx } from '../lib/style.ts'

/**
 * A page's h1. It can take focus from script (tabIndex -1), and does after each navigation (see
 * useFocusOnNavigation), but isn't a Tab stop, so it shows no ring. A className replaces its color and size, as
 * the banners' small eyebrow headings do.
 */
export function PageHeading({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1
      tabIndex={-1}
      className={cx(
        'scroll-mt-20 focus:outline-none',
        className ?? 'text-[length:clamp(1.75rem,1.4rem_+_1.4vw,2.5rem)] text-navy',
      )}
    >
      {children}
    </h1>
  )
}
