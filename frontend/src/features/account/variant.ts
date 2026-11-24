/**
 * Where the account control sits: the sidebar (a full-width row), a top bar, or the Career Map's corner (a round
 * button showing only the icon; the name is still read out).
 */
export type Variant = 'sidebar' | 'header' | 'map'

/** The first word of a name, as the landing page's top bar shows it. */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName
}

/** Up to two initials from a name ("Maria Santos" → "MS"), or '' when it has no letters to take. */
export function initials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => Array.from(part)[0])
    .join('')
    .toLocaleUpperCase('en-PH')
}

/** The name the account button shows: the full name in the sidebar, the first name in the top bar. */
export function shownName(fullName: string, variant: Variant): string {
  return variant === 'header' ? firstName(fullName) : fullName
}

/** The account button's icon size. */
export function iconSize(variant: Variant): string {
  return variant === 'sidebar' ? '1.125rem' : variant === 'map' ? '1.25rem' : '1.2rem'
}
