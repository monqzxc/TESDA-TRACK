import type { ReactNode } from 'react'
import { PageHeading } from './PageHeading.tsx'

interface PageTitleProps {
  /** The page's name, as the sidebar names it: the h1. */
  heading: string
  /** One sentence under it about what the page holds. */
  lead?: string
  /** The page's own controls, beside the title on wide screens and under it on narrow ones. */
  children?: ReactNode
}

/**
 * A tool page's title row: the page's name as the h1, a line about what it holds, and its controls on the right.
 * The pages people work in open with this rather than with a banner (PageHero), so the data starts higher up.
 */
export function PageTitle({ heading, lead, children }: PageTitleProps) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-4 max-xs:mb-5">
      <div className="min-w-0 flex-[1_1_26rem]">
        <PageHeading className="m-0 font-display text-[1.75rem] leading-[1.2] font-bold tracking-[-0.025em] text-navy max-xs:text-24">
          {heading}
        </PageHeading>
        {lead && (
          <p className="mt-2 mb-0 max-w-[720px] text-15 leading-[1.55] text-muted">{lead}</p>
        )}
      </div>
      {children}
    </div>
  )
}
