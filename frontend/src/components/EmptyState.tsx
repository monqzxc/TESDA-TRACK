import { useId, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon.tsx'

interface EmptyStateProps {
  icon?: IconName
  heading: string
  body: string
  /** 2 for a state that stands for a section of the page, 3 inside one. */
  headingLevel?: 2 | 3
  /** A button or link to move on, under the text. */
  children?: ReactNode
}

/** Nothing to show yet, and what to do about it (classic/presentation.py empty_state). */
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
    <section
      className="mt-4 rounded-16 border border-dashed border-dash bg-empty px-6 py-8 text-center max-xs:px-4 max-xs:py-[1.6rem]"
      aria-labelledby={headingId}
    >
      <span className="mx-auto mb-[0.9rem] grid size-11.5 place-items-center rounded-13 bg-tint text-blue">
        <Icon name={icon} size={23} />
      </span>
      <Heading id={headingId} className="mb-[0.4rem] text-18 leading-[1.4] text-navy">
        {heading}
      </Heading>
      <p className="mx-auto mb-0 max-w-[520px] text-14 leading-[1.65] text-muted">{body}</p>
      {children && (
        <div className="mt-[1.1rem] flex flex-wrap justify-center gap-[0.6rem]">{children}</div>
      )}
    </section>
  )
}
