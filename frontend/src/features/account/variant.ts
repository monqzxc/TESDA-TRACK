/** Where the account control sits: the sidebar (a full-width row) or Home's top bar. */
export type Variant = 'sidebar' | 'header'

/** The first word of a name, as the landing page's top bar shows it. */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName
}

/** The name the account button shows: the full name in the sidebar, the first name in the top bar. */
export function shownName(fullName: string, variant: Variant): string {
  return variant === 'header' ? firstName(fullName) : fullName
}
