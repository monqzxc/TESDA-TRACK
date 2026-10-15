import type { ReactNode } from 'react'
import { Icon, type IconName } from '../../components/Icon.tsx'
import styles from './finder.module.css'

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
    <div className={styles.cardHeading}>
      <span className={styles.cardIcon}>
        <Icon name={icon} size={28} />
      </span>
      <div>
        {kicker && <p className={styles.kicker}>{kicker}</p>}
        <h3 id={id}>{children}</h3>
        {description && <p className={styles.cardLead}>{description}</p>}
      </div>
    </div>
  )
}
