import type { ReactNode } from 'react'
import { Icon, type IconName } from '../../components/Icon.tsx'
import { kicker as kickerStyle } from './styles.ts'

interface CardHeadingProps {
  icon: IconName
  /** The heading's text; a card's own heading is an h3 under the step's h2. */
  children: ReactNode
  description?: ReactNode
  kicker?: string
  id?: string
}

/** A card's opening: its icon in a tinted tile beside a kicker, the title and a description (card_heading). */
export function CardHeading({ icon, children, description, kicker, id }: CardHeadingProps) {
  return (
    <div className="flex min-w-0 items-center gap-4">
      <span className="grid size-13 shrink-0 place-items-center rounded-14 bg-tint text-blue max-xs:size-11 max-xs:rounded-12">
        <Icon name={icon} size={28} />
      </span>
      <div>
        {kicker && <p className={kickerStyle}>{kicker}</p>}
        <h3
          id={id}
          className="m-0 text-[1.3rem] leading-[1.25] font-bold tracking-[-0.02em] text-navy max-xs:text-[1.15rem]"
        >
          {children}
        </h3>
        {description && (
          <p className="mt-[0.2rem] mb-0 text-15 leading-[1.5] text-muted">{description}</p>
        )}
      </div>
    </div>
  )
}
