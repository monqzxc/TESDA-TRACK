import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useCopy } from '../i18n/copy.ts'
import { button } from '../styles/buttons.ts'
import { Icon } from './Icon.tsx'

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
  const en = useCopy()

  const copy = en.pager
  if (pages <= 1) return null
  return (
    <nav
      aria-label={copy.label}
      className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-3"
    >
      <PageLink to={to(page - 1)} disabled={page <= 1} onNavigate={onNavigate}>
        <Icon name="arrowLeft" />
        {copy.previous}
      </PageLink>
      <span className="text-14 text-muted">{copy.page(page, pages)}</span>
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
    return <span className={button({ inert: true })}>{children}</span>
  }
  return (
    <Link to={to} preventScrollReset className={button()} onClick={onNavigate}>
      {children}
    </Link>
  )
}
