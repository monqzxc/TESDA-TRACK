import type { ReactNode } from 'react'
import styles from './PageHeading.module.css'

/**
 * A page's h1. It can take focus from script (tabIndex -1), and does after each navigation (see
 * useFocusOnNavigation), but isn't a Tab stop.
 */
export function PageHeading({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1 tabIndex={-1} className={className ? `${styles.heading} ${className}` : styles.heading}>
      {children}
    </h1>
  )
}
