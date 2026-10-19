import type { QualificationTag } from '../lib/qualifications.ts'
import { cx } from '../lib/style.ts'
import { Icon } from './Icon.tsx'
import styles from './TagChips.module.css'

/** A qualification's facts as small chips (frontend/presentation.py tag_chips). A ticked one is green. */
export function TagChips({ tags }: { tags: readonly QualificationTag[] }) {
  if (!tags.length) return null
  return (
    <ul className={styles.tags}>
      {tags.map((tag) => (
        <li key={tag.text} className={cx(styles.tag, tag.icon === 'check' && styles.green)}>
          {tag.icon && <Icon name={tag.icon} size={15} />}
          {tag.text}
        </li>
      ))}
    </ul>
  )
}
