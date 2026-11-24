import { Icon } from '../../components/Icon.tsx'
import { iconSize, initials, type Variant } from './variant.ts'

/**
 * What the account button draws before (or instead of) the name. On the Career Map, where only a round button fits,
 * a signed-in learner sees their initials, as on the Profile page; anywhere else, or with no name to take letters
 * from, a person. Decorative: the button carries the name.
 */
export function AccountGlyph({ fullName, variant }: { fullName?: string; variant: Variant }) {
  const letters = variant === 'map' && fullName ? initials(fullName) : ''
  if (!letters) return <Icon name="person" size={iconSize(variant)} />
  return (
    <span
      aria-hidden="true"
      className="font-display text-15 leading-none font-bold tracking-wide text-blue"
    >
      {letters}
    </span>
  )
}
