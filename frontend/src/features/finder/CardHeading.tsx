import type { ReactNode } from 'react'
import { cardHeading } from './styles.ts'

interface CardHeadingProps {
  /** The heading's text; a card's own heading is an h3 under the step's h2. */
  children: ReactNode
  description?: ReactNode
  id?: string
}

/** A card's opening: its title and, under it, a sentence about what the card holds (card_heading). */
export function CardHeading({ children, description, id }: CardHeadingProps) {
  return (
    <div className="min-w-0">
      <h3 id={id} className={cardHeading}>
        {children}
      </h3>
      {description && <p className="mt-1 mb-0 text-15 leading-[1.5] text-muted">{description}</p>}
    </div>
  )
}
