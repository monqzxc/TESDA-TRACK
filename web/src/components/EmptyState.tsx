import { useId, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon.tsx'
import styles from './EmptyState.module.css'

interface EmptyStateProps {
  icon?: IconName
  heading: string
  body: string
  /** 2 for a state that stands for a section of the page, 3 inside one. */
  headingLevel?: 2 | 3
  /** A button or link to move on, under the text. */
  children?: ReactNode
}

/** Nothing to show yet, and what to do about it (frontend/presentation.py empty_state). */
export function EmptyState({
  icon = 'route',
  heading,
  body,
  headingLevel = 2,
  children,
}: EmptyStateProps) {
  const headingId = useId()
  const Heading = headingLevel === 2 ? 'h2' : 'h3'
  return (
    <section className={styles.state} aria-labelledby={headingId}>
      <span className={styles.icon}>
        <Icon name={icon} size={23} />
      </span>
      <Heading id={headingId} className={styles.heading}>
        {heading}
      </Heading>
      <p className={styles.body}>{body}</p>
      {children && <div className={styles.actions}>{children}</div>}
    </section>
  )
}
