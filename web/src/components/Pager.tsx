import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { en } from '../copy/en.ts'
import { cx } from '../lib/style.ts'
import buttons from '../styles/buttons.module.css'
import { Icon } from './Icon.tsx'
import styles from './Pager.module.css'

interface PagerProps {
  page: number
  pages: number
  /** The address of a page: the current one with its page number changed. */
  to: (page: number) => string
  /** Called after the learner moves to another page, e.g. to bring the results back into view. */
  onNavigate?: () => void
}

/**
 * Previous and Next under a list shown a page at a time. Each page has its own address, so Back returns to the
 * page before. At either end, its button shows greyed out.
 */
export function Pager({ page, pages, to, onNavigate }: PagerProps) {
  const copy = en.pager
  if (pages <= 1) return null
  return (
    <nav aria-label={copy.label} className={styles.pager}>
      <PageLink to={to(page - 1)} disabled={page <= 1} onNavigate={onNavigate}>
        <Icon name="arrowLeft" />
        {copy.previous}
      </PageLink>
      <span className={styles.count}>{copy.page(page, pages)}</span>
      <PageLink to={to(page + 1)} disabled={page >= pages} onNavigate={onNavigate}>
        {copy.next}
        <Icon name="arrowRight" />
      </PageLink>
    </nav>
  )
}

function PageLink({
  to,
  disabled,
  onNavigate,
  children,
}: {
  to: string
  disabled: boolean
  onNavigate?: () => void
  children: ReactNode
}) {
  if (disabled) {
    // Not a link at all: no Tab stop, and read as plain text beside "Page 1 of 3".
    return <span className={cx(buttons.button, styles.disabled)}>{children}</span>
  }
  return (
    <Link to={to} preventScrollReset className={buttons.button} onClick={onNavigate}>
      {children}
    </Link>
  )
}
