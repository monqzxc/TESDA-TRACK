import { useId, type ReactNode } from 'react'

interface EmptyStateProps {
  heading: string
  body: string
  /** 2 for a state that stands for a section of the page, 3 inside one. */
  headingLevel?: 2 | 3
  /** A button or link to move on, under the text. */
  children?: ReactNode
}

/**
 * Nothing to show yet, and what to do about it (classic/presentation.py empty_state): the section keeps its frame, a
 * dashed box where the content will be, with a heading, one sentence and the way on.
 */
export function EmptyState({ heading, body, headingLevel = 2, children }: EmptyStateProps) {
  const headingId = useId()
  const Heading = headingLevel === 2 ? 'h2' : 'h3'
  return (
    <section
      className="mt-4 rounded-16 border border-dashed border-dash bg-empty px-6 py-7 text-center max-xs:px-4 max-xs:py-6"
      aria-labelledby={headingId}
    >
      <Heading id={headingId} className="mt-0 mb-[0.4rem] text-18 leading-[1.4] text-navy">
        {heading}
      </Heading>
      <p className="mx-auto mb-0 max-w-[520px] text-15 leading-[1.6] text-ink">{body}</p>
      {children && (
        <div className="mt-[1.1rem] flex flex-wrap justify-center gap-[0.6rem]">{children}</div>
      )}
    </section>
  )
}
