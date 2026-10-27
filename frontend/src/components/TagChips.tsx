import type { QualificationTag } from '../lib/qualifications.ts'
import { cx } from '../lib/style.ts'
import { Icon } from './Icon.tsx'

/** A qualification's facts as small chips (classic/presentation.py tag_chips). A ticked one is green. */
export function TagChips({ tags }: { tags: readonly QualificationTag[] }) {
  if (!tags.length) return null
  return (
    <ul className="m-0 flex list-none flex-wrap gap-[0.45rem] p-0">
      {tags.map((tag) => (
        <li
          key={tag.text}
          className={cx(
            'inline-flex items-center gap-[0.35rem] rounded-8 px-3 py-[0.35rem] text-13 leading-[1.25] font-medium',
            tag.icon === 'check' ? 'bg-good-bg text-good-ink' : 'bg-chip text-ink',
          )}
        >
          {tag.icon && <Icon name={tag.icon} size={15} />}
          {tag.text}
        </li>
      ))}
    </ul>
  )
}
